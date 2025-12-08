import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { analyzeInvoiceBuffer, MAX_INVOICE_FILE_BYTES } from "@/lib/invoiceAnalyzer";
import { requireFirmId } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.AZURE_DOCINT_ENDPOINT || !process.env.AZURE_DOCINT_KEY) {
      return NextResponse.json(
        { error: "Missing AZURE_DOCINT_ENDPOINT or AZURE_DOCINT_KEY env vars" },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
    }

    if (file.size > MAX_INVOICE_FILE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Please upload a file under 10MB." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const firmId = await requireFirmId();
    const fileName = "name" in file ? (file as File).name ?? null : null;
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const storagePath = `local-upload/${firmId}/${Date.now()}-${fileName ?? "upload"}`;

    const { processedInvoice, navPayload, ruleApplications, runId, modelId, pagesAnalyzed } =
      await analyzeInvoiceBuffer(bytes, {
        fileName,
        firmId,
        fileMeta: {
          fileName: fileName ?? "upload",
          storagePath,
          sizeBytes: file.size,
          contentType: "type" in file ? (file as File).type ?? null : null,
          checksum,
        },
      });

    return NextResponse.json(
      {
        status: "succeeded",
        modelId,
        pagesAnalyzed,
        invoice: processedInvoice,
        navPreview: navPayload,
        ruleApplications,
        runId,
        navUseMock: process.env.NAV_USE_MOCK === "true",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Invoice analysis failed", err);
    const message = err instanceof Error ? err.message : "Failed to analyze invoice";
    return NextResponse.json({ error: "Failed to analyze invoice", details: message }, { status: 500 });
  }
}
