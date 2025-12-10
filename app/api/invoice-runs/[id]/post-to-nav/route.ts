import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { postPurchaseInvoice, type NavPurchaseInvoicePayload } from "@/lib/navClient";
import { requireFirmId } from "@/lib/tenant";
import { validateRequestOrigin } from "@/lib/auth";

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let runId: string | null = null;

  try {
    const req = _req;
    const originCheck = validateRequestOrigin(req);
    if (!originCheck.ok) {
      return NextResponse.json({ error: originCheck.error }, { status: 403 });
    }

    const params = await context.params;
    const firmId = await requireFirmId();
    runId = params.id;

    const run = await prisma.run.findFirst({ where: { id: runId, firmId } });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (!run.navPayload) {
      return NextResponse.json({ error: "No NAV payload stored for this run" }, { status: 400 });
    }

    const navPayload = run.navPayload as unknown as NavPurchaseInvoicePayload;
    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    const navResponse = await postPurchaseInvoice(navPayload, firm?.code);
    const navResponseForLog =
      navResponse === undefined || navResponse === null
        ? Prisma.JsonNull
        : (JSON.parse(JSON.stringify(navResponse)) as Prisma.InputJsonValue);

    await prisma.run.update({
      where: { id: runId },
      data: { status: "nav_posted", error: null },
    });

    await prisma.navPostLog.create({
      data: {
        firmId,
        runId: run.id,
        invoiceId: null,
        status: "success",
        message: navResponse?.message ?? "NAV post succeeded",
        response: navResponseForLog,
      },
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
    const status = message.includes("validation") ? 400 : 500;
    if (runId) {
      await prisma.run
        .update({
          where: { id: runId },
          data: { status: "nav_post_failed", error: message },
        })
        .catch(() => {});
      const firmIdForLog =
        (await requireFirmId().catch(() => null)) ??
        (await prisma.run.findUnique({ where: { id: runId }, select: { firmId: true } }).then((r) => r?.firmId).catch(() => null));
      if (firmIdForLog) {
        await prisma.navPostLog
          .create({
            data: {
              firmId: firmIdForLog,
              runId,
              invoiceId: null,
              status: "error",
              message,
            },
          })
          .catch(() => {});
      }
    }
    return NextResponse.json({ error: message }, { status });
  }
}
