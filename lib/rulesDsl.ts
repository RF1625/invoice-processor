import { type ApprovalPolicy, Prisma } from "@prisma/client";

export type DslOperator =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "regex"
  | "in";

export type DslField =
  | "total"
  | "currency"
  | "invoice_date"
  | "line.description"
  | "line.amount"
  | "line.unit_price"
  | "line.qty";

export type DslCondition = {
  field: DslField;
  op: DslOperator;
  value: string | number | boolean | string[];
};

export type DslAction =
  | { type: "set_gl"; gl_code: string }
  | { type: "set_dimension"; key: string; value: string }
  | { type: "set_flag"; key: string; value: boolean }
  | { type: "set_tag"; tag: string }
  | { type: "set_approval"; policy: ApprovalPolicy };

export type DslRule = {
  id: string;
  when: DslCondition[];
  then: DslAction[];
  because: string;
};

export type VendorRulesDsl = {
  vendor_id: string;
  rules: DslRule[];
};

export type CompileValidationError = {
  path: string;
  message: string;
};

export type RequiredMapping =
  | { type: "gl"; gl_code: string }
  | { type: "dimension"; key: string; value: string };

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

const asString = (v: unknown) => (typeof v === "string" ? v : null);
const asNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const asBoolean = (v: unknown) => (typeof v === "boolean" ? v : null);

const allowedFields: DslField[] = [
  "total",
  "currency",
  "invoice_date",
  "line.description",
  "line.amount",
  "line.unit_price",
  "line.qty",
];

const allowedOps: DslOperator[] = ["eq", "neq", "lt", "lte", "gt", "gte", "contains", "regex", "in"];

export function parseAndValidateDsl(input: unknown): { dsl: VendorRulesDsl; errors: CompileValidationError[] } {
  const errors: CompileValidationError[] = [];
  if (!isObject(input)) return { dsl: { vendor_id: "", rules: [] }, errors: [{ path: "$", message: "DSL must be an object" }] };

  const vendor_id = asString(input.vendor_id);
  if (!vendor_id || !vendor_id.trim()) errors.push({ path: "$.vendor_id", message: "vendor_id is required" });

  const rulesRaw = input.rules;
  if (!Array.isArray(rulesRaw)) {
    errors.push({ path: "$.rules", message: "rules must be an array" });
  }

  const rules: DslRule[] = [];
  const seenRuleIds = new Set<string>();

  (Array.isArray(rulesRaw) ? rulesRaw : []).forEach((r, i) => {
    if (!isObject(r)) {
      errors.push({ path: `$.rules[${i}]`, message: "rule must be an object" });
      return;
    }
    const id = asString(r.id);
    if (!id || !id.trim()) errors.push({ path: `$.rules[${i}].id`, message: "id is required" });
    else if (seenRuleIds.has(id)) errors.push({ path: `$.rules[${i}].id`, message: "id must be unique" });
    else seenRuleIds.add(id);

    const because = asString(r.because);
    if (!because || !because.trim()) errors.push({ path: `$.rules[${i}].because`, message: "because is required" });

    const whenRaw = r.when;
    if (!Array.isArray(whenRaw) || whenRaw.length === 0) {
      errors.push({ path: `$.rules[${i}].when`, message: "when must be a non-empty array" });
    }

    const thenRaw = r.then;
    if (!Array.isArray(thenRaw) || thenRaw.length === 0) {
      errors.push({ path: `$.rules[${i}].then`, message: "then must be a non-empty array" });
    }

    const when: DslCondition[] = [];
    (Array.isArray(whenRaw) ? whenRaw : []).forEach((c, j) => {
      if (!isObject(c)) {
        errors.push({ path: `$.rules[${i}].when[${j}]`, message: "condition must be an object" });
        return;
      }
      const field = asString(c.field);
      if (!field || !allowedFields.includes(field as DslField)) {
        errors.push({ path: `$.rules[${i}].when[${j}].field`, message: `field must be one of ${allowedFields.join(", ")}` });
      }
      const op = asString(c.op);
      if (!op || !allowedOps.includes(op as DslOperator)) {
        errors.push({ path: `$.rules[${i}].when[${j}].op`, message: `op must be one of ${allowedOps.join(", ")}` });
      }

      const value = c.value as unknown;
      const valueOk =
        asString(value) != null || asNumber(value) != null || asBoolean(value) != null || (Array.isArray(value) && value.every((x) => typeof x === "string"));
      if (!valueOk) {
        errors.push({ path: `$.rules[${i}].when[${j}].value`, message: "value must be string, number, boolean, or string[]" });
      }

      if (field && op && valueOk) {
        when.push({ field: field as DslField, op: op as DslOperator, value: value as any });
      }
    });

    const then: DslAction[] = [];
    (Array.isArray(thenRaw) ? thenRaw : []).forEach((a, j) => {
      if (!isObject(a)) {
        errors.push({ path: `$.rules[${i}].then[${j}]`, message: "action must be an object" });
        return;
      }
      const type = asString(a.type);
      if (!type) {
        errors.push({ path: `$.rules[${i}].then[${j}].type`, message: "type is required" });
        return;
      }
      switch (type) {
        case "set_gl": {
          const gl = asString(a.gl_code);
          if (!gl || !gl.trim()) errors.push({ path: `$.rules[${i}].then[${j}].gl_code`, message: "gl_code is required" });
          else then.push({ type: "set_gl", gl_code: gl });
          break;
        }
        case "set_dimension": {
          const key = asString(a.key);
          const value = asString(a.value);
          if (!key || !key.trim()) errors.push({ path: `$.rules[${i}].then[${j}].key`, message: "key is required" });
          if (!value || !value.trim()) errors.push({ path: `$.rules[${i}].then[${j}].value`, message: "value is required" });
          if (key && value) then.push({ type: "set_dimension", key, value });
          break;
        }
        case "set_flag": {
          const key = asString(a.key);
          const value = asBoolean(a.value);
          if (!key || !key.trim()) errors.push({ path: `$.rules[${i}].then[${j}].key`, message: "key is required" });
          if (value == null) errors.push({ path: `$.rules[${i}].then[${j}].value`, message: "value must be boolean" });
          if (key && value != null) then.push({ type: "set_flag", key, value });
          break;
        }
        case "set_tag": {
          const tag = asString(a.tag);
          if (!tag || !tag.trim()) errors.push({ path: `$.rules[${i}].then[${j}].tag`, message: "tag is required" });
          else then.push({ type: "set_tag", tag });
          break;
        }
        case "set_approval": {
          const policy = asString(a.policy);
          if (policy !== "none" && policy !== "manager") {
            errors.push({ path: `$.rules[${i}].then[${j}].policy`, message: "policy must be one of none, manager" });
          } else {
            then.push({ type: "set_approval", policy: policy as ApprovalPolicy });
          }
          break;
        }
        default:
          errors.push({ path: `$.rules[${i}].then[${j}].type`, message: "unknown action type" });
      }
    });

    if (id && because && when.length && then.length) {
      rules.push({ id, because, when, then });
    }
  });

  return { dsl: { vendor_id: vendor_id ?? "", rules }, errors };
}

export function validateDslReferences(params: {
  dsl: VendorRulesDsl;
  validGlCodes: Set<string>;
  validDimensionValues: Set<string>; // `${code}:${valueCode}`
}): { errors: CompileValidationError[]; requiredMappings: RequiredMapping[] } {
  const errors: CompileValidationError[] = [];
  const requiredMappings: RequiredMapping[] = [];

  params.dsl.rules.forEach((r, i) => {
    r.then.forEach((a, j) => {
      if (a.type === "set_gl") {
        if (!params.validGlCodes.has(a.gl_code)) {
          errors.push({ path: `$.rules[${i}].then[${j}].gl_code`, message: `Unknown G/L code ${a.gl_code}` });
          requiredMappings.push({ type: "gl", gl_code: a.gl_code });
        }
      }
      if (a.type === "set_dimension") {
        const key = `${a.key}:${a.value}`;
        if (!params.validDimensionValues.has(key)) {
          errors.push({ path: `$.rules[${i}].then[${j}]`, message: `Unknown dimension value ${key}` });
          requiredMappings.push({ type: "dimension", key: a.key, value: a.value });
        }
      }
    });
  });

  return { errors, requiredMappings };
}

export type CanonicalInvoiceLine = {
  line_index: number;
  description: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};

export type CanonicalInvoice = {
  invoice_id: string;
  vendor_id: string | null;
  status: string;
  currency: string | null;
  invoice_date: string | null;
  total: number | null;
  lines: CanonicalInvoiceLine[];
};

const toNumber = (v: unknown): number | null => {
  if (v == null) return null;
  if (v instanceof Prisma.Decimal) return v.toNumber();
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const evalCondition = (ctx: { invoice: CanonicalInvoice; line?: CanonicalInvoiceLine }, c: DslCondition) => {
  const value = c.value;
  let actual: unknown = null;

  switch (c.field) {
    case "total":
      actual = ctx.invoice.total;
      break;
    case "currency":
      actual = ctx.invoice.currency;
      break;
    case "invoice_date":
      actual = ctx.invoice.invoice_date;
      break;
    case "line.description":
      actual = ctx.line?.description ?? null;
      break;
    case "line.amount":
      actual = ctx.line?.amount ?? null;
      break;
    case "line.unit_price":
      actual = ctx.line?.unit_price ?? null;
      break;
    case "line.qty":
      actual = ctx.line?.qty ?? null;
      break;
  }

  const op = c.op;
  if (op === "contains") {
    if (typeof actual !== "string" || typeof value !== "string") return false;
    return actual.toLowerCase().includes(value.toLowerCase());
  }
  if (op === "regex") {
    if (typeof actual !== "string" || typeof value !== "string") return false;
    try {
      return new RegExp(value, "i").test(actual);
    } catch {
      return false;
    }
  }
  if (op === "in") {
    if (!Array.isArray(value)) return false;
    return value.includes(String(actual ?? ""));
  }

  const numericOps: DslOperator[] = ["lt", "lte", "gt", "gte"];
  if (numericOps.includes(op)) {
    const a = toNumber(actual);
    const b = toNumber(value);
    if (a == null || b == null) return false;
    if (op === "lt") return a < b;
    if (op === "lte") return a <= b;
    if (op === "gt") return a > b;
    if (op === "gte") return a >= b;
  }

  if (op === "eq" || op === "neq") {
    const eq = String(actual ?? "") === String(value ?? "");
    return op === "eq" ? eq : !eq;
  }

  return false;
};

export type ApplyEligibilityReport = {
  vendorMatched: boolean;
  vendorMatchStatus: string | null;
  requiredFieldsMissing: string[];
  conflicts: string[];
  ruleVersionId: string;
};

export type ApplyDecision = {
  rule_id: string;
  matched: boolean;
  scope: "invoice" | "line";
  line_index?: number;
  because?: string;
  actions?: DslAction[];
};

export type ApplyResult = {
  eligibility: ApplyEligibilityReport;
  decisions: ApplyDecision[];
  proposed: {
    approvalPolicy: ApprovalPolicy | null;
    lineUpdates: Array<{
      line_index: number;
      set_gl?: string;
      set_dimensions?: Record<string, string>;
    }>;
  };
};

export function applyDslDeterministically(params: {
  invoice: CanonicalInvoice;
  dsl: VendorRulesDsl;
  ruleVersionId: string;
  vendorMatchStatus: string | null;
  vendorMatchConfidence: number | null;
}): ApplyResult {
  const missing: string[] = [];
  if (params.invoice.total == null) missing.push("total");
  if (!params.invoice.lines?.length) missing.push("lines");

  const conflicts: string[] = [];
  const decisions: ApplyDecision[] = [];

  const lineState: Array<{ gl: string | null; dims: Record<string, string> }> = params.invoice.lines.map(() => ({
    gl: null,
    dims: {} as Record<string, string>,
  }));

  let approvalPolicy: ApprovalPolicy | null = null;

  const rules = params.dsl.rules;
  for (const rule of rules) {
    const usesLineFields = rule.when.some((c) => c.field.startsWith("line."));
    if (!usesLineFields) {
      const matched = rule.when.every((c) => evalCondition({ invoice: params.invoice }, c));
      decisions.push({ rule_id: rule.id, matched, scope: "invoice", because: matched ? rule.because : undefined, actions: matched ? rule.then : undefined });
      if (!matched) continue;
      for (const action of rule.then) {
        if (action.type === "set_approval") {
          if (approvalPolicy && approvalPolicy !== action.policy) {
            conflicts.push(`approval policy conflict: ${approvalPolicy} vs ${action.policy} (rule ${rule.id})`);
          } else if (!approvalPolicy) {
            approvalPolicy = action.policy;
          }
          continue;
        }
        // Apply line-level actions to all lines for invoice-scoped rules.
        for (let idx = 0; idx < lineState.length; idx++) {
          if (action.type === "set_gl") {
            if (lineState[idx].gl && lineState[idx].gl !== action.gl_code) {
              conflicts.push(`line ${idx} gl conflict: ${lineState[idx].gl} vs ${action.gl_code} (rule ${rule.id})`);
              continue;
            }
            if (!lineState[idx].gl) lineState[idx].gl = action.gl_code;
          }
          if (action.type === "set_dimension") {
            const existing: string | undefined = lineState[idx].dims[action.key];
            if (existing && existing !== action.value) {
              conflicts.push(`line ${idx} dim ${action.key} conflict: ${existing} vs ${action.value} (rule ${rule.id})`);
              continue;
            }
            if (!existing) lineState[idx].dims[action.key] = action.value;
          }
        }
      }
    } else {
      for (const line of params.invoice.lines) {
        const matched = rule.when.every((c) => evalCondition({ invoice: params.invoice, line }, c));
        decisions.push({
          rule_id: rule.id,
          matched,
          scope: "line",
          line_index: line.line_index,
          because: matched ? rule.because : undefined,
          actions: matched ? rule.then : undefined,
        });
        if (!matched) continue;
        const idx = line.line_index;
        for (const action of rule.then) {
          if (action.type === "set_approval") {
            if (approvalPolicy && approvalPolicy !== action.policy) {
              conflicts.push(`approval policy conflict: ${approvalPolicy} vs ${action.policy} (rule ${rule.id})`);
            } else if (!approvalPolicy) {
              approvalPolicy = action.policy;
            }
            continue;
          }
          if (action.type === "set_gl") {
            if (lineState[idx].gl && lineState[idx].gl !== action.gl_code) {
              conflicts.push(`line ${idx} gl conflict: ${lineState[idx].gl} vs ${action.gl_code} (rule ${rule.id})`);
              continue;
            }
            if (!lineState[idx].gl) lineState[idx].gl = action.gl_code;
          }
          if (action.type === "set_dimension") {
            const existing: string | undefined = lineState[idx].dims[action.key];
            if (existing && existing !== action.value) {
              conflicts.push(`line ${idx} dim ${action.key} conflict: ${existing} vs ${action.value} (rule ${rule.id})`);
              continue;
            }
            if (!existing) lineState[idx].dims[action.key] = action.value;
          }
        }
      }
    }
  }

  const lineUpdates = lineState.map((s, idx) => ({
    line_index: idx,
    set_gl: s.gl ?? undefined,
    set_dimensions: Object.keys(s.dims).length ? s.dims : undefined,
  }));

  const vendorMatched = params.vendorMatchStatus === "matched" && (params.vendorMatchConfidence == null || params.vendorMatchConfidence >= 1);

  return {
    eligibility: {
      vendorMatched,
      vendorMatchStatus: params.vendorMatchStatus ?? null,
      requiredFieldsMissing: missing,
      conflicts,
      ruleVersionId: params.ruleVersionId,
    },
    decisions,
    proposed: { approvalPolicy, lineUpdates },
  };
}
