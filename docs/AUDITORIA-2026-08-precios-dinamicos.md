# Auditoría — cadena de precios dinámicos de SIVRA (08/08/2026)

**Alcance pedido por Alberto:** «que todo lo relacionado con precios dinámicos esté 100% OK».
Cubre: corpus `market_rates` (fuentes `serper`/`booking_mcp`/`manual`, `corpus_clonado`), buckets del
motor (`pricing/apply`), raíles de escritura (`aplicar-propuesta`), alimentadores (sweep Serper +
rutina Booking) y sus latidos.

**Veredicto corto: NO está al 100%.** Los raíles de seguridad y los tests están sanos; el problema
está en la ENTRADA — el bucket mensual mezcla dos fuentes de calidad muy distinta y eso mueve el
precio objetivo hasta un **±28%** medido hoy. No es un bug de código: es una decisión consciente
(documentada) cuyo coste no se había cuantificado hasta ahora.

---

## 🔴 F1 — El bucket mensual mezcla Serper con Booking, y el desvío es material

`app/api/sivra/pricing/apply/route.ts` excluye `corpus_clonado` en los dos buckets (mes y fecha),
pero **no filtra por `fuente`**. Como los precios de Serper son de ANUNCIO y no distinguen la fecha
(landmine documentado el 06/08), el percentil del mes sale de una mezcla.

Medido hoy replicando EXACTAMENTE la consulta del motor (misma normalización por aforo, misma
exclusión de eventos de `pricing_eventos_auto` + calendario del repo, misma ventana de 120 días):

| Piso | Mes | p50 Serper | p50 Booking | **p50 del motor** | Desvío vs Booking |
|---|---|---|---|---|---|
| `luxury_busto` | 2026-09 | 205 | 144 | **178** | **+24%** |
| `busto_reform` | 2026-09 | 142 | 102 | **120** | **+18%** |
| `busto_reform` | 2027-04 | 302 | 186 | **238** | **+28%** |
| `house_sevillana` | 2026-10 | 560 | **728** | **636** | **−13%** |
| `busto_reform` | 2026-10 | 148 | **174** | **158** | **−9%** |
| `luxury_busto` | 2026-10 | 254 | **282** | **259** | **−8%** |

Va en las **dos direcciones**, y la peligrosa es la segunda: en **octubre —el mejor mes de Sevilla—
Serper tira el bucket hacia ABAJO** porque sus precios de anuncio son más baratos que el mercado real
de esas fechas. Es literalmente la queja histórica del repo («octubre salía al precio medio de
enero»), pero ahora con la causa medida.

### Por qué NO se arregla filtrando hoy

Fechas NO-evento con fuente fiable disponibles ahora mismo (umbral del motor: `MIN_FECHAS_MES = 3`):

| Mes | fechas Booking | ¿elegible solo con Booking? |
|---|---|---|
| 2026-09 · 10 · 11 | 3 · 3 · 5 | ✅ |
| 2026-08 · 12 · 2027-01 | 2 · 2 · 2 | ❌ |
| 2027-02 · 03 · 04 | 1 · 1 · 1 | ❌ |
| 2027-05 · 06 · 07 | 0 | ❌ |

Filtrar el bucket a `booking_mcp` **hoy** dejaría 5 de 9 meses sin bucket → caerían al ancla global,
que es peor. La advertencia del repo («no apagues Serper todavía») sigue vigente.

### Acción recomendada — preferencia condicional, no filtro duro

En `mesRows`/`fechaRows`: calcular el percentil **dos veces** (solo-fiable y mezcla) y usar el
solo-fiable **cuando por sí mismo cumple `MIN_BUCKET`+`MIN_FECHAS_MES`**; si no, la mezcla. Y
**declarar cuál se usó** en la respuesta (`bucket_fuente: 'booking_mcp' | 'mixto'`), porque un
objetivo que no dice de qué corpus sale es indistinguible de uno medido.

Con los datos de hoy eso ya arreglaría sep/oct/nov —los tres meses que se están vendiendo ahora— sin
cegar diciembre en adelante. Es un cambio de fórmula: por la regla de la skill, antes de mergearlo
hay que calcular a mano el precio esperado en 2-3 fechas conocidas y contrastarlo con el código.

---

## 🟡 F2 — El barrido Serper NUNCA ha tenido una pasada buena

`agente_latidos`:

```
sivra_mercado_sweep   ok=false   ultimo_at=2026-08-08 03:04   ultimo_ok_at=NULL
  «162 comps en 60 ventanas (6 de evento) · ⚠️ 6 búsquedas sin resultados»
```

`ultimo_ok_at` en NULL significa que **desde que existe el latido no ha habido ni una pasada que el
propio agente considere fiable**. Y es justo la fuente que hoy domina el bucket (F1). Merece
diagnóstico propio: o el criterio de `barridoFiable` es demasiado estricto, o el barrido lleva
semanas entregando corpus que él mismo no se cree.

(`sivra_mercado_booking` sí está en verde: `ok=true`, `ultimo_ok_at` de hoy 12:59.)

---

## 🟡 F3 — Cobertura fiable corta de diciembre en adelante

Con fuente fiable: dic-26 y ene-27 tienen 2 fechas, feb/mar/abr-27 tienen 1, y may/jun/jul-27
**ninguna**. Esos meses se tarifican con el ancla global. No es un fallo — es el estado de la
acumulación — pero conviene saber que **la temporada de 2027 hoy no está medida**, y que las 20
ventanas que esta sesión no pudo medir (403 de red) iban justo ahí.

---

## 🟢 F4 — `?max=abc` devolvía cero ventanas en silencio (ENCONTRADO Y ARREGLADO)

Hallado en esta auditoría, en el endpoint del plan: `Number('abc')` → `NaN` →
`slice(0, NaN)` → `[]`. Una pasada con el tope mal escrito no medía nada y lo reportaba como «no
había ventanas», con `recortadas: NaN`. Arreglado en **PR #1318** (parseo extraído a helper puro +
7 tests). Misma clase de fallo mudo que el resto del capítulo.

---

## 🟢 Lo que SÍ está bien (verificado, no asumido)

- **Raíles de escritura** (`aplicar-propuesta`): suelo de coste (`min_price`), tope ±`max_change_pct`
  por día contra el precio actual, techo del propietario, y **circuit-breaker medido sobre la
  propuesta CRUDA** (intención del agente) antes del tope — 800 fechas / 60% de desvío medio y aborta
  sin escribir nada. Aunque el corpus viniera envenenado, el radio de daño por pasada está acotado.
- **`corpus_clonado` se aplica en los DOS buckets** (mes y fecha exacta), no solo en uno.
- **Exclusión de eventos correcta.** Comprobado explícitamente: Semana Santa 2027 (21-28 mar) SÍ está
  en el calendario del repo con factores 2,2-3,2, así que no contamina el bucket de marzo.
  ⚠️ *Nota de método:* mi primera consulta no replicaba la exclusión de eventos y daba marzo-27 a
  1.280€/noche contra 589€ reales. **Era un falso positivo mío, no un fallo del motor.** Queda aquí
  escrito porque una auditoría que solo publica lo que confirma no enseña dónde se equivoca.
- **Normalización por aforo** (`pricing_factor_aforo`) presente en ambos buckets.
- **Tests y compilación**: 1023/1023 en `apps/plataforma` (incluye 12 suites de pricing/mercado),
  26/26 guardianes de la raíz, `tsc --noEmit` 0 errores, `next build` exit 0.

---

## Acciones para Alberto

| # | Acción | Riesgo | Quién |
|---|---|---|---|
| 1 | Abrir `*.vercel.app` en la política de red del environment de Claude Code | nulo | Alberto |
| 2 | Decidir sobre F1 (preferencia condicional de fuente en el bucket) | medio — cambio de fórmula, exige verificación a mano | Alberto decide, yo implemento |
| 3 | Diagnosticar F2 (`sivra_mercado_sweep` sin ninguna pasada buena) | bajo | yo, si lo pides |
| 4 | Seguir acumulando cobertura Booking de dic→abr (depende de 1) | bajo | rutina diaria |

**Nada de esto se ha aplicado a producción en esta auditoría** salvo el PR #1318, que es el arreglo
del fallo mudo del endpoint y no toca la fórmula.
