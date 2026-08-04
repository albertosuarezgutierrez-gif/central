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

