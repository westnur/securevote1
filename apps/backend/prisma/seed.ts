import { PrismaClient } from "@prisma/client";
import { DEMO_USERS, seedDatabase } from "./seed-data.js";

const password = process.env.SEED_DEMO_PASSWORD;
if (!password || password.length < 8) {
  console.error("SEED_DEMO_PASSWORD must be set (min. 8 characters) — see .env.example");
  process.exit(1);
}

const prisma = new PrismaClient();
seedDatabase(prisma, { password })
  .then(() => {
    console.log("Seeded SYNTHETIC demo data. Demo accounts (password = SEED_DEMO_PASSWORD from your .env):");
    for (const u of DEMO_USERS) console.log(`  ${u.email.padEnd(36)} ${u.memberships.map((m) => m.roles.join("+")).join(", ")}`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
