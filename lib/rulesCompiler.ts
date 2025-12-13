import OpenAI from "openai";
import { type ApprovalPolicy } from "@prisma/client";
import { parseAndValidateDsl, type VendorRulesDsl, type RequiredMapping, validateDslReferences } from "./rulesDsl";

type CompileResult = {
  dsl: VendorRulesDsl;
  warnings: string[];
  requiredMappings: RequiredMapping[];
  llmTraceId: string | null;
};

const DEFAULT_MODEL = "gpt-4o-mini";

export async function compileVendorRulesWithLlm(params: {
  vendorId: string;
  instructionText: string;
  firmContext: {
    glAccounts: Array<{ no: string; name: string; type?: string | null }>;
    dimensions: Array<{ code: string; valueCode: string; valueName: string; active: boolean }>;
    approvalPolicies: ApprovalPolicy[];
  };
}): Promise<CompileResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL_VENDOR_RULES || DEFAULT_MODEL;

  const validGlCodes = new Set(params.firmContext.glAccounts.map((g) => g.no));
  const validDimensionValues = new Set(
    params.firmContext.dimensions.filter((d) => d.active).map((d) => `${d.code}:${d.valueCode}`),
  );

  const glList = params.firmContext.glAccounts.slice(0, 300).map((g) => ({ no: g.no, name: g.name, type: g.type ?? null }));
  const dimList = params.firmContext.dimensions
    .filter((d) => d.active)
    .slice(0, 500)
    .map((d) => ({ code: d.code, valueCode: d.valueCode, valueName: d.valueName }));

  const system = [
    "You convert natural-language invoice coding instructions into a strict JSON DSL for deterministic automation.",
    "Return ONLY valid JSON. No markdown.",
    "",
    "Hard rules:",
    `- vendor_id MUST equal "${params.vendorId}".`,
    "- Every rule MUST include: id, when (non-empty array), then (non-empty array), because (human-readable string).",
    "- Never reference vendor name text; rules are anchored to vendor_id only.",
    "",
    "Allowed condition fields (field): total, currency, invoice_date, line.description, line.amount, line.unit_price, line.qty",
    "Allowed operators (op): eq, neq, lt, lte, gt, gte, contains, regex, in",
    "Value types: string | number | boolean | string[]",
    "",
    "Allowed actions (then[].type): set_gl, set_dimension, set_flag, set_tag, set_approval",
    "- set_gl: {type:\"set_gl\", gl_code:\"<code>\"} (must exist in provided G/L list)",
    "- set_dimension: {type:\"set_dimension\", key:\"<DIMCODE>\", value:\"<VALUECODE>\"} (must exist in provided dimensions list)",
    "- set_flag: {type:\"set_flag\", key:\"<string>\", value:true|false}",
    "- set_tag: {type:\"set_tag\", tag:\"<string>\"}",
    `- set_approval: {type:\"set_approval\", policy:\"${params.firmContext.approvalPolicies.join("|")}\"}`,
    "",
    "Prefer a small number of clear rules. If the instruction is ambiguous, add a warning in warnings[].",
    "",
    "JSON output shape:",
    "{",
    '  "dsl": { "vendor_id": "...", "rules": [ ... ] },',
    '  "warnings": ["..."]',
    "}",
  ].join("\n");

  const user = {
    instructionText: params.instructionText,
    availableGlAccounts: glList,
    availableDimensions: dimList,
  };

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) },
    ],
  });

  const traceId = completion.id ?? null;
  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI returned invalid JSON: ${(err as Error).message}`);
  }

  const warnings: string[] = Array.isArray(parsed?.warnings) ? parsed.warnings.filter((w: any) => typeof w === "string") : [];
  const { dsl, errors: structuralErrors } = parseAndValidateDsl(parsed?.dsl);
  if (dsl.vendor_id !== params.vendorId) {
    structuralErrors.push({ path: "$.vendor_id", message: "vendor_id must match requested vendorId" });
  }

  const { errors: refErrors, requiredMappings } = validateDslReferences({ dsl, validGlCodes, validDimensionValues });

  const errors = [...structuralErrors, ...refErrors];
  if (errors.length) {
    const message = errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    const err = new Error(message) as Error & { requiredMappings?: RequiredMapping[]; warnings?: string[]; llmTraceId?: string | null };
    err.requiredMappings = requiredMappings;
    err.warnings = warnings;
    err.llmTraceId = traceId;
    throw err;
  }

  return { dsl, warnings, requiredMappings: [], llmTraceId: traceId };
}

