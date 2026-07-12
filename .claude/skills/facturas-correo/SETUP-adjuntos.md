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
La extracción de importes desde el PDF depende de una autorización OAuth **tuya** (no se arregla
desde una sesión de Claude). Dos caminos, de menos a más trabajo:

### A) Revivir la Vía B (Apps Script) — el arreglo rápido, RECOMENDADO
El Apps Script `Facturas a Drive` deja de copiar PDFs cuando su token OAuth caduca. Si la pantalla
de consentimiento está en modo **"Testing/Prueba"**, Google **caduca el token a los 7 días** → vuelve
a caerse cada semana. Por eso el arreglo que dura es **PUBLICAR la app**, no solo reautorizar:
1. `script.google.com` → proyecto **`Facturas a Drive`** → **Activadores** (reloj): si el trigger horario
   está desactivado o con error de autorización, reejecútalo y **acepta de nuevo** los permisos de Gmail+Drive.
2. En el proyecto de **Google Cloud Console** asociado → **Pantalla de consentimiento OAuth**: si está en
   **"Testing"**, pulsa **"PUBLICAR APP" (Testing → In production/Production)**. Con la app publicada el
   refresh token deja de caducar a los 7 días.
3. Ejecuta la función una vez a mano y comprueba que copia un PDF reciente a `_buzon_pdf` y etiqueta el hilo
   como `PDF-guardado`.
> Hay un prompt listo para **Claude para Chrome** que conduce estos pasos en tu navegador (te lo pasó el
> agente en el chat). Chrome puede hacer A entero; para B necesita además un paso de terminal local (abajo).

### B) Provisionar la Vía A (MCP `gmail-adjuntos`) — fallback duradero, opcional
Sigue los **Pasos 1-4** de arriba (crear el OAuth client Desktop, `npx … auth` en tu máquina, meter los dos
JSON como env vars, abrir la red a Google). Con eso la sesión baja los bytes del PDF sin depender del Apps
Script. ⚠️ El `npx @gongrzhe/server-gmail-autoauth-mcp auth` es un paso de **terminal local** (Chrome no lo
hace), y el token da lectura de TODO tu Gmail como env var visible (aviso de seguridad de arriba).
