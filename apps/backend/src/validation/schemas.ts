import { z } from "zod";
import { badRequest } from "../lib/errors.js";

/** Limits mirror the smart contract (byte lengths, option counts) so a valid draft can always be published. */
export const LIMITS = {
  titleBytes: 160,
  labelBytes: 80,
  descriptionChars: 2000,
  minOptions: 2,
  maxOptions: 10,
  maxVoters: 100,
  maxWeight: 1_000_000_000,
  maxDurationMs: 366 * 24 * 3600 * 1000,
} as const;

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");
// Reject ASCII control characters (except newline/tab in descriptions).
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose
const noControlChars = (s: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

export const idParam = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+$/i, "Invalid id");
export const txHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash");

export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

const titleSchema = z
  .string()
  .trim()
  .min(3, "Title must have at least 3 characters")
  .refine((s) => byteLength(s) <= LIMITS.titleBytes, `Title must be at most ${LIMITS.titleBytes} bytes`)
  .refine(noControlChars, "Title contains invalid characters");

const optionLabelSchema = z
  .string()
  .trim()
  .min(1, "Option label is required")
  .refine((s) => byteLength(s) <= LIMITS.labelBytes, `Option label must be at most ${LIMITS.labelBytes} bytes`)
  .refine(noControlChars, "Option label contains invalid characters");

const electionFields = z.object({
  organizationId: idParam,
  title: titleSchema,
  description: z.string().trim().max(LIMITS.descriptionChars).refine(noControlChars).default(""),
  options: z
    .array(optionLabelSchema)
    .min(LIMITS.minOptions, `At least ${LIMITS.minOptions} options are required`)
    .max(LIMITS.maxOptions, `At most ${LIMITS.maxOptions} options are allowed`)
    .refine((opts) => new Set(opts.map((o) => o.toLowerCase())).size === opts.length, "Option labels must be unique"),
  // ISO-8601 with timezone; stored with second precision because the contract uses unix seconds
  startTime: z.iso.datetime({ offset: true }).transform((v) => new Date(Math.floor(Date.parse(v) / 1000) * 1000)),
  endTime: z.iso.datetime({ offset: true }).transform((v) => new Date(Math.floor(Date.parse(v) / 1000) * 1000)),
  quorumBps: z.number().int().min(0).max(10_000).default(0),
});

function checkSchedule(v: { startTime: Date; endTime: Date }, ctx: z.RefinementCtx) {
  // Zod still runs object refinements when a field failed; skip until both dates parsed.
  if (!(v.startTime instanceof Date) || !(v.endTime instanceof Date)) return;
  if (v.endTime.getTime() <= v.startTime.getTime()) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time" });
  }
  if (v.endTime.getTime() <= Date.now() + 60_000) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be at least 1 minute in the future" });
  }
  if (v.endTime.getTime() - v.startTime.getTime() > LIMITS.maxDurationMs) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "Voting period cannot exceed 366 days" });
  }
}

export const createElectionSchema = electionFields.superRefine(checkSchedule);
export const updateElectionSchema = electionFields.omit({ organizationId: true }).superRefine(checkSchedule);

export const votersSchema = z.object({
  voters: z
    .array(
      z.object({
        userId: idParam,
        weight: z.number().int().min(1, "Voting weight must be positive").max(LIMITS.maxWeight),
      }),
    )
    .max(LIMITS.maxVoters, `At most ${LIMITS.maxVoters} voters per election in this prototype`)
    .refine((vs) => new Set(vs.map((v) => v.userId)).size === vs.length, "Each voter may appear only once"),
});

export const txSubmissionSchema = z.object({ txHash: txHashSchema });

export const organizerRoleSchema = z.object({
  action: z.enum(["grant", "revoke"]),
  txHash: txHashSchema,
});

export const listElectionsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "REGISTRATION", "SCHEDULED", "ACTIVE", "ENDED", "CLOSED"]).optional(),
});

export const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

/** Parse or throw a 400 with field-level details. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest(
      "VALIDATION_ERROR",
      "Request validation failed",
      r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return r.data;
}
