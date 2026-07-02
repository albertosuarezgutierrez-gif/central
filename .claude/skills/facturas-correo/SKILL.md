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

## Paso 1-bis — Subidas MANUALES a Drive (Alberto/Pilar suben ficheros a mano)
Gmail no lo cubre todo: a veces Alberto **escanea una factura (CamScanner) y la sube a mano**
a Drive en vez de reenviarla por email (pasó el 02/07/2026 con la de Leroy Merlin). Esos
ficheros no tienen correo candidato → sin este paso se quedarían huérfanos para siempre.
En cada pasada:
1. `search_files` con `parentId = '1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O'` (raíz `FACTURAS
   Apartamentos / 2026`): lista los **ficheros sueltos** (no carpetas) — lo bien archivado
   vive SIEMPRE dentro de las subcarpetas de mes, así que un fichero en la raíz es una
   subida manual pendiente.
2. Trátalo como un candidato más: `read_file_content` → extrae emisor/fecha/importe(s)
   (ojo: un mismo PDF puede traer factura + rectificativa/abono, como el Leroy) → clasifica
   (Paso 2) → copia a la subcarpeta del mes con el nombre normalizado (Paso 3) → concilia
   (Paso 4).
3. El MCP de Drive no mueve ficheros: tras copiar, deja en el resumen la línea
   «🗑️ borrar de la raíz: <nombre>» para que Alberto limpie el original.
4. Idempotencia: si en la subcarpeta del mes ya existe una copia con el nombre normalizado
   (mismo emisor+fecha+importe), el fichero de la raíz ya está procesado → solo repite el
   aviso de borrado, no dupliques la copia ni la conciliación.

## Paso 2 — Clasificar (mismas reglas que `apps/plataforma/lib/categorizar.ts`)
`destino` ∈ { turistico_pisos, turistico_duplex, seguros, personal } (traspaso_interno no aplica aquí).

- **turistico_pisos (deducible):** BOOKING, EXPEDIA, AIRBNB, STRIPE, SMOOBU, PRICELABS, IONOS
  (dominios), IKEA/LEROY/BRICO/FERRETER (mobiliario pisos), TASKRABBIT (montaje/instalación en pisos),
  SIQUE (limpieza), EMASESA (agua), ENDESA/TOTALENERGIES (luz), DIGI (internet),
  DIMITRI (mantenimiento), D CULTO (comida empresa).
- **turistico_duplex (deducible):** COMUNIDAD, PASAJE FRANCISCO, **PASAJE/FRANCISCO MOLINA**,
  **VILLASÍS** y suministros del dúplex. ⚠️ El **dúplex = "Villasís"** son el **mismo piso** (Pasaje
  Villasís 1 / Pasaje Francisco Molina 4, dos accesos); tributa en el **IRPF personal de Alberto**.
- **seguros (correduría, deducible):** compañías de seguros (Generali, Allianz, Mapfre, Caser, Anthropic Ireland — API Claude…), **CABIFY** (desplazamientos de la correduría — el recibo llega de `no-reply@mgx.cabify.com` con asunto `Alberto, tu viaje por X €`; incluye origen/destino/importe), **GOOGLE** (Google Workspace, Google One, Google Drive, suscripciones de Google usadas para el negocio — factura/recibo de Google o PayPal a Google).
- **personal (NO deducible):** Círculo Mercantil / natación / gimnasio / colegio / vacunas /
  compras de familia (**Pilar = la esposa**, los hijos, Carmen…), IBI y **suministros de la vivienda
  habitual Monte Carmelo** (luz — Energía XXI/Endesa, agua, gas…), y **trading** (FTMO / retos de
  bróker, cuenta Interactive Brokers).

> ⚠️ **La dirección fiscal del cliente en una factura ≠ lugar de uso del artículo.** Alberto usa
> "Monte Carmelo 68" (vivienda habitual) como dirección de facturación en muchos proveedores, incluso
> cuando compra material para los pisos turísticos. Ejemplo: CREATE ventilador de techo (jun-2026)
> venía dirigido a Monte Carmelo 68 pero era para Casa Socorro → `turistico_pisos`. Regla: si el
> proveedor vende **material físico** (muebles, electrodomésticos, herramientas, ferretería, CREATE…),
> **preguntar siempre** si va a un piso turístico o a la vivienda habitual antes de clasificar. Solo
> `personal` automático si el concepto o descripción del artículo es inequívocamente del hogar
> (colchón matrimonial, ropa de cama talla familiar, electrodoméstico de cocina doméstica, etc.).

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
> (Socorro 50/50 con Pilar) aunque cobren en cuentas de la **sociedad Punto y Coma SL**. **⛔ Amortización:
> NUNCA de oficio** (regla dictada por Alberto 02/07/2026, canónica en `perfil-fiscal`): todo
> gasto deducible va como gasto corriente del año al 100% salvo que Alberto ordene amortizar
> ESA factura — su criterio es meter el máximo gasto posible cada año. Excepción que sigue:
> **notaría/registro de compraventa** = coste de adquisición (no gasto del año). Los pagos
> al Ayto. de ~19,5 € son **tasa de basura**, no IBI.

## Paso 3 — Archivar en Drive (solo deducibles)
Estructura real para **2026**: `FACTURAS Apartamentos / 2026 / <MM-MesNombre-2026>`.
- Carpeta raíz 2026: ID `1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O`.
- Subcarpetas ya creadas (por mes): `01-Enero-2026` (`1L8D9la1lqb9DY2IDX6dXJWwfuDxVmE9w`), `02-Febrero-2026` (`1GcREzRoLElDB1_wpyk0nbJ55Oxpxp2-_`), `03-Marzo-2026` (`1Eaasm2mb4kWY-9E6c1u4osBkcyVcNYtE`), `04-Abril-2026` (`1gGiTOpU1YmXVZGvJGpAE4uU4BxrnPz_d`), `05-MAYO-2026` (`1AmGqd-ffk1Zjkg-O5jlfZZrnFFTdH-ky`), `06-Junio-2026` (`1kL7ZXMIH9uf63H63X9Vkb7SvDvuY5LUu`).
- Si falta la subcarpeta del mes, créala con `create_file` (tipo carpeta) dentro de la raíz 2026.
- Nombre del fichero: `YYYY-MM-DD_emisor_importe.pdf` (ej. `2026-06-08_pricelabs_64.96USD.pdf`).
- ⚠️ Los MCP Drive disponibles **no incluyen "mover"** (solo `copy_file`). Para organizar hay que copiar y luego Alberto borra el original de la raíz manualmente.
- Si el correo trae **PDF/imagen adjunta** → súbela. Si el justificante es solo **cuerpo HTML**
  (p. ej. Círculo Mercantil) → guarda el cuerpo como documento (`create_file`) con el mismo nombre.
- Los **personales NO se archivan** (no hacen falta para el gestor).

## Paso 4 — Conciliar con el banco (Supabase)
Por cada factura, busca su cargo:
```sql
SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.destino, mb.conciliado, mb.duplicado_estado
FROM movimientos_bancarios mb
JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
WHERE cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
  AND abs(mb.importe + <importe_factura>) < 0.02          -- gasto del mismo importe
  AND mb.fecha_operacion BETWEEN <fecha_factura>::date - 7 AND <fecha_factura>::date + 7
  AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado != 'ignorado')
ORDER BY abs(mb.fecha_operacion - <fecha_factura>::date) LIMIT 3;
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

### Patrón especial — ENDESA DÚPLEX (dos facturas en un cargo)
Las facturas de Endesa del **Dúplex** (PJ Francisco Molina 4 1C, contrato 130139482171, BBVA ES34)
incluyen **siempre DOS facturas en un único cargo bancario**:
1. **Factura de Electricidad** (nº `P26CONxxxxxxxx`) — el importe del PDF.
2. **Factura de Servicios "Electric Protección 360 Plus"** (contrato OR-0046183234) — €5,78/mes
   (base €4,78 + IVA 21% €1,00). Nº factura empieza por `X326NC`.

El banco domicilia AMBAS en un único débito (suma = factura PDF + €5,78). **No es un error**: es el
plan de mantenimiento/asistencia del hogar contratado con Endesa. Ambas son deducibles `turistico_duplex`.
Al conciliar, acepta la diferencia de ~€5,78 entre importe de factura PDF e importe bancario.
La factura PDF ya muestra el "RESUMEN TOTAL" con las dos partidas al final del documento.

### Patrón especial — LUZ por piso (CUPS → apartamento)
Fuente: **`CUP electricidad NUEVO.pdf`** en Drive (`FACTURAS Apartamentos/2026`, fileId
`1iFpKQHHoY2JvdwOq-8TgBEJCy_5EfxiJ`, 02/07/2026 — sustituye al xlsx de 2024 que tenía titular
Punto y Coma SL). Toda factura de luz trae el **CUPS y la dirección de suministro** → identifica
el piso con esta tabla y pon `propiedad_id` en el movimiento al conciliar:

| CUPS | Dirección de suministro | Piso | `propiedad_id` | Contrato Endesa | Cargo en |
|---|---|---|---|---|---|
| ES0031101905443002ED0F | Bustos Tavera 22 **Bajo IZDA** (3,45 kW) | Busto Reform | `prop_busto_reform` | 130139685932 ✅ | Kutxabank ****0855 |
| ES0031101905443004EB0F | Bustos Tavera 22 **Bajo DCHA** (4,4 kW) | Luxury Busto | `prop_luxury_busto` | 130139655504 ✅ | Kutxabank ****0855 |
| ES0031102278830001BV0F | Socorro 24 (5,196 kW, titular Pilar) | Casa Socorro | `prop_house_sevillana` | 130139486193 ✅ | Kutxabank ****0855 |
| ES0031102657263050CJ0F | PJE Francisco Molina 4, 1C (3,45 kW) | Dúplex/Villasís | `prop_duplex_center` | 130139482171 ✅ | BBVA ****1175 |

- El concepto bancario de Kutxa trae el **nº de CONTRATO** (no el CUPS): `RECIBO ENDESA ENERGIA …
  FACTURA DE ELECTRICIDAD P26CONxxxxxxxx CONTRATO <nº>`. Usa la columna Contrato para mapear.
- ✅ **Bustos, asignación CONFIRMADA por Alberto (02/07/2026):** los correos de alta de Endesa
  (11/02/2026, a nombre de Punto y Coma SL) no traen dirección; la pareja contrato↔piso se dedujo
  por correlación factura↔ocupación (2 periodos coherentes) y **Alberto la confirmó explícitamente
  como correcta** («ES OK»). Los 4 cargos de mar–may 2026 llevan la nota en `comentario`.
- **Energía XXI contrato 130138945299** (Kutxa ****0855) = **vivienda habitual Monte Carmelo →
  `personal`**, NO imputar piso. Ídem cualquier suministro de DE LAS CRUCES 13 (Sanlúcar).
- El histórico: Fenie Energía → TotalEnergies (titular Punto y Coma SL) → **Endesa desde feb-2026**
  (titulares según el PDF NUEVO). Las facturas de TotalEnergies "Gas y Electricidad España"
  (portal Empresas) son de los contratos VIEJOS de la SL; las finales de 2026 se cargan a la
  cuenta de la SL (no está en `movimientos_bancarios`).
- Etiqueta Gmail **`Luz pendiente 2026`** (`Label_12`): la usa Alberto para marcar facturas de luz
  pendientes de imputar — revísala en cada pasada y quítala al dejar el cargo imputado/conciliado.
- Endesa NO manda email de factura para los contratos de Bustos (solo Socorro y Dúplex) — sus
  cargos aparecen solo en el banco; impútalos por nº de contrato.

### Patrón especial — EMASESA (facturas bimestrales)
EMASESA factura **cada 2 meses** por piso (contratos y pisos mapeados en `facturas_drive`):
| Contrato | Piso | `proveedor` en BD |
|---|---|---|
| 0104785292 | Casa Socorro (C/ Socorro 24) | `emasesa-socorro` |
| 0105137440 | Luxury Busto (C/ Bustos Tavera 22 Bajo DER) | `emasesa-luxury` |
| 0105185751 | Busto Reform (C/ Bustos Tavera 22 Bajo IZQ) | `emasesa-reform` |

Ciclos: meses 1, 3, 5, 7, 9, 11. No esperar facturas en meses pares. "Derecha siempre Luxury" (confirmado por Alberto).

### Patrón especial — SIQUE (Si Que Brilla SL, NIF B22992523)
SIQUE emite factura mensual a fin de mes por todas las limpiezas del mes (LUXURY, DUPLEX, BUSTOS
REFORMA, CASA SOCORRO). Alberto la paga mediante transferencia Kutxabank **1-3 días después** de la
fecha de factura. Todas las líneas → `destino = 'turistico_pisos'` (nota fiscal: DUPLEX y SOCORRO
tributan en IRPF personal de Alberto, pero el `destino` es igual para todas las líneas — la distinción
fiscal se gestiona fuera de este campo).

**Concepto bancario:** `TRANSF. 2100 LIMPIEZA APARTAMENTOS [MES]` (a veces solo `TRANSF. 2100`
sin el nombre del mes — misma cuenta origen Kutxabank ****0855, IBAN destino
ES48 2100 2112 1802 0121 0426).

**Al conciliar SIQUE:** si aparecen dos movimientos con el mismo importe y fecha (duplicado de
importación), usa el que tiene `duplicado_estado IS NULL`; el que tiene `duplicado_estado='ignorado'`
es el descartado. Busca por importe exacto ±5 días de la fecha de factura.

**Verificar nº de limpiezas contra reservas (opcional pero recomendado):** cruza las unidades de
cada línea de la factura con los checkouts del mes en la tabla `incomes` (JOIN `properties`):
```sql
SELECT p.name AS piso, COUNT(*) AS salidas
FROM incomes i JOIN properties p ON p.id = i."propertyId"
WHERE i."checkOut" >= '<YYYY-MM-01>' AND i."checkOut" < '<YYYY-MM+1-01>'
GROUP BY p.name ORDER BY p.name;
```
Mapeo de nombres factura → BD: LUXURY = `Luxury Busto`, DUPLEX = `Duplex Center`,
CASA SOCORRO = `House sevillana`, BUSTOS REFORMA = `Busto Reform`.

**Reglas de cuadre:**
- `incomes` solo contiene **reservas reales** (portal=BOOKING/AIRBNB…). Los bloqueos de Smoobu
  **no se importan** — no los cuentes como limpieza.
- Si el último checkout del mes cae muy a fin de mes (ej. 30/31), SIQUE puede facturarlo en el
  mes siguiente. Una diferencia de ±1 unidad en el último día del mes es normal y esperada.
- Diferencia > 1 o en pisos que no son el último día → preguntar a Alberto.

**Facturas en Drive:** se guardan en `FACTURAS Apartamentos/<año>/<mes>/` con nombre
`<YYYY-MM-DD>_SiQueBrella_<importe>EUR.pdf`. Las de 2026 que ya están conciliadas:
- Enero (798,60 €) — banco 2026-02-01, Drive `14eDOiWG9SZKlP2p6tOWukm-8NK9_rgPw`
- Febrero (1.093,84 €) — banco 2026-03-02, Drive `1dQ4PiPSoofLCSX71XRLit9KwbN4phaq0`
- Marzo (1.074,48 €) — banco 2026-04-03, Drive `1K5zwYMVu4jTDLVlbpJZp2mx4h65BcQA5`
- Abril (1.439,90 €) — banco 2026-04-30, Drive `10RKLS_FRa4gGq0hvPMh9OBsHDbjL3SUh`
- Mayo (1.360,04 €) — banco 2026-06-02 (`c9f835ee`), Drive `1HNRrPy4L35ESjjOSdTtoczVUt6l-isYz`
- Junio (902,65 €) — Drive `16NKosRE-eEkOVwRSqZjC2oF3EG9_eqFf`, ⏳ banco pendiente (~2026-07-02). Al llegar: `UPDATE movimientos_bancarios SET conciliado=true, factura_ref='16NKosRE-eEkOVwRSqZjC2oF3EG9_eqFf', destino='turistico_pisos' WHERE id='<id del cargo ~902.65>'`

## Paso 5 — Etiquetar y resumir
- `label_message` `Facturas/Procesada` en cada correo tratado (idempotencia).
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
- **Adjuntos de Gmail:** el conector gestionado de Gmail no baja el contenido de los PDF (solo cuerpo
  + IDs). Resuelto vía B (Apps Script → carpeta Drive `_buzon_pdf`): los importes dentro del PDF SÍ se
  leen con `read_file_content`. Único caso a "Para tu decisión": que el PDF aún no esté en la carpeta
  (el script corre cada hora) o que no se pueda leer. NO se inventa el importe.
- Multi-tenant: toda query de banco SIEMPRE scoped por `cuenta_id`.
