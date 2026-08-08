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

### ✅ IMPLEMENTADO el mismo día (PR #1318, commit `977d7b2`)

Se aplicó la preferencia condicional descrita abajo. Módulo puro `lib/sivra/pricing-bucket-fuente.ts`
(`elegirBucket`, 8 tests, incluida la garantía de que la preferencia **nunca** deja un bucket vacío);
los dos buckets de `pricing/apply` calculan el percentil dos veces (FILTER por `fuente`) y la
respuesta declara `meses_bucket_fuente`. Verificado a mano contra la BD real, como exige la regla de
`auditoria-central` para cambios de fórmula: **8 buckets cambian**, el resto idénticos —
`house_sevillana` octubre **638 → 728 (+14%)**, `busto_reform` septiembre 129 → 103 (−20%),
`luxury_busto` septiembre 178 → 144 (−19%), noviembre sin cambios en ningún piso.

### Acción recomendada — preferencia condicional, no filtro duro

En `mesRows`/`fechaRows`: calcular el percentil **dos veces** (solo-fiable y mezcla) y usar el
solo-fiable **cuando por sí mismo cumple `MIN_BUCKET`+`MIN_FECHAS_MES`**; si no, la mezcla. Y
**declarar cuál se usó** en la respuesta (`bucket_fuente: 'booking_mcp' | 'mixto'`), porque un
objetivo que no dice de qué corpus sale es indistinguible de uno medido.

Con los datos de hoy eso ya arreglaría sep/oct/nov —los tres meses que se están vendiendo ahora— sin
cegar diciembre en adelante. Es un cambio de fórmula: por la regla de la skill, antes de mergearlo
hay que calcular a mano el precio esperado en 2-3 fechas conocidas y contrastarlo con el código.

---

## 🟢 F2 — El barrido Serper NUNCA ha tenido una pasada buena (YA DIAGNOSTICADO, no era hallazgo nuevo)

`agente_latidos`:

```
sivra_mercado_sweep   ok=false   ultimo_at=2026-08-08 03:04   ultimo_ok_at=NULL
  «162 comps en 60 ventanas (6 de evento) · ⚠️ 6 búsquedas sin resultados»
```

⚠️ **Corrección de esta auditoría (misma fecha, 2ª pasada).** La primera versión pedía «diagnóstico
propio». Era información vieja mía: el caso ya estaba diagnosticado y arreglado ese mismo día en
**PR #1299** («el latido del barrido llevaba rojo desde el día 1 por 1 ventana de 32»), mergeado a
las **11:27 UTC** — es decir, **después** de la pasada de las 03:04 que dejó el latido rojo. Por eso
sigue en rojo: el rojo que se ve es de la última pasada ANTES del fix. La verificación toca en la
pasada del **09/08 03:04 UTC**, tal y como dejó anotado el commit `41325bf`. No hay nada que
diagnosticar; hay que mirar mañana.

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

## 🔴 F5 — El vigía del agente de pricing llevaba desde el 06/08 en verde falso (2ª pasada, ARREGLADO)

Hallado al reconciliar la cobertura de latidos. La sonda `pricing` de
`app/api/cron/agentes-latido/route.ts` medía la frescura sobre `market_rates` con
`scenario LIKE 'prop_%'`. Cuando se eligió esa huella (21/07/2026, tras los **16 días** en que la
Rutina semanal estuvo parada sin que saltara nada) el espacio `prop_*` era **suyo en exclusiva**.
Ya no:

| Quién escribe `scenario = 'prop_*'` | Cadencia | Últimos días |
|---|---|---|
| Rutina semanal de pricing (conectores de viaje) | semanal | — |
| Barrido Serper `mercado/sweep` | **diaria 03:00** | 03,04,05,06,07,08 ago |
| Rutina diaria `mercado-booking` | **diaria** | desde 06/08 |

Con dos escritores diarios en la misma huella, **la sonda sale verde aunque la Rutina lleve semanas
muerta** — exactamente la avería que nació para cazar. Y no se arregla filtrando por
`market_rates.fuente`: la Rutina escribe `booking_mcp`, igual que el conector diario.

**Estado real de la Rutina** (medido por su huella limpia): último ciclo **03/08**, 5,4 días → viva y
dentro de cadencia. El fallo era del vigilante, no del vigilado.

**Arreglado en este PR:** la sonda pasa a `pricing_decisiones.ciclo_at` por piso (min de los max),
que solo escribe `pricing/aplicar-propuesta` — llamado únicamente desde la Rutina (`lib/rutas-rutina.ts`);
el cron diario `apply-auto` escribe en `pricing_applied`, otra tabla. Verificado que la Rutina decide
sobre los **4 pisos** en cada ciclo, así que se conserva la propiedad de delatar medias pasadas.
Mismo cambio en la SQL del heartbeat de `.claude/commands/auditoria-diaria.md`, que tenía la misma
huella falsa.

**Lección, por tercera vez:** una huella no es fiable *para siempre*; deja de serlo el día que otro
proceso empieza a escribir en ella. Al añadir un escritor a una tabla vigilada, hay que preguntarse a
qué sonda le acabas de quitar la vista.

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
- **Tests y compilación** (2ª pasada, 08/08 tarde): **1031/1031** en `apps/plataforma` (incluye 13
  suites de pricing/mercado), **26/26** guardianes de la raíz, **53/53** de `packages/*` (vitest),
  `tsc --noEmit` **0 errores en las 8 apps** (no solo plataforma), `next build` exit 0, lockfile en
  sync, `ignoreCommand` presente en los 8 `vercel.json`, `transpilePackages` cuadra con las deps
  `@central/*` en las 8.
- **Advisors de Supabase** (compartida): 453 lints, **sin ERROR**; 296 INFO `rls_enabled_no_policy` y
  154 WARN de funciones SECURITY DEFINER ejecutables (línea base conocida). Los **16
  `rls_policy_always_true`** que reportaba `docs/AUDITORIA-2026-08.md` ya **no aparecen**.
- **Resto de latidos y crons**: los 12 heartbeats de dominio en ✅ y 7 de los 8 `agente_latidos` en
  verde (el 8º es F2, ya explicado). El auto-merge de PRs de rutinas está vivo (30 runs recientes,
  el último a las 15:04 en verde).

---

## Acciones para Alberto

| # | Acción | Riesgo | Quién |
|---|---|---|---|
| 1 | Abrir `*.vercel.app` en la política de red del environment de Claude Code | nulo | Alberto |
| 2 | Mergear **PR #1318** (F1 + F5 + fallo mudo del plan) | medio — F1 es cambio de fórmula, ya verificado a mano contra la BD | Alberto |
| 3 | Verificar el 09/08 que la pasada 03:04 del sweep deja `ultimo_ok_at` (F2, fix #1299 ya en prod) | bajo | rutina diaria |
| 4 | Seguir acumulando cobertura Booking de dic→abr (depende de 1) | bajo | rutina diaria |
| 5 | Revisar el pendiente que trae el PR **#1320**: `occ` en `apply/route.ts` no acota `rate_date` por arriba → una sola ocupación para los 365 días | medio | Alberto decide |

**A producción no se ha aplicado nada directamente.** Todo va en el **PR #1318**: el arreglo del
fallo mudo del endpoint (F4), la preferencia de fuente del bucket (F1, cambio de fórmula) y el
arreglo del vigía enmascarado (F5).

---

## Nota de método — dos correcciones de esta misma auditoría

Esta segunda pasada corrigió **dos afirmaciones mías** de la primera:

1. **F2 no era un hallazgo**, era información vieja: ya estaba diagnosticado y arreglado en #1299 el
   mismo día, horas antes de que yo lo escribiera.
2. El apartado «lo que SÍ está bien» daba por buena una cobertura de latidos que **no lo estaba**
   (F5): había mirado que los latidos estuvieran verdes, no si el verde significaba algo.

Van escritas aquí a propósito. Las dos son la misma clase de error que persigue la regla «dato que
NO hay ≠ dato que NO se ha mirado» de `CLAUDE.md`, aplicada esta vez a la auditoría misma: un verde
sin comprobar de dónde sale es indistinguible de un verde de verdad.
