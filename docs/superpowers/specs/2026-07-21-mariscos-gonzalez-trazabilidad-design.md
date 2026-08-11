# Mariscos González — Programa de trazabilidad + pesaje + etiquetado (Fase 1)

> Fecha: 2026-07-21 · Estado: **spec aprobado (alcance confirmado por Alberto)** · Rama: `claude/mariscos-gonzalez-programa-86q2oo`
> Origen: reunión de Alberto con **Maricarmen** (Mariscos González), transcrita en Drive `Mariscos gonzales 1_original.txt`.
> Mariscos González ya es cliente de la casa de marcas (usan `apps/rrhh` / iarrhh, responsable RR.HH. Pilar Piña).

## El problema (de la reunión)

Mariscos González es un **mayorista/pescadería de marisco y pescado**. Hoy hacen la trazadibilidad y el
etiquetado **casi todo a mano**. Puntos textuales de Maricarmen:

1. **Recepción.** El género llega de proveedores (la empresa de los barcos / lonja / subasta) con un
   **albarán** que trae todos los datos de la partida: **marea** (salida de pesca), **barco** que la pescó,
   **fecha de captura**, **caducidad**, **nº de lote** y **nº de albarán**. Hoy lo **apuntan a mano**.
2. **Cámara y re-envasado.** El producto entra en cámara; luego se coge para **re-envasar** en formatos de
   venta. **El error que le duele:** al re-envasar **se cambia el nº de lote**. Ella quiere **vender
   manteniendo el MISMO lote con el que entró**, para poder **trazar hasta la partida/proveedor original**
   ante cualquier incidencia. Al envasar se añade **fecha de envasado**, **caducidad** (~2 años en congelado)
   y el **lote**.
3. **Etiqueta por canal.** Para **catering / bares / hotel** (va en factura) la etiqueta **DEBE llevar el nº
   de lote**. Para **venta de mostrador (ticket)** **no** hace falta el nº de lote.
4. **Precio por calibre.** Llega en cajas (p. ej. 20 kg); según el **calibre/tamaño** va a **un precio u otro**.
5. **Ya tienen báscula y etiquetadora.** Alberto propuso **etiquetado electrónico** con **sincronización de
   peso automática** contra su hardware.

## Alcance por fases

- **Fase 1 (ESTE spec) — Trazabilidad + etiqueta, software-first (sin depender del hardware):**
  recepción de partidas con datos del albarán → envasado que **hereda el lote de origen** → pesaje **manual**
  (se teclea el peso) → **etiqueta por canal** (con lote para catering/hotel, sin lote para mostrador),
  imprimible desde el navegador.
- **Fase 2 — Hardware:** integración real con báscula (auto-peso) y etiquetadora, según marca/modelo
  (pendiente de conocer: Dibal / Bizerba / Epelsa / …).
- **Fase 3 (si procede):** tienda/pedidos online y factura a clientes de catering.

## Arquitectura

Sigue la matriz del monorepo: **vertical `apps/mariscos`** (Next.js 15 App Router, su `package.json`/
`vercel.json` con `ignoreCommand`, proyecto Vercel propio) que **compone el módulo puro
`@central/module-pesca`** (lógica de trazabilidad pesquera, sin BD/secretos). BD **compartida** del holding
(scope `cuenta_id`), tablas con prefijo `mariscos_`. Branding Mariscos González (azul marino `#1B3461`,
logo ya en `apps/rrhh/public/logos/mariscos-gonzalez.png`).

### `@central/module-pesca` (lógica pura, portable a cualquier pescadería)

- **Tipos:** `Partida` (lote recibido), `Envasado` (unidad de venta), `Canal` (`mostrador|catering|hotel`),
  `EtiquetaPayload`.
- **Reglas:**
  - `canalLlevaLote(canal)` → `catering|hotel ⇒ true`, `mostrador ⇒ false` (la regla clave de la reunión).
  - `construirEtiqueta(partida, envasado)` → **hereda `loteOrigen` de la partida** (nunca genera uno nuevo),
    añade la info pesquera obligatoria al consumidor (denominación comercial + nombre científico, método de
    producción, zona de captura FAO, arte de pesca) y muestra el **lote solo si el canal lo exige**.
  - `importe(pesoKg, precioKg)`, `pesoEnvasadoTotalKg(envasados)`, `stockRestanteKg(partida, envasados)`.
  - `validarPartida(input)` y `validarEnvasado(partida, envasados, input)` (peso > 0 y ≤ stock restante).

### `apps/mariscos` (vertical)

- Auth propio (`mariscos_session`, `MARISCOS_SESSION_SECRET`, guardián de secretos) contra `cuentas`.
- **Páginas:** `/login`, `/dashboard` (KPIs: partidas en cámara, kg y valor en stock, envasados de hoy),
  `/partidas` (lista + alta de recepción), `/partidas/[id]` (detalle del albarán + envasar + etiquetas),
  `/etiquetas` (reimpresión), `/etiqueta/[id]` (vista imprimible de la etiqueta).
- **APIs:** `POST /api/partidas`, `POST /api/envasados`, auth login/logout.
- Todo responsive (regla global) y dinero en formato español `1.234,50€` (helper `eur()`).

### Datos (BD compartida, prefijo `mariscos_`)

- `mariscos_partidas` — recepción: producto, especie/nombre científico, proveedor, `lote_origen`, albarán,
  marea, barco, zona_captura FAO, arte_pesca, método_producción, fecha_captura, fecha_recepción,
  fecha_caducidad, calibre, peso_recibido_kg, precio_compra_kg, precio_venta_kg, estado, notas.
- `mariscos_envasados` — venta: `partida_id` (FK, hereda el lote), canal, peso_kg, precio_kg, importe,
  fecha_envasado, fecha_caducidad, cliente, código.

La **cadena de trazabilidad** es `envasado → partida → (proveedor, barco, marea, lote_origen, captura)`. La
etiqueta imprime `lote_origen` (no uno nuevo), resolviendo exactamente el dolor de Maricarmen.

## Fuera de alcance (Fase 1)

Integración con báscula/etiquetadora física, tienda online, facturación, control de stock por ubicación de
cámara, y despiece/transformación multi-nivel (un lote → varios sub-lotes con merma). Se abordan en fases
posteriores.

## Criterios de aceptación

1. Se da de alta una recepción con todos los datos del albarán sin papel.
2. Al envasar, la unidad de venta **conserva el lote de origen**; la etiqueta lo demuestra.
3. La etiqueta de **catering/hotel lleva lote**; la de **mostrador no**.
4. El dashboard refleja kg y valor en cámara y descuenta lo envasado.
5. Todo usable en móvil y con dinero en formato español.
