# Cartera cohetes (paper) — bolsillo automático con curva diaria

**Fecha:** 2026-07-23
**Autor:** sesión Claude (petición de Alberto)
**Vertical:** `apps/plataforma` · módulo trading (Laboratorio de inversión)
**Estado:** diseño aprobado, pendiente de plan de implementación

---

## 1. Problema / motivación

El satélite **🚀 Caza-cohetes** (perfil lotería: momentum >30% + calidad mala) existe desde el
19/07/2026, pero hoy **solo tiene un "track record" de mediana vs SPY por ventanas**, y ese track
record **está vacío** (2 snapshots, `evals: []`) porque necesita ≥4 semanas de historia. No hay
forma de ver, en euros y con curva, **si perseguir cohetes daría dinero o no**.

El **núcleo** sí tiene esa vista: `COHORTES_PAPER` (cestas congeladas) + `paper-tracker.ts` + una
**cartera de estudio de 30.000€ simulados por cohorte** con curva semanal vs SPY. Los cohetes **no
tienen equivalente**.

Alberto quiere un **bolsillo aparte, 100% automático**, que asigne capital simulado a los cohetes,
lo valore a diario y mida el rendimiento — para responder con datos: *¿la lotería paga?*

## 2. Objetivo (qué SÍ y qué NO)

**SÍ:**
- Un bolsillo simulado **independiente** (30.000€, `CAPITAL_COHETES_EUR`), sin tocar los 30.000€/cohorte
  del núcleo ni contaminar su medición out-of-sample.
- **Selección semanal** (lunes): la cartera rota a los cohetes **confirmados** del snapshot de esa
  semana (equiponderada). Rebalanceo automático.
- **Valoración diaria** (días de bolsa): precios gratis (Stooq→Yahoo), punto de curva (valor cartera
  + valor SPY buy&hold + P&L + alpha).
- Visible en `/trading` con curva y P&L, **separada del núcleo**.
- **"Aprender" = MEDIR**: acumula resultados y, cuando haya muestra suficiente, avisa por Telegram si
  bate al SPY (ajustado a riesgo). **El criterio de selección NO se auto-modifica.**
- Cero órdenes reales, siempre.

**NO (fuera de alcance, por disciplina):**
- ❌ Que el agente cambie solo su forma de elegir según los resultados (= sobreajuste a ruido con pocas
  semanas; viola `docs/TRADING-HIPOTESIS-PREREGISTRO.md`). Cualquier cambio de reglas lo decide Alberto
  con datos forward.
- ❌ Que los cohetes entren en las cohortes del núcleo o en la cesta central (mantiene la separación ya
  existente).
- ❌ Rastrear rumores de OPV / privadas (SpaceX no cotiza → no es medible). Sólo lo que ya está en el
  universo cotizado.
- ❌ Rebalanceo diario de la selección (los fundamentales apenas cambian intra-semana → sólo ruido y
  vaivén). Se **valora** a diario, se **selecciona** semanal.

## 3. Decisiones de diseño (acordadas)

1. **Bolsillo aparte**, no trocear los 30.000€ del núcleo. Pote propio de 30.000€.
2. **Automático total** — el agente ejecuta/valora/mide; no interviene Alberto y no se auto-modifican reglas.
3. **Cadencia dual:** seleccionar semanal, **valorar diario** (era la queja: "semanal es poco" — cierto
   para la valoración, no para la selección).
4. Incluye **3 mejoras** en v1:
   - **Curva a tres bandas** — cartera cohetes vs cesta núcleo vs SPY en el mismo gráfico (¿aporta la lotería?).
   - **Sub-experimento IPO** — marcar los cohetes recién cotizados (`mesesCotizando≠null`) y llevarles el
     marcador aparte (pone a prueba la corazonada "las IPO buenas retroceden y luego explotan"; hoy el
     retrovisor dice lo contrario: mediana +0,8%, batacazo 21%).
   - **Hipótesis pre-registrada** — fecha de evaluación y criterio de éxito firmados ANTES de ver datos.

## 4. Arquitectura

### 4.1 Modelo de la cartera (rotatoria, equiponderada, compuesta)

A diferencia del núcleo (cestas **congeladas** buy&hold), esta cartera **rota**. Se modela como un
**libro de rebalanceos inmutable** + una **curva diaria**, sin estado mutable frágil:

- **Inicio (primer lunes):** pote = `CAPITAL_COHETES_EUR` (30.000€). Se "compra" también 30.000€ de SPY
  al cierre de ese día como benchmark buy&hold (nunca rebalancea) → se guardan `spyUnidades` fijas.
- **Cada rebalanceo** = una fila inmutable: capital de arranque (= valor de la cartera en ese momento,
  arrastrado), la cesta nueva con precio de entrada y **unidades** (fraccionarias) compradas a partes
  iguales, y el flag IPO por nombre. El equity **compone** porque cada rebalanceo arranca del valor
  vivo del anterior.
- **Valoración** (cualquier día) = Σ `unidades_i × precio_i(hoy)` de la cesta del último rebalanceo;
  benchmark = `spyUnidades × precioSpy(hoy)`.

### 4.2 Piezas puras (testeables con `node --test`)

En `packages/module-trading/src/carteraCohetes.ts` (nuevo, sin Prisma ni `@/`):
- `rebalancear(valorPrevioEur, cestaNueva: {simbolo, precio, esIpo, mesesCotizando}[]) → Rebalanceo`
  — reparte el capital a partes iguales y calcula `unidades` por nombre.
- `valorar(rebalanceo, preciosHoy: Record<simbolo, number>) → { valorEur, plPct, porNombre[] }`
  — best-effort: un precio ausente mantiene el último conocido (no rompe la curva).
- `valorarIpo(rebalanceo, preciosHoy) → { valorEur, plPct, n }` — sub-cesta de los `esIpo`.

Se acompañan de tests unitarios (reparto equiponderado, compuesto entre rebalanceos, sub-cesta IPO,
precio ausente).

### 4.3 Wrappers de IO (en `apps/plataforma/lib/trading/`)

`cartera-cohetes-io.ts`:
- `rebalancearCartera()` — lee los cohetes **confirmados** del último snapshot `trading_ranking`,
  baja sus cierres del día (`cierresDiarios`, precios-stooq), llama a `rebalancear(...)` con el valor
  vivo de la cartera y **persiste** una fila en `trading_cohetes_rebalanceo`. Inicializa el pote y el
  benchmark SPY en la primera ejecución. Best-effort.
- `valorarDia()` — lee el último rebalanceo, baja precios de hoy (cesta + SPY), llama a `valorar`/
  `valorarIpo`, y **persiste** un punto en `trading_cohetes_track`.
- `curvaCohetes()` — lee la curva persistida para la UI/digest.

Reutiliza: `cierresDiarios` (Stooq→Yahoo), `eur()` (formato dinero español), `tgSend`
(`@central/core-telegram`). Nada de esto llama a IBKR ni ejecuta órdenes.

### 4.4 Tablas (BD compartida `wswbehlcuxqxyinousql`, aplicar por Supabase MCP)

`prisma/sql/2026-07-23_trading_cohetes.sql` (+ modelos Prisma):
- **`trading_cohetes_rebalanceo`**: `id`, `fecha` (unique), `capital_eur` (valor arrastrado),
  `cesta jsonb` (`[{simbolo, precioEntrada, unidades, esIpo, mesesCotizando}]`),
  `spy_precio numeric`, `spy_unidades numeric` (solo la fila de inicio), `creado_en`.
- **`trading_cohetes_track`**: `fecha` (unique), `valor_eur`, `spy_eur`, `pl_pct`, `alpha_pct`,
  `ipo_valor_eur`, `ipo_pl_pct`, `n_ipo`, `detalle jsonb` (P&L por nombre), `creado_en`.

Sin RLS / con `REVOKE anon,authenticated` (mismo patrón que `trading_ranking`/`trading_paper_track`).
Best-effort en runtime: si una tabla no existe, degrada sin romper.

### 4.5 Crons (Vercel, `vercel.json`, auth `CRON_SECRET`)

- **`/api/cron/trading-cohetes-rebalanceo`** — lunes, **09:30** (30 min después del ranking de las
  09:00, para leer el snapshot fresco). Llama `rebalancearCartera()`.
- **`/api/cron/trading-cohetes-track`** — **mar-sáb 07:00 UTC** (valora con el cierre US ya asentado del
  día anterior; misma familia de horario que el watchdog). Llama `valorarDia()`.

Ambos con `ignoreCommand` heredado del proyecto; sólo el egress de Vercel llega a Stooq/Yahoo (la
rutina Claude da 403, por eso son crons de Vercel, no de la rutina).

### 4.6 UI (`/trading`)

Nueva sección **🚀 Cartera cohetes** en `TradingDashboard.tsx` (extraída a su propio componente,
`CarteraCohetes.tsx`), debajo de "🧪 Forward paper":
- **Cabecera:** valor actual del bolsillo (`eur()`), P&L %, alpha vs SPY, nº de posiciones, badge de la
  última fecha de rebalanceo.
- **Mini-curva SVG a tres bandas** (idea 1): cartera cohetes vs cesta núcleo (última cohorte) vs SPY,
  mismos ejes. Reutiliza el patrón SVG del forward paper.
- **Tenencias actuales** (plegado): por nombre, precio entrada→hoy, P&L, y **badge 🆕 IPO** si
  `esIpo`.
- **Sub-marcador IPO** (idea 2): línea "de los que son recién cotizados: X€ (P&L)", con la nota del
  retrovisor (contexto: hoy mediana +0,8%).
- Empieza **vacía** con mensaje explicativo hasta el primer punto de curva.
- Aparece también en la vista de **invitado** (`/invitado/trading`) porque reutiliza `TradingDashboard`
  (100% lectura, ya exento del gate). Nada que escriba.

### 4.7 Telegram

Extender el digest **semanal** del paper-tracker (`enviarPaperTracker`, lunes 10:00) con un bloque
**🚀 Cartera cohetes**: valor, P&L, alpha vs SPY, riesgo básico, sub-línea IPO, y — cuando el reloj
supere el umbral de madurez (p.ej. ≥6 semanas) — una línea de **veredicto provisional** ("bate/no bate
al SPY ajustado a riesgo"). Es el "aprender = medir": informa, no cambia reglas. Best-effort (sin
datos, sin bloque).

## 5. Idea 3 — hipótesis pre-registrada

Añadir a `docs/TRADING-HIPOTESIS-PREREGISTRO.md` una hipótesis nueva (siguiente Hx libre), firmada HOY,
ANTES de ver datos:
- **Enunciado:** "La cartera cohetes rotatoria (momentum>30% + calidad mala, equiponderada, rebalanceo
  semanal) NO bate al SPY ajustado a riesgo" (hipótesis nula; el experimento intenta refutarla).
- **Sub-hipótesis IPO:** "Los cohetes recién cotizados (`mesesCotizando≠null`) rinden PEOR que los
  veteranos" (lo que dice el retrovisor; la corazonada de Alberto predice lo contrario).
- **Fecha de evaluación:** ~12 semanas (2026-10-15).
- **Criterio de éxito:** mediana/valor de la cartera > SPY, sostenido, con drawdown y tracking error
  razonables. Sin mover la portería después.

## 6. Invariantes / disciplina

- **100% paper.** Ninguna orden real, nunca. No toca IBKR.
- **Selección NO auto-modificable.** El agente ejecuta y mide; cambiar pesos/criterio = decisión de
  Alberto vía pre-registro.
- **Cohetes ≠ núcleo.** No entran en `COHORTES_PAPER` ni en la cesta central.
- **Contexto, nunca filtro.** Igual que el resto de señales del radar.
- **Formato dinero** siempre `eur()` (español, € detrás).
- **Best-effort:** precios/tabla caídos degradan sin romper (patrón del paper-tracker).
- **Multi-tenant:** es data global del laboratorio (como `trading_ranking`), no scoped por `cuenta_id`.

## 7. Componentes — resumen

| Unidad | Qué hace | Depende de |
|---|---|---|
| `carteraCohetes.ts` (módulo puro) | reparto equiponderado + valoración + sub-cesta IPO | nada (puro) |
| `cartera-cohetes-io.ts` | rebalancea/valora/lee, persiste | módulo puro, precios-stooq, prisma, tgSend |
| `trading_cohetes_rebalanceo` / `_track` | libro de rebalanceos + curva diaria | — |
| cron `…-rebalanceo` (L 09:30) | rota la cesta al snapshot semanal | `trading_ranking`, io |
| cron `…-track` (mar-sáb) | punto de curva diario | io |
| `CarteraCohetes.tsx` | sección UI con curva a 3 bandas + IPO | curva persistida |
| bloque en `enviarPaperTracker` | digest Telegram + veredicto provisional | io |
| Hx en `TRADING-HIPOTESIS-PREREGISTRO.md` | criterio firmado antes de datos | — |

## 8. Fuera de v1 (cola)

- Benchmark de **momentum (MTUM)** además del SPY (aísla si la "calidad mala" resta sobre momentum genérico).
- Aviso Telegram de **"pelotazo"** (un cohete cruza +50% / se hunde X%).
- Hit-rate acumulado (cuántos cohetes acaban +50%/3m vs el 13% del retrovisor).
