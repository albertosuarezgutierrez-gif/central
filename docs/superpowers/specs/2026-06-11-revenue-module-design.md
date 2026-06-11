# Módulo de Revenue Management (`@central/module-revenue`) + auto-ajuste de pricing en SIVRA

> Diseño (spec) — 2026-06-11. Brainstorming con Alberto.
> Estado: pendiente de revisión del propietario antes de pasar al plan de implementación.

## 1. Objetivo

Un **agente de análisis de demanda + auto-ajuste de precios** para los pisos turísticos de SIVRA,
construido como **módulo portable y multisector** para poder venderlo y reusarlo en otras verticales
(ia-rest → estimación de ventas/cubiertos, ialimp → demanda de limpiezas).

La idea nace de una hipótesis del propietario ("los domingos hay más reservas → subir precio los
domingos"): el sistema debe **medir ese patrón con datos reales** en vez de fijarlo a ojo, y, si es
real, **calibrar solo** los factores del motor de precios dentro de límites que el dueño controla.

## 2. Decisiones tomadas (bloqueadas en brainstorming)

- **Alcance:** análisis **+ auto-ajuste** (no solo cuadro de mando).
- **Autonomía:** *auto dentro de límites + freno*. El agente aplica ajustes solo dentro de rangos
  seguros que fija el dueño, SIEMPRE bajo los topes min/max de precio; avisa de cada cambio y se
  puede revertir/pausar al instante.
- **Palancas:** día de la semana · ritmo de venta/antelación (pickup & lead time) · estacionalidad
  por mes. Canal/ingresos = **solo análisis** (el precio base de Smoobu es por piso, no por canal).
- **Arquitectura:** módulo **puro y agnóstico de dominio** (`packages/module-revenue`, patrón
  `module-concursos`/`module-contabilidad`: TS puro, sin BD, sin red, sin secretos). Cada vertical lo
  cablea con sus datos. El *ejecutor de precios* (escribir en Smoobu) NO es portable: vive en cada app.
- **Adaptable 100% + supervisable:** todo configurable **por dueño y por piso**; **override manual
  siempre gana**; panel de supervisión donde el dueño ve, aprueba, edita, revierte y pausa.
- **Extras incluidos (los 4):** backtest "¿qué habrías ganado?", confianza por palanca/piso
  (supervisado vs auto), "explica por qué", presets de arranque (Conservador/Equilibrado/Agresivo).
- **Nombre/scope:** renombrar TODO el monorepo de `@iarest/*` a `@central/*` **primero**
  (sub-proyecto 0), y crear el módulo ya como `@central/module-revenue`.

## 3. Sub-proyecto 0 (PREREQUISITO) — renombrado de scope `@iarest/*` → `@central/*`

Mecánico pero de radio amplio. **PR propio, verificado con las 4 apps en verde antes de seguir.**

Alcance:
- `name` de cada `packages/*/package.json`: `@iarest/x` → `@central/x`.
- Todos los `import`/`require` de `@iarest/*` en `apps/*` y `packages/*`.
- Las deps (`@iarest/core-push`, etc.) en cada `package.json` consumidor (`workspace:*` se mantiene).
- `transpilePackages` y cualquier referencia en `next.config.*`/`tsconfig`.
- Regenerar `pnpm-lock.yaml`.

Verificación: `next build` (o `tsc --noEmit` + build) verde en **ia-rest, ialimp, sivra, plataforma**;
grep de `@iarest/` en el repo = 0 (salvo notas históricas en docs). Reversible (es un rename atómico).

Nota: el repo de GitHub sigue llamándose `ia.rest`; el rename de scope npm no obliga a renombrar el
repo, pero alinea el código con el nombre `central`.

## 4. Contrato del módulo `@central/module-revenue`

TS puro, determinista, testeable en aislamiento. No conoce Smoobu ni "pisos": solo eventos, capacidad
y fechas.

### 4.1 Tipos de entrada

```ts
// Un evento de demanda: una reserva, una mesa, un servicio…
interface DemandEvent {
  unitId: string          // qué recurso (piso, sala, etc.)
  createdAt: Date         // cuándo se creó la reserva (pickup / lead time)
  start: Date             // inicio del periodo de uso (check-in / fecha)
  end?: Date              // fin (check-out); puntual si se omite
  value: number           // importe (ADR / RevPAR)
  quantity?: number       // unidades consumidas (noches, cubiertos); si falta, se deriva de start..end
  channel?: string        // canal/portal
  status?: 'confirmed' | 'cancelled'  // excluir canceladas
}

// Capacidad/ocupación por unidad y fecha.
interface CapacitySlot {
  unitId: string
  date: Date
  capacity: number        // aforo (1/noche para un piso)
  used: number            // ocupado (1 - available)
}

interface AnalysisConfig {
  today: Date
  timezone: string
  minSample: number       // muestra mínima para recomendar (guardia)
  // ventanas de análisis, etc.
}
```

### 4.2 Funciones expuestas (puras)

- `occupancyByDow(slots, cfg)` → ocupación por día de la semana + **nº de muestras + confianza**.
- `seasonalityByMonth(slots, cfg)` → índice por mes (1.0 = media anual).
- `pickupCurve(events, targetPeriod, cfg)` → reservas acumuladas por "días antes" (curva de venta).
- `leadTimeStats(events, cfg)` → antelación media/mediana/percentiles.
- `paceVsBaseline(events, period, baseline, cfg)` → % por delante/detrás vs mismo punto del periodo base (YoY).
- `channelMix(events, cfg)` → reparto por canal + ADR por canal.
- `revenueKpis(events, slots, cfg)` → ADR, RevPAR, ocupación global, ingresos.
- `recommendFactors(inputs, bounds, cfg)` → **capa de recomendación**: factores multiplicativos por
  día-de-semana (`dow[7]`) y por mes (`month[12]`), cada uno con confianza + muestra, **ya recortados a
  `bounds`**. Devuelve explícitamente "no recomiendo (datos insuficientes)" bajo el mínimo de muestra.
- `backtest(rule, events, slots, cfg)` → estima el € extra (o noches llenadas) que la regla habría
  producido sobre el histórico del propio dueño.

**Guardia de muestra mínima en todo:** nunca recomienda desde ruido (p.ej. 3 datos sueltos → no toca nada).

## 5. Cableado en SIVRA (la app)

### 5.1 Adapters (traducen SIVRA → contrato del módulo)
- `incomes` → `DemandEvent[]` (createdAt; checkIn→start; checkOut→end; nights→quantity; amount→value;
  portal→channel; excluir canceladas).
- `rate_snapshots` → `CapacitySlot[]` (property→unit; rate_date→date; capacity=1; used=1−available).
- `market_rates` → contexto de mercado para backtest y alarma de "dinero perdido".

### 5.2 Almacenamiento (tablas nuevas en BD SIVRA — no tocan nada compartido con ialimp)
- `revenue_config` (por dueño/piso): palancas activas, **modo por palanca** (supervisado/auto),
  límites (p.ej. DOW ±15%), preset elegido, umbrales de muestra/confianza.
- `revenue_factors` (por piso): `dow_factor[7]`, `month_factor[12]`, con `source` (auto/manual),
  `confidence`, `sample_n`, `active`, `updated_at`. **El motor de precios los lee.**
- `revenue_factor_changes` (auditoría): cada cambio propuesto/aplicado/revertido + justificación.

### 5.3 Integración con el motor de precios (`api/pricing/apply`)
Los factores entran como **un multiplicador más** en la cadena, **después** del ancla de mercado y del
`eventFactor`, y **antes** de los topes min/max del propietario. Consecuencia clave: **nada puede
saltarse min/max** (autoridad final intacta). Override manual de un factor gana sobre el auto.

### 5.4 Crons
- **Semanal:** recalcular análisis → `recommendFactors` → según modo de cada palanca: aplica (auto,
  dentro de límites) o deja **pendiente de aprobar** (supervisado) → audita + notifica (digest).
- **Diario:** monitor de pace/alertas + alarma de "dinero perdido" (Fase 3).

### 5.5 UI de supervisión (`/revenue`, o sección en `/pricing-auto`)
- KPIs: ocupación por día (mapa de calor), pickup, antelación, canal, RevPAR, YoY.
- Tabla de factores activos (auto/manual + historial + **revertir**).
- Bandeja de **pendientes de aprobar** (modo supervisado).
- Ajustes por dueño/piso: límites, modo por palanca, preset.
- **Backtest**: "simular regla → +X€ / +Y noches" sobre datos propios.
- **"Explica por qué"** en cada recomendación (lenguaje natural + muestra + confianza).
- Notificaciones reutilizando `core-email` + push (`lib/pricing-notify`): resumen semanal + alertas.

## 6. Modelo de seguridad ("no puede fallar")
- Factores siempre **bajo min/max** (multiplicador intermedio, nunca salta los topes).
- **Override manual gana**; pausa global ya existente (`pricing_config.paused`) aplica también aquí.
- Todo cambio **auditado y reversible**.
- El módulo solo recomienda **dentro de los límites del dueño** y con **guardia de muestra**.
- Por palanca y por piso, el dueño elige **supervisado** (propone→aprueba) o **auto** (dentro de límites).

## 7. Adaptabilidad por dueño (requisito de producto)
Todo lo configurable vive en `revenue_config` por dueño/piso: nada hardcodeado. Presets
(Conservador/Equilibrado/Agresivo) pre-rellenan límites y umbrales; luego cada dueño afina. El módulo
recibe la config como parámetro (`bounds`, `AnalysisConfig`), no la conoce de antemano.

## 8. Extras (los 4)
1. **Backtest "¿qué habrías ganado?"** — `module.backtest()` sobre el histórico del dueño; se muestra
   antes de activar cualquier regla. Argumento de venta y validación con dinero real.
2. **Confianza por palanca y por piso** — supervisado vs auto, granular, en `revenue_config`.
3. **"Explica por qué"** — cada recomendación con justificación legible + números.
4. **Presets de arranque** — onboarding en 1 clic, sin perder adaptabilidad.

## 9. Fases de entrega
- **Fase 1 — Análisis (solo lectura):** módulo (analítica + KPIs) + adapters + panel `/revenue` +
  digest semanal. Aquí se **valida la hipótesis del domingo** sin tocar precios.
- **Fase 2 — Auto-ajuste robusto:** `recommendFactors` (día-semana + estacionalidad) + tablas
  `revenue_config`/`revenue_factors`/`revenue_factor_changes` + integración en `apply` + ejecutor
  semanal (supervisado/auto + límites + freno + auditoría) + **backtest** + **presets** + **explica por qué**.
- **Fase 3 — Palancas finas:** ritmo/antelación, **min-stay** (API de Smoobu) y **alarma de "dinero
  perdido"** (noches vendidas baratas vs mercado / noches vacías por precio o estancia mínima alta).

## 10. Testing
- **Módulo:** tests unitarios deterministas con fixtures (patrón de los 28 de `module-concursos`):
  muestra insuficiente → no recomienda; DOW/estacionalidad conocidos; pickup; lead time; recorte a
  límites; backtest sobre serie sintética.
- **SIVRA:** tests de adapters (mapeo correcto, excluir canceladas, expandir noches start..end) y de la
  cadena de precios (los factores **nunca** hacen saltar min/max).

## 11. Fuera de alcance (YAGNI, por ahora)
- Pricing por canal (el base de Smoobu es por piso).
- Datos de ocupación de la competencia (solo tenemos nuestras reservas + precios de mercado).
- ML/forecast complejo: la v1 usa estadística transparente y explicable, no cajas negras.
- Renombrar el repo de GitHub (`ia.rest`): el rename es solo del scope npm.

## 12. Orden de ejecución
1. **Sub-proyecto 0:** rename `@iarest`→`@central` (PR propio, 4 builds verdes).
2. **Fase 1**, **Fase 2**, **Fase 3** del módulo + cableado SIVRA (cada fase, su PR).
