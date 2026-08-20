# 🛡️ Traspaso del CRM de correduría (Manuel Suárez) → `central`

> **Estado: FASE 0 — bloqueado a la espera de la entrega de Manuel.** Nada se ha migrado todavía.
> Este documento es el runbook del traspaso y la fuente de verdad mientras dure. Cuando el traspaso
> se cierre, esto se sustituye por `apps/seguros/CLAUDE.md` y una entrada en `docs/CONTEXTO-SESIONES.md`.

## Qué es esto

Manuel Suárez desarrolló, en **su** cuenta de Supabase y **su** cuenta de Vercel, un CRM de correduría
de seguros prácticamente terminado, con integraciones ya hechas contra proveedores externos. El negocio
es de Alberto, así que el desarrollo tiene que cambiar de dueño: datos a la Supabase de Alberto,
despliegue a su equipo de Vercel, y código dentro del monorepo.

**Sí es posible y no exige que Manuel reescriba nada.** Son tres activos independientes, cada uno con
su vía.

| Activo | De dónde | A dónde | Mecanismo |
|---|---|---|---|
| Datos + esquema | Supabase de Manuel | `central` (`wswbehlcuxqxyinousql`) → schema **`seguros`** | `pg_dump` → `psql` en tubería directa (ver «¿MCP o API?») |
| Código | repo de Manuel | `apps/seguros` del monorepo | copia del árbol de trabajo, **sin historia git** |
| Despliegue | Vercel de Manuel | proyecto nuevo en `pisos-turisticos-projects` | Root Directory `apps/seguros` |
| Credenciales de proveedores | envs de Manuel | envs del proyecto Vercel nuevo | lista de nombres + **rotación** |

### Decisiones ya tomadas (20/08/2026)
1. **Schema `seguros` dentro de `central`**, no un proyecto Supabase aparte. Lo manda `MATRIZ.md`:
   una sola BD para todo el holding (dos proyectos = doble cobro y consolidación imposible).
2. **Vertical nueva `apps/seguros`** con su proyecto Vercel propio, patrón `apps/mariscos`.
3. **Free vs. Pro de Supabase se decide midiendo el dump real**, no con la estimación de los ~200 MB.
4. **NO se transfiere el proyecto Supabase de Manuel.** Sería un segundo proyecto (rompe el punto 1) y
   exigiría meterle como miembro de la organización que contiene TODOS los datos del holding. Se copia
   el contenido y él borra el suyo después.

### Punto de partida verificado (20/08/2026)
- Supabase: una sola organización (`fzagbwkkzfjlsvflkkvn`), **plan FREE**, un solo proyecto `central`.
  Uso ≈ **180 MB** de 500 (`public` 151 MB · `iarest` 22 MB · `rrhh` 1,5 MB). `cron` y `net` ya instaladas.
- Vercel: equipo `pisos-turisticos-projects` (`team_f4gPpt6dPuNcd5YyMt3q27uf`).
- En el repo **no existe** `apps/seguros` ni ninguna carpeta de correduría.

### 🚧 Frontera con lo que YA existe (no confundir, no duplicar)
`apps/plataforma` ya tiene `/correduria` + `lib/correduria.ts` + `app/api/correduria/*` + CIMA/TIREA.
Eso es la **contabilidad de las comisiones cobradas** de ASegura S.L. (CS-F/0170), derivada del banco
(`movimientos_bancarios`, `destino='seguros'`, siempre BBVA). **No se toca en este traspaso.**

Lo de Manuel es la **operativa**: clientes, pólizas, siniestros, vencimientos, integraciones con
aseguradoras. Conviven. Que plataforma consolide leyendo `seguros.*` (como ya hace con `rrhh.*`) o por
puerto HTTP es una **fase posterior**, fuera del alcance del PR de traspaso.

---

## 🔌 ¿Hace falta montar un MCP o una API para copiar los datos?

**No, y conviene no hacerlo.** Son dos necesidades distintas y cada una ya tiene su herramienta:

**Para MIRAR (inventario, Fase 1) → el MCP de Supabase que Alberto YA tiene.**
No hay que construir nada. El conector de Supabase de Claude lista *todos* los proyectos de la cuenta,
en cualquier organización. Así que basta con que **Manuel invite a Alberto a SU organización de Supabase
con rol de solo lectura** (*Organization → Team → Invite*). En cuanto acepte, el proyecto de Manuel
aparece en `list_projects` y Claude puede hacer `list_tables`, `execute_sql`, `get_advisors`, ver
migraciones y funciones — sin que viaje ninguna contraseña por WhatsApp.

Es exactamente la dirección segura del favor: **Alberto entra en la organización de Manuel**, no al
revés. Meter a Manuel en la organización de Alberto le daría acceso a `central`, que contiene los datos
de TODO el holding. Y Manuel puede revocarlo con un clic cuando acabemos.

**Para COPIAR (Fase 2) → `pg_dump | psql`, no un MCP ni una API.**
Un conector o un endpoint a medida haría el traslado fila a fila y en JSON: tardaría muchísimo más y
—lo importante— **perdería lo que no son filas**: tipos, índices, claves foráneas, secuencias (los
contadores de los IDs), constraints, triggers, funciones y vistas. Habría que reconstruir todo eso a
mano y descubrir lo que falta en producción. `pg_dump` se lo lleva entero en un solo comando, que es
justo el trabajo que ya está resuelto.

**Una API de sincronización solo tendría sentido si los dos sistemas fueran a convivir** alimentándose
en paralelo durante un tiempo. No es el caso: esto es un corte único: se copia, se verifica, y el
sistema de Manuel se apaga.

Resumiendo: **invitación de solo lectura para inspeccionar + `pg_dump` para el traslado.** Cero código
nuevo de fontanería.

---

## 📩 Mensaje para Manuel (borrador — lo envía Alberto)

> ⚠️ Regla del repo: no se envía nada a terceros sin autorización explícita de Alberto para ese envío
> concreto. Este texto está preparado, no enviado.

---

Hola Manuel:

Vamos a llevar el CRM de la correduría a mi propia infraestructura (mi Supabase y mi Vercel), para
integrarlo con el resto de mis negocios. No hace falta que reescribas nada: copiamos lo que hay. Te
pido esto:

**1. Invítame a tu organización de Supabase, con permisos de solo lectura.**
En el panel: *Organization → Team → Invite*, rol **Read-only**, a `alberto.suarez.gutierrez@gmail.com`.
Con eso puedo inspeccionar el esquema y hacerme una idea del volumen sin tocar nada y sin que me pases
contraseñas por mensaje. Lo revocas con un clic cuando acabemos.

**1-bis. Y para la copia en sí, una cadena de conexión de solo lectura.**
*Settings → Database → Connection string*, modo **Direct** (puerto 5432). Mejor que no me des la de
`postgres`; crea un rol de solo lectura y me pasas esa (mándamela por gestor de contraseñas, no por
correo ni WhatsApp):

```sql
create role traspaso_lectura login password '<una contraseña larga>';
grant usage on schema public to traspaso_lectura;
grant select on all tables in schema public to traspaso_lectura;
grant select on all sequences in schema public to traspaso_lectura;
```

**2. Renombrar el schema justo antes del volcado definitivo.**
Cuando te avise de que vamos a hacer la copia buena (no ahora), y **después de lanzar un backup desde
el panel**, ejecuta:

```sql
alter schema public rename to seguros;
create schema public;
```

Son dos segundos y nos ahorra un paso frágil por nuestro lado. Si prefieres no tocarlo, dímelo y lo
resolvemos nosotros.

**3. Código.** Acceso de lectura a tu repositorio de GitHub, o un ZIP del árbol de la rama que está
desplegada. **No necesito tu historial de git**, solo el estado actual.

**4. Lo que no viaja en una copia de la base de datos.** Esto es lo que de verdad puede atascar el
traspaso, así que te agradecería que me lo pusieras por escrito aunque sea en cuatro líneas:
- **Edge Functions** desplegadas (cuáles son, su código, y qué *secrets* usan).
- **Buckets de Storage**: nombres, si son públicos, tamaño aproximado.
- **Autenticación**: ¿usas Supabase Auth (`auth.users`) o una tabla de usuarios propia? ¿Cuántos
  usuarios reales hay? ¿Hay login con Google / magic link?
- **Tareas programadas** (`pg_cron`) y **webhooks** configurados.
- **Integraciones con proveedores externos**: qué proveedor, qué endpoints usas de cada uno, qué
  credencial y con qué nombre de variable de entorno.
- **Variables de entorno del proyecto de Vercel**: la **lista de nombres** aquí; los **valores** por un
  canal aparte (gestor de contraseñas o similar), no por correo ni WhatsApp.
- Si hay un dominio propio apuntando a tu Vercel, cuál es y dónde está registrado.

**5. No borres ni desactives nada** — ni el proyecto de Supabase, ni el de Vercel, ni el repo — hasta
que yo te confirme que todo está verificado funcionando en mi lado. Te aviso expresamente.

**6. Protección de datos.** Son datos personales de clientes reales, así que necesitamos dejar por
escrito el contrato de encargado de tratamiento, la fecha de entrega y el borrado posterior de tu
copia. Te paso el documento.

Gracias,
Alberto

---

## Fase 1 — Inventario y medición (antes de tocar nada)

Con la invitación de solo lectura (por el MCP de Supabase) o con la cadena de lectura, desde una
sesión de Claude:

```sql
-- Tamaño real por tabla (los ~200 MB son una estimación sin verificar)
select relname, pg_size_pretty(pg_total_relation_size(c.oid)) as tamano, n_live_tup
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```

Además: extensiones instaladas, políticas RLS, funciones, triggers, `cron.job`, y si hay filas en
`auth.users`.

**Lo que decide esta fase:**
- **Dato vivo vs. grasa** (logs, auditorías, colas, snapshots). De ahí sale el veredicto free vs. Pro
  (25 $/mes) que Alberto dejó abierto. Recordatorio del 19/08: el límite que aprieta de verdad **no es
  el disco, es el egress**.
- **Autenticación.** Si su CRM usa Supabase Auth, hay bifurcación: `central` **no la usa en ninguna
  vertical** — todas autentican contra la tabla `cuentas` con cookie propia + `jose`
  (`apps/mariscos/lib/auth.ts`). Con pocos usuarios reales lo sano es re-plataformar al patrón de la
  casa; con muchos, se migra `auth.users` (las contraseñas sobreviven, las sesiones abiertas no).
  **Es una decisión de Alberto, no se elige sobre la marcha.**

Salida: el inventario se escribe **en este mismo documento**, en una sección nueva al final.

---

## Fase 2 — Migración de la base de datos

Preparación en `central`, como `postgres` (Supabase MCP `apply_migration`):

```sql
create schema if not exists seguros;

-- Rol propio, mínimo privilegio. Molde: apps/almacen/prisma/sql/2026-07-15_almacen_schema.sql
create role prisma_seguros login password '<...>' bypassrls;
grant usage on schema seguros to prisma_seguros;
grant select, insert, update, delete on all tables in schema seguros to prisma_seguros;
grant usage, select on all sequences in schema seguros to prisma_seguros;
alter default privileges in schema seguros
  grant select, insert, update, delete on tables to prisma_seguros;
-- SIN create, y SIN grants sobre `public`.
-- Si sus funciones usan pg_trgm/uuid-ossp: grant usage on schema extensions to prisma_seguros;
```

🚨 **NUNCA conectar la app como `postgres`** (incidente 26/06: resetear esa contraseña tumba a todas
las apps a la vez).

Volcado y restauración, en tubería desde el contenedor de la sesión:

```bash
pg_dump --no-owner --no-acl --schema=seguros \
  "postgresql://traspaso_lectura:<pass>@db.<ref-manuel>.supabase.co:5432/postgres" \
| psql "postgresql://postgres:<pass>@db.wswbehlcuxqxyinousql.supabase.co:5432/postgres"
```

- **Plan B si Manuel no renombra el schema:** volcar su `public`, restaurarlo en un Postgres intermedio
  efímero, `alter schema public rename to seguros;` allí, y re-volcar `-n seguros`.
  🚨 **No usar `sed` sobre `public.` en el dump**: 200 MB de datos reales contienen esa cadena y se
  corrompen filas en silencio.
- **Podar la grasa ANTES de restaurar**, no después: el disco ya estará ocupado y `VACUUM FULL` en
  Supabase no sale gratis.
- Pasada previa con `--section=pre-data` para ver errores de dependencias sin mover 200 MB.
- **El dump NO se commitea nunca.** Son datos personales de clientes.
- **RLS:** Supabase auto-activa RLS en tablas nuevas. `prisma_seguros` tiene `BYPASSRLS`, así que la app
  funciona; cualquier acceso REST/anon verá **0 filas** hasta que existan políticas. Si el código de
  Manuel usa `supabase-js` con la clave `anon`, esto le afecta de lleno.
- **Verificación: contar filas por tabla en origen y destino, la lista completa.** Que el comando no dé
  error no significa que haya migrado todo.

---

## Fase 3 — El código como vertical `apps/seguros`

Molde vivo: `apps/mariscos` (PR #1055). Ficheros obligatorios dentro de `apps/seguros/`:

- `package.json` — deps `@central/*` con **`workspace:*`**, nunca `file:`.
- `vercel.json` — 🚨 **el `ignoreCommand` es obligatorio desde el primer commit.** Sin él, como todos
  los proyectos Vercel cuelgan del MISMO repo, cada push reconstruye TODAS las apps (incidente de
  ~600 US$/mes, PR #904):
  ```json
  {
    "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/seguros",
    "buildCommand": "prisma generate && next build",
    "installCommand": "npx --yes pnpm@10.33.0 install --no-frozen-lockfile",
    "framework": "nextjs"
  }
  ```
- `next.config.ts` — `transpilePackages` **exactamente igual** a las deps `@central/*` del
  `package.json`, más `outputFileTracingRoot: path.join(__dirname,'..','..')`.
- `tsconfig.json` (`extends ../../tsconfig.base.json`) · `eslint.config.mjs` (sobre
  `../../eslint.config.base.mjs`) · `middleware.ts` con gate de sesión.
- `prisma/schema.prisma` con `schemas = ["seguros","public"]`. Se puede generar con `prisma db pull`
  contra la BD ya migrada en vez de escribirlo a mano.
- `lib/{db,auth,session}.ts` — patrón de `apps/mariscos/lib/`.
  🚨 Secreto de sesión (`SEGUROS_SESSION_SECRET`) **sin fallback a literal**: usar la guarda multilínea
  de `apps/mariscos/lib/auth.ts`, que es la única forma que no dispara `test/regression-secrets.test.ts`.
- `CLAUDE.md` propio — lo exige el guardián `appsSinClaudeMd` (`scripts/auditar-estructura.mjs:397`).

**Importación del código de Manuel:**
- Copia del árbol de trabajo, **sin historia git** — igual que `apps/housesevillana` el 12/08/2026,
  cuya historia contenía una `service_role` de Supabase.
- Antes de commitear, escaneo de secretos sobre lo importado (`eyJ`, `sb_secret_`, `service_role`,
  `sk-`, IBANs). Lo que aparezca **se rota**, no basta con borrarlo del fichero.
- Si usa `supabase-js` con `service_role`, se migra a Prisma con `prisma_seguros` (patrón de la casa).

**Módulo compartido:** si aparece lógica de dominio pura y portable (primas, comisiones, estados de
póliza, vencimientos), baja a `packages/module-seguros` y la app la consume por adaptador, igual que
`apps/ialimp/lib/adapters/crm.ts` implementa el puerto de `packages/module-crm`.

**Registros fuera de `apps/seguros/`** (si falta alguno, la app queda a medias en el sistema — a
`mariscos` todavía le faltan cuatro):

| Fichero | Qué añadir |
|---|---|
| `.github/workflows/tests.yml` (~l.56) | `seguros` en la matriz de `typecheck` |
| `CLAUDE.md` (raíz) | bullet en la lista de verticales |
| `MATRIZ.md` | árbol ASCII (~l.34) **y** tabla de verticales (~l.50) |
| `docs/ESTRUCTURA.md` | fila en la tabla de apps |
| `docs/FUENTES-DE-VERDAD.md` | `apps/seguros/CLAUDE.md` → `apps/seguros/**` |
| `apps/plataforma/lib/estructura.ts` | entrada en el array `VERTICALES` |
| `.claude/skills/central-maestro/SKILL.md` | fila de enrutado + mención en el bloque de BD/roles |
| `.claude/skills/seguros-maestro/SKILL.md` | skill router de la vertical (nueva) |
| `docs/CONTEXTO-SESIONES.md` | entrada de la sesión |
| — | regenerar con `pnpm auditar` |

`pnpm-workspace.yaml`, `.vercelignore` y `scripts/vercel-ignore-build.mjs` **no se tocan**.

---

## Fase 4 — Vercel y proveedores externos

1. Proyecto nuevo en `pisos-turisticos-projects`, **Root Directory `apps/seguros`**, install
   `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.
2. Envs: `DATABASE_URL` / `DIRECT_URL` por el pooler con el rol propio
   (`prisma_seguros.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com`, 6543 pooled
   `?pgbouncer=true` / 5432 directa), `SEGUROS_SESSION_SECRET`, y una por integración externa.
3. **Rotar todas las credenciales de proveedores.** Han vivido en la cuenta y el historial de Manuel;
   el traspaso es el momento natural de cambiarlas. Donde el proveedor permita cuenta propia, dar de
   alta la de Alberto en vez de heredar la de Manuel.
4. Lo que sea idéntico a otras verticales va como **Shared Environment Variable de equipo**, no
   duplicado en el proyecto.
5. **Edge Functions**: redesplegar en `central` con sus secrets — no viajan en el `pg_dump`. Igual con
   `pg_cron` y `pg_net` (ambas extensiones ya están).
6. **Storage**: copiar buckets aparte y recrear políticas.
7. Dominio: apuntarlo cuando el despliegue esté verde.

---

## Verificación (antes de dar el traspaso por hecho)

1. **Datos**: recuento de filas por tabla origen vs. `seguros.*`, lista completa. Checksums de las
   tablas críticas (clientes, pólizas).
2. **Conexión real de la app**: `psql` con la cadena de `prisma_seguros` sobre el pooler y
   `select count(*)` en tres tablas. Tiene que funcionar **sin** ser `postgres`.
3. **Repo**: `pnpm test` (guardianes de secretos, scope `@central/*`, estructura generada,
   `vercel-ignore-build`), `pnpm auditar:check`, y el `typecheck` de la matriz para `seguros`.
4. **Build**: preview de Vercel en verde desde `apps/seguros`, y comprobar que un commit que solo toca
   `apps/seguros/` **no** dispara builds de las otras apps.
5. **Funcional**: login, alta de póliza y **una llamada real a cada integración externa** con las
   credenciales rotadas. Una integración que no se ha probado no está migrada, está sin comprobar.
6. **Comparación lado a lado**: la app de Manuel todavía viva junto a la nueva, misma consulta en
   ambas, mismo resultado. **Solo entonces** se le da luz verde para borrar.

---

## Orden de ejecución

```
0. Mensaje a Manuel            → lo envía Alberto            [BLOQUEA TODO LO DEMÁS]
1. Inventario + medición       → sección nueva en este doc + decisión free/Pro
2. Schema `seguros` + rol + volcado → datos dentro de `central`
3. apps/seguros + registros + skill → PR draft
4. Proyecto Vercel + envs rotadas   → preview verde
5. Verificación end-to-end          → luz verde a Manuel para borrar
```

Las fases 1 y 3 pueden solaparse en cuanto haya código y acceso de lectura. La 2 necesita el volcado
definitivo; la 4 necesita la 2 y la 3.

---

## Riesgos y cobertura

| Riesgo | Cobertura |
|---|---|
| Secretos en el código o la historia de Manuel | Import sin historia + escaneo + **rotación** de lo encontrado |
| Superar el free de Supabase (500 MB) | Medir en Fase 1 y podar antes de restaurar; si no cuadra, Pro |
| Egress, el límite que aprieta de verdad | Vigilar tras el corte; no depende del disco |
| La app escribiendo en `public` por error | `prisma_seguros` sin `CREATE` y sin grants sobre `public` |
| RLS auto-activada dejando pantallas a 0 filas | `BYPASSRLS` en el rol + comprobar cualquier acceso REST/anon |
| Datos personales de clientes (posible art. 9 RGPD) | Contrato de encargado de tratamiento; el dump nunca se commitea |
| Manuel borra su proyecto antes de tiempo | Punto 5 explícito en el mensaje |
| Reconstrucción de las ~10 apps en cada push | `ignoreCommand` desde el primer commit |
