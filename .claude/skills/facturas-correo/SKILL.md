---
name: facturas-correo
description: Agente PROGRAMADO que revisa el Gmail de Alberto buscando facturas/justificantes de gasto, los clasifica (personal vs negocio deducible), archiva en Google Drive los deducibles y los concilia con los movimientos bancarios de plataforma. Úsala cuando Alberto pida "revisa mis correos/facturas", o cuando la dispare el trigger diario de Claude Code web. NO es un proceso 24/7: se despierta, hace una pasada sobre lo nuevo y deja un resumen.
---

# Agente de facturas por correo — casa de marcas (Alberto)

Revisa el buzón, separa lo que es **gasto de negocio deducible** de lo **personal**,
archiva los justificantes deducibles en Drive y los cruza con el banco. Entorno **efímero**:
cada ejecución es una pasada completa e idempotente (se apoya en una etiqueta de Gmail para no
reprocesar). Pensada para correr 1×/día por un trigger de Claude Code web, o a petición.

## Herramientas (MCP de la sesión)
- **Gmail**: `search_threads`, `get_thread` (FULL_CONTENT), `list_labels`, `create_label`,
  `label_message`. (Las facturas suelen venir como PDF adjunto o como cuerpo HTML reenviado.)
- **Google Drive**: `search_files`, `create_file`, `get_file_metadata` (archivar justificantes).
- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` para conciliar contra `movimientos_bancarios`.

## Estado / idempotencia (clave — NO reprocesar)
- Etiqueta de Gmail **`Facturas/Procesado`**. Al terminar con un correo, etiquétalo.
- La query de entrada SIEMPRE excluye `-label:Facturas/Procesado`. Si la etiqueta no existe, créala
  (`create_label`) en la primera ejecución.

## Paso 1 — Localizar candidatos (Gmail)
Query base (ventana corta para la pasada diaria; amplía a `newer_than:30d` en la primera):

```
newer_than:2d -label:Facturas/Procesado -in:draft
( subject:(factura OR justificante OR recibo OR invoice OR receipt OR pedido OR "ticket")
  OR has:attachment filename:pdf
  OR from:(pricelabs.co OR amazon OR ionos OR booking OR smoobu OR stripe OR endesa OR emasesa OR digi OR mgx.cabify.com) )
```
Incluye también los **reenvíos de `pilar.pina.franco@gmail.com`** que sean justificantes de compra.
Descarta newsletters, citas de calendario (`Invitación:`/`Aceptado:`), promociones, **notificaciones operativas de Cabify** que NO sean recibo (`¡Tu viaje ha finalizado sin cambios!`, `¡Esto solo acaba de empezar!`, emails de invitaciones/descuentos) y **notificaciones operativas de la correduría** (recibos devueltos de clientes, avisos de emisión, circulares de compañías aseguradoras — Allianz, Mapfre, Generali, Occident — que NO sean facturas a nombre de Alberto).

Para cada candidato: `get_thread` FULL_CONTENT → extrae **emisor, fecha, importe(s), concepto,
a nombre de quién, método de pago** del cuerpo o del PDF adjunto.

## Paso 2 — Clasificar (mismas reglas que `apps/plataforma/lib/categorizar.ts`)
`destino` ∈ { turistico_pisos, turistico_duplex, seguros, personal } (traspaso_interno no aplica aquí).

- **turistico_pisos (deducible):** BOOKING, EXPEDIA, AIRBNB, STRIPE, SMOOBU, PRICELABS, IONOS
  (dominios), IKEA/LEROY/BRICO/FERRETER (mobiliario pisos), TASKRABBIT (montaje/instalación en pisos),
  SIQUE (limpieza), EMASESA (agua), ENDESA/TOTALENERGIES (luz), DIGI (internet),
  DIMITRI (mantenimiento), D CULTO (comida empresa).
- **turistico_duplex (deducible):** COMUNIDAD, PASAJE FRANCISCO, **PASAJE/FRANCISCO MOLINA**,
  **VILLASÍS** y suministros del dúplex. ⚠️ El **dúplex = "Villasís"** son el **mismo piso** (Pasaje
  Villasís 1 / Pasaje Francisco Molina 4, dos accesos); tributa en el **IRPF personal de Alberto**.
- **seguros (correduría, deducible):** compañías de seguros (Generali, Allianz, Mapfre, Caser, Anthropic Ireland — API Claude…), **CABIFY** (desplazamientos de la correduría — el recibo llega de `no-reply@mgx.cabify.com` con asunto `Alberto, tu viaje por X €`; incluye origen/destino/importe).
- **personal (NO deducible):** Círculo Mercantil / natación / gimnasio / colegio / vacunas /
  compras de familia (**Pilar = la esposa**, los hijos, Carmen…), IBI de la vivienda habitual
  (Monte Carmelo), y **trading** (FTMO / retos de bróker, cuenta Interactive Brokers).

### Reenvíos de Pilar (pilar.pina.franco@gmail.com) — regla especial
Los reenvíos de Pilar pueden ser tanto personales como de pisos. **NUNCA auto-clasificar** si el
concepto puede ir a cualquier lado. Regla:
- Círculo Mercantil, natación, colegio, farmacia, supermercado → **personal** (auto).
- Taskrabbit, fontanero, electricista, tiendas de muebles/hogar, Amazon, ferretería → **"Para tu decisión"** (pregunta siempre: ¿es para los pisos o personal?).
- Proveedores claramente de pisos (IKEA con dirección de piso, Sique, Emasesa…) → **turistico_pisos** (auto solo si el concepto lo deja claro).

> Contexto fijo: Dúplex (= **Villasís**) = **Pasaje Francisco Molina / Pasaje Villasís** (no Monte
> Carmelo, que es la vivienda habitual). Pisos turísticos en Kutxa; Dúplex + correduría en BBVA.
> Detalle en `apps/sivra/docs/contabilidad.md`.
>
> **Tratamiento fiscal (IRPF) → skill `perfil-fiscal`.** Resumen de lo que NO es "destino" sino
> tributación: **Socorro** y el **dúplex/Villasís** tributan en el **IRPF personal** de Alberto
> (Socorro 50/50 con Pilar) aunque cobren en cuentas de la **sociedad Punto y Coma SL**. Reglas de
> gasto que esta skill NO debe tratar como gasto corriente del año: **notaría/registro de
> compraventa** = coste de adquisición; **mobiliario y obras** (IKEA, aire acond., fachada) = a
> **amortizar**. Los pagos al Ayto. de ~19,5 € son **tasa de basura**, no IBI.

## Paso 3 — Archivar en Drive (solo deducibles)
Estructura: **`Facturas / <año> / <negocio>`** (p. ej. `Facturas/2026/Pisos turísticos`).
- `search_files` para encontrar/crear la carpeta del año/negocio (créala con `create_file` tipo carpeta si falta).
- Nombre del fichero: `YYYY-MM-DD_emisor_importe.pdf` (ej. `2026-06-08_pricelabs_64.96USD.pdf`).
- Si el correo trae **PDF/imagen adjunta** → súbela. Si el justificante es solo **cuerpo HTML**
  (p. ej. Círculo Mercantil) → guarda el cuerpo como documento (`create_file`) con el mismo nombre.
- Los **personales NO se archivan** (no hacen falta para el gestor).

## Paso 4 — Conciliar con el banco (Supabase)
Por cada factura, busca su cargo:
```sql
SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.destino, mb.conciliado
FROM movimientos_bancarios mb
JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
WHERE cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
  AND abs(mb.importe + <importe_factura>) < 0.02          -- gasto del mismo importe
  AND mb.fecha_operacion BETWEEN <fecha_factura>::date - 7 AND <fecha_factura>::date + 7
ORDER BY abs(mb.fecha_operacion - <fecha_factura>::date) LIMIT 3;
```
- **Encontrado** → factura ↔ movimiento casados; si el `destino` del movimiento no coincide con
  la clasificación, propón corregirlo (UPDATE, scoped por `cuenta_id`).
- **No encontrado** → el cargo aún no ha entrado en el banco (factura pagada hoy / extracto sin subir).
  Déjalo en "pendiente de que entre el movimiento".

## Paso 5 — Etiquetar y resumir
- `label_message` `Facturas/Procesado` en cada correo tratado (idempotencia).
- Resumen a Alberto, en tres bloques:
  1. **Deducibles archivados** — emisor · importe · negocio · enlace Drive · conciliación (✅/⏳).
  2. **Personales** — emisor · importe · a nombre de quién (no archivado).
  3. **Para tu decisión** — los ambiguos, con la duda concreta.
- NO escribas en `movimientos_bancarios` salvo correcciones de `destino` obvias; lo dudoso se pregunta.

## Trigger (paso MANUAL de Alberto, 1 sola vez)
Claude Code web → crear **trigger programado diario** que lance una sesión con el prompt:
«Ejecuta la skill `facturas-correo`». El entorno debe tener conectados los MCP de Gmail, Google
Drive y Supabase (los mismos de esta sesión). Sin el trigger, la skill solo corre cuando Alberto la pide.

## Límites v1
- Entorno efímero → es por pasadas, no vigilancia continua.
- OCR de PDF: si el importe no está en el cuerpo, ábrelo del adjunto; si no se puede leer, va a "para tu decisión".
- Multi-tenant: toda query de banco SIEMPRE scoped por `cuenta_id`.
