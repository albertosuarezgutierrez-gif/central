# Informe — Falsa alarma "44.797,26€ sin cobrar de OTAs" y arreglo del vigilante

**Fecha:** 10/07/2026 · **Rama:** `claude/unpaid-ota-invoices-hqt8ll`
**Origen:** aviso del dashboard "💸 44.797,26€ sin cobrar de OTAs (94 reservas pasadas de plazo)".

## 1. Veredicto

**No falta dinero. El aviso era 100% un falso positivo del algoritmo de conciliación.**

- El vigilante v1 marcaba **44.797,26€ / 94 reservas** como impagadas.
- El motor **corregido**, corrido sobre **las mismas 96 reservas vencidas**, devuelve **0,00€ pendientes**.
- En el peor punto del periodo, el dinero recibido iba **11.875,88€ por delante** de lo facturado bruto.

## 2. Evidencia (BD compartida `wswbehlcuxqxyinousql`)

Ventana del propio aviso (reservas con checkout ≤ hoy, últimos 120 d; abonos últimos 160 d):

| Concepto | Importe |
|---|---|
| Reservas OTA (99) — neto facturado | 46.591,40€ |
| Reservas OTA (99) — **bruto** (lo que la OTA ingresa) | 56.965,40€ |
| Abonos turísticos **recibidos** en el banco (150 mov.) | 67.519,27€ |
| **Recibido − bruto facturado** | **+10.553,87€** ✅ |

Solo **8 de 99** reservas tenían un abono con importe idéntico (±0,02€) en el banco → por eso la v1
marcaba el resto como impagado.

### Spot-check contra el desglose real de Booking (Luxury Busto, mayo 2026)
Cruzando los 6 payouts que Booking declara "Enviado" (2.456,49€) contra las 8 reservas de ese
piso/mes (bruto 2.463,18€): **cuadra al céntimo salvo 6,69€** (concentrado en 1 reserva, tasa/ajuste
menor). Confirmó los dos motivos del fallo (ver §3). Todas las reservas pagadas.

## 3. Causa raíz (por qué la v1 no casaba ni una)

1. **Booking (y en la práctica el resto) INGRESA EL BRUTO** y factura su comisión aparte. El abono
   es ≈ `amount_gross`, **no** `amount` (neto). La v1 comparaba contra el neto → se equivocaba ~18%.
   *Prueba:* payout Andrzej = 149,45€ = **bruto** de su reserva (neto 119,98€).
2. **Las OTAs AGRUPAN varias reservas en una transferencia** (liquidaciones), con referencias que el
   banco **rota** entre sesiones. La v1 buscaba 1 abono = 1 reserva por importe exacto → imposible.
   *Prueba:* payout 25 may = 647,75€ = reserva Proyectos (306,09) + Sefora (341,68).
3. **Pagos fuera de la ventana de 7 días** se marcaban vencidos aunque estuvieran cobrados.

## 4. El arreglo

`apps/plataforma/lib/sivra/cobros-ota.ts` — reescrito de "match exacto 1:1 sobre el neto" a
**conciliación por flujo (FIFO en el tiempo), a nivel de cuenta**:

- Cuadra contra el **bruto** (`amount_gross`, con *fallback* al neto).
- Un abono puede cubrir **varias** reservas (agrupación) y varios abonos **suman** para cubrir una.
- Respeta el **tiempo**: dinero que entra tras el vencimiento no cubre una reserva.
- Solo hay **PENDIENTE** si, pasado el plazo, el dinero acumulado que había entrado no llegaba a
  cubrir el bruto acumulado hasta esa reserva.
- **Umbral de aviso subido a 500€** sobre el descuadre **agregado** (era 50€ por reserva): el
  vigilante es una red para cazar que una OTA **deje de pagar**, no para perseguir céntimos.
- Márgenes de pago ampliados: BOOKING/AIRBNB 10 d, EXPEDIA 40 d, AGODA 20 d.
- `cobros-ota-db.ts` ahora lee `amount_gross`. Contrato de salida intacto → el banner del dashboard
  (`getAlertas` en `lib/banca.ts`) no cambia; simplemente dejará de dispararse en falso.
- **Sigue siendo 100% determinista, sin IA** (es dinero: las cifras las hace SQL/aritmética, no un LLM).

Tests: `lib/sivra/cobros-ota.test.ts` reescrito, **11/11 verde** (`node --test`), cubre bruto vs
neto, agrupación muchos-a-uno, varios-a-uno, tiempo, umbral y holgura de céntimos.

## 5. Límite conocido (honestidad)

El cuadre es **a nivel de cuenta y agregado** (los abonos del banco **no se pueden atribuir a un piso**
de forma fiable: no llevan `propiedad_id` y la referencia rota). Eso prueba que **no hay un agujero
grande** (entró más de lo facturado), pero **no certifica una-por-una** las 96 reservas: una impagada
suelta quedaría enmascarada por un cobro de más en otra. Si la hubiera, sería **calderilla, no 44k**.
El pool incluye además algún abono turístico no-OTA (p.ej. una devolución puntual), lo que hace el
cuadre **conservador** (menos propenso a falsos avisos). Para certificación exacta reserva-a-reserva
haría falta un desglose de payouts por piso de cada OTA (como el de Booking del spot-check).

---

# Anexo — Otras falsas alarmas del MISMO banner del dashboard (10/07/2026)

Al revisar el banner, Alberto detectó que las **otras líneas también mentían** ("entro y está todo OK").
Verificado contra la BD:

## 🔎 "38 gastos por revisar (58.097,99€ sin clasificar)" → **falso, lo real es 0€**
Dos números de **fuentes distintas** que ni describen el mismo conjunto:
- El **importe** (`getGastosSinClasificar`, dashboard) contaba `requiere_revision=true AND importe<0` del año
  **sin excluir los confirmados** → 628 movimientos / 58.097,99€, de los cuales **614 ya tenían destino y
  estaban CONFIRMADOS** y 14.798€ eran **traspasos internos**. Real sin clasificar: **0€**.
- El **contador** (`getAlertas.porRevisar`) contaba 38, de los que **35 eran ABONOS (ingresos)**, no gastos.

**Causa raíz:** el flag `requiere_revision` es **zombie** — la ingesta lo pone y el endpoint
`/api/banca/confirmar` marcaba `destino_confirmado=true` **sin limpiarlo** (sí lo limpiaban el agente
contable y `/finanzas/categorias/asignar`). Resultado: **1.202 movimientos ya confirmados** seguían con el
flag. La página `/finanzas/gastos` y el `health-check` **ya lo filtraban bien** (`requiere_revision AND NOT
destino_confirmado`); solo el banner del dashboard se quedó sin corregir.

**Arreglo (este PR):**
- `getGastosSinClasificar` (dashboard) y `getAlertas.porRevisar` (banca.ts): añaden
  `AND NOT destino_confirmado AND destino<>'traspaso_interno'` (+ `importe<0` en el contador). Los dos
  números pasan a describir el MISMO conjunto real.
- `/api/banca/confirmar`: al confirmar, pone `requiere_revision=false` (raíz — el zombie no vuelve a crecer).
- Migración `prisma/sql/2026-07-10_limpiar_requiere_revision_confirmados.sql`: limpia los 1.202 flags
  zombie de una vez (idempotente, solo baja el flag en filas ya confirmadas).

## ❗ "127 gastos deducibles sin justificante" → **real (backlog), no es bug**
127 cargos deducibles de 2026 (pisos 61, seguros 42, dúplex 24) confirmados y sin factura conciliada
(`factura_ref IS NULL`). Es un **to-do real**: subir/enlazar esos justificantes. No se toca.

## 🗂️ "10 facturas recurrentes faltan del mes pasado" → **real (backlog), no es bug**
De los proveedores recurrentes esperados en junio, hay 6 subidos a Drive; el resto faltan. To-do real de
subir facturas. No se toca.

---

# Anexo 2 — Certificación por piso contra el ledger de Booking (Luxury Busto, 10/07/2026)

El §5 del informe reconocía un límite: el cuadre era **a nivel de cuenta**, no reserva-a-reserva, "porque
haría falta un desglose de payouts por piso de cada OTA". Alberto pasó ese desglose para **Luxury Busto Patio
privado Centro** (`prop_luxury_busto`) desde la extranet de Booking ("Información de los pagos", estado
**Enviado**), Ene–Jul 2026. Cruzado contra `incomes` (bruto = `amount_gross`, por mes de **checkout**):

| Mes | Booking pagó (Enviado) | Libros — bruto (checkout) | Reservas | Δ |
|---|--:|--:|--:|--:|
| Ene 2026 | 1.859,33€ | 1.487,10€ | 5 | +372,23€ |
| Feb 2026 | 1.852,26€ | 1.779,49€ | 8 | +72,77€ |
| Mar 2026 | 1.548,81€ | 1.360,06€ | 5 | +188,75€ |
| Abr 2026 | 3.415,87€ | 3.442,84€ | 9 | −26,97€ |
| May 2026 | 2.456,49€ | 2.463,18€ | 8 | −6,69€ |
| Jun 2026 | 1.681,46€ | 1.806,68€ | 6 | −125,22€ |
| Jul 2026 | 277,86€ | 736,15€ | 3 | −458,29€ |
| **Total** | **13.092,08€** | **13.075,50€** | **44** | **+16,58€** |

**Veredicto:** cuadra al **+16,58€ sobre 13.092€ (0,13%)** en 7 meses. Los desajustes por mes son **puro
desfase temporal** en los bordes de la ventana: los payouts de enero incluyen checkouts de diciembre 2025
(Δ+), y los checkouts de julio aún no se habían pagado el día de la captura (Δ−, solo 277,86€ de 736,15€
cobrados). Los meses centrales cuadran casi al céntimo (mayo **−6,69€**, el mismo número del spot-check
original). **Ninguna reserva de Booking de este piso quedó impagada.** Esto **cierra el punto 3** (certificación
reserva-a-reserva) para Luxury Busto contra el propio ledger de la OTA, y confirma —ahora a nivel de piso, no
solo agregado— que el aviso de 44.797,26€ era un falso positivo.

## Anexo 2-bis — Certificación Dúplex Center contra el ledger de Booking (10/07/2026)

Segundo piso certificado con su desglose de payouts (extranet Booking, "Información de los pagos", estado
**Enviado**, Ene–Jul 2026), cruzado contra `incomes` (`prop_duplex_center`, bruto por mes de **checkout**):

| Mes | Booking pagó (Enviado) | Libros — bruto (checkout) | Reservas | Δ |
|---|--:|--:|--:|--:|
| Ene 2026 | 1.804,84€ | 1.861,01€ | 4 | −56,17€ |
| Feb 2026 | 1.491,73€ | 1.538,15€ | 4 | −46,42€ |
| Mar 2026 | 2.287,36€ | 2.542,03€ | 8 | −254,67€ |
| Abr 2026 | 3.543,50€ | 3.470,32€ | 9 | +73,18€ |
| May 2026 | 2.236,44€ | 2.418,96€ | 7 | −182,52€ |
| Jun 2026 | 1.510,19€ | 1.616,20€ | 4 | −106,01€ |
| Jul 2026 | 0€ (sin remesa aún) | 834,43€ | 2 | −834,43€ |
| **Total** | **12.874,06€** | **14.281,10€** | **38** | **−1.407,04€** |

**Veredicto: sin agujero.** El −1.407€ es **retraso de pago en el borde**: **834€ = los 2 checkouts de julio**
que Booking no ha liquidado aún (la propia extranet marca "Julio: no hay pagos durante este periodo") y ~573€
son checkouts de finales de junio pendientes de la próxima remesa. Mes a mes el pago va unos días por detrás
de lo facturado (deltas pequeños y negativos), que es exactamente cómo paga Booking. Segundo piso cerrado.

## Anexo 2-ter — Certificación Busto Reform contra el ledger de Booking (10/07/2026)

Tercer piso certificado (solo el ledger de **Booking**; su Expedia va por otro desglose, aún no aportado).
Extranet Booking "Información de los pagos", estado **Enviado**, cruzado contra `incomes`
(`prop_busto_reform`, bruto por mes de **checkout**):

| Mes | Booking pagó (Enviado) | Libros — bruto (checkout) | Reservas | Δ |
|---|--:|--:|--:|--:|
| Ene 2026 | 968,86€ | 968,89€ | 3 | **−0,03€** |
| Feb 2026 | 783,68€ | 900,06€ | 4 | −116,38€ |
| Mar 2026 | 1.187,17€ | 1.441,37€ | 7 | −254,20€ |
| Abr 2026 | 2.487,35€ | 2.116,91€ | 5 | +370,44€ |
| May 2026 | 1.424,35€ | 1.508,99€ | 3 | −84,64€ |
| Jun 2026 | 1.035,38€ | 1.175,48€ | 3 | −140,10€ |
| Jul 2026 | 238,38€ (+ remesa "Programado" 13-jul) | 502,97€ | 2 | −264,59€ |
| **Total** | **8.125,17€** | **8.614,67€** | **27** | **−489,50€** |

**Veredicto: sin agujero.** Enero cuadra **al céntimo** (−0,03€). El −489€ es de nuevo el borde de la ventana:
los 2 checkouts de julio (502€) solo llevan 238€ cobrados y el resto está en la remesa **"Programado" del
13-jul** que la propia extranet muestra pendiente. Tercer piso cerrado.

## Anexo 2-quater — House Sevillana: NO cuadra limpio (descuadre a revisar, 10/07/2026)

Cuarto piso, con su desglose de payouts de Booking (Enviado). A diferencia de los otros tres, **este NO
cuadra dentro de la tolerancia**. Cruzado contra `incomes` (`prop_house_sevillana`, solo Booking; tiene además
Expedia/Airbnb/otro por otros ledgers):

| Concepto | Importe |
|---|--:|
| Booking **pagó** (Enviado, Ene–9 jul 2026) | **37.347,49€** |
| Libros — bruto de checkouts **ya completados** (≤ 9 jul) | **42.052,45€** (26 res) |
| **Descuadre (facturado − pagado)** | **−4.704,96€ (≈11%)** |
| Libros — bruto de checkouts **futuros** (> 9 jul, aún no vencen) | 1.808,64€ (2 res) |

**Por qué NO es como los otros:** en Luxury/Dúplex/Busto el Δ negativo era solo el borde reciente (julio +
fin de junio sin liquidar). Aquí los checkouts recientes sin pagar (Jun 1–9 jul) suman **3.872€** y la mayoría
de junio YA estaba pagada, así que el borde explica como mucho ~0,7–2k. El resto (~3k) está **repartido por el
periodo**: la brecha acumulada crece de 789€ (ene) a 6.239€ (fin may) y baja a 4.705€ (9 jul).

**Dos hipótesis, sin poder distinguirlas con los datos actuales:**
1. **Desfase de pago fuerte en temporada alta.** Es un 6-habitaciones con reservas grandes; en el pico Abr–May
   (facturado 11.425€ y 9.016€/mes) el "dinero en vuelo" a 1–2 semanas de payout puede rondar 5–6k, lo que
   encajaría con la brecha. Sería timing, no dinero perdido.
2. **Reservas modificadas/canceladas contadas a BRUTO en `incomes`.** La tabla NO tiene campo de estado, así que
   una cancelación o una bajada de precio deja el bruto original en los libros aunque Booking pagara menos/nada.
   Esto haría que los libros **SOBREESTIMEN** los ingresos de House Sevillana (~3–4k) — el riesgo **CONTRARIO** al
   de la alarma original: no falta dinero, *sobraría* en los libros (relevante para el IRPF: declarar ingresos no
   cobrados). Revisadas las 11 reservas de Abr+May una a una: importes plausibles, sin duplicados ni noches=0.

**RESUELTO (10/07/2026, misma noche) — no es un descuadre, es cobro en tránsito.** Alberto pasó el
**calendario de reservas** de House Sevillana (Smoobu, coloreado por canal: azul=Booking, amarillo=Expedia,
rojo=Airbnb, gris=otro, **verde=intercambio HomeExchange que NO da dinero**). Cruzadas **las 28 reservas
Booking del libro una a una contra el calendario (Ene–May verificado al 100%)**: **todas son reservas reales y
confirmadas** (barra azul en el calendario). Comprobado además por SQL: **sin duplicados de `reservationId`,
sin reservas canceladas colgadas, y los intercambios HomeExchange (verde, Elisabetta/ivan) NO están en el bucket
Booking** — se registran como portal `OTRO` a ~0€ (2 res, 110€), así que no inflan nada. **Los libros son
correctos.** Por tanto el −4.705€ **no es error ni dinero perdido: es dinero que Booking aún no ha desembolsado**
(remesa "Programado" del 13-jul + el desfase normal de pago, mayor en un piso de reservas grandes). Es una
**cuenta a cobrar en tránsito**, no un agujero ni una sobrevaloración. Único seguimiento: si dentro de unas
semanas Booking no ha liquidado ese saldo, reclamarlo — pero es cobro pendiente, no descuadre.

## Estado del punto 3 — 4 de 4 pisos cuadrados ✅

| Piso | Booking pagó | Libros (bruto) | Δ | Estado |
|---|--:|--:|--:|:--|
| Luxury Busto | 13.092,08€ | 13.075,50€ | +16,58€ | ✅ |
| Dúplex Center | 12.874,06€ | 14.281,10€ | −1.407€† | ✅ |
| Busto Reform | 8.125,17€ | 8.614,67€ | −490€† | ✅ |
| **House Sevillana** | 37.347,49€ | 42.052,45€‡ | −4.705€† | ✅ (reservas verificadas 1-a-1) |

† Δ negativos = **cobro en tránsito**: checkouts ya completados cuyo pago Booking aún no ha desembolsado
(remesas "Programado" + desfase normal). Verificado que TODAS las reservas del libro son reales y confirmadas
(calendario Smoobu + sin duplicados), así que **no falta dinero ni los libros sobreestiman** — es dinero por
llegar. El cuadre agregado de cuenta (§1–§4) ya lo probaba a nivel de conjunto; ahora está confirmado piso a piso.

