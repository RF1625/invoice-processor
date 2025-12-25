import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFirmId } from "@/lib/tenant";
import { createStorageReadStream, statStorageFile } from "@/lib/storage";

const getInvoiceFile = async (invoiceId: string, firmId: string) =>
  prisma.file.findFirst({
    where: { invoiceId, firmId },
    orderBy: { createdAt: "desc" },
  });

const buildHeaders = (file: { fileName: string; contentType: string | null }, size?: number) => {
  const contentType = file.contentType ?? "application/pdf";
  const safeName = file.fileName || "invoice.pdf";
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${safeName}"`,
  });
  if (typeof size === "number" && Number.isFinite(size)) headers.set("Content-Length", String(size));
  return headers;
};

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const file = await getInvoiceFile(params.id, firmId);
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const stats = await statStorageFile(file.storagePath);
    const stream = await createStorageReadStream(file.storagePath);
    return new NextResponse(stream, {
      status: 200,
      headers: buildHeaders(file, stats?.size),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((err as { code?: string })?.code === "ENOENT") {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
    }
    console.error("Failed to stream invoice file", err);
    return NextResponse.json({ error: "Failed to stream invoice file" }, { status: 500 });
  }
}

export async function HEAD(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const firmId = await requireFirmId();
    const file = await getInvoiceFile(params.id, firmId);
    if (!file) return new NextResponse(null, { status: 404 });

    const stats = await statStorageFile(file.storagePath);
    return new NextResponse(null, { status: 200, headers: buildHeaders(file, stats?.size) });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unauthorized")) {
      return new NextResponse(null, { status: 401 });
    }
    if ((err as { code?: string })?.code === "ENOENT") {
      return new NextResponse(null, { status: 404 });
    }
    console.error("Failed to read invoice file headers", err);
    return new NextResponse(null, { status: 500 });
  }
}
