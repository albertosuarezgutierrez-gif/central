---
name: facturas-correo
description: Agente PROGRAMADO que revisa el Gmail de Alberto buscando facturas/justificantes de gasto, los clasifica (personal vs negocio deducible), archiva en Google Drive los deducibles y los concilia con los movimientos bancarios de plataforma. Úsala cuando Alberto pida "revisa mis correos/facturas", o cuando la dispare el trigger diario de Claude Code web. NO es un proceso 24/7: se despierta, hace una pasada sobre lo nuevo y deja un resumen.
---

# Agente de facturas por correo — casa de marcas (Alberto)

> **📂 Drive reorganizado (16/07/2026) — los IDs NO cambian.** Las carpetas de facturas se anidan
> bajo `CENTRAL/03 · FACTURAS Y GASTOS/` (`FACTURAS Apartamentos` = `03/apartamentos`). Como Drive
> **conserva el `fileId` al mover**, TODAS las referencias por ID de esta skill (`_buzon_pdf`,
> `2026`, subcarpetas de mes, `_DUPLICADOS_BORRAR`, `_subir_aqui`) **siguen válidas sin cambios** —
> igual que los `factura_ref` del banco. Mapa completo y regla de oro en `docs/DRIVE-ESTRUCTURA.md`.

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

### Leer importes dentro de PDF — cadena de vías con fallback
El conector Gmail gestionado NO baja los bytes de los adjuntos (solo cuerpo + IDs). Para leer el importe
que vive dentro de un PDF hay una **cadena de vías**; usa la primera que funcione y cae a la siguiente.
**NUNCA inventes el importe.**

1. **Vía B — Apps Script `Facturas a Drive` → Drive `_buzon_pdf`** (sin token; la preferente cuando va).
   Un Apps Script de Alberto (trigger horario) busca en Gmail con una **constante `QUERY` fija**, y por
   cada hilo copia sus adjuntos PDF a `FACTURAS Apartamentos / _buzon_pdf`
   (**fileId `1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh`**), con nombre `YYYY-MM-DD_remitente_archivooriginal.pdf`,
   y **solo etiqueta el hilo `PDF-guardado` (Label_13) si guardó al menos un adjunto**. Crúzalos por
   **fecha + remitente** con el candidato de Gmail; léelos con `read_file_content`. Cuando la `QUERY` es
   amplia (`newer_than:3d has:attachment filename:pdf -label:PDF-guardado`) copia CUALQUIER PDF reciente
   (ruido: boletines del cole…) — el Paso 2 descarta lo que no sea gasto.
   > ⚠️ **La `QUERY` es el punto frágil (lección del corte 23/06→12/07/2026).** Ese 23/06 la `QUERY` se
   > estrechó a **un solo remitente** (`from:Comisiones-Mapfre@info.mapfre.com has:attachment filename:pdf
   > -label:PDF-guardado`) → dejó de copiar todo lo demás (la carpeta se congeló el 23/06 con PDFs de
   > BBVA/Cabify/Glovo/cole y ninguno posterior). Y encima ese remitente **no casa**: la "FACTURA MAPFRE"
   > (liquidación de comisiones) llega **cifrada**, no es adjunto `filename:pdf` → la query da 0 (y un PDF
   > cifrado tampoco se leería). **Mapfre-comisiones NO se captura por Vía B por diseño** (cifrado); se
   > gestiona aparte. Si Vía B está parada, **lo primero es revisar la `QUERY`** (que sea amplia / con la
   > allowlist correcta), NO la auth ni "publicar la app OAuth" (autentica bien; eso no arregla nada).
   > ✅ **12/07/2026**: restaurada a allowlist de proveedores. **18/07/2026**: AMPLIADA a la forma
   > amplia sin allowlist, por orden de Alberto (ver «Estado» abajo).
2. **Vía A — MCP propio `gmail-adjuntos`** (`@gongrzhe/server-gmail-autoauth-mcp`, en `/.mcp.json`):
   baja los bytes por OAuth. Solo disponible si el entorno tiene las env vars + red (ver
   `SETUP-adjuntos.md`). Si ves sus herramientas de descarga en la sesión, úsalas; si el server sale
   "connecting"/sin herramientas, no está provisionado → salta a la siguiente vía.
3. **Vía OCR / lectura visual** — para PDF **escaneado sin capa de texto**, donde `read_file_content`
   devuelve vacío (caso real `Escaneado_20260707-1446.pdf`). Si tienes un MCP con visión o puedes
   renderizar el PDF, léelo visualmente. Si no, márcalo `Facturas/PDF-pendiente` (Paso 0) con nota
   «escaneo sin texto → leer en Chrome»: Claude para Chrome abre el adjunto en el navegador y devuelve
   importe/NIF.
4. **Conciliación inversa por banco** — cuando NINGUNA vía da el importe pero SÍ es un gasto claro con
   emisor y fecha: **toma el importe del único cargo bancario que casa** (ver Paso 4 › «Conciliación
   inversa»). El euro del banco es la fuente de verdad para cuadrar el gasto; el PDF se archiva como
   justificante cuando alguna vía reviva.
5. **`Facturas/PDF-pendiente`** (último recurso) — si ni hay cargo que casar, a la cola persistente
   (Paso 0). No se pierde entre pasadas.

🟢 **Estado a 18/07/2026 — Vía B en forma AMPLIA (cualquier remitente).**
El 18/07/2026 Alberto (vía Claude para Chrome) volvió a la **forma amplia SIN allowlist** — quería poder
capturar adjuntos de cualquier persona (caso real: Pilar reenviando los Mod200 de Punto y Coma). Config
actual y permanente:
```
newer_than:3d has:attachment filename:pdf -label:PDF-guardado
```
Verificado el mismo día: copió los 3 `Mod200-*.pdf` del correo de Pilar a `_buzon_pdf`. Copia TODO PDF
adjunto de los últimos 3 días (el `-label:PDF-guardado` evita duplicados) → hay ruido (boletines del
cole, publicidad); el Paso 2 lo descarta. Historia previa: el 23/06 la `QUERY` se estrechó a
mono-remitente Mapfre y congeló la carpeta hasta el 12/07 (se restauró entonces con allowlist de 11
proveedores; esa allowlist quedó SUSTITUIDA por la forma amplia el 18/07).
- **Lección para la próxima vez que Vía B "no traiga nada":** NO es OAuth. Mira la `QUERY` del Apps Script
  (que la allowlist siga puesta y no se haya revertido a Mapfre-only). El "publica la app OAuth" del plan
  original era un diagnóstico equivocado.
- **Vía A** (`gmail-adjuntos`) sigue **sin provisionar** — fallback opcional (ver `SETUP-adjuntos.md`).
- **Mapfre-comisiones** no la captura Vía B (cifrada, por diseño) → se gestiona aparte (Portal Mediadores).

## Estado / idempotencia (clave — NO reprocesar)
- Etiqueta de Gmail **`Facturas/Procesada`** (en el buzón real es `Label_11`). Al terminar con un
  correo, etiquétalo.
- La query de entrada SIEMPRE excluye `-label:Facturas/Procesada`. Si la etiqueta no existe, créala
  (`create_label`) en la primera ejecución. ⚠️ El nombre real es **`Procesada`** (femenino), no
  `Procesado`; usa la existente, no crees una duplicada.

## Paso 0 — Salud de extracción + backlog persistente (ejecutar SIEMPRE primero)
El contenedor es efímero: un aviso «Para tu decisión» en el resumen **se evapora** al cerrar la sesión.
Para que ninguna factura solo-PDF se pierda durante un corte de extracción, este paso usa **etiquetas de
Gmail persistentes** (mismo patrón que `Facturas/Procesada`/`Luz pendiente 2026`) y comprueba la salud de
las vías antes de nada.

> **Toda sesión que archive, concilie o etiquete algo — aunque sea ad-hoc, disparada a mano por Alberto
> ("revisa mis correos"), vía Claude para Chrome, o interrumpida a medio camino — deja SIEMPRE la entrada
> del "Auto-informe" (al final de esta skill) antes de cerrar.** Patrón ya repetido 3 veces (11/07, 12/07,
> 24/07): sesiones que hicieron trabajo real (archivar en Drive, conciliar banco, marcar duplicados) sin
> dejar rastro en `docs/AGENTES-BITACORA.md` — la siguiente pasada tuvo que redescubrirlo a ciegas desde
> cero. Si la sesión no llega al final del flujo completo, escribe igual una entrada corta con lo que SÍ
> se hizo antes de parar.

**0.a — Health-check determinista de la extracción.** Mide la frescura de la Vía B (no la juzgues a ojo):
```
search_threads query="label:PDF-guardado newer_than:2d"     # ¿copió PDFs en las últimas 48h?
```
y coteja el fichero más reciente de `_buzon_pdf` (`search_files parentId='1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh'`,
mira el `YYYY-MM-DD` del nombre). Define `dias_caido` = hoy − fecha de la copia más reciente.
- `dias_caido ≤ 2` → Vía B sana, sigue normal.
- `dias_caido > 2` → **corte activo**: usa la cadena de vías 3-5 para leer importes; NO asumas que un
  PDF «llegará solo»; y ejecuta 0.c (escalado).
- Comprueba también Vía A: si el MCP `gmail-adjuntos` no expone herramientas de descarga, está caída.

**0.b — Barre el backlog persistente ANTES de mirar correo nuevo.** Dos etiquetas (créalas con
`create_label` si no existen; NO existen hoy):
- **`Facturas/PDF-pendiente`** — facturas/gastos cuyo importe solo vive en un PDF que en su día no se pudo
  leer (corte de vías o escaneo sin texto).
- **`Facturas/Revisar`** — cualquier otro caso sin cerrar (ambiguo, «Para tu decisión») que quieras que
  sobreviva a la sesión efímera, en vez de dejarlo solo en el resumen.

Por cada hilo con estas etiquetas: reintenta la cadena de vías (¿revivió B? ¿conecta A? ¿lo lee Chrome
ahora?). Si ya se puede resolver → procesa/concilia (Pasos 2-4) y **quita la etiqueta pendiente**. Si
sigue sin poder → mantenla y lístalo en el resumen con los **días que lleva pendiente**.
⚠️ Mientras un hilo esté en `PDF-pendiente`/`Revisar`, **NO le pongas `Facturas/Procesada`** (si no, la
query base lo excluiría y nunca se reprocesaría).

**0.c — Escalado con backoff (no spamear).** Cuando `dias_caido > 3` o haya hilos en `PDF-pendiente`:
- Abre el resumen a Alberto con una alerta **🔴 arriba del todo**: «Extracción de facturas caída N días ·
  M facturas en cola (`PDF-pendiente`) · revisa la `QUERY` del Apps Script `Facturas a Drive` (que la
  allowlist de remitentes siga puesta, NO se haya revertido a Mapfre-only). NO es OAuth».
- **Aviso Telegram**: como esta skill corre en una sesión Claude (no en el runtime de plataforma), NO uses
  el bot directamente — **POST a `{PLATAFORMA_URL}/api/internal/alerta`** con `Authorization: Bearer
  <ALERTA_TOKEN>` (token estrecho; el endpoint acepta también el viejo `CRON_SECRET` por compat)
  y `{ "mensaje": "🔴 Extracción de facturas caída N días · M en cola · revisa la QUERY del Apps Script (allowlist, NO OAuth)" }`
  (mismo mecanismo que `psd2-health-check`; el bot único vive en plataforma). Mándalo el **primer día** que
  detectes el corte y luego **una vez por semana** mientras siga (no cada pasada): para saber si ya avisaste
  esta semana, mira `ultima_alerta_ts` de la fila `agente_salud` de 0.d.
- Si `M` (cola) crece de una pasada a otra, súbelo de tono: el corte ya está costando facturas.

**0.d — Estado persistido para el badge de `/finanzas`.** Escribe el estado del corte en Supabase para que
la plataforma lo muestre en pantalla (badge 🔴 en `FinanzasClient`, patrón del guardián de sync bancario).
Tabla `agente_salud` (una fila por agente, `upsert` idempotente por `agente`; DDL en
`apps/plataforma/prisma/sql/2026-07-12_agente_salud.sql`):
```sql
INSERT INTO agente_salud (agente, ok, dias_caido, detalle, ultimo_ok, ultima_alerta_ts, actualizado_at)
VALUES ('facturas-extraccion-pdf', <dias_caido <= 2>, <dias_caido>,
        <'Vía B: última copia 23/06; Vía A sin provisionar'>,
        <now() si dias_caido<=2, si no conserva el previo>,
        <now() si acabas de avisar por Telegram, si no conserva el previo>, now())
ON CONFLICT (agente) DO UPDATE
  SET ok = EXCLUDED.ok, dias_caido = EXCLUDED.dias_caido, detalle = EXCLUDED.detalle,
      ultimo_ok = COALESCE(EXCLUDED.ultimo_ok, agente_salud.ultimo_ok),
      ultima_alerta_ts = COALESCE(EXCLUDED.ultima_alerta_ts, agente_salud.ultima_alerta_ts),
      actualizado_at = now();
```
El badge de `/finanzas` lee esta fila (`agente='facturas-extraccion-pdf'`) y se pinta si `ok=false`.

**0.e — Backfill del hueco del corte (una vez, hasta ponerse al día).** El corte lleva 19 días: puede
haber facturas con PDF que entraron en el hueco y nunca se procesaron por importe. Barre el intervalo del
corte y trátalas con la cadena de vías / conciliación inversa:
```
has:attachment filename:pdf after:2026/06/23 -label:Facturas/Procesada -in:draft
```
Las que no puedas leer aún → `Facturas/PDF-pendiente`. Así el backlog no arranca en cero ni das por
«sin novedades» un hueco que en realidad esconde facturas sin leer. Cuando te pongas al día, esta subpasada
deja de hacer falta (el health-check normal la cubre).

## Paso 1 — Localizar candidatos (Gmail)
Query base (ventana corta para la pasada diaria; amplía a `newer_than:30d` en la primera):

```
newer_than:2d -label:Facturas/Procesada -in:draft
( subject:(factura OR justificante OR recibo OR invoice OR receipt OR pedido OR "ticket")
  OR has:attachment filename:pdf
  OR label:Triaje/Contabilidad
  OR from:(pricelabs.co OR amazon OR ionos OR booking OR smoobu OR stripe OR endesa OR emasesa OR digi OR mgx.cabify.com) )
```
Incluye también los **reenvíos de `pilar.pina.franco@gmail.com`** que sean justificantes de compra.

> **Buzón puente del agente `correo-triaje`:** ese agente etiqueta como **`Triaje/Contabilidad`**
> todo correo que huele a factura/recibo/banco (de ahí el `OR label:Triaje/Contabilidad` de arriba).
> Así lo que él detecta entra en ESTA pasada sin depender de las keywords. ⚠️ **Limitación conocida:**
> un cron de Vercel NO puede disparar esta rutina de Claude Code, así que lo etiquetado se recoge en
> la siguiente pasada programada (08:00), no al instante. Si quieres reducir esa latencia, añade en
> `claude.ai/code → Rutinas` un 2º disparo diario de esta skill (p.ej. 15:00) — es acción manual tuya.
Descarta newsletters, citas de calendario (`Invitación:`/`Aceptado:`), promociones, **notificaciones operativas de Cabify** que NO sean recibo (`¡Tu viaje ha finalizado sin cambios!`, `¡Esto solo acaba de empezar!`, emails de invitaciones/descuentos) y **notificaciones operativas de la correduría** (recibos devueltos de clientes, avisos de emisión, circulares de compañías aseguradoras — Allianz, Mapfre, Generali, Occident — que NO sean facturas a nombre de Alberto).

Para cada candidato: `get_thread` FULL_CONTENT → extrae **emisor, fecha, importe(s), concepto,
a nombre de quién, método de pago** del cuerpo o del PDF adjunto.

## Paso 1-bis — Subidas MANUALES a Drive (Alberto/Pilar suben ficheros a mano)
Gmail no lo cubre todo: a veces Alberto **escanea/sube una factura a mano** a Drive en vez de
reenviarla por email (Leroy Merlin el 02/07/2026; Castuera 055/2026 el 09-10/07/2026). Esos ficheros no
tienen correo candidato → sin este paso se quedarían huérfanos. **Regla: una subida manual a Drive se
trata EXACTAMENTE igual que un correo** — detectar → leer → verificar que es nueva → clasificar → si es
deducible, archivar + conciliar (Pasos 2-4); si es personal, no archivar. En cada pasada:

1. **Localiza las subidas manuales** (PDFs que Alberto dejó a mano, sin pasar por Gmail). Barre, en
   este orden:
   - **Buzón `_subir_aqui`** (`parentId = '1JlK9JXIpqlbDlOawtAFlk4_X7bn0Onjf'`, dentro de `FACTURAS
     Apartamentos / 2026`) — carpeta ÚNICA y sin ruido donde Alberto deja las subidas manuales. Es la
     vía preferente: todo lo que caiga aquí es un candidato a procesar. Tras archivar, deja el aviso
     «🗑️ borrar del buzón: <nombre>».
   - **Raíz `FACTURAS Apartamentos / 2026`** (`parentId = '1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O'` y
     `mimeType != 'application/vnd.google-apps.folder'`): red de seguridad — lo bien archivado vive
     SIEMPRE dentro de las subcarpetas de mes, así que un PDF suelto en la raíz es una subida manual
     pendiente.
   - **PDFs recién creados por Alberto FUERA de la estructura de FACTURAS** (fallback, por si no usó el
     buzón — pasó con el Castuera 055, que acabó en `ALBERTO 2026 PERSONAL (SEGUROS)/JULIO`, una
     estructura personal distinta): `owner = 'me' and mimeType contains 'pdf' and createdTime >
     '<hoy-3d>'`. Descarta los que ya vivan dentro de una subcarpeta `NN-Mes-2026` de FACTURAS (ya
     archivados) y el ruido evidente (declaraciones, docs personales que no son gasto). ⚠️ Si un
     **deducible** aparece en el árbol personal (p. ej. `…PERSONAL (SEGUROS)/…`), archívalo bien en
     FACTURAS **y además** registra esa copia personal en la papelera `_DUPLICADOS_BORRAR` (aviso «⚠️
     mal ubicado») para que Alberto no confíe en ella y la borre.
2. **Verifica que es NUEVA antes de tocar nada (anti-duplicado — clave).** `read_file_content` →
   emisor + fecha + importe(s). Es un **duplicado ya procesado** (NO re-archives ni re-concilies) si se
   cumple CUALQUIERA de estas dos:
   - ya existe una copia normalizada en la subcarpeta del mes con mismo emisor+fecha+importe
     (`YYYY-MM-DD_emisor_importe.pdf`), **o**
   - el cargo bancario de ese importe ya está `conciliado=true` con `factura_ref` (query del Paso 4).
   En ese caso NO re-archives ni re-concilies: registra el duplicado en la **papelera
   `_DUPLICADOS_BORRAR`** (ver bloque de abajo) para que Alberto lo borre, y pasa al siguiente (fue
   justo el caso Castuera: el agente ya lo había archivado y conciliado desde Gmail, y las copias
   manuales de la raíz y de PERSONAL(SEGUROS) eran duplicados).
3. **Si es nueva:** clasifica (Paso 2). Ojo: un mismo PDF puede traer factura + rectificativa/abono
   (como el Leroy). Si es **deducible** → copia a la subcarpeta del mes con el nombre normalizado
   (Paso 3) → concilia (Paso 4), igual que un correo. Si es **personal** → no la archives (solo
   anótala en el resumen).
4. El MCP de Drive no mueve/borra ficheros: tras archivar (o al detectar un duplicado), registra el
   fichero sobrante en la **papelera `_DUPLICADOS_BORRAR`** para que Alberto lo borre a mano.

> **📁 Papelera de duplicados `_DUPLICADOS_BORRAR`** (`parentId
> '1Au-_pFEPqvwZN_a7xKNZzVZOWGMAAO7Z'`, dentro de `FACTURAS Apartamentos / 2026`). El MCP de Drive no
> mueve/borra/edita ficheros, así que la papelera NO contiene los duplicados: contiene **un mini-aviso
> por duplicado** que Alberto usa como lista de tareas de borrado. Por cada duplicado detectado (fichero
> sobrante, copia mal ubicada en el árbol personal, o carpeta de mes duplicada):
> 1. **Idempotencia:** primero `search_files` en la papelera por título; si ya existe un aviso para ese
>    duplicado, NO crees otro.
> 2. Si no existe, crea un aviso con `create_file` (`parentId` = papelera, `contentMimeType` `text/plain`
>    → queda como Google Doc): **título** `BORRAR — <descripción corta>`; **cuerpo** con qué es, su
>    ubicación, el **enlace directo** al fichero/carpeta a borrar (`https://drive.google.com/file/d/<id>/view`
>    o `/drive/folders/<id>`), y el enlace a la copia BUENA (marcada «NO borrar»). Cierra con «Cuando lo
>    borres, borra también este aviso».
> 3. En el resumen a Alberto, enlaza la papelera y di cuántos avisos hay pendientes.
> 4. **Auto-verificación (cada pasada, ANTES de crear avisos nuevos):** `search_files` en la papelera y,
>    por cada aviso existente, comprueba con `get_file_metadata` el `<id>` del fichero/carpeta que enlaza.
>    Si el `get_file_metadata` ya NO lo encuentra (Alberto lo borró), el aviso es **zombi**: como el MCP
>    no borra, NO puedes eliminarlo tú → lístalo en el resumen como «✅ ya resuelto, puedes borrar el
>    aviso: <título>». Los avisos cuyo fichero SÍ sigue existiendo son borrados reales aún pendientes.
>    Así la papelera no acumula avisos muertos aunque el agente no pueda vaciarla.
> Cuando Alberto borra el fichero real, borra también el aviso — así la papelera queda a cero cuando
> todo está limpio. (Origen: pauta de Alberto 10/07/2026 — quería una única bandeja de duplicados a
> borrar; auto-verificación de zombis añadida el mismo día.)

## Paso 2 — Clasificar (mismas reglas que `apps/plataforma/lib/categorizar.ts`)
`destino` ∈ { turistico_pisos, turistico_duplex, seguros, personal } (traspaso_interno no aplica aquí).

- **turistico_pisos (deducible):** BOOKING, EXPEDIA, AIRBNB, STRIPE, SMOOBU, PRICELABS, IONOS
  (dominios), IKEA/LEROY/BRICO/FERRETER (mobiliario pisos), TASKRABBIT (montaje/instalación en pisos),
  SIQUE (limpieza), EMASESA (agua), ENDESA/TOTALENERGIES (luz), DIGI (internet),
  DIMITRI (mantenimiento), D CULTO (comida empresa).
- **turistico_duplex (deducible):** COMUNIDAD, PASAJE FRANCISCO, **PASAJE/FRANCISCO MOLINA**,
  **VILLASÍS** y suministros del dúplex. ⚠️ El **dúplex = "Villasís"** son el **mismo piso** (Pasaje
  Villasís 1 / Pasaje Francisco Molina 4, dos accesos); tributa en el **IRPF personal de Alberto**.
- **seguros (correduría, deducible):** compañías de seguros (Generali, Allianz, Mapfre, Caser, Anthropic Ireland — API Claude…), **CABIFY** (desplazamientos de la correduría — el recibo llega de `no-reply@mgx.cabify.com` con asunto `Alberto, tu viaje por X €`; incluye origen/destino/importe), **GOOGLE** (Google Workspace, Google One, Google Drive, suscripciones de Google usadas para el negocio — factura/recibo de Google o PayPal a Google), **PETROPRIX** (gasolineras — repostajes de la correduría; TODAS las facturas de Petroprix son de la correduría, confirmado por Alberto 11/07/2026), **FAL.AI / withorb.com** (SaaS de IA vía Orb/Stripe, factura "fal - Features & Labels, Inc." — confirmado deducible correduría por Alberto 11/07/2026).
- **personal (NO deducible):** Círculo Mercantil / natación / gimnasio / colegio / vacunas /
  compras de familia (**Pilar = la esposa**, los hijos, Carmen…), IBI y **suministros de la vivienda
  habitual Monte Carmelo** (luz — Energía XXI/Endesa, agua, gas…), y **trading** (FTMO / retos de
  bróker, cuenta Interactive Brokers).
  - ⚠️ **Guardería = personal PERO genera deducción de cuota (20/07/2026):** la **EI Estrella Polar /
    Grupo Workandlife** (recibos `RECIBO ESCUELA INFANTIL` mensuales + `GRUPO WORKANDLIFE … CONCEPTOS
    ANUALES`) es la guardería de los 2 peques <3. Va a `personal` (NO baja base), pero lleva
    `deduccion_cuota_tipo='guarderia'` → incremento de la deducción por maternidad (hasta €1.000/hijo) en
    la renta de **Pilar**. Reglas de comercio ya sembradas (auto-marca los futuros). Sus facturas/recibos
    **SÍ conviene archivarlas** como justificante de la deducción. Detalle completo en `perfil-fiscal`.
  - ⚠️ **ENERGIA XXI = SIEMPRE la luz de Monte Carmelo → personal** (confirmado por Alberto,
    02/07/2026): es la comercializadora **regulada** de Endesa y solo la tiene la vivienda habitual.
    Sus correos/facturas → `personal`, NO archivar en Drive, NO conciliar como deducible. No confundir
    con la luz de los pisos: **ENDESA ENERGIA** (mercado libre, Kutxa → `turistico_pisos`) y la del
    dúplex (**TE/TotalEnergies o Endesa** en BBVA → `turistico_duplex`). En banco ya es automático:
    regla `ENERGIA XXI` en `banca_destino_reglas` + detección determinista auto-confirmada en
    `apps/plataforma/lib/destino.ts`. Si aprendes reglas de luz, clave ESPECÍFICA — nunca «ENERGIA»
    ni «ELECTRICIDAD» a secas (arrastran la ENDESA de los pisos).

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
Estructura real para **2026**: `FACTURAS Apartamentos / 2026 / <MM-MesNombre-2026>` (ahora anidada en
`CENTRAL/03 · FACTURAS Y GASTOS/apartamentos/`; el `fileId` no cambia, ver `docs/DRIVE-ESTRUCTURA.md`).
- Carpeta raíz 2026: ID `1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O`.
- Subcarpetas ya creadas (por mes): `01-Enero-2026` (`1L8D9la1lqb9DY2IDX6dXJWwfuDxVmE9w`), `02-Febrero-2026` (`1GcREzRoLElDB1_wpyk0nbJ55Oxpxp2-_`), `03-Marzo-2026` (`1Eaasm2mb4kWY-9E6c1u4osBkcyVcNYtE`), `04-Abril-2026` (`1gGiTOpU1YmXVZGvJGpAE4uU4BxrnPz_d`), `05-MAYO-2026` (`1AmGqd-ffk1Zjkg-O5jlfZZrnFFTdH-ky`), `06-Junio-2026` (`1kL7ZXMIH9uf63H63X9Vkb7SvDvuY5LUu`), `07-Julio-2026` (`13PxwtWOWx4nmIAOX00x6FikF97RcNTA9` — canónica).
- **Antes de crear la carpeta del mes, comprueba SIEMPRE si ya existe** (`search_files` por título dentro
  de la raíz 2026): si existe, REUSA esa; si hay **varias con el mismo nombre** (pasó en julio-2026 con
  dos `07-Julio-2026`), usa la **más antigua como canónica**, copia a ella lo que falte de las otras, y
  registra las sobrantes en la papelera `_DUPLICADOS_BORRAR`. Solo crea una nueva si NO existe ninguna.
- Nombre del fichero: `YYYY-MM-DD_emisor_importe.pdf` (ej. `2026-06-08_pricelabs_64.96USD.pdf`).
- ⚠️ Los MCP Drive disponibles **no incluyen "mover"** (solo `copy_file`). Para organizar hay que copiar y luego Alberto borra el original de la raíz manualmente.
- Si el correo trae **PDF/imagen adjunta** → súbela. Si el justificante es solo **cuerpo HTML**
  (p. ej. Círculo Mercantil) → guarda el cuerpo como documento (`create_file`) con el mismo nombre.
- Los **personales NO se archivan** (no hacen falta para el gestor).

## Paso 4 — Conciliar con el banco (Supabase)

> **Política de auto-confirmación (decisión de Alberto: «auto-confirma si cuadra exacto»).**
> El cron de plataforma (`expenses/agent/scan`) ya imputa a `gastos`; tú confirmas la conciliación
> contra el banco. Regla:
> - **Auto-confirma (marca `conciliado=true`) SOLO si:** la extracción es **limpia** (leíste emisor,
>   fecha e importe sin huecos de OCR) **Y** el importe casa **exacto** con un único movimiento
>   bancario (`abs(mb.importe + importe_factura) < 0.02`) dentro de ±7 días. Un único candidato, sin
>   ambigüedad. Esto cubre el grueso: SaaS, suministros, proveedores recurrentes con importe redondo.
> - **NUNCA auto-confirmes — deja toque a Alberto (resumen «Para tu decisión» + no marcar
>   `conciliado`) si:** es **Booking** (la liquidación trae varias reservas + comisión + IVA en un
>   PDF: casi nunca cuadra a un solo cargo exacto → confírmala a mano), o hay **varios movimientos
>   candidatos**, o el importe **no casa exacto** (cambio de divisa, redondeo, cargo agrupado como el
>   Endesa dúplex), o la extracción tiene **dudas** (importe/fecha ilegibles). Ante CUALQUIER duda,
>   no auto-confirmes: es más barato preguntar que descuadrar la contabilidad.
> - En plataforma, las liquidaciones de **Booking** ya llegan a la **bandeja de revisión** (el cron
>   las manda con `motivo="Booking: confirma la liquidación"` + aviso Telegram), nunca auto-imputadas:
>   tu trabajo es abrir el PDF en Drive y validar que el neto liquidado cuadra con el ingreso.

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
      destino = <destino clasificado si difiere y es seguro>,
      propiedad_id = <prop_… si la factura es inequívocamente de UN piso, si no NULL>
  FROM cuentas_bancarias cb
  WHERE cb.id = mb.cuenta_bancaria_id AND cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
    AND mb.id = '<id del movimiento casado>'::uuid;
  ```
  (Si el `destino` no coincide con la clasificación, corrígelo en el mismo UPDATE; scoped por `cuenta_id`.)
- **Imputa `propiedad_id` cuando la factura es de UN piso concreto (no solo la luz).** Si la dirección
  de suministro/obra o el concepto identifican inequívocamente un apartamento — climatización,
  mobiliario, reparación, EMASESA, luz — fija el `propiedad_id` en el mismo UPDATE para que las cuentas
  por piso salgan bien. Valores: `prop_house_sevillana` (Casa Socorro, C/ Socorro 24),
  `prop_busto_reform` (Bustos Tavera 22 Bajo IZQ), `prop_luxury_busto` (Bustos Tavera 22 Bajo DCHA),
  `prop_duplex_center` (Dúplex/Villasís, PJ Francisco Molina 4 1C). Si el gasto es transversal (varios
  pisos, SaaS, comisión de portal), déjalo en `NULL`. Ejemplo real: la factura Castuera 055/2026 (2
  splits en Socorro 24) → `prop_house_sevillana`.
- **No encontrado** → el cargo aún no ha entrado en el banco (factura pagada hoy / extracto sin subir).
  Déjalo en "pendiente de que entre el movimiento" (no marques `conciliado`).

> **Conciliación inversa por banco (cuando el PDF NO se puede leer — corte de vías / escaneo sin texto).**
> Si sabes que es un gasto claro (emisor + fecha por el cuerpo/asunto) pero te falta el **importe** porque
> ninguna vía de PDF lo da, no lo bloquees: **búscalo por el banco**. Corre la query del cargo SIN el
> filtro de importe (solo emisor por concepto + ventana de fecha ±7d):
> ```sql
> SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.destino, mb.conciliado
> FROM movimientos_bancarios mb
> JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
> WHERE cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
>   AND mb.importe < 0                                        -- es un gasto
>   AND mb.concepto ILIKE '%<pista del emisor>%'
>   AND mb.fecha_operacion BETWEEN <fecha_factura>::date - 7 AND <fecha_factura>::date + 7
>   AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado != 'ignorado')
> ORDER BY abs(mb.fecha_operacion - <fecha_factura>::date) LIMIT 3;
> ```
> - **Un único cargo** que casa por emisor+fecha → el euro del banco **es** el importe del gasto. Confírmalo
>   (`conciliado=true`, `destino`, `propiedad_id`) y toma el importe del banco como bueno para cuadrar. El PDF
>   sigue haciendo falta como **justificante** para el gestor → deja el hilo en `Facturas/PDF-pendiente` con
>   nota «importe cuadrado por banco, falta archivar PDF» hasta que alguna vía te deje leer/archivar el PDF.
> - **Varios cargos** candidatos, o el concepto no identifica al emisor → NO adivines: `Facturas/Revisar` +
>   «Para tu decisión». La conciliación inversa solo aplica cuando hay UN cargo inequívoco.
> - Con esto, un corte de extracción deja de bloquear el **cuadre** del gasto; solo queda pendiente el
>   documento, no el número.
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
| ES0031101905443002ED0F | Bustos Tavera 22 **Bajo IZQ** (3,45 kW) | Busto Reform | `prop_busto_reform` | 130139655504 ✅ | Kutxabank ****0855 |
| ES0031101905443004EB0F | Bustos Tavera 22 **Bajo DCHA** (4,4 kW) | Luxury Busto | `prop_luxury_busto` | 130139685932 ✅ | Kutxabank ****0855 |
| ES0031102278830001BV0F | Socorro 24 (5,196 kW, titular Pilar) | Casa Socorro | `prop_house_sevillana` | 130139486193 ✅ | Kutxabank ****0855 |
| ES0031102657263050CJ0F | PJE Francisco Molina 4, 1C (3,45 kW) | Dúplex/Villasís | `prop_duplex_center` | 130139482171 ✅ | BBVA ****1175 |

- El concepto bancario de Kutxa trae el **nº de CONTRATO** (no el CUPS): `RECIBO ENDESA ENERGIA …
  FACTURA DE ELECTRICIDAD P26CONxxxxxxxx CONTRATO <nº>`. Usa la columna Contrato para mapear.
- ✅ **Bustos, contrato↔piso CORREGIDO con los PDF oficiales (03/07/2026):** la pareja contrato↔piso
  se había deducido por correlación factura↔ocupación (2 periodos coherentes) y Alberto la confirmó
  («ES OK»), pero estaba **intercambiada Reform↔Luxury**. Las facturas de Endesa (uploads de Alberto
  el 03/07) traen **CUPS + dirección de suministro + nº de factura** que coincide con el concepto
  bancario → prueba documental que MANDA sobre la correlación. Correcto: contrato **130139655504**
  = CUPS ...443002ED0F = **BJO IZQ = Busto Reform**; contrato **130139685932** = CUPS ...443004EB0F
  = **BJO DCHA = Luxury Busto** (Luxury/DCHA consume más en ambos periodos, coherente). Los 4 cargos
  ya reimputados con el `propiedad_id` correcto y `conciliado=true`.
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
- **Estado a 03/07/2026:** TODOS los cargos de luz de pisos de ene–jun 2026 en Kutxa/BBVA están
  imputados con `propiedad_id` (Socorro: −66,98 · −53,37 · −49,40 · −53,93 € | Reform (BJO IZQ):
  −38,54 · −100,00 € | Luxury (BJO DCHA): −71,42 · −133,71 €). ⚠️ Reform/Luxury estaban
  intercambiados hasta el 03/07 — corregidos con los PDF oficiales (ver nota de arriba). Desde
  jul-2026 imputa cada cargo nuevo al llegar. Las 4 facturas Endesa Bustos feb–may 2026 tienen PDF
  (uploads de Alberto 03/07); pendientes de archivar en Drive (subida binaria no factible por MCP en
  esa pasada → Alberto las suelta en la carpeta del mes).

**Otros CUPS conocidos (NO son gasto de pisos — del histórico `CUP electricidad.xlsx` 2024):**

| CUPS | Dirección de suministro | Qué es | Tratamiento |
|---|---|---|---|
| ES0031102227887014EY0F | Monte Carmelo 68, 1º IZQ (Pilar, 4,4 kW) | Vivienda habitual | `personal` — Energía XXI, contrato 130138945299, Kutxa ****0855 |
| ES0031102092195001FN0F | De las Cruces 13, Sanlúcar de Bda. (Alberto, 5,5 kW) | Casa familiar Sanlúcar | `personal` |
| ES0031102276296001FL0F | San Luis 9, Bajo-3 (3,45 kW) | Ex-suministro Punto y Coma SL | Contrato viejo de la SL — se carga a la cuenta de la SL (fuera de `movimientos_bancarios`); NO conciliar aquí |
| ES0031102276296016PB0F | San Luis 9, 1-012 (3,45 kW) | Ex-suministro Punto y Coma SL | Ídem San Luis |
| ES0031102276296009PG0F | San Luis 9, 1-010 (3,45 kW) | Ex-suministro Punto y Coma SL | Ídem San Luis |
| ES0031102403299001ZD0F | CR Sevilla-Huelva s/n, Espartinas (María Alcalá, 15 kW) | Suministro de un tercero | NO es gasto de Alberto — descartar |

- Historial de comercializadoras: Fenie Energía → TotalEnergies → **Endesa** (pisos, desde feb-2026).
  Las facturas «Facturación Total Gas y Electricidad España» (portal Empresas) que sigan llegando
  son de los contratos viejos de la SL (Bustos/San Luis) o finales tras la baja — cuenta de la SL,
  no las concilies contra Kutxa/BBVA; déjalas en «Para tu decisión» si dudas.

### Patrón especial — EMASESA (facturas bimestrales)
EMASESA factura **cada 2 meses** por piso (contratos y pisos mapeados en `facturas_drive`):
| Contrato (Nº Suministro) | Piso | `proveedor` en BD | `propiedad_id` |
|---|---|---|---|
| 0104785292 | Casa Socorro (C/ Socorro 24) | `emasesa-socorro` | `prop_house_sevillana` |
| 0105137440 | Luxury Busto (C/ Bustos Tavera 22 Bajo DER) | `emasesa-luxury` | `prop_luxury_busto` |
| 0105185751 | Busto Reform (C/ Bustos Tavera 22 Bajo IZQ) | `emasesa-reform` | `prop_busto_reform` |
| 0105329645 | Luxury Busto — 2º suministro (C/ Bustos Tavera 22 **1º DER**) · ⚠️ **INACTIVO desde sep-2025, no factura en 2026** | `emasesa-luxury-1der` | `prop_luxury_busto` |

Ciclos: meses 1, 3, 5, 7, 9, 11. No esperar facturas en meses pares. "Derecha siempre Luxury" (confirmado por Alberto).

**🔑 Cómo imputar el piso a un cargo EMASESA del banco (procedimiento definitivo — el agente DEBE hacerlo cada pasada).**
El concepto bancario **solo trae la referencia del recibo** (`RECIBO EMASESA … EMASEPE26XXXXXXXX`, que es el
nº de factura `PE26XXXXXXXX`), **NO el nº de contrato** → desde el concepto solo NO se puede saber el piso.
La fuente que sí lo da es el **correo e-factura de EMASESA**, que llega puntual cada ciclo:
- Remitente **`Servicio.eFacturas@emasesa.com`**, asunto `Factura electrónica EMASESA del contrato de CALLE …`.
  El cuerpo trae **`Nº Suministro <contrato>` + dirección de suministro + el importe** (p.ej.
  `Nº Suministro 0104785292 CALLE SOCORRO, 24 … 117,99`). Búscalos con `from:Servicio.eFacturas@emasesa.com newer_than:20d`.

Para cada cargo `RECIBO EMASESA` sin `propiedad_id` en `movimientos_bancarios`:
1. Casa el cargo con su correo e-factura **por importe exacto** (el mismo ciclo trae 3 importes distintos → no colisionan).
2. Lee el `Nº Suministro` del correo → mapea a piso con la tabla de arriba.
3. `UPDATE movimientos_bancarios SET propiedad_id=<prop_…>, destino='turistico_pisos', destino_confirmado=true,
   conciliado=true, factura_ref='EMASESA e-factura <PE26…> · Nº Sum. <contrato> · <dirección>'` (scoped por `cuenta_id`).
4. Registra la factura en `facturas_drive` (`proveedor='emasesa-<piso>'`, `anio`, `mes`, `importe`,
   `nombre_archivo=<PE26…>`, `fuente='manual'`; sin `drive_url` — EMASESA es solo portal, no manda PDF adjunto).
   Inserta solo si no existe ya la fila `(proveedor, anio, mes)`.

**Fallback si el correo no está** (borrado, aún no llegado): el **ranking de importe entre pisos es estable** —
Socorro es SIEMPRE el más alto, Luxury el medio, Reform el más bajo. Histórico 2026: Socorro 84–166€,
Luxury 59–91€, Reform 33–57€. Ciclo julio-2026 (confirmado por correo): **Socorro 117,99€ · Luxury 80,26€ ·
Reform 50,48€**. Úsalo solo como red de seguridad; el correo (contrato→dirección) es la prueba que manda.

⚠️ **Bustos Tavera 22, 1º DER (contrato 0105329645) = Luxury Busto (`prop_luxury_busto`), PERO INACTIVO desde
sep-2025 — NO se está pagando en 2026 (verificado 22/07/2026).** Físicamente es un 2º suministro del edificio
Luxury (planta 1ª DER), pero como contrato de agua está parado: sus últimas e-facturas fueron **may/jul/sep 2025**
(a titular NO personal — saludo `Hola, .` vacío, mismo patrón que los ex-suministros de la SL en San Luis 9) y
**no hay ninguna factura ni cargo bancario suyo en 2026**. Comprobación clave: en el banco (Kutxa ****0855) cada
ciclo bimestral de 2026 trae **exactamente 3 recibos EMASESA** (Socorro + Luxury Bajo DER + Reform Bajo IZQ) —
nunca un 4º. Por tanto NO se está pagando factura ajena.
- **Regla para el agente:** con 3 cargos EMASESA por ciclo, todo cuadra; **no esperes un 4º**. Si algún día
  reaparece un cargo/e-factura del 0105329645, NO lo imputes/pagues en automático: primero **verifica el titular**
  (venía a nombre de Punto y Coma SL, que está dormida desde finales de 2025) y avisa a Alberto — podría ser un
  suministro que ya no debería facturar. Si Alberto confirma que es suyo y del piso Luxury, entonces sí →
  `prop_luxury_busto`, y en `facturas_drive` usa `proveedor='emasesa-luxury-1der'` para no colisionar con
  `emasesa-luxury` del mismo mes.

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
- Junio (902,65 €) — banco 2026-06-30 (`b0f31471`), Drive `16NKosRE-eEkOVwRSqZjC2oF3EG9_eqFf` — ✅ conciliado (02/07/2026).

## Paso 5 — Etiquetar y resumir
- `label_message` `Facturas/Procesada` en cada correo **cerrado** (idempotencia). NO lo pongas en hilos
  que dejes en `PDF-pendiente`/`Revisar` (Paso 0) — esos se reprocesan en la siguiente pasada.
- Si hay corte de extracción (Paso 0), **abre el resumen con la alerta 🔴** (N días caída · M en cola ·
  cómo arreglarlo) antes de los bloques.
- Resumen a Alberto, en bloques:
  1. **Deducibles archivados** — emisor · importe · negocio · enlace Drive · conciliación (✅/⏳).
  2. **Personales** — emisor · importe · a nombre de quién (no archivado).
  3. **Para tu decisión** — los ambiguos, con la duda concreta (además, etiquétalos `Facturas/Revisar`).
  4. **En cola persistente** — hilos en `PDF-pendiente`/`Revisar`, con los **días pendientes** de cada uno.
- NO escribas en `movimientos_bancarios` salvo conciliaciones/correcciones de `destino` seguras; lo dudoso
  se pregunta.

## Trigger (paso MANUAL de Alberto, 1 sola vez)
Claude Code web → crear **trigger programado diario** que lance una sesión con el prompt:
«Ejecuta la skill `facturas-correo`». El entorno debe tener conectados los MCP de Gmail, Google
Drive y Supabase (los mismos de esta sesión). Sin el trigger, la skill solo corre cuando Alberto la pide.

## Límites v1
- Entorno efímero → es por pasadas, no vigilancia continua. El backlog que debe sobrevivir vive en
  **etiquetas de Gmail** (`PDF-pendiente`/`Revisar`) y en `agente_salud` (Supabase), no en el resumen.
- **Adjuntos de Gmail:** el conector gestionado no baja el contenido de los PDF (solo cuerpo + IDs).
  Se cubre con la **cadena de vías** (§ "Leer importes dentro de PDF"): B (Apps Script→Drive) → A (MCP
  `gmail-adjuntos`) → OCR/lectura visual → conciliación inversa por banco → `PDF-pendiente`. **NUNCA se
  inventa el importe.** Cuando todas las vías de PDF fallan pero hay UN cargo bancario claro, el importe
  se cuadra por banco y solo queda pendiente **archivar** el PDF.
- Multi-tenant: toda query de banco SIEMPRE scoped por `cuenta_id`.

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
