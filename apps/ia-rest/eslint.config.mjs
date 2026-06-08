import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";

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
    // Deno Edge Functions — no son Next.js, ESLint no aplica aquí
    "supabase/functions/**",
    // Monorepo casa de marcas: las otras verticales (apps/*) tienen su propio
    // lint/CI; el proyecto ia-rest no las lintea.
    "apps/**",
  ]),
  // Reglas convertidas a warn — código legado preexistente.
  // Los errores de compilación (TypeScript) siguen siendo bloqueantes.
  // Mejorar progresivamente en nuevos archivos.
  {
    plugins: {
      "react-hooks": reactHooks,
      "react": reactPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any":              "warn",
      "@typescript-eslint/no-unused-vars":               "warn",
      "@typescript-eslint/prefer-as-const":              "warn",
      "@typescript-eslint/no-require-imports":           "warn",
      "react-hooks/set-state-in-effect":                 "warn",
      "react-hooks/static-components":                   "warn",
      "react-hooks/immutability":                        "warn",
      "react-hooks/purity":                              "warn",
      "react-hooks/refs":                                "warn",
      "react-hooks/exhaustive-deps":                     "warn",
      "react-hooks/preserve-manual-memoization":         "warn",
      "react/no-unescaped-entities":                     "warn",
      "@next/next/no-html-link-for-pages":               "warn",
      "prefer-const":                                    "warn",
    },
  },
]);

export default eslintConfig;
