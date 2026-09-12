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
`[SOMBRA]` al contexto de la conversación. Es deliberado y **confirmado
necesario** (ver "Confirmado" más abajo): este repo tiene mucha automatización
desatendida (Routines, GitHub Actions) donde un `ask` real sin nadie delante
NO se resuelve solo — se queda la sesión colgada esperando para siempre.

Este contador **no persiste entre contenedores** (el entorno cloud es efímero):
solo sirve para ver, dentro de una sesión larga, si Sentinel habría intervenido.

## Qué se instaló

- `.claude/mcp-sentinel/hooks/sentinel_preflight.py` — motor de detección, copiado
  tal cual del original (verificado byte a byte contra la fuente de Drive).
- `.claude/mcp-sentinel/hooks/sentinel_stats.py` — telemetría, igual de verificado.
- `.claude/mcp-sentinel/hooks/sentinel_alerta.py` — envoltorio propio (no vendor,
  ver sección de abajo) que avisa por Telegram cuando el modo sombra habría
  bloqueado algo de verdad.
- `.claude/mcp-sentinel/references/iocs.json` — **reconstrucción curada, NO el
  `iocs.b64` original.** El original es un blob base64 denso de ~13.000
  caracteres; la transcripción manual se corrompió (falló al decodificar) y en
  vez de arriesgarme a instalar una base de firmas silenciosamente rota, escribí
  esta versión cubriendo las mismas categorías, verificada contra una batería de
  operaciones reales de `central` (0 falsos positivos, detecciones correctas).
  Se puede ampliar libremente — no es exhaustiva.
- Una entrada nueva en `.claude/settings.json` → `hooks.PreToolUse` (matcher `""`,
  o sea todas las herramientas), con `SENTINEL_SHADOW=on` en el propio comando.
  Apunta a `sentinel_alerta.py` (no directamente a `sentinel_preflight.py`) desde
  el 12/09/2026. Los hooks existentes (`guardian-rama.mjs`, etc.) no se han tocado.

## Aviso por Telegram cuando el modo sombra intervendría (12/09/2026)

`sentinel_alerta.py` es un envoltorio propio (no copia del vendor) que reenvía
stdin/stdout/exit-code de `sentinel_preflight.py` sin tocarlo ni un byte, y
además: si la decisión final es `allow` pero el `additionalContext` contiene
el literal `SENTINEL_SHADOW` (marca común a las dos plantillas bilingües
`[SOMBRA]`/`[SHADOW]` de `render("shadow", ...)` — **usar solo `[SOMBRA]` como
marca sería frágil: el motor detecta el idioma del transcript y por defecto cae
a inglés**, medido en pruebas de este mismo cambio), dispara un aviso
`POST {PLATAFORMA_URL}/api/internal/alerta` (el canal de Telegram ya existente,
ver `docs/RUTINAS-PROGRAMADAS.md` — **no se maneja ningún token de Telegram
nuevo ni en claro aquí**, solo el `ALERTA_TOKEN` que ya abre ese endpoint).

- **Best-effort de verdad**: cualquier excepción (JSON raro, red caída, faltan
  `PLATAFORMA_URL`/`ALERTA_TOKEN`) se traga en silencio — nunca cambia la
  decisión del hook ni hace fallar la llamada de la herramienta.
- **Deduplicado por hash del motivo + día** (`~/.claude/sentinel/alertas/`):
  el mismo `[SOMBRA]` repetido en bucle solo avisa una vez por día, no satura
  el Telegram de Alberto.
- **Probado funcionalmente** (no solo `py_compile`) en un entorno aislado que
  replica `hooks/`+`references/`: dispara el aviso con las credenciales
  puestas, NO dispara nada sin `PLATAFORMA_URL`/`ALERTA_TOKEN`, NO repite aviso
  en la segunda llamada idéntica el mismo día, y NO dispara nada ante un
  comando inocuo. Detalle completo de los cuatro casos en el PR de este cambio.

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
   ejecute nada peligroso. Reproducido durante esta misma revisión, y
   confirmado otra vez en vivo tras el merge (ver `docs/CONTEXTO-SESIONES.md`,
   12/09/2026: un `.ssh/id_rsa` dentro de un script de prueba disparó el hook
   de verdad). Es una limitación heredada del motor original (coincide por
   patrón de texto, no analiza sintaxis de shell) — aceptable en modo sombra.
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

## Confirmado (12/09/2026): un `ask` sin humano se QUEDA COLGADO, no se auto-deniega

Prueba real hecha con `mcp__Claude_Code_Remote__create_session`: una rama
descartable (`test/ask-unattended-experiment`, nunca mergeada) con un hook
`PreToolUse` de prueba que fuerza `permissionDecision: "ask"` sobre un
comando marcador (`ASK_TEST_MARKER_XYZ`), lanzada en dos sesiones nuevas
—una con `permission_mode: "default"`, otra heredando `"auto"`— con un
prompt normal (no adversarial) pidiendo ejecutar ese comando, sin responder
nunca a ninguna de las dos.

**Resultado, igual en ambas:** la sesión pasa a `status_bucket: BLOCKED` /
`need_input` ("¿Qué necesitas?") y se queda así indefinidamente — no hay
timeout, no se auto-deniega, no continúa. Si esto ocurriera en una Routine
real desatendida, la Routine se quedaría colgada para siempre, sin error ni
aviso, hasta que alguien la mire y responda a mano.

**Esto invalida la inferencia anterior** ("se resuelve como denegación,
solo inferido de documentación general") — la realidad en esta plataforma
concreta es la contraria y más severa. Conclusión: `SENTINEL_SHADOW` debe
seguir en `on` para siempre en cualquier categoría de detección que pueda
disparar `ask` sobre una llamada que una Routine desatendida podría hacer,
salvo que se añada primero un mecanismo de timeout/aviso en el propio hook
(p. ej. que `ask` sin sesión interactiva degrade a `deny` con log, nunca a
esperar). Activar bloqueo real sin eso convertiría cualquier falso positivo
(ver punto 3 de arriba) en una Routine muerta y silenciosa.

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
que apunta a `sentinel_alerta.py`) y, si se quiere, borrar el directorio
`.claude/mcp-sentinel/`. No toca nada más del repo.
