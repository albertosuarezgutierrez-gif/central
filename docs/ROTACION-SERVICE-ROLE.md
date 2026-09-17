# Rotación de la `service_role` expuesta — inventario y plan

> 🚨 **Checklist de emergencia añadido 10-11/09/2026** (sesión `sidra-guest-data-breach`,
> disparada por una sospecha de phishing por WhatsApp a huéspedes de SIVRA). Lo que sí se
> pudo hacer desde una sesión de Claude ya está hecho: 12 Edge Functions huérfanas
> neutralizadas (`verify_jwt: true`, ver `supabase/functions-rescatadas/README.md`) y
> arreglado el bug de borrado de `sync-smoobu`. **Lo de abajo sigue pendiente — necesita
> paneles/credenciales que esta sesión no tiene:**
> 1. Revocar los 3 PAT de GitHub (`ghp_97Ct…`, `ghp_5MfB…`, `ghp_hft2…`) — GitHub → Settings →
>    Developer settings → Personal access tokens.
> 2. Cambiar la contraseña que iba en claro en `trigger-deploy` (login de
>    `housesevillana.vercel.app`), y si se reusó en otro sitio, cambiarla también ahí.
> 3. Regenerar el deploy hook de Vercel del proyecto `sivra` (Settings → Git → Deploy Hooks).
> 4. Rotar la API key de Smoobu (panel Smoobu → Settings → API) y actualizarla en
>    `pms_connections` (4 filas) y en el secreto `SMOOBU_API_KEY` de Edge Functions.
> 5. Activar **Secret scanning + Push protection** en GitHub (repo `central` → Settings →
>    Code security and analysis) — confirmado con `run_secret_scanning` que hoy NO está.
> 6. El plan completo de abajo (migrar a `sb_secret_…`/`sb_publishable_…` en ~50 sitios antes
>    de pulsar «Disable JWT-based API keys») sigue siendo el paso que cierra la fuga real.

> Credencial: `service_role` (legacy, JWT) del proyecto Supabase **`wswbehlcuxqxyinousql`** («central»),
> emitida el 15/04/2026, **vigente hasta 2036**, publicada en el repo PÚBLICO `house-sevillana-landing`
> (commit `7c53e19`, 06/05/2026) y detectada por gitleaks el 12/08/2026 al unificar la landing.
> Salta RLS → lectura/escritura total sobre la BD compartida de TODAS las verticales.
>
> **Borrar el repo NO invalida la clave.** Estuvo pública ~3 meses: hay que asumirla comprometida
> y revocarla. Este documento es el inventario previo a la rotación (rotar antes de inventariar
> tumba producción).

## 🔴 El hallazgo que define el trabajo (panel, 19/08/2026)

**Las claves legacy no se pueden desactivar por separado.** El panel (Settings → API Keys) no tiene
interruptor por clave: solo una tarjeta «Disable legacy API keys» con un botón único
**«Disable JWT-based API keys»**. Matar la `service_role` filtrada mata **también la `anon`** en el
mismo golpe.

Consecuencia: la rotación no es «cambiar una variable en 3 sitios». Hay que migrar **los dos**
públicos —backends a `sb_secret_…` y clientes a `sb_publishable_…`— antes de poder pulsar ese botón.
Hasta que se pulse, **la clave filtrada sigue siendo válida**.

Lo que ya está a favor (verificado): existen y están operativas una secret key `default`
(`sb_secret_…`) y una publishable `default` (`sb_publishable_…`), así que no hay que tocar el JWT
secret ni invalidar las sesiones de usuario.

## Inventario de consumidores (grep del monorepo + panel, 19/08/2026)

### Cara `service_role` → migrar a `sb_secret_…`

| Dónde | Cuántos | Nota |
|---|---|---|
| Vercel env `SUPABASE_SERVICE_ROLE_KEY` en **`ia-rest`** | 1 | All Environments, «Updated Jun 10», sin marcar Sensitive |
| Vercel env `SUPABASE_SERVICE_ROLE_KEY` en **`central-rrhh`** | 1 | Production + Preview, marcada Sensitive |
| Edge Functions de ia-rest con `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` | **43 de 45 en el repo** | la inyecta Supabase; en el panel ya sale **DEPRECATED**, sustituta `SUPABASE_SECRET_KEYS` (ya inyectada, junto con `SUPABASE_PUBLISHABLE_KEYS`) |
| 🔴 Edge Functions **desplegadas y NO versionadas** | **22** | ver lista abajo. Al menos una (`sync-smoobu`) lee `SUPABASE_SERVICE_ROLE_KEY` legacy, la invoca un cron diario y **borra filas de `incomes`** |
| GitHub Actions | 0 reales | `ci.yml` usa `ci_dummy_service_role_key` |

⚠️ **`ialimp` NO tiene la variable** (verificado en el panel: ni propias, ni compartidas, ni de equipo).
Su único consumidor es `apps/ialimp/lib/storage-limpiadora.ts`, que por eso usa `requireSecret()` desde
el 12/08 para fallar con un error legible. Ese módulo (documentos de la limpiadora / nómina PDF) **está
roto, no funcionando**: nada que rotar ahí, pero sí que arreglar algún día — es una decisión aparte.

### Cara `anon` → migrar a `sb_publishable_…` (arrastrada por el todo-o-nada)

| Dónde | Cuántos |
|---|---|
| Ficheros que leen `*ANON_KEY` | **28** (`ia-rest` 15, `ialimp` 10, `sivra` 2, `rrhh` 1) — recuento del 20/08 |
| Cron `pg_net` `monitor-health` (`20260819_crons_bd_compartida.sql`) | 1 — manda la **anon legacy** como `Bearer`, cada 5 min |

**Envs de Vercel — inventario COMPLETO de los 10 proyectos (20/08/2026, cierra el «revisar el resto»):**

| Proyecto | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |
|---|---|---|
| `ia-rest` | plain · prod+preview+**dev** | plain · prod+preview+**dev** |
| `central-rrhh` | sensitive · prod+preview | sensitive · prod+preview |
| `ialimp` | plain · prod+preview+dev | — |
| `sivra` | plain · prod+preview+dev | — |
| `plataforma`, `almacen`, `alquiler`, `transporte`, `ialimp-landing`, `house-sevillana-landing` | — | — |

🔴 **Hallazgo que ENSANCHA el trabajo: 4 apps no entran por la API de Supabase.** `plataforma`, `almacen`,
`alquiler` y `transporte` no tienen NINGUNA variable de Supabase: hablan con Postgres por `DATABASE_URL` /
`DIRECT_URL` (Prisma, conexión directa). **Rotar las claves API no las protege** — su credencial es la
contraseña de Postgres dentro de esa cadena, que es un secreto distinto y NO entra en el botón «Disable
JWT-based API keys». Si el objetivo es cerrar el acceso a la BD tras la filtración, `DATABASE_URL` necesita
su propia decisión. (La `service_role` filtrada no expone esa contraseña, así que no es el mismo incendio;
pero tampoco queda cubierto por esta rotación, y conviene no creer que sí.)

## 🔴 22 Edge Functions desplegadas sin código en el repo (20/08/2026)

El panel sirve **67** funciones; el repo versiona **45**. El diff (por MCP, `list_edge_functions` contra
`ls apps/ia-rest/supabase/functions/`) da **22 huérfanas** y **0** en el sentido contrario — o sea, no hay
código muerto: hay **código fantasma**, ejecutándose en producción sin fuente en ningún repositorio.

`add-smoobu-booking` · `boe-doc` · `deploy-agente` · `deploy-dashboard` · `drive-folder-list` ·
`drive-photos-publish` · `drive-upload-factura` · `ficha-fotocasa` · `github-commit` · `import_csv` ·
`inject-ga4` · `junta-pdf-texto` · `merge-landing-to-main` · `push-clean-page` · `push-route-ga4` ·
`rehost-catalogo` · `sync-smoobu` · `trigger-deploy` · `trigger-redeploy` · `upload-landing` ·
`upload-photo-github` · `zona-fotocasa`

**Por qué bloquea la rotación:** el inventario de consumidores de la clave legacy se hizo por `grep` del
repo, y estas 22 no están en el repo. Cualquiera puede ser un consumidor. Comprobado en la primera que se
miró — `sync-smoobu`, invocada por el cron `jobid 1` a diario:

```ts
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!   // legacy
await supabase.from('incomes').delete().eq('id', incId)          // borra ingresos de SIVRA
```

**Y es un riesgo por sí mismo, aparte de la rotación:** su fuente solo existía en los servidores de
Supabase. **Ya no: las 22 están rescatadas** en `supabase/functions-rescatadas/` (PR #1517, 20/08/2026),
con los secretos sustituidos y `gitleaks` de por medio. Ese README es ahora la fuente de verdad sobre
qué hace cada una; aquí solo queda lo que afecta a la rotación.

**Lo que el rescate cambió para este plan:**

1. **Consumidores legacy confirmados dentro del lote.** `sync-smoobu` (cron jobid 1, diario 05:00) y
   `github-commit`, `deploy-dashboard`, `inject-ga4`, `rehost-catalogo`, `drive-upload-factura` e
   `import_csv` leen `SUPABASE_SERVICE_ROLE_KEY` del entorno de Edge Functions. Ninguna aparecía en el
   grep del repo. Al rotar hay que **actualizar también los secrets de Edge Functions**, no solo Vercel.
2. **Un consumidor legacy MÁS de la cara anon**, aparte del jobid 28: la landing vieja
   (`house-sevillana-landing`) leía `_deploy_assets` por PostgREST con la anon incrustada en el bundle
   —vía `push-route-ga4`—. Medido: esa copia está corrupta (44 caracteres de firma en vez de 43), así
   que ya no autentica, y la landing viva es hoy `apps/housesevillana`, que no toca Supabase. **No
   bloquea la rotación**, pero explica por qué aquel invento dejó de funcionar.
3. **Tres PAT de GitHub y una contraseña personal en claro** dentro de esas fuentes. No es la
   `service_role`, pero es la misma familia de fuga y va en el mismo lote de revocaciones (detalle y
   pasos en el README del rescate).
4. **19 de 22 con `verify_jwt = false`**, seis con efecto real (escritura o fuga de sesión). Eso importa
   aquí porque **la rotación no las arregla**: cambiar la clave no cierra un endpoint que nunca pidió
   clave. Borrarlas es trabajo aparte y anterior en prioridad para dos de ellas (`upload-landing`,
   `trigger-deploy`).
5. **`sync-smoobu` puede vaciar `incomes`** si Smoobu contesta 200 con lista vacía. No es un problema de
   claves, pero es la función legacy más peligrosa del lote y conviene arreglarla en la misma pasada en
   que se le cambie la credencial. Ver hallazgo 3 del README del rescate.

⚠️ No todas son de `ia-rest`: `sync-smoobu` y `add-smoobu-booking` son de SIVRA; `boe-doc`,
`junta-pdf-texto`, `ficha-fotocasa` y `zona-fotocasa` **sí son de subastas** (`apps/plataforma`) y están
VIVAS — no borrarlas con el resto; `rehost-catalogo` es de `apps/almacen`. La carpeta del rescate es un
salvavidas, no el destino definitivo: decidir a qué app va cada una sigue pendiente.

## 🛑 «Cero tráfico legacy en 24 h» NO autoriza a pulsar el botón (20/08/2026)

Una auditoría de los logs del panel agrupó las 10.727 peticiones de 24 h por prefijo de clave y encontró
**cero** con JWT legacy: todo iba por `sb_secret_…` / `sb_publishable_…`. De ahí se concluyó que las apps
ya estaban migradas y que pulsar «Disable JWT-based API keys» no rompería nada, evitando los 28 ficheros.

**Es falso, y hay contraejemplo medido.** El cron `pg_cron` **jobid 28** (`monitor-health`, `*/5 * * * *`)
lleva un **JWT legacy incrustado en el propio comando SQL**, en cabecera `Authorization: Bearer`:

```sql
select command like '%eyJ%' as lleva_jwt,
       substring(command from 'Bearer ([A-Za-z0-9]{3})') as prefijo
from cron.job where jobid = 28;   -- → lleva_jwt = true, prefijo = 'eyJ'
```

Se ejecuta **288 veces al día** y sus respuestas son 200. O sea: la clave legacy **está en uso ahora
mismo**. Pulsar el botón mataría el monitor de salud — y lo mataría **en silencio**, que es el peor sitio
donde puede fallar algo.

**Por qué la auditoría no lo vio:** las llamadas de `pg_net` salen de dentro de la propia base de datos,
no del edge, así que no aparecen en la agrupación de `edge_logs` que se muestreó. *No estaban en la tabla*
se leyó como *no existen*.

⚠️ **Y `cron.job_run_details` tampoco sirve para desmentirlo.** Ahí el jobid 28 sale `succeeded` 250 de 250
veces… pero `SELECT net.http_post(...)` es **asíncrono**: «succeeded» significa **«la petición se encoló»**,
no que devolviera 200. El estado real está en `net._http_response`. Es literalmente la regla de la casa:
*un check que se pone verde porque la consulta no devolvió nada es el fallo más caro que hay* — y aquí el
check que engaña es el del propio monitor de salud.

**Regla operativa que queda:** la ausencia de tráfico en una ventana de logs **no** demuestra la ausencia
de consumidores. Antes de desactivar las legacy hay que agotar el censo por el lado del CÓDIGO y de la
CONFIGURACIÓN (grep del repo, `cron.job`, envs de Vercel, las 22 Edge Functions no versionadas), no por
el lado del tráfico observado. Un cron mensual no aparece en 24 h de logs, y la retención del plan Free
es de ~24 h.

## Plan de rotación (orden obligatorio, sin downtime)

1. **Ya hecho:** existen `sb_secret_…` y `sb_publishable_…` (`default`). Nada que crear.
2. **Backends a secret key.** Vercel `ia-rest` y `central-rrhh`: sustituir el valor de
   `SUPABASE_SERVICE_ROLE_KEY` → redesplegar → verificar.
   **Aprovechar para crearla ya como Sensitive en `ia-rest`, no antes** (comprobado 20/08): en Vercel,
   Sensitive no es una casilla sino un **tipo** de variable, y la doc dice que las sensibles «solo están
   disponibles en producción y preview» — o sea que marcarla **expulsa Development**, hoy activo. Como
   este paso ya sustituye el valor, hacerlo aquí sale gratis; hacerlo antes es tocar la variable dos
   veces. ⚠️ No confundir el tipo **Sensitive** con el tipo **Secret** («Secreto» en el panel
   traducido): Secret vacía el valor y pide elegir un secreto ya existente de Vercel — no es lo que
   queremos, y elegirlo por error perdería el valor actual.
3. ✅ **Edge Functions — CÓDIGO HECHO (11/09/2026), pendiente de desplegar.** Las 43 versionadas +
   las 7 rescatadas usan `claveSecreta()` de `_shared/clave-supabase.ts`, que prefiere
   `SUPABASE_SECRET_KEYS['default']` y cae a la legacy mientras convivan.
4. ✅ **Clientes a publishable key — CÓDIGO HECHO (11/09/2026).** Los 27 ficheros usan
   `clavePublicable()` de `lib/claves-supabase.ts` (prefiere `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   cae a `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Falta **añadir** esa variable en los 4 proyectos Vercel
   — ver la tabla de «Lo que hay que hacer A MANO».
5. **Cron `monitor-health`:** pasar de `Authorization: Bearer <anon>` a cabecera `apikey`.
6. **Desactivar las legacy** con «Disable JWT-based API keys». **Esto es la rotación.** Es reversible
   (se pueden reactivar si aparece un consumidor olvidado).
7. **Revisar los logs de Supabase** por uso ajeno entre el 06/05 y la desactivación.

## ✅ Piloto EJECUTADO y pasos 3 y 4 escritos (11/09/2026)

**El piloto salió bien: la clave nueva SÍ habla con PostgREST.** `ia-training-dashboard` se desplegó
(v24) usando `claveSecreta()` y devolvió **200 con datos reales** (559 registros, 20 recientes,
2 clientes activos).

Cómo se midió, que es la mitad del hallazgo: **un 200 no demuestra nada por sí solo**, porque el
helper cae a la legacy si la nueva no está — habría salido igual de verde sin migrar nada. Por eso
la respuesta lleva ahora dos campos que no existían:

- **`origen_clave: "nueva"`** → confirma que la petición fue con `sb_secret_…` (o sea, que
  `SUPABASE_SECRET_KEYS` está inyectada y se prefirió).
- **`error_postgrest`** → el primer error de PostgREST, si lo hay. Destapó de paso que
  `iarest.v_training_stats` **no existe** («Could not find the table … in the schema cache»): el
  panel lleva pintando «Por restaurante» vacío desde siempre y nadie se enteraba porque el código
  hacía `a.data ?? []`. No es culpa de la rotación (la versión legacy devolvía lo mismo), pero es
  la regla de la casa en vivo: un `?? []` convirtiendo un fallo en «no hay datos».

⚠️ **Sin salida a internet desde la sesión** (el proxy bloquea `*.supabase.co`), así que la llamada
se hizo **desde la propia BD** con `pg_net`: `select net.http_get('…/functions/v1/ia-training-dashboard?pin=9999&api=1')`
y luego leyendo `net._http_response`. Sirve igual y no hace falta navegador.

### 🔧 Corrección medida a las «trampas conocidas»: el gateway SÍ entiende las claves nuevas

La sección de abajo daba por hecho, leyendo documentación contradictoria, que una clave nueva en
`Authorization: Bearer` sería rechazada como `Invalid JWT` y que **las 43 funciones necesitarían
`verify_jwt = false` a mano**. **Medido el 11/09/2026 contra el gateway real** (`img-b64`, que está
en `verify_jwt = true`), con `pg_net` y la `sb_publishable_…`:

| Cabeceras enviadas | Resultado |
|---|---|
| *(ninguna)* | **401** `UNAUTHORIZED_NO_AUTH_HEADER` |
| `Authorization: Bearer esto-no-es-un-jwt` | **401** `UNAUTHORIZED_INVALID_JWT_FORMAT` |
| `Authorization: Bearer sb_publishable_…` | **pasa** (responde la función) |
| `apikey: sb_publishable_…` *(sin Authorization)* | **pasa** (responde la función) |
| las dos a la vez | **pasa** |

O sea: el gateway **sí reconoce el formato nuevo**, en `Authorization` y en `apikey`, y sigue
rechazando lo que no es ni una cosa ni la otra. Las dos primeras filas son el control que demuestra
que el check estaba activo de verdad y no que «pasa todo».

### 🔴 Y LA TRAMPA DE VERDAD, que esa tabla no veía: **Storage NO se comporta igual**

Lo de arriba se midió contra `/functions/v1` y se dio por bueno para todo. **Lo es para
`/rest/v1`, y NO lo es para `/storage/v1`** — medido el mismo día, después de que la revisión
preguntara por qué se extrapolaba de un subsistema a los otros dos:

| Cabeceras | `/storage/v1` | `/functions/v1` | `/rest/v1` |
|---|---|---|---|
| solo `Authorization: Bearer <clave nueva>` | **❌ 403 `Invalid Compact JWS`** | ✅ pasa | ✅ pasa |
| solo `apikey: <clave nueva>` | ✅ pasa | ✅ pasa | ✅ pasa |
| las dos | ✅ pasa | ✅ pasa | ✅ pasa |

Control de la medición: con la **`anon` legacy** en `Authorization` a secas, Storage responde
`404 Object not found` (o sea, autenticó y el objeto no existe), y con una cadena inventada
responde el mismo `403 Invalid Compact JWS` que con la clave nueva. Es decir: **Storage trata la
clave nueva como un JWT roto**, exactamente igual que si no fuera nada.

**Por qué esto era el fallo más caro de todo el trabajo.** Trece sitios del monorepo suben fotos,
firman URLs o borran objetos mandando la clave SOLO en `Authorization: Bearer`: las fotos de
limpieza de ialimp y sivra (cliente vivo), el expediente y las nóminas de RR.HH., los logos del
god-panel, y `packages/core-storage`. Con la `anon` legacy funcionan. El día que se añada la clave
nueva —**un cambio de env, sin desplegar nada, sin tocar código**— **dejan de funcionar todos a la
vez**, y el error que sale (`Invalid Compact JWS`) no menciona ni la variable ni la migración.

Arreglado mandando **siempre las dos cabeceras**, que es lo que hace `supabase-js` por su cuenta y
lo único que funciona con las claves viejas y con las nuevas en los tres subsistemas:
`cabecerasClave()` en `lib/claves-supabase.ts` (y a mano en `packages/core-storage`, que no puede
importar el helper de una app). Lo vigila un brazo propio del guardián.

> Lección de método: **las tres APIs de Supabase comparten dominio y clave, pero no comparten
> validador.** Una medida contra `/functions/v1` no dice nada de `/storage/v1`. Medir el
> subsistema que se va a usar, no un primo suyo.

**Consecuencia práctica: NO hay que tocar `verify_jwt` en las 43.** Lo que sí queda pendiente de
confirmar con la clave SECRETA (no se puede leer su valor desde aquí, solo usarla dentro de una
función) es el mismo comportamiento en `Authorization: Bearer`. Por eso `cabecerasServicio()`
manda la clave nueva **solo en `apikey`**, que es la forma que sí está medida: es la opción
conservadora, y las 5 funciones destino a las que se invoca ya están todas en `verify_jwt = false`.

🚨 **Y el agujero que esto NO cierra, que conviene no confundir:** esas funciones destino
(`push-send`, `notify-error`, `brain-parse`, `courier-route`, `vox-confirm`, `menu-stockout`,
`verifactu-sign`) **no comprueban ninguna credencial en su código** — se apoyaban en el gateway, y
con `verify_jwt = false` no queda nadie mirando. Cambiar de clave no lo empeora ni lo mejora: ya
estaban abiertas. Es trabajo aparte, de la misma familia que las 12 huérfanas que se cerraron el
10-11/09.

### Qué queda hecho en código (pendiente de desplegar)

- **Paso 3 — las 43 Edge Functions versionadas**: migradas a `claveSecreta()` /
  `clavePublicable()` de `apps/ia-rest/supabase/functions/_shared/clave-supabase.ts`.
- **Las 7 rescatadas** que leían la legacy (`sync-smoobu`, `github-commit`, `deploy-dashboard`,
  `inject-ga4`, `rehost-catalogo`, `drive-upload-factura`, `import_csv`): igual, con una copia del
  helper en `supabase/functions-rescatadas/_shared/` (son dos raíces de despliegue distintas; un
  guardián comprueba que las dos copias no se separen).
- **Paso 4 — los 27 ficheros de app** que leían la anon: migrados a `clavePublicable()` de
  `lib/claves-supabase.ts` (uno por app: ia-rest, ialimp, sivra, rrhh).
- **Guardián**: `test/regression-claves-supabase.test.ts` — impide que vuelva a colarse una lectura
  directa de la legacy y **ejecuta** los helpers para comprobar el orden de preferencia (un helper
  con el orden invertido tiene el mismo aspecto, sale verde y no migra nada).

⚠️ **`ia-training-dashboard` está DESPLEGADA (v24) con código que solo existe en la rama del piloto.**
Si esa rama no se mergea, producción corre algo que no está en git — el mismo desajuste que se
encontró en `sync-smoobu` (ver abajo). El bundle es autocontenido, así que funciona; pero hasta el
merge, el repo no describe lo que hay corriendo.

🩹 **`sync-smoobu`: el repo iba DETRÁS de lo desplegado.** Las dos guardas que impiden vaciar
`incomes` se aplicaron el 10-11/09 por MCP y no se commitearon, así que redesplegar la copia del
repo las habría borrado en silencio. El fichero del repo se ha puesto al día con la v27 viva antes
de migrarle la clave. **Norma que deja esto:** una función que se arregla por MCP se commitea en el
mismo movimiento, o el repo se convierte en una mina.

### Lo que hay que hacer A MANO (no cabe en un PR)

🚨 **Antes de añadir ninguna env: el cambio de la clave publicable se nota SIN desplegar.** Las
apps leen `NEXT_PUBLIC_*` en build, así que la variable nueva no entra hasta el siguiente
despliegue… **salvo en las rutas de servidor**, que la leen en caliente. Añádela cuando puedas
mirar las fotos de ialimp y sivra justo después, no un viernes por la tarde.

**Envs de Vercel — añadir, no sustituir** (así el fallback del código tiene sentido y la vuelta
atrás es quitar la variable nueva):

| Proyecto | Variable a AÑADIR | Valor |
|---|---|---|
| `ia-rest` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `ialimp` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `sivra` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `central-rrhh` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |

Y la cara de servicio, que **sí es sustituir el VALOR** (el nombre de la variable no cambia, paso 2):
`SUPABASE_SERVICE_ROLE_KEY` → `sb_secret_…` en `ia-rest` y en `central-rrhh`.

**Despliegue de las Edge Functions**: las 43 + las 7 rescatadas hay que desplegarlas para que el
cambio surta efecto. Se despliegan con el helper incluido en el bundle: el fichero `_shared/clave-supabase.ts`
va como segundo fichero del deploy y el entrypoint es `<slug>/index.ts` (así se hizo el piloto y
así resolvió el import relativo `../_shared/clave-supabase.ts`). **Al desplegar, respetar el
`verify_jwt` que cada función tiene HOY** — el valor por defecto de la herramienta es `true` y
ponérselo a una que estaba en `false` deja mudo a su cron.

**El bridge del restaurante** (`apps/ia-rest/scripts/bridge-v6/bridge-v6.js`) lleva la `anon` legacy
incrustada porque corre en el PC del cliente y no se actualiza solo. Ahora prefiere
`SUPABASE_PUBLISHABLE_KEY` del entorno, pero **si no se le pone esa variable, el día de la rotación
se queda sin Realtime**. No es la app: es un binario instalado.

## 🧪 Piloto antes de tocar las 43 (19/08/2026)

La documentación de Supabase se contradice en el punto que MÁS importa aquí. La guía de migración
dice que en backend basta con `createClient(url, 'sb_secret_…')`, pero la página de claves añade que
una clave nueva en `Authorization: Bearer` «se reenvía a la base de datos y se rechaza porque no es
un JWT» — y `supabase-js` manda la clave en **las dos** cabeceras por defecto. No se puede decidir
desde la documentación si las 43 funciones seguirían hablando con PostgREST tras el cambio.

Por eso **NO** se migran las 43 a ciegas. Primero va una sola, `ia-training-dashboard`, elegida
porque solo lee, está detrás de un PIN y se abre en el navegador (o sea que ya tiene
`verify_jwt=false`): si la clave nueva no sirviera, se ve al abrirla y no se cae nada.

- **Cómo se prueba:** desplegar esa función y abrir `…/functions/v1/ia-training-dashboard?pin=9999&api=1`.
  Si devuelve el JSON de siempre, la clave nueva vale contra PostgREST y las otras 42 son mecánicas.
  Si devuelve `Invalid JWT` o 401, la migración necesita otro enfoque (SDK `@supabase/server`) y nos
  hemos enterado con una función tonta en vez de con la de facturar.
- El helper `claveSecreta()` **prefiere la nueva y cae a la legacy**, así que mientras convivan el
  cambio es reversible.

## ⚠️ Trampas conocidas antes de tocar código

> 🔁 **Las dos primeras trampas se MIDIERON el 11/09/2026 y resultaron ser falsas tal como estaban
> escritas.** Se dejan aquí porque explican de dónde venía el miedo, pero manda la tabla de la
> sección «Corrección medida» de arriba: el gateway entiende las claves nuevas en `Authorization` y
> en `apikey`, y **no hay que tocar `verify_jwt` en las 43**.

- ~~**Las claves nuevas NO son JWT.** Van en la cabecera `apikey`; en `Authorization: Bearer` el gateway
  intenta parsearlas como JWT y devuelve `Invalid JWT`.~~ Medido: pasa en las dos cabeceras. Sigue
  siendo cierto que **no son JWT** y que lo que no es ni JWT ni clave válida da `Invalid JWT`.
- ~~**`verify_jwt`**: la función que pase a la clave nueva necesita `verify_jwt = false`.~~ Medido:
  no lo necesita. Lo que sí es cierto es la segunda mitad — **una función en `verify_jwt = false` no
  tiene a nadie validando su credencial** salvo que lo haga su propio código, y ninguna de las de
  ia-rest lo hace. Eso es un agujero preexistente, no un efecto de la rotación.
- **Realtime**: las conexiones públicas quedan limitadas a 24 h salvo que se eleven con auth de usuario.
  Ojo al **KDS de ia-rest**, que son pantallas abiertas días enteros.

## ✅ La banda naranja de Supabase era un aviso legal, no una alarma (medido 20/08/2026)

El 19/08 se escribió aquí que la banda naranja del dashboard («El período de gracia ha finalizado ·
Tus proyectos no podrán atender solicitudes cuando agotes tu cuota») era «más urgente que la
rotación». **Era falso, y el error es de método: se leyó un cartel en vez de medir.**

Medido en Organization → Usage, ciclo 15/08–15/09/2026 (5 días corridos): **ninguna métrica pasa del
35%**, y el overage del período es 0 en todas.

| Métrica | Uso | Límite Free | % |
|---|---|---|---|
| Database Size | 168,89 MB | 500 MB / proyecto | 35% |
| Egress | 0,676 GB | 5 GB | 14% |
| Storage Size | 0,063 GB | 1 GB | 6% |
| Invocaciones de Edge Functions | 8.978 | 500.000 | 2% |
| MAU (propios y de terceros) | 0 | 50.000 | 0% |
| Realtime (picos y mensajes) | 0 | 200 / 2.000.000 | 0% |

Contraste independiente por MCP el mismo día: `pg_database_size` da **154,72 MB (30,9%)**. La cifra
del panel es algo mayor porque incluye overhead que la consulta no ve; las dos dicen lo mismo.

El texto completo de la banda es condicional y **permanente**: «Tu período de gracia terminó el 10 jul
2026. Ahora aplica la Fair Use Policy. **Si** tu organización supera su cuota, tus proyectos pueden ser
restringidos y las peticiones responderán con 402». Es un aviso de estado de cuenta que lleva ahí
desde julio y seguirá ahí al 2% de consumo. `compute` y `branching` ni siquiera aparecen: no son
métricas facturables del plan Free.

**Consecuencia práctica:** no hay nada urgente aquí, y la rotación vuelve a ser la prioridad. Lo único
que sube solo con el tiempo es Database Size, cuyo límite es **por proyecto** — vigilarlo si `central`
crece rápido, pero 155 MB de 500 no es una urgencia. Si algún día aparece un **402 de verdad** en
producción, el origen será otro (proyecto pausado por inactividad, rate limit, o la propia app) y se
mira en los logs, no en esta banda.

> Lección, que es la regla de la casa aplicada a un panel: un cartel de advertencia **condicional** no
> es un dato de consumo. Antes de declarar una urgencia, medir la métrica.
