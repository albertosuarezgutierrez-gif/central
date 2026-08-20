# Estudio fiscal — venta del dúplex (Pasaje Villasís 1 / Fco. de Molina 4, 1º C) por 320.000€

> Fecha del estudio: **20/08/2026**. Autor: agente fiscal del monorepo.
> Fuentes: escritura de donación (protocolo 789/2024, notaría García-Carpintero, Sevilla), **el hilo
> «IRPF 2025» con Asecon y el registro de la declaración presentada** (Drive, 01/07/2026), y la BD de
> `apps/plataforma` (`gastos`, `v_trading_resumen_anual`, `trading_cartera_real`).
> **Es una estimación de trabajo, no una liquidación.** Los importes marcados «⚠️ a confirmar» salen
> de supuestos, no de un documento: hay que sustituirlos por las facturas/cartas de pago reales antes
> de usar este cálculo para decidir. Validación final: Asecon.

## 1. Qué dice la escritura (datos duros)

| Dato | Valor |
|---|---|
| Título | **Donación** madre → hijo (M.ª Antonia Gutiérrez Alcalá → Alberto Suárez Gutiérrez) |
| Fecha | **21/05/2024** (protocolo 789/2024) · inscrita finca 2/18031, Registro nº 10 de Sevilla |
| Finca | Apartamento **letra C, planta 1ª, portal 2** — PJ Villasís 1 Es:2 Pl:01 Pt:C, 41003 Sevilla |
| Superficie | **65,46 m²** construidos (escritura) · 61 m² (catastro) |
| Ref. catastral | 5029006TG3452G0019BG · año construcción 1981 |
| **Valor declarado a efectos de ISD** | **174.650,90€** (= valor de referencia de Catastro a 15/05/2024) |
| Valor catastral 2024 | 40.425,46€ → suelo 25.657,60€ (**63,47%**) · construcción 14.767,86€ (**36,53%**) |
| ISD | Bonificación **99%** de Andalucía (art. 40 Ley 5/2021) solicitada en la propia escritura |
| Plusvalía de la donación | Se solicitó **no sujeción** (alegando que no hubo incremento de valor del suelo) |
| Gastos | Cláusula TERCERO: **todos los gastos e impuestos los paga el donatario** (Alberto), incluida la plusvalía |

**✅ Alcance confirmado (Alberto, 20/08/2026):** es **un solo piso, una sola finca registral** — la
2/18031 que describe esta escritura. No hay un segundo título que aportar, así que el valor de
adquisición de abajo es completo y las cifras de este estudio son las definitivas a falta de sustituir
los importes marcados «⚠️ a confirmar» por las facturas reales.

## 2. El cálculo, pieza a pieza

### 2.1 Valor de adquisición

Al ser adquisición **lucrativa**, el art. 36 LIRPF manda tomar el valor a efectos del ISD (no 0€, no
lo que pagó la madre en 2004), más los gastos e impuestos inherentes satisfechos por el adquirente,
menos las amortizaciones.

| Concepto | Importe | Origen |
|---|---|---|
| Valor declarado ISD | 174.650,90€ | escritura ✅ |
| ISD pagado (cuota íntegra ~26.254€ × 1% tras bonificación 99%) | ~262,54€ | ⚠️ a confirmar con la carta de pago |
| Notaría | ~600,00€ | ⚠️ estimado (10 folios) |
| Registro de la Propiedad | 278,03€ | minuta en la escritura ✅ |
| Gestoría | ~200,00€ | ⚠️ estimado |
| Plusvalía municipal de la donación | 0,00€ | se pidió no sujeción ✅ |
| **− Amortizaciones acumuladas** | **−2.684,39€** | ver 2.2 (240 días arrendado en 2025) |
| **Valor de adquisición corregido** | **≈ 173.307,08€** | |

### 2.2 Amortizaciones — ya no es una estimación: la declaración da los días

El art. 35.1.b LIRPF obliga a **restar del valor de adquisición la amortización mínima**, se haya
deducido o no. La declaración IRPF 2025 (hilo con Asecon, 28/06/2026) da el dato exacto que faltaba:

> «Durante 2025 el inmueble ha permanecido **240 días arrendado** y 125 días a disposición de su
> titular […] ingresos íntegros de 24.647,00 euros y gastos fiscalmente deducibles por importe de
> 3.052,26 euros, correspondientes a gastos de comunidad, suministros, primas de seguro, tributos,
> **amortización** y otros […] rendimiento neto reducido de 21.594,74 euros.»

- Base amortizable = (174.650,90€ + gastos) × 36,53% de construcción = **64.291,60€**
- Al 3% anual = **1.928,75€/año**, prorrateado por días arrendados.

| Ejercicio | Días arrendados | Amortización |
|---|---|---|
| 2024 (desde 21/05) | ~148 ⚠️ estimado a la misma ocupación que 2025 | 782,07€ |
| 2025 | **240** ✅ (declaración) | 1.268,22€ |
| 2026 hasta la venta (~junio) | ~120 | 634,11€ |
| **Total** | | **≈ 2.684,39€** |

Si la venta se va a diciembre de 2026, sube a ~3.318,50€ (unos 146€ más de IRPF).

### 2.2 bis Dos preguntas para Asecon sobre los gastos de 2025

En 2025 el dúplex declaró **3.052,26€** de gastos deducibles TOTALES, que según el hilo incluyen
«comunidad, suministros, primas de seguro, tributos, amortización y otros». Del desglose solo consta
el total, así que lo de abajo son **preguntas, no hallazgos**.

**a) ¿Sobre qué base se amortizó?** Para un inmueble adquirido a **título lucrativo**, el «coste de
adquisición satisfecho» del art. 23.1.b LIRPF es el **valor declarado en el ISD más gastos y tributos**
(STS de 15/09/2021, rec. 5664/2019), y se toma el **mayor** de ese coste y el valor catastral:

| Base usada | 3% anual | Prorrateado a 240 días |
|---|---|---|
| **Valor ISD (la correcta aquí)** | 1.928,75€ | **1.268,22€** |
| Valor catastral de construcción (14.767,86€) | 443,04€ | 291,26€ |

Reconstruyendo los gastos conocidos (comunidad ~914€, luz ~1.214€, internet ~251€, IBI e seguro),
prorrateados al 240/365, quedan del orden de **1.000-1.200€** para la amortización — o sea, la cifra
es **compatible con un cálculo correcto**. No hay motivo para pensar que esté mal; simplemente
conviene confirmarlo, porque la diferencia entre las dos bases es de **977€/año** y aún se puede
rectificar 2024 y 2025 (4 años de plazo).

**b) ¿Se metieron las limpiezas?** En la BD el dúplex acumula 4-8 limpiezas al mes a 25€ (Sique
Brilla) → del orden de **1.800€/año**, que son gasto deducible del arrendamiento y no se prorratean
(son por reserva). Con ellas dentro, el total de gastos se iría muy por encima de 3.052,26€, así que
o no entraron o entraron por otra vía. Merece la pregunta: es dinero al tipo marginal de la base
general, más caro que el 23% de la venta.

> Ojo con el sentido del ajuste: **deducir mejor la amortización sube la ganancia de la venta**
> (art. 35.1.b obliga a restarla del valor de adquisición, se haya deducido o no). Aun así compensa:
> se recupera al marginal general y solo encarece la venta al 23%.

### 2.3 Plusvalía municipal (IIVTNU) — elegir método, hay 24.000€ de diferencia

Al ser la donación de 2024 «no sujeta», el cómputo de años arranca en **21/05/2024** → ~2 años.

| Método | Cálculo | Cuota |
|---|---|---|
| **Objetivo** ✅ | 25.657,60€ (suelo) × 0,14 (coef. 2 años) × ~27% | **≈ 970€** |
| Real | (320.000€ − 174.650,90€) × 63,47% suelo × ~27% | ≈ 24.908€ |

**Hay que liquidar por el método objetivo y decirlo expresamente**, que es opcional y no se aplica
solo. Diferencia: **~24.000€**. ⚠️ Confirmar en la ordenanza de Sevilla vigente el día de la venta el
tipo (26,53%–27% según fuente) y el coeficiente, y el valor catastral del suelo del recibo de IBI de
ese año — el de la tabla es de 2024.

### 2.4 IRPF — ganancia patrimonial en la base del ahorro

Tarifa del ahorro: 19% hasta 6.000€ · 21% de 6.000 a 50.000€ · 23% de 50.000 a 200.000€.

| Escenario de venta | Ganancia | IRPF | + Plusvalía | **Neto en bolsillo** |
|---|---|---|---|---|
| **A. Venta directa, sin agencia** | 145.323,07€ | **32.304,31€** | 969,86€ | **286.325,84€** |
| **B. Agencia 3% + IVA (11.616€)** | 133.707,07€ | **29.632,63€** | 969,86€ | **277.381,52€** |
| **C. Agencia 5% + IVA (19.360€)** | 125.963,07€ | **27.851,51€** | 969,86€ | **271.418,64€** |

Tipo efectivo sobre la ganancia: **~22,2%**. (Incluye 400€ de certificado energético + notaría/gestión
del vendedor.)

⚠️ La ganancia se suma al **resto de la base del ahorro de ese año** (dividendos, intereses,
plusvalías de IBKR). Si el total supera 200.000€ el exceso va al 27%, y por encima de 300.000€ al 30%.

## 3. Palancas reales para pagar menos

### 3.1 Compensar con las pérdidas de trading — la más grande y la más fácil

En `v_trading_resumen_anual` figuran pérdidas realizadas en la cuenta de IBKR:

| Año | P&L broker |
|---|---|
| 2025 | **−6.641,98 USD** |
| 2026 (hasta hoy) | **−18.745,86 USD** |

Las pérdidas patrimoniales compensan **al 100%** las ganancias patrimoniales del mismo año, y las de
años anteriores arrastran 4 ejercicios.

> Con ~16.000€ de pérdidas de 2026 (conversión aproximada), en el escenario B el IRPF baja de
> **29.632,63€ a 25.947,54€** → **~3.685€ de ahorro**. Sumando lo pendiente de 2025, más.

**⚠️ Estas cifras NO son la base fiscal.** Son el P&L que da el bróker, **en dólares y sin tipo de
cambio aplicado** (la propia vista marca `sin_tipo_cambio = 227` operaciones). Fiscalmente hay que
recalcular en euros, operación a operación, con FIFO y el tipo de cambio de cada fecha, y aplicar la
regla de los 2 meses de recompra. **Antes de contar con este ahorro hay que pedir a IBKR el informe
fiscal en euros.** Lo que sí es seguro es la dirección: hay pérdidas y son grandes.

**Consecuencia práctica: el año de la venta importa.** Vender en 2026 permite cruzarla con las
pérdidas de 2026 (que ya existen). Si la venta se va a 2027, esas pérdidas solo sirven vía arrastre.

### 3.2 Facturas de obra: mejora ≠ reparación

Las **mejoras** (ampliación, cambio de instalaciones, reforma que aumenta el valor) suman al valor de
adquisición; las de **conservación y reparación** no. Cada 10.000€ de obra bien clasificada como
mejora son **~2.300€ menos de IRPF**.

**🚨 Conflicto con la regla vigente de gasto:** el criterio dictado es «meter el máximo gasto
deducible posible cada año, todo como gasto corriente». Una obra que ya se dedujo como gasto corriente
en el rendimiento del alquiler **no puede computarse otra vez** como mayor valor de adquisición. Antes
de sumar nada, hay que revisar qué facturas de obra del dúplex se dedujeron ya en 2024/2025 y cuáles no.

### 3.3 Lo que NO aplica (para no perder tiempo)

- **Reinversión en vivienda habitual** — no: la habitual es Monte Carmelo 68, no el dúplex.
- **Exención mayores de 65 / renta vitalicia** — no, por edad.
- **Coeficientes de abatimiento (DT 9ª)** — no: solo para adquisiciones anteriores a 31/12/1994.
- **Repartir con Pilar** — no: el piso es **privativo** (donación de la madre, así consta en escritura).

## 3 bis. Vender vs. mantener — qué renta de verdad el dúplex

Hay **dos vistas** del mismo piso y conviene no mezclarlas:

**a) Lo declarado en el IRPF 2025** (criterio de caja, solo los abonos de Booking del año natural):

| Concepto | 2025 |
|---|---|
| Ingresos declarados (neto de comisión Booking) | 18.606,47€ |
| Gastos deducibles | 3.052,26€ |
| **Rendimiento neto** | **15.554,21€** |
| Días arrendado / a disposición | 240 / 125 |
| Imputación de renta por los días vacíos | 276,89€ |

**b) El detalle de reservas** (tabla `_csv_staging`, por fecha de entrada, importes brutos de portal):

| Año | Reservas | Noches | Bruto portales | ADR | Ocupación |
|---|---|---|---|---|---|
| 2024 (desde la donación) | 28 | 96 | 9.678,93€ | 100,82€ | — |
| **2025** | **63** | **251** | **26.195,20€** | **104,36€** | **68,8%** |
| 2026 (hasta el 20/05) | 27 | 109 | 12.853,47€ | **117,92€** | — |

### Estimación 2026

Comparando el mismo periodo (enero–abril, el único cerrado en ambos años):

| | 2025 | 2026 | Δ |
|---|---|---|---|
| Noches | 93 | 95 | +2,2% |
| Importe | 9.591,65€ | 11.326,88€ | **+18,1%** |
| ADR | 103,14€ | 119,23€ | **+15,6%** |

La ocupación está plana; **lo que ha subido es el precio por noche**. Proyectando 2026 completo:

| Escenario | Bruto | Neto de comisión (~22,1%) | Rendimiento tras ~4.000€ de gastos |
|---|---|---|---|
| Prudente (plano vs 2025) | 26.195€ | 20.396€ | ~16.400€ |
| **Conservador (mismas noches, ADR +15,6%)** | **30.283€** | **23.578€** | **~19.600€** |
| Central (+18% sobre 2025) | 30.934€ | 24.085€ | ~20.100€ |

**Sobre un precio de venta de 320.000€ eso es un ~6% bruto**, no el 4,86% que salía de la cifra
declarada de 2025 — y tributa al **marginal de la base general**, no al 23% del ahorro. Es el número
contra el que hay que medir la venta.

⚠️ Cautelas: (1) `_csv_staging` es una tabla de importación puntual cuyos datos **terminan el
27/05/2026** — de junio en adelante no hay reservas cargadas ahí, así que la proyección es
extrapolación, no cartera confirmada; (2) no hay filas del dúplex en `reservas_canceladas`, pero eso
mide lo que esa tabla llegó a capturar, no que no haya habido cancelaciones; (3) los 18.606,47€ son
el neto de comisión, criterio que Alberto fijó el 30/06/2026 y que subió la devolución de ~1.156€ a
2.968,26€; (4) sigue abierto en el hilo con Asecon un **posible doble cómputo de Booking** (imputado a
Alberto y a la sociedad), con un descuadre de ~21.692€ en la cuenta de Punto y Coma.

## 4. Riesgos a vigilar

1. **La ganancia patrimonial de la madre en su IRPF 2024.** La donación generó ganancia en el IRPF de
   la donante por la diferencia entre lo que pagó en 2004 y los 174.650,90€. La propia escritura lo
   advierte. **Confirmar con Asecon que se declaró** — si no, hay una contingencia abierta en su renta.
2. **Donar y vender en ~2 años.** Encadenar donación (2024) y venta a un tercero (2026) es un patrón
   que la AEAT mira: si concluyera que la donación fue interpuesta, imputaría la ganancia a la madre.
   Se defiende bien porque el piso se ha explotado como turístico de verdad — **conservar la prueba**
   (reservas, facturas, altas de suministros a su nombre).
3. **Plusvalía de la donación declarada «no sujeta».** Si el Ayuntamiento la revisara y girara
   liquidación, ese importe **sumaría al valor de adquisición** y bajaría la ganancia. Verificar que el
   expediente está cerrado.
4. **Valor de referencia actual.** El de 2024 era 174.650,90€. Si el vigente el día de la venta supera
   el precio, el **comprador** paga ITP sobre el valor de referencia, no sobre 320.000€ — no es
   problema de Alberto en IRPF, pero sí puede frenar la operación.

## 5. Checklist antes de firmar

- [x] ~~Confirmar si el dúplex son una o dos fincas~~ → **una sola** (confirmado 20/08/2026).
- [ ] Cartas de pago reales: **ISD**, minuta de **notaría**, **gestoría** de la donación de 2024.
- [x] ~~Días alquilados 2025~~ → **240 días** (declaración IRPF 2025). Falta el dato de **2024 y 2026**.
- [ ] Pedir a Marta el **desglose de los 3.052,26€** de gastos de 2025: base de amortización y si
      entraron las limpiezas (ver 2.2 bis).
- [ ] **Informe fiscal de IBKR en euros** (2025 y 2026) para la compensación de pérdidas.
- [ ] Confirmar con Marta que la **pérdida patrimonial de IBKR de 2025 quedó declarada** y pendiente de
      compensar (el certificado de IBKR se le entregó el 03/06/2026: «adjunto documento de interactive,
      único que trabajo»). Si no entró, se pierde el arrastre.
- [ ] Separar facturas de obra del dúplex en **mejora vs reparación**, y cruzar con lo ya deducido.
- [ ] Simulador de plusvalía del Ayuntamiento de Sevilla + **valor catastral del suelo del IBI vigente**.
- [ ] Decidir **año de venta** (2026 vs 2027) a la vista de las pérdidas de trading disponibles.
- [ ] Validación final con **Asecon** antes de firmar.

## 6. Resumen en una línea

Vendiendo por 320.000€ salen **~33.300€ de impuestos** (32.304€ de IRPF + 970€ de plusvalía) si se
vende sin agencia, o **~30.600€** con agencia al 3%. Con las pérdidas de trading de 2026 bien
liquidadas en euros, la factura puede bajar a **~27.000€**. El neto en el bolsillo queda entre
**271.000€ y 286.000€** según cómo se venda, frente a un piso que a ritmo de 2026 renta del orden
de **19.000-20.000€ netos al año (~6% bruto sobre el precio)**, tributando al marginal general.
