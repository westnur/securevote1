// ESLint flat config for the whole monorepo.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "packages/contracts/artifacts/**",
      "packages/contracts/cache/**",
      "packages/contracts/typechain-types/**",
      "packages/contracts/abi/**",
      "apps/frontend/test-results/**",
      "apps/frontend/playwright-report/**",
      "docs/**/*.html",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    files: ["apps/frontend/src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Hardhat config/tests use CommonJS-style require and chai expressions.
    files: ["packages/contracts/**/*.{ts,cjs}"],
    rules: { "@typescript-eslint/no-require-imports": "off", "@typescript-eslint/no-unused-expressions": "off" },
  },
);
