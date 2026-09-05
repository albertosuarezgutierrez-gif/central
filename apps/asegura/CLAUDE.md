# CLAUDE.md — apps/asegura (Grupo ASegura, correduría de seguros)

> ✍️ **El nombre comercial se escribe «Grupo ASegura», con A y S mayúsculas** (dictado por Alberto,
> 04/09/2026). El monograma «AS» del logo es el nombre: A de Alberto, S de Suárez. Escribirlo con
> la ese minúscula no es una errata de estilo — se come la marca, y es lo que el autocorrector
> escribe solo. Grafía canónica en BD: `seguros.corredurias.nombre`. Guardián en todo el repo:
> `test/regression-nombre-comercial-asegura.test.ts`.

> Vertical de la **correduría de seguros** de Alberto (nombre comercial **Grupo ASegura**).
> Lee antes `docs/TRASPASO-CORREDURIA.md`: esta app es el DESTINO de un traspaso en curso,
> no un desarrollo desde cero.

## Estado (02/09/2026): la cartera está EN CASA y esta app YA LEE DE CASA

**El 02/09/2026 se volcó la cartera entera al schema `seguros` de central** (52 tablas, 86.628
filas, 131 FKs; verificado tabla a tabla por recuento y por checksum de contenido en clientes,
pólizas, recibos y siniestros). Bitácora en `seguros._volcado_control`. Detalle del método en
`prisma/sql/2026-09-01_seguros_volcado_datos.sql` (copia server-side por `dblink`). En la misma
sesión se portaron las **12 funciones y 26 triggers** del CRM (`updated_at`, tablas append-only,
recálculo de `clientes.segmento`) — migración `seguros_triggers_y_search_path_crm` en Supabase.

**Lectura (esta app y, por el puerto, `plataforma` → `/correduria`): `lib/asegura-db.ts` lee por
defecto de central**: `DATABASE_URL` (rol `prisma_seguros`) + `?schema=seguros`, decidido por el
helper puro y probado `urlFuenteCartera` (`lib/asegura-url.ts`). `ASEGURA_FUENTE=origen` vuelve al
Supabase de Manuel (`ASEGURA_DATABASE_URL`). La fuente elegida sin conexión es «pendiente», nunca
cae a la otra en silencio.

✅ **CAUSA MEDIDA del «no se puede leer la cartera» (02/09/2026): `credenciales`.**
La contraseña de **`prisma_seguros` se rotó tres veces ese día** (05:51, 05:52 y 10:17, visto en
`postgres_logs`) y el `DATABASE_URL` de Vercel `central-asegura` se quedó con la vieja → toda consulta
a la cartera moría en `password authentication failed for user "prisma_seguros"`, y ese texto **solo
existía en los logs del pooler de Supabase**. El propio repo ya lo avisaba por escrito en el SQL de
`crm_seguros`: «la `DATABASE_URL` de central-asegura es Sensitive en Vercel y no se puede copiar; en vez
de rotar la contraseña de prisma_seguros (**tumbaría central-asegura**), el CRM entra con su rol». Se
rotó igual. 🚨 **Al rotar la contraseña de un rol, el mismo PR/paso actualiza el `DATABASE_URL` (y
`DIRECT_URL`) del proyecto Vercel que lo usa** — si no, la app queda muerta sin que nada más falle.

✅ **CERRADO Y VERIFICADO (03/09/2026, 07:30 UTC).** El cron `/api/cron/cima-liq` volvió a leer la
cartera: **12 filas en `comisiones_devengo` y 4 en `comisiones_cobertura`, todas con `leido_ok = true`**
y datos reales (Mapfre, Allianz, Occident, Reale; liquidaciones CIMA con hash). Sin un solo
`password authentication failed` en `postgres_logs` desde la última rotación del 02/09 a las 10:17.
⚠️ Lo que sigue en «no comprobado» **a propósito** es la conciliación bancaria: `banco_total` está a
NULL en las 12 filas porque nadie ha cruzado los abonos todavía — eso es «aún no se sabe», no «0 €».

⚠️ **El `?schema=seguros` FORZADO (PR #2029) NO era la causa** — se escribió aquí como hipótesis
probable y resultó falsa; corregido el 02/09/2026. Se conserva como blindaje y por lo que dice de
diseño: `DATABASE_URL` es la MISMA cadena que usa la auth (`lib/db.ts`), donde el schema correcto es
`public`, y respetar el que traiga apuntaría el cliente de la CARTERA a `public` — donde **no existe
`corredurias`** (falla todo) pero **sí `clientes`**, que es OTRA tabla: leerías los clientes de central
creyendo que son los de la correduría. Nunca ha llegado a pasar; que no pueda pasar es el punto.

🚨 **Y un fallo de lectura NUNCA sale pelado: `{estado:'error', causa}`.** Las NUEVE rutas de
`/api/operador/*` usan el MISMO clasificador, **`lib/error-cartera.ts`** (puro y testeado):
`credenciales` · `permisos` · `conexion` · `esquema` · `sin_correduria` · `otro` — seis causas que se
arreglan en seis sitios distintos. `registrarErrorCartera()` la registra en el log del servidor y la
devuelve para la respuesta; `describirErrorCartera()` **borra la URL de conexión** del mensaje antes de
loguearlo, porque lleva usuario y contraseña dentro y esto viaja a plataforma y de ahí a un Telegram.
⚠️ **Un clasificador y solo uno**: el PR #2029 creó `lib/comisiones-motivo.ts` para lo mismo unas horas
antes que el #2034, y dos módulos que clasifican el mismo error divergen — se retiró el 02/09/2026 y la
ruta de comisiones pasó al compartido. Al añadir una ruta al puerto, usa `registrarErrorCartera`.

🚨 **El origen NO está vivo: está CONGELADO desde el 31/08 06:15 UTC, y no por decisión.** Medido en
los logs de Vercel: el CRM de Manuel (repo `albertosuarezgutierrez-gif/asegura` + proyecto Vercel
`asegura`, ambos YA en el equipo de Alberto, sirviendo `app.grupoasegura.com`) falla toda consulta
con `password authentication failed for user "postgres"` desde su primer despliegue en nuestro
equipo (386 veces en `/api/health`). Por eso el cron `cima-pull` recibe 500 tres veces seguidas
(31/08 11:34, 01/09 10:19 y 15:30). Consecuencia útil: **nada ha escrito en el origen desde
entonces, así que la copia del 02/09 está completa** y no hace falta re-sincronizar.

✅ **CERRADO el 02/09/2026 a las 06:36 UTC.** El proyecto Vercel `asegura` (el CRM, Drizzle) conecta a
la BD `central` con el rol **`crm_seguros`** (LOGIN, BYPASSRLS, DML sobre `seguros`, `search_path =
seguros`, cero visibilidad de `public`), por el pooler `aws-0-eu-west-1:6543`. Prueba: `/api/health`
en `db: ok`; el `cima-pull` en dry run (run #187) y **el pull REAL (run #188, 09:25 UTC, `mode: real`,
0 errores, 6 páginas de TIREA leídas)** escribieron `cima_pull_started/completed` en
`seguros.operational_events` de central. El cron de CIMA (05:30 y 11:30 UTC, GitHub Actions del repo
`asegura`) escribe desde entonces aquí. `processed: 0` en ese pull no es fallo: los 128 ficheros de la
cola TIREA ya están en `cima_ficheros` (86 `confirmed` + 42 `review`); lo nuevo se verá cuando llegue. **No arreglar la contraseña del origen**: el origen congelado es
la copia de seguridad. La contraseña de `crm_seguros` pasó por un chat; **Alberto decidió NO rotarla**
(02/09/2026): no se toca sin que lo pida él.
Detalle y lecciones (variable Sensitive, plantilla sin sustituir, mirar `get_runtime_errors` y no el
health) en `docs/TRASPASO-CORREDURIA.md` («TRASPASO CERRADO»).

🔐 **Auth también en casa (02/09/2026, por dblink):** los 9 `auth.users` del proyecto de Manuel (2 reales:
Alberto y Manuel, con contraseña bcrypt y su TOTP), 11 identidades y 2 factores MFA están copiados **con los
mismos UUID** en `auth.*` de central (9/9 enlazados con `seguros.usuarios.auth_user_id`), y el trigger
`on_auth_user_created` → `seguros.handle_new_user()` ya crea la fila de `seguros.usuarios` en cada alta.
Referencia y trampas (RLS sin políticas en `auth.*` de origen = 0 filas sin error; INHERIT por GRANT en
PG16) en `prisma/sql/2026-09-02_seguros_auth_traspaso.sql`.

🛑 **Decisión de Alberto (02/09/2026): la web del CRM de Manuel NO se quiere.** «Eso no lo quiero… no es
necesario el acceso, eso ya desarrollaremos.» Consecuencias: **no se migra su login** (las variables
`NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` de Vercel `asegura` se quedan apuntando al proyecto
de Manuel y nadie tiene que entrar ahí), no se configura Google/TOTP/SMTP en central para el CRM, y las
pantallas de la correduría se construyen en `plataforma` → `/correduria` sobre `seguros`. **El CRM se
mantiene desplegado SOLO como motor de ingesta de CIMA** (cron de GitHub Actions → `app.grupoasegura.com`
→ adaptador Fly → TIREA) porque escribe en `seguros` de central con `crm_seguros` y trae las pólizas
nuevas gratis; el día que tengamos ingesta propia de CIMA, se apaga. La copia de `auth.*` en central queda
como respaldo, sin uso. El CRM no usa PostgREST en producción: `record-evidence.ts` **no tiene llamadores**.

Lo que hay aquí es el **armazón** —auth, layout, manifiestos, gate de build— más la cartera en
`seguros`. El resto de este apartado describe el estado ANTERIOR al volcado y sigue valiendo para
entender la arquitectura.

🚨 **32.600 fichas ≠ 32.600 clientes (medido 01/09/2026).** La **cartera VIVA son 80 clientes /
110 pólizas** (03/09/2026) — las que entran o mantiene CIMA. ⚠️ De esas 110, **42 están `cancelada`**
y **68 no** (medido 03/09/2026): CIMA manda también las canceladas y la regla de cartera viva no las
distingue, así que un recuento de «vivas» a secas no es un recuento de pólizas en vigor. Los ramos:
**auto 81 · hogar 19 · responsabilidad civil 9 · moto 1**. Las otras 28.728 son volcado histórico cargado en
jun/2026 (`intranet:` 26.117 con vencimientos 2013-2018 y `asegura_app:` 2.611) y **ninguna** vence en los
últimos 18 meses. Regla de Alberto: **CIMA = cliente actual; el resto = lead** (32.520).

🚨 **Y la cartera viva NO es `import_ref IS NULL` a secas (agujero medido el 03/09/2026).** Cuando la
ingesta de CIMA trae una póliza que YA existía en el volcado no crea fila nueva: actualiza la vieja y le
deja su `import_ref` viejo (`poliza-matching.ts` casa por número + compañía; el `import_ref` no interviene).
La regla correcta, única y testeada en `packages/module-seguros/src/cartera-viva.ts` de
`@central/module-seguros` (`esCarteraViva()`, `WHERE_CARTERA_VIVA`, `sqlCarteraViva()`), es
**`import_ref IS NULL` O `eiac_xml_hash IS NOT NULL`** — el hash solo lo escribe el pipeline EIAC, o sea
«CIMA ha tocado esta fila». Hoy cambia **1** póliza: la `3021700291186` de **Reale (C0613)**, auto, vence
19/09/2027, con `import_ref` `asegura_app:pol2:15143` y suplemento EIAC (proceso 133) del 25/08/2026 — con
la regla vieja **Reale figuraba con 0 pólizas vivas** y ese cliente era invisible en el CRM y en el portal.
`import_ref = ''` sigue contando como volcado (0 filas hoy).

📊 **Y qué ramos son esas 110** — medido el 03/09/2026 con la regla de dos brazos (`polizas.tipo`):
**81 auto · 19 hogar · 9 responsabilidad civil · 1 moto**. O sea, la correduría hoy es *auto* con
una cola de hogar y RC — que es exactamente el orden en que conviene tener listos los ramos para
tarificar. Cuenta los ramos con esta consulta antes de citar la cifra: la moto se cuela fuera de
los «tres ramos» de los que se habla en las reuniones.

Consecuencia para el código: **las pólizas del volcado histórico (con `import_ref` y SIN
`eiac_xml_hash`) NO generan recordatorios** — serían 28.728 avisos de «se te venció» sobre pólizas de
hace ocho años. Diseño completo en
`docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md`.

🚨 **Schema `seguros` vacío ≠ la correduría no tiene datos.** Es la trampa que esta app
tiene que evitar por diseño: el dashboard **no pinta KPIs a 0** mientras no haya migración
—diría «no tienes clientes» sobre una cartera viva—. Dice «pendiente» y dónde mirar
mientras tanto. El estado sale de `lib/estado-migracion.ts`, un helper puro con **tres**
salidas (`error` / `no migrado` / `migrado`), nunca dos.

## 🖥️ ESTA APP NO ES UNA PANTALLA — la pantalla de Alberto es `plataforma` (01/09/2026)

> Dictado por Alberto: *«asegura hay que meterlo en correduría, yo solo uso UNA página; es un proyecto
> vertical y yo tengo mi pantalla con todos mis negocios».*

**`apps/plataforma` → `/correduria` es la ÚNICA pantalla que Alberto abre.** La correduría es un
negocio más de su casa de marcas, al lado de los pisos, el trading y la banca. `apps/asegura` es la
**trastienda**: tiene la conexión a la cartera (`ASEGURA_DATABASE_URL`, rol `central_asegura`) y es la
única que gasta dinero (`POST /insurances`, 0,50€), pero **no se entra a ella a trabajar**.

| | `apps/plataforma` (la pantalla) | `apps/asegura` (la trastienda) |
|---|---|---|
| Quién entra | Alberto, todos los días | nadie de forma habitual |
| Qué hace | ver: cartera, renovaciones, ficha del cliente, comisiones | leer la BD, servirla por el puerto, retarificar |
| Cómo lee | puerto HTTP `/api/operador/*` (Bearer) | Prisma contra ASEGURA-prod-eu |

🚨 **Consecuencia para el código: una pantalla nueva de la correduría se monta en `plataforma` y su
dato se sirve por un endpoint de `/api/operador/*`.** El 01/09/2026 se construyó una lista de
renovaciones en ESTA app (`/cartera/renovaciones`) sin darse cuenta de que `plataforma` ya tenía la
suya —la que Alberto mira— desde el 31/08. **Se BORRÓ el mismo día**, y con ella su entrada del menú.

Lo que SÍ vive aquí y no puede vivir allí, que es lo ÚNICO que queda: **retarificar** (gasta 0,50€
reales, y por eso está tras su propia sesión y su propia pantalla de confirmación) y **subir una
póliza** para que el agente la lea. Desde `plataforma` se salta aquí con un enlace ↗ solo para eso.
El resto de `/cartera` (buscar, ficha) sigue vivo como respaldo del corredor, pero **no crece**.

## Arquitectura

- **BD:** compartida `wswbehlcuxqxyinousql`, schema **propio `seguros`** (patrón iarest/rrhh,
  no prefijo de tablas en `public`). Rol **`prisma_seguros`** — existe, `BYPASSRLS`, y hoy
  **sin contraseña** (inerte). Cimientos en `prisma/sql/2026-08-19_asegura_bootstrap.sql`.
  Prisma usa `multiSchema` porque `cuentas` vive en `public` y el resto en `seguros`.
- **Auth:** cookie propia `asegura_session` + `jose` contra `public.cuentas`, como el resto
  de la casa (`apps/mariscos` es el molde). Secreto `ASEGURA_SESSION_SECRET`, **sin fallback
  a literal en producción** (lo obliga `test/regression-secrets.test.ts`).
  ⚠️ **Consecuencia deliberada:** el CRM de Manuel apoya su aislamiento en **86 políticas RLS
  que se resuelven TODAS por `auth.uid()` de Supabase Auth**. Al re-plataformar la auth esas
  políticas se quedan sin sujeto y, con `prisma_seguros` en BYPASSRLS, **el efecto no es
  “no se ve nada” sino “se ve todo sin que falle nada”**. El aislamiento pasa a ser
  responsabilidad del CÓDIGO de esta app: la regla a reproducir es **«un cliente solo ve lo
  suyo»** (hoy son 2 fichas de 32.600), no el andamiaje multi-tenant.
- **🛡️ Ámbito de correduría (27/08/2026) — la puerta ÚNICA a los datos de `seguros`.**
  `lib/tenant-ambito.ts` es lógica **pura, sin BD** (probable sin Prisma ni red) y `lib/tenant.ts`
  el envoltorio. **Tres estados, nunca dos:**
  - `pendiente` → el schema está vacío: **no se sabe** a qué correduría pertenece la cuenta,
    porque la tabla que lo dice aún no existe. **No es** «no tiene ninguna».
  - `sin-asignar` → migrado y sin vínculo. Esto **sí** es una ausencia comprobada.
  - `ok` → hay `correduriaId` y **toda** consulta filtra por él.

  `migrado: false` devuelve `pendiente` **aunque venga un `correduriaId`**: antes del volcado ese
  valor no es fiable. Los valores de cajón (`''`, `'otro'`, `'desconocido'`, `'N/A'`,
  `'sin asignar'`) se tratan como **ausencia** — la lección de `subastas.tipo_bien`.
  `exigirCorreduriaId()` **lanza**; no existe rama «devuelve algo por si acaso», porque un id
  inventado no da error: da los datos de otro.

  🚨 **Al añadir modelos de `seguros`: toda consulta pasa por aquí.** Lo vigila
  `test/regression-asegura-aislamiento.test.ts` (en `pnpm test:guardia`), que falla si un fichero
  de esta app toca `seguros.*` sin importar `lib/tenant`. El cepo está **verificado**: se probó con
  un fichero infractor y saltó.

  ⚠️ Esto protege lo que escribamos nosotros; **no adivina lo que trae el dump**. Sigue abierta la
  pregunta a Manuel de si el CRM de origen filtraba por `correduria_id` en el código o lo delegaba
  todo en RLS — de eso depende que esa columna venga con datos fiables.
- **Vercel:** proyecto propio, Root Directory `apps/asegura`. `vercel.json` lleva su
  **`ignoreCommand` obligatorio** con `--sin-previews`.
- **Dinero:** `lib/dinero.ts` → `eur()`, formato español `2.162,49€`. `null` devuelve `—`,
  nunca `0,00€`.

## Envs
`DATABASE_URL`, `DIRECT_URL` (rol `prisma_seguros`; **desde el 02/09/2026 también es la conexión de la
CARTERA**, con `?schema=seguros` que añade `lib/asegura-url.ts`), `ASEGURA_SESSION_SECRET`.
⚠️ **Contraseña de `prisma_seguros` ROTADA el 02/09/2026 a las 10:17 UTC** (`ALTER ROLE`, verificador
SCRAM): la que llevaba `DATABASE_URL` en Vercel la rechazaba el pooler (8 `password authentication failed`
en `supavisor_logs` entre 07:31 y 10:06, y `/correduria` en plataforma pintaba «no puede leer su BD»). Dos
lecciones medidas: (1) el pooler **cachea las credenciales unos minutos**: justo tras un `ALTER ROLE …
PASSWORD` sigue rechazando la nueva aunque el host directo `db.<ref>.supabase.co:5432` ya la acepte — espera
2-3 min antes de diagnosticar; (2) el puerto `/api/operador/*` devuelve ahora `causa`
(`credenciales|permisos|conexion|esquema|sin_correduria|otro`, `lib/error-cartera.ts`) y la registra en
el log SIN la URL, así que la pantalla de plataforma dice la causa sin ir a los logs del pooler.
**Camino de vuelta al origen (solo con `ASEGURA_FUENTE=origen`):** `ASEGURA_DATABASE_URL` — rol `central_asegura`
(SELECT-only + BYPASSRLS) contra el Supabase congelado de Manuel por el pooler :6543 de eu-central-1; la URL la
normaliza `lib/asegura-url.ts` (añade `pgbouncer=true` solo). `ASEGURA_OPERADOR_SECRET` — Bearer del
puerto `/api/operador/resumen` (MISMO valor en el proyecto Vercel `plataforma`). El proyecto sirve
desde `fra1` (`regions` en vercel.json) para no cruzar el Atlántico hacia la BD.
Las de las integraciones (CIMA/EIAC, Codeoscopic, WhatsApp) llegan con la transferencia del
proyecto de Vercel de Manuel — **no se piden por mensaje**.

🔑 **`PII_ENCRYPTION_KEY` y `PII_LOOKUP_KEY` — las DOS claves de datos personales, copiadas a
`central-asegura` el 02/09/2026 (a mano por Alberto, desde Vercel `asegura`; nombres confirmados en el
código del CRM: 92 y 40 usos).** Sin la primera, teléfono/email/DNI/dirección salen «cifrado»; sin la
segunda, buscar por DNI/teléfono/email devuelve vacío SIN error. Reglas medidas ese día:
- **Tienen que ser EXACTAMENTE las mismas que en el proyecto Vercel `asegura`** (el CRM cifra al ingerir
  CIMA y central lee): 64 hex cada una. Compartir la clave no es opcional mientras las dos apps escriban y
  lean la misma base; el día que central ingiera CIMA por su cuenta, se apaga el CRM y la clave vive en un
  solo sitio.
- 🚨 **Una variable nueva NO se aplica hasta el Redeploy.** Se añadió, se recargó la ficha, seguía
  «cifrado»: faltaba redesplegar. Y **nunca pulsar «Rotate Variable»** en Vercel: genera un valor nuevo y
  toda la cartera cifrada queda ilegible en el acto.
- La marca «Needs Attention» de Vercel en `asegura` es SU aviso «parece un secreto y es visible: guárdala
  como Sensitive», no una fuga ni la cadencia de 90 días del runbook de Manuel (eso es otra cosa, y sigue
  pendiente). ⏸️ **Rotación = tarea aparte con ventana**: el cifrado `v1:` es de clave única
  (`packages/module-seguros-pii`), así que rotar exige un job que descifre con la vieja y recifre con la
  nueva todas las columnas PII de `seguros` y cambiar las DOS Vercel en el mismo minuto.
- **La ficha dice POR QUÉ no descifra:** `lib/pii-estado.ts` (`estadoClavePii`, puro, 5 tests) prueba la
  clave contra el teléfono/email de la propia ficha y `/api/operador/cliente` lo manda como `pii.clave`
  (`ok` · `sin_clave` · `mal_formada` · `no_abre` · `sin_muestra`); plataforma lo pinta al lado de
  «cifrado». Antes los tres `descifrar()` se tragaban el error y «sin clave», «mal pegada» y «clave
  distinta» se veían idénticas. Nunca viaja ni se registra el valor de la clave.

## 🔗 La cadena de CIMA: cinco sistemas, no uno (confirmado por Manuel, 26/08/2026)

La descarga de las compañías **no es un cron nuestro ni un SFTP**. Es una cadena, y cada eslabón la corta:

```
GitHub Actions (cron 5:30 y 11:30)
  → HTTPS + Bearer CRON_SECRET
    → app.grupoasegura.com/api/crons/cima-pull   (esta app, Next.js en Vercel)
      → asegura-app-cima-adapter.fly.dev         (Fly.io, Java/Spring Boot)
        → JAR oficial de TIREA · SOAP WSE v2.17
          → Mapfre C0058 · Allianz C0109 · Generali C0072 · Occident C0468 · Reale C0613
```

- **El adaptador de Fly NO vive en este monorepo** (es Java) y no debe intentar meterse: es un servicio
  aparte con su propio repo. Las **credenciales de TIREA son secrets de Fly**, no envs de Vercel.
- 🚨 **`CRON_SECRET` no viaja al transferir el repo.** Si falta, el cron dispara, el endpoint responde 401
  y **CIMA deja de traer datos sin que nada falle a la vista**. Es el fallo más caro y más silencioso:
  la app sigue en pie y solo se nota porque «hoy no ha entrado nada».
- 🔴 **Hay DOS claves de datos personales en las env vars, y fallan distinto** (confirmado por Manuel):
  - **Cifrado de valores** (IBAN, DNI…): si se pierde, los datos quedan **ilegibles para siempre**.
    Falla ruidoso — se nota.
  - **Índice ciego** (buscar por email/DNI sin descifrar): si cambia, los datos siguen legibles pero
    **dejan de encontrarse**. 🚨 **Falla en SILENCIO**: la búsqueda no da error, devuelve vacío, y la
    pantalla dice «no existe ese cliente» sobre uno que está ahí. Es la regla «dato que NO hay ≠ dato
    que NO se ha mirado» metida en la capa de búsqueda, donde no hay NULL que la delate.

  Por eso la verificación son **dos** pruebas, no una: **descifrar** un registro real **y buscar** un
  cliente conocido por email y por DNI. Rotar el índice ciego obliga a **recalcular los 32.600**, y
  mientras dura ese recálculo las búsquedas mienten.
- 💶 **Lo que CIMA ya deja parseado (medido 01/09/2026):** `cuenta_efectivo` (comisiones, retención,
  remesa por periodo), `liquidaciones` y `poliza_recibos` (`prima_neta`, `comision_bruta`,
  `comision_liquida`, `situacion`). Con eso se calcula la comisión **esperada** y hasta el **% por
  compañía y ramo**. ⚠️ **La cobertura es desigual:** Mapfre `C0058` manda recibos pero **ninguna
  liquidación**; Allianz `C0109` manda las dos; Occident `C0468` lleva meses en **saldo deudor**;
  Reale `C0613` se adhirió el 01/09/2026; Generali sigue sin acceso. Un total de comisiones que no
  diga qué compañías faltan es una cifra falsa. Diseño del control en
  `docs/superpowers/specs/2026-09-01-comisiones-renta-control-design.md`.
- **Ficheros en Vercel Blob** (privado, URLs firmadas; hoy ~4). Los EIAC de CIMA **no se guardan como
  fichero**: se parsean a tablas.
- **Codeoscopic — LA fuente de tarificación y EMISIÓN de pólizas nuevas (01/09/2026):** Avant2 Sales
  Manager operativo a nombre de ALBERTO (no de Manuel) desde 09/06; compañías vivas Reale y Fidelidade,
  claves entregadas de Mapfre/Allianz/Occident; DPA art. 28 firmado. La integración API de la web quedó
  EN SANDBOX (jun/2026, contacto juan.fernandez@codeoscopic.com) sin cerrar la batería
  Quote→preemisión→Submit→webhook — por eso el código de emisión sigue **tras un flag que nunca se
  activó** y sus tablas están vacías. No es un bug; es una validación sin terminar.
  ⚠️ **Condición para encender ese flag algún día:** el envío es idempotente por dentro
  (`submit_in_flight_at` es un candado, `submit_attempt_id` una UUID para reconciliar) pero **NO de
  punta a punta**: Codeoscopic no deduplica por nuestro `attempt_id`, así que un reintento tras una
  respuesta perdida puede crear un duplicado en su lado. Antes de activarlo hay que probarlo en serio:
  **mandar el mismo `attempt_id` dos veces y ver si ellos deduplican.**

## 💶 Tarificación Codeoscopic — el cliente y su tope (01/09/2026)

`lib/codeoscopic/` es la ÚNICA puerta por la que esta app gasta dinero: **cada `POST /insurances`
cuesta 0,50€ reales** y las credenciales que hay puestas son de **PRODUCCIÓN** (no hay sandbox
utilizable). Reglas que no se negocian al tocar esto:

- **Arranca APAGADO.** Sin `CODEOSCOPIC_TARIFICACION_ACTIVA=true` no sale ni una petición facturable.
- **Estrena por la sonda, no por una cotización:** `GET /api/operador/codeoscopic/sonda` pide solo el
  token OAuth2 (gratis) y corre con el interruptor apagado. Un fallo de conexión apunta al HOST
  (`CODEOSCOPIC_BASE_URL` = `https://api.codeoscopic.io`); un rechazo, a las credenciales.
- 🚨 **El contador es persistente (`seguros.codeoscopic_consumo`), nunca en memoria.** En Vercel un
  contador en memoria se reinicia en cada cold start: sería un tope de mentira.
- 🚨 **Una cotización sin desenlace CUENTA como gastada.** Solo `descartado` libera cupo, y exige
  evidencia (auth, validación, o fallo de red *anterior al envío*). Un **timeout no es evidencia** —
  la llamada tarda hasta 150 s y el proyecto puede haberse creado. Es la regla NULL≠0 aplicada al
  dinero, y la BD lo fuerza con un CHECK (`descarte_con_evidencia`).
- **Sin libro no se cotiza.** Si la lectura del contador falla, se aborta: un tope que no se puede
  comprobar no es un tope.
- **Un solo intento.** `POST /insurances` no es idempotente: reintentar crea otro proyecto y otro
  cargo. La única repetición permitida es re-pedir el token tras un 401 (el vendor no tarificó).
- **Los precios se pintan con su FIRMEZA.** En el fixture del sandbox ninguno de los 18 era firme, y
  en la cotización REAL del 29/07/2026 **los 15 precios son `estimado`, ni uno en firme** (medido en
  `codeoscopic_prices` el 01/09). Dos muestras de dos: el precio con reservas es el caso general, no
  el borde. Enseñar la prima sola promete algo que la compañía no ha cerrado.
- ⚠️ **`expires_at` llegó a NULL en los 15 precios reales: no sabemos cuánto vale una cotización.**
  Mientras siga así, **un precio ya pagado NO se puede reutilizar** para ahorrarse los 0,50€ — no hay
  forma de saber si sigue vigente. Capturar la caducidad es requisito de cualquier plan de caché.
- 🔬 **El webhook está SIN ESTRENAR, no roto.** Los dos eventos con `project_not_found` de la BD de
  Manuel son smoke tests con ids inventados (`999999`, `smoke-fix-webhook`); Codeoscopic no ha
  enviado nunca uno real, porque solo los dispara al emitir. No se pierda tiempo «arreglando» eso.

### El cuerpo de la petición se valida GRATIS antes de gastar

`lib/codeoscopic/peticion-auto.ts` construye el `CreateInsuranceRequest_V1` de auto y, sobre todo,
lo **revisa antes de llamar**: un cuerpo mal formado devuelve un 400 que ya se ha pagado, así que
cada regla conocida del vendor se comprueba aquí. `revisarDatosAuto()` devuelve TODOS los reparos a
la vez (para que la UI los pinte juntos) y `construirPeticionAuto()` lanza si queda alguno.

Las tres reglas que más cotizaciones tumban, todas con test:
- **La misma persona va en `holder`, `risk.owner` y `risk.primaryDriver`, e IDÉNTICA.** El vendor
  cruza por DNI y rechaza si un campo difiere; tampoco deja omitir ninguno. Por eso se construye
  una vez y se reutiliza el mismo objeto.
- **La dirección viaja solo con sus DOS mitades** (CP + id de municipio). El municipio es un ID del
  catálogo, nunca un nombre.
- **`lastFiveYearsAccidents` es obligatorio si los años sin siniestros son < 5 y no coinciden con
  los años asegurado.** Es la condición anidada que se incumple sin enterarse. Ojo: `0` siniestros
  es una respuesta válida, no un hueco (regla NULL≠0).

Y lo que NO se manda, a propósito: email, calle, ocupación, situación laboral y país de nacimiento.
No hacen falta para el precio.

### 🔘 El botón «Retarificar» sobre la cartera real (01/09/2026)

`/cartera` → buscar cliente → su ficha → **Retarificar** en una póliza de auto. Es la forma en que
Alberto quiere estrenar esto: **primero a mano, sobre clientes de verdad**, y automatizar después.

- **Solo un clic gasta**, y lo dice: `POST /api/cartera/polizas/{id}/retarificar`. Todo lo demás de
  `/api/cartera/*` es gratis. Lo vigila `test/regression-asegura-gasto-codeoscopic.test.ts`, que
  además prohíbe exponer un `GET` que cotice (un prefetch del navegador dispararía el cargo) y
  hacer un `POST` al vendor sin pasar por `cotizar()`. **Cepo verificado**: se le añadió un `GET`
  a la ruta y saltó.
- 🚨 **`lib/codeoscopic/desde-cartera.ts` devuelve TRES cosas, no una**: lo que se manda, lo que se
  ha **supuesto** y lo que **falta**. Un valor por defecto es indistinguible de un dato real en
  cuanto se escribe en el formulario, así que la pantalla enseña los supuestos ANTES del botón y
  otra vez AL LADO del precio. Los supuestos tiran **a la baja** (menos años asegurado ⇒ más caro)
  para que la precalificación no prometa una prima que luego suba.
  - **Excepción, y es decisión de negocio de Alberto:** se presume que **no ha habido siniestros**.
    Va marcado como `optimista` porque cero filas en `siniestros` no prueba que no los haya. De
    regalo, al igualar `aniosSinSiniestros` con `aniosAsegurado` se esquiva el 400 (ya pagado) que
    exige el detalle de siniestralidad.
  - **NUNCA se supone un dato personal** (DNI, nombre, nacimiento, teléfono, carnet, sexo): eso
    serían datos falsos de una persona real. Los teclea el corredor. Hay test que lo fija.
- **Lo que la ficha SÍ da y ahorra teclear:** la póliza actual pasa a ser la «anterior» de la
  cotización — número, **código DGS de la compañía** y antigüedad salen de ella, que es de donde
  viene el bonus.
- **El vehículo hay que elegirlo**, y no es un fallo. ⚠️ **Corregido el 02/09/2026:** aquí ponía que
  las 80 pólizas de auto vivas «traen matrícula y NADA más — ni marca, ni modelo, ni año», y es
  **falso en la mitad**. Medido sobre `seguros.polizas` (las **81** de auto vivas con la regla de dos
  brazos; la 81ª comprobada aparte el 03/09/2026 y se comporta igual): las **81/81 traen
  matrícula, marca Y modelo** (`FORD / TOURNEO COURIER`, `CITROEN / XSARA PICASSO`…). Lo que NO trae
  **ninguna** es **versión ni año** (0 de 81), y la versión es justo lo que pide el tarificador. Así
  que la conclusión operativa no cambia —hay que bajar al catálogo de Codeoscopic
  (marca→modelo→versión), que es **gratis**, mientras que buscar por matrícula cuesta créditos—
  pero **se entra ya en el tercer escalón**, no en el primero: marca y modelo se traen de la ficha
  y solo se pregunta la versión. La fecha de matriculación sí sale sola de la matrícula, gratis, y
  es **aproximada**.
  La lección de método es la de siempre en este repo: antes de escribir «no lo trae», mirar la
  columna. Aquí «no lo he sabido leer» viajó 24 horas disfrazado de dato medido.
- **Centinelas del CRM:** 20.860 fichas se llaman literalmente «Lead». `desde-cartera.ts` los trata
  como ausencia — mandar «Lead» como nombre de pila sería basura con forma de dato.
- **El sexo sale del campo `saludo`** (`'1'` = hombre, `'2'` = mujer; validado contra los nombres de
  pila más frecuentes de las 32.600 fichas). El `'3'` **no se traduce**: se pregunta.

✅ **Hecho el 01/09/2026:** la tabla `seguros.codeoscopic_consumo` ya está **creada en la BD**
(con sus dos CHECK: `descarte_con_evidencia` y `cierre_coherente`).

Pendiente para el primer smoke real (0,50€, solo con OK explícito de Alberto): poner contraseña al
rol `prisma_seguros`, encender `CODEOSCOPIC_TARIFICACION_ACTIVA=true` y redesplegar.

### 🧭 EL PRINCIPIO: presupuesto rápido, verificación al emitir (Alberto, 01/09/2026)

> *«Tenemos que tener todas las opciones posibles, pensando que presupuesto = lo más fácil y
> rápido; y ya en caso de cuadrar al cliente, nos centramos en que todos los datos estén bien.»*

**Dos fases con exigencias OPUESTAS**, y confundirlas es el error a evitar:

| | Fase 1 — PRESUPUESTO | Fase 2 — EMISIÓN |
|---|---|---|
| Ante un dato que falta | Se **supone y se marca** | Se pide y se verifica |
| Ante dos caminos | El más rápido | El más fiable |
| Cuándo | Siempre | **Solo si el precio le cuadra al cliente** |

Es negocio, no preferencia técnica: la mayoría de presupuestos no acaban en póliza, y pedir DNI y
ficha técnica a quien solo quería un precio pierde al cliente antes de tener la oportunidad.

Tres consecuencias que SÍ afectan al código:
1. **Ningún dato puede tener un solo camino.** Para la versión del vehículo hay cuatro, de más
   rápido a menos: (1) lo que ya traiga la ficha en texto — 1.325 pólizas, **pero NINGUNA de las 80
   vivas**; (2) foto de la ficha técnica; (3) **catálogo a mano, que es lo construido**; (4)
   matrícula por créditos. Por eso el 3 era el primero que había que hacer.
2. **La fase 1 no se bloquea por un dato**: solo para en lo que no se puede inventar sin mentir
   (datos personales y vehículo).
3. 🎯 **Al pasar a fase 2, los `supuestos` que devolvió la precalificación SON la lista de tareas**
   de verificación, con los `optimista` en cabeza. No hay que inventar un checklist: ya está
   calculado.

### 📸 Lo siguiente: alta por fotos, bonificadores y el ramo de HOGAR

Diseño completo en `docs/superpowers/specs/2026-09-01-asegura-alta-por-fotos-y-bonificadores.md`.
Sin implementar; lo que sigue es lo que NO hay que volver a investigar:

- 🚨 **La ficha técnica SÍ trae la versión: campo `D.2`** (tipo homologado + código de variante +
  código de versión), más `K` (homologación). Se creía que solo traía la marca — **falso**. Pero
  `D.2` son códigos de homologación EUROPEA, **no Base7**, así que sigue habiendo emparejamiento:
  se filtra el catálogo por `D.1` marca → `D.3` denominación comercial → `P.1` cilindrada +
  `P.2` potencia + `P.3` combustible + `B` año. **Con 2 o más candidatos NO se elige: decide una
  persona.** Es la misma regla que ya aplica `emparejar()`.
- **Una BD de matrículas gratis no existe y tampoco resolvería esto:** los datos abiertos de la DGT
  van anonimizados (sin matrícula), el resto es de pago, y cualquiera devolvería TEXTO, no el código
  Base7. **La foto de la ficha técnica es mejor fuente**: trae cilindrada y potencia exactas.
- 🎯 **SINCO (= fichero SIHSA de TIREA)** es el bonificador de verdad: historial de siniestralidad de
  los **últimos 5 años** —justo la ventana de `lastFiveYearsAccidents`— consultable **al tarificar**.
  ⚠️ Se ofrece a **«Entidades Aseguradoras»**, y una correduría NO lo es: **no está confirmado** que
  Grupo ASegura pueda consultarlo (preguntar a TIREA, `accesos.cima@tirea.es`, que ya hay relación
  por CIMA). Lo que SÍ está claro es que **el asegurado puede pedir el suyo gratis**. Y asúmelo: la
  compañía lo consulta igual al emitir, así que la siniestralidad presumida **se corrige sola** — por
  eso el aviso «puede abaratar el precio» no es cosmético.
  ⚠️ No verificado contra `tirea.es`: el proxy lo bloquea por política de la organización.
- ✅ **Catastro para HOGAR, HECHO el 02/09/2026 (en plataforma, `/correduria/hogar`):** con la dirección
  o la referencia catastral salen m², año, uso y CP del Catastro (`@central/core-catastro`, paquete
  extraído de subastas). Verificado con el 2º-14 de San Vicente 40: 76 m²/1994, lo mismo que la póliza
  del CRM. ✅ **`GET /insurance-lines` HECHO** (`lineasDeSeguro()` + `hogarDisponible()` en
  `lib/codeoscopic/catalogos.ts`, puerto `/api/operador/codeoscopic/lineas`, gratis, con el interruptor
  apagado; `/correduria/hogar` en plataforma lo pinta con tres estados).
  ✅ **Retarificar HOGAR, cableado el 02/09/2026 (Alberto: «quiero probar con algún hogar de José Suárez
  Salas»).** Mismo patrón que auto, ramificado por `origen.tipo` en `/cartera/poliza/[polizaId]` y en su
  `POST …/retarificar`: `lib/codeoscopic/peticion-hogar.ts` (`revisarDatosHogar` gratis antes de gastar,
  `construirPeticionHogar(d, lineaId)` — **el id del ramo viene SIEMPRE de `/insurance-lines`, nunca se
  escribe a mano**), `desde-cartera-hogar.ts` (precalificación con TRES procedencias del riesgo: póliza,
  **gemela** del volcado o Catastro, cada una rotulada; los capitales viejos van como supuesto `optimista`;
  nada personal ni ningún capital se inventa), `persona.ts` (el tomador es la MISMA proyección que en auto,
  sin carnet) y los 10 catálogos `/home/*` (`catalogoHogar()`, gratis). Quién puede retarificar y por qué
  ramo lo decide **un solo helper**, `retarificabilidad()` de `@central/module-seguros` (antes la misma
  expresión estaba copiada en tres sitios): hogar exige m² + año + CP en la póliza O en su gemela.
  ✅ **El contrato del `risk` de hogar (`HomeRisk`) está VERIFICADO desde el 02/09/2026 (noche):** salió del
  snapshot MHTML del portal que Alberto subió el 01/09 (se decodificó entero; la tabla completa está en
  `docs/CODEOSCOPIC-API-PORTAL.md` § Hogar). El vendor exige **mucho más de lo que guarda la ficha**:
  calle con tipo de vía/nombre/número (`/road-types`), habitaciones, nueve catálogos (no tres), puerta
  blindada / ventanas / urbanización cerrada, límites de joyas y objetos de valor y perros peligrosos. Todo
  lo que la ficha no tiene se **supone conservador y se declara uno por uno** (`desde-cartera-hogar.ts`:
  habitaciones por m², protecciones a `false`, joyas/perros a 0 marcados `optimista`; la dirección se trocea
  con `partirDireccion`), y los desplegables se preseleccionan con los ids del ejemplo del portal
  **solo si el catálogo vivo los trae** (`DEFECTOS_HOGAR` + `elegirDefecto`). ⚠️ Dos nombres engañan: `use`
  es el RÉGIMEN (propietario/inquilino, `/home/uses`) y `occupancy` el USO (habitual/segunda,
  `/home/occupancy-types`); nuestro `uso` va a `use` y `ocupacion` a `occupancy` porque cada uno bebe de su
  catálogo. Un 400 de validación **no se cobra**; la pantalla enseña el mensaje entero. Caso de prueba: las
  dos de Occident vivas de J.S.S. (el riesgo está solo en la gemela; la de Sevilla es la verificada con el
  Catastro: 76 m² / 1994 / 41002). Por cablear: `POST /home/recommend-limits` para no teclear capitales a ojo.
- **Siguiente ramo: HOGAR** (2º más vendido, y más fácil: no hay vehículo que identificar, así que
  desaparecen el código Base7, el emparejamiento y los créditos). Primer paso y **gratis**:
  `GET /insurance-lines` dice si hogar tarifica para nuestra organización — no hay que preguntárselo
  a nadie por email.
- 🚨 **RC NO tiene ramo en Codeoscopic (02/09/2026, catálogo oficial de Integra que pasó Alberto).**
  La matriz del fabricante tiene siete columnas —autos, hogar, motos, decesos, vida, salud y
  complementarios— y **responsabilidad civil no está en ninguna**, igual que el portal solo publica
  catálogos `/car`, `/motorcycle`, `/home`, `/term-life`, `/health` y `/burial`. Son **9 pólizas
  vivas (8 activas)** para las que `retarificabilidad()` dice «hoy solo se retarifica auto y hogar»:
  ese «hoy» **no es un todavía**, no hay endpoint que cablear. Se llama a la compañía.
  **Moto sí existe** (12 de las 18 compañías) y no la tarificamos — 1 póliza, así que no corre prisa.
  Cruce entero con la cartera y la matriz completa en `docs/CODEOSCOPIC-API-PORTAL.md`. ⚠️ Ese
  catálogo es comercial y **no dice qué tiene abierto Grupo ASegura**: eso sigue siendo
  `GET /insurance-lines`, y se nota en que **Fidelidade —viva para nosotros— ni sale en él**.

## 🗂️ La ficha de cliente — diseño hecho, y el hueco de los documentos (01/09/2026)

Rediseño completo en `docs/superpowers/specs/2026-09-01-asegura-ficha-cliente-design.md` (maqueta
visual: https://claude.ai/code/artifact/22b57a16-739c-4e45-bd9d-9e494275aeda). Inventario de qué
hay detrás de cada pantalla, en `.claude/skills/agente-correduria/references/sector.md` §8.

La ficha es **un índice, no un expediente**: tres profundidades (ficha → lista → dato), contadores
**con estado** (no se entra si el contador está en calma) y maestro-detalle en escritorio, donde
no se navega sino que se expande.

🚨 **Documentos: hacen falta en tres sitios y solo uno tiene tabla.** Cero ficheros en TODO el
sistema (las cuatro tablas a 0, `polizas.documento_url` 0%, `storage.objects` vacío):
- **`cliente_documentos` NO EXISTE** y `poliza_documentos.poliza_id` es `NOT NULL` → un DNI habría
  que colgarlo de una póliza cualquiera, y a un **lead sin póliza** no se le puede adjuntar nada.
- **`siniestro_documentos` NO EXISTE** — y es donde más papel se mueve; con tramitador y reserva al
  0%, las fotos serían lo único que habría de un siniestro.
- `poliza_documentos` sí está, con **`visible_por_cliente`** ya previsto (el interruptor del portal).
- `bien_documentos` es la mejor pensada (tipo cerrado: ficha técnica, permiso de circulación,
  título de propiedad…) porque **el permiso es del coche, no de la póliza**. Pero
  `bienes_asegurables` **no tiene `poliza_id`**: esos papeles no se ven desde la póliza de ese coche.

Y falta el estado **«pedido pero no recibido»**: sin él, «0 documentos» no distingue no habérselo
pedido de que el cliente no lo mande. Es la regla de `CLAUDE.md` aplicada al archivo.

✅ **HECHO el 02/09/2026 (tarde), en cuanto la cartera estuvo en casa: tabla PROPIA `seguros.documentos`.**
Una tabla para los tres sitios (cliente | póliza | siniestro: tres FKs opcionales y un CHECK de «colgado de
algo»), con **`estado` pedido / recibido / revisado** — `pedido` es una fila SIN fichero, y así «0 documentos»
deja de confundirse con «se lo pedí y no lo ha mandado». El fichero va en **`contenido bytea` (≤ 10 MB)** dentro
de la misma BD, a propósito: son PDFs/fotos de ~100 clientes y así lo gobierna el mismo rol que la cartera, sin
cubo de Storage ni claves nuevas en Vercel (si algún día pesa, se saca a Storage y la columna queda a NULL).
SQL en `prisma/sql/2026-09-02_seguros_documentos.sql` (aplicada como migración `seguros_documentos`; los
cuatro CHECK probados en la BD real en un bloque con rollback). `poliza_documentos` del CRM se deja intacta
(0 filas) y se suma al contador de la póliza.
- **Lógica pura** en `@central/module-seguros/documentos.ts` (5 tests): tipos, `revisarDocumento()` (PDF/foto,
  ≤10 MB), `resumenDocumentos()` con TRES estados (`sin_consultar` ≠ `ninguno` ≠ `ok`) y
  `documentosQueFaltan()` sobre `NECESARIOS_EMISION_AUTO` (DNI, permiso, ficha técnica) — un `pedido` sigue faltando.
- **`lib/cartera-documentos.ts`**: `resolverDestino()` comprueba que cliente/póliza/siniestro son de ESTA
  correduría antes de escribir (con BYPASSRLS un id ajeno no falla: da los datos de otro); las listas devuelven
  `null` si la consulta falla, nunca `[]`; el fichero solo lo trae `leerDocumento()` de uno en uno.
- **Puerto**: `GET/POST /api/operador/documentos` (lista · multipart guarda · json `{pedir:true}` anota) y
  `GET/PATCH/DELETE /api/operador/documentos/[id]` (bytes · revisar · borrar). La ficha (`/cliente`) trae
  `documentos` y la póliza (`/poliza`) `listaDocumentos`. La pantalla está en plataforma (`Documentos.tsx`).
- `/cartera/subir` (leer la póliza con IA) sigue aparte y sigue SIN guardar: leer y archivar son dos botones.

## 🔌 El puerto que sirve la pantalla de plataforma (01/09/2026)

> 📘 **Visión y orden de trabajo del CRM de la correduría: `docs/CORREDURIA-CRM-VISION.md`** (dictado de
> Alberto, 02/09/2026; skill router `correduria-crm`). Léelo antes de añadir pantallas o escrituras.

Cuatro endpoints nuevos en `/api/operador/*` (Bearer `ASEGURA_OPERADOR_SECRET`, read-only, gratis):

- **`GET /clientes?q=`** — buscador por nombre y apellidos. `buscado:false` cuando el término tiene
  menos de 3 letras: eso NO es «no hay nadie».
- **`GET /cliente?id=`** — la ficha entera de una vez (pólizas + recibos + siniestros + contacto +
  **intervinientes** + **pago**: periodicidad, forma de cobro y recargo por fraccionar con 3 estados), para que `plataforma` no encadene tres llamadas. Cuatro estados: `sin_configurar` ·
  `error` · **`no_encontrado`** (se miró y no está) · `ok`. Los dos primeros NO se colapsan con el tercero.
  🚨 **`intervinientes` (02/09/2026): «sin teléfono» en el tomador NO es «no hay a quién llamar».**
  Esquiansa (empresa) no tiene teléfono; su `conductor_habitual` —dueño del coche— sí, en su propia
  ficha enlazada por CIMA. Medido sobre las 109 vivas de entonces: **81 traen intervinientes** (95 filas: 67
  propietario, 21 conductor habitual, 5 asegurado, 1 contacto, 1 ocasional), **14 enlazados a OTRA
  ficha** distinta del tomador, y de los 25 tomadores vivos sin teléfono **6 lo tienen en un
  interviniente**. Nombre/teléfono/email del interviniente van cifrados (95/95); si su fila no trae
  teléfono se lee el de la ficha enlazada. `leerIntervinientes` devuelve **`null` si la consulta falla**
  (no `[]`: eso diría «no hay nadie más»). Quién se llama lo decide `contactoEfectivo()` de
  `@central/module-seguros` (puro, 9 tests): ficha del tomador primero; si no, **su propio dato colgado
  de la póliza**; y solo después el primer interviniente ajeno por prioridad de rol (contacto >
  conductor habitual > propietario…), y la pantalla dice DE QUIÉN es.
  🚨 **Corregido el 04/09/2026: hasta ese día `contactoEfectivo` DESCARTABA los intervinientes del propio
  tomador** (`.filter(i => !i.esTomador)`), suponiendo que su contacto ya venía en la ficha. Falso: CIMA
  trae el email en la fila del interviniente y nadie lo copia — le pasa a `MORALES ISABEL MALDONADO`
  (propietario, origen CIMA) y a `Juan Manuel Duran Ibañez`, a los dos la ficha les decía «sin email»
  teniéndolo la base. Ahora `viaTelefono`/`viaEmail` tienen un valor propio, **`tomador_en_poliza`**, que
  la ficha pinta como «📇 en su póliza, no en su ficha»: es SUYO, no de un tercero, y el aviso de
  vencimiento —que lee la ficha— sigue sin salirle hasta que se copie.
  🚨 **Y la misma trampa tumbaba la pantalla «Clientes sin canal»** (`lib/clientes-sin-canal.ts`), que
  miraba SOLO las columnas de la ficha: decía «19 clientes con los que NO se puede contactar» cuando
  eran **15**. Ahora la consulta cruza `poliza_intervinientes` de sus pólizas vivas y devuelve
  `canalEnPoliza` / `contactoDeOtros` / `fichasContacto`; el titular usa `resumen.ilocalizables` (los que
  no tienen nada en ningún sitio) y `sinNinguno` queda como «sin nada en su ficha». ⚖️ Son estados
  distintos a propósito: **tener a quién llamar no es poder notificar** — el preaviso del art. 22 LCS va
  al TOMADOR. El nombre de un interviniente suelto va cifrado y NO cruza el puerto: de esos solo el
  recuento. Guardián: `test/regression-clientes-sin-canal.test.ts`.
  🚨 **Y había un CUARTO sitio, encontrado el 05/09/2026 por el mismo camino: `cliente_relaciones`.**
  Alberto, mirando la pantalla otra vez: «grupo elca ya tiene a pablo y aun aparece», «Studium es una
  empresa y tiene a victor y berta». Los tres estaban declarados (Pablo Franco Ruz «Administración» de
  GRUPO ELCA 83; Víctor «Empleado/a» y Berta «Accionista» del Instituto Studium) y la consulta miraba la
  ficha, sus tablas hijas y los intervinientes de la póliza, pero no ahí. **Medido contra la BD ese día:
  18 clientes de la cartera viva sin nada en su ficha · 14 ilocalizables con los tres sitios de antes ·
  SEIS con el cuarto.** (La pantalla decía 16, cifra anterior a las fusiones del lote 10.)
  ⚖️ **El familiar NO es un contacto de segunda.** Se iba a rotular «solo sirve para pedirle el correo» y
  lo corrigió Alberto: «piensa q un cliente puede ser muy mayor y no tiene contacto… es mejor contactar
  con el familiar». Comparte estado con el interviniente ajeno (`contacto_via_tercero`) y **viaja el
  PARENTESCO** (`fichasAllegado: {clienteId, nombre, parentesco}`), que la pantalla pinta: llamar al hijo
  y llamar a un desconocido no son lo mismo. Lo que no cambia es que tener a quién llamar sigue sin ser
  poder notificar (art. 22 LCS, el preaviso va al TOMADOR).
  ⚠️ **La consulta busca en las DOS direcciones de la relación a propósito.** El convenio del repo es
  «fila A→B = B es <tipo> de A», pero el volcado NO lo respeta (en Studium hay una fila que se leería
  «Berta es Empresa de Studium»), así que se enseña el `tipo_relacion` tal cual lo escribió el CRM y no se
  afirma quién representa a quién. Y `distinct on (o.id)`: cada vínculo está dos veces y una misma persona
  puede ser a la vez «Propietario» y «Empresa» — sin eso, saldría duplicada.
- **`GET /poliza?id=`** (02/09/2026) — la ficha de UNA póliza: coberturas, todos los recibos, siniestros,
  intervinientes, nº de documentos (`null` si no se pudo contar) y la **copia gemela** (mismo `numero_poliza`
  en la otra cara: la de CIMA trae vencimiento y recibos, la del volcado la dirección del riesgo). La
  dirección del RIESGO sí cruza el puerto (sin ella un hogar no se identifica); la del tomador, no.
  `lib/cartera-poliza.ts`. El `/cliente` usa la gemela para rellenar el objeto cuando CIMA no lo manda.
- **`GET /buscar?q=`** — el buscador de TODO (ver abajo).
- **`/documentos`** (02/09/2026) — ver «Documentos» más arriba: lista, subir, pedir, revisar, borrar, bytes.
- **`GET /impagados`** — la cola de retención (ver abajo).
- **✏️ EDITAR y ➕ DAR DE ALTA clientes desde plataforma (02/09/2026)** — primeras ESCRITURAS del puerto
  sobre `clientes`. `lib/cartera-edicion.ts`; reglas puras en `@central/module-seguros` (`cliente-edicion.ts`,
  10 tests): teléfono/email/DNI/fecha normalizados y validados (letra del DNI/NIE, fecha real y pasada).
  - **`/cliente/contactos`** (GET · POST · PATCH · DELETE): varios teléfonos y emails por ficha, con etiqueta
    cerrada (`móvil/fijo/trabajo/whatsapp/otro` · `personal/trabajo/otro`) y **uno principal**, que se ESPEJA
    en `clientes.telefono/email` (+ hash) porque es lo que leen ficha, buscador y avisos. Las tablas hijas
    (`cliente_telefonos` 4.794 / `cliente_emails` 4.393 filas, hasta hoy sin lector en central) son la fuente;
    si están vacías, la columna se presenta como único con id `col:telefono`/`col:email`, y al añadir otro se
    baja primero a la hija. El buscador por índice ciego ya mira también las hijas.
  - **`PATCH /cliente`** (edición): lo LIBRE (dirección cifrada, CP, ciudad, provincia, notas) entra tal cual;
    la IDENTIDAD (DNI, nombre, apellidos, fecha de nacimiento) **solo con `documentoId` de un documento tipo
    `dni` RECIBIDO de ese mismo cliente** (dictado de Alberto: «tendrá que solicitarlo documentado») → 422
    `documento_requerido` / `documento_no_acredita` si no. El DNI cruza el puerto ENMASCARADO (`*****678Z`);
    el entero sigue sin salir de aquí.
  - **`POST /cliente`** (alta): busca ANTES por hash de DNI/teléfono/email (columna e hijas) y devuelve 409
    `conflicto` con las fichas que ya lo tienen. **DNI repetido nunca se fuerza** (misma persona); teléfono/
    email sí con `forzar:true` (matrimonio), y entonces ese valor va a la hija y NO a la columna única. Nace
    `lead`/`prospecto`: **«cliente» lo pone CIMA** al enganchar una póliza por el hash del DNI — y OJO, CIMA
    NO cambia `tipo` de una ficha existente (`pull-persist.ts` solo enriquece `dniLookupHash`/`tipoPersona`),
    así que la ficha de plataforma pinta «Cliente (CIMA)» por pólizas vivas, no solo por `tipo`.
  - Todo cambio deja fila en **`historial_interno`** (`gestion`/`contacto`/`nota`, best-effort) SIN valores
    de identidad ni dirección. Cifra con las mismas primitivas que el CRM (`module-seguros-pii`): sin
    `PII_ENCRYPTION_KEY` en producción la escritura FALLA con 500, nunca guarda en claro.
- **👪 RELACIONES entre clientes y AUTORIZACIÓN para ver los seguros del otro (02/09/2026).** Alberto: «es
  marido de María Antonia… por si autoriza María Antonia que José vea sus seguros». La tabla **YA EXISTÍA**:
  `cliente_relaciones` (1.708 filas del CRM, José↔María Antonia incluidas), **dos filas por vínculo, una por
  sentido**, con tipos recíprocos (`Hijo/a`↔`Padre/Madre`) y el vocabulario del CRM (18 tipos + los pares del
  volcado «Tomador - Propietario»). El CRM colapsaba `puede_ver_polizas` con un OR de los dos sentidos y lo
  dejaba «informativo»; aquí queda FIJADO: fila A→B = «B es <tipo> de A» y `puede_ver_polizas` = **A autoriza a
  B a ver las pólizas de A**. Direccional a propósito: se da y se quita SOLO desde la ficha de quien autoriza.
  Reglas puras en `@central/module-seguros` (`relaciones.ts`: `relacionesDeFicha` funde los dos sentidos,
  `clientesVisiblesPara` es lo que un portal enseñaría además de lo propio); BD en `lib/cartera-relaciones.ts`;
  puerto **`/cliente/relaciones`** (GET · POST crea los dos sentidos · PATCH autoriza/revoca · DELETE borra el
  par). La ficha manda `relaciones` (`null` = no se pudo leer). Cada alta/autorización deja fila en
  `historial_interno` de las DOS fichas: es un consentimiento y se tiene que ver quién lo anotó y cuándo.
  ⚠️ `prisma_asegura_portal` NO tiene grant sobre la tabla: el portal del cliente todavía no enseña los
  seguros de nadie más; cuando se haga, `clientesQuePuedeVer()` ya dice a quién.
  🆕 **Tipo `Sin vínculo` (03/09/2026, PR #2161) — «revisado y no son nada» ≠ «nadie lo ha mirado».** Alberto,
  sobre Antonio Sevico (conductor ocasional en 18 pólizas de la cartera, con ficha propia y sin ninguna fila
  en `cliente_relaciones`): «no tiene vinculación ninguna». Eso es un HECHO y hasta ese día no se podía
  anotar: la tarjeta 👪 solo pinta lo declarado, así que se veía igual que no haberlo revisado — y el bloque
  nuevo «En sus pólizas, sin vínculo declarado» habría pedido su vínculo para siempre (**17 pares así, en 15
  fichas**, de 326). Es simétrico y **NO autoriza a nada**, con la guarda en TRES sitios y no en el botón:
  `permiteAutorizar()` (puro), `clientesVisiblesPara()` **ignora esas filas aunque traigan
  `puedeVerPolizas` en true** —es donde se decide quién ve las pólizas de quién— y `autorizarVer()` corta
  con 422 antes de escribir el consentimiento. Un conductor ocasional no puede acabar viendo las pólizas del
  tomador por un flag viejo del volcado.
  ⚠️ **Falso positivo del guardián de aislamiento, para no perder el rato dos veces:**
  `regression-asegura-aislamiento` marcó `cartera-relaciones.ts` como infractor porque un mensaje de error
  acababa una frase con «ver seguros.» y el cepo busca `seguros.<letra>` con flag `i`. Se reescribe la
  FRASE, no el cepo: uno que molesta es mejor que uno que deja pasar.
- **🕘 Estado derivado, historial y duplicadas (02/09/2026, «haz todo»).** La ficha manda `estado`
  (`estadoCliente()` de module-seguros: cliente = póliza **confirmada por CIMA** = cartera viva
  (`esCarteraViva()`) **y** `id_poliza_entidad` informado; «emitida, pendiente de CIMA» = viva sin entidad,
  0 de las 109 de entonces; con presupuesto =
  cotización pendiente/enviada de ≤60 días; ex-cliente; lead), cada póliza `confirmadaCima`, `historial` (últimas
  50 de `historial_interno`, `lib/cartera-historial.ts`) y `cotizacionesVivas`. **`GET /duplicados`**: vivas con el
  mismo número normalizado + código DGS (`polizasDuplicadas`, puro) — el guardián de la conciliación
  Codeoscopic↔CIMA; `emitidaYCima` marca el grupo que hay que casar. Diseño de la emisión en central y la
  conciliación: `docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md` (pendiente de OK).
- **🚨 SINIESTROS desde la ficha (02/09/2026, tarde).** `/siniestro` (GET · POST abre · PATCH estado o
  seguimiento); reglas puras en `@central/module-seguros` (`siniestros.ts`, 7 tests), BD en
  `lib/cartera-siniestros.ts`; `SiniestroFicha` creció (origen, comentario, perito, lugar, `confirmadoCima`…)
  y lo comparten la ficha y la póliza (`SELECT_SINIESTRO` + `mapSiniestro`). Medido antes: los **67**
  siniestros son de CIMA (7 abiertos), `tipo` es un **código EIAC** («1107», «17») sin tabla aquí → se
  pinta «código CIMA 1107», no se inventa nombre. El legacy (`persist-siniestro.ts`) casa por el índice
  único parcial `(correduria_id, id_siniestro_entidad, codigo_entidad_dgs)` y en el UPDATE reescribe
  **solo** `estado`, `tipo`, `fecha_hora`, `lugar_*`; tramitador/perito/gravedad/reserva/indemnización/
  `comentario` NUNCA (son «manual del corredor»). Dos consecuencias cableadas: (1) en uno de CIMA el
  estado **no se cambia a mano** (422) y se anota lo demás; (2) en uno nuestro (`origen =
  gestionado_correduria`), la `referencia` que dé la compañía se escribe TAMBIÉN en
  `id_siniestro_entidad` (+ el código DGS de la póliza al abrir) → el próximo pull cae sobre nuestra fila
  y la actualiza en vez de duplicarla — misma jugada que D2 de la spec de emisión. Solo se abre sobre
  pólizas vivas de CIMA (una del volcado → 422). Aviso del art. 16 LCS (7 días) al abrir tarde: no
  bloquea. Dirección exacta del hecho cifrada; CP/ciudad/provincia en claro como CIMA. Historial tipo
  `siniestro` en cada escritura, sin la descripción del hecho. Insert probado en la BD real con rollback.
- **💶 «¿Por qué ha subido la prima?» (02/09/2026, noche).** `/poliza` manda `evolucionPrima` (entero:
  anualidades + veredicto + explicación) y cada póliza de `/cliente` la versión compacta (`veredicto`,
  `variacionPct`, `explicacion`). Regla pura `evolucionPrima()` en module-seguros (`prima-evolucion.ts`, 6
  tests). Lo medido que la condiciona: (1) **la prima de cada anualidad NO es un dato**: se suma de los
  recibos `clase_recibo` `CA` (renovación) y `NP` (nueva producción); los `SU` (suplementos) se cuentan
  aparte; los anulados fuera. (2) **Una anualidad va de aniversario a aniversario**, no por año natural:
  la semestral del 1/10 tiene 10/2024+04/2025 en un ciclo y 10/2025+04/2026 en el siguiente (103,95+103,95
  → 118,48+118,48 = +14 %); `inicioCiclo()` lo resuelve con 15 días de margen porque la compañía emite
  antes del aniversario. (3) Un ciclo se compara **solo si está completo** (`recibos === FRACCIONES[fracc]`);
  medio ciclo contra uno entero daría una «bajada» falsa. (4) Cobertura real: 29 vivas con dos anualidades,
  25 con una, 13 sin recibos → `sin_datos` es lo normal y se dice como tal. (5) Un siniestro explica la subida
  solo si cae en el ciclo ANTERIOR a la renovación (caso real: siniestro del 08/02/2026 tras la renovación del
  17/01 no explica el +2,3 % de 2026); uno sin fecha → `no_atribuible`, nunca «sin siniestro».
- **🧾 EMISIÓN por Codeoscopic — lo que hay y lo que NO (02/09/2026, «haz todo ok» de Alberto).** En la BD:
  enum `poliza_origen` con **`emitida_codeoscopic`** (⚠️ un valor de enum no se puede quitar), tabla
  **`seguros.companias_dgs`** (15 códigos; `nombre_cima` = texto EXACTO que CIMA escribe en
  `polizas.aseguradora`, medido solo para Mapfre/Allianz/Occident; NULL en el resto, no se inventa) y
  modelo `CompaniaDgs`. Reglas puras en module-seguros (`emision.ts`): `prepararPolizaEmitida` (D2),
  `emparejarConCima` (D4), `conciliarConCima` (D3). `lib/emision.ts` → `registrarPolizaEmitida` acuña la
  fila + `codeoscopic_projects.poliza_id` + historial en UNA transacción y exige DNI en la ficha del tomador.
  Puerto **`POST /api/operador/poliza/emitida`, cerrado tras `CODEOSCOPIC_EMISION_ACTIVA=true`** (503
  `emision_desactivada`). 🚫 **El envío al vendor (`POST /insurances/{id}/policy-applications`, multipart)
  NO está construido a propósito**: el gate de la spec (mismo `attempt_id` dos veces contra un sandbox) no se
  puede correr porque no hay sandbox; escribirlo a ciegas es estrenarlo en producción con dinero y con el
  contrato de un cliente. Cuando exista entorno de pruebas: transporte multipart nuevo, candado
  `submit_in_flight_at`, y ampliar la excepción del guardián de gasto (hoy tumba cualquier `metodo: 'POST'`
  fuera de `cotizar.ts`).
- **🗑 `GET/POST /api/operador/supresiones` (05/09/2026) — la cola del art. 17 RGPD.** Las solicitudes
  de supresión que llegan por el portal del cliente, para que Alberto las conteste desde
  `plataforma` → `/correduria`. 🚨 **No es una cola de borrados: es una cola de RESPUESTAS con un plazo
  legal de un mes corriendo por debajo** (art. 12.3) — el art. 17.3.b y el 17.3.e excluyen la supresión
  cuando hay deber de conservar o hace falta defender reclamaciones, y la correduría tiene los dos.
  `lib/supresiones.ts`; reglas puras y plazos en `@central/module-seguros-portal` (`supresion.ts`).
  Este puerto **escribe**, a diferencia del resto de modelos `portal_*` del schema de esta app, que
  son de solo lectura: resolver una solicitud es trabajo del corredor, no del portal.
  - **Ordena el RELOJ, no la llegada** (vencido → urgente → en plazo), y `resumen.vencidas` va aparte:
    es el único número que autoriza a decir que hay un plazo incumplido.
  - 🚨 **Contestar EXIGE texto** (422 `sin_respuesta`). El art. 12.4 obliga a motivar la negativa
    aunque sea parcial —y la parcial es el caso NORMAL aquí—; marcarla resuelta sin decir qué se
    contestó apagaría el reloj sin acreditar nada, o sea, volvería invisible el incumplimiento justo
    al producirse. La BD lo repite con su CHECK, porque un cepo solo en el código no protege a un
    `UPDATE` escrito a mano. Prorrogar sin motivo tampoco se puede (422 `sin_motivo_prorroga`).
  - Sin este puerto la solicitud viviría solo en la BD del portal, que es una pantalla que Alberto no
    abre. Detalle en `apps/asegura-portal/CLAUDE.md`.
- **🔑 Rol `prisma_asegura_portal` creado el 02/09/2026 (DDL del portal aplicada).** LOGIN, **NOBYPASSRLS**,
  **sin contraseña** (inerte, como nació `prisma_seguros`). Lee la cartera **por columnas**: un `SELECT` de
  DNI/IBAN/teléfono/email/dirección falla en la BD. SQL en
  `apps/asegura-portal/prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql`. La contraseña y la
  `DATABASE_URL` del proyecto Vercel del portal se ponen en el MISMO paso (lección de `prisma_seguros`).

### 🔎 Qué se puede buscar de verdad, y qué NO (medido 01/09/2026)

`lib/cartera-busqueda.ts` + `planBusqueda()` de `@central/module-seguros` (puro, 11 tests).

| Campo | Cómo | Cobertura REAL |
|---|---|---|
| nombre / apellidos | LIKE, texto en claro | **32.600 / 32.600** |
| **matrícula** | LIKE sobre `datos_especificos->>'matricula'`, **en claro** | 4.504 pólizas |
| nº de póliza | LIKE, en claro | 6.895 pólizas |
| código postal | igualdad, en claro | 16.398 fichas |
| ciudad | LIKE, en claro | 4.482 fichas |
| **DNI** | **índice ciego, EXACTO** | **3.904 = 12%** |
| teléfono | índice ciego, exacto | 5.377 = 16% |
| email | índice ciego, exacto | 4.308 = 13% |
| **dirección (calle)** | CIFRADA (`v1:`) → **se DESCIFRA EN MEMORIA** y se compara sin acentos/signos | 170 pólizas; sin clave = «ilegibles», y se dice |
| localidad / CP **del riesgo** | en claro en `datos_especificos` (`localidad`, `cp`), SQL sobre el JSON | 179 / 328 pólizas (**desde el 02/09/2026**) |

🚨 **Las tres búsquedas por índice ciego son la trampa de esta pantalla.** Un «no aparece» por DNI es
casi siempre «esa ficha no tiene hash calculado», no «ese DNI no está en la cartera» — y si la clave
del índice se desincronizara, **la búsqueda no daría error: devolvería vacío** (el modo de fallo
silencioso que ya avisa este documento). Por eso cada bloque de resultados viaja con su **cobertura**
y la UI dice sobre cuántas fichas ha podido mirar. `explicarVacio()` redacta esa frase.

🛣️ **La calle SÍ se busca desde el 02/09/2026, descifrando en memoria.** Por SQL es imposible (cifrado
autenticado `v1:…`, sin índice ciego), pero son ~170 pólizas y esta app tiene la clave: `porDireccion()`
las trae (tope 2.000), las descifra y compara con `direccionCoincide()` (sin acentos, sin signos: «san
vicente 40» casa con «CL SAN VICENTE, 40 2º-14»). La cobertura del bloque es **legibles / con calle**:
sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el cifrado tal cual y eso cuenta como **ilegible** —
`avisoDireccion(n)` dice cuántas no se han leído en vez de devolver un vacío que diría «nadie vive ahí».
Y `porRiesgo()` mira `localidad`/`cp` **del bien** (la casa de Rota de un cliente de Sevilla sale por
«rota» o por `11520`). Historia: hasta ese día se declaraba «imposible» — Alberto enseñó el CRM pintando
«CL SAN VICENTE, 40» en claro y la frase era falsa.

Un término se busca por **todos** los criterios que encaje: `41003` es a la vez código postal y número
de póliza plausibles, y no hay forma de saber cuál se quería.

### 🧬 Duplicidades en la cartera (medido 02/09/2026)

**`clientes.tipo` NO dice si una ficha es de hoy.** «Jose Suarez Salas» sale dos veces, las dos
`tipo='cliente'`: la de mayo (7 pólizas, 6 por CIMA, vence 2027) es la viva; la de junio (14 pólizas,
todas `asegura_app:`, vence 2016) es el volcado. Y la muerta enseña el número más grande. Por eso el
buscador rotula ahora por **`vitalidad`** (`@central/module-seguros/vitalidad.ts`, puro, 12 tests):
`viva` = entra por CIMA o vence dentro de 18 meses · `historica` · `sin_fecha` · `desconocida`. Las
dos últimas NO entierran a nadie: `polizasCima === null` es «no se contó», jamás 0.

✅ **Y desde el 02/09/2026 SÍ se fusiona: 50 fichas** (`merged_into_cliente_id` + `cliente_merge_log`,
que es **append-only** por trigger). Tres lotes, cada uno con su criterio de identidad escrito en el
propio SQL (`apps/asegura/prisma/sql/2026-09-02_fusion_*.sql`): `fusion-cima` (34, nombre o teléfono
**+** póliza común o DNI), `fusion-dni` (8, mismo hash de DNI) y `fusion-nombre-telefono` (8, nombre +
apellidos + teléfono con OK expreso de Alberto porque **no** comparten póliza). Nada se borra: la
lápida guarda `snapshot_before`. Tras los tres: **0 grupos con DNI repetido**, **0 grupos
nombre+teléfono que toquen la cartera viva** y **0 pólizas colgando de una lápida**.
🚫 **Lo que sigue sin fusionarse a propósito:** los ~545 grupos que solo comparten nombre+teléfono y
NO tocan la cartera viva (leads del volcado, donde el fijo compartido suele ser una familia).

🧩 **Lote 4 (03/09/2026, `2026-09-03_fusion_poliza_comun_lote4.sql`): «Global2» → «GLOBAL 2
INSTALACIONES TÉCNICAS», 51 fichas fusionadas en total.** Alberto la vio en el buscador y dictó «mismo
cliente». Se escapó a los tres lotes porque el nombre no casaba y ninguna tenía teléfono; lo que las
identifica es la RC **547875907** (Occident en CIMA, «Plus Ultra» —marca absorbida por Occident— en el
volcado). Medido antes de fusionar: era **el único par** de toda la base con una póliza de CIMA
repetida en otra ficha. Dos lecciones que quedan cableadas:
- **El buscador ya relaciona hermanas por PÓLIZA común, no solo por teléfono** (`hermanasDe` en
  `lib/cartera-busqueda.ts`; `Hermana.vinculo` + `avisoHermanas` en module-seguros): con vínculo
  `poliza` es «duplicado» aunque el nombre difiera. 🚨 **Solo cuenta si una de las dos pólizas es de
  CIMA**: por número+ramo a secas hay **2.123 pares** que NO son duplicados (el volcado `intranet:`
  reutiliza números —«NOLOSE» en 18 fichas— y las 15 que tocaban la viva llevaban «pendiente» como
  número, el centinela disfrazado de dato). Se midió antes de escribir el criterio, no después.
- **El motor de fusión tenía un hueco latente:** anula los hashes de la lápida ANTES de heredar, así
  que la viva heredó `email` cifrado pero no `email_lookup_hash` → buscar por ese email devolvía
  vacío. En los 50 supervivientes anteriores no había hueco (medido); aquí se repuso desde
  `snapshot_before` (segunda pasada en el mismo SQL). Si se escribe un lote 5, hereda los hashes
  ANTES de anularlos en la lápida.

Cifras sobre las 32.600 fichas (medidas ANTES de esas 50 fusiones):
- **740 grupos comparten teléfono** (1.599 fichas). **203 de ellos con nombres distintos**: familias
  y empresas, NO duplicados. Por eso no se fusiona nada automáticamente ni se dice «duplicado» a secas.
- De los **80 clientes vivos, 48 tienen otra ficha** (36 por teléfono, 38 por nombre exacto, 1 por DNI).
- **16 de las 109 pólizas vivas de entonces existen en las dos caras** (misma `numero_poliza` con `import_ref`
  NULL y con `asegura_app:`), y en **10 cada copia tiene la mitad del dato**: la de CIMA trae el
  vencimiento, la del volcado trae la **dirección del riesgo** (localidad/CP en claro). La ficha viva
  sola no sabe dónde está la casa. Pendiente: leer la copia gemela al pintar la ficha.
- 🚨 **1 cliente duplicado DENTRO de la cartera viva**: dos fichas con pólizas CIMA cada una (2+1),
  sin teléfono común, sin póliza común. **Es la ingesta de CIMA creando una ficha nueva** en vez de
  colgar la póliza de la existente — a Manuel. Renovaciones lo pinta como dos personas.

🧩 **Lote 5 (03/09/2026, `2026-09-03_fusion_mismo_vehiculo_lote5.sql`) — ESCRITO Y SIN EJECUTAR.** Alberto
vio a «María Antonia Gutiérrez Alcalá» DOS veces en «👤 Personas en sus pólizas» de José Suárez Salas y
dictó «prepara». Son dos fichas suyas (`intranet:cli:48` con DNI · `asegura_app:cli2:48` sin él), y lo caro
no es el duplicado: **el vínculo «Cónyuge» y su AUTORIZACIÓN cuelgan de la del volcado**, la que no tiene
ninguna póliza viva. **3 pares**, guarda de identidad = nombre+apellidos idénticos normalizados **+ las dos
intervienen en pólizas del MISMO VEHÍCULO** + no hay dos DNI distintos; sobrevive la que tiene DNI y la
lápida no puede tener ninguna póliza de CIMA. Ensayo en seco: las cuatro guardas pasan en los 3.
- **La condición del vehículo es la que decide, y se midió antes de escribirla:** solo con el nombre habría
  **1.010 pares** que además comparten el número de import — y ese N **no es un identificador**: de los
  4.093 pares que lo comparten, solo el **25%** comparte además el nombre. Fusionar por nombre es fundir
  parientes homónimos.
- **Fuera a propósito:** «Salvador Pérez Jiménez», con TRES fichas sin fusionar que no comparten ningún
  vehículo (5242DFY · ninguna · 8100FTK+8849HLB) — con ese dato pueden ser un padre y un hijo. Y los **8**
  pares de mismo nombre con dos DNI distintos.
- ✅ **Cumple el aviso del lote 4** sobre los índices ciegos, por el otro camino: no hereda antes de anular,
  sino que **repone los tres `*_lookup_hash` desde `snapshot_before`** al final del propio fichero (con
  guarda de unicidad), en vez de dejarlo para una segunda pasada descubierta después.

🚨 **POR QUÉ quedan 552 grupos sin fusionar, y no es indecisión: el blind index de DNI está a
medias (medido 03/09/2026, PR #2206).** Alberto vio dos «Pilar Piña Franco» (`intranet:cli:174` +
`asegura_app:cli2:174`, ninguna con póliza de CIMA) y preguntó por qué se duplican. La causa no es el
criterio, es que **el criterio no puede preguntar**: hay **19.696 fichas con DNI guardado y 15.800 de
ellas con `dni_lookup_hash` a NULL**, así que el lote 2 —mismo hash de DNI, el criterio fuerte— solo
pudo mirar 3.896. De los **556 grupos nombre+teléfono** (1.132 fichas, 528 cruzando los dos volcados),
**552 tienen el hash ausente en algún lado**. Los otros lotes tampoco los cazan por diseño: el 3 exige
que el superviviente tenga pólizas de CIMA, el 4 póliza común, el 5 vehículo común.

🚨 **Y el backfill de ese hash NO es un `UPDATE`.** `uq_clientes_dni_lookup_hash` es **UNIQUE** sobre
`dni_lookup_hash` para `tipo='cliente'`: escribirlo revienta en la segunda ficha de cada DNI repetido
(741 fichas `cliente` en riesgo; los 15.059 leads no, el índice es parcial). [Probable] es justo por
qué faltan — el importador se comió el conflicto. **El choque no es un estorbo: es el hallazgo**, un
DNI repetido es la misma persona dos veces. De ahí el orden, que no se puede invertir:
**(1) calcular en seco → (2) fusionar los choques con OK explícito → (3) escribir los hashes.**
El paso 1 y el 3 son `GET`/`POST /api/operador/backfill-dni` (vive aquí porque necesita
`PII_ENCRYPTION_KEY` y `PII_LOOKUP_KEY`); la regla es pura y está en
`@central/module-seguros` (`backfill-dni.ts`, `planBackfillDni()`, 11 tests), con los tres estados de
siempre: un DNI que **no descifra es `ilegible`, jamás «sin DNI»**, y un valor de cajón
(`PENDIENTE`, `X`) **no genera hash** para que no funda a dos personas.
📸 **Desde el 04/09/2026 el plan deja FOTO en `seguros.backfill_dni_plan`** (una fila, se sobreescribe
en cada GET/POST; `resumen` + `choques` como listas de uuid, sin DNI ni hash ni nombre —
`2026-09-04_backfill_dni_plan.sql`). Es el puente entre el paso 1 y el 2: los grupos de mismo DNI solo
se pueden calcular con la clave (aquí) y el lote de fusión se escribe desde la BD; antes se perdían al
cerrar la respuesta. Abrir `/correduria/mantenimiento` en plataforma basta para refrescarla.

✅ **PASO 3 EJECUTABLE DESDE LA PANTALLA (05/09/2026).** Hasta ese día el `POST` existía y **no había
botón en ninguna parte**: `/correduria/mantenimiento` decía «se lanza desde asegura», que en la
práctica era un `curl` con `ASEGURA_OPERADOR_SECRET` a mano. O sea, «haz el backfill del DNI» no lo
podía hacer nadie. Ahora hay botón (`EscribirIndiceDni.tsx` → `POST /api/correduria/backfill-dni` →
el puerto), en **tandas** (`{limite:N}`; descifrar 32.000 DNI ya consume parte de los 300 s) y con
`restantes` para saber si hay que volver a pulsar. Es idempotente: el `UPDATE` lleva
`dni_lookup_hash is null`.
⚠️ **Y se corrigió una frase falsa que era la que bloqueaba todo:** «no hay botón mientras queden
choques porque la escritura reventaría a la mitad». **No revienta.** El plan clasifica cada ficha
antes de tocar nada y sólo se escriben las `rellenable`; la segunda ficha de un DNI repetido ni
llega al `UPDATE`. Fusionar primero sigue siendo mejor (cada fusión = un hash más escribible), pero
es cobertura, no un requisito. La escritura va en `UPDATE ... FROM (VALUES ...)` por tandas de 500,
con reintento fila a fila si una tanda cae, para saber CUÁL falló.

🃏 **EL DNI CENTINELA (05/09/2026) — un valor de cajón que SÍ parece un documento.** Al mirar los 18
grupos de choque que quedaban tras el lote 7, uno no se parecía a los demás: **20 fichas comparten un
mismo DNI con 20 nombres sin relación** («alberto suárez gutiérrez», «alejandro saez caro», «chema
14134», «eva 12895»…) y **19 correos distintos**; una está en cartera viva. Es el mismo documento
tecleado en la ficha de veinte personas, y `looksLikeDniNieCif` no lo filtra porque tiene la letra
correcta. 🚨 **Y el índice único no protege de esto**: sólo cubre `tipo='cliente'`, y **14.990 de las
15.092 fichas con DNI y sin hash son `lead`** — el hash se habría escrito sin que nada fallara, y a
partir de ahí una búsqueda por ese DNI devolvería veinte personas y [Probable] la ingesta de CIMA,
que engancha la póliza a la ficha POR ese hash, podría colgarle una póliza viva a quien no es.
- **Guardián** en la pieza pura (destino `compartido`): ≥3 nombres distintos bajo el mismo DNI **y**
  ningún token de nombre común a todas. Esas fichas **no se escriben nunca**, `lead` incluidos, y no
  son candidatas a fusión: no hay a quién fusionar, hay un dato que corregir.
- **Con DOS nombres NO se activa a propósito.** Ahí «Adela Gutiérrez Alcalá» / «Adela Alcalá» (la
  misma persona, fusionada en el lote 7) y un DNI mal tecleado son indistinguibles; esos siguen
  siendo `choca`, que es lo que los pone delante de una persona. El guardián caza el centinela, **no
  todos los DNI equivocados**.
- La foto guarda ahora `compartidos` (`2026-09-05_backfill_dni_plan_compartidos.sql`, aplicada):
  desde SQL no se pueden recalcular sin las claves PII. ⚠️ `[]` en una foto anterior al 05/09/2026
  significa «no se calcularon», no «no hay» — mírese `calculado_en`.

📋 **Estado de los 620 grupos de choque (medido 05/09/2026):** **602 los fusionó el lote 7** el 04/09
a las 21:16-21:19 (auditados: 572 con el nombre idéntico, 30 con variantes que comparten tokens —
apellido suelto, erratas, el código pegado—; ninguna fusión de dos personas distintas). Quedan **18**:
1 es el centinela, 2 son los pares con DNI contradictorio que el propio lote 7 excluyó con los nombres
delante (`249` Antonio Manuel Mejías / Yolanda Ríos, `366` Catalina Verdugo / Fernando Martín) y **15
son grupos de TRES o más fichas**, que la guarda `count(*) = 2` del lote 7 salta a propósito: tres
fichas con el mismo DNI las decide una persona, no un bucle.

✅ **Y esa persona los decidió: lote 10 (05/09/2026, `2026-09-05_fusion_mismo_dni_lote10.sql`,
`fusion-dni-lote10-2026-09-05`).** Los 18 se pusieron delante de Alberto con nombre, teléfono y
pólizas; aprobó 14 grupos completos + 1 parcial. Ejecutado a las 12:46 UTC: **15 fusiones, 33
lápidas, 15 supervivientes, y ninguna póliza perdida** (70 antes, 70 después). Dos cambios de motor
respecto al lote 7: fusiona grupos de **N** (elige un superviviente y le funde las demás de una en
una, con el mismo orden de desempate) y **los uuid van escritos a mano en el lote, no leídos de la
foto** — la foto se recalcula en cada visita a `/correduria/mantenimiento`, así que el ordinal de un
grupo no es estable y solo los ids garantizan que lo ejecutado es lo aprobado.
🚫 **Los 3 que NO se tocaron son la parte que importa:** el 12 (Antonio Manuel Mejías Heredia /
Yolanda Ríos Vázquez) y el 15 (Fernando Martín Verdugo / Catalina Verdugo García) son **dos personas
distintas** — el identificador coincide y el DATO está mal en una de las dos—, y el 10 es el
centinela de 20 fichas. Fuera también la ficha de «Elisa De paz campo», que compartía grupo con dos
«Juan Antonio Romero Lopez» sin tener nada que ver: ese grupo entró **parcial**.
🔎 **Y un hallazgo que ningún criterio de nombre habría encontrado:** «Gerente Chapisa (sin
apellidos)» no es una persona sin nombre — es **Francisco Javier Zamora Flores**, mismo DNI y mismo
teléfono. Un cargo tecleado donde iba el nombre.

🃏 **Lote 6 (03/09/2026, `2026-09-03_purga_intervinientes_comodin_lote6.sql`) — ✅ EJECUTADO:
el COMODÍN del volcado.** Alberto, desde la ficha de Pilar: «Matito no se puede borrar, es un
error». Las dos mitades ciertas y por motivos distintos:
- **Francisco Chacón Matito figura de conductor ocasional en pólizas de 52 tomadores sin relación
  entre sí** (Phenix Automoción, Kartenbrot, Esquiansa y 49 particulares); Antonio Sevico, 16, y es
  «ocasional» del propio Matito. **Son los dos únicos por encima de 4**; el tercero no pasa de 3. Es el
  comodín que el CRM viejo metía cuando no sabía a quién poner.
- 🚨 **Pero Matito es una PERSONA REAL y su ficha no se toca.** De sus 60 filas de interviniente, **59
  son del volcado** (`origen='manual'`, creadas todas en 57 segundos el 21/06 entre las 17:58:47 y las
  17:59:44, sin NIF, sin nombre propio, **ninguna sobre cartera viva**) y **1 es de CIMA** (conductor
  HABITUAL, con NIF, póliza viva) **que se queda** — borrarla no serviría: el siguiente pull la
  recrearía. La frontera es limpia y no hay que adivinarla: las **408** filas `manual` de
  `poliza_intervinientes` cuelgan TODAS de pólizas del volcado; las **96** de CIMA, todas de vivas.
- 🚨 **Tercera guarda, dictada por Alberto al revisar el lote: «si no es tomador».** En SU propia
  póliza uno no es un comodín, es el titular. Medido: **no salva ningún interviniente** (Matito 0 de
  59, Sevico 0 de 18 eran sobre pólizas propias) **pero sí 2 relaciones** — el par «Matito tomador ↔
  Sevico su conductor ocasional», en sus dos sentidos, que es un vínculo de verdad. Queda cableada
  aunque hoy solo actúe en un sitio.
- Alcance FINAL: **77 intervinientes + 118 relaciones** ocasional/contacto, y **ninguna de las 118
  llevaba `puede_ver_polizas`** (la lección del lote 5: el consentimiento colgaba de la ficha que no
  era). Reversible: `seguros.interviniente_purga_log.snapshot_before`, append-only por trigger.
- ✅ **Verificado tras ejecutar (03/09/2026):** 195 filas en el log; a Matito le queda **1** fila de
  interviniente y es la de **CIMA**; entre los dos quedan **10** relaciones (8 de familia/empresa +
  las 2 salvadas); **0 personas** intervienen ya en pólizas de ≥4 tomadores. ⚠️ Ese recuento solo da
  0 si se excluye `cliente_id IS NULL`: hay 6 intervinientes de CIMA sin ficha enlazada que agrupan
  juntos y parecen «una persona con 5 tomadores» sin serlo.
- ✅ **Y el hueco que lo hizo necesario está tapado (03/09/2026, mismo día):
  `DELETE /api/operador/poliza/intervinientes`** (`lib/cartera-intervinientes.ts`), con el botón
  «quitar» en la pestaña Contactos de plataforma. `{ intervinienteId, actor, motivo? }`. Tres guardas:
  - 🚨 **Una fila de `origen='cima'` NO se borra: 409.** El siguiente pull la recrearía, así que el
    botón prometería algo que no puede cumplir — y de paso se tiraría dato bueno y vivo. Plataforma
    ni siquiera pinta el botón en esas filas: dice «la manda CIMA».
  - **Reversible**: la fila entera va a `interviniente_purga_log` (lote `quitado-desde-plataforma`)
    ANTES de borrarla, y **si el snapshot falla no se borra nada**: sin registro no hay vuelta atrás.
    `cliente_id` del log pasó a admitir NULL (`prisma/sql/2026-09-03_interviniente_purga_log_cliente_opcional.sql`)
    porque un interviniente puede no estar enlazado a ninguna ficha — meter ahí el `poliza_id` para
    rellenar la columna habría sido un dato que miente.
  - **El TOMADOR no se puede quitar y por eso no tiene botón**: `IntervinienteFicha.id` es `null` en
    su fila, que la sintetiza `filasIntervinientes()` y no existe en la base (test que lo fija en
    `packages/module-seguros/src/intervinientes.test.ts`).
  El SQL crudo de ese lib **no prefija `seguros.`** — la conexión ya trae `?schema=seguros` y, además,
  un `seguros.x` en código dispara el guardián de aislamiento. Las relaciones ya tenían su `DELETE`
  desde el 02/09 (`/cliente/relaciones`).

Desde el 02/09 el rol `prisma_seguros` sí escribe, pero las fusiones se hacen por SQL con su lote y su
guarda de identidad (no hay botón «fusionar» en la UI, a propósito); el buscador mide, rotula y enlaza a
la ficha viva desde la histórica (`avisoHermanas()`).

### 📞 La cola de retención — recibos devueltos (`lib/cartera-impagados.ts`)

Lo que decide el orden **no es el importe, es el reloj** (art. 15 LCS, modelado en
`@central/module-seguros/retencion.ts`, puro y con 16 tests). 🚨 **Pero el reloj solo arranca si la
compañía AFIRMA el impago**, así que `retencion(vencimiento, situacion, hoy)` exige la situación del
recibo y NO tiene valor por defecto:

| Situación del recibo | Desde que venció | Estado | Qué se puede hacer |
|---|---|---|---|
| `devuelto` | < 1 mes | `en_plazo` | Se paga y no llega a pasar nada |
| `devuelto` | **1-6 meses** | 🔴 `suspendida` | **El cliente circula sin cobertura y no lo sabe.** Si paga, vuelve a estar cubierto en **24 h** |
| `devuelto` | > 6 meses | ⚫ `extinguida` | Ya no se rescata: retenerlo es **póliza nueva** → retarificar |
| `pendiente` | cualquiera | 🟠 `sin_confirmar` | **NADIE ha dicho que se devolviera.** Se mira en el portal de la compañía; NO se llama al cliente |
| (ambas) | sin fecha | ❔ `sin_fecha` | No se sabe desde cuándo; va casi el primero por si es el más viejo |

🚨 **Caso fundacional (03/09/2026): la ficha de María Alcalá (hogar Mapfre `0732000113003`) decía
«🔴 Sin cobertura · hace 56 días»** sobre un recibo de 225,97€ en situación **`pendiente`**, DOMICILIADO
(`forma_pago='CC'`), en una póliza **en vigor** hasta 2027 — y cuya fila no se tocaba desde la carga
inicial del 24/06 mientras CIMA seguía entrando con normalidad (128 ficheros, el último del 30/08; 8
recibos SÍ pasaron a `cobrado` en agosto). O sea: la pantalla convertía «Mapfre no ha mandado el cobro»
en «esta señora circula sin seguro», que es el NULL colapsado a afirmación en el sitio más caro que
hay. Contraste: el único devuelto REAL de la cartera (Benito Azo Rejo, Occident) trae `fecha_situacion`
= 14/08/2026, una fecha de devolución de verdad, y cuadra al día con el correo «Recibos devueltos de
banco 14-08-2026» de `mediadores@occidentinforma.com`.

- **El enum de la base solo tiene `devuelto`** (no existe `impagado`). Los `pendiente` entran en la
  cola **solo si ya vencieron**; los que no, se cuentan en `pendientesSinJuzgar` en vez de tirarse.
- **`resumen.suspendidas` es el único número que autoriza a decir «circulan sin cobertura»** — los
  `sin_confirmar` van en `resumen.sinConfirmar`, aparte, con su propio cartel 🟠.
- **`situacionRecibo` cruza el puerto** para que plataforma pueda distinguir las dos cosas; en el
  puerto es `'devuelto' | 'pendiente' | null` y **un valor raro o ausente cae a `null`**, nunca a
  `devuelto`: inventarse un impago confirmado es exactamente lo que esto evita.
- 🚨 **`sinRecibosInformados`**: las pólizas vivas sin NINGÚN recibo (18 de las 109 de entonces; con la
  regla de dos brazos la cartera viva son 110 y esa cuenta no se ha vuelto a medir). No salen en la cola
  y **eso no es «están pagadas»** — la UI lo declara debajo de la lista.
- Varios recibos sin cobrar de la misma póliza → **un `devuelto` gana a cualquier `pendiente`** (es un
  hecho contra un dato que falta) y, dentro de la misma situación, se queda **el más antiguo**: es el
  que manda el reloj, y duplicar la fila duplicaría la llamada.
- El puerto lleva el **teléfono descifrado** a propósito: el propósito de la lista es descolgar.

🔒 **Lo que NO cruza el puerto, a propósito: DNI, IBAN y dirección.** Para trabajar una renovación no
hacen falta, y son los datos con los que se suplanta a una persona. Se ven aquí, en la pantalla de
retarificar, que es donde de verdad se usan. Teléfono y email SÍ viajan: sin ellos no se puede llamar
a nadie, que es el propósito entero de la ficha.

🚨 **`fechaVencimiento` de un vencimiento ya viaja con `clienteId`** — el id del TOMADOR, no el de la
póliza. Sin él el nombre de la lista de renovaciones es texto muerto y hay que volver a buscar al
cliente a mano. En `plataforma` es opcional (`string | null`) porque una versión desplegada más vieja
de esta app no lo manda: entonces el nombre no se enlaza y se dice por qué.

## ✉️ El cron de avisos de vencimiento (02/09/2026) — apagado por defecto

`GET /api/cron/avisos-vencimiento` (diario 08:00 UTC, `vercel.json`) manda **un** correo por
obligación a punto de dejar de ser accionable. Las obligaciones las escribe el **portal del cliente**
(`seguros.portal_obligacion`); el envío está aquí y no allí por una razón medida, no por gusto:

🚨 **El portal solo guarda hashes.** `portal_canal.valor_hash` es un SHA-256 con pimienta y el
`ClienteEmail` de su schema solo declara `email_lookup_hash`; el rol `prisma_asegura_portal` **no tiene
GRANT sobre la columna del email**. Un hash no se revierte: **desde el portal no hay destinatario**.
Esta app corre con `prisma_seguros` (BYPASSRLS) y sí lee `cliente_emails` cifrado, así que el correo
sale de aquí y el portal se queda con el aviso en pantalla.

**Los tres cerrojos, y por qué los tres:** detrás de este endpoint hay correos a clientes reales.

1. **Sin `CRON_SECRET` no se autoriza a nadie — tampoco en desarrollo** (`lib/cron-auth.ts`, más duro
   que el de `apps/plataforma`, que conserva el paso franco en dev). Un olvido de env tiene que fallar
   ruidosamente con 401, no funcionar abierto. **Solo `Authorization: Bearer`**: un `?secret=` dejaría
   la credencial en los logs de acceso.
2. **Sin `ASEGURA_AVISOS_ACTIVOS=1` no sale ni un correo**: se cuenta y se informa. Cualquier otro
   valor (`'true'`, `'0'`, ausente) deja el modo cuenta — la ambigüedad se resuelve hacia NO enviar.
   `?contar=1` fuerza el ensayo aunque estén activos. **Primero se comprueba el número** (debe ser
   ≤ 110, las pólizas vivas de CIMA); si sale de miles, el filtro de cartera viva no está funcionando
   y **no se enciende nada**.
3. **Una obligación cuya póliza es del volcado histórico no es candidata**, aunque llegara hasta aquí:
   la consulta re-filtra con `WHERE_CARTERA_VIVA` de `@central/module-seguros` (`import_ref IS NULL` O
   `eiac_xml_hash IS NOT NULL`) y `merged_into_poliza_id IS NULL`. Sin ese cepo, un error aguas arriba
   son 28.728 «se te venció el seguro» de pólizas de 2013-2018.

**Lo que NO hace, que es la parte que se copia mal:** no devuelve un `enviados: 0` tranquilizador
cuando falta el proveedor de correo o el remitente. Eso lanza y el endpoint responde **503**, porque
«no he podido» no puede leerse igual que «hoy no tocaba nadie». Y una candidata sin email legible
—descifrado fallido, `email_opt_out_at`, o una obligación declarada por el usuario sin póliza de
cartera— cuenta como **`sinCanal`**, que es la verdad, en vez de restarse del total y desaparecer.

`avisada_at` se sella **inmediatamente** tras el envío aceptado: es lo único que impide que un
reintento mande el mismo aviso dos veces. Si el sello falla se grita `ENVIADO PERO NO SELLADO`.

Envs nuevas: `CRON_SECRET`, `ASEGURA_AVISOS_ACTIVOS` (**no definir todavía**), `ASEGURA_MAIL_FROM` y
un proveedor de correo (`RESEND_API_KEY`, o SMTP, o Gmail — lo elige `@central/core-email` solo).
Guardián: `test/regression-portal-obligaciones.test.ts`.

## ✉️ «Invitar por correo» — el aviso de acceso pendiente (05/09/2026)

`POST /api/operador/cliente/relaciones/aviso` (Bearer de operador) escribe a la persona que tiene una
autorización **pendiente** para que entre al portal y la confirme. Lo dispara Alberto con un botón en
`plataforma` → `/correduria` → ficha del cliente; **nada lo llama solo**.

**Por qué existe:** `autorizarVer()` anota el consentimiento (`origen='corredor'`) y la fila nace
`aceptado_en IS NULL`, o sea sin abrir nada. Hasta hoy nadie se lo contaba al interesado: o Alberto
escribía el correo a mano, o la autorización se caducaba sola a los 90 días. Un permiso que su
destinatario no sabe que existe es un permiso que no existe.

**Por qué el envío vive aquí** y no en `apps/asegura-portal`: la misma razón que el cron de avisos de
arriba — el portal solo guarda hashes del canal y desde allí no hay destinatario al que escribir.

**Las cuatro comprobaciones** (`lib/aviso-acceso.ts`), cada una con su código y su motivo, porque se
arreglan de forma distinta y colapsarlas dejaría a Alberto sin saber si falta un correo o falla el
proveedor:

| desenlace | HTTP | qué significa |
|---|---|---|
| `ok` | 200 | el proveedor aceptó el mensaje (devuelve `caducaEn`) |
| `no_encontrado` | 404 | alguna de las dos fichas no es de esta correduría |
| `sin_pendiente` | 409 | no hay autorización pendiente entre ese par (o ya se aceptó, o caducó) |
| `sin_email` | 422 | la ficha autorizada no tiene correo legible, o está de baja de correo |
| `sin_portal` | 503 | `ASEGURA_PORTAL_URL` no es una https válida |
| `error_envio` | 502 | el proveedor rechazó el mensaje |

El estado «pendiente» lo decide `estadoAutorizacion()` del módulo puro sobre la fila, **no un `where`
que dé por hecho que «sin aceptar» es «pendiente»**: una sin aceptar que ya pasó su fecha está
caducada, y mandar a confirmarla lleva a una pantalla donde no hay nada que pulsar.

🚨 **El destinatario sale SIEMPRE de la ficha autorizada, nunca de la petición** (regla 3 de
`avisos-vencimiento.ts`): un destinatario que viaja en un JSON convierte este puerto en un relay de
correo con la firma de la correduría.

🚨 **Y esto NO acepta la autorización.** Sigue pendiente después del correo. La doble aceptación es el
único punto del sistema donde se prueba que al otro lado está la persona que Alberto tiene en la
cabeza —la dirección la teclea él, y puede ser un buzón compartido o tener una letra mal— y un botón
del panel no puede saltársela.

**Lo que el correo NO puede decir** (`lib/correo-aviso-acceso.ts`): quién le da el acceso y dónde
confirmarlo, y nada más. Ni compañía, ni número de póliza, ni matrícula, ni prima, ni DNI — **ni
siquiera qué alcance se le ha dado**, que ya es información sobre la cartera ajena. Misma lista que el
correo de invitación del portal (`CAMPOS_PROHIBIDOS_EN_INVITACION`) y mismo cepo, que recorre el texto
entero: `lib/correo-aviso-acceso.test.ts`.

El enlace va a `/autorizaciones` del portal y **no lleva token**: la persona entra con SU correo y un
código de un solo uso, y el portal la vincula sola a su ficha por el índice ciego del email
(`apps/asegura-portal/lib/vinculo.ts`). Un enlace sin llave dentro se puede reenviar sin abrir nada.

Envs: `ASEGURA_MAIL_FROM` (ya usada por el cron de avisos) + un proveedor de correo; opcionales
`ASEGURA_MAIL_REPLY_TO` (el buzón al que escribir si no reconoce a quien le da el acceso) y
`ASEGURA_PORTAL_URL` (por defecto `https://asegura-portal.vercel.app`, que es donde el portal sirve
HOY; cuando `clientes.grupoasegura.es` esté repuntado a Vercel se cambia la env y no se toca código).

## Lo que falta y de quién depende
- **De Manuel:** transferir sus proyectos de Vercel y Supabase y el repo; decir cómo se
  descargan los ficheros de las compañías, si usa Vercel Blob y qué dominios tiene.
- **De Alberto:** poner contraseña al rol, fijar la fecha de corte, y decidir si se formaliza
  el contrato de encargado de tratamiento.
- **Del corte:** cambiar a mano las URLs registradas en los paneles de **Codeoscopic** y
  **Meta/WhatsApp**. Eso no viaja en ninguna transferencia.
