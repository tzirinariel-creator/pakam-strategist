import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // React Compiler diagnostics (enabled by default in Next 16) are surfaced as
    // warnings, not build-breaking errors. They flag missed auto-memoization
    // ("preserve-manual-memoization") and a benign sync-server-data-into-local-state
    // effect ("set-state-in-effect") — optimization/style hints, not correctness bugs.
    // The affected code is intentional (e.g. an O(courses×sessions) conflict map worth
    // memoizing). Tracked for incremental cleanup rather than blocking CI.
    rules: {
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
