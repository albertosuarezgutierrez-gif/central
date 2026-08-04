# Leer importes dentro de PDF — montar el conector Gmail con adjuntos

> Guía de setup de la **vía A** de la skill `facturas-correo`: un servidor MCP propio
> que SÍ descarga los adjuntos de Gmail, para que el agente lea el importe que vive
> dentro del PDF (y no solo el cuerpo del correo). El conector Gmail **gestionado** de
> Claude Code web no baja adjuntos; por eso hace falta este de más.

## Qué dejó preparado Claude (ya commiteado, no tocar)
- **`/.mcp.json`** (raíz del repo) → declara el servidor `gmail-adjuntos`
  (`@gongrzhe/server-gmail-autoauth-mcp`, arranca con `npx`). Se clona en cada sesión.
- **`/scripts/setup-gmail-mcp.sh`** → al arrancar la sesión, vuelca las credenciales
  (que tú metes como variables de entorno) a `~/.gmail-mcp/`, que es donde el servidor
  las busca. Solo actúa en sesiones cloud (`CLAUDE_CODE_REMOTE=true`).
- La skill (`SKILL.md`) ya documenta el flujo: bajar PDF → subir a Drive → `read_file_content` → conciliar.

## Lo que tienes que hacer tú (una sola vez)

### Paso 1 — Crear las credenciales OAuth de Google (EN TU MÁQUINA)
El consentimiento OAuth abre un navegador y **no puede hacerse en la sesión cloud**, así
que se hace una vez en tu ordenador y se reutiliza el token.

1. Entra en **Google Cloud Console** → crea un proyecto (o usa uno existente).
2. **Habilita la Gmail API** (APIs & Services → Library → "Gmail API" → Enable).
3. Configura la **OAuth consent screen** (tipo "External" vale; añade tu propio correo
   `alberto.suarez.gutierrez@gmail.com` como *Test user* para no pasar verificación).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → tipo
   *Desktop app*.** Descarga el JSON → renómbralo a **`gcp-oauth.keys.json`**.
5. Haz el login interactivo una vez en local:
   ```bash
   mkdir -p ~/.gmail-mcp
   cp ruta/a/gcp-oauth.keys.json ~/.gmail-mcp/gcp-oauth.keys.json
   npx -y @gongrzhe/server-gmail-autoauth-mcp auth
   ```
   Se abre el navegador, das consentimiento con tu cuenta de Gmail, y el servidor guarda
   el token en **`~/.gmail-mcp/credentials.json`**.

Al terminar tienes los **dos ficheros** que necesita la sesión cloud:
`~/.gmail-mcp/gcp-oauth.keys.json` y `~/.gmail-mcp/credentials.json`.

### Paso 2 — Meter esos dos JSON como variables de entorno del entorno cloud
> ⚠️ **Aviso de seguridad (de la doc oficial):** no hay almacén de secretos todavía. Las
> variables de entorno **las ve cualquiera que pueda editar el entorno**, y dan acceso de
> lectura a TODO tu Gmail. Úsalo solo si te vale ese nivel de visibilidad. (Si no, usa la
> *vía B*: filtro de Gmail → Drive, que no necesita token.)

En claude.ai/code → selector de entorno → **Edit environment → Environment variables**,
añade (formato `.env`, una línea por variable, **sin comillas**, el JSON aplanado a una sola línea):

```
GMAIL_MCP_OAUTH_KEYS={"installed":{"client_id":"...","client_secret":"...", ...}}
GMAIL_MCP_CREDENTIALS={"access_token":"...","refresh_token":"...", ...}
```
- `GMAIL_MCP_OAUTH_KEYS`  = contenido íntegro de `gcp-oauth.keys.json`.
- `GMAIL_MCP_CREDENTIALS` = contenido íntegro de `credentials.json`.
- Para aplanar a una línea:  `jq -c . ~/.gmail-mcp/gcp-oauth.keys.json`  y  `jq -c . ~/.gmail-mcp/credentials.json`.

### Paso 3 — Que el setup script se ejecute al arrancar la sesión
En **Edit environment → Setup script**, asegúrate de que se llama al script (añádelo si tu
setup ya hace otras cosas):
```bash
bash scripts/setup-gmail-mcp.sh
```

### Paso 4 — Abrir la red a Google (Allowed domains)
Un servidor MCP **propio** no va por el canal de Anthropic (eso es solo para los conectores
gestionados), así que necesita salida de red. En **Edit environment → Network access**, con
nivel que permita *Allowed domains*, añade:
```
googleapis.com
oauth2.googleapis.com
gmail.googleapis.com
```
(El registro de **npm** ya está en los *Trusted defaults* para que `npx` instale el servidor.)

### Paso 5 — Activarlo en el trigger diario
Si la skill corre por el trigger programado, asegúrate de que ese trigger/rutina usa este
mismo entorno (con sus variables y allowlist). Con eso, la sesión diaria ya tendrá el
conector de adjuntos disponible.

## Cómo comprobar que funciona
En una sesión nueva, pídele a Claude: «lista las herramientas del MCP `gmail-adjuntos`».
Si aparece la de descarga de adjuntos (p. ej. `download_attachment` / lectura de adjunto),
está listo. Si el servidor sale como "disconnected" o sin herramientas, casi siempre es:
(a) falta una de las dos variables, (b) el setup script no se ejecutó, o (c) falta abrir
los dominios de Google en la red.

## Alternativa sin token (vía B)
Si no quieres meter el token como variable: crea un **filtro de Gmail** que reenvíe/etiquete
las facturas y un **Apps Script** (o el guardado de adjuntos de Workspace) que deposite los
PDF en una carpeta de Drive. Desde ahí el agente ya los lee con `read_file_content` —sin
MCP propio, sin secretos y sin abrir red—. Llega al mismo sitio con menos piezas.

## Cómo revivir la extracción (cuando el badge 🔴 de `/finanzas` está encendido)
El corte NO es de autorización — es la **`QUERY` del Apps Script**. Se arregla en tu Google (una línea).

### A) Revivir la Vía B (Apps Script) — arreglar la QUERY (causa CONFIRMADA 12/07/2026)
Leído el código de `guardarFacturasPDF`: usa una constante `QUERY` fija. El 23/06 se **estrechó** a un
solo remitente:
```
from:Comisiones-Mapfre@info.mapfre.com has:attachment filename:pdf -label:PDF-guardado
```
Eso rompió la copia amplia (por eso `_buzon_pdf` se congeló el 23/06). Y encima ese remitente **no casa**:
la FACTURA MAPFRE llega **cifrada**, no es adjunto `filename:pdf` → la query da **0 resultados** en Gmail
(verificado). El trigger corre cada hora y termina "Completada" porque no encuentra nada que copiar (el
código no tiene `Logger.log` ni `try/catch`, por eso las ejecuciones salen sin registro). **Reautorizar o
publicar la app NO arregla nada** (autentica bien).

**Fix (1 línea):** en `script.google.com` → proyecto **`Facturas a Drive`** → editor → sustituye la
constante `QUERY` por la forma amplia (la que llenaba la carpeta hasta el 23/06):
```
newer_than:3d has:attachment filename:pdf -label:PDF-guardado
```
Guarda, ejecuta `guardarFacturasPDF` una vez a mano (aceptando permisos si los pide), y confirma que
aparecen PDFs recientes en `_buzon_pdf` y los hilos quedan etiquetados `PDF-guardado`.
- **Más privado (opcional):** en vez de "todos los PDF", una allowlist de remitentes —
  `newer_than:3d has:attachment filename:pdf -label:PDF-guardado (from:booking.com OR from:pricelabs.co OR from:ionos.es OR from:bbva.com OR from:mgx.cabify.com OR from:glovoapp.com OR from:emasesa OR from:endesa)` —
  pero hay que mantener la lista al día.
- **Mapfre comisiones** seguirá sin capturarse por esta vía (documento cifrado): se resuelve aparte
  (Portal Mediadores / descifrar), no con la query.
> Hay un prompt para **Claude para Chrome** que hace este cambio de `QUERY` en tu navegador (te lo pasó el
> agente en el chat).

### B) Provisionar la Vía A (MCP `gmail-adjuntos`) — fallback duradero, opcional
Sigue los **Pasos 1-4** de arriba (crear el OAuth client Desktop, `npx … auth` en tu máquina, meter los dos
JSON como env vars, abrir la red a Google). Con eso la sesión baja los bytes del PDF sin depender del Apps
Script. ⚠️ El `npx @gongrzhe/server-gmail-autoauth-mcp auth` es un paso de **terminal local** (Chrome no lo
hace), y el token da lectura de TODO tu Gmail como env var visible (aviso de seguridad de arriba).
