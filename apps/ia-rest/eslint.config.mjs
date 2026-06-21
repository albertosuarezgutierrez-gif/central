import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Config de lint COMPARTIDA de la matriz (solo datos: ignores + ruleset a warn).
import { sharedIgnores, legacyWarnRules } from "../../eslint.config.base.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Ignores comunes de la matriz + los PROPIOS de ia-rest.
  globalIgnores([
    ...sharedIgnores,
    // Deno Edge Functions — no son Next.js, ESLint no aplica aquí
    "supabase/functions/**",
    // Monorepo casa de marcas: las otras verticales (apps/*) tienen su propio
    // lint/CI; el proyecto ia-rest no las lintea.
    "apps/**",
  ]),
  // Reglas de código legado bajadas a "warn" (compartidas con la matriz).
  legacyWarnRules,
]);

export default eslintConfig;
