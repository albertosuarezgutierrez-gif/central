# scripts/drive — organización del Google Drive de Alberto

Estructura destino y IDs de carpetas: **`docs/DRIVE-ESTRUCTURA.md`** (fuente de verdad).

## `reorganizar-drive.gs` — mudanza one-shot (Paso 2)

Apps Script que Alberto ejecuta **con su cuenta** (el MCP de Claude puede crear/copiar pero no
mover/borrar; esto sí). Deja el Drive en la estructura `CENTRAL/`.

**Uso:**
1. Abre <https://script.google.com> → proyecto nuevo → pega `reorganizar-drive.gs`.
2. Con `DRY_RUN = true` (por defecto), ejecuta la función `reorganizarDrive` y mira
   **Ver → Registro de ejecución**: verás el plan completo **sin que se mueva nada**.
3. Revisa el plan. Ajusta el mapeo si algo no encaja (las tablas `MOVE_FOLDERS` /
   `reglasArchivo` están arriba del fichero, comentadas).
4. Cuando cuadre, pon `DRY_RUN = false` y ejecútalo otra vez para aplicar.

**Qué hace:** mueve las carpetas buenas bajo `CENTRAL` (conservan su `fileId`, así que el
pipeline de `facturas-correo` y los `factura_ref` del banco siguen válidos), reparte los
archivos sueltos de la raíz por reglas de nombre, y aparta la basura (el repo volcado con `.git`,
carpetas `BORRAR`) a `CENTRAL/_REVISAR_BORRAR`. **Nunca borra nada** — deja lo dudoso en
`_REVISAR_BORRAR` para que lo borres tú.

## Pendiente — vigilante semanal (Paso 4)

Apps Script con disparador de tiempo que barre `_buzon` y la raíz, reparte, marca duplicados y
avisa por Telegram. Regla de oro: **nunca se escribe en la raíz**; todo sin clasificar cae en un
único `_buzon` y el vigilante lo reparte.
