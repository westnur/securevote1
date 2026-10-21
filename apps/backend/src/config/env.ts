import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
/** packages/contracts/deployments/localhost.json, written by `npm run chain:deploy`. */
export const DEFAULT_DEPLOYMENT_FILE = path.resolve(here, "../../../../packages/contracts/deployments/localhost.json");

/** Hardhat's local chain id. The backend refuses to talk to any other chain. */
export const LOCAL_CHAIN_ID = 31337;

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required (see .env.example)" })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgresql:// connection string"),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  COOKIE_SECURE: bool,
  SESSION_TTL_HOURS: z.coerce.number().min(0.25).max(24).default(8),
  RPC_URL: z.url().default("http://127.0.0.1:8545"),
  PUBLIC_RPC_URL: optionalString.pipe(z.url().optional()),
  CHAIN_ID: z.coerce
    .number()
    .default(LOCAL_CHAIN_ID)
    .refine((v) => v === LOCAL_CHAIN_ID, {
      message: "CHAIN_ID must be 31337 — this educational prototype only runs on a local Hardhat network",
    }),
  CONTRACT_ADDRESS: optionalString.pipe(
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "CONTRACT_ADDRESS must be a 0x-prefixed 20-byte address")
      .optional(),
  ),
  DEPLOYMENT_FILE: z.string().default(DEFAULT_DEPLOYMENT_FILE),
  DEMO_MODE: bool,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables at startup. On failure, prints which variables are
 * invalid (names and rules only — never values, which may be secrets) and throws.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nCopy .env.example to .env and adjust it.`);
  }
  return result.data;
}
