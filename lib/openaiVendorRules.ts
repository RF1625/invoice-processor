import { type MatchType } from "@prisma/client";
import OpenAI from "openai";

export type VendorRuleDraft = {
  priority?: number | null;
  matchType: MatchType;
  matchValue?: string | null;
  glAccountNo?: string | null;
  dimensionOverrides?: Record<string, string> | null;
  active?: boolean | null;
  comment?: string | null;
};

type SuggestionResponse = {
  rules: VendorRuleDraft[];
  notes?: string[];
  warnings?: string[];
  confidence?: number;
};

const DEFAULT_MODEL = "gpt-4o-mini";

export async function suggestVendorRulesFromInstruction(params: {
  instruction: string;
  vendor: { vendorNo: string; name: string };
  glAccounts: Array<{ no: string; name: string; type?: string | null }>;
  dimensions: Array<{ code: string; valueCode: string; valueName: string; active: boolean }>;
}): Promise<SuggestionResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL_VENDOR_RULES || DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });

  const dimensionIndex: Record<string, Array<{ valueCode: string; valueName: string }>> = {};
  for (const dim of params.dimensions) {
    if (!dim.active) continue;
    (dimensionIndex[dim.code] ||= []).push({ valueCode: dim.valueCode, valueName: dim.valueName });
  }

  const glSummary = params.glAccounts.slice(0, 200).map((g) => ({
    no: g.no,
    name: g.name,
    type: g.type ?? null,
  }));

  const dimSummary = Object.entries(dimensionIndex)
    .slice(0, 50)
    .map(([code, values]) => ({
      code,
      values: values.slice(0, 50),
    }));

  const schemaHint = {
    rules: [
      {
        priority: 100,
        matchType:
          "description_contains | description_regex | amount_equals | amount_lt | amount_lte | amount_gt | amount_gte | always",
        matchValue: "string|null",
        glAccountNo: "string|null",
        dimensionOverrides: { DIMCODE: "VALUECODE" },
        active: true,
        comment: "string|null",
      },
    ],
    notes: ["string"],
    warnings: ["string"],
    confidence: 0.0,
  };

  const system = [
    "You convert plain-English accounting instructions into deterministic vendor line rules for an invoice processor.",
    "Rules apply per invoice line item (description + amount).",
    "Use only these match types: description_contains, description_regex, amount_equals, amount_lt, amount_lte, amount_gt, amount_gte, always.",
    "For description_contains, put comma-separated tokens in matchValue (no extra commentary).",
    "For description_regex, matchValue must be a valid JavaScript regex pattern (no slashes).",
    "For amount_* match types, matchValue must be a number as a string (e.g. \"50\" or \"12.34\").",
    "For always, matchValue must be null.",
    "Prefer a few clear rules over many. Smaller priority runs first.",
    "Only use glAccountNo values that exist in the provided G/L list; otherwise leave it null and add a warning.",
    "Only use dimensionOverrides that exist in the provided dimension codes/valueCodes; otherwise omit and add a warning.",
    "Return ONLY valid JSON matching this shape (example schema, not literal):",
    JSON.stringify(schemaHint),
  ].join("\n");

  const user = {
    vendor: params.vendor,
    instruction: params.instruction,
    glAccounts: glSummary,
    dimensions: dimSummary,
  };

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) },
    ],
  });

  const content: string | null | undefined = completion?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");

  try {
    return JSON.parse(content) as SuggestionResponse;
  } catch (err) {
    throw new Error(`OpenAI returned invalid JSON: ${(err as Error).message}`);
  }
}

export function normalizeAndValidateVendorRuleDrafts(params: {
  drafts: unknown;
  validGlAccountNos: Set<string>;
  validDimensionValues: Set<string>; // `${code}:${valueCode}`
  instructionForComment?: string | null;
}): { drafts: VendorRuleDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  const input = params.drafts;
  if (!Array.isArray(input)) {
    throw new Error("draftRules must be an array");
  }

  const allowedMatchTypes: MatchType[] = [
    "description_contains",
    "description_regex",
    "amount_equals",
    "amount_lt",
    "amount_lte",
    "amount_gt",
    "amount_gte",
    "always",
  ];

  const result: VendorRuleDraft[] = input.map((raw, idx) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`draftRules[${idx}] must be an object`);
    }
    const rule = raw as Record<string, unknown>;
    const matchTypeRaw = rule.matchType;
    if (typeof matchTypeRaw !== "string" || !allowedMatchTypes.includes(matchTypeRaw as MatchType)) {
      throw new Error(`draftRules[${idx}].matchType is invalid`);
    }
    const matchType = matchTypeRaw as MatchType;

    const priorityRaw = rule.priority;
    const priority =
      typeof priorityRaw === "number"
        ? Math.trunc(priorityRaw)
        : typeof priorityRaw === "string" && priorityRaw.trim()
          ? Math.trunc(Number(priorityRaw))
          : 100;

    const matchValueRaw = rule.matchValue;
    const matchValue =
      matchValueRaw == null
        ? null
        : typeof matchValueRaw === "string"
          ? matchValueRaw
          : typeof matchValueRaw === "number"
            ? String(matchValueRaw)
            : null;

    const glAccountNoRaw = rule.glAccountNo;
    let glAccountNo =
      glAccountNoRaw == null
        ? null
        : typeof glAccountNoRaw === "string"
          ? glAccountNoRaw.trim()
          : typeof glAccountNoRaw === "number"
            ? String(glAccountNoRaw)
            : null;
    if (glAccountNo && !params.validGlAccountNos.has(glAccountNo)) {
      warnings.push(`Unknown G/L account ${glAccountNo}; leaving blank.`);
      glAccountNo = null;
    }

    const dimensionOverridesRaw = rule.dimensionOverrides;
    const dimensionOverrides: Record<string, string> = {};
    if (dimensionOverridesRaw && typeof dimensionOverridesRaw === "object" && !Array.isArray(dimensionOverridesRaw)) {
      for (const [code, value] of Object.entries(dimensionOverridesRaw as Record<string, unknown>)) {
        if (typeof code !== "string" || !code.trim()) continue;
        if (typeof value !== "string" || !value.trim()) continue;
        const key = `${code}:${value}`;
        if (!params.validDimensionValues.has(key)) {
          warnings.push(`Unknown dimension value ${key}; omitting.`);
          continue;
        }
        dimensionOverrides[code] = value;
      }
    }

    const activeRaw = rule.active;
    const active = typeof activeRaw === "boolean" ? activeRaw : true;

    const commentRaw = rule.comment;
    let comment = commentRaw == null ? null : typeof commentRaw === "string" ? commentRaw : null;
    if (!comment && params.instructionForComment) {
      const snippet = params.instructionForComment.trim().replace(/\s+/g, " ").slice(0, 180);
      comment = snippet ? `AI: ${snippet}` : null;
    }

    const numericMatchTypes: MatchType[] = ["amount_equals", "amount_lt", "amount_lte", "amount_gt", "amount_gte"];
    if (matchType === "always") {
      return {
        priority: Number.isFinite(priority) ? priority : 100,
        matchType,
        matchValue: null,
        glAccountNo,
        dimensionOverrides: Object.keys(dimensionOverrides).length ? dimensionOverrides : null,
        active,
        comment,
      };
    }

    if (numericMatchTypes.includes(matchType)) {
      const n = matchValue != null ? Number(matchValue) : NaN;
      if (Number.isNaN(n)) {
        throw new Error(`draftRules[${idx}].matchValue must be a number for ${matchType}`);
      }
      return {
        priority: Number.isFinite(priority) ? priority : 100,
        matchType,
        matchValue: String(n),
        glAccountNo,
        dimensionOverrides: Object.keys(dimensionOverrides).length ? dimensionOverrides : null,
        active,
        comment,
      };
    }

    if (!matchValue || !matchValue.trim()) {
      throw new Error(`draftRules[${idx}].matchValue is required for ${matchType}`);
    }

    return {
      priority: Number.isFinite(priority) ? priority : 100,
      matchType,
      matchValue,
      glAccountNo,
      dimensionOverrides: Object.keys(dimensionOverrides).length ? dimensionOverrides : null,
      active,
      comment,
    };
  });

  if (result.length === 0) {
    throw new Error("At least one rule is required");
  }

  return { drafts: result, warnings };
}
