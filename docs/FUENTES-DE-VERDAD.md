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
| `MATRIZ.md` | `packages/*/package.json`, `apps/*/package.json`, `apps/*/vercel.json`, `apps/ia-rest/src/lib/supabase.ts` (schema flip) |
| `docs/PLAN-consolidacion-BD-holding.md` (+ `docs/RUNBOOK-migracion-bd-iarest.md`, `docs/DISEÑO-fusion-bd.md`, `docs/INFORME-unificacion-central.md`) | `apps/ia-rest/src/lib/supabase.ts` (`SB_SCHEMA`), `apps/ia-rest/supabase/**`, envs Supabase de ia-rest en Vercel; migración silo→compartida CERRADA el 19/08/2026 (proyecto viejo borrado; todo vive en `wswbehlcuxqxyinousql`, schema `iarest`) |
| `docs/SKILLS.md` | `.claude/skills/**`, `.claude/commands/**` |
| `docs/VIGIA-CONECTORES.md` | `.claude/skills/conectores-vigia/**`, `.claude/skills/*/SKILL.md` (el mapa rutina→endpoint envejece cuando una skill cambia de conector) |
| `docs/HUECOS-ABIERTOS.md` | `docs/TRADING-FUENTES-PAGO.md`, `packages/module-trading/**`, `apps/plataforma/app/api/trading/**`, `apps/plataforma/lib/trading/**` — **comprobar contra el CÓDIGO que cada hueco sigue abierto, no contra el doc que lo declaró** (caso 21/08/2026) |
| skill `conectores-vigia` | `docs/VIGIA-CONECTORES.md`, `docs/HUECOS-ABIERTOS.md`, `.github/workflows/rutinas-automerge.yml` |
| `docs/ROTACION-SERVICE-ROLE.md` | `apps/ia-rest/supabase/functions/**` (las 43 que leen la clave del entorno), `apps/*/lib/**` que lea `SUPABASE_SERVICE_ROLE_KEY` o `*ANON_KEY`, `apps/plataforma/lib/secrets-registry.ts`. **Mientras la clave filtrada siga viva, este doc es un PENDIENTE ABIERTO, no un histórico** |
| `docs/NIVELA-inventario.md` | **Ninguno en este repo** — describe el repo externo y privado `albertosuarezgutierrez-gif/Cloude`, fuera del scope MCP de las sesiones sobre `central`. No lo marques obsoleto por falta de código que lo respalde: solo caduca si NIVELA se importa como `apps/nivela` (entonces esta fila pasa a apuntar ahí) o si Alberto decide descartarlo |
| `docs/RUTINAS-PROGRAMADAS.md` | `.claude/commands/auditoria-diaria.md`, `.claude/skills/auditoria-central/**`, los crons de `apps/*/vercel.json` |
| skill `central-maestro` | `MATRIZ.md`, `packages/*`, raíz del monorepo |
| skill `ia-rest-maestro` | `apps/ia-rest/**` (rutas, Edge Functions, `supabase/`, `src/**`) |
| skill `sivra-maestro` | `apps/sivra/**` (web pública), `apps/plataforma/lib/sivra/**` + `apps/plataforma/app/api/sivra/**` (gestión interna: agente huésped, pricing, mensajería — vive en plataforma, no en `apps/sivra`), `apps/plataforma/lib/ses/**` + `packages/module-ses/**` (partes de viajeros SES.HOSPEDAJES) |
| skill `ialimp-maestro` | `apps/ialimp/**` |
| skill `plataforma-maestro` | `apps/plataforma/**` (incluye crons sivra migrados, `/operador/*`, `/finanzas`, banca), `packages/module-subastas/**` (radar de subastas, lo consume `apps/plataforma/lib/subastas/**`) |
| skill `perfil-fiscal` | `apps/plataforma/lib/fiscal-deducciones.ts`, `apps/plataforma/lib/finanzas.ts`, `/finanzas` |
| `apps/ia-rest/CLAUDE.md` | `apps/ia-rest/**` |
| `apps/sivra/CLAUDE.md` | `apps/sivra/**` |
| `apps/plataforma/CLAUDE.md` § `/api/publico/*` | `apps/plataforma/app/api/publico/**`, `apps/plataforma/lib/sivra/cors-publico.ts` (+ su `.test.ts`), `apps/plataforma/middleware.ts` (lista PUBLIC). Único endpoint sin sesión; su cabecera de caché y su CORS son un landmine documentado (3 PRs) |
| `apps/ialimp/CLAUDE.md` | `apps/ialimp/**` |
| `apps/plataforma/CLAUDE.md` | `apps/plataforma/**` |
| `apps/rrhh/CLAUDE.md` | `apps/rrhh/**` |
| `docs/ROADMAP-rrhh.md` (+ skill `rrhh-compliance-calendar`) | `apps/rrhh/**` (ítems 🔴 marcar "hecho" cuando el código los cubra) |
| `apps/transporte/CLAUDE.md` | `apps/transporte/**` |
| `apps/alquiler/CLAUDE.md` | `apps/alquiler/**` |
| skill `transporte-maestro` | `apps/transporte/**` |
| skill `alquiler-maestro` | `apps/alquiler/**` |
| `apps/mariscos/CLAUDE.md` | `apps/mariscos/**`, `packages/module-pesca/**` |
| `docs/TRASPASO-CORREDURIA.md` — **doc ÚNICO del traspaso** (+ `docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`, + `docs/ASEGURA-PROMPT-CHROME.md`) | `apps/asegura/**` (hoy solo `prisma/sql/2026-08-19_asegura_bootstrap.sql`: schema `seguros` + rol `prisma_seguros` inerte. El día que aparezca la app Next.js, este runbook pasa de plan a histórico y manda `apps/asegura/CLAUDE.md`), `apps/plataforma/lib/correduria.ts` + `apps/plataforma/app/api/correduria/**` (la frontera que el doc marca: comisiones cobradas ≠ operativa del CRM). **PENDIENTE ABIERTO**: mensaje a Manuel enviado el 20/08/2026, esperando su respuesta; el contrato de encargado sigue **sin firmar** (responsable decidido —Alberto persona física—, faltan NIF/domicilio y la revisión de la asesoría) y sus categorías de datos se cierran con el inventario de la Fase 1. ⚠️ **Hubo un `docs/ASEGURA-MIGRACION.md` duplicado (vertical `apps/seguros`): fundido aquí y borrado el 20/08/2026 — no recrearlo** |
| `apps/housesevillana/CLAUDE.md` | `apps/housesevillana/**` (portada `app/route.ts`, calendario `app/calendario.ts`, diccionarios `app/{en,it}/traducciones.ts`, `app/i18n/motor.ts`, páginas SEO `/barrio` `/que-ver` `/parking`), `apps/sivra/lib/seo-landing.ts` (el agente SEO reescribe la portada los lunes). **⚠️ Dependencia CROSS-APP:** el calendario se alimenta de `apps/plataforma/app/api/publico/disponibilidad/**` + `apps/plataforma/lib/sivra/{cors-publico,disponibilidad-publica}.ts` — un cambio ahí rompe la landing sin tocar ni un fichero suyo (pasó tres veces el 20/08/2026) |
| skill `.claude/skills/seo-house-sevillana/` (**en el repo desde el 26/08/2026**) | `apps/housesevillana/**` — **ya no es un punto ciego**: era sincronizada (`/root/.claude/skills/synced/`), nadie la reconciliaba y daba a House Sevillana la dirección de OTROS pisos (Bustos Tavera 22 en vez de Socorro 24) en su ficha y en sus dos JSON-LD. Se trajo al repo corregida; la copia de la cuenta queda sombreada por la del repo. Manda `apps/housesevillana/CLAUDE.md`; el guardián es `test/regression-house-sevillana-direccion.test.ts` |
| Manuales usuario ia-rest | `apps/ia-rest/src/components/help/help-prompts.ts`, `apps/ia-rest/public/manual*.html`, `apps/ia-rest/src/app/**` (features visibles) |
| skill `fiscal-novedades` | `apps/plataforma/lib/fiscal-deducciones.ts` (`IMPORTES_POR_ANIO`), tablas `fiscal_novedades`/`fiscal_ayudas`/`ayudas_perfiles`, banners 💶 (`apps/plataforma` `/finanzas`, `apps/almacen` panel, `apps/ialimp` dashboard) |
| `docs/FISCAL-AYUDAS.md` | tablas `fiscal_ayudas` (convocatorias) y `ayudas_perfiles` (perfiles de tenant del radar) |
| skill `correo-triaje` | `apps/plataforma/lib/correo/**` (rutas, imap, clasificador, huespedes, triaje), `apps/plataforma/app/api/cron/correo-*`, tablas `correo_triaje`/`correo_cursor`/`correo_reglas`, `.claude/skills/facturas-correo/SKILL.md` (etiqueta puente `Triaje/Contabilidad`) |
| `docs/DRIVE-ESTRUCTURA.md` (estructura `CENTRAL/` + IDs de carpetas Drive) | `.claude/skills/facturas-correo/SKILL.md` (IDs de carpetas de Drive), `scripts/drive/**`, Apps Scripts que escriben en Drive (`Facturas a Drive`) |
| skill `pricing-agente` | `apps/sivra/**` pricing / `apps/plataforma/**` pricing, raíles Paso 4 |
| skill `mercado-booking` | `apps/plataforma/lib/sivra/mercado-cobertura.ts`, `apps/plataforma/app/api/sivra/mercado/{plan,ingest}/**`, `apps/plataforma/app/api/internal/latido/**`, `apps/plataforma/prisma/sql/2026-08-06_market_rates_fuente.sql`, `docs/superpowers/specs/2026-08-06-mercado-booking-design.md` |
| skill `buscador-ia` | `packages/core-ai/src/{client,openrouter,gateway}.ts`, `apps/plataforma/lib/ia-director.ts`, `docs/BUSCADOR-IA.md` |
| Índice de arquitectura + Director de código (`docs/DIRECTOR-CODIGO.md`, skills `code-map`/`delegar-codigo`) | `scripts/auditar-estructura.mjs`, `docs/mapa-funciones.generated.json`, `apps/plataforma/prisma/sql/2026-07-10_mapa_arquitectura.sql`, `apps/plataforma/app/api/internal/mapa-arquitectura/**`, `apps/plataforma/lib/ia-director-codigo.ts`, `apps/plataforma/lib/programador.ts`, `apps/plataforma/app/api/ai/{codigo,ejecutar,programar}/**`, `scripts/ai-ejecutar.mjs`, `scripts/ai-programar.mjs`, `.github/workflows/ai-programar.yml`, `.claude/skills/{code-map,delegar-codigo}/SKILL.md`, tabla `mapa_arquitectura`, `.github/workflows/auditoria.yml` |
| `packages/core-telegram` (uso) | `apps/plataforma/app/api/sivra/mensajes/**`, cualquier `lib/telegram.ts` |
| skill `agentes-entrenador` | `.claude/skills/**` (todas — es su objeto de trabajo), `docs/AGENTES-BITACORA.md`, `docs/FEEDBACK-AGENTES.md` |
| `docs/AGENTES-BITACORA.md` | `.claude/skills/{facturas-correo,pricing-agente,fiscal-novedades,psd2-health-check,ialimp-client-health,rrhh-compliance-calendar,github-vigia}/SKILL.md` (sección "Auto-informe") |
| `docs/FEEDBACK-AGENTES.md` | `.claude/skills/agentes-entrenador/SKILL.md` (formato de procesado) |
| skill `trading-analista` | `packages/module-trading/**`, `apps/plataforma/app/api/trading/**` (analizar/puntuar/factores/gurus/fundamentales/insiders/seleccion/validar-oos/paper/saldo/descubrir/screener/fmp), `apps/plataforma/app/(usuario)/trading/**` (radar, explorador, satélite cohetes, forward paper), `apps/plataforma/lib/trading-notify.ts`, `apps/plataforma/lib/trading/**`, `apps/plataforma/lib/broker.ts`, `apps/plataforma/prisma/schema.prisma` (modelos `trading_*`, `BrokerSaldo`), `apps/plataforma/prisma/sql/{trading_fase1,trading_paper_track,broker_saldos}*.sql`, `apps/plataforma/prisma/sql/2026-08-1[78]_trading_cartera_real*.sql` (cartera real + su serie histórica), `docs/TRADING-FASE-B-spec.md`, `docs/RUTINAS-PROGRAMADAS.md` (sección "trading-analista") |
| `docs/RUTINAS-PROGRAMADAS.md` (sección "Monitorización — watchdog trading + latidos de agentes") | `apps/plataforma/lib/monitoring/latidos.ts`, `apps/plataforma/app/api/cron/{agentes-latido,trading-watchdog}/**`, `.claude/commands/auditoria-diaria.md` (paso 2-bis, nota "no dupliques con los vigías dedicados") |
| `docs/TRADING-SALIDAS-2026-08.md` (informe de reglas de salida) | `apps/plataforma/lib/trading/{salidas,h10,continuacion}.ts`, `apps/plataforma/app/api/cron/trading-h10/**`, `apps/plataforma/lib/trading/backtest{,-puro}.ts` (los campos `salida*` y los de continuación del corpus), `packages/module-trading/src/paper.ts` (el stop que SÍ está vivo en el paper) — ⚠️ **las cifras del informe llevan su fecha y su muestra: se AÑADE una entrada nueva, no se reescribe la anterior** |
| `docs/TRADING-HIPOTESIS-PREREGISTRO.md` | `apps/plataforma/lib/trading/{salidas,h10,continuacion}.ts` (H9/H10/H12: los umbrales del criterio viven en `h10.ts` y no pueden divergir del doc), `packages/module-trading/src/scoring.ts`, `apps/plataforma/app/api/cron/trading-h10/**` — 🚨 **solo se AÑADEN entradas fechadas; una hipótesis ya registrada NUNCA se edita** (si quedó mal planteada, se registra una enmienda explicando por qué) |

> Mapa orientativo, no exhaustivo. Cuando la auditoría detecte un doc sin fila aquí cuyo
> código cambió, que añada la fila además de reconciliar el doc.
