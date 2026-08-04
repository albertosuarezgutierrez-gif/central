# Categorización automática de gasto personal — Plan de implementación

> **For agentic workers:** implementar por fases; el núcleo (Fases 1–5) primero, luego extras (6–8).
> Tests puros con `node --test lib/<file>.test.ts`. Commits frecuentes por fase.

**Goal:** Que el gasto personal se reparta solo en categorías útiles (super/bares/vivienda…) en vez de
amontonarse en "Otros gasto", con rescate por IA de lo ya atascado, y extras de control (revisión,
priorización, comparativa, presupuesto).

**Architecture:** keyword-first + IA gratis (pasarela `@central/core-ai`) en una función compartida
`barrerSubcategoriasPersonal`, enganchada a la ingesta y a un cron diario. Taxonomía Vivienda y 4 extras.

**Tech stack:** Next 15 route handlers, Prisma `$queryRaw`, `@central/core-ai` (`aiComplete`),
`@central/core-telegram` (`tgSend`), módulos puros testeados con `node --test`.

Spec: `docs/superpowers/specs/2026-07-06-categorizacion-personal-automatica-design.md`.

---

## Fase 0 — Migración BD

**Files:** Create `apps/plataforma/prisma/sql/2026-07-06_subcategoria_control.sql`

```sql
-- A: señal propia de duda de subcategoría (no reutilizar requiere_revision, que es del destino).
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS subcategoria_revisar BOOLEAN DEFAULT false;
-- D: scope multi-tenant de las alertas de presupuesto + dedup mensual.
ALTER TABLE categoria_alertas     ADD COLUMN IF NOT EXISTS cuenta_id UUID;
ALTER TABLE categoria_alertas_log ADD COLUMN IF NOT EXISTS cuenta_id UUID;
-- Backfill: con un único usuario, todo pertenece a la única cuenta existente.
UPDATE categoria_alertas     SET cuenta_id = (SELECT id FROM cuentas ORDER BY created_at LIMIT 1) WHERE cuenta_id IS NULL;
UPDATE categoria_alertas_log SET cuenta_id = (SELECT id FROM cuentas ORDER BY created_at LIMIT 1) WHERE cuenta_id IS NULL;
```

- [ ] Aplicar vía Supabase MCP (`apply_migration`) en `wswbehlcuxqxyinousql`. Verificar columnas.
- [ ] Commit del `.sql`.

## Fase 1 — Taxonomía Vivienda + keywords (TDD)

**Files:** Modify `lib/categorias-personales.ts`, `lib/subcategoria-keywords.ts`;
Test `lib/categorias-personales.test.ts`, `lib/subcategoria-keywords.test.ts`.

- [ ] `categorias-personales.ts`: añadir `'comunidad'`, `'ibi'` a `SUBCATEGORIAS_GASTO`; `EMOJI`
  (`comunidad:'🏘️'`, `ibi:'🏛️'`); `DESCRIPCION_GASTO` (comunidad = "cuota de comunidad de propietarios /
  administrador de fincas"; ibi = "IBI y tributos municipales de la vivienda (contribución, tasas)").
- [ ] `subcategoria-keywords.ts`: nuevas reglas ANTES de `otros_gasto`:
  - `comunidad`: `CDAD. DE PROP`, `CDAD DE PROP`, `COMUNIDAD DE PROP`, `COMUNIDAD PROP`, ` C.P. `,
    `MANCOMUNIDAD`, `ADMIN. FINCAS`, `ADMINISTRACION DE FINCAS`, `ADMON FINCAS`, `ADMINISTRADOR DE FINCAS`.
  - `ibi`: ` IBI `, `IMPUESTO BIENES INMUEBLES`, `CONTRIBUCION URBANA`, `RECAUDACION MUNICIPAL`,
    `PATRONATO RECAUDACION`, `TASA BASURA`, `TASA DE BASURA`.
  - Ampliar diccionario general con comercios frecuentes ES (peluquería, estética, veterinario, etc.).
- [ ] Tests: `comunidad`/`ibi` casan ("CDAD. DE PROP. MONTE CARMELO 68"→comunidad, "RECIBO IBI 2026"→ibi)
  y no dan falsos positivos (que "IBIZA" no case ibi; que "BARBERIA" no case bar). Validar `comunidad`/
  `ibi` como subcategorías válidas de gasto.
- [ ] `node --test lib/subcategoria-keywords.test.ts lib/categorias-personales.test.ts` → PASS. Commit.

## Fase 2 — Función compartida de barrido

**Files:** Create `lib/subcategoria-barrido.ts`.

- [ ] `barrerSubcategoriasPersonal(cuentaId?: string, opts?: { presupuestoMs?: number }) : Promise<{ tagged: number; revisar: number }>`:
  - Query: `destino='personal' AND importe<0 AND (subcategoria IS NULL OR ='otros_gasto') AND duplicado_estado<>'ignorado'`,
    scoped por `cuentaId` si viene (si no, todas las cuentas). Trae `concepto_normalizado`, `contraparte`,
    `es_null`, `cuenta_bancaria_id`, `importe`.
  - Paso 1 keyword (`clasificarPorKeywords`): escribe `subcategoria` + `subcategoria_revisar=false`;
    aprende regla en `banca_destino_reglas` solo en descubrimientos NULL; no reescribe no-ops.
  - Paso 2 IA (`aiComplete`, gateway gratis) en lotes (`CHUNK=10`, `IA_TIMEOUT_MS=8000`,
    `PRESUPUESTO_MS=38000`): prompt devuelve `[{"i":0,"subcategoria":"...","confianza":0.0-1.0}]`.
    `subcategoria_revisar = confianza < 0.85 || sub==='otros_gasto'`. Solo van a IA los `es_null` sin
    keyword Y los `otros_gasto` sin keyword (rescate — la diferencia con hoy). Éxito parcial.
  - Devuelve `{tagged, revisar}`.
- [ ] Reutiliza `SYSTEM`/parse tolerante del `auto-tag` actual (moverlos aquí).

## Fase 3 — Ingesta reparte por keywords

**Files:** Modify `lib/categorizar.ts` (`analizarMovimientos`/`guardarCategoria`).

- [ ] En `analizarMovimientos`, al construir la categorización de cada movimiento: si `d.destino==='personal'`
  y `importe<0` y no hay `d.subcategoria` (regla), calcular `clasificarPorKeywords(concepto, contraparte)`
  y pasarlo como `subcategoria` a `guardarCategoria` (que ya hace `COALESCE(${sub}, subcategoria)` → no pisa
  una regla previa). Import de `clasificarPorKeywords`.
- [ ] Verificar que no rompe la vía Pilar (que ya fija `d.subcategoria`).

## Fase 4 — Cron diario + botón auto-tag

**Files:** Modify `app/api/cron/categorizar-movimientos/route.ts`, `app/api/finanzas/categorias/auto-tag/route.ts`.

- [ ] Cron: tras `categorizarLoteSinSubcategoria` (o en su lugar) llamar `barrerSubcategoriasPersonal(undefined)`.
  Preferencia: sustituir la llamada Anthropic por el barrido gratis. Mantener auth `CRON_SECRET` + GET/POST.
- [ ] `auto-tag/route.ts`: reducir a wrapper de `barrerSubcategoriasPersonal(session.id)`; devolver
  `{tagged}`; 502 solo si `tagged===0` y nada de IA respondió. Conserva `maxDuration=60`.
- [ ] Si `categoria-ia.ts` queda sin consumidores de `categorizarLoteSinSubcategoria`, dejar la función
  (no romper) pero el cron ya no la usa. `normalizarContraparte` se mantiene exportada (la usa `asignar`).

## Fase 5 — Endpoints (revisar + priorizar + comparativa)

**Files:** Modify `app/api/finanzas/categorias/movimientos/route.ts`, `app/api/finanzas/categorias/route.ts`,
`app/api/finanzas/categorias/asignar/route.ts`.

- [ ] `movimientos/route.ts`: aceptar `?revisar=1` (filtro `mb.subcategoria_revisar = true`, orden importe
  DESC) y `?orden=importe` (para el panel B: `subcategoria IS NULL OR='otros_gasto'`, orden `ABS(importe)`
  DESC). Devolver también `subcategoria_revisar` en `MovRow`.
- [ ] `asignar/route.ts`: al reasignar (movId o comerciante) poner también `subcategoria_revisar=false`.
- [ ] `categorias/route.ts` (comparativa C): añadir por subcategoría el gasto del mes en curso y la media
  de los N meses previos → devolver `deltaPct` por categoría (solo cuando el rango es "mes actual").

## Fase 6 — UI CategoriasTab

**Files:** Modify `app/(usuario)/finanzas/CategoriasTab.tsx`, `lib/categorias-personales.ts` (grupo Vivienda).

- [ ] Grupo **🏠 Vivienda**: en `categorias-personales.ts` exportar `GRUPO_VIVIENDA = ['hipoteca','comunidad','ibi','suministros_piso']`.
  En la tabla de gastos, renderizar esas filas bajo un encabezado "🏠 Vivienda" con subtotal; el resto igual.
- [ ] Panel **🔎 Por revisar** (A): fetch `movimientos?revisar=1`; lista con `MovList` + desplegable;
  visible solo si hay filas. Al reasignar recarga.
- [ ] Panel **Sin identificar grandes** (B): fetch `movimientos?orden=importe`; top 10; `MovList`.
- [ ] Badge **±%** (C): mostrar `deltaPct` junto al total de cada categoría en preset "Mes actual".

## Fase 7 — Presupuesto + Telegram (D)

**Files:** Modify `lib/alertas-categoria.ts`, `app/api/alertas-categoria/route.ts`,
`lib/subcategoria-barrido.ts`, `CategoriasTab.tsx`.

- [ ] `comprobarAlertas(cuentaId, subcategoria)`: scoping por `cuenta_id` en las 3 queries; dedup mensual
  (log `enviado_at >= inicio de mes` en vez de 24h); EMOJI desde `categorias-personales`.
- [ ] `alertas-categoria/route.ts`: GET/PATCH/DELETE scoped por `cuenta_id` (sesión). GET requiere sesión.
- [ ] `barrerSubcategoriasPersonal`: tras etiquetar, para cada subcategoría tocada llamar
  `comprobarAlertas(cuentaId, sub)` (proactivo). Con `cuentaId` undefined (cron todas), iterar por cuenta.
- [ ] `CategoriasTab`: el POST/PATCH de alertas ya va por la ruta scoped; sin cambio de contrato salvo que
  GET ahora necesita sesión (ya la hay).

## Fase 8 — Verificación, memoria y merge

- [ ] `node --test lib/*.test.ts` → PASS.
- [ ] `pnpm build` (o `npx next build`) del paquete `apps/plataforma` → sin errores de tipos.
- [ ] Verificación funcional con `/verify` o consulta SQL: simular un `otros_gasto` ambiguo y comprobar
  que el barrido lo mueve; comprobar el grupo Vivienda y el panel Por revisar.
- [ ] Actualizar memoria: `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba), `apps/plataforma/CLAUDE.md`
  (estado), skill `.claude/skills/plataforma-maestro` (fila Categorías). Sin secretos.
- [ ] Push, PR draft (relleno), CI verde, **merge** a `main` (autorizado por Alberto).
