#!/usr/bin/env node
/* Seed NAV-style master data with a few sample vendors, G/L accounts, dimensions, and rules. */
/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const firm =
    (await prisma.firm.findFirst({ where: { code: "default" } })) ??
    (await prisma.firm.create({ data: { name: "Default Firm", code: "default" } }));
  const firmId = firm.id;

  const freightVendor = await prisma.vendor.upsert({
    where: { firmId_vendorNo: { firmId, vendorNo: "10000" } },
    update: {
      name: "South Freight & Cartage Ltd",
      defaultCurrency: "NZD",
      gstNumber: "NZ1234567",
      defaultDimensions: { DEPARTMENT: "OPS", PROJECT: "PORTS" },
      active: true,
    },
    create: {
      firmId,
      vendorNo: "10000",
      name: "South Freight & Cartage Ltd",
      defaultCurrency: "NZD",
      gstNumber: "NZ1234567",
      defaultDimensions: { DEPARTMENT: "OPS", PROJECT: "PORTS" },
      active: true,
    },
  });

  const blueSky = await prisma.vendor.upsert({
    where: { firmId_vendorNo: { firmId, vendorNo: "20000" } },
    update: { name: "Blue Sky Meats (NZ) Ltd", defaultCurrency: "NZD", active: true },
    create: {
      firmId,
      vendorNo: "20000",
      name: "Blue Sky Meats (NZ) Ltd",
      defaultCurrency: "NZD",
      active: true,
    },
  });

  const glCartage = await prisma.glAccount.upsert({
    where: { firmId_no: { firmId, no: "6210" } },
    update: { name: "Freight and Cartage" },
    create: { firmId, no: "6210", name: "Freight and Cartage" },
  });

  const glFuel = await prisma.glAccount.upsert({
    where: { firmId_no: { firmId, no: "6220" } },
    update: { name: "Fuel Surcharge" },
    create: { firmId, no: "6220", name: "Fuel Surcharge" },
  });

  const glPallet = await prisma.glAccount.upsert({
    where: { firmId_no: { firmId, no: "6230" } },
    update: { name: "Pallet Handling" },
    create: { firmId, no: "6230", name: "Pallet Handling" },
  });

  await prisma.dimension.upsert({
    where: { firmId_code_valueCode: { firmId, code: "DEPARTMENT", valueCode: "OPS" } },
    update: { valueName: "Operations" },
    create: { firmId, code: "DEPARTMENT", valueCode: "OPS", valueName: "Operations" },
  });

  await prisma.dimension.upsert({
    where: { firmId_code_valueCode: { firmId, code: "PROJECT", valueCode: "PORTS" } },
    update: { valueName: "Port Operations" },
    create: { firmId, code: "PROJECT", valueCode: "PORTS", valueName: "Port Operations" },
  });

  await prisma.vendorRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      firmId,
      vendorId: freightVendor.id,
      priority: 10,
      matchType: "description_contains",
      matchValue: "cartage,freight,haulage",
      glAccountNo: glCartage.no,
      dimensionOverrides: { DEPARTMENT: "OPS", PROJECT: "PORTS" },
      comment: "Default freight cartage",
    },
  });

  await prisma.vendorRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      firmId,
      vendorId: freightVendor.id,
      priority: 20,
      matchType: "description_contains",
      matchValue: "fuel surcharge,fuel",
      glAccountNo: glFuel.no,
      dimensionOverrides: { DEPARTMENT: "OPS" },
      comment: "Fuel surcharges",
    },
  });

  await prisma.vendorRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      firmId,
      vendorId: freightVendor.id,
      priority: 30,
      matchType: "description_contains",
      matchValue: "pallet,storage,handling",
      glAccountNo: glPallet.no,
      dimensionOverrides: { PROJECT: "PORTS" },
      comment: "Pallet handling",
    },
  });

  await prisma.vendorRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000004" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000004",
      firmId,
      vendorId: blueSky.id,
      priority: 10,
      matchType: "always",
      matchValue: null,
      glAccountNo: glCartage.no,
      dimensionOverrides: { PROJECT: "PORTS" },
      comment: "Fallback for Blue Sky",
    },
  });

  console.log("Seed complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
