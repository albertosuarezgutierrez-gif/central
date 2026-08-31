# 📉 Informe de reglas de SALIDA del sistema de trading

> **Qué es esto:** el registro vivo de lo medido sobre CUÁNDO vender. Lo abre la resolución de H9
> (08/08/2026) y lo continúa H10 (firmada 28/08/2026). Las hipótesis y sus criterios de cableado
> viven en `TRADING-HIPOTESIS-PREREGISTRO.md`; **aquí van los NÚMEROS**, con su fecha y su muestra.
>
> **Cómo se actualiza:** el cron semanal `trading-h10` (`/api/cron/trading-h10`) recalcula la tabla
> sobre el corpus `trading_backtest` y avisa por Telegram cuando una variante cumple —o cuando todas
> fallan— el criterio firmado. La tabla de abajo se re-anota en cada hito, **añadiendo** una entrada
> fechada; no se reescriben las anteriores.

## Estado actual: la salida por TIEMPO sigue ganando — H10 RESUELTA (31/08/2026)

### Medición del 31/08/2026 — ciclo de H10 completo, n = 183.093 · ✅ RESOLUCIÓN

Las cuatro variantes de H10 completaron su ciclo (183.093 obs.; 180.628 en `salidaSma200`, que exige
más historia para la media) y **ninguna de las siete cumple el criterio firmado**. Cifras del cron
`trading-h10` del 31/08 (08:41 UTC), recomputadas a mano contra `trading_backtest` el mismo día:
cuadran al dígito. Referencia (salida por tiempo): mediana **+3,12%** · batacazos **10,26%**.

| regla | mediana a 91 d | batacazos ≤ −15% | Δ mediana | Δ batacazos |
|---|---|---|---|---|
| **salida por tiempo (91 días)** | **+3,12%** | 10,26% | — | — |
| trailing −25% (`salidaTrail25`) | +2,74% | 12,91% | −0,38 pp | +2,65 pp |
| stop a coste tras +10% (`salidaCoste10`) | +1,24% | 8,87% | −1,88 pp | −1,39 pp |
| cierre < SMA50 (`salidaSma50`) | −0,71% | **0,77%** | −3,83 pp | −9,49 pp |
| cierre < SMA200 (`salidaSma200`) | −0,22% | 3,34% | −3,35 pp | −6,79 pp |
| stop fijo −10% (`salidaStop10`) | +0,45% | 2,90% | −2,67 pp | −7,36 pp |
| stop fijo −20% (`salidaStop20`) | +2,75% | 14,86% | −0,37 pp | +4,60 pp |
| trailing −15% (`salidaTrail15`) | +1,22% | 10,72% | −1,90 pp | +0,46 pp |

El patrón es estructural: **toda regla que de verdad frena los batacazos (Sma50, Sma200, Stop10) paga
más de 1 pp de mediana** — cortar la cola mala corta también la recuperación — y las que respetan la
mediana no frenan nada. `salidaSma50` es el ejemplo extremo: deja los batacazos en 0,77% (el mayor
freno medido nunca) a cambio de una mediana NEGATIVA. Por la cláusula de cierre firmada, **la salida
por tiempo queda validada por segunda vez** y no se cablea nada nuevo (ya vende por tiempo desde el
28/08, `venceVentana`). Detalle del veredicto por variante en el pre-registro
(`TRADING-HIPOTESIS-PREREGISTRO.md`, «✅ RESOLUCIÓN de H10»).

### Medición del 28/08/2026 — n = 183.093 observaciones

Corpus `trading_backtest` (1.256 símbolos × ~178 fechas, punto-en-el-tiempo, sin look-ahead).
Solo las observaciones con `ret91` **y** las tres salidas de H9 presentes.

| regla | mediana a 91 d | batacazos ≤ −15% |
|---|---|---|
| **salida por tiempo (91 días)** | **+3,12%** | 10,26% |
| stop fijo −10% | +0,45% | **2,90%** |
| stop fijo −20% | +2,75% | 14,86% |
| trailing −15% | +1,22% | 10,72% |

**Es 8,6× la muestra con la que se resolvió H9** (21.321 obs. el 08/08/2026) y el veredicto no se
mueve: ninguna regla cumple el criterio firmado.
- **stop −10%:** recorta batacazos 7,36 pp (≥5 pp ✅) pero cede **2,67 pp de mediana**, y el perfil
  freno solo permitía ceder 1. Rechazado por su propia condición.
- **stop −20% y trailing −15%:** empeoran la mediana **y** suben los batacazos. Peor por los dos lados.

### Partido por quintil de momentum — el caveat de H9, refutado

H9 firmó como caveat que «la literatura dice que los stops AYUDAN en momentum y ESTORBAN en
reversión». El agente compra momentum, así que el agregado del universo no bastaba. Medido:

| quintil de momentum | tiempo | stop −10% | trailing −15% |
|---|---|---|---|
| Q1 (más flojo) | **+3,86%** | −2,97% | −0,27% |
| Q2 | **+2,94%** | +1,08% | +1,68% |
| Q3 | **+2,89%** | +1,55% | +1,98% |
| Q4 | **+2,90%** | +1,38% | +1,81% |
| **Q5 (lo que compra el agente)** | **+3,26%** | −1,17% | +0,17% |

La salida por tiempo gana la mediana **en los cinco quintiles**, y en Q5 el stop es donde MÁS cuesta
(−4,43 pp). En este universo el caveat no se cumple. ⚠️ Corte **post-hoc**: cierra el caveat, no
autoriza a cablear nada por sí solo.

## Lo que medía H10 (firmada 28/08/2026 — ✅ RESUELTA el 31/08/2026, ver arriba)

H9 probó **una** distancia de trailing y **ninguna** regla de medias. Cuatro variantes nuevas,
recolectándose desde el 28/08/2026 por el mismo cron del retrovisor (`trading-backtest`, rota por
símbolo cada 2 h — el ciclo completo tarda días):

| campo | regla |
|---|---|
| `salidaTrail25` | trailing ANCHO: primer cierre ≤ máximo-desde-entrada × 0,75 |
| `salidaCoste10` | stop a COSTE: sin stop hasta tocar +10%; después, primer cierre ≤ entrada |
| `salidaSma50` | pérdida de media: primer cierre < SMA50 diaria |
| `salidaSma200` | pérdida de media larga: primer cierre < SMA200 diaria |

Criterio de cableado (idéntico al de H9, sobre ≥5.000 observaciones): recortar batacazos ≥5 pp sin
ceder más de 1 pp de mediana, **o** mejorar la mediana ≥2 pp sin subir los batacazos.

## 🕰️ H12 (28/08/2026) — la cinta se corta en el día 91, y eso NO es «aguantar sale peor»

Idea de Alberto: *«que una vez vendida siga analizando esa acción… por si vemos algo mejor de lo que
tenemos»*. Al ir a mirarlo apareció un límite de la propia medición que conviene tener escrito:

**Todo lo de arriba termina en el día 91.** `ret28/56/91` y las siete reglas de `salidas.ts` —que
cuando no disparan se rellenan con el retorno del horizonte— viven dentro de esa ventana. Así que
«la salida por tiempo gana» es cierto **entre las reglas medidas y dentro de 91 días**; que aguantar
182 o 364 días sea mejor o peor **nunca se ha mirado**. 91 es el TECHO de la medición, no un ganador
frente a horizontes que no se probaron.

Desde hoy el retrovisor recoge también (`apps/plataforma/lib/trading/continuacion.ts`, puro y testeado):

| campo | qué mide |
|---|---|
| `ret182` / `ret364` | retorno desde la MISMA entrada a horizontes largos |
| `mfe364` / `mae364` | techo y suelo desde la entrada dentro de la ventana larga |
| `diasMfe364` | cuándo se tocó el techo — distingue «vendimos pronto» de «vendimos tarde» |
| `tendenciaVivaAlSalir` | al cerrar el día 91, ¿el precio seguía sobre su SMA50? |

El **arrepentimiento no se guarda, se deriva**: como todas las reglas miden desde la misma entrada,
`ret364 − salidaX` es exactamente lo que costó vender por la regla X en vez de aguantar.

**Números: todavía ninguno.** El corpus se rellena símbolo a símbolo cada 2 h y la ventana de 364
días solo existe para los snapshots con más de un año de vida. Criterios de cableado (dos, uno por
pregunta) y caveats — ventanas solapadas, muestra desplazada hacia atrás — firmados en
`TRADING-HIPOTESIS-PREREGISTRO.md` **antes** de ver un solo retorno largo.

## 🚨 El stop que está VIVO en el paper y no lo mide ninguna hipótesis

`packages/module-trading/src/paper.ts` abre cada posición con un stop fijo a `entrada − 2·ATR14` y
`/api/trading/puntuar` lo evalúa cada noche — pese a que H9 concluyó literalmente «**No se ponen
stops**». Estado a 28/08/2026: **11 BUY y 0 SELL** en `trading_paper_orden`; ningún stop ha saltado
todavía, así que el daño hasta hoy es **cero**. Es una mina sin pisar, no un agujero.

No depende de H10: se rige por H9, que ya está resuelta. Y la salida por tiempo que el pie de
«Cartera paper» promete **no está implementada** — la única salida del código es ese stop.
**Pendiente de decisión de Alberto.**
