// Base ESLint compartida de la MATRIZ (casa de marcas). Mismo principio que
// `tsconfig.base.json` y que packages/* vs apps/*: lo COMÚN sube a la raíz, lo
// propio se queda en cada vertical.
//
// IMPORTANTE — este fichero es SOLO DATOS (sin `import` de paquetes). Motivo:
// en Vercel cada vertical instala AISLADA (Root Directory apps/<app>), así que
// el `node_modules` de la raíz no existe en el build por-app. Si esta base
// importara `eslint-config-next`, Node resolvería el bare specifier desde la
// raíz y fallaría. Por eso cada app importa `eslint-config-next` (y `eslint`)
// desde SU propio node_modules —con la versión que casa con SU Next— y compone:
//
//   import { defineConfig, globalIgnores } from "eslint/config";
//   import nextVitals from "eslint-config-next/core-web-vitals";
//   import nextTs from "eslint-config-next/typescript";
//   import { sharedIgnores, legacyWarnRules } from "../../eslint.config.base.mjs";
//   export default defineConfig([
//     ...nextVitals, ...nextTs,
//     globalIgnores([...sharedIgnores, /* ignores propios de la app */]),
//     legacyWarnRules,
//   ]);
//
// Lo COMPARTIDO que vive aquí: la lista de ignores común y el ruleset de código
// legado bajado a "warn".

// Ignores comunes a todas las verticales (los defaults de eslint-config-next que
// conviene declarar explícitos al usar flat config).
export const sharedIgnores = [
  ".next/**",
  "out/**",
  "build/**",
  "next-env.d.ts",
];

// Reglas bajadas a "warn" por código legado preexistente (mejorar progresivamente
// en archivos nuevos). Los errores de TypeScript siguen siendo bloqueantes.
// Los plugins (react-hooks/react/@next/next) ya los registran nextVitals/nextTs;
// aquí NO se re-registran (con pnpm serían otra instancia y flat config lo prohíbe),
// solo se baja el nivel de algunas reglas.
export const legacyWarnRules = {
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
};
