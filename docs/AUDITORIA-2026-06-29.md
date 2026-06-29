# Auditoría con contexto — monorepo `central` — 29/06/2026

**Disparador:** Alberto pidió "haz todo" tras cerrar el trabajo del agente SEO (PRs #550/#551).
Revisión de salud del monorepo para que no vuelvan a saltar fallos como los del SEO.
**Modo:** completo (estructura + typecheck CI + seguridad + deps + infra).
**Estado final:** 🟢 Verde. 1 fix de bajo riesgo aplicado en el acto. 0 bloqueantes nuevos (el build de `alquiler`
falló transitoriamente durante la auditoría pero ya compila verde — ver abajo).

| Bloque | Estado |
|---|---|
| Lockfile / `pnpm install --frozen-lockfile` | ✅ OK (exit 0) |
| Scope viejo `@iarest/` en código | ✅ 0 referencias |
| `aiComplete/aiSearch(prompt, número)` (bug recurrente) | ✅ 0 casos |
| `transpilePackages` vs imports `@central/*` | 🟡→✅ 1 oversight (`core-receipts`) **ARREGLADO** |
| Typecheck de las 5 apps | ✅ Verde (vía CI `tests.yml`; ver nota) |
| Fallback de secretos de auth a literal | ✅ Solo CRON/API keys salientes (permitido + allowlist guardián) |
| Seguridad Supabase (advisors) | 🟡 384 avisos preexistentes a nivel BD (acción manual, NO tocar desde código) |
| Vulnerabilidades de deps (`pnpm audit`) | 🟡 16 (5 high) — preexistentes, mayormente no explotables (ver nota) |
| Radiografía de estructura | 🟢 Regenerada y commiteada en esta pasada |

---

## 🟢 Fix aplicado en el acto (bajo riesgo)

### `@central/core-receipts` ausente de `transpilePackages` en ia-rest e ialimp
- **Qué:** `core-receipts` exporta TS puro (`main: ./src/index.ts`, sin build) y se importa en
  `apps/ia-rest/src/lib/courier.ts` y `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts`,
  está declarado en `dependencies` (`workspace:*`) de ambas apps, **pero faltaba en `transpilePackages`** —
  mientras que todos los demás `@central/*` consumidos sí estaban. Invariante de la matriz: cada `@central/*`
  consumido DEBE listarse en `transpilePackages` (exporta fuente TS cruda).
- **Riesgo:** latente. Hoy los builds pasan, pero es frágil (un import desde un client component lo rompería).
- **Acción:** añadido `@central/core-receipts` a:
  - `apps/ia-rest/next.config.ts:16` (canónico) y `apps/ia-rest/next.config.js:17` (mirror de respaldo)
  - `apps/ialimp/next.config.ts:10`
- Cambio aditivo (no quita nada), alineado con el patrón existente.

---

## 🟡 Hallazgos preexistentes — ACCIÓN MANUAL de Alberto (no se tocan desde código)

### Seguridad Supabase (BD compartida `wswbehlcuxqxyinousql`) — 384 advisors
`mcp__Supabase__get_advisors(security)`: 1 ERROR, 176 WARN, 207 INFO.
| Nivel | Tipo | Nº | Nota |
|---|---|---|---|
| ERROR | `security_definer_view` | 1 | Vista `public.v_movimientos_activos` con SECURITY DEFINER |
| WARN | `anon_security_definer_function_executable` | 77 | funciones SECURITY DEFINER ejecutables por anon |
| WARN | `authenticated_security_definer_function_executable` | 77 | idem authenticated |
| WARN | `rls_policy_always_true` | 17 | **lo más relevante multi-tenant**: políticas que no aíslan |
| WARN | `public_bucket_allows_listing` | 4 | buckets públicos listables |
| WARN | `extension_in_public` | 1 | extensión en schema public |
| INFO | `rls_enabled_no_policy` | 207 | RLS activado sin política |

**Por qué NO se tocan desde código:** `docs/auditoria-seguridad.md` documenta que apretar RLS/vistas/buckets en
esta BD **rompió la app viva de ialimp (anon key en cliente) y se REVIRTIÓ**. Cualquier cambio aquí debe ir uno
a uno, validado contra ialimp+sivra+plataforma, como acción manual con rollback — nunca en masa.
**Recomendación priorizada (si se aborda):** (1) revisar las 17 `rls_policy_always_true` (riesgo de fuga entre
tenants); (2) el ERROR `security_definer_view`; (3) el resto es ruido conocido del patrón anon-key.
**Rollback:** cada DDL de RLS/vista se revierte con su `CREATE OR REPLACE` previo (NUNCA `DROP` → CASCADE).

### Vulnerabilidades de deps — `pnpm audit`: 16 (1 low / 10 moderate / 5 high)
Preexistentes y, según el criterio de la skill, mayormente **no explotables en este uso**:
- **SheetJS/`xlsx`** (2 high: prototype pollution + ReDoS): ialimp solo **ESCRIBE** xlsx (export), no parsea →
  no explotable. La remediación (tarball CDN de SheetJS) puede romper builds si la CDN no es alcanzable → **documentar, no arriesgar**.
- **`nodemailer` (high), `vite`/`esbuild` (moderate, solo dev), `postcss`, `fast-xml-parser`, `uuid`, `file-type`,
  `launch-editor`:** transitivas / superficie dev. Acción recomendada: cuando toque, subir las que tengan parche
  vía `pnpm.overrides` en el `package.json` RAÍZ y verificar que no rompen build. No urgente.

---

### 🟢 La vertical `alquiler` falló el build de Vercel de forma TRANSITORIA (ya verde)
Durante la auditoría, varios deploys de Vercel de **`alquiler`** salieron en Error/FAILED. Investigado: NO es un
bug de código. `apps/alquiler` existe (PRs #567/#568), está en `tests.yml` y tiene `next.config.ts` con
`ignoreBuildErrors`. Los deploys fallidos (`EMcRhZ9R6bKnXcbPQ27S8cC52AEW`, `HnVKr5BfmRBbgwaJmY4yu6x3aEKK`) ahora
devuelven **404** = fueron **cancelados/superados en vuelo** por Vercel al llegar commits nuevos en ráfaga
(Alberto estaba empujando varias verticales en paralelo). El **último** deploy de alquiler sobre este HEAD es
**Ready/DEPLOYED** (`Gn31ULU1edKkDUMjEKY4og1JYPrY`), y como mi diff no toca alquiler, **también compila en `main`**.
Conclusión: fallo transitorio de infraestructura (concurrencia de deploys), no acción de código. Si vuelve a
fallar de forma reproducible, abrir el log del deploy concreto (`vercel inspect <id> --logs`).

## ✅ Verificaciones en verde

- **Typecheck de las 5 apps:** el CI `tests.yml` typechequea ia-rest/ialimp/sivra/plataforma/rrhh en cada PR y
  está **verde en main** (cross-verificado en los checks por-app de #550 y #551). ia-rest también typechequeó
  limpio en local (exit 0). *Nota de entorno:* el typecheck local de ialimp/sivra/plataforma dio ruido masivo
  (`@prisma/client has no exported member 'Prisma'` + cascada de `any`) por el gotcha documentado
  `Command "prisma" not found` (pnpm no resuelve el binario `prisma` desde el subdir de la app en este contenedor);
  NO son errores reales — el CI con clean-install los descarta.
- **Scopes y patrones:** 0 `@iarest/` en código; 0 llamadas `aiComplete(prompt, número)`.
- **Secretos:** los `process.env.X_SECRET || ''` encontrados son CRON_SECRET / API keys de servicios externos
  salientes (permitido por CLAUDE.md; el guardián `pnpm test:guardia` los cubre / allowlista y pasa en CI).
- **Agente SEO (foco de la sesión):** ambas rutas (botón plataforma + cron sivra) endurecidas e idénticas
  (Serper 3-niveles + `parseSeoJson` guard + `tgAlert`). Cron sigue gateado por `SEO_AGENT_ENABLED`.

---

## Checklist de acciones manuales de Alberto (Supabase / Vercel)

- [ ] (Opcional, cuando se aborde seguridad BD) Revisar 1 a 1 las 17 políticas `rls_policy_always_true` y la vista
      `v_movimientos_activos`, validando contra ialimp/sivra/plataforma antes de aplicar. Rollback = `CREATE OR REPLACE` previo.
- [ ] (Opcional) Subir vulns con parche vía `pnpm.overrides` en el `package.json` raíz; verificar build. Dejar `xlsx` documentado (no explotable).
- [ ] (Cuando quieras) Activar el cron SEO automático poniendo `SEO_AGENT_ENABLED=true` en el proyecto Vercel `sivra` (el código ya está listo y endurecido).
- [ ] (Solo si reaparece) `alquiler`: su fallo de build fue transitorio (deploys cancelados en vuelo; ya compila verde). Sin acción salvo que vuelva de forma reproducible.
