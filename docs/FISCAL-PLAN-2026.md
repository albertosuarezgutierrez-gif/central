# Plan fiscal de cierre 2026 — Alberto (+ Pilar)

> 04/10/2026 · agente de solo lectura (SELECT a BD + código). **Orientativo: lo valida Asecon (Marta).**
> Etiquetas: **[Dato]** = medido en BD · **[Est.]** = proyección mía con la fórmula indicada · **null** = no se sabe.
> Riesgos: **[Seguro]** / **[Probable]** / **[Suposición]**. Tipo marginal supuesto: Alberto **37 %** en individual
> (45 % en conjunta), Pilar **30 %** en individual. Si cambian las bases, cambian los ahorros.

## 0. Antes de leer cifras: el sistema está INCOMPLETO
- Sync bancario parado: Tarjeta Kutxabank (último 31/07), N26 (03/07), BBVA ****2620 (25/06), Kutxa de Pilar (30/06),
  Tarjeta Pilar (01/07), BBVA ****1175 (10/09). Solo Kutxa ****0855 está al día (02/10). **Los gastos de jul–sep están
  infravalorados** → la primera acción es reconectar (PSD2) y reimportar.
- Ingresos de pisos: `incomes` (devengo) da 91.069,08€ ene–sep; el banco solo 82.587,58€. **Faltan 8.481,50€ en banco**
  (¿abonos en la cuenta de Punto y Coma BBVA ****9871, no conectada?). En 2026 tributan en el IRPF personal igualmente.

## 1. Situación 2026 por negocio
| Negocio | Ingresos | Gastos deducibles | Rendimiento neto |
|---|---|---|---|
| **Correduría** ene–sep [Dato] | 5.801,32€ bruto est. (4.931,12€ neto banco ÷ 0,85; excluye 3.333,96€ de prestación exenta) | 8.986,55€ banco → **9.337,61€ ajustado** (−600€ impuesto, +951,06€ Codeoscopic/CiMA mal puestos en pisos) | **−3.536,29€** |
| Correduría año [Est. ×12/9 gastos; ingresos run-rate abr–sep 556,66€/mes neto] | 7.766,03€ (retención est. 1.164,90€) | 12.450,15€ | **−4.684,12€** |
| **Pisos + Dúplex** ene–sep [Dato] | 91.069,08€ (`incomes`, neto de comisión OTA) | 29.496,02€ banco → **26.595,28€ ajustado** (−951,06€ correduría, −1.949,68€ TotalEnergies probable Monte Carmelo) | 64.473,80€ antes de amortizar |
| Pisos año [Est.: ene–sep + reservas ya cobradas/confirmadas oct–dic 29.394,97€; gastos ×12/9] | **120.464,05€** (suelo: solo lo ya reservado) | 35.460,37€ + amortización (Dúplex ~1.928,75€; Socorro **null**: 4.152–6.228€) | **≈76.850–78.920€** |
| **Pilar actividad** ene–jun [Dato] | 1.981,13€ | 467,45€ | null desde julio (sync parado) |

Ingresos 2026 por piso [Dato+reservado, neto OTA]: **Socorro 67.078,43€** (50/50 → 33.539,22€ cada uno) · Luxury
20.348,30€ · Dúplex 19.170,46€ · Busto Reform 13.866,86€. Gastos por piso: **null** (187 de 219 cargos de pisos sin
`propiedad_id`; solo el Dúplex se separa por cuenta BBVA: 1.874,51€ ene–sep).
Bases aproximadas [Est., gastos repartidos por peso de ingresos]: **Alberto ≈52.100€**, **Pilar ≈22.000€**.

## 2. Deducciones y reducciones: ¿se aprovechan?
| Concepto | Situación | Estado |
|---|---|---|
| Cuota RETA Alberto | 2.213,83€ ene–ago [Dato]; año ≈3.769,63€ [Est.] | ✅ en correduría (ene–feb etiquetadas «seguro», mismo bucket) |
| Seguro salud Asisa | 180,99€/mes → 2.171,88€/año; límite 500€/persona (art. 30.2.5ª) → con 5 asegurados tope 2.500€ | ✅ si la póliza cubre a los 5; **null** quién está asegurado. Sub-etiquetas caóticas («supermercado», «proveedor») |
| Informática/IA | 2.974,93€ ene–sep en correduría | ✅ (ver riesgo de actividad en pérdidas, §3) |
| Amortización Dúplex | 3 % × 64.291,60€ = 1.928,75€/año (base ISD, `FISCAL-venta-duplex-villasis.md`) | ⚠️ no está en el sistema; 2025 la metió Asecon (desglose sin pedir) |
| **Amortización Socorro** | 3 % × (346.000€ + gastos) × % construcción → **null** (falta valor catastral suelo/vuelo) | ❌ **primer año en IRPF personal**: si nadie la calcula, se pierde. 50 % a cada uno |
| Amortización mobiliario (10 %) | Política de Alberto: todo a gasto del año; `amortizable` = 0 cargos | ✅ coherente con su criterio (riesgo §3) |
| Suministros pisos | 3.512,63€ + 1.730,08€ ene–sep | ✅ salvo TotalEnergies (§3) |
| Donativos (80 % primeros 250€) | 2026 ≈ 10€/mes + 120€ sept = ~240€ → **192€ de deducción** | ❌ `fiscal_perfil.donativos_anual = 0` y solo 3 recibos marcados `mecenazgo`; el motor usa aún el umbral viejo de **150€** |
| Plan de pensiones | Límite = menor de 1.500€ (5.750€ con PPES autónomo) y **30 % de rendimientos netos de trabajo + actividades** | ⚠️ Alberto: actividad NEGATIVA → **reducción 0€** (el exceso arrastra 5 años). Pilar: 30 % de su neto de actividad (null) |
| Vivienda habitual transitoria | Requiere compra antes del 01/01/2013; Monte Carmelo se compró el **29/03/2021** | ❌ **No aplica** [Seguro] |
| Reducción por arrendamiento de vivienda | Solo alquiler de vivienda habitual del inquilino (LAU). Los 4 pisos son VUT | ❌ No aplica [Seguro] |
| Atribución Socorro | 50/50 por copropiedad (escritura 2015, solteros, mitades indivisas) | ⚠️ `lib/finanzas.ts` imputa el 100 % a Alberto (no reparte); irrelevante en conjunta, **clave en individual** |
| Familia numerosa estatal | 1.200€ | ✅ en `fiscal_perfil` |
| Maternidad + guardería | 2 hijos <3 (2024, 2025). Guardería 3.007,92€ ene–sep [Dato] | ⚠️ El código topa el incremento en 1.000€ TOTAL; legalmente **1.000€ por hijo** (sujeto a cotizaciones de Pilar y Modelo 233) |
| Andalucía | FN autonómica 200€ (límite base 25.000€ indiv./30.000€ conj.); deportiva 15 % s/100€ máx.; gastos educativos | Conjunta: FN no aplica. Individual: Pilar (~22.000€) **podría** [Suposición]. Deportiva: `gasto_deportivo_anual = 0` (Círculo marcado; máx. 15€) |

## 3. Riesgos que pueden costar dinero
1. **[Seguro] IVA por inversión del sujeto pasivo sin autoliquidar.** Facturas sin IVA: Anthropic Ireland 1.741,25€,
   Anthropic PBC 180€, PriceLabs 149,91€, Fly 6,68€ (= 2.077,84€) + Smoobu (Alemania) 1.018,05€ en banco sin factura.
   Correduría (art. 20.Uno.16 LIVA) y VUT son **exentas** → ese IVA **no se deduce: es coste real** 436–651€ + 303 de
   cada trimestre + 349 (UE) + alta en ROI. Lo que no está presentado: complementarias con recargo 1 % + 1 %/mes.
2. **[Probable] Gastos personales metidos como deducibles** (suben la cuota pero evitan sanción del 50 %):
   TotalEnergies 1.348,30€ + «Total Gas y Elect» 601,38€ en pisos (la skill dice que TE en Kutxa = gas de Monte
   Carmelo); «CARGO POR PAGO DE IMPUESTOS» 600€ (25/06) como gasto de correduría; Generali coche 806,20€ + gasolina
   180€ (el IRPF exige afectación EXCLUSIVA del vehículo); DIGI incluye la línea de Monte Carmelo (~¼ de 76€/mes).
3. **[Probable] Cargos sin factura:** 119 cargos de negocio ene–sep por **18.284,33€** sin `factura_ref` (54 ≥100€ =
   16.042,95€). Si Hacienda rechaza esos 16.042,95€: **5.936–7.219€** de cuota. Ojo comisiones Booking/Airbnb: el
   ingreso se declara neto, pero hacen falta sus facturas mensuales (en BD solo 509,21€ de Booking).
4. **[Probable] Correduría en pérdidas con gasto de IA:** ingresos ~7.766€ vs gastos ~12.450€. La IA sirve a todo el
   monorepo, no solo a la correduría: la AEAT puede negar la afectación de parte (2.974,93€ ene–sep).
5. **[Probable] IVA pisos turísticos: exento** (art. 20.Uno.23º LIVA) mientras no haya servicios hoteleros (limpieza
   durante la estancia, recepción, desayuno…). Limpieza a la salida + ropa de cama = no hotelero. Si se añaden → 10 %.
6. **[Suposición] Modelo 130:** no se ve ningún pago. Alberto estaría exento si ≥70 % de sus ingresos de actividad
   del año anterior llevaron retención (art. 109 RIRPF) y los VUT son capital inmobiliario (sin 130). Con pérdida, la
   cuota sería 0, pero no presentar puede ser infracción formal. **Consecuencia de caja: no hay pagos a cuenta de los
   pisos → en junio 2027 saldrá una cuota diferencial alta (≈12.000–15.000€ [Est.]).**
7. **[Suposición] Subarriendo Bustos Tavera (Gutiérrez Alcalá, 568,54€/mes):** si se considera que Alberto alquila
   para una actividad, debería retener 19 % (Modelo 115/180: ~1.296€/año). Si el arrendador es familiar y la renta
   está bajo mercado, impacto en la renta del arrendador. Asecon.
8. **[Probable] Ingresos de pisos que entran en la SL** (8.481,50€ de desfase): una SL «dormida» con abonos de 2026.
9. **[Suposición] Donativo a la fundación del colegio:** si de facto es cuota obligatoria, la AEAT lo rechaza.

## 4. Acciones antes del 31/12/2026, por ahorro estimado
| # | Acción | Fórmula / supuesto | Ahorro |
|---|---|---|---|
| 1 | **Que Asecon compare conjunta vs individual** (con Socorro al 50/50 desde ya en los datos) | Conjunta: tarifa(70.700) − tarifa(mín. 20.250) ≈ 18.476€. Individual: Alberto 52.100€ → 12.505€; Pilar 22.000€ → 2.292€ | **≈3.000–3.700€** [Probable] |
| 2 | **Amortización de Socorro** en la renta 2026 (pedir IBI con desglose suelo/construcción + gastos de compra 2015) | (346.000€ + gastos) × 40–60 % construcción × 3 % = 4.152–6.228€; ½ al 37 % + ½ al 30 % | **≈1.390–2.090€** |
| 3 | **Reunir facturas** de los 54 cargos ≥100€ (Booking/Airbnb mensuales, Gutiérrez Alcalá + contrato, Endesa, Lavandería, IKEA, Asisa) | 16.042,95€ × 37–45 % | **Protege 5.936–7.219€** (no es ahorro nuevo) |
| 4 | **Guardería: 1.000€ por hijo**, no 1.000€ total (Modelo 233 de Estrella Polar por cada niño) | +1.000€ deducción si las cotizaciones de Pilar lo permiten | **0–1.000€** [Probable] |
| 5 | **Pérdidas IBKR 2026 (−18.745,86 USD, sin pasar a €):** realizar antes del 31/12 plusvalías latentes que haya en otros activos (o vender el Dúplex en 2026) para compensarlas al 100 % | Ganancia compensada × 19–23 % (base del ahorro) | **0–3.700€** [Suposición: solo si hay ganancias que realizar] |
| 6 | Revisar amortización Dúplex 2024–2025 (¿base ISD o catastral?) y meterla en 2026 | 1.928,75€ × 37 % = 714€/año; rectificar 2024–25 si se usó la catastral (+977€/año de base) | **0–1.080€** |
| 7 | Andalucía: FN autonómica en la renta de Pilar si va individual; gastos educativos del hijo de 2018 | 200€ (o 100€ si se reparte) + 15 % hasta 150€/hijo | **0–350€** [Suposición] |
| 8 | Donativos: cargar `donativos_anual`, pedir certificado; completar hasta 250€ | 240€ × 80 % = 192€ (ya existe); +10€ donados → +8€ | **192€** (aflorar) |
| 9 | Adelantar a diciembre compras **necesarias** de los pisos (reposición, mantenimiento) | Gasto × 37–45 % (solo adelanta, no crea) | Según gasto |
| 10 | **NO** aportar al plan de pensiones de Alberto por motivo fiscal este año | Límite 30 % × actividad negativa = 0€ | Evita inmovilizar 1.500€ sin ahorro |
| — | **Coste a asumir:** regularizar IVA ISP (303/349 + ROI) y sacar de deducibles lo personal del §3.2 | 436–651€ IVA + (3.355,88€ × 37–45 % ≈ 1.242–1.510€ más de cuota) | **−1.678 a −2.161€** |

**Ahorro neto estimado:** acciones 1+2+8 (más firmes) **≈4.580–5.980€**; con 4, 6 y 7 hasta **≈8.410€**; +0–3.700€ si
hay plusvalías para compensar pérdidas de trading. Menos el coste de limpiar IVA y gastos personales (−1.678 a −2.161€).

## 5. Datos que faltan y a quién pedirlos
| Dato | Para qué | A quién |
|---|---|---|
| Recibo IBI 2026 de Socorro con valor catastral suelo/construcción + ITP/notaría/registro de 2015 | Amortización Socorro | Alberto (escritura / Ayto.) / Asecon |
| Desglose de los 3.052,26€ de gastos 2025 del Dúplex (base de amortización, limpiezas) | Acción 6 | Marta (Asecon) |
| Inventario de mobiliario de cada piso (fecha, importe) | Cuadro de amortización si se decide usarla | Alberto |
| Reconexión PSD2 de 6 cuentas (§0) y extracto de Punto y Coma BBVA ****9871 2026 | Gastos jul–sep e ingresos que faltan | Alberto |
| Asignar `propiedad_id` a los 187 cargos de pisos sin piso | Rendimiento por piso y reparto 50/50 de Socorro | Agente contable + OK de Alberto |
| Póliza Asisa (asegurados) | Tope 500€/persona | Asisa / Alberto |
| Modelo 233 por hijo (Estrella Polar) y anticipos Modelo 140 cobrados (meses con 1 abono en vez de 2) | Guardería y regularizar maternidad | Guardería / Pilar / AEAT |
| Certificado de donativos (Modelo 182) de la Fundación | Deducción 80 % | Fundación Sagrados Corazones |
| Informe fiscal anual de IBKR en euros (FIFO, regla de 2 meses) | Pérdidas y su compensación; Modelo 720 si >50.000€ | IBKR / Alberto |
| Facturas, ingresos y RETA de Pilar desde julio | Su base y su 130 | Pilar |
| ¿Alta en ROI? ¿303/349 presentados en 2026? ¿130 exento? | Riesgos 1 y 6 | Asecon |
| Extractos de liquidación de comisiones (bruto real; Occident sale deudor −1.784,76€) | Sustituir el bruto estimado ×0,15/0,85 | Compañías / `comisiones_devengo` |
| Contrato de subarriendo de Bustos Tavera 22 | Retención 19 % y justificación del gasto | Alberto / Asecon |

## 6. Qué debe validar la asesoría
Conjunta vs individual con las cifras reales; base de amortización de Socorro y Dúplex; si la correduría tiene que
presentar 130 y el IVA ISP pendiente (303/349/ROI); si los gastos de IA son afectos a la correduría; el subarriendo de
Bustos Tavera (retenciones); las deducciones andaluzas (FN, gastos educativos, deportiva); guardería por hijo.
**Bugs del motor detectados (no tocados):** donativos con umbral de 150€ (la ley dice 250€ desde 2024); guardería
topada a 1.000€ total; `getResumenFinanciero` sin reparto 50/50 de Socorro ni amortizaciones de inmuebles.
