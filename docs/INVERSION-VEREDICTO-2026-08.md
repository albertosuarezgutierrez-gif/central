# ¿Dónde renta de verdad el capital? — veredicto 12/08/2026

> Pregunta de Alberto: *«¿es rentable coger toda la cuenta y hacer operativa intradía ganando
> 1/2%? ¿y con cruces de medias? ¿alguna idea más? hay que buscar la inversión más rentable»*.
>
> Este documento cierra las tres preguntas con datos medidos, no con opinión. Se escribe porque
> el repo ya tiene la costumbre de dejar por escrito **lo que se ha refutado y por qué**
> (H8, H9 en `TRADING-HIPOTESIS-PREREGISTRO.md`), y para que ni Alberto ni el agente vuelvan a
> litigarlo desde cero.

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

**Cuenta**
- YTD 2026 (TWR): **−34,0%** · 1 año: −30,0% · máx. drawdown: −35,3%
- NAV: 49.118 € (31/12/2025) → **32.420 €** (hoy, 100% liquidez, 0 posiciones)
- Volatilidad anualizada 31,7% · Sharpe **−1,98** · SPY en el mismo tramo **+11,4%**
- Para volver al punto de partida hace falta **+51,5%**

**Operaciones (116 cierres)**
- Acierto **17,2%** · profit factor **0,28** · retorno medio por cierre **−1,42%**
- Realizado **−18.746 $**, y **los 7 meses operados en 2026 son negativos**, sin excepción
- Comisiones 165 $ = **0,9% de la pérdida** → el problema no son los costes, es la dirección
- Esperanza por operación **−172 $** · Kelly óptimo **−47,6%** (= tamaño óptimo cero)

**El dato que responde la pregunta** (173 round‑trips, FIFO por símbolo):

| Tiempo en la posición | Nº | Retorno medio |
|---|---|---|
| **< 1 día (intradía)** | 106 | **−1,88%** |
| 1–3 días | 24 | −1,26% |
| 3–10 días | 36 | −0,87% |
| **> 10 días** | 7 | **+1,16%** |

Cuanto más corto el horizonte, peor el resultado, de forma monótona. El 39% de las operaciones
ya fueron intradía puro: **la operativa que se propone escalar es la que más dinero ha perdido.**

## 3. Cruces de medias

**Ya estaban medidos.** La estrategia `momentum` del torneo
(`packages/module-trading/src/estrategias.ts:3`) *es* un cruce de medias — EMA12>EMA26 + MACD,
con suelo ADX≥20. En `trading_estrategia_stats` (n=116):

| estrategia | hit rate | retorno medio |
|---|---|---|
| **momentum (cruce EMA12/26 + MACD)** | **24,1%** | **−0,63%** |
| reversion (RSI) | 26,7% | +0,10% |
| valor | 25,9% | 0,00% |
| catalizador | 25,9% | 0,00% |

Es la peor de las cuatro. El propio código explica por qué (`estrategias.ts:10-12`): *«ema12>ema26
y macd>signal son casi la misma condición, la línea MACD ES ema12−ema26»*. **Mezclar cruce y MACD
no confirma nada: es contarse la misma señal dos veces.**

**Backtest hecho para esta pregunta** — SPY, barras de 30 min, 77 sesiones reales
(22/04→11/08/2026, IBKR), coste 2 pb/lado ≈ comisión + spread, solo largo:

| Cruce | Intradía (plano al cierre) | Dejándolo correr (overnight) |
|---|---|---|
| EMA 5/20 | 59 ops · **+1,46%** | 23 ops · **+6,68%** |
| EMA 9/21 | 57 ops · **+2,14%** | 16 ops · **+7,34%** |
| EMA 12/26 | 56 ops · **+0,29%** | 14 ops · **+5,27%** |
| SMA 20/50 | 55 ops · **−2,46%** | 12 ops · **+3,76%** |
| SMA 50/200 | 43 ops · **−6,46%** | 4 ops · **−2,83%** |
| *Comprar y no tocar* | — | **+8,43%** |

1. **Forzar el cierre diario destruye entre el 65% y el 100% del retorno de la misma señal** —
   el mismo patrón que el histórico real de la cuenta, ahora sobre precios de mercado.
2. **Ninguna variante bate comprar y no tocar.**
3. Lo mejor del intradía es +2,14% en 77 sesiones = **0,028%/día**, entre 18 y 36 veces por debajo
   del objetivo. Y el signo cambia según el par (de +2,14% a −6,46%): eso no es ventaja, es elegir
   el par a posteriori sobre ruido.

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

**En 2026 la comisión de Booking (22.504 €) supera la pérdida bursátil (16.698 €).**

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
| Cuenta de bolsa operada a mano | **−16.698 €** (−34,0%) |
| Índice (SPY), comprado y sin tocar | **+11,4%** ≈ +3.700 € sobre 32.420 € |
| **Negocio real — caja neta sin transferencias** | **+14.569 €** |
| Negocio real — caja neta total | +58.211 € |

Fuente: `movimientos_bancarios` 2026 (1.465 movimientos, último 10/08): cobros de cliente
+89.324 €, proveedores −28.652 €, tarjeta −28.187 €, suministros −7.780 €, impuestos −4.430 €.
La fila conservadora excluye `transferencia` (+43.642 €) porque no se puede separar el movimiento
interno del ingreso real sin revisarlos uno a uno.

**Entre la peor asignación de capital y la mejor hay ~31.000 € en siete meses.**

## 7. Dos fricciones que solo aparecen al subir la frecuencia

1. **Fiscalidad — regla de los dos meses (art. 33.5 f LIRPF).** Las pérdidas por venta de valores
   cotizados recomprados dentro de los 2 meses **no se computan** hasta deshacer definitivamente.
   Rotando los mismos nombres (33 operaciones en NFLX, 33 en CRWV, 30 en NVO), prácticamente todas
   las pérdidas de 2026 quedan bloqueadas y no compensan ganancias del ejercicio. Hoy la cuenta
   está a cero: el reloj corre, y volver a rotar los mismos valores lo reactiva.
2. **Pattern Day Trader.** La cuenta son ~37.400 $. El histórico llega a **15 day trades en 5 días
   hábiles** (máx. 10 en un día). Si el NAV baja de **25.000 $** el límite pasa a 3 por 5 días
   hábiles y la operativa queda bloqueada por normativa, justo en el peor momento.

## 8. Recomendación, en orden

1. **Los 32.420 €**: a un ETF global amplio, y no tocarlos. Es el suelo realista; en 2026 habría
   evitado ~20.000 € de pérdida. Lo que hay que batir es esto, no batir a cero.
2. **El tiempo**: a las reservas directas. Es la única palanca con retorno demostrado, recurrente,
   sin riesgo de mercado y **sin capital**.
3. **Bolsa activa**: seguir en paper hasta el Tramo 2 (120 días; van ~16). Sin dinero real.
   Se mantiene la decisión del 10/08 de no operar por impulso.
4. **Subastas**: `subastas_radar` tiene 23 vivas (coste mediano 178.350 €, mínimo 21.081 €,
   depósito 5%). Solo **1** con descuento positivo (+25,98%, vivienda en Asturias, 96.024 €),
   **7 por encima de precio de mercado**, y **15 de 23 con el descuento sin calcular** — que no es
   «no tienen descuento», es que nadie lo ha mirado. Completar esas 15 antes de decidir nada.

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

## Reproducir este estudio

- Cuenta y ejecuciones: IBKR MCP → `get_account_summary`, `get_pa_performance_all_periods`,
  `get_account_trades(YEAR_TO_DATE)`. Round‑trips por FIFO sobre `symbol`+`side`+`size`.
- Precios para el backtest: `get_price_history` con `step_count` (tope 1.000 barras).
  **Llamadas de una en una** — las paralelas ya barajaron series una vez (ver `precios-guardia.ts`).
- Comisión de Booking: `incomes.amount_gross − incomes.amount` agrupado por `portal` y año.
- Caja del grupo: `movimientos_bancarios` agrupado por `categoria`.
