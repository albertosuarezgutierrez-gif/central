# `@central/module-revenue` Fase 1 (paquete puro de analítica) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar tarea a tarea. Pasos con checkbox (`- [ ]`).

**Goal:** Crear el paquete puro `@central/module-revenue` con las funciones de análisis de demanda (ocupación por día de semana, estacionalidad, lead time, pickup, pace YoY, mix de canal y KPIs), testeadas en aislamiento.

**Architecture:** Patrón `module-concursos`: TS puro, `type: module`, `node --test` con type-stripping de Node 22, sin BD/red/secretos. Entradas = `DemandEvent[]` y `CapacitySlot[]`. Salidas = métricas con guardia de muestra. El cableado en SIVRA (adapters, panel `/revenue`, cron) es un plan aparte (Fase 1b).

**Tech Stack:** TypeScript puro, `node --test`.

---

## Estructura de ficheros
- `packages/module-revenue/package.json` — paquete `@central/module-revenue`.
- `packages/module-revenue/tsconfig.json` — igual que module-concursos.
- `packages/module-revenue/src/types.ts` — `DemandEvent`, `CapacitySlot`, `AnalysisConfig`, tipos de salida.
- `packages/module-revenue/src/util.ts` — helpers de fecha (dow, monthKey, eachDate, daysBetween, percentil).
- `packages/module-revenue/src/occupancy.ts` — `occupancyByDow`, `seasonalityByMonth`.
- `packages/module-revenue/src/demand.ts` — `leadTimeStats`, `pickupCurve`, `paceVsBaseline`.
- `packages/module-revenue/src/revenue.ts` — `channelMix`, `revenueKpis`.
- `packages/module-revenue/src/index.ts` — re-exporta todo.
- `packages/module-revenue/test/revenue.test.ts` — tests con fixtures deterministas.

## Task 1: Scaffold del paquete
- [ ] Crear `package.json`, `tsconfig.json`, `src/types.ts`, `src/index.ts` (vacío de re-exports al principio).
- [ ] Commit.

## Task 2: util.ts (helpers de fecha + percentil) con tests
- [ ] Tests de `dow`, `monthKey`, `eachDate`, `daysBetween`, `percentile`.
- [ ] Implementar; `node --test` verde; commit.

## Task 3: occupancy.ts (occupancyByDow, seasonalityByMonth)
- [ ] Tests con fixture de `CapacitySlot[]` con patrón conocido (domingos llenos).
- [ ] Implementar con guardia `minSample`; verde; commit.

## Task 4: demand.ts (leadTimeStats, pickupCurve, paceVsBaseline)
- [ ] Tests con `DemandEvent[]` (antelación conocida, curva de pickup, pace vs baseline).
- [ ] Implementar; verde; commit.

## Task 5: revenue.ts (channelMix, revenueKpis)
- [ ] Tests (reparto de canal, ADR, RevPAR, ocupación global).
- [ ] Implementar; verde; commit.

## Task 6: index.ts + verificación final
- [ ] Re-exportar todo; `npm test` del paquete verde; commit.

## Self-review
- Cobertura: las 7 funciones de la Sección 4.2 de la spec (salvo `recommendFactors`/`backtest`, que son Fase 2). ✓
- Sin placeholders; cada función con su test. ✓
- Tipos consistentes entre `types.ts` y las implementaciones. ✓

## Siguiente (planes aparte)
- **Fase 1b:** cableado SIVRA — adapters (`incomes`/`rate_snapshots`→tipos del módulo), endpoint de lectura, panel `/revenue`, digest semanal.
- **Fase 2:** `recommendFactors` + `backtest` + tablas + integración en `apply` + ejecutor.
