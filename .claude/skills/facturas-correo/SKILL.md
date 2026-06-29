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
- **Gmail (conector gestionado)**: `search_threads`, `get_thread` (FULL_CONTENT), `list_labels`,
  `create_label`, `label_message`/`label_thread`. (Las facturas suelen venir como PDF adjunto o como
  cuerpo HTML reenviado.) ⚠️ **Este conector NO descarga el contenido de los adjuntos**: `get_thread`
  da el asunto, el cuerpo y los *IDs* de los PDF, pero no los bytes. → ver "Leer importes dentro de PDF".
- **Google Drive**: `search_files`, `create_file`, `get_file_metadata` (archivar justificantes) y
  **`read_file_content`** (lee PDFs y devuelve el texto). Los PDF de los correos ya llegan a Drive vía
  el Apps Script (carpeta `_buzon_pdf`) → ver "Leer importes dentro de PDF — VÍA B ACTIVA".
- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` para conciliar contra `movimientos_bancarios`.

### Leer importes dentro de PDF — VÍA B ACTIVA (Apps Script → Drive)
✅ **Montado y funcionando (22/06/2026).** El conector Gmail gestionado NO baja adjuntos, así que un
**Apps Script de Alberto** (`Facturas a Drive`, trigger horario) copia todos los PDF de correos
recientes a una carpeta de Drive y etiqueta el hilo en Gmail como `PDF-guardado`. El agente lee esos
PDF con `read_file_content` (devuelve el texto íntegro) y de ahí saca el importe.
- **Carpeta:** `FACTURAS Apartamentos / _buzon_pdf` — **fileId `1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh`**.
- **Nombre de fichero:** `YYYY-MM-DD_remitente_archivooriginal.pdf` (p. ej.
  `2026-06-22_ZGZ-AdministracionD2C@bshg.com_Recordatorio....PDF`). Cruza por **fecha + remitente**
  con el correo candidato de Gmail para emparejar el PDF correcto.
- **Cómo usarla:** para un candidato cuyo importe NO está en el cuerpo, busca su PDF en la carpeta
  (`search_files` con `parentId = '1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh'`), léelo con `read_file_content`
  y extrae emisor/fecha/importe/NIF del cliente. Solo si el PDF no está aún en la carpeta (el script
  corre cada hora) → "Para tu decisión".
- ⚠️ **Ruido esperado:** el script copia CUALQUIER PDF reciente (boletines del cole, etc.), no solo
  facturas. La clasificación del Paso 2 descarta lo que no sea gasto; no lo archives ni concilies.

> **Vía A (alternativa, NO activa):** servidor MCP propio `gmail-adjuntos` declarado en `/.mcp.json`
> (`@gongrzhe/server-gmail-autoauth-mcp`) que baja los bytes vía OAuth. Setup en
> `SETUP-adjuntos.md`. Se dejó cableado pero la vía B lo cubre sin token ni red; usar A solo si se
> quiere prescindir del Apps Script.

## Estado / idempotencia (clave — NO reprocesar)
- Etiqueta de Gmail **`Facturas/Procesada`** (en el buzón real es `Label_11`). Al terminar con un
  correo, etiquétalo.
- La query de entrada SIEMPRE excluye `-label:Facturas/Procesada`. Si la etiqueta no existe, créala
  (`create_label`) en la primera ejecución. ⚠️ El nombre real es **`Procesada`** (femenino), no
  `Procesado`; usa la existente, no crees una duplicada.

## Paso 1 — Localizar candidatos (Gmail)
Query base (ventana corta para la pasada diaria; amplía a `newer_than:30d` en la primera):

```
newer_than:2d -label:Facturas/Procesada -in:draft
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

## Paso 3·bis — Registrar en `facturas_drive` (alimenta el control de facturas)
Cada factura deducible que archives en Drive, **regístrala también** en la tabla `facturas_drive`
(BD compartida). Esto es lo que enciende el semáforo de `/sivra/facturas-control` y la alerta
`facturasFaltantes` del dashboard — **sin este registro, el control de recurrentes no funciona**
(hoy la tabla estaba vacía por esto). El `proveedor` DEBE ser el `id` de `PROVEEDORES_RECURRENTES`
(`apps/plataforma/lib/sivra/facturas-control.ts`): `si_que_brilla`, `giraldillo`, `endesa_socorro`,
`endesa_luxury`, `endesa_bustos`, `endesa_duplex`, `emasesa_socorro`, `emasesa_bustos`,
`emasesa_luxury`, `digi`, `pricelabs`, `chekin`, `renta_luxury`, `renta_bustos`, `comunidad_pasaje`,
`comunidad_monte`, `smoobu`. (Si una factura no casa con ningún recurrente, NO la registres aquí; va
solo a Drive.) Idempotente — no dupliques si ya existe ese proveedor+año+mes:
```sql
INSERT INTO facturas_drive (proveedor, anio, mes, drive_url, drive_file_id, importe, nombre_archivo, fuente)
SELECT '<id_proveedor>', <anio>, <mes>, '<drive_url>', '<file_id>', <importe>, '<nombre.pdf>', 'facturas-correo'
WHERE NOT EXISTS (
  SELECT 1 FROM facturas_drive WHERE proveedor='<id_proveedor>' AND anio=<anio> AND mes=<mes>
);
```

## Paso 4 — Conciliar con el banco (Supabase)
> ⚠️ **ANTES de conciliar, descarta duplicados (LANDMINE 26/06/2026).** La tabla `movimientos_bancarios`
> se nutre del feed del banco (`origen='psd2'`) **y** de Excels (`xls-kutxa`/`xls-bbva`/`xls`). El MISMO
> cargo entra por las dos vías con el **concepto distinto** (banco verboso `…FACTURA DIGI`; Excel truncado
> `RECIBO DIGI SPAIN TELECO`), y como el `dedupe_hash` es por contenido, **NO** se colapsan → aparecen
> 2 filas del mismo movimiento. Si ves varias filas para el mismo cargo: **concilia SOLO la del feed del
> banco (`origen='psd2'`)** y comprueba que las copias de Excel estén `duplicado_estado='ignorado'` (las
> deja la guarda de `lib/banca.ts::importarExtracto`; el saneamiento histórico es
> `apps/plataforma/prisma/sql/2026-06-26_dedupe_cross_origen.sql`). **Nunca** marques `conciliado` en una
> copia de Excel ni cuentes el cargo dos veces. Filtra siempre `coalesce(duplicado_estado,'') <> 'ignorado'`.

Por cada factura, busca su cargo:
```sql
SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.destino, mb.conciliado, mb.origen
FROM movimientos_bancarios mb
JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
WHERE cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
  AND abs(mb.importe + <importe_factura>) < 0.02          -- gasto del mismo importe
  AND mb.fecha_operacion BETWEEN <fecha_factura>::date - 7 AND <fecha_factura>::date + 7
  AND coalesce(mb.duplicado_estado, '') <> 'ignorado'     -- nunca casar contra un duplicado
ORDER BY (mb.origen = 'psd2') DESC,                       -- prefiere el feed del banco
         abs(mb.fecha_operacion - <fecha_factura>::date) LIMIT 3;
```
- **Encontrado** → factura ↔ movimiento casados. **Marca el justificante en el movimiento** para que
  el panel de Gastos (`/finanzas?tab=gastos`) muestre el badge **📎 con factura** (lee `conciliado` /
  `factura_ref`):
  ```sql
  UPDATE movimientos_bancarios mb
  SET conciliado = true,
      factura_ref = <enlace o fileId de Drive del justificante>,
      destino = <destino clasificado si difiere y es seguro>
  FROM cuentas_bancarias cb
  WHERE cb.id = mb.cuenta_bancaria_id AND cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
    AND mb.id = '<id del movimiento casado>'::uuid;
  ```
  (Si el `destino` no coincide con la clasificación, corrígelo en el mismo UPDATE; scoped por `cuenta_id`.)
- **No encontrado** → el cargo aún no ha entrado en el banco (factura pagada hoy / extracto sin subir).
  Déjalo en "pendiente de que entre el movimiento" (no marques `conciliado`).
- **PriceLabs (y demás SaaS que facturan por email): al 100%.** Sus facturas llegan SIEMPRE como PDF
  por correo (no como cargo con concepto rico) → archívalas TODAS en Drive y concílialas con el cargo
  `PriceLabs`/`DynaPrice` del banco para encender su 📎. Si una no casa por importe (cambio USD→EUR),
  empareja por fecha + emisor y deja nota.

## Paso 4·bis — Barrido de conciliación pendiente (EN CADA PASADA)
El entorno es efímero y la skill NO guarda una lista de tareas: por eso, **al principio de cada
pasada**, repesca lo que quedó "⏳ pendiente de que entre el cargo" en pasadas anteriores. Es lo que
cierra casos como una factura archivada hoy cuyo recibo se domicilia días después (p. ej. DIGI emite
el día 26–27 pero el banco carga el 28–30).
1. Lista los justificantes deducibles ya archivados en Drive (`FACTURAS Apartamentos/<año>/<MM-Mes>`)
   de los **últimos ~60 días** cuyo movimiento de banco **aún no tiene 📎** (busca en la BD el cargo por
   importe ± fecha como en el Paso 4, `coalesce(duplicado_estado,'')<>'ignorado'`, prefiriendo `origen='psd2'`).
2. Si el cargo **ya ha entrado** → concílialo (UPDATE `conciliado=true`, `factura_ref`), igual que en el Paso 4.
3. Si **sigue sin entrar** → déjalo ⏳ y vuelve a intentarlo la próxima pasada (no lo marques, no lo dupliques).
Este barrido es **idempotente**: si ya está conciliado, no hace nada. No re-archiva ni re-etiqueta correos.

## Paso 5 — Etiquetar y resumir
- `label_message` `Facturas/Procesada` en cada correo tratado (idempotencia).
- Resumen a Alberto, en tres bloques:
  1. **Deducibles archivados** — emisor · importe · negocio · enlace Drive · conciliación (✅/⏳).
  2. **Personales** — emisor · importe · a nombre de quién (no archivado).
  3. **Para tu decisión** — los ambiguos, con la duda concreta.
- NO escribas en `movimientos_bancarios` salvo correcciones de `destino` obvias; lo dudoso se pregunta.

## Paso 6 — Recurrentes del mes: ¿falta alguna? (cierre de cada pasada)
Regla de Alberto: **cada mes debe haber 1 factura de lavandería, 1 de limpieza, la luz de CADA
apartamento, y el agua según su cadencia**. Compara lo ESPERADO (la lista `PROVEEDORES_RECURRENTES`
de `apps/plataforma/lib/sivra/facturas-control.ts`, con su `frecuencia`: `mensual` / `bimestral_impar`
[meses impares] / `anual_marzo`) contra lo RECIBIDO (`facturas_drive` que ya alimentas en el Paso 3·bis):
```sql
-- Recurrentes ya registrados para el mes en curso (y el anterior, por si llegan a destiempo):
SELECT proveedor, anio, mes FROM facturas_drive
WHERE (anio, mes) IN ((<anioActual>,<mesActual>), (<anioPrev>,<mesPrev>))
ORDER BY anio, mes, proveedor;
```
- Por cada proveedor recurrente **esperado** ese mes (según su frecuencia) que **NO** esté en el
  resultado → es un **hueco**. Inclúyelo en el resumen como bloque **«⛔ Recurrentes que faltan este mes»**
  (p. ej. «falta luz Bustos», «falta agua Socorro», «falta lavandería»). Así Alberto lo ve sin entrar a la app.
- ⚠️ **Cambios de proveedor:** un recurrente puede cambiar de suministrador (p. ej. Socorro luz fue
  **TotalEnergies en 2025 → ENDESA en 2026**; la lavandería cambió a finales de 2025). Si el id esperado
  no llega pero SÍ llega una factura equivalente de otro emisor para ese apartamento/servicio, NO lo
  marques como hueco: regístralo con el id del recurrente que sustituye y avísalo en el resumen para que
  se actualice la lista `PROVEEDORES_RECURRENTES`.
- 🏠 **Apartamentos (confirmado por Alberto, 29/06/2026): son 4.** `Socorro` (= **House Sevillana**, es el
  MISMO piso, no cuentes dos), `Luxury`, `Bustos Reform`, `Dúplex`. Esperado por piso: **luz cada mes**
  (ENDESA ×4) y **agua bimestral** (EMASESA) en Socorro/Luxury/Bustos. **El agua del Dúplex va DENTRO de la
  comunidad** (`comunidad_pasaje`) → **NO esperes una factura de agua aparte del Dúplex** (no es hueco).
- 📲 **Indicador + aviso por Telegram si falta algo.** El indicador en pantalla ya existe (semáforo
  `/sivra/facturas-control` + alerta `facturasFaltantes`, que se alimentan del Paso 3·bis). Además, **si
  hay ≥1 hueco**, manda UN aviso por Telegram con el bot del monorepo (si están las envs `TELEGRAM_BOT_TOKEN`
  y `TELEGRAM_CHAT_ID`):
  ```bash
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=⛔ Facturas recurrentes que faltan (<mes>): <lista, p. ej. luz Bustos, lavandería>"
  ```
  Solo cuando falte algo (no mandes nada si el mes está completo).

## Trigger (paso MANUAL de Alberto, 1 sola vez)
Claude Code web → crear **trigger programado diario** que lance una sesión con el prompt:
«Ejecuta la skill `facturas-correo`». El entorno debe tener conectados los MCP de Gmail, Google
Drive y Supabase (los mismos de esta sesión). Sin el trigger, la skill solo corre cuando Alberto la pide.

## Límites v1
- Entorno efímero → es por pasadas, no vigilancia continua.
- **Adjuntos de Gmail:** el conector gestionado de Gmail no baja el contenido de los PDF (solo cuerpo
  + IDs). Resuelto vía B (Apps Script → carpeta Drive `_buzon_pdf`): los importes dentro del PDF SÍ se
  leen con `read_file_content`. Único caso a "Para tu decisión": que el PDF aún no esté en la carpeta
  (el script corre cada hora) o que no se pueda leer. NO se inventa el importe.
- Multi-tenant: toda query de banco SIEMPRE scoped por `cuenta_id`.
