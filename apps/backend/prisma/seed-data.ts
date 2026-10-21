/**
 * SYNTHETIC demo data — every person, organization and number here is fictional.
 * Email addresses use the reserved `.test` top-level domain (RFC 2606), so they can
 * never belong to a real mailbox. Wallet addresses are Hardhat's PUBLIC default test
 * accounts (#0–#9); they are well known and must never hold real value.
 */
import bcrypt from "bcryptjs";
import type { PrismaClient, Role } from "@prisma/client";

export const HARDHAT_ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // #0 on-chain admin (deploy script)
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // #1 organizer (ORGANIZER_ROLE granted at deploy)
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // #2
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // #3
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // #4
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // #5
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9", // #6
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", // #7
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", // #8
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", // #9
] as const;

const DOMAIN = "demo.securevote.test";

interface DemoUser {
  key: string;
  email: string;
  displayName: string;
  wallet: number; // index into HARDHAT_ACCOUNTS
  memberships: { org: "altyn" | "esil"; roles: Role[]; shares: number }[];
}

export const DEMO_USERS: DemoUser[] = [
  {
    key: "admin",
    email: `admin@${DOMAIN}`,
    displayName: "Aruzhan Admin",
    wallet: 0,
    memberships: [
      { org: "altyn", roles: ["ADMIN"], shares: 0 },
      { org: "esil", roles: ["ADMIN"], shares: 0 },
    ],
  },
  {
    key: "organizer",
    email: `organizer@${DOMAIN}`,
    displayName: "Daniyar Organizer",
    wallet: 1,
    memberships: [{ org: "altyn", roles: ["ORGANIZER"], shares: 0 }],
  },
  {
    key: "alikhan",
    email: `alikhan@${DOMAIN}`,
    displayName: "Alikhan Shareholder",
    wallet: 2,
    memberships: [{ org: "altyn", roles: ["SHAREHOLDER"], shares: 4000 }],
  },
  {
    key: "madina",
    email: `madina@${DOMAIN}`,
    displayName: "Madina Shareholder",
    wallet: 3,
    memberships: [{ org: "altyn", roles: ["SHAREHOLDER"], shares: 3000 }],
  },
  {
    key: "timur",
    email: `timur@${DOMAIN}`,
    displayName: "Timur Shareholder",
    wallet: 4,
    memberships: [{ org: "altyn", roles: ["SHAREHOLDER"], shares: 2000 }],
  },
  {
    key: "zarina",
    email: `zarina@${DOMAIN}`,
    displayName: "Zarina Shareholder",
    wallet: 5,
    memberships: [{ org: "altyn", roles: ["SHAREHOLDER"], shares: 1000 }],
  },
  {
    key: "auditor",
    email: `auditor@${DOMAIN}`,
    displayName: "Yerlan Auditor",
    wallet: 6,
    memberships: [
      { org: "altyn", roles: ["AUDITOR"], shares: 0 },
      { org: "esil", roles: ["AUDITOR"], shares: 0 },
    ],
  },
  {
    key: "saule",
    email: `saule@${DOMAIN}`,
    displayName: "Saule Shareholder",
    wallet: 7,
    memberships: [{ org: "altyn", roles: ["SHAREHOLDER"], shares: 500 }],
  },
  {
    key: "gulnara",
    email: `gulnara@${DOMAIN}`,
    displayName: "Gulnara Resident",
    wallet: 8,
    memberships: [{ org: "esil", roles: ["SHAREHOLDER"], shares: 85 }],
  },
  {
    key: "nurlan",
    email: `nurlan@${DOMAIN}`,
    displayName: "Nurlan HOA Organizer",
    wallet: 9,
    memberships: [{ org: "esil", roles: ["ORGANIZER", "SHAREHOLDER"], shares: 120 }],
  },
];

const ORGS = {
  altyn: {
    slug: "altyn-demo-holdings",
    name: "Altyn Demo Holdings JSC",
    description: "Fictional joint-stock company used to demonstrate weighted shareholder voting. Not a real company.",
    registrationNumber: "DEMO-JSC-0001",
    totalShares: 10500,
  },
  esil: {
    slug: "esil-demo-residence",
    name: "Esil Demo Residence Homeowners' Association",
    description:
      "Fictional homeowners' association; voting weight = apartment area in m². Used to demonstrate organization isolation.",
    registrationNumber: "DEMO-HOA-0002",
    totalShares: 205,
  },
} as const;

const HOUR = 3600 * 1000;

export async function seedDatabase(prisma: PrismaClient, opts: { password: string; bcryptRounds?: number }) {
  // Safety guard: the seed replaces data, so it refuses to run on a database that
  // contains any account outside the synthetic demo domain.
  const foreign = await prisma.user.count({ where: { NOT: { email: { endsWith: `@${DOMAIN}` } } } });
  if (foreign > 0) {
    throw new Error(
      `Refusing to seed: the database contains ${foreign} non-demo account(s). The seed only replaces synthetic demo data.`,
    );
  }
  // Clear in dependency order (synthetic data only).
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.transactionReference.deleteMany(),
    prisma.voterEligibility.deleteMany(),
    prisma.electionOption.deleteMany(),
    prisma.election.deleteMany(),
    prisma.organizationMembership.deleteMany(),
    prisma.authSession.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
  ]);

  const orgIds: Record<string, string> = {};
  for (const [key, org] of Object.entries(ORGS)) {
    orgIds[key] = (await prisma.organization.create({ data: org })).id;
  }

  const passwordHash = await bcrypt.hash(opts.password, opts.bcryptRounds ?? 10);
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const user = await prisma.user.create({
      data: {
        email: u.email,
        displayName: u.displayName,
        passwordHash,
        walletAddress: HARDHAT_ACCOUNTS[u.wallet]!.toLowerCase(),
        memberships: {
          create: u.memberships.map((m) => ({ organizationId: orgIds[m.org]!, roles: m.roles, shareCount: m.shares })),
        },
      },
    });
    userIds[u.key] = user.id;
  }

  // Draft election used in the live demo (organizer publishes it on-chain from the UI).
  const now = Date.now();
  const dividend = await prisma.election.create({
    data: {
      organizationId: orgIds.altyn!,
      createdById: userIds.organizer!,
      title: "Approval of the FY2026 dividend policy",
      description:
        "Shareholders decide whether to adopt the proposed (fictional) dividend policy of 30% of net profit. " +
        "Voting weight equals the number of fictional shares held.",
      startTime: new Date(Math.floor(now / 1000) * 1000),
      endTime: new Date(Math.floor((now + 72 * HOUR) / 1000) * 1000),
      quorumBps: 5000,
      options: { create: ["Approve", "Reject", "Abstain"].map((label, index) => ({ index, label })) },
    },
  });
  await prisma.voterEligibility.createMany({
    data: [
      { userId: userIds.alikhan!, weight: 4000 },
      { userId: userIds.madina!, weight: 3000 },
      { userId: userIds.timur!, weight: 2000 },
      { userId: userIds.zarina!, weight: 1000 },
    ].map((v) => ({ ...v, electionId: dividend.id })),
  });

  // Draft in the second organization (demonstrates tenant isolation).
  await prisma.election.create({
    data: {
      organizationId: orgIds.esil!,
      createdById: userIds.nurlan!,
      title: "Courtyard renovation budget 2027",
      description: "Residents choose between two fictional renovation proposals.",
      startTime: new Date(Math.floor(now / 1000) * 1000),
      endTime: new Date(Math.floor((now + 7 * 24 * HOUR) / 1000) * 1000),
      quorumBps: 6000,
      options: {
        create: ["Proposal A — playground", "Proposal B — parking", "Reject both"].map((label, index) => ({ index, label })),
      },
    },
  });

  await prisma.auditEvent.create({
    data: { action: "SEED_COMPLETED", organizationId: orgIds.altyn!, details: { source: "prisma/seed.ts", synthetic: true } },
  });

  return { orgIds, userIds };
}
