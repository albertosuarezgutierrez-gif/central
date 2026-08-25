# Retirada de PriceLabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar PriceLabs del motor de pricing de SIVRA — el suelo, el tripwire, la tabla de referencia y el A/B que servía para decidir su baja — y deshacer la ambigüedad del nombre `price_pricelabs`, que hoy designa DOS cosas opuestas y ya ha causado dos bugs en producción.

**Architecture:** Tres categorías, tratadas distinto. (A) Lo que ES PriceLabs → se borra. (B) `rate_snapshots.price_pricelabs`, que PESE AL NOMBRE es el precio VIVO en Smoobu → se renombra a `price_live` por expand/contract (dos migraciones, dos despliegues, cero ventana de rotura). (C) PriceLabs como PROVEEDOR de gasto (cargos en banco, 64,96 USD/mes) → NO SE TOCA: los movimientos históricos siguen necesitando clasificarse.

**Tech Stack:** Next.js 15 App Router, Prisma `$queryRaw` (estas tablas NO están en `schema.prisma` — no hay que tocar el schema), Postgres/Supabase, `node --test` para los módulos puros.

---

## Contexto imprescindible

PriceLabs era el SaaS de pricing dinámico de Alberto (64,96 USD/mes, cargo el día 8). **Escribía los precios directamente en Smoobu**, y por eso la columna que guarda "el precio vivo en Smoobu" se llamó `price_pricelabs`: cuando nació, quien lo escribía era PL. Hoy lo escribe nuestro motor y el nombre es un fósil.

Cronología: Busto Reform pasa al motor el 10/06/2026, Luxury el 13/07, Dúplex y House el 08/08 a las 14:30 UTC. **Alberto da de baja PL el 09/08/2026.** La última foto PL pura es el snapshot del 08/08 07:00 UTC.

**El nombre ya ha causado dos bugs en producción:**

1. **14/08/2026 (arreglado).** `pricing/apply` recapturaba `pricing_pl_referencia` desde `rate_snapshots` — que lee SMOOBU, no PL. Tras la baja, el "suelo PriceLabs" capturaba los precios del PROPIO motor: un suelo autorreferente que nunca caducaba.
2. **VIVO HOY, sin arreglar.** `auto_register_experiments()` rellena `pricing_experiments.price_pricelabs` (el "baseline de PL" del A/B) con `rate_snapshots.price_pricelabs` — otra vez, nuestro propio precio — con fallback a `pricing_applied.old_price`, que es inequívocamente nuestro. Verificado: la fila de `prop_busto_reform` 2027-08-24 creada hoy lleva `price_pricelabs = 87`, y Busto **nunca tuvo curva PL** (la migración del 15/08 la borró por eso). El cron semanal `experiments/digest` — cuyo comentario dice literalmente *"Resumen semanal para decidir la BAJA de PriceLabs"* — sigue corriendo los lunes a las 09:00 comparándonos **contra nosotros mismos** y concluyendo que "batimos a PL".

**Estado de la tabla `pricing_pl_referencia`:** 732 filas = 366 días × 2 pisos (`prop_duplex_center`, `prop_house_sevillana`), todas con `captured_at = 2026-08-08`. Busto y Luxury fueron borrados por `2026-08-15_pl_referencia_reconstruida.sql` porque nunca contuvieron PL genuino. El suelo caduca solo el 06/12/2026 (`PL_REF_MAX_AGE_DAYS = 120`).

**Por qué ahora y no en diciembre:** desde el PR #1698 (25/08) el techo de mercado medido corre DESPUÉS del suelo PL y lo perfora — el aviso "2 fechas por debajo del 70% de PriceLabs" de esta mañana es esa pelea. El suelo ya no protege: estorba.

## Lo que este plan NO hace

- **No toca `apps/sivra/app/api/pricing/*` ni `apps/sivra/app/api/rates/*`** más allá del rename mecánico. Son copias legadas SIN cron (`apps/sivra/vercel.json` solo programa `/api/seo-refresh`); su retirada la recomienda `docs/AUDITORIA-PRICING-2026-08.md` §12.9 y es una decisión aparte.
- **No arregla el diente de sierra** (74% de las fechas subieron Y bajaron en la misma semana, amplitud ×1,44). Frente independiente, sin diagnosticar.
- **No amplía la cobertura del corpus** (solo el 28% del horizonte tiene ancla fiable de mercado).
- **No toca PriceLabs como proveedor de gasto:** `apps/plataforma/lib/sivra/facturas-control.ts:25` y `apps/plataforma/app/api/finanzas/gastos/sugerir-lote/route.ts:16` se quedan como están.

## Mapa de ficheros

**Categoría A — borrar (es PriceLabs de verdad):**
- Borrar: `apps/plataforma/lib/sivra/pricing-suelo-pl.ts`, `apps/plataforma/lib/sivra/pricing-suelo-pl.test.ts`
- Borrar: `apps/plataforma/app/api/sivra/pricing/experiments/digest/route.ts`
- Borrar: `apps/plataforma/app/api/sivra/pricing/stats/route.ts`
- Modificar: `apps/plataforma/app/api/sivra/pricing/apply/route.ts` (suelo, tripwire, `plIlegible`)
- Modificar: `apps/plataforma/lib/cron-dispatch.ts:74` (quitar el cron del digest)
- Modificar: `apps/plataforma/app/(usuario)/sivra/pricing/page.tsx` (quitar el consumo de `stats`)
- SQL: `DROP TABLE pricing_pl_referencia`, `ALTER TABLE pricing_experiments DROP COLUMN price_pricelabs`, `auto_register_experiments()` sin baseline

**Categoría B — renombrar `price_pricelabs` → `price_live` (es el precio VIVO en Smoobu):**
- `apps/plataforma/app/api/sivra/rates/snapshot/route.ts` (único escritor vivo)
- `apps/plataforma/app/api/sivra/pricing/guard/route.ts` (checks #1, #4, #5)
- `apps/plataforma/app/api/sivra/pricing/canal/route.ts:279-283`
- `apps/plataforma/app/api/sivra/mercado/plan/route.ts:159-162`
- `apps/plataforma/app/api/sivra/mercado/ingest/route.ts:165-168`
- `apps/plataforma/app/api/sivra/pricing/resultados/route.ts`, `pilot-track/route.ts`, `settings/route.ts`
- `apps/plataforma/lib/pricing-calendar.ts:98-101`, `apps/plataforma/lib/monitoring/latidos.ts:325`
- `apps/plataforma/app/(usuario)/sivra/pricing/page.tsx`, `pricing-auto/page.tsx`
- Copias legadas de `apps/sivra` que leen la columna (rename mecánico para que no revienten al hacer el DROP)

---

### Task 1: Retirar el suelo PriceLabs del motor

**Files:**
- Delete: `apps/plataforma/lib/sivra/pricing-suelo-pl.ts`
- Delete: `apps/plataforma/lib/sivra/pricing-suelo-pl.test.ts`
- Modify: `apps/plataforma/app/api/sivra/pricing/apply/route.ts`

- [ ] **Step 1: Confirmar el estado verde de partida**

```bash
cd apps/plataforma && npx tsc --noEmit && npm test 2>&1 | tail -20
```
Expected: `tsc` sin errores; los tests en verde (incluye `pricing-suelo-pl.test.ts`, que vamos a borrar).

- [ ] **Step 2: Borrar el módulo del suelo y su test**

```bash
git rm apps/plataforma/lib/sivra/pricing-suelo-pl.ts apps/plataforma/lib/sivra/pricing-suelo-pl.test.ts
```

- [ ] **Step 3: Quitar el import y las tres constantes de `apply/route.ts`**

Borrar la línea 10:
```ts
import { acotarSueloPL } from "@/lib/sivra/pricing-suelo-pl"
```

Borrar el bloque de constantes (líneas ~48-61), es decir `PL_FLOOR_RATIO`, `PL_FLOOR_VS_ANCLA` y `PL_REF_MAX_AGE_DAYS` **con sus comentarios**. Conservar intacto el comentario de `OUTLIER_RATIO` que viene justo detrás (empieza por `// Idea #2:`).

- [ ] **Step 4: Quitar la lectura de la referencia PL**

Borrar el bloque de líneas ~540-573 (desde el comentario `// PriceLabs como referencia por FECHA…` hasta `let plSueloAcotadas = 0` inclusive), que contiene `plIlegible`, `plRows`, `plPrice`, `plAvisos` y `plSueloAcotadas`.

⚠️ **Conservar** la línea siguiente, que NO es de PL:
```ts
  const congeladasGlobal: { property: string; fecha: string; precio: number; factor: number }[] = []
```

- [ ] **Step 5: Quitar el suelo del bucle**

En `apply/route.ts` borrar el bloque completo de líneas ~897-925: el comentario `// 🛡️ Suelo PriceLabs (raíl, no solo aviso)…`, la cota de cordura del 15/08 y el `if (PL_FLOOR_RATIO > 0) { … }`.

⚠️ **`anclaF` se sigue usando** más arriba (ancla suave al mercado de la fecha) — NO borrar su cálculo, solo deja de usarse como cota del suelo.

⚠️ **Conservar** la línea inmediatamente posterior, que es el techo del propietario:
```ts
      if (r.max_price != null) target = Math.min(target, r.max_price)
```

- [ ] **Step 6: Quitar el tripwire del 70%**

Borrar en el bucle (líneas ~1011-1015):
```ts
      const pl = plPrice.get(`${r.property_id}|${date}`)
      if (!dryRun && pl && target < pl * 0.7) {
        plAvisos.push(`${r.property_id.replace("prop_", "")} ${date}: ${eur(target)} vs PL ${eur(Math.round(pl))}`)
      }
```

Y borrar los dos bloques de aviso por Telegram (líneas ~1165-1187): el `if (plAvisos.length > 0) { … }` y el `if (plIlegible) { … }` enteros.

- [ ] **Step 7: Limpiar la respuesta JSON**

En el `return NextResponse.json({ … })` final:

Cambiar
```ts
    ok: !eventosIlegibles && !plIlegible && fallosSmoobu.length === 0 && lecturasCaidas.length === 0,
```
por
```ts
    ok: !eventosIlegibles && fallosSmoobu.length === 0 && lecturasCaidas.length === 0,
```

Borrar la línea de `pl_degradado`:
```ts
    pl_degradado: plIlegible ? `referencia PriceLabs ilegible: tarificado SIN suelo PL (${plIlegible})` : undefined,
```

Cambiar
```ts
    dryRun, paused, days, properties: recs.length, results, pl_avisos: plAvisos.length,
    pl_suelo_acotadas: plSueloAcotadas,
```
por
```ts
    dryRun, paused, days, properties: recs.length, results,
```

- [ ] **Step 8: Comprobar que no queda ninguna referencia**

```bash
grep -n "plAvisos\|plPrice\|plIlegible\|plSueloAcotadas\|PL_FLOOR\|PL_REF_MAX\|acotarSueloPL\|pricing_pl_referencia" apps/plataforma/app/api/sivra/pricing/apply/route.ts
```
Expected: sin salida (exit 1).

⚠️ `plRates` SÍ debe seguir apareciendo — es la disponibilidad de Smoobu, no PriceLabs.

- [ ] **Step 9: Verificar tipos y tests**

```bash
cd apps/plataforma && npx tsc --noEmit && npm test 2>&1 | tail -20
```
Expected: `tsc` sin errores; tests en verde y `pricing-suelo-pl.test.ts` ya no aparece.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "$(cat <<'EOF'
fix(sivra/pricing): retirar el suelo de PriceLabs del motor

PL está de baja desde el 09/08/2026 y su referencia es una foto congelada
del 08/08 que solo cubría 2 de los 4 pisos. Desde el techo de mercado
medido (#1698) el suelo se perfora aguas abajo, así que ya no protege
nada: solo dispara el tripwire del 70% contra una fuente muerta.

Fuera el suelo PL_FLOOR_RATIO, su cota de cordura, el tripwire del 70%
y la degradación plIlegible. Las noches especiales las cubren el ancla
de fecha, el premio de mercado, el calendario de eventos, la guarda de
evento a ciegas y la de outlier.
EOF
)"
```

---

### Task 2: Retirar el A/B que servía para decidir la baja de PL

**Files:**
- Delete: `apps/plataforma/app/api/sivra/pricing/experiments/digest/route.ts`
- Delete: `apps/plataforma/app/api/sivra/pricing/stats/route.ts`
- Modify: `apps/plataforma/lib/cron-dispatch.ts:74`
- Modify: `apps/plataforma/app/(usuario)/sivra/pricing/page.tsx:51-52`

- [ ] **Step 1: Borrar las dos rutas**

```bash
git rm -r apps/plataforma/app/api/sivra/pricing/experiments/digest apps/plataforma/app/api/sivra/pricing/stats
```

Motivo: `digest` dice en su propia cabecera *"Resumen semanal para decidir la BAJA de PriceLabs"* — decisión tomada el 09/08. `stats` compara `price_ours` (fórmula legacy) contra `price_pricelabs` y lo etiqueta "nosotros vs PL"; con PL muerto compara dos precios nuestros.

- [ ] **Step 2: Quitar el cron del digest**

En `apps/plataforma/lib/cron-dispatch.ts` borrar la línea 74:
```ts
  { path: '/api/sivra/pricing/experiments/digest', schedule: '0 9 * * 1' },
```

⚠️ **Conservar** la línea 73 (`experiments/check-results`): cierra el bucle de aprendizaje (`was_booked` + ADR real) y eso sigue valiendo sin PL.

- [ ] **Step 3: Quitar el bloque "vs PriceLabs" de la UI**

En `apps/plataforma/app/(usuario)/sivra/pricing/page.tsx`:

**3a.** Sustituir el `load()` (líneas 48-58) por una sola petición:
```ts
  async function load() {
    setLoading(true)
    const expRes = await fetch("/api/sivra/pricing/experiments").then(r => r.json())
    setExperiments(expRes.experiments ?? [])
    setResumen(expRes.resumen ?? null)
    setLoading(false)
  }
```

**3b.** Borrar el estado `shadow` (su `useState` y el tipo asociado, buscar `setShadow`).

**3c.** Borrar el mapa de recomendaciones fosilizadas (líneas 99-104) entero:
```ts
  const recPriceLabs: Record<string, string> = {
    prop_duplex_center: "✅ Subir — 100% ocupación a precios bajos",
    prop_busto_reform:  "✅ Subir — 90% ocupación, PL muy barato",
    prop_house_sevillana: "⚠️ Cuidado — PL ya cobra bien (~356€)",
    prop_luxury_busto:  "❌ Mantener — solo 67% ocupación",
  }
```
(Son consejos escritos a mano en 2026 y congelados en el código: ninguno se recalcula.)

**3d.** Borrar el banner de revenue (líneas ~156-166), el bloque `{resumen?.revenue_extra_vs_pl != null && ( … )}` completo.

**3e.** Borrar la sección `{/* SHADOW MODE */}` entera — desde `<div>` con el `<h2>Shadow mode — Últimos 30 días</h2>` hasta su `</div>` de cierre. Es la comparativa "PriceLabs / Nuestro / diferencia" y la línea "PL reserva a X€".

**3f.** Quitar de los tipos (líneas 17 y 21) los campos que ya no llegan:
```ts
  price_pricelabs: number | null
  diff_vs_pl: number
```
y de `Resumen`, el campo `revenue_extra_vs_pl`.

**3g.** Quitar la regla CSS `.pricing-shadow-grid` si queda huérfana.

Dejar intacto el resto (resumen de experimentos, tabla de experimentos, formulario de override).

- [ ] **Step 4: Verificar que nada más los llama**

```bash
cd /home/user/central && grep -rn "pricing/stats\|experiments/digest" --include=*.ts --include=*.tsx apps/plataforma
```
Expected: sin salida (exit 1).

- [ ] **Step 5: Verificar tipos y build**

```bash
cd apps/plataforma && npx tsc --noEmit && npm test 2>&1 | tail -10
```
Expected: sin errores, tests en verde.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "fix(sivra/pricing): retirar el A/B contra PriceLabs (digest semanal + stats)

El digest existía para decidir la baja de PL, dada el 09/08. stats
comparaba la fórmula legacy price_ours contra price_pricelabs y lo
llamaba «nosotros vs PL»: con PL muerto son dos precios nuestros."
```

---

### Task 3: Quitar el baseline FALSO de `pricing_experiments`

Este es el bug vivo: `auto_register_experiments()` rellena el "baseline de PriceLabs" con nuestro propio precio.

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-08-25_experiments_sin_baseline_pl.sql`
- Modify: `apps/plataforma/app/api/sivra/pricing/experiments/route.ts`

- [ ] **Step 1: Escribir la migración**

Crear `apps/plataforma/prisma/sql/2026-08-25_experiments_sin_baseline_pl.sql`:

```sql
-- 2026-08-25 — pricing_experiments deja de fingir un baseline de PriceLabs.
--
-- `auto_register_experiments()` rellenaba price_pricelabs con
-- `rate_snapshots.price_pricelabs` (que PESE AL NOMBRE es el precio VIVO en Smoobu, o sea
-- el nuestro) y, en su defecto, con `pricing_applied.old_price` (inequívocamente nuestro).
-- Con PL de baja desde el 09/08/2026 el A/B se comparaba CONTRA SÍ MISMO. Verificado:
-- prop_busto_reform 2027-08-24 registrada hoy con price_pricelabs=87 cuando Busto nunca
-- tuvo curva PL (la borró 2026-08-15_pl_referencia_reconstruida.sql).
--
-- Es el MISMO fallo que el suelo PL autorreferente del 14/08, en otro sitio. Idempotente.

CREATE OR REPLACE FUNCTION public.auto_register_experiments()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  INSERT INTO pricing_experiments (property_id, rate_date, price_set, price_ours, notes)
  SELECT DISTINCT ON (pa.property_id, pa.rate_date)
    pa.property_id,
    pa.rate_date,
    pa.new_price,
    (SELECT rs.price_ours FROM rate_snapshots rs
     WHERE rs.property_id = pa.property_id AND rs.rate_date = pa.rate_date
       AND rs.price_ours IS NOT NULL
     ORDER BY rs.snapshot_date DESC LIMIT 1),
    'Auto-registrado (' || pa.source || '): aplicado ' || pa.new_price || E'€ live'
  FROM pricing_applied pa
  WHERE pa.dry_run = false
    AND pa.rate_date > CURRENT_DATE
  ORDER BY pa.property_id, pa.rate_date, pa.applied_at DESC
  ON CONFLICT (property_id, rate_date) DO UPDATE
    SET price_set = EXCLUDED.price_set,
        price_ours = EXCLUDED.price_ours,
        notes      = EXCLUDED.notes
    WHERE pricing_experiments.was_booked IS NULL
      AND pricing_experiments.notes LIKE 'Auto-registrado%';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

-- La columna se va DESPUÉS de que el código deje de leerla (ver Task 5).
```

- [ ] **Step 2: Quitar el baseline del endpoint de experimentos**

En `apps/plataforma/app/api/sivra/pricing/experiments/route.ts`:

**2a.** En la SELECT, borrar las dos líneas del diff (25-26), dejando `diff_vs_ours`:
```ts
      -- Diferencia vs PriceLabs
      pe.price_set - COALESCE(pe.price_pricelabs, 0) AS diff_vs_pl,
```

**2b.** En el resumen, borrar las tres líneas de `revenue_extra_vs_pl` (44-46):
```ts
      -- Revenue extra vs lo que habría cobrado PL
      SUM(price_set - COALESCE(price_pricelabs, 0))
        FILTER (WHERE was_booked = true)           AS revenue_extra_vs_pl,
```
⚠️ Cuidado con la coma: `ocupacion_experimento_pct` (la línea de arriba) tiene que seguir acabando en coma, y `avg_precio_reservado` (la de abajo) pasa a ser la última.

**2c.** En el POST, quitar `price_pricelabs` de las cuatro apariciones. El bloque queda:
```ts
  const { property_id, rate_date, price_set, price_ours, notes } = body

  if (!property_id || !rate_date || !price_set) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_experiments
      (property_id, rate_date, price_set, price_ours, notes)
    VALUES
      (${property_id}, ${rate_date}::date, ${price_set}::integer,
       ${price_ours ?? null}::integer, ${notes ?? null})
    ON CONFLICT (property_id, rate_date)
    DO UPDATE SET
      price_set  = EXCLUDED.price_set,
      price_ours = EXCLUDED.price_ours,
      notes      = EXCLUDED.notes
  `)
```

- [ ] **Step 3: Verificar que el endpoint ya no la nombra**

```bash
cd /home/user/central && grep -n "price_pricelabs\|diff_vs_pl" apps/plataforma/app/api/sivra/pricing/experiments/route.ts
```
Expected: sin salida (exit 1).

- [ ] **Step 4: Quitar la columna `diff_vs_pl` de la tabla de experimentos**

En `apps/plataforma/app/(usuario)/sivra/pricing/page.tsx` borrar la celda de las líneas ~239-240:
```tsx
                      <td style={{ padding: '12px 16px 12px 0', textAlign: 'right', fontWeight: 500, color: e.diff_vs_pl > 0 ? '#16a34a' : '#dc2626' }}>
                        {e.diff_vs_pl > 0 ? "+" : ""}{e.diff_vs_pl}€</td>
```
y su `<th>` correspondiente en la cabecera de esa tabla. Verificar:
```bash
cd /home/user/central && grep -rn "diff_vs_pl" --include=*.tsx --include=*.ts apps/
```
Expected: sin salida (exit 1).

- [ ] **Step 5: Verificar tipos**

```bash
cd apps/plataforma && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 6: Aplicar la migración en Supabase**

Aplicar `2026-08-25_experiments_sin_baseline_pl.sql` con el MCP de Supabase (`apply_migration`). Después verificar que el registro diario sigue vivo:

```sql
SELECT auto_register_experiments();
```
Expected: devuelve un entero ≥ 0 sin error.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "fix(sivra/pricing): el A/B fingía un baseline de PriceLabs que era nuestro propio precio

auto_register_experiments() rellenaba price_pricelabs desde
rate_snapshots.price_pricelabs (el precio VIVO en Smoobu, o sea el
nuestro) con fallback a pricing_applied.old_price. Desde la baja de PL
el 09/08 el experimento se medía contra sí mismo. Mismo fallo que el
suelo PL autorreferente del 14/08, en otro sitio."
```

---

### Task 4: EXPAND — `rate_snapshots.price_live` conviviendo con la columna vieja

El rename no puede ser atómico: entre la migración y el despliegue de Vercel hay minutos en los que el código desplegado lee la columna antigua, y hay crons a las 07:00, 07:30, 07:45, 08:00, 08:30, 09:00, 09:15, 14:30 y 20:30 UTC. Expand/contract: primero conviven.

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-08-25_rate_snapshots_price_live.sql`
- Modify: `apps/plataforma/app/api/sivra/rates/snapshot/route.ts`
- Modify: todos los lectores de la Categoría B

- [ ] **Step 1: Escribir la migración de expansión**

Crear `apps/plataforma/prisma/sql/2026-08-25_rate_snapshots_price_live.sql`:

```sql
-- 2026-08-25 — rate_snapshots.price_pricelabs pasa a llamarse price_live (paso 1: expand).
--
-- La columna guarda el precio REAL vivo en Smoobu, lo haya escrito quien lo haya escrito.
-- Se llamó price_pricelabs porque cuando nació lo escribía PriceLabs; PL está de baja desde
-- el 09/08/2026 y hoy lo escribe nuestro motor. El nombre ya ha causado DOS bugs (el suelo
-- PL autorreferente del 14/08 y el baseline falso del A/B, este mismo día).
--
-- Expand/contract porque el despliegue de Vercel no es atómico: mientras el código viejo
-- siga vivo tiene que poder escribir price_pricelabs y que price_live quede correcta. El
-- trigger sincroniza en ambos sentidos. El DROP va en la migración de contract (Task 5).
-- Idempotente.

ALTER TABLE rate_snapshots ADD COLUMN IF NOT EXISTS price_live integer;

UPDATE rate_snapshots SET price_live = price_pricelabs
WHERE price_live IS NULL AND price_pricelabs IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rate_snapshots_sync_price_live()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.price_live IS NULL AND NEW.price_pricelabs IS NOT NULL THEN
    NEW.price_live := NEW.price_pricelabs;
  ELSIF NEW.price_pricelabs IS NULL AND NEW.price_live IS NOT NULL THEN
    NEW.price_pricelabs := NEW.price_live;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rate_snapshots_sync_price_live ON rate_snapshots;
CREATE TRIGGER trg_rate_snapshots_sync_price_live
  BEFORE INSERT OR UPDATE ON rate_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.rate_snapshots_sync_price_live();
```

- [ ] **Step 2: Aplicarla en Supabase y verificar el backfill**

Aplicar con el MCP de Supabase, luego:

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE price_live IS DISTINCT FROM price_pricelabs) AS descuadradas
FROM rate_snapshots;
```
Expected: `descuadradas = 0`.

- [ ] **Step 3: El escritor escribe AMBAS columnas**

En `apps/plataforma/app/api/sivra/rates/snapshot/route.ts`, sustituir el comentario de cabecera (líneas 12-17) por:

```ts
// `price_live` = el precio REAL vivo en Smoobu (GET /rates), lo haya escrito quien lo haya escrito.
// Se llamaba `price_pricelabs` porque cuando nació lo escribía PriceLabs (de baja el 09/08/2026);
// ese nombre causó dos bugs y se retiró el 25/08/2026. `price_ours` = una fórmula estática LEGACY
// (`calcOurs`, base fija × estacional × día-semana) de antes del motor real anclado al mercado — es
// un "shadow" histórico que NADIE debería confundir con el precio vivo (causó una falsa alarma el
// 27/07/2026: ver calcOurs en pricing-calendar.ts). Para diagnosticar pricing en vivo, usa
// `price_live` o `pricing_applied`.
```

Y en el INSERT (líneas 70-81) escribir las dos columnas mientras dure la convivencia: añadir `price_live` a la lista de columnas y al `DO UPDATE SET`, con el mismo valor que `price_pricelabs`.

- [ ] **Step 4: Los lectores leen `price_live`**

Cambiar `price_pricelabs` por `price_live` en TODAS estas lecturas (son SELECT, no escriben):

- `apps/plataforma/app/api/sivra/pricing/guard/route.ts` (líneas 96, 99, 101, 105, 155, 159, 245 y el comentario de la 31)
- `apps/plataforma/app/api/sivra/pricing/canal/route.ts:279,283`
- `apps/plataforma/app/api/sivra/mercado/plan/route.ts:150,159,162`
- `apps/plataforma/app/api/sivra/mercado/ingest/route.ts:165,168`
- `apps/plataforma/app/api/sivra/pricing/resultados/route.ts`
- `apps/plataforma/app/api/sivra/pricing/pilot-track/route.ts`
- `apps/plataforma/app/api/sivra/pricing/settings/route.ts`
- `apps/plataforma/lib/pricing-calendar.ts:98-101` (comentario)
- `apps/plataforma/lib/monitoring/latidos.ts:325` (texto del aviso)
- `apps/plataforma/app/(usuario)/sivra/pricing/page.tsx`, `pricing-auto/page.tsx`

Donde el alias era `price_pricelabs AS precio` / `AS base` / `AS vivo`, basta cambiar el nombre de la columna origen.

⚠️ En `mercado/plan/route.ts:150` el comentario dice "que PESE AL NOMBRE es el precio…" — esa coletilla ya no hace falta: el nombre ahora es correcto.

- [ ] **Step 5: Las copias legadas de `apps/sivra` también**

Mismo cambio mecánico en: `apps/sivra/app/api/pricing/stats/route.ts`, `guard/route.ts`, `experiments/route.ts`, `pilot-track/route.ts`, `settings/route.ts`, `resultados/route.ts`, `apps/sivra/app/api/rates/snapshot/route.ts`, `apps/sivra/app/(dashboard)/pricing/page.tsx`, `pricing-auto/page.tsx`.

Sin esto, el DROP de la Task 5 las deja en 500. (Retirarlas del todo es otra decisión — ver "Lo que este plan NO hace".)

- [ ] **Step 6: Comprobar que solo queda el escritor**

```bash
cd /home/user/central && grep -rn "price_pricelabs" --include=*.ts --include=*.tsx apps/ | grep -v "prisma/sql"
```
Expected: solo `apps/plataforma/app/api/sivra/rates/snapshot/route.ts` (que escribe ambas) y `apps/sivra/app/api/rates/snapshot/route.ts` si se decide dejarla escribiendo ambas.

- [ ] **Step 7: Verificar tipos y tests**

```bash
cd apps/plataforma && npx tsc --noEmit && npm test 2>&1 | tail -10
cd ../sivra && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 8: Commit y desplegar**

```bash
git add -A && git commit -m "refactor(sivra): rate_snapshots.price_pricelabs -> price_live (expand)

La columna es el precio VIVO en Smoobu, no PriceLabs: el nombre es de
cuando lo escribía PL (baja el 09/08/2026) y ya ha causado dos bugs.
Expand/contract: el trigger sincroniza ambas columnas mientras convivan,
el escritor escribe las dos y los lectores pasan a price_live. El DROP
va en un PR aparte, una vez verificado en producción."
```

- [ ] **Step 9: Verificar en producción antes de seguir**

Esperar a la pasada del snapshot (07:00 UTC) y comprobar:

```sql
SELECT snapshot_date::text, count(*) filas,
       count(*) FILTER (WHERE price_live IS DISTINCT FROM price_pricelabs) descuadradas
FROM rate_snapshots WHERE snapshot_date >= CURRENT_DATE - 1
GROUP BY 1 ORDER BY 1;
```
Expected: `descuadradas = 0` en ambos días.

Y que el guard sigue dando señal (latido `sivra_guard` en verde).

---

### Task 5: CONTRACT — soltar la columna vieja y la tabla de PL

**Solo cuando la Task 4 lleve al menos un ciclo completo verde en producción.** PR aparte.

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-08-26_pricelabs_drop.sql`
- Modify: `apps/plataforma/app/api/sivra/rates/snapshot/route.ts` (dejar de escribir la vieja)

- [ ] **Step 1: El escritor deja de escribir la columna vieja**

Quitar `price_pricelabs` de las columnas del INSERT y del `DO UPDATE SET` en `apps/plataforma/app/api/sivra/rates/snapshot/route.ts` (y en la copia de `apps/sivra` si sigue viva). Desplegar ANTES de la migración.

- [ ] **Step 2: Escribir la migración de contract**

Crear `apps/plataforma/prisma/sql/2026-08-26_pricelabs_drop.sql`:

```sql
-- 2026-08-26 — Contract: fuera la columna vieja, el trigger de sincronía, el baseline del A/B
-- y la tabla de referencia de PriceLabs. Aplicar SOLO con el código de la Task 4 ya desplegado
-- y verificado (price_live == price_pricelabs en el último ciclo). Idempotente.

DROP TRIGGER IF EXISTS trg_rate_snapshots_sync_price_live ON rate_snapshots;
DROP FUNCTION IF EXISTS public.rate_snapshots_sync_price_live();

ALTER TABLE rate_snapshots       DROP COLUMN IF EXISTS price_pricelabs;
ALTER TABLE pricing_experiments  DROP COLUMN IF EXISTS price_pricelabs;

-- 732 filas (366 días × prop_duplex_center y prop_house_sevillana), captured_at = 2026-08-08.
-- Habría caducado sola el 06/12/2026 por PL_REF_MAX_AGE_DAYS; el motor ya no la lee.
DROP TABLE IF EXISTS pricing_pl_referencia;
```

- [ ] **Step 3: Aplicar y verificar**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('rate_snapshots','pricing_experiments')
  AND column_name IN ('price_pricelabs','price_live');
```
Expected: solo una fila, `price_live` de `rate_snapshots`.

```sql
SELECT to_regclass('public.pricing_pl_referencia');
```
Expected: `NULL`.

- [ ] **Step 4: Comprobar que el motor sigue vivo**

Lanzar la pasada en seco y comprobar que responde `ok: true` y que ya no trae campos `pl_*`:

```bash
curl -s -H "Authorization: Bearer $ALERTA_TOKEN" \
  "https://plataforma-ten-flame.vercel.app/api/sivra/pricing/aplicar-propuesta?dryRun=true" | head -40
```
Expected: `ok: true`, sin `pl_avisos`, `pl_suelo_acotadas` ni `pl_degradado`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(sivra): drop de price_pricelabs y de pricing_pl_referencia (contract)"
```

---

### Task 6: Memoria, skill y docs

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `.claude/skills/pricing-agente/references/estado-y-protocolo.md`
- Modify: `.claude/skills/pricing-agente/references/ciclo.md`

- [ ] **Step 1: Buscar todo lo que la documentación siga afirmando de PL**

```bash
cd /home/user/central && grep -rn -i "pricelabs\|suelo pl\|price_pricelabs" .claude/skills/pricing-agente/ docs/FUENTES-DE-VERDAD.md
```

- [ ] **Step 2: Corregir la skill**

Quitar de `references/` toda mención al suelo PL como raíl vivo y a `pricing_pl_referencia` como fuente. Dejar dicho, en una línea, que PL se retiró el 25/08/2026 y que `rate_snapshots.price_live` es el precio vivo en Smoobu.

- [ ] **Step 3: Entrada en la memoria**

Añadir arriba de `docs/CONTEXTO-SESIONES.md`, máx ~8 líneas, fecha `(25/08/2026)`. Mencionar: retirada del suelo PL y su tripwire; el A/B que se medía contra sí mismo; el rename `price_pricelabs` → `price_live` por expand/contract; y que quedan abiertos el diente de sierra (74% de fechas subiendo y bajando en la misma semana) y la cobertura del corpus (28% del horizonte con ancla fiable).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs(pricing): PriceLabs retirado — memoria, skill y fuentes de verdad"
```

---

## Verificación final

- [ ] `cd apps/plataforma && npx tsc --noEmit && npm test` en verde
- [ ] `cd apps/sivra && npx tsc --noEmit` en verde
- [ ] `grep -rn "pricelabs" --include=*.ts --include=*.tsx apps/` solo devuelve `facturas-control.ts` y `gastos/sugerir-lote/route.ts` (PriceLabs como PROVEEDOR de gasto — se queda)
- [ ] Una pasada real del motor escribe precios y su latido queda en verde
- [ ] El guard sigue avisando (checks #1/#4/#5 leyendo `price_live`)
- [ ] Ningún Telegram con "por debajo del 70% de PriceLabs"
