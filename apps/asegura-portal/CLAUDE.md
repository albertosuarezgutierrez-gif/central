# CLAUDE.md — apps/asegura-portal (portal del CLIENTE de Grupo Asegura)

> **Esta app la ve el ASEGURADO, no Alberto.** El panel del corredor es `apps/asegura` (lee
> `apps/asegura/CLAUDE.md`) y la pantalla de trabajo de Alberto es `apps/plataforma` → `/correduria`.
> Aquí entra gente de la calle, cliente o no. Antes de tocar nada lee el spec
> `docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md` (producto completo) y
> `docs/superpowers/plans/2026-09-01-asegura-portal-fase-1.md` (lo que se construyó de verdad).

## Estado (02/09/2026): Fase 1 mergeada + Fase 4 en código; DDL aplicado; NO desplegada

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
  2. **`PII_LOOKUP_KEY` en ese proyecto, IDÉNTICA a la de `central-asegura`.** Es la clave del índice
     ciego (`clientes.email_lookup_hash`): con otra clave el hash no casa y **nadie se vincula nunca**
     (`sin_clave`/`sin_ficha` para todo el mundo, sin error). Sin ella en producción el módulo lanza y
     el portal lo degrada a `sin_clave`: se entra, pero sin cartera.
  3. `ASEGURA_PORTAL_SESSION_SECRET` y `ASEGURA_PORTAL_CANAL_PEPPER` (sin ellas la app no arranca /
     el hash del canal es reversible), resto de envs (tabla de abajo) y la WABA de WhatsApp (no existe;
     por eso el canal es un puerto).

## Qué es, y por qué es una app APARTE de `apps/asegura`

El producto no es «mira tus pólizas»: es **«aporta tus seguros»**. Mirar sirve a los ~80 clientes vivos
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
  app/(portal)/boveda/          Cartera (propias + autorizadas) y bóveda de aportadas + SubirPoliza.tsx
  app/api/acceso/solicitar      POST — genera y manda el código
  app/api/acceso/verificar      POST — canjea el código y pone la cookie
  app/api/polizas               POST — sube un PDF/foto, lo lee la IA, lo guarda
  lib/session.ts                🚪 LA PUERTA ÚNICA: de aquí sale de quién es la sesión
  lib/vinculo.ts                Fase 4: identidad → ficha de la cartera por índice ciego del email
  lib/cartera-lectura.ts        Fase 4: lo que se LEE de la cartera para una identidad (por portal_vinculo)
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
  `portal_vinculo` filtrado por `identidadId`. Pólizas **vivas** = `import_ref IS NULL AND
  merged_into_poliza_id IS NULL` (las de CIMA); las 28.729 del volcado histórico **no se enseñan**.
  `confirmadaCima = id_poliza_entidad !== null` (si no, chip «pendiente de confirmación por la compañía»).
  Por póliza: coberturas (total + 4 primeras), recibos (próximo al cobro por `situacion`
  `pendiente`/`emitido`, devueltos, último cobrado; **`total: 0` = «sin recibos informados», no «al
  corriente»**), siniestros `abierto`/`en_tramitacion` con el teléfono del tramitador.
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

## Infraestructura

- **BD:** la Supabase **compartida de la casa**, schema **`seguros`** (el mismo donde vive la cartera
  volcada). Sin Supabase aparte. Prefijo `portal_` en las tablas para no colisionar con el volcado.
- **Rol:** `prisma_asegura_portal`, **SIN BYPASSRLS**, DML sobre `portal_*` y **`SELECT` por columnas**
  sobre `corredurias`, `clientes`, `cliente_emails`, `polizas`, `poliza_coberturas`, `poliza_recibos`,
  `siniestros`, `poliza_intervinientes`, `cliente_relaciones` (`prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql`,
  aplicado 02/09/2026; **sin contraseña** hasta que Alberto la ponga). Es lo que toca internet: no lleva
  la llave maestra.
- **DDL:** `prisma/sql/2026-09-01_portal_fase1.sql` — 3 ENUM + **6 tablas**: `portal_identidad`,
  `portal_canal`, `portal_codigo`, `portal_bien`, `portal_poliza_declarada`, `portal_consentimiento`;
  y `prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql` — **`portal_vinculo`** + rol + grants. Las otras
  **5** del spec (`portal_autorizacion`, `portal_obligacion`, `portal_aviso`, `portal_auditoria`,
  `portal_revision`) llegan con sus fases. ⚠️ La memoria del
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
| `OPENROUTER_API_KEY` | Visión, para leer pólizas en foto. Si falta, la extracción degrada a `none` |
| Proveedor de correo (lo lee `@central/core-email` solo) | `RESEND_API_KEY`, **o** `SMTP_USER`+`SMTP_PASSWORD` (+`SMTP_HOST`/`SMTP_PORT`), **o** `GMAIL_USER`+`GMAIL_APP_PASSWORD` |

⚠️ **No existen envs `PORTAL_SMTP_*`**: `createMailTransporter()` no recibe credenciales por parámetro,
las lee él del entorno. Lo único que pone el portal es el `from`.

## Rutas API (las tres que hay)

| Ruta | Entrada | Salida | Notas |
|---|---|---|---|
| `POST /api/acceso/solicitar` | `{ tipo: 'whatsapp'\|'email', destino }` (zod) | `{ ok }` · `400 datos_invalidos` · **`503 canal_no_disponible`** · **`502 envio_fallido`** | Guarda el código con `hashCanal(destino)`, nunca el email en claro |
| `POST /api/acceso/verificar` | `{ tipo, destino, codigo }` (6 chars) | `{ ok, vinculo }` + cookie · `400 datos_invalidos\|sin_codigo` · `401 incorrecto\|caducado\|ya_usado\|bloqueado` | Coge el código **más reciente** de ese canal; el intento se cuenta siempre que sea `incorrecto`; crea la identidad si no la había; marca `usado_en` y `ultimo_acceso_en` en una transacción; **Fase 4:** llama a `vincularIdentidad()` con el email en claro y devuelve `vinculo` (`ok`/`ya_vinculada`/`sin_ficha`/`ambiguo`/`sin_clave`/`error`) sin bloquear |
| `POST /api/polizas` | `multipart`, campo `documento` (PDF o imagen) | `{ id, datos, fuente }` · `401 sin_sesion` · `400 sin_fichero` · `413 fichero_grande` | `runtime = 'nodejs'`; tope **10 MB**; la identidad sale de `requireIdentidad()`, nunca del cuerpo |

Pantallas: `/` (pedir + verificar código) y `/boveda` (`force-dynamic`, redirige a `/` sin sesión).
**No hay `middleware.ts`**: cada ruta y cada página resuelve la sesión por su cuenta — que es
precisamente lo que vigila el guardián.

## 🧨 Landmines

- **🚨 Un `SELECT` de una columna NO concedida falla en la BD — la consulta ENTERA.** El rol tiene
  `GRANT SELECT (col, col, …)` por tabla, y Prisma pide cada columna del modelo por su nombre. Añadir
  `dni` al modelo `Cliente` del portal no «lee el DNI»: hace que **todas** las lecturas de `Cliente`
  devuelvan `permission denied for column dni` (42501) — typecheckea, compila y revienta en producción.
  Los modelos de cartera de `prisma/schema.prisma` son un **espejo del SQL de grants**, no una elección
  de UI; lo vigila `test/regression-portal-aislamiento.test.ts`. Para leer una columna nueva: primero
  el `GRANT`, después el schema, en ese orden.
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
- **Ninguna póliza del volcado histórico (`import_ref IS NOT NULL`) genera un aviso.** Si el motor
  leyera esas fechas mandaría hasta **28.729** «se te venció el seguro» de pólizas de 2013-2018.
- **Un número de móvil identifica un HOGAR, no a una persona** (740 números compartidos por 1.599
  fichas, medido 01/09/2026). Un número compartido **nunca resuelve solo** a una ficha. El email sí es
  identificador limpio: 0 duplicados entre clientes distintos.

Y la regla que sostiene el modelo de permisos cuando llegue: **el papel PROPONE el acceso, no lo
concede.** Ser conductor habitual del coche de tu padre no abre nada; le da al sistema una razón para
sugerirle que te autorice.

---

📌 `docs/FUENTES-DE-VERDAD.md` ya apunta a este documento como fuente de verdad de la app
(actualizado el 02/09/2026); el spec y el plan quedan como detalle de diseño.
