import { loadEnv } from "./config/env.js";
import { createApp, DEFAULT_LIMITS } from "./app.js";
import { EthersChainGateway } from "./lib/chain.js";
import { logger } from "./lib/logger.js";
import { createPrisma } from "./lib/prisma.js";

async function main() {
  const env = loadEnv();
  const prisma = createPrisma();
  try {
    await prisma.$connect();
  } catch {
    throw new Error(
      "Cannot connect to PostgreSQL. Is it running (`npm run db:up`) and is DATABASE_URL correct? Did you run `npm run db:migrate`?",
    );
  }
  const chain = new EthersChainGateway(env.RPC_URL, env.CHAIN_ID, {
    contractAddress: env.CONTRACT_ADDRESS,
    deploymentFile: env.DEPLOYMENT_FILE,
  });
  const status = await chain.status();
  if (!status.reachable || !status.contractDeployed) {
    logger.warn("Blockchain not ready — API will report CHAIN_UNAVAILABLE until it is", { hint: status.message });
  } else {
    logger.info("Connected to local blockchain", { chainId: status.chainId, contract: status.contractAddress });
  }

  const app = createApp({ prisma, chain, env, limits: DEFAULT_LIMITS });
  const server = app.listen(env.PORT, "127.0.0.1", () => {
    logger.info(`SecureVote API listening on http://127.0.0.1:${env.PORT} (educational prototype)`);
  });

  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`\n[SecureVote] Startup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
