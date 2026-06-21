import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Config de lint COMPARTIDA de la matriz (solo datos: ignores + ruleset a warn).
import { sharedIgnores, legacyWarnRules } from "../../eslint.config.base.mjs";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([...sharedIgnores]),
  legacyWarnRules,
]);
