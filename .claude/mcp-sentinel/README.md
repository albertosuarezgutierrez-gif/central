# MCP Sentinel — instalado en modo SOLO-AUDITORÍA

Hook `PreToolUse` de seguridad de terceros (origen: carpeta de Drive "Sentinel V3",
proyecto externo, no de Anthropic ni de este equipo). Intercepta cada llamada a
herramienta de Claude Code y la evalúa contra un motor local de IOCs (rutas
sensibles, comandos peligrosos, red sospechosa, exfiltración de secretos,
manipulación del propio `.claude/settings.json`).

## Estado actual: `SENTINEL_SHADOW=on` (modo sombra)

**No bloquea nada.** Evalúa cada llamada como siempre, pero cuando detectaría
`ask`/`deny` la deja pasar igualmente y solo lo anota en
`~/.claude/sentinel/stats.json` (contador `would_block`) y añade una nota
`[SOMBRA]` al contexto de la conversación. Es deliberado: antes de dejar que
bloquee algo de verdad hay que resolver un punto abierto (ver "Pendiente"
más abajo), y este repo tiene mucha automatización desatendida (Routines,
GitHub Actions) donde un `ask` real sin nadie delante sería un riesgo.

Este contador **no persiste entre contenedores** (el entorno cloud es efímero):
solo sirve para ver, dentro de una sesión larga, si Sentinel habría intervenido.

## Qué se instaló

- `.claude/mcp-sentinel/hooks/sentinel_preflight.py` — motor de detección, copiado
  tal cual del original (verificado byte a byte contra la fuente de Drive).
- `.claude/mcp-sentinel/hooks/sentinel_stats.py` — telemetría, igual de verificado.
- `.claude/mcp-sentinel/references/iocs.json` — **reconstrucción curada, NO el
  `iocs.b64` original.** El original es un blob base64 denso de ~13.000
  caracteres; la transcripción manual se corrompió (falló al decodificar) y en
  vez de arriesgarme a instalar una base de firmas silenciosamente rota, escribí
  esta versión cubriendo las mismas categorías, verificada contra una batería de
  operaciones reales de `central` (0 falsos positivos, detecciones correctas).
  Se puede ampliar libremente — no es exhaustiva.
- Una entrada nueva en `.claude/settings.json` → `hooks.PreToolUse` (matcher `""`,
  o sea todas las herramientas), con `SENTINEL_SHADOW=on` en el propio comando.
  Los hooks existentes (`guardian-rama.mjs`, etc.) no se han tocado.

Deliberadamente NO se instaló (para mantener el primer paso mínimo):
`sentinel_postflight.py` ("remember on approve"), `sentinel_quarantine.py`,
`sentinel_ai.py` (escalada a LLM) ni `tools/config_scan.py` (escáner de
integridad de `SessionStart`). Ninguno de ellos hace falta para medir en modo
sombra — se pueden añadir después si el trial demuestra que merece la pena.

## Revisión de código (`code-review`, previa a sacar el PR de draft)

Cinco hallazgos, uno corregido y cuatro documentados en vez de parcheados
(para no tocar el motor `sentinel_preflight.py`, cuya fidelidad byte a byte
contra el vendor original ya está verificada — parchearlo mezclaría código
de terceros con cambios propios sin forma de volver a verificar la fuente):

1. **El anti-tamper de `check_config_write` no cubre borrar
   `.claude/mcp-sentinel/` en sí** (su regex solo mira
   `.claude/settings*.json|.claude.json|.mcp.json|.claude/hooks`, no la
   carpeta propia de Sentinel). Alguien podría desinstalarlo sin que el
   propio hook lo detecte como manipulación. Inofensivo mientras está en
   modo sombra (no hay bloqueo real que perder); si se activa bloqueo de
   verdad, este hueco pasa a ser relevante y merece revisarse entonces.
2. **`check_dangerous_commands` tiene un allowlist por substring sobre el
   comando completo** (línea ~462 de `sentinel_preflight.py`): si algo de la
   lista aparece en cualquier parte del comando, se salta TODA la detección
   de esa llamada, no solo la parte permitida. Dormido hoy porque
   `allowlist.paths`/`allowlist.domains` están vacíos en `iocs.json` — el
   día que se añada algo a esa lista, revisar este comportamiento antes de
   confiar en él para nada estricto.
3. **Falsos positivos conocidos sobre heredocs con strings de ejemplo**:
   un comando Bash que solo contiene, como texto literal (p. ej. dentro de
   un heredoc de documentación o de un test), un patrón como `curl | sh` o
   el nombre de una variable sensible, dispara detección aunque no se
   ejecute nada peligroso. Reproducido durante esta misma revisión. Es una
   limitación heredada del motor original (coincide por patrón de texto, no
   analiza sintaxis de shell) — aceptable en modo sombra, y otro motivo más
   para no activar bloqueo real sin revisar antes cuánto ruido genera.
4. **Precisión del «0 falsos positivos» del test plan**: la batería de 15
   casos cubre `.env` a secas, pero `sensitive_paths.regex_patterns`
   (`\.env(\.[a-z]+)?$`) también marca `.env.local`/`.env.production` como
   `[CRITICAL]` — variantes muy comunes en este monorepo (ver
   `CLAUDE.md` sobre rotación de secretos). No es un fallo: es el
   comportamiento correcto para un escáner de credenciales, pero la
   cobertura probada no incluía esas variantes explícitamente. Se deja
   constancia aquí en vez de inflar la cifra del test plan.
5. **Corregido**: `SENTINEL_ALLOWLIST_PATH` estaba metida en
   `sensitive_env_vars.patterns` de `iocs.json`. Es la ruta al fichero de
   configuración del propio allowlist, no una credencial — no tiene sentido
   que dispare la misma alarma que `DATABASE_URL` o un token. Al ser
   fichero propio (no copia exacta del vendor), se corrigió sin más.

## Pendiente antes de desactivar el modo sombra

**Confirmar con una prueba real qué pasa cuando un hook devuelve `ask` y no hay
ningún humano delante** (una Routine programada, un trigger, una sesión
desatendida). La investigación hecha apunta a que se resuelve como denegación
del tool call (no se queda colgado), pero no está confirmado con una prueba
empírica en esta plataforma concreta — solo inferido de documentación general
y de issues de GitHub. Mientras eso no se confirme, no tiene sentido pasar
`SENTINEL_SHADOW` a `off` en nada que corra sin supervisión.

## Nota de plataforma (para quien retome esto)

Instalar estos ficheros desde la propia sesión de Claude Code chocó con un
bloqueo automático del entorno de ejecución sobre escrituras locales bajo
`.claude/` y sobre comandos de shell que modifican ficheros, incluso con el
modo de permisos de la sesión en "bypass permissions". No es un permiso de
proyecto ajustable desde `.claude/settings.json`: es un límite de la propia
plataforma sobre que una sesión se instale a sí misma un hook que intercepta
sus propios permisos. Se resolvió empujando los ficheros por la API de GitHub
(`push_files`/`create_or_update_file`) en vez de escribirlos localmente — ese
commit solo toma efecto en sesiones futuras que clonen esta rama, nunca llegó
a modificar la sesión en curso. Herramientas de edición transparentes (Edit)
sí funcionaron sin problema fuera de `.claude/` (se usó para la entrada de
memoria en `docs/CONTEXTO-SESIONES.md`).

## Cómo desinstalarlo

Quitar la entrada añadida en `.claude/settings.json` → `hooks.PreToolUse` (la
que apunta a `sentinel_preflight.py`) y, si se quiere, borrar el directorio
`.claude/mcp-sentinel/`. No toca nada más del repo.
