# Spec — Vigilante de cobros OTA (Booking / Airbnb / Expedia)

**Fecha:** 2026-06-24
**Vertical:** `apps/plataforma` (módulo SIVRA / banca)
**Estado:** aprobado (diseño) — pendiente de plan de implementación

## Problema

Las OTAs pagan al anfitrión **después del check-out**, con desfase y restando comisión.
Hoy no hay forma de saber, de un vistazo, si **todo lo que ya debería estar cobrado lo está**.
El cuadre existente (`/api/duplex/cuadre-booking`) es un informe **agregado mensual** del Dúplex
y de solo lectura; no detecta una reserva concreta con check-out hecho que Booking aún no ha pagado.

Alberto quiere: **que su pantalla principal le avise SOLO cuando algo no cuadra** (un cobro que
debería haber entrado y no ha entrado, o un abono que no casa con ninguna reserva). Silencioso si
todo está bien.

## Objetivo y alcance

- **Reconciliar** las reservas con check-out pasado contra los abonos del banco, **por canal**.
- **Avisar en el dashboard** (`/dashboard`, banner existente vía `getAlertas`) cuando hay un
  **descuadre real y persistente** (pasado el margen del canal).
- Canales: **Booking, Airbnb** (pagan a los pocos días del checkout) y **Expedia** (paga ~1 mes después).
- **NO** en alcance v1: Telegram, página dedicada, emparejado por referencia exacta `NO.<ref>ID`,
  split por piso de los tres pisos no-Dúplex, marcar/resolver manualmente, tablas nuevas.

## Datos disponibles (verificado en BD)

- **`incomes`** (neto por reserva): `propertyId`, `portal` (`BOOKING|AIRBNB|EXPEDIA|AGODA|VRBO|DIRECTO|OTRO`),
  `amount` (neto; Booking ya × 0,8028 en el sync), `checkIn`, `checkOut`, `reservationId`, `guestName`.
- **`movimientos_bancarios`** (abonos): `importe>0`, `fecha_operacion`, `concepto`, `contraparte`,
  `referencia`, `destino`, `cuenta_bancaria_id` (→ `cuentas_bancarias.cuenta_id`, banco).
  - Abonos OTA reconocibles por `destino IN ('turistico_duplex','turistico_pisos')` **y** por el texto
    del concepto/contraparte: `Booking.com B.V.`, `Airbnb`, `Expedia`.
  - **Granularidad real:** el Dúplex va en `turistico_duplex`; los **otros tres pisos van agrupados** en
    `turistico_pisos`. ⇒ se reconcilia **por canal**, no por piso.
  - Cuidado con **duplicados** de importación (Excel↔PSD2): filtrar `duplicado_estado <> 'ignorado'`.

## Diseño

### Componente 1 — Lógica pura de reconciliación (`lib/sivra/cobros-ota.ts`, testeable)

Función pura `reconciliarCobrosOTA(reservas, abonos, hoy, config) → ResultadoCobros`.

- **Entrada:** lista de reservas OTA con check-out (de `incomes`), lista de abonos OTA del banco, fecha
  de hoy, y `config` de márgenes/umbral.
- **Por canal** (BOOKING, AIRBNB, EXPEDIA):
  1. Filtrar reservas del canal con `checkOut <= hoy` (ya terminadas).
  2. Emparejar cada reserva con un abono del canal por **importe ±0,02 €** dentro de la ventana
     `[checkOut, checkOut + margenDias[canal]]`. Cada abono se usa una sola vez (greedy por fecha).
  3. **Pendientes** = reservas del canal con `checkOut + margenDias < hoy` **sin** abono emparejado.
  4. **Huérfanos** = abonos del canal **sin** reserva emparejada (posible cobro raro/error).
  5. **Descuadre del canal** = `Σ neto(reservas vencidas) − Σ abonos(canal)`. Solo se reporta el canal
     si `descuadre > umbralEur` (anti-ruido por céntimos/redondeos de comisión).
- **Salida:** por canal → `{ pendientes: [{reservationId, guestName, checkOut, neto}], huerfanos: [...],
  faltanEur }`, y un `hayDescuadre: boolean` global.
- **Márgenes por canal (config, defaults):** BOOKING 7 d, AIRBNB 7 d, EXPEDIA 35 d.
- **Umbral de aviso (config, default):** `umbralEur = 50 €` (no avisar por descuadres menores).
- 100 % pura → tests `node --test` con fixtures (reserva pagada, pendiente pasada de margen, dentro de
  margen → no avisa, huérfano, Expedia con su margen largo, duplicado ignorado, céntimos < umbral).

### Componente 2 — Lectura de datos (`lib/sivra/cobros-ota.ts`, parte con BD)

`getEstadoCobrosOTA(cuentaId) → ResultadoCobros`:
- Lee `incomes` (portal IN OTA, checkOut no nulo, ventana últimos ~120 d para acotar) y
  `movimientos_bancarios` (abonos OTA, `duplicado_estado <> 'ignorado'`, scoped por `cuenta_id`).
- Clasifica cada abono a canal por el texto del concepto/contraparte (`Booking.com`, `Airbnb`, `Expedia`).
- Llama a la lógica pura y devuelve el resultado.

### Componente 3 — Aviso en el dashboard (`lib/banca.ts` → `getAlertas`)

- Añadir una alerta `cobrosPendientesOTA` al array que ya pinta el banner de `/dashboard`
  (mismo patrón que `facturasFaltantes`).
- Texto: `"⚠️ Booking: faltan ~340€ por cobrar — revisa: Gladys (checkout 18/06, 200€), …"`
  (una línea por canal con descuadre; máx. 3 reservas citadas por canal).
- Solo se añade si `hayDescuadre`. Si todo cuadra, no aparece → silencioso.
- Se recalcula en cada carga del dashboard (sin estado) → un cobro solo retrasado **hace desaparecer
  el aviso solo** cuando entra.

### Componente 4 — (opcional) Cron de cálculo

v1 calcula al vuelo en el dashboard (suficiente, sin estado nuevo). **No** se añade cron en v1.
Si el cálculo resultara pesado, fase 2 lo precalcula en un cron diario a una tabla cacheada.

## Casos límite

- **Mismo importe en dos reservas:** el emparejado greedy por fecha asigna el abono a la más antigua
  dentro de ventana; si sobra/falta, lo absorbe el descuadre agregado (no genera falso pendiente si el
  total del canal cuadra).
- **Duplicados Excel↔PSD2:** excluidos por `duplicado_estado <> 'ignorado'`.
- **Comisión variable / céntimos:** tolerancia ±0,02 € en el match individual y `umbralEur` en el
  agregado evitan ruido.
- **Reserva cancelada tras checkout:** ya no está en `incomes` (el sync la borra) → no cuenta.
- **Expedia:** margen 35 d para no marcar pendiente algo que aún está en su plazo normal.

## Criterio de éxito

- Si una reserva Booking/Airbnb hizo checkout hace > 7 d (Expedia > 35 d) y no hay abono que la cubra,
  y el canal queda descuadrado > 50 €, aparece **un** aviso claro en `/dashboard` nombrando las reservas
  sospechosas. En cuanto entra el abono, el aviso desaparece sin intervención.
- Cero avisos cuando todo está cobrado o el desfase está dentro del margen.
- Lógica pura cubierta por tests.

## Archivos

- **Nuevo:** `apps/plataforma/lib/sivra/cobros-ota.ts` (lógica pura + lectura BD).
- **Nuevo:** `apps/plataforma/lib/sivra/cobros-ota.test.ts` (`node --test`).
- **Editar:** `apps/plataforma/lib/banca.ts` (`getAlertas` → añadir `cobrosPendientesOTA`).
- Sin migraciones, sin tablas nuevas, sin envs nuevas.
