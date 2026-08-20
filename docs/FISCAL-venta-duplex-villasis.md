# Estudio fiscal — venta del dúplex (Pasaje Villasís 1 / Fco. de Molina 4, 1º C) por 320.000€

> Fecha del estudio: **20/08/2026**. Autor: agente fiscal del monorepo.
> Fuentes: escritura de donación (protocolo 789/2024, notaría García-Carpintero, Sevilla) + BD de
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
| **− Amortizaciones acumuladas** | **−2.632,74€** | ⚠️ ver 2.2 |
| **Valor de adquisición corregido** | **≈ 173.358,73€** | |

### 2.2 Amortizaciones — el ajuste que casi nadie mete y que sube la factura

El dúplex está **en explotación turística** (en `gastos` hay limpiezas de Sique Brilla, luz de
TotalEnergies/Endesa a nombre de «Pj Francisco Molina 4 1C», comunidad e internet, todo 2026). El art.
35.1.b LIRPF obliga a **restar del valor de adquisición la amortización mínima**, se haya deducido o no.

- Base amortizable = (174.650,90€ + gastos) × 36,53% de construcción = **64.291,60€**
- Al 3% anual = **1.928,75€/año**, prorrateado por días efectivamente alquilados.

| Escenario | Amortización acumulada | Efecto en la cuota |
|---|---|---|
| Solo empezó a explotarse en 2026 | ~1.157€ | +266€ de IRPF |
| **Central (~2 años al 65% de ocupación)** | **~2.633€** | **+606€** |
| Dos años completos alquilado | ~4.050€ | +932€ |

**⚠️ No he podido medir la ocupación real del dúplex en 2024–2025:** los `gastos` de
`prop_duplex_center` en la BD **empiezan el 01/01/2026**, y las reservas viven en otra base. Eso NO
significa que no se alquilara antes — significa que aquí no consta. Con el dato real de días
alquilados 2024/2025/2026 el número se cierra en un minuto.

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
| **A. Venta directa, sin agencia** | 145.271,41€ | **32.292,42€** | 969,86€ | **286.337,72€** |
| **B. Agencia 3% + IVA (11.616€)** | 133.655,41€ | **29.620,74€** | 969,86€ | **277.393,40€** |
| **C. Agencia 5% + IVA (19.360€)** | 125.911,41€ | **27.839,62€** | 969,86€ | **271.430,52€** |

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
> **29.620,74€ a 25.935,66€** → **~3.685€ de ahorro**. Sumando lo pendiente de 2025, más.

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
- [ ] **Días alquilados** 2024 / 2025 / 2026 para cerrar la amortización.
- [ ] **Informe fiscal de IBKR en euros** (2025 y 2026) para la compensación de pérdidas.
- [ ] Separar facturas de obra del dúplex en **mejora vs reparación**, y cruzar con lo ya deducido.
- [ ] Simulador de plusvalía del Ayuntamiento de Sevilla + **valor catastral del suelo del IBI vigente**.
- [ ] Decidir **año de venta** (2026 vs 2027) a la vista de las pérdidas de trading disponibles.
- [ ] Validación final con **Asecon** antes de firmar.

## 6. Resumen en una línea

Vendiendo por 320.000€ salen **~33.000€ de impuestos** (32.292€ de IRPF + 970€ de plusvalía) si se
vende sin agencia, o **~30.600€** con agencia al 3%. Con las pérdidas de trading de 2026 bien
liquidadas en euros, la factura puede bajar a **~27.000€**. El neto en el bolsillo queda entre
**271.000€ y 286.000€** según cómo se venda.
