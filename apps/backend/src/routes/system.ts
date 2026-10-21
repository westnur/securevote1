import { Router } from "express";
import type { AppDeps } from "../app.js";

export function systemRouter({ prisma, chain, env }: AppDeps): Router {
  const r = Router();

  /** Public health check — reports component status only, never configuration secrets. */
  r.get("/health", async (_req, res) => {
    let db = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "unreachable";
    }
    const c = await chain.status();
    const healthy = db === "ok" && c.reachable && c.contractDeployed;
    res.status(db === "ok" ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      database: db,
      blockchain: {
        reachable: c.reachable,
        chainId: c.chainId,
        blockNumber: c.blockNumber,
        contractDeployed: c.contractDeployed,
        message: c.message ?? null,
      },
      time: new Date().toISOString(),
    });
  });

  /** Public, non-secret configuration the frontend needs to talk to the local chain. */
  r.get("/config", async (_req, res) => {
    const c = await chain.status();
    res.json({
      chainId: chain.chainId,
      rpcUrl: env.PUBLIC_RPC_URL ?? env.RPC_URL,
      contractAddress: c.contractAddress,
      demoMode: env.DEMO_MODE,
    });
  });

  return r;
}
