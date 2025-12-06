import { NextResponse } from "next/server";
import { getDimensions, getGlAccounts, getVendors } from "@/lib/navClient";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const useMock = process.env.NAV_USE_MOCK === "true";

    const [vendors, glAccounts, dimensions] = await Promise.all([
      getVendors(),
      getGlAccounts(),
      getDimensions(),
    ]);

    for (const v of vendors) {
      await prisma.vendor.upsert({
        where: { vendorNo: v.no },
        update: {
          name: v.name,
          defaultCurrency: v.currencyCode ?? null,
          active: true,
        },
        create: {
          vendorNo: v.no,
          name: v.name,
          defaultCurrency: v.currencyCode ?? null,
          active: true,
        },
      });
    }

    for (const g of glAccounts) {
      await prisma.glAccount.upsert({
        where: { no: g.no },
        update: { name: g.name, type: g.type ?? null },
        create: { no: g.no, name: g.name, type: g.type ?? null },
      });
    }

    for (const d of dimensions) {
      for (const dv of d.values) {
        await prisma.dimension.upsert({
          where: { code_valueCode: { code: d.code, valueCode: dv.code } },
          update: { valueName: dv.name, active: true },
          create: {
            code: d.code,
            valueCode: dv.code,
            valueName: dv.name,
            active: true,
          },
        });
      }
    }

    return NextResponse.json(
      {
        status: "succeeded",
        synced: {
          vendors: vendors.length,
          glAccounts: glAccounts.length,
          dimensions: dimensions.length,
        },
        navUseMock: useMock,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("NAV sync failed", err);
    const message = err instanceof Error ? err.message : "NAV sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
