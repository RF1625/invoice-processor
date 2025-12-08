import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postPurchaseInvoice, type NavPurchaseInvoicePayload } from "@/lib/navClient";

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let runId: string | null = null;

  try {
    const params = await context.params;
    runId = params.id;

    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (!run.navPayload) {
      return NextResponse.json({ error: "No NAV payload stored for this run" }, { status: 400 });
    }

    const navPayload = run.navPayload as unknown as NavPurchaseInvoicePayload;
    const navResponse = await postPurchaseInvoice(navPayload);

    await prisma.run.update({
      where: { id: runId },
      data: { status: "nav_posted", error: null },
    });

    return NextResponse.json(
      {
        status: "posted",
        message: navResponse?.message ?? "NAV post succeeded",
        navResponse,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post NAV payload";
    if (runId) {
      await prisma.run
        .update({
          where: { id: runId },
          data: { status: "nav_post_failed", error: message },
        })
        .catch(() => {});
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
