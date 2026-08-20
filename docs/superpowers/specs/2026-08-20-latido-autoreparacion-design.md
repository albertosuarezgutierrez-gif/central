# Auto-reparación de agentes: del latido rojo al merge, sin humano en medio

**Fecha:** 20/08/2026 · **Decisión de:** Alberto («lo más automático posible y solo avisarme en caso
de no resolverse por si tengo que intervenir»).

## El problema

La casa ya tiene quien **detecta**: `agentes-latido` (cron diario 07:45) cruza `agente_latidos` con
`AGENTES_VIGILADOS` y avisa por Telegram, y `/auditoria-diaria` manda cualquier fila roja a carril 2.
Lo que no tiene es quien **repare**: escribir el arreglo lo sigue haciendo una sesión de Claude que
Alberto tiene que abrir.

El coste de ese hueco está medido. El cron `sivra_canal` nació el 19/08/2026 y **nunca completó una
pasada**: moría en `42883 operator does not exist: date - bigint` en su primera consulta. El latido se
puso rojo a la primera y lo dijo — pero hasta que alguien lo leyó y abrió una sesión (PR #1529), los
cuatro pisos siguieron tarificando con el `channel_markup = 1.20` supuesto que ese agente existe
precisamente para corregir.

## Qué NO se automatiza, y por qué

**No todo latido rojo es un bug.** El histórico de esta casa está lleno de rojos que no se arreglan
tocando código: IMAP caído, Nominatim bloqueando la IP de Vercel, Serper devolviendo `organic: []`,
el conector de Booking sin responder. Un orquestador disparado contra esos escribe un parche para un
problema que no está en el repo.

**Y el aviso no es el diagnóstico.** La nota de `sivra_canal` en `AGENTES_VIGILADOS` decía que un
fallo ahí significaba que *«el problema está aguas arriba, en la rutina de Booking y en el plan de
escaparate, no en este cron»*. Era falso: las 22 mediciones de escaparate estaban en la tabla. Lo
único cierto del aviso era la cadena de la excepción. Un reparador que lea la narración va derecho al
fichero equivocado con toda la confianza del mundo.

De ahí las dos reglas que gobiernan el diseño:

1. **Solo dispara lo que tiene forma de excepción.** Es la doctrina «no lo sé ≠ no hay» del
   `CLAUDE.md` raíz aplicada al disparador: un `detalle` con código de error o nombre de excepción es
   «el código revienta» (reparable aquí); cualquier otro es «no pude mirar» (reparable fuera).
2. **Al orquestador se le manda la EVIDENCIA, nunca la interpretación.** El `detalle` crudo y los
   ficheros que escriben ese latido. Que acote él.

## Flujo

```
07:45  agentes-latido        escribe/evalúa agente_latidos          (ya existe)
08:00  latido-reparar.yml    ¿hay algo reparable? → reclama UNO
         └─ scripts/ai-programar.mjs  (acota → plan Opus → coder barato → aplica)
              └─ GATE DE PRUEBA
                   ├─ pasa → commit → push → PR → MERGE automático
                   └─ falla → PR draft + 📱 Telegram («no he sabido»)
+24 h  agentes-latido        veredicto de la reparación mergeada
         ├─ el latido se puso verde → cierra en silencio
         └─ sigue rojo        → 📱 Telegram («lo intenté, mergeé esto, sigue rojo»)
```

## El gate de auto-merge: prueba, no CI

**CI en verde no es «arreglado».** Un `tsc` limpio bendice igual el arreglo bueno y un «arreglo» que
borre la consulta entera. Lo que demostró que el fix del `date - bigint` era correcto fue un test que
**fallaba antes y pasa después**.

Y hay una razón operativa además de la conceptual: **el estado de checks de un PR miente en este
repo**. El PR #1529 mostraba ✅ con `tests.yml` y `ci.yml` sin haberse ejecutado nunca — GitHub no
dispara `pull_request` a partir de eventos hechos con según qué token (ya documentado en la cabecera
de `ai-programar.yml`). Un gate que pregunte «¿está el PR en verde?» habría contestado que sí.

Por eso el gate **ejecuta las pruebas dentro de su propio run** y mira el resultado:

1. El diff tiene que tocar al menos un `*.test.ts`. Si no, no hay merge.
2. Se revierte el árbol, se aplica **solo el parche de los ficheros de test** y se corren → **tienen
   que FALLAR**.
3. Se aplica el parche completo y se vuelven a correr → **tienen que PASAR**, y además `pnpm test`
   entero en verde.

El paso 2 sin el 3 no valdría (un test que ni siquiera importa también «falla»); los dos juntos
prueban que el test discrimina el antes del después.

## Carril acotado

El auto-merge se cancela —y pasa a PR draft + Telegram— si el diff toca:

- `.claude/**`, `CLAUDE.md`, `AGENTS.md` → lo que le dice a un agente qué hacer;
- `.github/workflows/**` → un reparador que se reescribe su propio disparador;
- `prisma/sql/**`, `**/*.sql` → migraciones: se aplican a mano contra la BD compartida.

Es la misma línea que `rutinas-automerge.yml` ya traza para el texto, movida al código.

## Frenos

| Freno | Regla |
|---|---|
| Bucle diario | Una **firma de error** = un intento. Mientras el agente siga rojo con la misma firma, no se vuelve a disparar. |
| Síntoma nuevo | Si la firma CAMBIA hay información nueva → se permite un intento más. |
| Insistencia | Máx. **3 intentos por agente en 30 días**. Agotados, se rinde y avisa una vez. |
| Solapamiento | Un solo intento vivo por agente, y `concurrency` de un run a la vez. |
| Coste | Pasa por `/api/ai/programar`, que ya respeta `AI_GATEWAY_LIMITE_DIARIO_EUR` y anota en `ai_usos`. |
| Claim perdido | El intento se registra en el MISMO movimiento en que se reclama (`FOR UPDATE`), como `cron_dispatch_cursor`: si el workflow muere a mitad, no se reintenta en bucle. |

## Piezas

### 1. `apps/plataforma/lib/monitoring/reparable.ts` — módulo PURO

Sin imports, testeable con `node --test`, hermano de `latidos.ts`:

- `esExcepcion(detalle)` — ¿tiene forma de excepción (SQLSTATE, `*Error`, `ECONNREFUSED`…) o es una
  narración de «no pude mirar»?
- `firmaError(detalle)` — huella ESTABLE del fallo: `42883:date-bigint`, no la frase entera (que
  lleva horas, contadores y nombres de fichero y cambiaría en cada pasada).
- `decidirReparacion({ latido, historial, ahora })` → `{ reparar, firma, motivo }` — toda la política
  de arriba, sin BD ni red.

### 2. Tabla `agente_reparaciones`

`agente, firma, detalle, estado, pr_numero, run_url, intento_at, merged_at, veredicto, veredicto_at,
avisado_at`. Estados: `intentando → pr_abierto | mergeada → resuelta | sigue_roja | fallida | rendida`.

### 3. `POST /api/internal/reclamar-reparacion`

Auth `isRoutineAuthorized` (token de bajo privilegio `ALERTA_TOKEN`, **nunca** `CRON_SECRET`: este
token vive en secrets de GitHub). Evalúa los latidos, aplica `decidirReparacion`, y devuelve **como
mucho uno**, registrando el intento en el mismo movimiento. Responde la evidencia cruda:
`{ id, agente, detalle, firma }` — sin la `nota` de `AGENTES_VIGILADOS`.

### 4. `POST /api/internal/reparacion-resultado`

El workflow reporta cómo acabó: `{ id, estado, pr_numero, run_url }`.

### 5. `.github/workflows/latido-reparar.yml`

Programado `0 8 * * *`. Reclama → localiza los ficheros que escriben ese latido (`grep` de
`registrarLatido` con el id del agente, determinista) → `scripts/ai-programar.mjs` → gate → merge o
PR draft + Telegram.

**Comparte el SCRIPT, no el workflow.** `ai-programar.yml` sigue siendo el camino manual y termina en
PR draft a propósito; envolverlo con `workflow_call` arrastraría sus pasos de espera de CI, que es
justo el veredicto en el que no nos podemos apoyar.

### 6. Veredicto en `agentes-latido`

El cron que ya corre a diario cierra el círculo: para cada reparación `mergeada` con más de 24 h y sin
veredicto, compara `agente_latidos.ultimo_ok_at` contra `merged_at`. Verde → `resuelta`, en silencio.
Rojo → `sigue_roja` + Telegram. **El agente no se declara curado a sí mismo: lo dice su huella.**

## Telegram: éxito = silencio

Solo se avisa en tres casos: no supo arreglarlo · lo mergeó y el latido sigue rojo a las 24 h ·
agotó los 3 intentos. Una reparación que sale bien no manda nada.

## Pruebas

- `reparable.test.ts` con **partes reales** del histórico: el `detalle` del `sivra_canal` del
  20/08/2026 (debe reparar), el «0 comps en 44 ventanas» del sweep y el «sin ajuste fiable» (no deben),
  estabilidad de la firma entre dos pasadas del mismo fallo, tope de 3 y cambio de firma.
- El gate del workflow se prueba a sí mismo por construcción: si no hay test que discrimine, no hay
  merge.

## Límites asumidos

- **Un agente por pasada.** Si dos caen el mismo día, el segundo espera al día siguiente. Es
  deliberado: un reparador que abre tres PRs a la vez es más difícil de auditar que el problema.
- **El coder barato escribe el parche.** El gate prueba que el test discrimina, no que el arreglo sea
  la solución más elegante. Por eso el carril acotado deja fuera lo irreversible.
- **Una avería que no deja excepción no se repara sola** (y no debe: no está en el repo).
