# CI: por qué un PR de Claude se queda con los checks «Expected» — histórico de mediciones

> Detalle completo de las 16 mediciones que llevaron al «ORDEN DEFINITIVO» que vive en
> `CLAUDE.md` (sección «CI: por qué un PR de Claude se queda con los checks «Expected»»).
> Se movió aquí el 09/09/2026 para no cargar esto en cada sesión — `CLAUDE.md` se lee
> siempre; esto se lee solo si el orden definitivo no resuelve y hace falta el porqué.

## 🤖 CI: por qué un PR de Claude se queda con los checks «Expected» (26/08/2026)

**Los pushes hechos con el token de la App de Claude NO disparan los workflows de Actions.** Es una
limitación de GitHub, no un fallo del repo. Consecuencia: un PR abierto y empujado por un agente puede
quedarse con **los 12 checks requeridos en «Expected — waiting for status to be reported»** para
siempre, y el merge lo rechaza la regla con `12 of 12 required status checks are expected`.

🚨 **«Expected» NO es «Failing».** Antes de tocar nada, mira si algún check está en ROJO: si los 12
están en Expected y ninguno rojo, no hay nada roto — es que **no han arrancado**.

🔴 **`workflow_dispatch` NO desbloquea el merge. Comprobado, no supuesto (26/08/2026).** Se lanzaron
los tres workflows sobre la rama, los **12 jobs requeridos acabaron en `success` sobre el head exacto
del PR** — y el merge siguió devolviendo `12 of 12 required status checks are expected`. Se repitió
sobre **dos heads distintos** (`a1c5b23e` y `4134a64c`) con idéntico resultado. **El ruleset no cuenta
los check runs que vienen de un `workflow_dispatch`**, aunque el nombre del job y el sha coincidan.
No pierdas la tarde por ahí: sirve para SABER si el código está sano, no para desbloquear.

⚠️ Y si aun así lo lanzas para verificar: los check runs aterrizan en el **head del momento**. Si
luego empujas otro commit, se quedan huérfanos en el sha viejo. Lánzalo después del último push.

✅ **SÍ hay forma de que el agente lo resuelva solo: SACAR EL PR DE DRAFT (27/08/2026).** Medido de
punta a punta en el PR #1763, sin que Alberto tocara nada:

| hora (UTC) | qué hizo el agente | qué pasó |
|---|---|---|
| 26/08 23:08 | push de la rama + PR abierto **en draft** (token de App) | **0 runs**; los 12 requeridos en «Expected» |
| 27/08 ~02:15 | intento de merge | `405 — 12 of 12 required status checks have not succeeded` |
| 27/08 ~06:11 | 2º push a la rama (mismo token de App) | (ver nota de abajo) |
| 27/08 06:12:18 | **PR marcado «ready for review»** (`draft:false` por la API) | **arrancan los 3 workflows** sobre `4efa129f`, evento `pull_request` |
| 27/08 06:15 | los 12 jobs requeridos en `success` (~3,5 min) | ✅ |
| 27/08 06:16 | merge (squash) | **`merged: true`** → `ba6ca86b` |
| 27/08 06:19 | PR #1768: rama nueva, PR en draft, des-draft **sin 2º push** | runs otra vez → mergeado |

**Confirmado con un SEGUNDO PR el mismo día (#1768).** Rama empujada, PR abierto en draft y sacado de
draft acto seguido — **sin ningún 2º push**: los runs arrancaron igual (`06:19:25`, evento
`pull_request`). Eso mata la explicación alternativa: el `synchronize` de un push **no** era lo que
disparaba nada en #1763, porque aquí no hubo ninguno.

**Y el tercer dato lo cierra:** un push posterior a #1768, con el PR **ya fuera de draft**, disparó los
runs otra vez (`06:21:48`). O sea, el `synchronize` SÍ funciona… cuando el PR no es draft.

🚨 **Conclusión: es el estado DRAFT lo que silencia los workflows.** Un PR en draft no produce runs ni
al abrirlo ni al empujarle commits; en cuanto se saca de draft, los dispara — y a partir de ahí cada
push vuelve a dispararlos con normalidad. Encaja con las cinco observaciones (dos `opened` en draft
mudos · el push a #1763 en draft, mudo · los dos des-drafteos que dispararon · el push a #1768 ya sin
draft, que disparó). Único fleco teórico: `ready_for_review` no está en los `types` por defecto de
`on: pull_request` y el `event` del run no distingue la acción, así que el mecanismo interno de GitHub
no se ha visto — pero el comportamiento está medido cinco veces y es reproducible.

✅ **El procedimiento, que es lo que importa:** abre el PR en draft (como siempre), y cuando esté listo
**quítale el draft**. Los 12 requeridos arrancan solos y en ~3,5 min está mergeable. **Ya no hace
falta que Alberto toque nada.**

⚠️ Lo que sigue siendo cierto: **el `workflow_dispatch` no vale** (ver arriba) y **el ruleset no se
toca**.

🔬 **Matiz medido el 27/08/2026 (PR #1777): un draft NO siempre es mudo — lo que manda es la
IDENTIDAD que abre el PR.** Ese PR se abrió **en draft** con la herramienta MCP de GitHub y los 12
requeridos arrancaron **al instante**, sin des-draftear: verdes en ~3 min y mergeado sin que Alberto
tocara nada. El run lo dice: `event: pull_request`, `actor: albertosuarezgutierrez-gif` — o sea, el
PR lo abre **tu cuenta de usuario**, no la App, y por eso el evento sí dispara. La regla útil es
entonces: **abrir el PR por la herramienta MCP** (o des-draftear, que también funciona), y lo que no
dispara es el **token de la App**. No des por hecho ninguna de las dos versiones sin mirar el
`actor` del run.

🚨 **TERCER dato, el mismo día (PR #1789): ni el draft ni la identidad lo explican del todo.** Los
tres PRs de esta tanda salieron de la MISMA rama, con la MISMA identidad (`actor` = la cuenta de
Alberto, PR abierto por la herramienta MCP) y los tres **en draft**. Los dos primeros (#1777,
#1779) dispararon los 12 requeridos al instante; el tercero **no disparó ninguno**: sobre su head
solo corrió `rutinas-automerge`, que es `pull_request_target` — o sea, el evento
**`pull_request` no llegó a los workflows requeridos**. Y **sacarlo de draft tampoco lo rescató**
(se probó: volvió a disparar solo el `pull_request_target`). No fue una caída de Actions: otro PR
del repo tuvo su run de `tests.yml` **diez segundos antes**.

Lo único que distinguía a #1789 es que el PR se abrió **~2 segundos después del push** de la rama.
Es una hipótesis de carrera, no una causa medida — **no la des por buena sin comprobarla**.

🚫 **Y las tres palancas que se probaron sobre #1789 fallaron las TRES.** Medido, en este orden:
abrir el PR → 0 runs · **des-draftear** → 0 runs · **push posterior con contenido real**
(`synchronize`) → 0 runs. En las tres, lo único que corrió sobre el head fue `rutinas-automerge`,
que es `pull_request_target`: o sea, **el evento `pull_request` no llegó ni una sola vez**, mientras
otros PRs del repo recibían el suyo con normalidad. Comprobado con `list_workflow_runs` filtrando
por rama: **cero runs de `tests.yml` en esa rama después de las 11:25**.

⚠️ Esto **corrige la frase que se escribió media hora antes en este mismo apartado** («el push
posterior lo desatasca»): es lo que había funcionado hasta ahora, pero en #1789 tampoco. **Causa
desconocida.** Lo que queda documentado no es un remedio, es qué NO gastar tiempo probando la
próxima vez.

✅ **CUARTA palanca, y ESTA SÍ funcionó (27/08/2026, 13:55 UTC, mismo PR #1789): MERGEAR `main` EN
LA RAMA.** Tres horas después de los tres intentos fallidos, `main` había avanzado dos commits y el
PR pasó a `mergeable_state: "dirty"` (conflicto en `CLAUDE.md` y en la memoria). Se resolvió el
conflicto y se empujó el commit de merge → **los 12 requeridos arrancaron a los pocos segundos**,
evento `pull_request`, sobre el head `b93d472e`. O sea: **el agente sí pudo desatascarlo solo**, y la
frase que había aquí —«hace falta mano de Alberto»— era falsa.

⚠️ **Lo que NO se sabe: por qué.** Dos pushes con contenido real (12:57 y 12:59 UTC) no habían
disparado nada. Entre el último mudo y el que funcionó cambiaron dos cosas a la vez —pasaron 56
minutos y el PR entró en conflicto— así que **no está aislado** si lo que desatasca es el merge de la
base, el que la mergeability se recalcule, o simplemente el tiempo. No lo des por causa medida.

**Orden a seguir cuando un PR no arranca los checks:** (1) mira si hay conflicto con `main`, y si lo
hay resuélvelo —es trabajo obligatorio de todas formas y encima puede desatascar; (2) si no lo hay,
**mergea `main` en la rama igualmente** (es un push con contenido real y no ensucia el historial como
un commit vacío); (3) solo si eso tampoco funciona, hace falta mano de Alberto: un push desde su
máquina, o cerrar y reabrir el PR desde la web, o abrir el PR de nuevo desde una rama con OTRO
nombre. **El agente no crea ramas nuevas por su cuenta** (solo empuja a la rama designada) y el
commit vacío sigue prohibido.

✅ **QUINTA medición (01/09/2026, PR #1938): el orden de arriba FUNCIONÓ tal cual está escrito, y
la secuencia completa se midió paso a paso.** Sin conflicto con `main` (paso 1 no aplicaba), se
ejecutó el paso 2 y arrancaron los 12 requeridos a los pocos segundos:

| paso | qué se hizo | runs de los requeridos |
|---|---|---|
| 1 | push de la rama (token de App) | **0** |
| 2 | PR abierto **en draft** por la herramienta MCP | **0** (solo `rutinas-automerge`, que es `pull_request_target`) |
| 3 | des-draftear (`draft:false` por la API) | **0** (ídem) |
| 4 | **merge de `main` en la rama + push** | ✅ **12/12**, `event: pull_request`, `actor: albertosuarezgutierrez-gif`, verdes en ~2,5 min |

🔀 **Y el PR de seguimiento del mismo día (#1940) volvió a romper el patrón: abierto IGUAL —MCP, en
draft, misma identidad— y disparó los 12 al instante** (`event: pull_request`, sin des-draftear ni
tocar nada). Dos PRs consecutivos, mismo método, resultados opuestos. Así que **el draft NO es la
causa**, o no es la única: sigue sin explicación, exactamente como quedó tras #1789. Lo único
accionable sigue siendo el orden de abajo.

Encaja con la hipótesis del draft del 27/08 **con un matiz que conviene recordar**: sacar de draft
por sí solo no disparó nada (como en #1789), pero dejó la rama armada para que **el push siguiente
sí** lo hiciera — el push inicial, con el PR aún en draft, había sido mudo con el mismo token. ⚠️ No
está aislado si lo que desatasca es el des-draft, el merge de la base o los dos juntos: aquí también
cambiaron dos cosas antes del push que funcionó. Lo que sí queda medido cinco veces es que **el orden
de abajo resuelve**, así que síguelo sin gastar tiempo en diagnosticar la causa.

🎯 **SEXTA medición (01/09/2026, PR #1962) — y ESTA SÍ trae una CAUSA MEDIDA, no otra hipótesis: el
objeto PR de GitHub se queda ATRASADO respecto a la rama.** Dos pushes seguidos con contenido real
(código y docs) sobre un PR **ya fuera de draft** salieron **mudos**: cero runs de los requeridos, solo
`rutinas-automerge` (que es `pull_request_target`). Idéntico a #1789. Pero esta vez se miró **el objeto
PR**, no solo los runs, y ahí estaba:

```
git ls-remote origin <rama>   →  5a732a51   ← la rama SÍ tenía el push
PR #1962: head.sha            →  d0d23c65   ← GitHub seguía en el head viejo
PR #1962: commits             →  2          ← de 5
PR #1962: mergeable_state     →  "dirty"    ← contra una base que ya no era la de main
```

O sea: **GitHub no había procesado el `synchronize`.** No hay `event` que mirar porque el evento no
existió. Y no era un fallo permanente — **a los ~2 minutos GitHub se puso al día solo** (head correcto,
5 commits, `mergeable_state: "blocked"`) y **los 12 requeridos arrancaron en ese mismo instante**
(`14:38:58`), sin tocar nada: sin des-draftear, sin mergear `main`, sin push nuevo. Verdes y mergeado.

🚨 **Lo que esto CORRIGE de todo lo de arriba:** en #1789 se probaron tres palancas (abrir PR,
des-draftear, push nuevo) y se declaró «causa desconocida»; en #1938 lo que «desatascó» fue un merge de
`main`… **que es un push más, y por tanto también un par de minutos más de espera**. La explicación
simple que encaja con las seis mediciones es el **lag**, no el draft ni la identidad: cada vez que algo
«funcionó» había pasado tiempo, y cada vez que «no funcionó» se miró demasiado pronto.

✅ **Procedimiento nuevo, y ahorra la tarde entera:** si tras un push los requeridos no arrancan,
**compara `git ls-remote origin <rama>` con el `head.sha` del PR ANTES de tocar nada.** Si no coinciden,
GitHub va con retraso: **espera 2-3 minutos y vuelve a mirar.** No des-draftees, no mergees `main`, no
empujes otro commit — cada palanca añade un head nuevo, reinicia la espera y confunde el diagnóstico
(fue exactamente lo que pasó aquí: el segundo push «mudo» no lo era, solo llegó mientras el primero
seguía sin procesarse).

⚠️ El orden de abajo sigue valiendo como respaldo si tras esperar el `head.sha` YA coincide y aun así no
hay runs — pero prueba primero lo barato, que es no hacer nada.

🥇 **SÉPTIMA medición (02/09/2026, PR #2029) — la más LIMPIA hasta ahora, y REHABILITA la hipótesis
del draft: no basta con salir de draft, hace falta un push DESPUÉS.** Cinco pasos, medidos en orden,
sin nada más de por medio:

| paso | qué se hizo | ¿draft? | runs de los requeridos |
|---|---|---|---|
| 1 | push de la rama (token de App) | — | **0** |
| 2 | PR abierto por la herramienta MCP | **sí** | **0** (solo `rutinas-automerge`, `pull_request_target`) |
| 3 | merge de `main` + push (contenido real, 2 PRs) | **sí** | **0** |
| 4 | des-draftear (`draft:false` por la API) | pasa a no | **0** |
| 5 | 2º merge de `main` + push (contenido real) | **no** | ✅ **19 runs**, todos verdes en ~4 min → mergeado |

Lo que esto AÍSLA mejor que ninguna medición anterior: el paso 3 y el paso 5 son **el mismo acto**
(merge de `main` con contenido real + push) y dan resultados **opuestos**. Lo único que cambia entre
ellos es el estado de draft. Y el paso 4 por sí solo no rescata nada: el des-draft **no reprocesa** los
pushes que llegaron en draft, solo **arma** la rama para que el siguiente sí dispare. Es exactamente el
matiz que quedó escrito —y no aislado— en la QUINTA medición.

⚠️ **Lo que NO demuestra:** que el draft sea la causa SIEMPRE. El PR #1940 se abrió en draft por MCP y
disparó al instante, y #1777/#1779 también. Así que el draft **silencia a veces**, no siempre; lo que sí
está medido siete veces es que **un push con contenido real sobre un PR que NO es draft dispara**.

✅ **Esto CORRIGE el «no des-draftees, no mergees `main`» del procedimiento del #1962** (que se escribió
para no confundir el diagnóstico con el lag): aquí el `head.sha` del PR **coincidía** con
`git ls-remote` en los pasos 3 y 4 —o sea, no había lag que esperar— y aun así no arrancaba nada. Con
el lag descartado, la palanca correcta es la de abajo.

🔁 **OCTAVA medición (03/09/2026, PR #2183) — el des-draft SOLO, sin push posterior, SÍ disparó.**
Secuencia limpia y sin nada de por medio: push de la rama (07:50, token de App) → **0 runs** · PR abierto
**en draft** por la herramienta MCP (07:51) → **0 runs de los requeridos** · **des-draftear** (`draft:false`)
→ ✅ **los 12 requeridos arrancan a los segundos** (07:51:13), verdes en ~3,5 min, 19/19 en total.
**Sin merge de `main`, sin segundo push, sin esperar el lag.**

⚠️ Esto **contradice la matización de la séptima** («des-draftear a secas no basta, hace falta un push
después»). Las dos están medidas, así que la conclusión honesta es que **el des-draft a veces basta y a
veces no** — igual que el draft silencia a veces y no siempre. Sigue sin haber causa medida; lo que hay
es un orden que funciona en las ocho. **No reescribas la séptima: era cierta en su PR.**

🔟 **NOVENA medición (04/09/2026, PR #2277) — el des-draft SOLO NO bastó, y confirma la séptima
sobre la octava.** Secuencia medida paso a paso, mirando el `event` y el `actor` de cada run:

| paso | qué se hizo | ¿draft? | runs de los requeridos |
|---|---|---|---|
| 1 | push de la rama (token de App) | — | **0** |
| 2 | PR abierto por la herramienta MCP | **sí** | **0** (solo `Vercel Preview Comments`) |
| 3 | merge de `main` + push (resolvía un conflicto REAL) | **sí** | **0** |
| 4 | des-draftear (`draft:false` por la API) | pasa a no | **0** (solo `rutinas-automerge`, `pull_request_target`) |

⚠️ **Y el lag quedó DESCARTADO antes de tocar nada** (procedimiento del #1962): `git ls-remote origin
<rama>` y el `head.sha` del PR **coincidían** en los pasos 3 y 4. O sea, no había nada que esperar.

Esto **confirma la séptima y contradice la octava**: des-draftear a secas no reprocesa los pushes que
llegaron en draft, solo arma la rama. Las dos siguen medidas, así que la conclusión honesta sigue
siendo que **el des-draft a veces basta y a veces no** — pero el orden de abajo funcionó en las nueve.

🔬 **DÉCIMA medición (05/09/2026, PR #2341) — y es el A/B más LIMPIO de toda esta sección, porque
mata lo que quedaba de las explicaciones por sujeto.** Abierto **en draft por la herramienta MCP**
→ los 12 requeridos arrancan **al instante** (10:14:10), sin des-draftear, sin merge de `main` y sin
segundo push; los 19 en verde antes de las 10:17.

Lo que lo hace valioso no es que funcionara, es **contra qué se compara**: el PR #2339, veintidós
minutos antes, en la **misma sesión**, sobre la **misma rama** (mismo nombre, recreada desde `main`
tras mergearse), con la **misma identidad**, abierto por el **mismo método** y también **en draft**
— y ese salió **mudo**. Dos PRs consecutivos, todo lo controlable idéntico, resultados opuestos.

Con eso ya no queda en pie ninguna de las hipótesis por sujeto: **no es la identidad** (la misma),
**no es el método** (el mismo), **no es el draft** (los dos lo eran) y **no es el token de la App**
(las dos ramas se empujaron igual). Lo único que las separa es *cuándo* ocurrieron, que es justo lo
que decía la hipótesis del lag de la SEXTA. Sigue sin haber causa medida; lo que sí queda es que
buscarla por el lado de «quién y cómo» está agotado.

⚠️ **Y un matiz del procedimiento del #1962 que conviene tener claro, porque se aplicó y engañó:** en
#2339 se comprobó que `git ls-remote` y el `head.sha` del PR **coincidían** y se dio por descartado el
lag. Coincidir descarta que GitHub tenga el head VIEJO — **no** descarta que el evento del `pull_request`
siga sin procesarse. Son dos cosas distintas y el paso 1 de abajo solo detecta la primera. En la duda,
esperar sigue siendo lo más barato: ninguna de las palancas cuesta menos que no hacer nada.

🔁 **UNDÉCIMA medición (05/09/2026, PR #2369) — lo único que añade es que el `synchronize` de un
PR que YA no es draft dispara con normalidad, y eso ya se sabía desde #1768.** Se anota igual para no
perder la serie, y con lo que NO se midió dicho en voz alta:

| paso | qué se hizo | ¿draft? | runs de los requeridos |
|---|---|---|---|
| 1 | push de la rama (token de App) | — | **no se miró** (así que este tramo no cuenta) |
| 2 | PR abierto por la herramienta MCP | **sí** | **no se miró** |
| 3 | des-draftear (`draft:false` por la API) | pasa a no | ✅ **19 runs** a los segundos (12:40:57), `event: pull_request`, `actor: albertosuarezgutierrez-gif` |
| 4 | 2º push con contenido real, ya sin draft | **no** | ✅ **20 runs** (12:53:06), verdes en ~3,5 min, incluido `Ready to merge` |

⚠️ **No aísla nada del paso 3**: como no se miró si había runs antes de des-draftear, no se puede decir
si los disparó el des-draft o si ya venían de la apertura del PR. Es exactamente el error de método que
el resto de esta sección lleva diez mediciones intentando evitar: **mira los runs ANTES de tocar cada
palanca**, o la medición no sirve.

🟡 Y se volvió a ver el falso positivo de Vercel del 02/09, esta vez **doce comentarios seguidos**
pintando los proyectos en «Building» antes de acabar en `12 Skipped Deployments` / `Ignored`. Cero
gasto de build. El estado que vale sigue siendo el FINAL, no el comentario que se reescribe solo.

✅ **DUODÉCIMA medición (05/09/2026, PR #2378) — el paso 3 del orden de abajo funcionó tal cual, y no
hizo falta nada más.** El PR llevaba rato **fuera de draft** y con el head ya procesado (`git ls-remote`
== `head.sha`, o sea sin lag que esperar), pero `mergeable_state: "dirty"`: `main` había avanzado dos
veces mientras se trabajaba. Resuelto el conflicto (en `docs/CONTEXTO-SESIONES.md`, dos entradas del
MISMO día que se conservan las dos, no son versiones rivales) y empujado el merge → **los 12 requeridos
arrancan a los segundos** (`event: pull_request`, `actor: albertosuarezgutierrez-gif`). No añade teoría
nueva: es la enésima vez que **un push con contenido real sobre un PR que no es draft dispara**.

🟢 **Y un dato de Vercel que quita una falsa alarma: un commit de MERGE SIN `[preview]` NO construye las
once.** Al empujarlo, los comentarios del bot pintaron **las 12 apps en «Building» y 0 Skipped** —peor
pinta que nunca, y es justo la combinación que en el PR #2281 costó once builds—, pero convergió a
**11 `Ignored` + `ialimp` `Ready`**, que es lo correcto: ialimp es la única app sin `--sin-previews`
(cliente vivo). La diferencia con #2281 es el **marcador**, no el commit de merge: `[preview]` es lo que
levanta el veto global; sin él, que el merge toque `pnpm-lock.yaml` solo importa para el paso 3 del
script, que igualmente no construye porque el veto sigue en pie. **No des la alarma desde el comentario
intermedio** (dos sesiones seguidas han estado a punto): el estado que vale es el final.

✅ **DECIMOTERCERA medición (05/09/2026, PR #2386) — abierto en draft por MCP y los 19 arrancaron al
instante, y esta vez SÍ se miró antes de tocar nada.** Rama empujada con el token de la App (**0 runs**,
comprobado), PR abierto **en draft** por la herramienta MCP → **19 runs a los segundos**, sin
des-draftear, sin merge de `main` y sin segundo push; verdes en ~3,5 min, incluido `Ready to merge`.

Corrige el error de método de la UNDÉCIMA, que anotó lo mismo sin haber mirado los runs antes del
des-draft y por eso no aislaba nada. Aquí el tramo sí cuenta: **el draft no silenció**. Es el mismo
resultado que #1777, #1779, #1940 y #2341 — y el contrario que #2029, #2277 y #2339, abiertos igual.
Sigue sin haber causa, y la conclusión de la DÉCIMA se mantiene: buscarla por el lado de «quién y
cómo» está agotado.

⚠️ **Y el merge NO fue inmediato aunque los 20 checks estuvieran verdes:** entre abrir el PR y pulsar
merge, `main` avanzó (#2385) y el `merge_pull_request` devolvió **405 «Pull Request has merge
conflicts»**. No es un fallo del CI ni del ruleset: es el paso 1 del orden de abajo llegando por la
otra punta. Se resuelve igual — mergear `main` en la rama, conservar las DOS entradas del mismo día en
`docs/CONTEXTO-SESIONES.md` (no son versiones rivales) y empujar.

🕰️ **DECIMOCUARTA (06/09/2026, PRs #2428, #2434 y #2439) — y es de OTRA COSA: no de si los checks
ARRANCAN, sino de si lo que te cuentan sobre ellos es VERDAD. Hasta el `405` del merge miente.**

Todo lo de arriba diagnostica «el run no existe». Esto es el problema contrario y se confunde con él:
el run existe, **ha terminado en verde**, y todo lo que puedes preguntar desde aquí sigue diciendo que
está corriendo. Medido tres veces el mismo día:

| PR | lo que había de verdad | lo que se leía desde aquí |
|---|---|---|
| #2428 | job en verde a las 18:41:54 | `get_check_runs` → `in_progress` ~25 min después |
| #2434 | ídem | ídem, hasta ~50 min |
| #2439 | `ci.yml` run `34055693102`, ese head exacto, `completed`/`success` (19:45:43) | **`merge_pull_request` → `405 ... "Lint · TypeCheck · Build" is in progress`** |

🚨 **Lo caro es el tercero: el mensaje del `405` se sirve del MISMO almacén retrasado.** Es
tentador leerlo como la fuente fiable —lo emite el propio merge— y no lo es: reintentar el merge
**sin cambiar nada** funcionó a la primera. Si el `405` te nombra un check «in progress», eso no
prueba que lo esté.

⚠️ **Y desde fuera hay TRES cosas que se ven idénticas.** Confundirlas es lo que hace perder la tarde,
porque solo una se arregla esperando:

| forma | cómo se distingue | qué hacer |
|---|---|---|
| **(a) reporte retrasado** — el job acabó, la API no se ha enterado | `list_workflow_runs` (filtrando por rama) da el run `completed`/`success` sobre ese head | reintentar el merge; no tocar nada |
| **(b) run creado que NUNCA arrancó** | **no hay señal que lo demuestre en el momento** — solo que pase el tiempo y el run siga sin jobs (ver DECIMOSEXTA) | **no se arregla solo**: hace falta un head nuevo (paso 3 del orden de abajo) |
| **(c) run en cola** esperando runner | el run existe con `status: queued`/`pending` — **y también da `total_count: 0`** | esperar |

`[Probable]` **`list_workflow_runs` filtrado por rama fue la lectura más fresca de las tres veces**, y
la única que acertó cuando `get_check_runs` y el `405` se equivocaban a la vez. Medido tres veces, no
más: úsalo como primer sitio donde mirar, no como verdad garantizada.

La forma (b) se vio una sola vez (#2439, run de `qa.yml` `34055588656`): un `expected` que no se
resolvía nunca porque no había job que esperar. Un caso, no una ley.

🩺 **DECIMOSEXTA (07/09/2026, PR #2530) — y corrige la fila (b) de la tabla de aquí arriba:
`total_count: 0` NO distingue un run muerto de uno en cola. Lo confundí y se lo dije a Alberto.**

Lo medido, en orden:

| hora (UTC) | qué se vio |
|---|---|
| 11:38 | run `34117636782` (`Tests & Typecheck`) creado, `status: pending`; `list_workflow_jobs` → **`total_count: 0`** |
| 11:38 | se diagnosticó **forma (b)** («run creado que nunca arrancó, hace falta un head nuevo») |
| 11:43:13 | los jobs **arrancaron solos**, ~5 min después de crearse el run |
| 11:47 | **14/14 en verde** — sin tocar nada: sin des-draftear, sin merge de `main`, sin push nuevo |

`[Seguro]` **Un run en cola todavía no tiene jobs materializados**, así que devuelve exactamente el
mismo `total_count: 0` que uno muerto. La fila (b) mandaba mirar la única señal que las dos formas
comparten, y por eso el diagnóstico salió al revés: era (c) disfrazada de (b).

`[Probable]` **lo único que separa (b) de (c) es el TIEMPO**, no una lectura: si el run sigue sin
jobs varios minutos después, empieza a parecer (b); antes de eso, no hay con qué afirmarlo. Y como
la palanca de (b) es fabricar un head nuevo —que reinicia la espera y borra la evidencia—,
**equivocarse hacia (b) es caro y equivocarse hacia (c) solo cuesta esperar**.

⚠️ Y ojo con el sesgo que lo provocó: la DECIMOCUARTA acababa de escribir la forma (b) con su
`total_count: 0` al lado, así que era el patrón que se tenía delante. **Un caso no es una ley** —lo
decía la propia DECIMOCUARTA de sí misma— y aquí se leyó como si lo fuera.

🧵 **DECIMOQUINTA (07/09/2026, PR #2503) — cuatro pushes al MISMO PR en draft: tres dispararon y el
cuarto no, y lo único que cambió fue que ese cuarto dejó el PR en conflicto.** Medido en orden, sin
palancas de por medio:

| paso | qué se hizo | ¿draft? | `mergeable_state` | runs de los requeridos |
|---|---|---|---|---|
| 1 | PR abierto por la herramienta MCP (head `d7fd6bf5`) | **sí** | clean | ✅ **19 runs** al instante, `event: pull_request` |
| 2 | merge de `main` + push (`b6e78903`) | **sí** | clean | ✅ dispara |
| 3 | push con contenido real (`7b57f525`) | **sí** | clean | ✅ dispara |
| 4 | push con contenido real (`c3449b0e`) | **sí** | **dirty** | **0** |

Lo que aporta: **el draft NO silenció ni una sola vez en este PR** —tres `synchronize` seguidos en
draft dispararon con normalidad—, así que suma al lado de #1777/#1940/#2341/#2386 y en contra de
#2029/#2277/#2339, todos abiertos igual. Y aporta un sospechoso nuevo que no estaba en la lista:
**el único push mudo es el que coincidió con que `main` avanzara y el PR pasara a `dirty`**.

`[Suposición]` que un PR en conflicto no reciba `synchronize` explicaría de una vez las tres veces
que «mergear `main`» apareció como la palanca que desatascaba (#1789, #1938, #2378) — en las tres
había conflicto, y resolverlo es lo que devuelve el PR a un estado computable. **No está aislado**:
aquí el conflicto y el push llegaron juntos, así que no se sabe cuál de los dos manda. No la des por
causa; lo accionable ya está en el paso 1 del orden de abajo, que manda resolver el conflicto
primero por otra razón (es trabajo obligatorio de todas formas).

