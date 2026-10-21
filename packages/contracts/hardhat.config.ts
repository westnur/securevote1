import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";

const SOLC_VERSION = "0.8.28";

/**
 * Compile with the official `solc` npm package (solc-js / WebAssembly) instead of
 * downloading a native compiler from binaries.soliditylang.org. This keeps builds
 * reproducible and works behind restrictive networks. The version is pinned in
 * package.json, so every student compiles with exactly the same compiler.
 */
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion !== SOLC_VERSION) return runSuper();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const solc = require("solc");
  const longVersion = String(solc.version()).replace(/\.Emscripten\.clang$/, "");
  return {
    compilerPath: require.resolve("solc/soljson.js"),
    isSolcJs: true,
    version: SOLC_VERSION,
    longVersion,
  };
});

/**
 * SAFETY: only local networks are configured. There are intentionally no testnet or
 * mainnet entries and no private keys in this file. Hardhat's built-in test accounts
 * are public, well-known keys that must never hold real value.
 */
const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: process.env.HARDHAT_RPC_URL ?? "http://127.0.0.1:8545", chainId: 31337 },
  },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};

export default config;
