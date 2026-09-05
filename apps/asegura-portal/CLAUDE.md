# CLAUDE.md — apps/asegura-portal (portal del CLIENTE de Grupo ASegura)

> ✍️ **El nombre comercial se escribe «Grupo ASegura», con A y S mayúsculas** (dictado por Alberto,
> 04/09/2026). El monograma «AS» del logo es el nombre: A de Alberto, S de Suárez. Escribirlo con
> la ese minúscula no es una errata de estilo — se come la marca, y es lo que el autocorrector
> escribe solo. Grafía canónica en BD: `seguros.corredurias.nombre`. Guardián en todo el repo:
> `test/regression-nombre-comercial-asegura.test.ts`.

> **Esta app la ve el ASEGURADO, no Alberto.** El panel del corredor es `apps/asegura` (lee
> `apps/asegura/CLAUDE.md`) y la pantalla de trabajo de Alberto es `apps/plataforma` → `/correduria`.
> Aquí entra gente de la calle, cliente o no. Antes de tocar nada lee el spec
> `docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md` (producto completo) y
> `docs/superpowers/plans/2026-09-01-asegura-portal-fase-1.md` (lo que se construyó de verdad).

## Estado (03/09/2026): DESPLEGADA en Vercel; Fase 1 mergeada + Fase 4 en código; DDL aplicado

Fase 1 entró en `main` el 01/09/2026 con el PR **#1965** (`f12b7b46`): entrar con un código de un solo
uso y subir una póliza propia, leída por IA, con su procedencia. **Fase 4** (vincular la identidad con
su ficha de la cartera y enseñarle SUS pólizas vivas) se construyó el 02/09/2026 — ver su sección.

- **Aplicado en la BD el 02/09/2026 (por la sesión principal, contra la Supabase compartida):** el DDL
  de Fase 1 (`prisma/sql/2026-09-01_portal_fase1.sql`, 3 ENUM + 6 tablas) **y**
  `prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql`: valor `documento` en `portal_procedencia`,
  tabla **`portal_vinculo`**, rol **`prisma_asegura_portal`** (LOGIN, NOBYPASSRLS) con DML sobre
  `portal_*` y **`SELECT` por COLUMNAS** sobre la cartera.
- **Contraseña del rol: PUESTA el 02/09/2026 y guardada en el Vault de Supabase** (secreto
  `prisma_asegura_portal_password`; `prisma/sql/2026-09-02_portal_rol_password_vault.sql`). Se generó
  dentro de Postgres y **no ha pasado por ningún chat ni repo**. Verificado con `dblink` desde la BD:
  entra por el pooler y por el host directo, lee la cartera y `clientes.dni` le da `42501`.
- **Proyecto Vercel `asegura-portal` CREADO el 02/09/2026** por la API (`prj_MNrsMRVrBft6KLq1skgi8XU9s9y9`,
  Root Directory `apps/asegura-portal`, sin build). El token del MCP no puede releerlo (solo ve 5
  proyectos del equipo), pero el **enlace Git está verificado por otro camino**: en el siguiente push
  el bot de Vercel listó `asegura-portal` con ese Root Directory y el deployment salió «Ignored» por
  `--sin-previews` (PR #2123, 17:41 UTC). Construirá solo con pushes a `main` que toquen la app.
- **Falta, y de quién depende (Alberto, panel de Vercel — la API no escribe envs):**
  1. **`DATABASE_URL`** = `postgresql://prisma_asegura_portal.wswbehlcuxqxyinousql:<VAULT>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
     con `<VAULT>` leído del secreto de arriba. **Rotar** = repetir el bloque SQL **y** cambiar esta env
     en el mismo paso: una sin la otra deja la app muerta en silencio con `password authentication
     failed`, que solo se ve en los logs del pooler (lección de `prisma_seguros`, 02/09/2026).
     ✅ **PUESTA el 03/09/2026** — ver «Puesta en producción» más abajo: se pegó primero solo la
     contraseña y el portal devolvía 500 sin nombrarla.
  2. **`PII_LOOKUP_KEY` en ese proyecto, IDÉNTICA a la de `central-asegura`.** Es la clave del índice
     ciego (`clientes.email_lookup_hash`): con otra clave el hash no casa y **nadie se vincula nunca**
     (`sin_clave`/`sin_ficha` para todo el mundo, sin error). Sin ella en producción el módulo lanza y
     el portal lo degrada a `sin_clave`: se entra, pero sin cartera.
  3. `ASEGURA_PORTAL_SESSION_SECRET` y `ASEGURA_PORTAL_CANAL_PEPPER` (sin ellas la app no arranca /
     el hash del canal es reversible), resto de envs (tabla de abajo) y la WABA de WhatsApp (no existe;
     por eso el canal es un puerto).

## 🚀 Puesta en producción (03/09/2026): las dos trampas, medidas

El proyecto Vercel es `asegura-portal` (`prj_MNrsMRVrBft6KLq1skgi8XU9s9y9`, enlazado al repo
`central`) y sirve en **https://asegura-portal.vercel.app**. Al enchufar las envs por primera vez
salieron dos fallos que **no se parecen en nada a lo que son**. Los dos están medidos, no supuestos.

### 1. `DATABASE_URL` no es la contraseña: es la URL entera

El secreto del Vault (`prisma_asegura_portal_password`) es SOLO la contraseña. Pegarlo tal cual como
valor de `DATABASE_URL` devuelve un 500 en `POST /api/acceso/solicitar` con un error que **no nombra
ni la contraseña ni el rol**, así que se diagnostica como problema de credenciales y no lo es:

```
Invalid `prisma.portalCodigo.create()` invocation:
error: Error validating datasource `db`: the URL must start with the
protocol `postgresql://` or `postgres://`.   -->  schema.prisma:8
```

El valor bueno es el de la lista de arriba. Y si la contraseña lleva `/ @ : + # ?` hay que
**percent-encodearla** (`%2F %40 %3A %2B %23 %3F`) o la URI se parte por la mitad y el error vuelve,
distinto pero igual de opaco.

### 2. Cambiar una env no basta, y aquí el redeploy a mano puede ser IMPOSIBLE

Las envs se resuelven **en el build**, así que un cambio no llega a producción hasta que haya un
deployment nuevo. Y en este repo esa puerta se cierra sola:

- Vercel **no deja redesplegar** un deployment de producción si existe otro más nuevo
  («A more recent Production Deployment has been created»).
- Cada push a `main` crea uno más nuevo, y el `ignoreCommand` lo **cancela** si el commit no toca
  `apps/asegura-portal/` ni uno de sus 6 packages.

Como `main` recibe a diario commits de memoria y de la auditoría que no tocan esta app, el último
deployment READY se queda congelado y **no hay ningún botón que lo desatasque**. Medido el 03/09:
ocho deployments seguidos en `CANCELED` y el redeploy manual cancelado también, con

```
⏭ skip: el commit no toca apps/asegura-portal ni ninguno de sus packages (consume 6)
```

**La salida es un commit REAL que toque la app** — este `CLAUDE.md` sirve, porque vive dentro de
`apps/asegura-portal/`. No es un commit vacío ni un truco para despertar el CI: es exactamente el
mecanismo que el `ignoreCommand` declara. Consecuencia práctica: **al cambiar una env de esta app,
cuenta con que quien la activa es el siguiente PR que toque la app**, no el botón de Redeploy.

### 3. Las claves: dónde viven y cuáles NO se pueden regenerar

Cierre del 03/09. Las envs del portal están puestas en Vercel (`asegura-portal`, Production):
`DATABASE_URL`, `PII_LOOKUP_KEY`, `RESEND_API_KEY`, `PORTAL_MAIL_FROM`
(`Grupo ASegura <no-reply@envios.grupoasegura.es>`), `PORTAL_MAIL_REPLY_TO`
(`hola@grupoasegura.es`, el buzón único de la correduría) y `PORTAL_PUBLIC_URL`.

Lo que costó una noche entera y conviene no repetir:

**Una variable marcada `Sensitive` en Vercel es de ESCRITURA SOLO.** No se puede volver a leer, ni
por su dueño. Es un buzón, no un almacén. Da igual cuántas veces se recargue la página: el valor no
vuelve. Por eso hay que separar las claves en dos clases y tratarlas distinto:

| Clase | Cuáles | Si se pierde el valor |
|---|---|---|
| Regenerable | `RESEND_API_KEY`, `ASEGURA_PORTAL_SESSION_SECRET`, `ASEGURA_PORTAL_CANAL_PEPPER`, `CRON_SECRET` | se crea otra y ya |
| **Irreversible** | **`PII_LOOKUP_KEY`**, `PII_ENCRYPTION_KEY`, contraseñas de rol de BD | migración sobre la cartera real |

`PII_LOOKUP_KEY` es la peor de todas: sobre los hashes del índice ciego hay **índices ÚNICOS**, así
que cambiarla obliga a recalcular `clientes`, `cliente_emails`, `cliente_telefonos` y
`poliza_intervinientes`. **Nunca se genera una nueva para «arreglar» que no se encuentre.** El mismo
valor vive hoy en tres proyectos de Vercel —`asegura` (el CRM de Manuel, donde estaba VISIBLE y de
donde se copió), `central-asegura` y `asegura-portal`— y esa duplicación a mano es justo el problema.
Lo que toca: subirla una vez a **Shared Environment Variables** del equipo y enlazarla, más una copia
legible en un gestor de contraseñas para las irreversibles. Sin eso, un despiste deja la cartera
inaccesible sin un solo error en los logs.

## Qué es, y por qué es una app APARTE de `apps/asegura`

El producto no es «mira tus pólizas»: es **«aporta tus seguros»**. Mirar sirve a los 80 clientes vivos
de la cartera; aportar sirve además a los ~32.520 leads. Por eso el portal es **abierto a cualquiera**,
sea cliente o no, y por eso la bóveda guarda pólizas **que no son de la correduría**.

Que sea un despliegue separado no es gusto por la simetría, es la superficie de ataque
(spec, decisión 3): `apps/asegura` corre con el rol `prisma_seguros`, que es **BYPASSRLS** y ve toda la
cartera. Un registro público no puede vivir en esa misma superficie. De ahí, tres separaciones duras:

| | `apps/asegura` (corredor) | `apps/asegura-portal` (cliente) |
|---|---|---|
| Rol de BD | `prisma_seguros` (**BYPASSRLS**) | `prisma_asegura_portal` (**SIN BYPASSRLS**) |
| Cookie | `asegura_session` | `asegura_portal_session` |
| Secreto de sesión | `ASEGURA_SESSION_SECRET` | `ASEGURA_PORTAL_SESSION_SECRET` |

**Una sesión del portal no debe valer jamás en la app interna** — de ahí que el secreto sea propio y no
compartido (`lib/auth.ts`).

## Arquitectura y capas

```
apps/asegura-portal/            Next.js 15 (App Router), React 19, Prisma 5 (multiSchema)
  app/page.tsx                  Entrada: pedir código → verificar (cliente, 2 fases)
  app/(portal)/boveda/          Cartera (propias + autorizadas), calendario y bóveda de aportadas
                                (+ SubirPoliza.tsx, Calendario.tsx)
  app/api/acceso/solicitar      POST — genera y manda el código
  app/api/acceso/verificar      POST — canjea el código y pone la cookie
  app/api/polizas               POST — sube un PDF/foto, lo lee la IA, lo guarda
  lib/session.ts                🚪 LA PUERTA ÚNICA: de aquí sale de quién es la sesión
  lib/vinculo.ts                Fase 4: identidad → ficha de la cartera por índice ciego del email
  lib/cartera-lectura.ts        Fase 4: lo que se LEE de la cartera para una identidad (por portal_vinculo)
  lib/obligaciones.ts           Calendario: deriva y poda las obligaciones de una identidad
  lib/enlace-acceso.ts          El enlace de un clic del correo (NO canjea: pre-rellena)
  lib/fechas.ts                 fechaEs() en UTC (las columnas `date` llegan como medianoche UTC)
  lib/auth.ts                   cookie, JWT (jose vía core-identity), hashCanal()
  lib/canal.ts                  el PUERTO de canal (registro de adaptadores)
  lib/canal-email.ts            adaptador email (producción)
  lib/canal-consola.ts          adaptador desarrollo (log del servidor)
  lib/extraer-poliza.ts         PDF→texto→IA, o foto→visión
  lib/db.ts, lib/dinero.ts      cliente Prisma; eur() en formato español
packages/module-seguros-portal/ lógica PURA: sin BD, sin red, sin Next
```

Módulos que compone (`package.json`): `@central/module-seguros-portal`, `@central/core-ai`,
`@central/core-email`, `@central/core-identity` y, desde Fase 4, **`@central/module-seguros`**
(`clientesVisiblesPara`, `vigenciaPoliza`, `importeEiac`) y **`@central/module-seguros-pii`**
(`computeEmailLookupHash`, el mismo HMAC que escribe `apps/asegura`).

### Qué vive en el módulo puro y por qué

`packages/module-seguros-portal/src/*` es donde están **las reglas que deciden si un dato existe**, y
está ahí a propósito: esa decisión no puede depender de qué proveedor de IA respondió ni de qué app lo
llame. Cuatro piezas, todas con su `.test.ts` (37 tests, `node --test`, verde el 02/09/2026):

- **`acceso.ts`** — los cuatro niveles CRECIENTES (`tarjeta` → `completo` → `gestionar` →
  `administrar`) sobre la línea que sostiene la seguridad del portal: **dato de la COSA ≠ dato de la
  PERSONA**. El conductor de la furgoneta ve compañía, nº de póliza y teléfono de siniestros; no ve la
  prima, ni el IBAN, ni el DNI del tomador. Desde Fase 4 lo aplica `lib/cartera-lectura.ts` (propias con
  el nivel del vínculo; autorizadas con `completo`); las autorizaciones con nivel propio son Fase 5.
- **`procedencia.ts`** — de dónde sale un dato, y quién gana cuando dos fuentes dan el mismo campo:
  `compania` (4) > `documento` (3) > `calculado` (2) > `declarado` (1). `debeSustituir()` existe para
  que nadie compare procedencias a mano: esa comparación con un `>=` es exactamente cómo un extractor
  termina pisando lo que mandó la compañía (la lección de `subastas.tipo_bien`).
- **`codigo.ts`** — `generarCodigo()` (6 dígitos con `randomInt` de `node:crypto`, nunca `Math.random`)
  y `estadoCodigo()`, con el orden de comprobaciones deliberado: **`ya_usado` → `bloqueado` → `caducado`
  → acierto**. Comprobar el acierto antes del bloqueo dejaría el contador de intentos de adorno.
  `VALIDEZ_MINUTOS = 10`, `MAX_INTENTOS = 5`.
- **`poliza-leida.ts`** — normaliza lo que la IA dice haber leído. `null` = «no se sabe»; los valores
  de cajón (`''`, `'n/a'`, `'desconocido'`, `'no consta'`, `'pendiente'`…) **se anulan aquí**, antes de
  que nadie los escriba, porque si no se cuelan por todas las guardas basadas en NULL. Una prima de 0
  no es una prima: es un hueco. `'otros'` **sí** es una respuesta válida de ramo y NO se anula.

## Identidad y sesión: código de un solo uso sobre un PUERTO de canal

No hay contraseñas. Se pide un código de 6 dígitos a un canal (`whatsapp` | `email`), se canjea, y sale
una cookie `asegura_portal_session` (httpOnly, secure, sameSite lax, 30 días) firmada con
`ASEGURA_PORTAL_SESSION_SECRET`. El canje **crea la identidad si no existía**: entrar por primera vez y
registrarse son el mismo acto (`app/api/acceso/verificar/route.ts`).

**El canal es un puerto, no un `if`.** WhatsApp es el canal que quiere el negocio pero la WABA de Grupo
Asegura no existe todavía; cablearlo habría bloqueado la fase entera esperando a Meta. `lib/canal.ts`
define el contrato (`Canal { tipo, enviarCodigo(destino, codigo): Promise<boolean> }`) y un registro;
el día que haya número se añade `lib/canal-whatsapp.ts` y se registra. **Ni una línea del resto cambia.**
Hoy se registra `canalEmail` en producción y `canalConsola` fuera de ella — y `canalConsola` devuelve
`false` si `NODE_ENV === 'production'`, porque un código de acceso en los logs es una credencial regalada.

### 🚨 `canal_no_disponible` (503) NO es «el envío falló» (502)

Es la distinción que más fácil se rompe al tocar `app/api/acceso/solicitar/route.ts`:

| Situación | Respuesta | Qué se le dice al usuario |
|---|---|---|
| El canal **no está registrado** (WhatsApp, hoy) | `503 canal_no_disponible` | «Ese canal todavía no está disponible.» |
| El canal está, y el envío **no salió** | `502 envio_fallido` | «No hemos podido enviarte el código. Inténtalo en un momento.» |

Decirle a alguien que falló el envío cuando en realidad WhatsApp no está montado es mentirle, y desde
el código las dos cosas se ven idénticas. Por eso `obtenerCanal()` devuelve `null` (no lanza) y
`enviarCodigo()` devuelve `false` (tampoco lanza): son dos estados distintos y quien llama los separa.
Los textos de ambos ya están en el mapa de `textoError()` de `app/page.tsx`.

## 🔒 Aislamiento multi-cliente: lo da el CÓDIGO, no RLS

**No hay RLS que rescate un olvido.** El rol del portal conecta como aplicación, así que una consulta
sin `where` **responde 200 con las pólizas de todo el mundo**. El modo de fallo no es «no se ve nada»
—eso se nota enseguida— sino **«se ve TODO y nada falla»**.

Las dos reglas, sin excepciones:

1. **La identidad SIEMPRE sale de la cookie, por `lib/session.ts`.** Nunca del cuerpo de la petición,
   nunca de un query param. `getIdentidad()` devuelve `null` cuando no hay cookie válida — **jamás una
   identidad de relleno**, y `lib/session.ts` no puede tener un fallback literal para `identidadId`.
2. **Toda consulta a `prisma.portal*` filtra por `identidadId`.** Importar la puerta y luego consultar
   sin filtrar es exactamente el fallo que esto persigue.

Lo protege el guardián **`test/regression-portal-aislamiento.test.ts`** (raíz del repo, `node --test`,
gate en CI vía `pnpm test:guardia`; 4/4 en verde el 02/09/2026). Barre `git ls-files apps/asegura-portal`
y exige las dos cosas a todo fichero `.ts`/`.tsx` que mencione `prisma.portalX`. Tiene una lista de
**EXENTOS** —`lib/db.ts`, `lib/session.ts`, `lib/auth.ts` y las dos rutas de `acceso/`, que son la
puerta de entrada y todavía no tienen identidad que resolver— y un cuarto test que falla si un exento
deja de existir: un exento fantasma es una puerta abierta esperando a que alguien recree el fichero con
ese nombre. **Añadir algo a EXENTOS es una decisión, no un trámite.**

Desde Fase 4 el guardián tiene **dos cepos más** (7/7 en verde el 02/09/2026): todo fichero que consulte
un modelo de CARTERA (`prisma.cliente|clienteEmail|poliza|polizaCobertura|polizaRecibo|siniestro|
polizaInterviniente|clienteRelacion|correduria`) importa `lib/session` **y** nombra `portalVinculo` — la
costura; y `prisma/schema.prisma` **no declara** columnas que el rol no puede leer (`Cliente.dni`,
`PolizaRecibo.iban`, `Siniestro.comentario`…). `lib/vinculo.ts` es el único exento del import de sesión
para la cartera: corre en el canje del código, antes de que exista cookie. El listado del guardián
incluye ficheros **sin commitear** (`git ls-files --others`): el fichero nuevo es justo el que hay que cazar.

📌 **Desviación deliberada respecto al spec:** el spec nombra la puerta `lib/acceso.ts` porque allí
guarda además la lectura de la CARTERA. La puerta sigue siendo `lib/session.ts` y la lectura de cartera
vive en `lib/cartera-lectura.ts` (no se renombró el cepo: se le añadieron los dos de arriba).

## 🔗 Fase 4: la cartera (vínculo por email, lectura por columnas, niveles)

**La costura es `seguros.portal_vinculo`** (identidad_id, correduria_id, cliente_id, nivel, origen;
UNIQUE por identidad+cliente). Sin fila ahí, el portal no lee NADA de la cartera para esa identidad.

- **Vínculo (`lib/vinculo.ts`, `vincularIdentidad(identidadId, email, tipo)`):** se llama desde
  `app/api/acceso/verificar/route.ts` justo después de resolver/crear la identidad, porque es **el único
  momento con el email en claro** (el portal guarda `hashCanal()` con pimienta propia, que no sirve para
  el índice ciego). Calcula `computeEmailLookupHash(email)` y busca en `clientes.email_lookup_hash` **y**
  `cliente_emails.email_lookup_hash`, descartando fusionadas (`merged_into_cliente_id IS NULL`).
  **Exactamente UNA ficha → vínculo `gestionar`/`email_hash`**. Varias → `ambiguo` y **no vincula** (no se
  adivina). Ninguna → `sin_ficha`. Sin `PII_LOOKUP_KEY` → `sin_clave`, nunca a ciegas. Fallo de BD →
  `error` (log del motivo, jamás del email ni del hash). **No bloquea el login**: la respuesta del
  verificar añade `vinculo: <estado>` y `app/page.tsx` avisa una línea en `ambiguo`/`sin_clave`/`error`.
  Solo `tipo === 'email'`: **un móvil es un hogar** y devuelve `sin_ficha` sin buscar.
- **Lectura (`lib/cartera-lectura.ts`, `carteraDeIdentidad(identidadId)`):** parte SIEMPRE de
  `portal_vinculo` filtrado por `identidadId`. Pólizas **vivas** = `WHERE_CARTERA_VIVA` de
  `@central/module-seguros` (`import_ref IS NULL` O `eiac_xml_hash IS NOT NULL`) `AND
  merged_into_poliza_id IS NULL`; las 28.728 del volcado histórico **no se enseñan**. El segundo brazo se
  añadió el 03/09/2026: una póliza que ya estaba en el volcado y que CIMA mantiene al día conserva su
  `import_ref` viejo, y con el filtro anterior desaparecía de la bóveda de su dueño (1 fila hoy, la de Reale).
  `confirmadaCima = id_poliza_entidad !== null` (si no, chip «pendiente de confirmación por la compañía»).
  Por póliza: coberturas (total + 4 primeras), recibos (próximo al cobro por `situacion`
  `pendiente`/`emitido`, devueltos, último cobrado; **`total: 0` = «sin recibos informados», no «al
  corriente»**), siniestros `abierto`/`en_tramitacion` **sin tramitador ni perito** (regla de visibilidad del 03/09/2026, sección de abajo).
- **Autorizadas:** `cliente_relaciones` fila A→B con `puede_ver_polizas` = **A autoriza a B** (semántica
  de `clientesVisiblesPara` de `@central/module-seguros`; se le pasa `observaciones: null` porque el rol
  no la lee y el helper no la usa). Mis fichas son B; las pólizas vivas de cada A salen bajo «Seguros que
  te han autorizado a ver» con el nombre de A. **Nivel `completo`** (la relación solo tiene un booleano:
  ve prima y recibos, no gestiona); cuando exista `portal_autorizacion` (Fase 5) el nivel vendrá de ahí.
- **Niveles (`camposVisibles(nivel)` de `module-seguros-portal`):** propias con el `nivel` del vínculo
  (`gestionar` por defecto; un valor fuera de `NIVELES` cae a `tarjeta`, el más bajo). Lo que el nivel no
  permite va a **`null`** en la salida y la UI lo pinta «no visible en tu nivel», **no** «no hay».
  Tres estados distintos en `/boveda`: sin vínculo («no hemos encontrado ninguna póliza a nombre de este
  email») ≠ vinculada sin pólizas vivas ≠ campo oculto por nivel. Y `prima_anual` `null` → «—», nunca 0.
- **Ningún `clienteId` entra desde la request.** Todo id de ficha sale de `portal_vinculo` o de una
  relación leída a partir de él.

## 👁 Regla de visibilidad del portal (03/09/2026) — qué se OCULTA y qué se DICE EN VOZ ALTA

Dictado de Alberto, literal: **«que aparezcan los datos que tengamos, el resto que no aparezca vacío,
simplemente no se ve… por ejemplo tramitador no, porque esa es función mía».**

Traducido a la regla operativa que implementa `lib/cartera-lectura.ts`:

> **SE OCULTA** si la ausencia del dato **no cambia nada** para el cliente.
> **SE DICE EN VOZ ALTA** si la ausencia **cambia lo que el cliente haría**.

**Lado «se oculta».** No son datos vacíos: son datos que **no van en la vista del cliente**.

- **Tramitador (nombre y teléfono)** y cualquier **referencia interna de gestión**. El punto de
  contacto único es **Alberto**: el cliente le llama a él, no al tramitador de la compañía. Saber
  quién tramita por dentro no le cambia una sola decisión.
- No se pintan en gris, ni como «pendiente», ni como «—». **Desaparecen del tipo y del `select`**:
  `SiniestroPortal` ya no los declara y `prisma.siniestro.findMany` ya no los pide. Un campo que no
  se trae de la BD es un campo que nadie puede pintar por descuido tres meses después.
- El flag `telefonoSiniestros` de `camposVisibles()` (`@central/module-seguros-portal`) **sigue
  existiendo** y hoy no lo consume nadie: vive en el módulo puro con su propio test, y quitarlo es
  tocar el paquete, no esta app. Se deja documentado aquí para que el siguiente que lo mire sepa que
  es un hueco conocido y no un olvido.

**Lado «se dice en voz alta».** Esta capa **tiene que seguir trayendo el dato** para que la UI pueda
decirlo; la que lo pinta es `app/(portal)/boveda/`:

| Situación | Lo que NO se puede decir | Por qué |
|---|---|---|
| Sin `fechaVencimiento` | «vigente» a secas | `vigenciaPoliza()` da `pendiente`: no se sabe si sigue viva |
| `recibos.total === 0` | «al corriente de pago» | Es «la compañía no ha informado recibos» |
| `coberturas.total === 0` | «no tiene coberturas» | Es «no hay coberturas informadas» |

🚨 **Esto NO deroga la regla del `CLAUDE.md` de la RAÍZ («dato que NO hay ≠ dato que NO se ha
mirado»): la AFINA para el portal del cliente.** Quien lea solo una de las dos se lleva la idea
contraria: la de la raíz prohíbe convertir un «no lo sé» en un «no hay», y esta añade que hay datos
que **ni siquiera son del cliente** y que enseñarlos vacíos solo genera preguntas que Alberto tiene
que contestar. La frontera es **para quién cambia la decisión**, no si el valor es `null`.

🚨 **Y un TERCER lado, descubierto el 04/09/2026: lo que se oculta a un TERCERO.** `prima`,
`coberturas` y `recibos` preguntaban por `camposVisibles(nivel)` antes de servirse; **los siniestros
abiertos no**. Se pegaban a la póliza sin mirar el nivel, así que quien te autorizaba con el alcance
más bajo (`ver` → `tarjeta`) te estaba enseñando **sus siniestros abiertos**: referencia, estado y
fecha. No fallaba nada. Salían. Ahora `CamposVisibles` tiene `siniestros` (`false` en `tarjeta`,
`true` desde `completo`) y además entra en `NUNCA_A_UN_TERCERO`, el tope duro de `autorizacion.ts`:
ni con `ver_economico`, que abre lo ECONÓMICO de la póliza y no los sucesos de quien la tiene. Un
siniestro abierto no es un dato del contrato — es un hecho de la vida de su dueño.

`siniestrosAbiertos` es por eso `SiniestroPortal[] | null`: **`null` = no visible en tu nivel**,
`[]` = no hay ninguno abierto. La pantalla no pinta nada en ninguno de los dos casos, y eso es
deliberado: un chip que dijera «no visible» le contaría a un tercero que hay algo que mirar, que es
la mitad de la filtración.

Lo protege **`test/regression-portal-visibilidad.test.ts`** (raíz del repo, `node --test`): falla si
`tramitador*`/`perito*` vuelven a `lib/cartera-lectura.ts`, si desaparecen los tres
datos del lado «voz alta» o los comentarios que explican que su `0` es un hueco, **y si
`siniestrosAbiertos` deja de preguntar por `ve.siniestros`** (mutación comprobada: sin la guarda,
4 pass / 1 fail).

## 🚑 El parte de siniestro (03/09/2026) — y la frase que NO se puede decir

El cliente da parte desde `/boveda` (`ParteSiniestro.tsx` → `POST /api/siniestros` →
`lib/partes-siniestro.ts` → `seguros.portal_parte_siniestro`). Rellena **solo lo que sabe él**: qué ha
pasado, cuándo, dónde, si hay heridos y si hay terceros. Tramitador, perito y referencia **no se le
piden ni se le enseñan**: los pone la compañía y son gestión del corredor (regla de visibilidad).

🚨 **Un parte enviado NO es un siniestro comunicado a la compañía.** Una correduría es mediadora del
CLIENTE, no del asegurador: contárnoslo a nosotros no es, jurídicamente, comunicárselo a la entidad.
Entre que el cliente pulsa «enviar» y que Alberto lo abre pasan horas o días, y en ese hueco el
cliente **cree que ya está hecho y deja de hacer nada**. Es el peor modo de fallo del portal: no se
ve, no da error, y lo paga quien confió en la pantalla.

- El vocabulario está en el módulo puro (`packages/module-seguros-portal/src/parte-siniestro.ts`):
  `enviado` → `recibido` (lo hemos leído NOSOTROS) → `abierto_en_compania` → `descartado`.
- **`comunicadoACompania(estado)` es la ÚNICA fuente de «tu compañía ya lo sabe».** Nunca
  `estado !== 'enviado'`, que es el atajo de una línea que parece razonable y convierte «lo hemos
  recibido» en «está comunicado».
- El cepo está en la BD además de en el código: `CHECK portal_parte_abierto_con_sello` impide poner
  `abierto_en_compania` sin `abierto_en_compania_at` **y** `siniestro_id`. Probado contra la BD real
  con un INSERT dentro de un ROLLBACK — un CHECK que nadie ha visto morder es una suposición.
- **El portal solo INSERTA y LEE**: el rol no tiene UPDATE ni DELETE sobre la tabla. Lo declarado es
  una comunicación, no un borrador.

**Los dos tri-estados.** `hay_heridos` y `hay_terceros` son `boolean` NULLABLE y la UI ofrece tres
opciones («Sí» / «No» / **«No lo sé», marcada de salida**), no un checkbox. `null` = «no lo ha
contestado»; `false` = «ha dicho que no». Colapsarlos deja al corredor leyendo «sin heridos» de un
accidente sobre el que nadie preguntó, y un parte con heridos se tramita en horas mientras uno de
chapa espera al lunes. `normalizarTriestado()` normaliza acento, caja y espacios antes de comparar:
un `<select>` que emitiera `'Sí'` contra una lista de `'si'` dejaría **todos** los partes a `null` y
nadie vería un error, porque `null` es un estado legítimo.

**El plazo del art. 16 LCS (7 días) no se reimplementa aquí.** `plazoComunicacion()` del módulo del
portal **delega** en el de `@central/module-seguros`, que es el que ya usa el panel del corredor, y
solo le cambia la forma. Dos cuentas del mismo plazo legal en el mismo monorepo acaban dando plazos
distintos del mismo siniestro sin que ninguna pantalla falle. Y `fueraDePlazo` **NO es pérdida de
cobertura**: el art. 16 solo permite reclamar los daños del retraso, y perder el derecho exige dolo o
culpa grave. Un portal que asuste a quien avisa tarde consigue que no avise nunca.

**Se puede dar parte de una póliza AUTORIZADA** (de las que alguien te deja ver). Ver no es gestionar,
pero bloquearlo sería peor: quien conducía el coche de su padre es justo el que sabe qué pasó. La
salida no es prohibirlo sino que Alberto lo vea — el puerto del corredor marca esos partes.

Lo protege **`test/regression-portal-parte-siniestro.test.ts`** (raíz, `node --test`): la forma de
`comunicadoACompania`, el atajo `\.estado !== 'enviado'`, las frases afirmativas prohibidas, el
«ya no te cubren», el colapso del tri-estado y un cepo POSITIVO (alguien tiene que usar `comunicado`,
o la pantalla pasa todos los negativos sencillamente callándose). ⚠️ El guardián **quita los
comentarios antes de mirar**: sin eso se muerde a sí mismo, porque el texto correcto de la pantalla
es «todavía NO está comunicado a tu compañía» y contiene la frase prohibida.

## 📅 El calendario de vencimientos (02/09/2026) — y por qué el aviso NO sale de aquí

La tabla es **`seguros.portal_obligacion`** (`prisma/sql/2026-09-03_portal_obligacion.sql`, aplicada
el 02/09/2026). Cuelga del **bien**, no de la póliza: `poliza_id` es opcional a propósito para que el
mismo motor sirva luego a ITV, carnet o revisión de gas de alguien que no tiene ninguna póliza con la
correduría. `UNIQUE (identidad_id, poliza_id)` es lo que hace idempotente al derivador.

- **La fecha que se enseña NO es la del vencimiento.** `fechaAccionable()` (módulo puro) resta los
  **30 días de preaviso del tomador** (art. 22 LCS): decirle a alguien «vence el 15 de marzo» le deja
  creer que tiene hasta el 15, cuando el plazo para oponerse se le pasó el 13 de febrero. Se resta en
  **días**, no en meses: `setUTCMonth(m-1)` sobre un 31 de marzo da un 31 de febrero que JavaScript
  normaliza al 3 de marzo sin avisar.
- **`polizaGeneraObligacion()` es el cepo que evita 28.728 avisos.** Qué es «viva» NO lo decide él: llama
  a `esCarteraViva()` de `@central/module-seguros` (`packages/module-seguros/src/cartera-viva.ts`,
  dependencia que ganó `@central/module-seguros-portal` el 03/09/2026) = `import_ref IS NULL` **o**
  `eiac_xml_hash IS NOT NULL`. Y `''` cuenta como volcado: la cadena vacía es el valor de cajón que se cuela
  por `IS NULL`, `??` y `COALESCE`. ⚠️ **`confirmadaCima` NO sirve para este cepo** — es `id_poliza_entidad !== null`, que es
  otra pregunta; usarlo dejaría fuera las pólizas que emitimos nosotros y CIMA aún no confirma.
- **`lib/obligaciones.ts` también PODA.** Una póliza que deja de estar viva (cancelada, fusionada, fin
  de riesgo) seguiría pintando su vencimiento para siempre. Solo poda las que vinieron de la cartera
  (`polizaId` no nulo): las declaradas por la persona son suyas. Y **sin vínculo no toca nada**: «no
  sabemos qué ficha es la suya» no autoriza ni a crear ni a borrar.
- **El chip del aviso dice el hecho, no la promesa:** «todavía no te hemos avisado», nunca «te
  avisaremos». El cron vive en la otra app y no manda nada con su interruptor apagado; esta app no
  puede comprobarlo desde aquí.

🚨 **El envío vive en `apps/asegura`, y no es una preferencia: está medido.** `portal_canal` guarda
**solo `valor_hash`** (SHA-256 con pimienta, `lib/auth.ts:28`) y el `ClienteEmail` de este schema solo
`email_lookup_hash`. El rol `prisma_asegura_portal` **no tiene GRANT sobre la columna del email**. Un
hash no se revierte: **desde el portal no hay ninguna dirección a la que escribir.** El panel del
corredor corre con `prisma_seguros` (BYPASSRLS) y sí lee `cliente_emails` cifrado. El portal se queda
con el aviso **en pantalla** y nunca toca un dato personal. Lo vigila
`test/regression-portal-obligaciones.test.ts` (ningún fichero del portal importa un transporte de
correo), para que la corrección no se deshaga sola dentro de tres meses.

## 🔑 Entrar de un clic: el enlace del correo NO canjea

El correo del código lleva además un enlace `https://<PORTAL_PUBLIC_URL>/?d=<email>&c=<código>` que
abre la pantalla **con los dos campos ya puestos**. La persona pulsa «Entrar» y ya.

**El enlace no abre sesión por sí mismo, y es deliberado.** Un enlace que canjeara con un GET lo
consumirían los escáneres antivirus del correo y el prefetch de los clientes antes de que el usuario
lo tocase: le saldría `ya_usado` y parecería culpa suya. El canje sigue siendo el POST que dispara
ella; `app/page.tsx` limpia el código de la barra con `replaceState` nada más leerlo.

Sin `PORTAL_PUBLIC_URL`, o si no es **https**, no se manda enlace y el correo sale igual **con el
código**, que es lo que de verdad abre la puerta — nunca al revés, y nunca con un dominio adivinado.
Lo vigila `test/regression-portal-enlace-acceso.test.ts`.

## Infraestructura

- **BD:** la Supabase **compartida de la casa**, schema **`seguros`** (el mismo donde vive la cartera
  volcada). Sin Supabase aparte. Prefijo `portal_` en las tablas para no colisionar con el volcado.
- **Rol:** `prisma_asegura_portal`, **SIN BYPASSRLS**, DML sobre `portal_*` y **`SELECT` por columnas**
  sobre `corredurias`, `clientes`, `cliente_emails`, `polizas`, `poliza_coberturas`, `poliza_recibos`,
  `siniestros`, `poliza_intervinientes`, `cliente_relaciones` (`prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql`,
  aplicado 02/09/2026; **sin contraseña** hasta que Alberto la ponga). El 03/09/2026 se añadió
  `GRANT SELECT (eiac_xml_hash) ON seguros.polizas`, que la regla de cartera viva necesita leer. Es lo que toca internet: no lleva
  la llave maestra.
- **DDL:** `prisma/sql/2026-09-01_portal_fase1.sql` — 3 ENUM + **6 tablas**: `portal_identidad`,
  `portal_canal`, `portal_codigo`, `portal_bien`, `portal_poliza_declarada`, `portal_consentimiento`;
  y `prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql` — **`portal_vinculo`** + rol + grants. `prisma/sql/2026-09-03_portal_obligacion.sql` — **`portal_obligacion`** + su enum
  (aplicada 02/09/2026); `2026-09-04_portal_peticion_acceso.sql` — **`portal_peticion_acceso`**, y las dos
  del 04/09 que ensanchan `portal_autorizacion` (**`autorizado_identidad_id`** y **`poliza_id`**), las
  tres aplicadas ese día. ⚠️ `portal_autorizacion` + `portal_autorizacion_uso` ya existen desde el
  03/09/2026, así que del spec quedan **2** por llegar: `portal_aviso` y `portal_auditoria`
  (`portal_revision` tampoco se ha creado). Cuenta los ficheros de `prisma/sql/` antes de citar un
  número: esta frase se ha quedado corta dos veces. ⚠️ La memoria del
  01/09/2026 dice «las otras 5»: son 6 — el spec lista 11 y `portal_codigo` ni siquiera está en él.
- **Vercel:** Root Directory `apps/asegura-portal`, install `npx --yes pnpm@10.33.0 install
  --no-frozen-lockfile`, región **`fra1`** (la BD está en Europa: no cruzar el Atlántico), y el
  `ignoreCommand` **obligatorio** con `--sin-previews`. Sin el `ignoreCommand`, cada push del monorepo
  reconstruye esta app aunque no la toque.
- **CI:** la app YA está en la matriz de `Typecheck · <app>` de `.github/workflows/tests.yml`. Si se
  añade otra app hermana, añadirla ahí es parte del alta.

### Envs (solo NOMBRES — ningún valor va nunca al repo ni a un transcript)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión con el rol `prisma_asegura_portal` |
| `ASEGURA_PORTAL_SESSION_SECRET` | Firma de la cookie de sesión. **Sin fallback a literal en producción** (`requireSecret`) |
| `ASEGURA_PORTAL_CANAL_PEPPER` | Pimienta del hash del canal. Sin ella, una tabla de hashes de emails se revierte con un diccionario |
| `PII_LOOKUP_KEY` | Clave HMAC del índice ciego de la cartera (64 hex). **Idéntica a la de `central-asegura`** o nadie se vincula. Sin ella: `sin_clave`, se entra sin cartera |
| `PORTAL_MAIL_FROM` | Remitente del correo con el código. Si falta, el envío devuelve `false` (502), no revienta |
| `PORTAL_PUBLIC_URL` | Dominio **https** del portal, para el enlace de un clic del correo. Si falta o no es https, el correo sale igual **solo con el código**: no se inventa un dominio |
| `OPENROUTER_API_KEY` | Visión (fotos) **y, vía `aiComplete`, también los PDF**. Si falta, la extracción degrada a `none` |
| Proveedor de correo (lo lee `@central/core-email` solo) | `RESEND_API_KEY`, **o** `SMTP_USER`+`SMTP_PASSWORD` (+`SMTP_HOST`/`SMTP_PORT`), **o** `GMAIL_USER`+`GMAIL_APP_PASSWORD` |

⚠️ **No existen envs `PORTAL_SMTP_*`**: `createMailTransporter()` no recibe credenciales por parámetro,
las lee él del entorno. Lo único que pone el portal es el `from`.

## 🤖 Leer una póliza subida: HOY NO LEE NADA, y no es por el PDF (04/09/2026)

`POST /api/polizas` acaba en `fuente: 'none'` («No hemos podido leer el documento») para **todos** los
documentos, y la causa no está en el código ni en el PDF:

- Medido con una Mapfre HOGAR FAMILIAR real de 6 páginas: `pdf-parse` saca **12.076 caracteres
  limpios**, con compañía, nº de póliza, fecha de efecto y duración. El documento se lee.
- La ruta del PDF llama a **`aiComplete`** de `@central/core-ai`, que necesita al menos UNA de
  `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `CEREBRAS_API_KEY` o
  `MOONSHOT_API_KEY`. El proyecto Vercel `asegura-portal` **no tiene ninguna** (ver «Puesta en
  producción»: solo `DATABASE_URL`, `PII_LOOKUP_KEY`, `RESEND_API_KEY`, `PORTAL_MAIL_*` y
  `PORTAL_PUBLIC_URL`). `aiComplete` lanza → `nadaLeido()`.

⚠️ **Antes de tocar el extractor, comprueba la env.** El síntoma —«no hemos podido leer»— es idéntico
al de un PDF escaneado ilegible, y por eso se diagnostica mal: parece un problema de OCR y es una
variable vacía.

📌 Y un detalle para el día que se quiera una plantilla determinista por compañía: el texto de Mapfre
sale con la **codificación rota** (`EspaÒa`, `PÛliza`, `ESPA—A`). Un LLM lee a través de eso; un ancla
de texto exacto se rompe. Normalizar antes es parte del trabajo, no un pulido posterior.

## Rutas API

⚠️ Esta tabla decía «las tres que hay» hasta el 04/09/2026 y ya se había quedado corta: existen
además `PATCH /api/polizas/[id]` (corregir una póliza), `POST /api/siniestros` (el parte) y
`POST /api/catastro`. Cuenta las carpetas de `app/api/` antes de citar un número.

| Ruta | Entrada | Salida | Notas |
|---|---|---|---|
| `POST /api/acceso/solicitar` | `{ tipo: 'whatsapp'\|'email', destino }` (zod) | `{ ok }` · `400 datos_invalidos` · **`503 canal_no_disponible`** · **`502 envio_fallido`** | Guarda el código con `hashCanal(destino)`, nunca el email en claro |
| `POST /api/acceso/verificar` | `{ tipo, destino, codigo }` (6 chars) | `{ ok, vinculo }` + cookie · `400 datos_invalidos\|sin_codigo` · `401 incorrecto\|caducado\|ya_usado\|bloqueado` | Coge el código **más reciente** de ese canal; el intento se cuenta siempre que sea `incorrecto`; crea la identidad si no la había; marca `usado_en` y `ultimo_acceso_en` en una transacción; **Fase 4:** llama a `vincularIdentidad()` con el email en claro y devuelve `vinculo` (`ok`/`ya_vinculada`/`sin_ficha`/`ambiguo`/`sin_clave`/`error`) sin bloquear |
| `POST /api/polizas` | `multipart`, campo `documento` (PDF o imagen) | `{ id, datos, fuente }` · `401 sin_sesion` · `400 sin_fichero` · `413 fichero_grande` | `runtime = 'nodejs'`; tope **10 MB**; la identidad sale de `requireIdentidad()`, nunca del cuerpo |
| `POST /api/catastro` | `{ direccion, municipio, provincia }` **o** `{ referencia }` (zod, con topes) | `200 ok` · **`300 elegir`** (varios inmuebles) · `401 sin_sesion` · `400 datos_invalidos` · `404 no_encontrado` · `409 via_ambigua` · `422 direccion_ilegible\|referencia_invalida` · **`502 catastro_no_responde`** | **Exige sesión**: sin ella sería un proxy anónimo contra el Catastro con nuestra IP. Solo CONSULTA (no escribe en la BD) y **no registra la dirección en ningún log**. Mira el `estado`, no el número |

Pantallas: `/` (pedir + verificar código) y `/boveda` (`force-dynamic`, redirige a `/` sin sesión).
**No hay `middleware.ts`**: cada ruta y cada página resuelve la sesión por su cuenta — que es
precisamente lo que vigila el guardián.

## 🧩 Los campos PROPIOS de cada tipo de seguro (04/09/2026)

Al elegir el ramo, el formulario despliega SUS campos. El catálogo vive en el módulo puro
(`packages/module-seguros-portal/src/campos-ramo.ts`) con `normalizarDatosRamo()`; la pantalla solo
traduce `tipo` → control HTML. Lee su cabecera antes de tocar nada: esto es el resumen.

- **Una columna `datos_ramo` (jsonb), no ~40 columnas.** El conjunto de campos depende del ramo y
  nadie filtra por ellos: se leen enteros al abrir la ficha. 🚨 **Los identificadores del bien
  (matrícula, bastidor, fecha de matriculación) NO van ahí: son columnas**, porque se consultan y se
  indexan. La regla para el siguiente campo: si alguna consulta va a filtrar por él, es una columna.
- **NULL y nunca `{}`.** Se escribe con `Prisma.DbNull`; `JsonNull` guardaría el literal `null` DENTRO
  del JSON y se colaría por todas las guardas de NULL.
- **El ramo que manda al validar un parche es el que la póliza VA A TENER.** El PATCH lee el ramo
  guardado (filtrando por `identidadId`) antes de validar. Cambiar de ramo sin datos nuevos **borra**
  los del viejo: sin catálogo en el ramo nuevo quedarían enterrados, invisibles en pantalla y
  presentes en la columna. Y **sin ramo conocido, mandar `datosRamo` es un ERROR**, no un `null`
  callado — aceptarlo vaciaría la columna en cada corrección de la prima sin que nada fallara.
- **Ningún campo es obligatorio**, igual que el vencimiento, y **nada del art. 9 RGPD**: de
  vida/salud/decesos se piden datos de CONTRATO (capital, modalidad, nº de asegurados), nunca de
  salud, y `beneficiarios` es el TIPO de designación (herederos / designados / entidad), no nombres
  de terceros que no han entrado al portal.
- **Todo booleano es tri-estado, no checkbox**: «no me lo han preguntado» no puede colapsar en «ha
  dicho que no» (mismo criterio que el parte de siniestro).
- **`datosRamo`/`escribirRamo` son props OPCIONALES de `CamposPoliza`**, y eso es una salvaguarda: una
  pantalla que no sabe LEER estos datos no puede ofrecerse a escribirlos, o el primer «guardar» sobre
  campos vacíos los borraría en silencio.
- **El orden del formulario importa**: «Tipo de seguro» va el 2º (bajo el vencimiento) porque de él
  dependen los campos; el bloque específico va el ÚLTIMO, porque primero se pide lo que cualquiera
  tiene delante y después lo que hay que ir a buscar.

### Autorrelleno desde el Catastro (hogar, comercio, comunidades)

`POST /api/catastro` (ver la tabla de rutas) da **metros, año de construcción y código postal** desde
la dirección, vía `@central/core-catastro` — el equivalente para hogar de lo que la matrícula hace
para auto. Los campos que puede rellenar llevan `desdeCatastro: true` en el catálogo.

🚨 **El dato NO entra solo.** Se enseña y solo entra si la persona lo acepta, igual que la fecha
estimada desde la matrícula: el Catastro puede estar desactualizado y quien firma la póliza es ella.
Y los cinco estados de la respuesta están separados a propósito —no responde ≠ ahí no hay nada ≠ la
dirección no se entiende ≠ la calle es ambigua ≠ hay quince pisos y no sabemos cuál es el suyo—
porque colapsarlos convierte un «no lo sé» en un «no hay».

## ⚖️ Bloque legal (04/09/2026) — el pie va en el layout RAÍZ, y por qué

Las cuatro páginas de `app/legal/*` (`mediador`, `privacidad`, `cookies`, `condiciones`) y el
`PieLegal` del layout raíz **no son relleno**: son el mínimo que la Ley 16/2018 (art. 19) y el RGPD
(art. 13) exigen ANTES de que el asegurado escriba su correo. De ahí las tres decisiones:

- **El pie está en `app/layout.tsx`, no en `app/(portal)/`.** La única pantalla que ve quien todavía
  no ha entrado es la que le pide el correo; un pie montado en el grupo `(portal)` desaparece justo
  de ahí, y el fallo no se ve.
- **Las páginas se leen SIN sesión** (nada de `@/lib/session` en `app/legal/*`). Pedir sesión para
  leer la política de privacidad es pedirle el dato antes de contarle qué se hace con él.
- **Los datos del mediador salen de `@central/module-seguros` (`src/mediador.ts`), no del JSX.** Es la
  fuente única compartida con el panel del corredor: dos copias de la clave DGSFP `CS-F/0170` es una
  copia de más. Ahí vive también `VERSION_TEXTOS_LEGALES`, que es lo que se sella en
  `portal_consentimiento.version_texto` — un consentimiento sin versión no acredita qué se aceptó.

🚨 **Cada frase de `app/legal/privacidad/page.tsx` es una afirmación sobre el código.** Si el código
cambia (un encargado nuevo, un dato nuevo, una cookie nueva), la página cambia **en el mismo PR** y
sube `VERSION_TEXTOS_LEGALES`. Una política que describe la versión anterior de la app no es un texto
viejo: es información falsa al interesado, que es una infracción distinta y peor.

Lo que hoy afirma y hay que no romper sin querer:

| Afirmación | Lo que la sostiene |
|---|---|
| «El correo no se guarda en claro» | `portal_canal.valor_hash` (SHA-256 con `ASEGURA_PORTAL_CANAL_PEPPER`) |
| «Una sola cookie, sin analítica ni terceros» | solo `asegura_portal_session`; cero scripts de terceros |
| «Tu documento puede procesarse fuera del EEE» | `openrouterVision` de `@central/core-ai` (OpenRouter, EE. UU.) |
| «La base de datos está en la UE» | proyecto Supabase `central`, `eu-west-1` |

**Sin banner de cookies a propósito**: con una única cookie técnica, el art. 22.2 LSSI exime del
consentimiento. Encender analítica obliga, en el mismo PR, a reescribir `/legal/cookies`, montar el
banner con «rechazar» tan fácil como «aceptar» y no cargar nada antes de la aceptación.

Lo vigila `test/regression-portal-legal.test.ts` (9 cepos: que las páginas existan, que el pie esté en
el layout raíz y enlace a las cuatro, que ninguna copie la clave DGSFP a mano, que ninguna exija
sesión, que no se cuele analítica ni una segunda cookie, que las condiciones destaquen el plazo del
art. 16 LCS y que la privacidad siga declarando la salida del documento a OpenRouter).

⚠️ **Dos omisiones DELIBERADAS**, protegidas por su propio test en `packages/module-seguros/src/mediador.test.ts`:
**no se declara ninguna lista de ramos** (el alcance de la inscripción en el registro público de la
DGSFP no se ha comprobado; el art. 19 tampoco la exige) y **no se declara ningún DPO**. Lo segundo ya
no es una duda: Alberto zanjó el 04/09/2026 que **solo usa un correo, `hola@grupoasegura.es`**, así
que el `dpo@grupoasegura.com` que anuncia la web de Manuel no es un buzón suyo — anunciarlo aquí
habría sido dar un canal de derechos que rebota. Los ramos siguen pendientes de la ficha del registro.

📧 **UN solo correo, y sale de `MEDIADOR.identidad.email`.** `hola@grupoasegura.es` es a la vez el
contacto del mediador, el canal de ejercicio de derechos RGPD y el Servicio de Atención al Cliente —
y es el mismo buzón al que ya responde el `Reply-To` del correo del portal
(`PORTAL_MAIL_REPLY_TO`), así que quien contesta a su código y quien presenta una queja llegan al
mismo sitio. Dos buzones repartirían las quejas entre uno que se mira y otro que no, y el que no se
mira incumple el plazo de un mes del SAC. Lo fija un cepo del test del módulo.
✅ **El buzón EXISTE — lo confirmó Alberto el 05/09/2026** («ya existe hola@grupoasegura.es»), lo que
cierra la alerta que quedó abierta el día anterior: la captura de su panel enseñaba los alias en
`grupoasegura.COM` y ningún `hola@`, así que se dio por posible que el correo publicado en producción
como SAC y canal de derechos RGPD **no recibiera**. ⚠️ Es su confirmación, **no una prueba de entrega**:
nadie ha mandado un correo a ese buzón desde aquí y comprobado que llega (y no se hará sin que él lo
pida — regla de comunicaciones salientes del CLAUDE.md raíz). Si algún día rebota, el sitio a mirar es
`MEDIADOR.identidad.email` y el `PORTAL_MAIL_REPLY_TO` del proyecto Vercel, que son el mismo buzón.
🚨 **Cabo suelto conocido:** la web pública (repo `asegura`) sigue publicando `info@grupoasegura.es`
en sus Términos, en su política de privacidad y en `/info-mediador`. **Dos canales de reclamación
distintos para el mismo mediador es una contradicción entre documentos legales publicados**, no una
errata de estilo. Unificarlo allí toca textos con `LegalVersionGate` (forzaría re-aceptación) y el
ruleset de ese repo está bloqueado — no se hizo aquí a propósito.

## 🧨 Landmines

- **🚨 Un `SELECT` de una columna NO concedida falla en la BD — la consulta ENTERA.** El rol tiene
  `GRANT SELECT (col, col, …)` por tabla, y Prisma pide cada columna del modelo por su nombre. Añadir
  `dni` al modelo `Cliente` del portal no «lee el DNI»: hace que **todas** las lecturas de `Cliente`
  devuelvan `permission denied for column dni` (42501) — typecheckea, compila y revienta en producción.
  Los modelos de cartera de `prisma/schema.prisma` son un **espejo del SQL de grants**, no una elección
  de UI; lo vigila `test/regression-portal-aislamiento.test.ts`. Para leer una columna nueva: primero
  el `GRANT`, después el schema, en ese orden. Caso real (03/09/2026): la regla de cartera viva pasó a
  mirar `eiac_xml_hash`; hasta conceder `GRANT SELECT (eiac_xml_hash) ON seguros.polizas TO
  prisma_asegura_portal` moría la lectura ENTERA de `Poliza`, no solo esa columna.
- **El cliente Prisma generado es COMPARTIDO por el `.pnpm` del monorepo** (`node_modules/.pnpm/@prisma+client@5.22.0…/.prisma/client`):
  un `prisma generate` de otra app lo pisa y el typecheck del portal falla con `Property 'portalIdentidad'
  does not exist on type 'PrismaClient'`. No es el código: regenera desde `apps/asegura-portal` antes de
  diagnosticar (medido 02/09/2026).
- **Los 3 ENUM de Postgres tienen que estar declarados como `enum` en `schema.prisma`, no como
  `String`.** Tipados `String` **typecheckea y compila** y luego **revienta en el primer INSERT**
  (Postgres 42804: manda el parámetro como `text` contra una columna de tipo enum). Se arregló con
  `@@map` el 01/09/2026; **no hay migración**, la BD ya era así.
- **Las procedencias son CUATRO en el módulo y, desde el 02/09/2026, también en la BD:** `documento` se
  añadió a `portal_procedencia` (`ALTER TYPE … ADD VALUE`, en el SQL de Fase 4) y a `schema.prisma`.
  `/api/polizas` sigue escribiendo siempre `'declarado'`.
- **Una póliza aportada se guarda SIEMPRE como `declarado`, con `confirmada_por_usuario = false`**, y no
  como «verificada»: que la haya leído una IA no la convierte en dato de contrato — al revés, es donde
  más se inventa. La UI lo dice con todas las letras («Estos datos los hemos leído nosotros del
  documento — revísalos»).
- **`fuente: 'none'` es «no lo hemos podido leer», NUNCA «la póliza no tiene esos datos».** La póliza se
  guarda igual, para completarla a mano; un fallo de `pdf-parse` o de la IA degrada a `none` y se dice.
- **`null` en una prima se pinta `—`, jamás `0,00€`** (`lib/dinero.ts`). Y `primaAnual` es un `Decimal`
  de Prisma: hay que pasarlo por `Number()` **antes** de formatear.
- **La bóveda de declaradas vacía dice «Todavía no has añadido ninguna póliza», no «no tienes seguros»**:
  los de la correduría van en la sección de arriba, con sus tres estados propios (sin vínculo ≠ sin
  pólizas vivas ≠ no visible por nivel).
- **`portal_vinculo.nivel` y `origen` son `text` con CHECK, no enum de Postgres:** `String` en Prisma.
  Se validan en código contra `NIVELES`; fuera del vocabulario → `tarjeta`.
- **`pdf-parse` va en `serverExternalPackages`** (`next.config.ts`) y se importa con `require` dentro de
  un `try`. Sacarlo de ahí rompe el build.
- **`hashCanal()` normaliza a minúsculas y hace `trim`**: cambiar esa normalización (o la pimienta)
  **desvincula a todo el mundo de su identidad** — los hashes guardados dejan de casar y cada usuario
  crea una identidad nueva vacía. No es un cambio cosmético.
- **`portal_consentimiento` es APPEND-ONLY** (se añaden filas, nunca se actualizan) y separa «avísame»
  (`avisos`) de «ofertadme» (`comercial`) más `lds_art19`. Un portal gratis que usa el alta como permiso
  comercial se muere en tres meses.
- **`portal_identidad` NO es un cliente.** Quien entra puede no estar en la cartera; ese es el punto del
  producto. No asumir que existe una ficha detrás.

## Reglas de la casa que aplican aquí (y ya están implementadas)

- **Dinero en formato español** `2.162,49€` con `eur()` de `lib/dinero.ts` (espejo del de `apps/asegura`).
- **Responsive ≥320 px**: botones de 44 px táctiles, `.boton-subir` (el input de fichero nativo no llega),
  y `.datos-leidos` apilada por defecto porque a 320 px dos columnas dejan el valor en ~120 px.
- **Rendimiento UI**: tras subir una póliza se hace `router.refresh()`; la lista **no se desmonta** ni se
  tapa con un loader a pantalla completa. La bóveda lee `take: 50`.
- **Secretos**: `requireSecret()` de `@central/core-identity`, nunca `process.env.X || 'literal'`. Lo
  obliga `test/regression-secrets.test.ts`.

## Lo que falta, y de quién depende

**De Alberto (panel de Vercel; nada de esto bloquea escribir o probar código):** ver la lista numerada
de «Estado» arriba — `DATABASE_URL` con la contraseña del Vault, `PII_LOOKUP_KEY` idéntica a la de
`central-asegura`, secretos de sesión/canal, confirmar el enlace Git del proyecto, resto de envs, WABA.

**Fases siguientes (spec):** Fase 3 motor de obligaciones y recordatorios · Fase 4 **hecha en código**
(vínculo por email + lectura); queda el móvil-como-hogar y el vínculo por DNI verificado · Fase 5
autorizaciones a terceros (`portal_autorizacion`, con nivel propio) y portal de empresas.

🚨 **Dos reglas del spec que hay que tener delante antes de tocar recordatorios o vinculación:**
- **Ninguna póliza del volcado histórico genera un aviso** (volcado = `import_ref IS NOT NULL` **y**
  `eiac_xml_hash IS NULL`; ver `esVolcadoHistorico()`). Si el motor leyera esas fechas mandaría hasta
  **28.728** «se te venció el seguro» de pólizas de 2013-2018.
- **Un número de móvil identifica un HOGAR, no a una persona** (740 números compartidos por 1.599
  fichas, medido 01/09/2026). Un número compartido **nunca resuelve solo** a una ficha. El email sí es
  identificador limpio: 0 duplicados entre clientes distintos.

Y la regla que sostiene el modelo de permisos cuando llegue: **el papel PROPONE el acceso, no lo
concede.** Ser conductor habitual del coche de tu padre no abre nada; le da al sistema una razón para
sugerirle que te autorice.

---

📌 `docs/FUENTES-DE-VERDAD.md` ya apunta a este documento como fuente de verdad de la app
(actualizado el 02/09/2026); el spec y el plan quedan como detalle de diseño.

## 🔐 Autorizar a un tercero (03/09/2026) — y el booleano que había antes

**«José deja que su mujer María vea su póliza del coche.»** Eso vive en
`seguros.portal_autorizacion`, con las reglas puras en
`@central/module-seguros-portal` (`src/autorizacion.ts`). Lee ese fichero antes de
tocar nada: su cabecera es la fuente, esto es solo el resumen.

🚨 **Lo que había antes y por qué no podía quedarse.** Hasta ese día lo decidía
`cliente_relaciones.puede_ver_polizas`, un booleano del CRM de Manuel. Medido el
03/09/2026: **104 filas lo tenían a `true` y las 104 se crearon el 21/06/2026**, el
día del volcado — mismo día, sin excepción. O sea, **ningún cliente lo otorgó**.
Y la columna no guarda autor, ni fecha, ni texto aceptado, ni revocación, así que
tampoco había forma de demostrar lo contrario (art. 7.1 RGPD pide poder
*demostrarlo*, no solo tenerlo). Encima el portal lo leía como nivel `completo`, y
`completo` enseña el **IBAN y el DNI** del otorgante: eso no es «ver mis seguros»,
es ver a la PERSONA.

Se apagaron las 104 **sin perder nada** (foto previa en
`seguros.cliente_relaciones_permiso_volcado`; revertir es un `UPDATE` desde ahí) y
**las 1.706 relaciones siguen intactas**: el vínculo es conocimiento de negocio de
Alberto y es SU dato; el permiso era de José. Son cosas distintas y por eso ahora
viven en tablas distintas. Se pudo hacer a coste cero porque `portal_vinculo`
estaba a **0 filas**: nadie había entrado todavía. Un día después de la primera
invitación, lo mismo habría sido un acceso indebido del art. 33 (72 h).

**Las cinco reglas que sostiene el código, y qué las protege:**

| Regla | Dónde vive | Qué pasa si se rompe |
|---|---|---|
| Nace apagada y **caduca al año** | `caducidadPorDefecto`, `DIAS_VIGENCIA` | El caso que revienta esto es el **divorcio**: nadie entra a revocar ese día |
| **Doble aceptación**: conceder no basta, el autorizado ACEPTA | `estadoAutorizacion` → `pendiente` | María entra en datos ajenos sin saber que hay un registro con su nombre |
| Un tercero **nunca** ve IBAN, DNI ni documentos, ni actúa en tu nombre | `camposDeAlcance` (tope duro, fuera de la escalera de `acceso.ts`) | Vuelve el agujero del booleano |
| **Leer ≠ actuar**: `partes` y `documentos` existen pero NO se conceden | `ALCANCES_CONCEDIBLES` | Un tick no es un poder; si María declara mal, art. 16 LCS y no se sabe quién firmó |
| El otorgante **ve quién miró y cuándo** | `portal_autorizacion_uso` | Sin eso la autorización es un cheque en blanco |

Todo ello con cepo en `test/regression-portal-autorizacion.test.ts` (12 tests, con
las mutaciones comprobadas: no es un cepo que nunca ha disparado).

⚠️ **`origen` no es contabilidad, es el requisito.** `portal` = lo concedió el
cliente en su pantalla. `corredor` = Alberto anotó uno que el cliente le dio por
teléfono. Un consentimiento que la correduría se auto-anota **no puede ser
indistinguible** del que dio el interesado — y aun así no abre nada hasta que el
autorizado lo acepte. Un CHECK de la BD obliga a que conste quién lo otorgó, y de
la forma que corresponda a su origen: nunca los dos campos, nunca ninguno.

🚫 **Al rol `prisma_asegura_portal` se le REVOCÓ el `SELECT` sobre
`cliente_relaciones.puede_ver_polizas`**, y la columna ya no está en el modelo
Prisma de esta app. Si alguien la devuelve al modelo, un `findMany` sin `select`
explícito revienta en la BD — que es donde tiene que reventar. El resto de
`cliente_relaciones` sí se lee: son las que le ofrecen a José a quién autorizar.

📌 **Leer no escribe.** `carteraDeIdentidad` **no** toca el registro de accesos:
devuelve `autorizacionesUsadas` y lo anota quien pinta la bóveda
(`registrarUso`). Un `SELECT` que escribe se cae con el rol equivocado, y además
no se puede testear.

El estudio legal completo, con la comparativa de cómo lo resuelven la AEAT, la
banca, el software del sector y sanidad: `docs/ASEGURA-AUTORIZACION-TERCEROS.md`.

## 📨 Pedir acceso (la dirección CONTRARIA) — y el oráculo que hay que tener cerrado

Dictado de Alberto (04/09/2026): *«se pueda mandar solicitudes por mail… José Suárez Salas puede añadir
el mail de alguien, le diga qué relación tiene, y llega mail con acceso a la intranet»*. O sea, la
autorización al revés: hasta ahora solo José podía empezar («deja que María vea lo mío»); ahora María
puede pedirlo.

Vive en `seguros.portal_peticion_acceso` (`prisma/sql/2026-09-04_portal_peticion_acceso.sql`, aplicada
el 04/09/2026), con las reglas puras en `packages/module-seguros-portal/src/peticion-acceso.ts` y la BD
en `apps/asegura-portal/lib/peticiones.ts`. **Lee la cabecera del módulo puro antes de tocar nada.**

🚨 **La pieza que sostiene todo esto es `respuestaPublica()`, y no es un detalle de UX.** El portal es
abierto: entra cualquiera. Un endpoint que conteste distinto según si el correo que le das es de un
cliente convierte la pantalla en **una máquina de enumerar la cartera** — 32.600 fichas, a razón de un
correo por intento. Por eso **cuatro resultados internos distintos** (`creada`, `sin_destinatario`,
`ya_pendiente`, `ya_autorizado`) colapsan en **una sola respuesta**, `registrada`, con un texto que no
afirma nada:

> «Si esa persona tiene sus seguros con nosotros, le hemos hecho llegar tu petición. Te avisaremos aquí
> si la concede.»

Y **colapsar el texto no basta: hay que colapsar el TIEMPO y el CUERPO.** Los cuatro caminos hacen el
mismo trabajo observable y la respuesta no lleva el id de la fila — un 202 que tarda 30 ms cuando no hay
nadie y 300 ms cuando sí lo hay dice exactamente lo mismo que decirlo con palabras. Los dos únicos
resultados que SÍ se distinguen son los que no revelan nada de un tercero: `a_si_mismo` (400) y
`limite_diario` (429, tope de 5 al día).

- **El destinatario se guarda por índice ciego** (`destinatario_email_hash`, el mismo HMAC que
  `clientes.email_lookup_hash`), nunca el correo en claro: esta tabla la puede llenar cualquiera.
- **La fila se INSERTA siempre y el índice único es la autoridad**: se intenta el INSERT y un `P2002` se
  lee como `ya_pendiente`. Nada de un SELECT previo y un `if` — entre los dos cabe otra petición.
- **Caduca a los 30 días**, contados en DÍAS (`setUTCMonth` sobre un 31 de marzo da un 3 de marzo sin
  avisar), y **lo resuelto gana a la caducidad**: una concedida no se vuelve caducada al pasar el mes.
- **Retirar ≠ rechazar.** `retiradaEn` la pone quien pidió («me he arrepentido»); `rechazadaEn`, quien
  recibió («te he dicho que no»). Colapsarlas borra quién decidió qué.
- **Sin permiso se contesta 404, nunca 403**: un 403 confirma que esa petición existe, y con ella que
  existe la persona a la que se le pidió.
- **Conceder una petición crea la autorización YA ACEPTADA**, con la fecha de la PETICIÓN y no la de hoy:
  pedirla ES aceptarla (quien pidió ya sabe que existe un registro con su nombre — lo pidió él), pero lo
  aceptó el día que escribió.

Cepos: `packages/module-seguros-portal/src/peticion-acceso.test.ts` y
`test/regression-portal-peticion-acceso.test.ts`, con las mutaciones comprobadas.

## 🎟 Autorizar a quien NO es cliente, y autorizar UNA sola póliza (04/09/2026)

Dos techos de `portal_autorizacion` que se levantaron el mismo día, con sus dos migraciones aplicadas
(`2026-09-04_portal_autorizacion_identidad.sql` y `…_por_poliza.sql`).

### 1. `autorizado_cliente_id` era NOT NULL → solo se podía autorizar a un CLIENTE

Dictado de Alberto: *«la persona puede no estar… pero da igual, dale acceso y así podemos también
captarlo de cliente. Mi idea de la intranet cliente es que sea para todo el mundo y gratis»*. El techo
viejo hacía imposible el caso que de verdad pasa —el hijo que quiere ver la póliza de su padre y no es
cliente de nadie— y contradecía el producto, que es justo donde está la captación.

Ahora una autorización apunta **o a una FICHA (`autorizado_cliente_id`) o a una IDENTIDAD del portal
(`autorizado_identidad_id`)**, y a exactamente una de las dos: lo obliga el CHECK
`portal_autorizacion_destinatario_unico` (`num_nonnulls(...) = 1`).

🚨 **Por qué la identidad y NO fabricarle una ficha vacía al invitado.** Quien MIRA es una identidad: es
lo que hay detrás de la cookie. Una ficha es una persona en la cartera de Alberto, con su historial y
sus pólizas, y crear una por cada curioso ensucia los **32.520 leads** que ya arrastra el volcado con
gente que miró la póliza de su padre una vez.

🚨 **Y las dos trampas de hacer nullable una columna que ya tenía cepos**, las dos del tipo que este repo
persigue (no fallan, no se ven, y dejan de proteger):

| Trampa | Qué pasaba | Cómo se cerró |
|---|---|---|
| El CHECK viejo era `otorgante <> autorizado`. En SQL **`algo <> NULL` no es FALSE: es NULL, y un CHECK que da NULL PASA** | «No puedes autorizarte a ti mismo» dejaba de existir para toda fila de identidad | Se sustituyó por `autorizado_cliente_id IS NULL OR otorgante <> autorizado` |
| El índice único era `(otorgante, autorizado, alcance)`. En Postgres **dos NULL nunca son iguales** | La misma identidad podía acumular autorizaciones vivas infinitas sobre la misma ficha | Un índice gemelo `WHERE autorizado_identidad_id IS NOT NULL` |

⚠️ Y lo que la BD **no puede** comprobar, dicho en voz alta para que no se suponga cubierto: que una
IDENTIDAD no se autorice a sí misma exige mirar `portal_vinculo`, que es otra tabla, y un CHECK es de
fila. **Eso lo cierra el código** (`lib/peticiones.ts`, al conceder).

### 2. La autorización abría la FICHA ENTERA → ahora puede abrir UNA póliza

Dictado de Alberto: *«un dueño de empresa solo quiere que una persona vea una sola póliza, no tiene por
qué ver el resto»*. Medido sobre la cartera viva: 110 pólizas y 80 titulares, de los cuales **15 tienen
más de una**. Esos 15 son justo los que lo piden.

`poliza_id` **`NULL` = todas las del otorgante** (lo que significaban TODAS las filas anteriores a la
columna: es un ensanche del vocabulario, no un cambio de significado). Con valor = solo esa.

🦷 **La FK es COMPUESTA `(otorgante_cliente_id, poliza_id) → polizas(cliente_id, id)`, y ese es el cepo
que de verdad importa.** Una FK normal a `polizas(id)` dejaría conceder CUALQUIER póliza de la cartera,
incluida la de otra persona: bastaría un id manipulado en el JSON para que José «autorizara» la póliza
de un desconocido, y la fila quedaría perfectamente válida. Se vio morder antes de darla por buena:
`23503` con la póliza de otro, y entra con la suya.

**Dos trampas que la BD NO puede vigilar**, y por eso están en el código y en la pantalla:

1. **`NULL` cubre las pólizas FUTURAS.** Quien concede hoy «todas» concede también la que contrate
   mañana. Para un empleado suele ser lo que se quiere; para un familiar puede que no. **La pantalla
   tiene que decirlo con esas palabras al conceder** — hay un cepo positivo que falla si nadie lo dice.
2. **Una póliza FUSIONADA deja la autorización apuntando a una fila muerta** (5 fusionadas hoy, no es
   teórico) y el autorizado pierde el acceso **sin que nadie se entere**: no falla, deja de funcionar.
   `lib/cartera-lectura.ts` sigue un salto de `merged_into_poliza_id`; si la fusión se llevó la póliza a
   otra ficha, ya no es del otorgante y no se sirve.

### Qué cambió en la lectura (`lib/cartera-lectura.ts`)

- Las autorizaciones que me alcanzan se buscan por **mi ficha O mi identidad**. Sin el segundo brazo, el
  invitado tenía su autorización en la BD y la bóveda ni la miraba: **no fallaba, salía vacía**.
- **El corte de «aquí no hay nada» usa las DOS listas.** Antes bastaba con no tener `portal_vinculo`
  para devolver `SIN_VINCULO`, y eso dejaba fuera justo a quien el producto quiere dentro. `vinculada`
  sigue significando «hemos encontrado tu ficha», que es otra pregunta y por eso no se colapsa.
- Los alcances de una concesión sobre la ficha entera y los de una sobre una póliza concreta **se
  SUMAN sobre esa póliza**: quien te deja ver todo y además lo económico de la del coche ve lo económico
  de esa y solo de esa. Por eso `camposVisibles` se resuelve **póliza a póliza**, no una vez por titular.
- **Solo cuenta como USO lo que de verdad se ha servido**: una autorización sobre una póliza que ya no
  está viva no se anota como que alguien miró algo. `registrarUso` y `resolver` miran también la
  identidad — si no, el invitado no podría aceptar ni revocar, y sus visitas no constarían: el otorgante
  leería «no ha entrado nadie» sobre alguien que sí entró.

## ✉️ Invitar por correo a quien NO está en la cartera (04/09/2026)

La **tercera** puerta de la autorización, y la que trae gente nueva. Dictado de Alberto: *«se pueda
mandar solicitudes por mail… José Suárez Salas puede añadir el mail de alguien, le diga qué relación
tiene, y llega mail con acceso a la intranet»*. Quien entra por aquí no es un cliente: es un futuro
cliente viendo cómo trabaja la correduría con los seguros de alguien que se fía de él.

Tabla `seguros.portal_invitacion` (`prisma/sql/2026-09-04_portal_invitacion.sql`, aplicada), reglas
puras en `packages/module-seguros-portal/src/invitacion.ts` (**lee su cabecera antes de tocar el
token**), BD en `lib/invitaciones.ts`, correo en `lib/correo-invitacion.ts`, rutas en
`app/api/invitaciones/**`, pantallas en `app/(portal)/autorizaciones/` y `app/invitacion/[token]/`.

### 🚨 El token NO abre sesión, y hay que dejarlo así

La tentación es que el enlace del correo entre de un clic. **No**, por tres razones:

1. **Se lo comen los escáneres.** Un GET que consume estado lo gastan el antivirus del correo y el
   prefetch antes de que la persona lo toque — la misma lección que `lib/enlace-acceso.ts`.
2. **Un token en un correo es una llave reenviable.** Quien reenvía el mensaje, o quien lee el buzón
   compartido de una empresa, entraría en los seguros de un tercero sin que nada falle.
3. **«Aceptado por el que tenía el enlace» no es una prueba de consentimiento**: es un recibo sin
   firma, y el art. 7.1 RGPD pide poder demostrarlo.

Reparto: **el token dice QUÉ invitación es; el código de un solo uso al correo invitado dice QUIÉN
eres.** Y la aceptación se ata al **correo** (se compara el `portal_canal` de quien acepta con
`destinatario_canal_hash`), no al token: un enlace reenviado no le sirve a nadie más. El token se
guarda **hasheado** — una tabla de invitaciones con sus tokens legibles es una tabla de llaves.

### La asimetría con `peticion-acceso.ts` es deliberada

Allí los resultados **se colapsan** porque quien pregunta aprendería si el destinatario es cliente, y
con 32.600 fichas eso es un bucle de enumeración. **Aquí no hay nada que aprender**: se invita igual
lo sea o no. Lo que sigue sin contestarse —ni aquí ni en ningún sitio— es si ese correo está en la
cartera: no es que se colapse, es que **no se calcula** (`invitacionRevelaSiEsCliente()` devuelve
`false` por tipo, y tiene su test sobre TODOS los resultados).

### `sin_enlace` (503) NO escribe la fila; `envio_fallido` (502) SÍ

| | Qué pasó | Qué se dice |
|---|---|---|
| `sin_enlace` | falta `PORTAL_PUBLIC_URL` o no es https → **no se toca la BD** | «avería nuestra; no se ha creado ninguna invitación» |
| `envio_fallido` | la fila EXISTE, lo que falló fue avisar | «la invitación está hecha, pero no hemos podido avisarle» |

Aquí el enlace **es el mecanismo** (a diferencia del correo del código, donde el código abre igual la
puerta y el enlace solo pre-rellena): una fila cuyo correo no puede salir ocupa el sitio del índice
único y nadie podría aceptarla nunca. **No se inventa un dominio.** La respuesta lleva `registrada`,
calculado con `invitacionEscrita()` del módulo puro, para que la pantalla no invite a reintentar algo
que chocaría con el índice.

### Lo que el correo NO puede decir

Quien lo recibe todavía es un desconocido: José pudo equivocarse de dirección, o el buzón puede ser
compartido. Dice **quién** invita, su mensaje, que caduca en 30 días y el enlace. **Nunca** compañía,
número de póliza, matrícula ni importe — `CAMPOS_PROHIBIDOS_EN_INVITACION` vive en el módulo puro con
un test que recorre el cuerpo del correo, para que ese «poco más» no crezca solo con el tiempo. Por lo
mismo, la pantalla del invitado dice «solo a una de sus pólizas» **sin nombrarla**.

### Landmines de esta pieza

- **La pantalla de José NO puede decir a quién invitó.** La tabla guarda solo
  `destinatario_canal_hash` y un hash no se revierte. `InvitacionEnviada` **no lleva destinatario**, y
  eso es una decisión, no un campo por rellenar: cada invitación se identifica por su fecha, la ficha
  y lo que ofrece. Enseñar el correo exigiría guardarlo en claro — una agenda de direcciones de
  terceros que no han consentido nada.
- **El alcance de una invitación es solo `ver`/`ver_economico`**, aunque la ficha sea jurídica: un
  apoderamiento no se reparte por un enlace de correo a quien todavía no ha probado quién es. La
  representación se sigue concediendo por `conceder()`. Lo obliga el CHECK `portal_invitacion_alcance`.
- **`ya_autorizado` mira LAS DOS ramas** (ficha por índice ciego, identidad por `portal_canal`), con
  la póliza en la clave. Sin `PII_LOOKUP_KEY` la rama de la ficha se degrada (log del motivo, jamás
  del correo) en vez de bloquear; el respaldo real es que al ACEPTAR se reutiliza la autorización viva.
- **`lib/correo-invitacion.ts` importa `@central/core-email` de forma DINÁMICA**, dentro de
  `enviarInvitacion`. Medido: `node --test` no resuelve ese paquete (su `main` importa
  `./transporter` sin extensión) y con el import arriba el cepo del cuerpo del correo no podía cargar
  el módulo — o sea, se probaría leyendo la fuente, que es no probarlo.
- **Las dos consultas por token son las ÚNICAS del portal sin identidad** (`invitacionPorToken` y
  `filaPorToken`): la página es pública y ahí el filtro es el token, 256 bits. Están marcadas en voz
  alta en el código y **no** hizo falta tocar la lista de EXENTOS del guardián de aislamiento.
- **La sección «invitaciones mandadas» se carga por `GET /api/invitaciones`**, sin `try/catch`: si la
  consulta falla, que suba. Devolver listas vacías haría pasar un fallo de BD por «no has invitado a
  nadie» — justo sobre la lista donde José decide si retira algo. La pantalla distingue los tres
  estados (cargando ≠ no se ha podido mirar ≠ mirado y no hay).
- ⚠️ **Hueco conocido:** las fichas desde las que invitar salen de `candidatos`, que es lo único que
  manda `GET /api/autorizaciones` — y `candidatos` sale de `cliente_relaciones`. Quien tenga vínculo
  pero **ninguna relación registrada** no ve ficha que ofrecer; la pantalla lo dice («no tenemos
  identificada ninguna ficha tuya… escríbenos») en vez de enseñar un formulario que fallaría con
  `ficha_no_tuya`. Lo correcto a medio plazo es que el puerto mande «mis fichas» aparte de los
  candidatos.

Cepos: `packages/module-seguros-portal/src/invitacion.test.ts` (10, con las mutaciones comprobadas:
colapsar `sin_enlace` con `envio_fallido` y sumar la caducidad en meses hacen fallar los suyos) y
`apps/asegura-portal/lib/invitaciones.test.ts` (25).

## 🗑 «Borradme los datos» (05/09/2026) — la solicitud que NO borra

Tabla `seguros.portal_supresion` (`prisma/sql/2026-09-05_portal_supresion.sql`, **APLICADA el
05/09/2026**, migración `20260905100234_seguros_portal_supresion`; los 4 cepos vistos morder en la
BD real con rollback — ver su cabecera). Reglas puras en
`packages/module-seguros-portal/src/supresion.ts`, BD en `lib/supresion.ts`, ruta
`app/api/supresion/route.ts`, pantalla `app/(portal)/boveda/TusDatos.tsx`.

🚨 **No borra nada, y esa es la mitad del diseño.** El art. 17.3.b y el 17.3.e del RGPD excluyen la
supresión cuando el tratamiento hace falta para cumplir una obligación legal o para defender
reclamaciones, y una correduría tiene las dos (normativa de seguros y prevención del blanqueo). Las
dos salidas fáciles están mal: un botón que borre de verdad destruye documentación que la ley obliga
a guardar, y uno que diga «borrado» sin borrar es una mentira que se descubre sola. Lo obligatorio, y
lo que hay construido, es **recibir, acusar y contestar en un mes** (art. 12.3) diciendo con nombres
qué se suprime y qué se conserva, con su base legal (art. 12.4: la negativa parcial hay que motivarla).

- **Las DOS listas se enseñan ANTES de pulsar**, no en la respuesta de dentro de un mes, y se
  **calculan** (`loQueSeSuprime()` / `loQueSeConserva()`): una copia a mano en el JSX se desincroniza
  en cuanto se añade una categoría, y entonces la pantalla promete un borrado que nadie va a hacer.
- **El reloj arranca al pulsar**, no al abrirla el corredor: si arrancara al mirarla, no mirarla nunca
  sería una forma de no incumplir jamás. `estadoPlazo()` da cuatro estados y **`vencido` no se
  redondea a «urgente»**.
- **Prorrogar exige motivo** (art. 12.3: hay que avisar dentro del primer mes). Prorrogar en silencio
  incumple igual que no contestar, así que el sello sin motivo sería una prórroga inventada.
- **Una pendiente bloquea otra** por índice único parcial en la BD, no por un `SELECT` y un `if`:
  entre los dos cabe otra solicitud y dos relojes legales sobre el mismo caso. Una **resuelta no**
  bloquea: el motivo de conservación decae, y una negativa de hace tres años no vale para siempre.
- **Retirar ≠ denegar**, y no se borra la fila: el rol **no tiene DELETE** sobre la tabla. La
  solicitud es la prueba de que ejerciste el derecho y de que se te atendió.
- **El motivo es opcional**: el art. 17 no obliga a justificar la solicitud, y exigirlo sería un peaje.

📌 **Y llega a una pantalla que Alberto abre.** La cola la sirve `apps/asegura` por
`GET/POST /api/operador/supresiones` a `plataforma` → `/correduria`, **ordenada por el reloj legal y
no por orden de llegada**, con `resumen.vencidas` aparte. Sin ese puerto la solicitud viviría solo en
la BD del portal y el plazo de un mes se incumpliría en silencio: es la regla de la casa («un aviso en
una pantalla que nadie abre no existe») aplicada donde más caro sale.

🚨 **Y la lección que dejó al aplicarla: se desplegó ANTES que la DDL.** El código que consulta la
tabla entró en `main` y Vercel lo puso en producción (`dpl_Fe3pMt…`) con la tabla todavía sin crear.
`lib/supresion.ts` consulta **sin `try/catch` a propósito**, así que en esa ventana `/boveda` entera
habría reventado, no solo la sección nueva. No golpeó a nadie —cero errores de esa ruta en Vercel,
porque nadie entró—, pero eso fue suerte. **La DDL de una tabla `portal_*` se aplica en el MISMO paso
que el despliegue que la usa**, y esta cabecera ya lo decía antes de incumplirse.

Cepos: `packages/module-seguros-portal/src/supresion.test.ts` (10) y
`test/regression-portal-supresion.test.ts` (14). **Tres mutaciones comprobadas**: quitar la lista de
«lo que se conserva» de la pantalla, dar `DELETE` al rol del portal y permitir resolver sin texto
hacen fallar el suyo.

⚠️ **Y el guardián de aislamiento mordió al construirlo, con razón.** `correduriaUnica()` se sacó a un
`lib/correduria.ts` suelto para no duplicarla, y ese fichero toca `prisma.correduria` —o sea, la
cartera— sin poder nombrar `portalVinculo` ni resolver sesión. Se **deshizo la extracción**: la
función se exporta desde `lib/peticiones.ts`, donde nació, y `lib/supresion.ts` la importa de ahí. Un
exento nuevo en el cepo es una puerta abierta para siempre a cambio de nada.

## ☎️ El teléfono de la compañía (05/09/2026) — el sitio existe, los números los pone una persona

Alberto quiere una **hoja imprimible** («la del frigorífico») con lo que hace falta después de un
percance: compañía, nº de póliza, tomador y **a quién llamar**. Ese teléfono no estaba en ninguna
parte: medido el 04/09/2026, el único `telefono` de todo el schema que no es de una persona es el de
`corredurias`.

`prisma/sql/2026-09-05_companias_telefonos.sql` (aplicada) añade a `companias_dgs`
`telefono_siniestros`, `telefono_asistencia`, `telefono_fuente` y `telefono_verificado_en`, con
`SELECT` por columnas para `prisma_asegura_portal`.

🚨 **Los números se dejaron a NULL a propósito.** Desde el contenedor de la sesión la política de red
bloquea `mapfre.es`, `allianz.es`, `occident.com` y `reale.es` (comprobado con las cuatro), y lo único
alcanzable son comparadores que **se contradicen entre sí** — para Mapfre salen 918 366 240,
918 365 365 y 900 822 822 según quién lo cuente. Un teléfono de siniestros equivocado impreso en un
imán de nevera es peor que no tener ninguno: alguien lo marca a las 3 de la mañana después de un
golpe. **No se rellenan desde un agente; los pone una persona contra la fuente.**

🦷 **El cepo `companias_dgs_telefono_con_fuente`** impide guardar un número sin decir de dónde salió y
cuándo se comprobó. Visto morder: el `UPDATE` con solo el número devuelve **23514**, y el mismo con
fuente y fecha entra.

**Reglas para cuando se pinte la hoja:**

- **`NULL` = «no lo hemos verificado», NUNCA «esta compañía no tiene»** ni un hueco en blanco. La hoja
  dice «pídenoslo» — es la regla de la casa aplicada al caso donde más caro sale.
- **Son DOS números y no se colapsan**: dar parte ≠ asistencia 24h. En el arcén hace falta el segundo.
- **El teléfono de la CORREDURÍA va primero**, y el de la compañía debajo con su etiqueta de urgencia.
  El punto de contacto es Alberto (regla de visibilidad del 03/09), pero quitarle a un cliente el
  número de la grúa para forzar que llame al corredor es un mal negocio el día que le pase de verdad.
- **La hoja lleva impresa la fecha de verificación.** Un número leído hace tres años falla igual que
  uno equivocado, y en el mismo momento.

📌 Cartera viva medida el 05/09/2026: **solo cuatro compañías** — Mapfre (64 pólizas, `C0058`),
Allianz (26, `C0109`), Occident (19, `C0468`) y Reale (1, `C0613`). Las cuatro ya están en
`companias_dgs` y su `nombre_comun` casa exacto con `polizas.aseguradora`.

### 📲 Occident da parte por WhatsApp (05/09/2026)

Lo trae Alberto con una captura del perfil verificado: *«catalana tiene whassap para apertura
siniestros!!»*. Tapa exactamente el hueco que este repo tenía anotado ese mismo día en el
`telefono_fuente` de C0468 — buscado en occident.com, no había número de siniestros.

`prisma/sql/2026-09-05_companias_whatsapp_horario.sql` (aplicada) añade `whatsapp_siniestros` y
`horario_siniestros`, y rehace el cepo de la fuente para que cubra también el canal nuevo.

🚨 **Y trae dos avisos que NO se pueden perder por el camino:**

1. **El perfil se llama «Plus Ultra Siniestro y asistencia» y la empresa verificada es «Occident».**
   Plus Ultra es **otra compañía de esta misma tabla** (`C0517`, del mismo grupo). Se atribuye a
   Occident porque el nombre verificado por Meta y la web del perfil son de Occident, que es la
   señal fuerte, y **la duda queda escrita en `telefono_fuente`**. Si Occident confirma que esa
   línea es solo de Plus Ultra, se mueve a `C0517` con un `UPDATE`. Son 19 pólizas: equivocarse
   aquí manda a 19 clientes a la compañía que no es.
2. **Atiende de 9h a 21h, de lunes a viernes — o sea, NO es 24 h.** Por eso existe
   `horario_siniestros`: un canal de siniestros pintado sin horario se lee como «siempre», que es
   la promesa que se rompe un sábado por la noche. Y por eso este canal **no puede ir a
   `telefono_asistencia`**, que es la grúa.

🚨 **`whatsapp_siniestros` NO es `telefono_siniestros`, y la línea de VOZ sigue a NULL.** Uno se
marca y el otro es mensajería. Que un fijo de Madrid publicado como WhatsApp Business atienda además
llamadas es probable — y «probable» no se imprime en la nevera de nadie. 🦷 `companias_dgs_whatsapp_e164`
exige E.164 (`+34917838383`) y se vio morder con el número en formato de lectura: **23514**.

🚫 **`telefono_fuente` se REVOCÓ del rol del portal** el mismo día: dejó de ser una nota neutra
(hoy guarda la duda de Plus Ultra, lo que falta preguntar, y por qué el 900 102 978 —Defensa del
Cliente— no puede ir ahí). Eso es gestión, y la gestión no llega al cliente. El rol ve **10
columnas** de esa tabla y ni `notas` ni `telefono_fuente`.

### 🚑 Los DOS caminos del parte, y por qué el primero no somos nosotros

Dictado de Alberto (05/09/2026): *«los siniestros mejor intentar llamen a la compañía; nosotros como
nos enteraremos por CIMA me avisas y llamar para ver cómo va y hacerle seguimiento»*. Lo implementa
`CanalesCompania` en `app/(portal)/boveda/ParteSiniestro.tsx`, con las reglas puras en
`packages/module-seguros-portal/src/canal-compania.ts`.

- **El canal de la compañía se pinta ARRIBA, fuera del formulario y sin elegir póliza.** Si el
  camino que de verdad abre el siniestro estuviera detrás de «Dar parte» → desplegar → elegir
  póliza, estaría escondido justo de quien tiene prisa. Se enseñan las compañías de TODAS sus
  pólizas (`canalesDeLasPolizas`), no la de la póliza seleccionada.
- **Las cuatro frases prohibidas**, cada una con su cepo: «esta compañía no tiene teléfono»
  (`null` = no lo hemos verificado → `TEXTO_SIN_CANAL`, «pídenoslo») · «24 h» (no existe ningún
  dato que signifique «siempre») · un `href="tel:"` sobre un WhatsApp · un cruce
  póliza→compañía **aproximado**.
- **El cruce es por nombre EXACTO** y ahí es donde más falla, a propósito: el nombre de una póliza
  APORTADA lo leyó una IA de un PDF («MAPFRE ESPAÑA S.A.»), así que muchas caen en «pídenoslo». Una
  coincidencia aproximada acertaría casi siempre y alguna vez daría el teléfono de urgencias de
  **otra** compañía — un fallo que no se ve hasta que alguien marca.
- **La asistencia NO hereda `horario_siniestros`**: la grúa puede tener otro horario, y copiárselo
  es inventarse el dato justo de la vía que se usa a la hora en la que el otro no atiende.
- **Las compañías `sinDatos` NO se filtran de la lista.** Filtrarlas las hace desaparecer en
  silencio, y eso se lee como «con esa no hay nada que hacer».

Cepos: `packages/module-seguros-portal/src/canal-compania.test.ts` (11) y
`test/regression-portal-canal-compania.test.ts` (5). ⚠️ Dos de los cepos de raíz **no mordieron a la
primera** y se arreglaron: el de «24 h» cazaba «formato de 24 h» del campo de la hora (se acotó al
bloque del canal), y el de las `sinDatos` dejaba pasar un `.filter()` posterior al helper. Un cepo
que no se ha visto morder es una suposición.

📌 Cartera viva al 05/09/2026: Mapfre `C0058` (64 pólizas, 900 122 122) · Allianz `C0109` (26,
900 101 920; **asistencia a NULL a propósito** porque depende del ramo y la columna admite uno solo) ·
Occident `C0468` (19, **solo WhatsApp**) · Reale `C0613` (1, 900 365 900).

🔗 **Y el QR de esa hoja lleva un ENLACE, no los datos.** Un QR no caduca —es una imagen con un texto
dentro— pero lo que se mete dentro sí: con los datos escritos, la imagen miente en cuanto cambie la
póliza, y además cualquiera que fotografíe la hoja se los lleva. Con una URL, el QR es permanente y
la página detrás está siempre al día. Es la opción simple, no la complicada.
