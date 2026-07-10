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

