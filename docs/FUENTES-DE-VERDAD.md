# Fuentes de verdad — mapa doc/skill → código (`central`)

> **Para qué.** La auditoría diaria (`/auditoria-diaria`, idea F) usa este mapa para saber
> **exactamente qué doc/skill releer cuando un path de código cambia**, en vez de adivinar.
> También es el cimiento de la "frescura" (idea D: sello `<!-- verificado: YYYY-MM-DD -->`)
> y de la fase 2 "shift-left" (idea E: avisar en un PR si tocas código sin actualizar su doc).
>
> **Cómo se mantiene.** Lo mantiene la propia auditoría (carril 1, se auto-aplica a `main`).
> Si añades un doc/skill o mueves código, añade/corrige aquí la fila. Las rutas son
> orientativas (raíz de la zona, no fichero a fichero): la idea es "si cambia algo bajo estos
> paths, revisa este doc".

## Mapa

| Doc / skill | Paths de código que describe (si cambian → revísalo) |
|---|---|
| `CLAUDE.md` (raíz) | `MATRIZ.md`, estructura `packages/*` + `apps/*`, `.vercelignore`, `vercel.json` raíz |
| `MATRIZ.md` | `packages/*/package.json`, `apps/*/package.json`, `apps/*/vercel.json` |
| `docs/SKILLS.md` | `.claude/skills/**`, `.claude/commands/**` |
| `docs/RUTINAS-PROGRAMADAS.md` | `.claude/commands/auditoria-diaria.md`, `.claude/skills/auditoria-central/**`, los crons de `apps/*/vercel.json` |
| skill `central-maestro` | `MATRIZ.md`, `packages/*`, raíz del monorepo |
| skill `ia-rest-maestro` | `apps/ia-rest/**` (rutas, Edge Functions, `supabase/`, `src/**`) |
| skill `sivra-maestro` | `apps/sivra/**` |
| skill `ialimp-maestro` | `apps/ialimp/**` |
| skill `plataforma-maestro` | `apps/plataforma/**` (incluye crons sivra migrados, `/operador/*`, `/finanzas`, banca) |
| skill `perfil-fiscal` | `apps/plataforma/lib/fiscal-deducciones.ts`, `apps/plataforma/lib/finanzas.ts`, `/finanzas` |
| `apps/ia-rest/CLAUDE.md` | `apps/ia-rest/**` |
| `apps/sivra/CLAUDE.md` | `apps/sivra/**` |
| `apps/ialimp/CLAUDE.md` | `apps/ialimp/**` |
| `apps/plataforma/CLAUDE.md` | `apps/plataforma/**` |
| `apps/rrhh/CLAUDE.md` | `apps/rrhh/**` |
| `apps/transporte/CLAUDE.md` | `apps/transporte/**` |
| `apps/alquiler/CLAUDE.md` | `apps/alquiler/**` |
| skill `transporte-maestro` | `apps/transporte/**` |
| skill `alquiler-maestro` | `apps/alquiler/**` |
| Manuales usuario ia-rest | `apps/ia-rest/src/components/help/help-prompts.ts`, `apps/ia-rest/public/manual*.html`, `apps/ia-rest/src/app/**` (features visibles) |
| skill `fiscal-novedades` | `apps/plataforma/lib/fiscal-deducciones.ts` (`IMPORTES_POR_ANIO`), tabla `fiscal_novedades` |
| skill `pricing-agente` | `apps/sivra/**` pricing / `apps/plataforma/**` pricing, raíles Paso 4 |
| `packages/core-telegram` (uso) | `apps/plataforma/app/api/sivra/mensajes/**`, cualquier `lib/telegram.ts` |

> Mapa orientativo, no exhaustivo. Cuando la auditoría detecte un doc sin fila aquí cuyo
> código cambió, que añada la fila además de reconciliar el doc.
