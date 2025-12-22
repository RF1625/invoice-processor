import { prisma } from "./prisma";

const normalizeVendorText = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export type VendorMatchCandidate = {
  vendorId: string;
  vendorNo: string;
  name: string;
  matchedOn: "vendor_name" | "alias";
  score: number; // 0..1
};

export async function suggestVendorMatches(params: {
  firmId: string;
  vendorText: string;
  take?: number;
}): Promise<{ candidates: VendorMatchCandidate[]; normalized: string; hasExactMatch: boolean }> {
  const take = Math.max(1, Math.min(params.take ?? 5, 20));
  const normalized = normalizeVendorText(params.vendorText);
  if (!normalized) return { candidates: [], normalized, hasExactMatch: false };

  const [vendors, aliases] = await Promise.all([
    prisma.vendor.findMany({
      where: { firmId: params.firmId, active: true },
      select: { id: true, vendorNo: true, name: true },
    }),
    prisma.vendorAlias.findMany({
      where: { firmId: params.firmId },
      select: {
        vendorId: true,
        aliasText: true,
        confidenceHint: true,
        vendor: { select: { vendorNo: true, name: true } },
      },
    }),
  ]);

  const scored: VendorMatchCandidate[] = [];
  let hasExactMatch = false;

  for (const v of vendors) {
    const n = normalizeVendorText(v.name);
    if (!n) continue;
    let score = 0;
    if (n === normalized) score = 1;
    else if (n.startsWith(normalized) || normalized.startsWith(n)) score = 0.9;
    else if (n.includes(normalized) || normalized.includes(n)) score = 0.8;
    if (score > 0) {
      if (score >= 1) hasExactMatch = true;
      scored.push({ vendorId: v.id, vendorNo: v.vendorNo, name: v.name, matchedOn: "vendor_name", score });
    }
  }

  for (const a of aliases) {
    const n = normalizeVendorText(a.aliasText);
    if (!n) continue;
    let score = 0;
    if (n === normalized) score = 1;
    else if (n.startsWith(normalized) || normalized.startsWith(n)) score = 0.9;
    else if (n.includes(normalized) || normalized.includes(n)) score = 0.8;
    if (score > 0) {
      if (score >= 1) hasExactMatch = true;
      const hint = Number(a.confidenceHint ?? 1);
      scored.push({
        vendorId: a.vendorId,
        vendorNo: a.vendor.vendorNo,
        name: a.vendor.name,
        matchedOn: "alias",
        score: Math.min(1, score * (Number.isFinite(hint) ? hint : 1)),
      });
    }
  }

  const dedup = new Map<string, VendorMatchCandidate>();
  for (const c of scored) {
    const existing = dedup.get(c.vendorId);
    if (!existing || c.score > existing.score) dedup.set(c.vendorId, c);
  }

  return {
    normalized,
    hasExactMatch,
    candidates: [...dedup.values()].sort((a, b) => b.score - a.score).slice(0, take),
  };
}
