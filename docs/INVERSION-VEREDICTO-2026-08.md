# ¿Dónde renta de verdad el capital? — veredicto 12/08/2026

> Pregunta de Alberto: *«¿es rentable coger toda la cuenta y hacer operativa intradía ganando
> 1/2%? ¿y con cruces de medias? ¿alguna idea más? hay que buscar la inversión más rentable»*.
>
> Este documento cierra las tres preguntas con datos medidos, no con opinión. Se escribe porque
> el repo ya tiene la costumbre de dejar por escrito **lo que se ha refutado y por qué**
> (H8, H9 en `TRADING-HIPOTESIS-PREREGISTRO.md`), y para que ni Alberto ni el agente vuelvan a
> litigarlo desde cero.

> **🔁 Re-verificado el 13/08/2026 contra las fuentes vivas. El veredicto NO cambia** —
> si acaso se refuerza. Pero **siete cifras publicadas estaban mal** y se corrigen aquí:
> esperanza por operación (−172 $ → **−162 $**), Kelly (−47,6% → **−44,7%**), porcentaje de
> operaciones intradía (39% → **61%**), SPY YTD (+11,4% → **+13,3%**), el recuento de *day
> trades* del apartado PDT, las cifras de `subastas_radar` (se movieron) y la tabla del backtest
> de medias (se rehízo con el método escrito, ver §3). Tres de ellas se contradecían con las
> propias tablas de este documento. **Lo que un doc de referencia no puede permitirse es que sus
> números no se puedan re-derivar**, así que los scripts de re-cálculo se describen en
> *Reproducir este estudio*. Lo re-derivado y lo que NO, al final del documento.

**Resumen en una línea:** el intradía y los cruces de medias tienen esperanza negativa medida;
la inversión más rentable disponible hoy no está en los mercados, está en la comisión del
19,72% que Booking cobra sobre el 92% de la facturación de los pisos.

---

## 1. La aritmética del objetivo

| Objetivo | Anualizado (252 sesiones) | Sobre 32.420 € |
|---|---|---|
| 0,5%/día | ×3,5 → **+251%** | 162 €/día → 113.936 € en un año |
| 1%/día | ×12,3 → **+1.127%** | 324 €/día → 397.923 € en un año |

Referencia: Medallion, el mejor fondo cuantitativo de la historia, hace ~66% bruto anual. Un
0,5% diario sostenido sería ~4× Medallion. Además, un objetivo **fijo por día** obliga a operar
los días sin oportunidad — que es exactamente donde se pierde el dinero.

## 2. Qué pasó cuando ya se hizo (ejecuciones reales, no simulación)

Fuente: IBKR MCP, `get_account_trades` YTD (227 ejecuciones) y `get_pa_performance_all_periods`.
**Validación de que son reales:** la pérdida de PLTR+SPCX del 10/08 suma **−1.113,87 $**, cifra
idéntica a la anotada a mano en `CONTEXTO-SESIONES.md:160`.

**Cuenta** (datos al 13/08/2026)
- YTD 2026 (TWR): **−33,9%** · 1 año: −30,0% · máx. drawdown pico‑valle: **−35,3%**
- NAV: 49.118 € (31/12/2025) → **32.461 €** (hoy, 100% liquidez, **0 posiciones** — verificado)
- Volatilidad anualizada 31,7% · Sharpe **−1,98** (ambos de la ficha de IBKR, no re‑derivados aquí)
- Para volver al punto de partida hace falta **+51,3%**

**Operaciones (116 cierres)**
- Acierto **17,2%** (20 de 116) · profit factor **0,28** (+7.235 $ / −25.981 $)
- Realizado **−18.746 $**, y **los 7 meses operados en 2026 son negativos**, sin excepción
- Comisiones 165 $ = **0,9% de la pérdida** → el problema no son los costes, es la dirección
- Esperanza por operación **−162 $** (−18.746 $ / 116) · Kelly óptimo **−44,7%** (= tamaño óptimo cero)

**El dato que responde la pregunta** (173 round‑trips, FIFO por símbolo):

| Tiempo en la posición | Nº | Retorno **medio** | Retorno **mediano** |
|---|---|---|---|
| **< 1 día (intradía)** | 106 | **−1,88%** | −1,09% |
| 1–3 días | 24 | −1,26% | −1,19% |
| 3–10 días | 36 | −0,87% | −2,05% |
| > 10 días | 7 | +1,16% | −0,32% |

**El 61% de las operaciones (106 de 173) ya fueron intradía puro, y son el peor tramo de todos
por retorno medio: la operativa que se propone escalar es la que más dinero ha perdido.** Ese es
el hallazgo, y descansa sobre 106 observaciones.

Dos matices que la versión del 12/08 se saltó, y que hay que decir porque este documento le exige
lo mismo a los demás:
- **La monotonía solo se cumple en la MEDIA.** En mediana el tramo de 3–10 días (−2,05%) es peor
  que el intradía (−1,09%). Lo sólido es «el intradía pierde», no «cuanto más largo, mejor,
  escalón a escalón».
- **El tramo «> 10 días» son 7 round‑trips y su mediana es NEGATIVA.** Ese +1,16% no sostiene
  nada: es exactamente el tamaño de muestra que este mismo documento descarta por «sin valor»
  cuando le sale a favor del intradía (§3). **No se puede usar para afirmar que el horizonte
  largo funciona en esta cuenta** — para eso está el retrovisor de 15 años (§4), que sí tiene
  observaciones.

## 3. Cruces de medias

**Ya estaban medidos.** La estrategia `momentum` del torneo
(`packages/module-trading/src/estrategias.ts:3`) *es* un cruce de medias — EMA12>EMA26 + MACD,
con suelo ADX≥20. En `trading_estrategia_stats` (n=116):

| estrategia | hit rate | retorno medio |
|---|---|---|
| **momentum (cruce EMA12/26 + MACD)** | **24,1%** | **−0,63%** |
| reversion (RSI) | 26,7% | +0,10% |
| valor | 25,9% | `0.000000` ⚠️ |
| catalizador | 25,9% | `0.000000` ⚠️ |

⚠️ **Ese `0.000000` de `valor` y `catalizador` no es un cero medido, es casi seguro un «no se ha
calculado».** Un retorno medio exactamente nulo sobre n=116 no ocurre por azar. Es el tercer caso
de la regla del `CLAUDE.md`: un centinela con forma de dato, que se cuela por todas las guardas de
NULL. **No se puede leer como «estas dos estrategias salen planas».** Lo que sostiene la conclusión
de este apartado es el **−0,63% de `momentum`**, que sí es un número medido — y es el peor de la tabla.

El propio código explica por qué (`estrategias.ts:10-12`): *«ema12>ema26 y macd>signal son casi la
misma condición, la línea MACD ES ema12−ema26»*. **Mezclar cruce y MACD no confirma nada: es
contarse la misma señal dos veces.**

**Backtest hecho para esta pregunta**, rehecho el 13/08/2026 — SPY, barras de 30 min RTH,
**1.000 barras = 77 sesiones (23/04 → 12/08/2026, IBKR)**, coste 2 pb por lado ≈ comisión + medio
spread, solo largo. La señal es la misma en las dos columnas (estar largo mientras la media rápida
va por encima de la lenta); **lo único que cambia es si se permite dormir con la posición.** La
columna intradía cierra en la última barra del día y **re‑entra en la primera del día siguiente si
la señal sigue viva** — así se mide el coste de forzar el cierre diario, y no el de quedarse fuera
de la tendencia (ese matiz no estaba escrito en la versión del 12/08, y es el que explica que sus
números difieran de estos):

| Cruce | Intradía (plano al cierre) | Dejándolo correr (overnight) |
|---|---|---|
| EMA 5/20 | 61 ops · **+0,61%** | 25 ops · **+5,79%** |
| EMA 9/21 | 59 ops · **+1,25%** | 18 ops · **+6,41%** |
| EMA 12/26 | 58 ops · **−0,91%** | 16 ops · **+4,01%** |
| SMA 20/50 | 56 ops · **−2,57%** | 12 ops · **+4,50%** |
| SMA 50/200 | 43 ops · **−6,95%** | 4 ops · **−3,34%** |
| *Comprar y no tocar* | — | **+8,72%** |

1. **Forzar el cierre diario destruye entre el 80% y el 100% del retorno de la misma señal** — el
   mismo patrón que el histórico real de la cuenta, ahora sobre precios de mercado y no sobre las
   ejecuciones de Alberto.
2. **Ninguna variante bate a comprar y no tocar** (+8,72%), ni siquiera dejándola correr.
3. Lo mejor del intradía es +1,25% en 77 sesiones = **0,016%/día**, entre **31 y 61 veces** por
   debajo del objetivo de 0,5–1% diario. Y el signo cambia según el par (de +1,25% a −6,95%): eso
   no es una ventaja, es elegir el par a posteriori sobre ruido.

*(La versión del 12/08 publicaba +1,46/+2,14/+0,29/−2,46/−6,46% en la columna intradía. Signo,
orden y conclusión son los mismos; las magnitudes cambian por la regla de re‑entrada y por un día
más de ventana. Se publican estas porque son las que se pueden re‑derivar con el método escrito
arriba.)*

En el corte de 13 sesiones con barras de 5 min (SPY y NVDA, 20 configuraciones), **17 de 20 pierden
con costes**; las 3 que ganan tienen 7–11 operaciones (muestra sin valor).

Coherente con lo medido en Fase 1 contra 2 años reales (`TRADING-FASE-B-spec.md`): sistema técnico
**+13,7%** vs buy&hold **+38,4%** / SPY **+30,1%**.

## 4. La mezcla que sí respaldan los datos

No es «medias + intradía», es **selección (qué comprar) + salida por tiempo (cuándo)**:
- Retrovisor 15 años: top‑10 bate al SPY **17 de 22 ventanas a 91 días (+8,5 pp)**; a 28 días solo
  13/22 (+0,8 pp). La ventaja vive en el horizonte largo.
- Momentum **como filtro de selección** es el único quintil con spread positivo (**+5,6 pp** mediana).
- Salida **por tiempo (91 días)** es la única validada; H9 refutó stop −10%, −20% y trailing −15%
  sobre 21.321 observaciones.

Eso ya es la Fase B: no hay que inventar nada, hay que dejarla medir hasta el Tramo 2.

---

## 5. 🔑 La inversión más rentable no está en los mercados

Cruzando `incomes.amount_gross` contra `incomes.amount` (la comisión sale de los datos, no de una
estimación):

| Año | Bruto Booking | Neto cobrado | **Comisión pagada** |
|---|---|---|---|
| 2022 | 124.731 € | 100.134 € | **24.597 €** |
| 2023 | 107.430 € | 86.245 € | **21.185 €** |
| 2024 | 138.163 € | 110.918 € | **27.246 €** |
| 2025 | 127.296 € | 102.194 € | **25.103 €** |
| 2026 (hasta agosto) | 114.116 € | 91.612 € | **22.504 €** |

**19,72% clavado. 120.635 € en cinco años** — 3,7 veces el saldo entero de la cuenta de bolsa.

**En 2026 la comisión de Booking (22.504 €) supera la pérdida bursátil (16.657 €).**

*(Re‑verificado el 13/08 por una vía independiente: `incomes` 2026 da 122.139 € brutos y 99.636 €
netos en total, de los que Booking son 91.612 € — el 92%. La comisión sale de restar dos columnas
de la misma tabla, no de una estimación.)*

Y lo que la convierte en la mejor inversión disponible: **no requiere capital.** Retorno sobre
euros invertidos, infinito. Equivalencias sobre los 32.420 €:

| Desviar a reserva directa | Ahorro anual | Equivale, sobre la cuenta, a… |
|---|---|---|
| 10% de Booking | ≈ 2.500 € | **+7,7% anual** |
| 20% | ≈ 5.000 € | **+15,4% anual** (ya por encima del índice) |
| 30% | ≈ 7.500 € | **+23,1% anual**, recurrente y sin riesgo de mercado |

**Está todo construido y apagado**: `apps/sivra` (housesevillana.es) y la skill
`seo-house-sevillana`, hecha exactamente para esto. Reservas **DIRECTO en 2026: 0 €**
(2025: 110 € · 2024: 3.702 €).

### 5.1 Riesgo de concentración de canal

Booking es el **92%** de la facturación 2026 (91.612 € de 99.636 €). Que un canal se muera no es
teórico: **Airbnb pasó de 42.460 € (2022) a 1.219 € (2026)**. Un cambio de algoritmo o de comisión
en Booking se lleva el negocio por delante. Es un riesgo mayor que el de cualquier cartera, y hoy
no está cubierto.

### 5.2 La palanca de precio funciona

| | Noches | Facturación | €/noche |
|---|---|---|---|
| 2022 | 1.311 | 142.594 € | **109 €** |
| 2026 (hasta agosto) | 568 | 99.636 € | **175 €** |

Casi la misma facturación con **la mitad de noches**: menos limpiezas, menos desgaste, menos
gestión por euro ingresado. El `pricing-agente` ya existe y probablemente le queda recorrido.

## 6. Comparación final de asignación de capital

Mismos euros, mismo periodo (01/01 → 10/08/2026):

| Destino del capital | Resultado 2026 |
|---|---|
| Cuenta de bolsa operada a mano | **−16.657 €** (−33,9%) |
| Índice (SPY), comprado y sin tocar | **+13,3%** ≈ +4.300 € sobre 32.461 € |
| **Negocio real — caja neta sin transferencias** | **+14.569 €** |
| Negocio real — caja neta total | +58.211 € |

⚠️ **La fila del SPY mezcla divisas y hay que leerla con eso delante.** El SPY va de 681,92 $
(cierre 31/12/2025) a 772,49 $ → **+13,3% en dólares**; el TWR de la cuenta está en **base euro**.
Comparar los dos sin el término de tipo de cambio es justo el error de unidad que este repo ya
pagó con ORCL (`CLAUDE.md`), así que: **el +13,3% no es lo que habría ganado Alberto en euros**,
es el rendimiento del índice en su divisa. La conclusión aguanta igual porque la brecha
(**~47 puntos**) es de un orden que ningún movimiento EUR/USD de siete meses cubre — pero la cifra
exacta en euros **no está medida** y no debe citarse como si lo estuviera.

Fuente: `movimientos_bancarios` 2026 (1.465 movimientos, último 10/08): cobros de cliente
+89.324 €, proveedores −28.652 €, tarjeta −28.187 €, suministros −7.780 €, impuestos −4.430 €.
La fila conservadora excluye `transferencia` (+43.642 €) porque no se puede separar el movimiento
interno del ingreso real sin revisarlos uno a uno.

**Entre la peor asignación de capital y la mejor hay ~31.000 € en siete meses.**

## 7. Dos fricciones que solo aparecen al subir la frecuencia

1. **Fiscalidad — regla de los dos meses (art. 33.5 f LIRPF).** Las pérdidas por venta de valores
   cotizados recomprados dentro de los 2 meses **no se computan** hasta deshacer definitivamente.
   Medido cierre a cierre (13/08): de las **25.981 $** de pérdida bruta de 2026, **el 100% —
   los 96 cierres en pérdida— tiene una compra del mismo valor a menos de dos meses**. Ni un solo
   euro de esas pérdidas compensa ganancias del ejercicio hoy. Concentración por nombre: CRWV
   6.369 $, SNDK 4.853 $, RBLX 2.689 $. Hoy la cuenta está a cero: el reloj corre, y volver a
   rotar los mismos valores lo reactiva.
2. **Pattern Day Trader.** La cuenta son ~37.400 $. Contando *day trades* como los cuenta FINRA
   (mismo valor comprado y vendido en la misma sesión): **36 en 2026, máximo 4 en una sesión y
   11 en cinco sesiones consecutivas** (06/01→15/01). El umbral se cruza con **más de 3 en 5 días
   hábiles**, así que la operativa de enero ya lo habría disparado con holgura. Mientras el NAV
   siga por encima de **25.000 $** no hay bloqueo; por debajo, el límite baja a 3 por 5 días
   hábiles y la operativa queda cortada por normativa, justo en el peor momento.
   *(La versión del 12/08 decía «15 en 5 días hábiles, máx. 10 en un día»: ambas cifras eran
   incorrectas. La conclusión —que este ritmo activa el PDT— no cambia.)*

## 8. Recomendación, en orden

1. **Los 32.420 €**: a un ETF global amplio, y no tocarlos. Es el suelo realista; en 2026 habría
   evitado ~20.000 € de pérdida. Lo que hay que batir es esto, no batir a cero.
2. **El tiempo**: a las reservas directas. Es la única palanca con retorno demostrado, recurrente,
   sin riesgo de mercado y **sin capital**.
3. **Bolsa activa**: seguir en paper hasta el Tramo 2 (120 días; van ~16). Sin dinero real.
   Se mantiene la decisión del 10/08 de no operar por impulso.
4. **Subastas**: `subastas_radar` tiene **26 vivas** al 13/08 (coste mediano 162.436 €, mínimo
   18.875 €, depósito 5%). **4** con descuento positivo — Sevilla +38,12% (806.015 €), Asturias
   +32,42% (18.875 €), Asturias +18,96% (96.024 €) y Sevilla +9,29% (184.504 €) —, **7 por encima
   de precio de mercado**, y **15 de 26 con el descuento sin calcular**, que no es «no tienen
   descuento»: es que nadie lo ha mirado. Con el 58% del corpus sin evaluar, cualquier conclusión
   sobre el canal es prematura. **Completar esas 15 es lo único que hay que hacer aquí.**
   *(El 12/08 eran 23 vivas y 1 con descuento; la de Asturias figuraba a +25,98% y hoy sale a
   +18,96%. La tabla se mueve sola: es un radar, no una foto — cítese siempre con fecha.)*

---

## Cautelas metodológicas (lo que NO se ha comprobado)

- Los movimientos bancarios son **caja, no beneficio**. 2025 tiene cobertura PSD2 parcial
  (630 movimientos vs 1.465 en 2026) y **no es comparable año contra año**.
- `gastos` y `expenses` están demasiado incompletas para montar un P&L (112 y 34 filas en 2026,
  con un total de 3,37 M€ claramente contaminado): **no se han usado**.
- **No se ha mirado el saldo vivo de deuda.** En 2026 solo aparecen dos pagos de préstamo
  (441,05 € y 1.074,48 €) y la categoría `prestamo` está contaminada con transferencias. No se
  puede decir si compensa amortizar — no porque no compense, sino porque **no se ha comprobado**.
- El backtest de medias cubre 77 sesiones (30 min) y 13 sesiones (5 min): suficiente para descartar
  un +0,5% diario, insuficiente para afirmar el signo exacto de cada par.
- **El tramo «> 10 días» de la tabla de §2 tiene n=7 y mediana negativa.** No sostiene ninguna
  afirmación sobre el horizonte largo *en esta cuenta*; para eso está el retrovisor de §4.
- **`trading_estrategia_stats` publica `0.000000` en `valor` y `catalizador`** — casi con certeza
  «sin calcular», no un cero medido. Habría que mirar quién escribe esa columna antes de citarla.

## Qué se re‑derivó el 13/08 y qué NO

**Re‑derivado desde la fuente** (y por eso corregido donde hacía falta): las 227 ejecuciones y sus
227 → 173 round‑trips FIFO, acierto, profit factor, esperanza, Kelly, la tabla por tiempo de
tenencia (con medianas), comisiones, los 7 meses negativos, la regla de los dos meses cierre a
cierre, el recuento de *day trades*, NAV / TWR / posiciones abiertas, el backtest de cruces sobre
SPY, `trading_estrategia_stats`, `movimientos_bancarios` por categoría, `incomes` 2026 y
`subastas_radar`.

**NO re‑derivado** (se publica con la procedencia a la vista, no como medición propia): la
volatilidad anualizada 31,7% y el Sharpe −1,98 (ficha de IBKR); el corte de 5 min con 20
configuraciones; el retrovisor de 15 años y el spread por quintiles de §4; las cifras de Fase 1
(+13,7% vs +38,4% / +30,1%); la serie de comisión de Booking 2022‑2025 (la de 2026 sí se
comprobó); y el **coste en euros** de la comparación contra el SPY, que arrastra un tipo de cambio
que nadie ha medido.

## Reproducir este estudio

- Cuenta y ejecuciones: IBKR MCP → `get_account_summary`, `get_pa_performance_all_periods`,
  `get_account_trades(YEAR_TO_DATE)`. Round‑trips por FIFO sobre `symbol`, casando cada venta con
  los lotes de compra más antiguos y **partiendo el lote cuando la venta es parcial** (por eso 227
  ejecuciones dan 173 parejas y no 116). Dos ventas de 2026 no tienen compra dentro del YTD
  —posición abierta en 2025, 114 acciones— y **se cuentan aparte en vez de inventarles un coste**.
- Precios para el backtest: `get_price_history` con `step_count: 1000` y `step: THIRTY_MINS`
  (`period` no vale: 3 meses de barras de 30 min pasan del tope de 1.000 puntos).
  **Llamadas de una en una** — las paralelas ya barajaron series una vez (ver `precios-guardia.ts`).
  Ojo con `time`: viene en ISO (`2026-04-23T14:00:00Z`), **no** en `AAAAMMDD`. Cortarlo a 8
  caracteres agrupa por MES y convierte el «plano al cierre» en «plano a fin de mes» — pasó al
  rehacer esto, y el error da resultados plausibles (+3,89%) que no delatan nada.
- Comisión de Booking: `incomes.amount_gross − incomes.amount` agrupado por `portal` y año
  (el neto es la columna `amount`; no existe `amount_net`).
- Caja del grupo: `movimientos_bancarios` agrupado por `categoria` (fecha en `fecha_operacion`).
- Subastas: `subastas_radar` con `descuento` y `coste_total`, filtrando `not descartado`.
