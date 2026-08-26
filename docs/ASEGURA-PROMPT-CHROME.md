# Grupo Asegura — lo que hay que hacer por navegador (Claude Chrome)

> **Para qué:** hay tres cosas del traspaso que Claude Code **no puede hacer desde aquí**, y las tres
> se desbloquean por el navegador, donde Alberto sí entra con su cuenta. Este documento es la lista de
> prompts, listos para pegar tal cual.
>
> **Estado del acceso (26/08/2026)** — el detalle vive en `docs/TRASPASO-CORREDURIA.md`:
> - **Supabase**: Manuel invitó a Alberto a su organización **`LOOR`** (`qdrmgpvqhcmhmpcrvtan`). La
>   membresía es real, pero el conector de Claude **no ve ningún proyecto de esa organización**.
> - **GitHub**: `manuelsuarez/asegura` es inalcanzable desde una sesión que ya tiene repos de
>   `albertosuarezgutierrez-gif` (*cross-tier adds are not supported*).
> - **Vercel**: sin invitación todavía.
>
> **Todos los prompts son de SOLO LECTURA a propósito:** no escriben, no despliegan, no rotan claves,
> no comentan, y **nunca copian el VALOR de un secreto** — solo el nombre de la variable.

---

## PASO 0 — esto NO es para Chrome, es para Alberto (1 minuto)

La app OAuth de Supabase **se autoriza por organización**, no por cuenta (por eso llegan correos
«OAuth Application Approval» sueltos, uno por organización). La de Alberto está autorizada; `LOOR` no.

1. Abre los conectores de Claude → **Supabase** → desconectar y volver a conectar.
2. En el selector de organización, marca **también `LOOR`** (o «todas»).
3. Vuelve aquí y dilo: entonces la Fase 1 la hago yo entera por el conector, sin navegador y sin
   molestar más a Manuel.

**Si tras eso `LOOR` sigue sin mostrar proyectos**, el problema es otro: Manuel dio un rol *acotado a
proyectos concretos*. Entonces hay que pedirle rol de **organización** (Administrator, o Read-only si
prefiere) — y mientras tanto, el PROMPT 2 de abajo saca el inventario igual, por pantalla.

---

## PROMPT 1 — Inventario del repositorio

```
Trabaja en modo SOLO LECTURA sobre https://github.com/manuelsuarez/asegura (repo privado,
tengo acceso como colaborador; ya estoy logueado).

Antes de nada: dime si la invitación de colaborador sigue PENDIENTE de aceptar. Si al abrir el
repo aparece un banner de invitación, dímelo y para ahí — no la aceptes tú.

REGLAS INNEGOCIABLES:
- No edites, no crees ramas, no abras issues ni PRs, no dejes comentarios, no pulses "Merge",
  "Transfer", "Delete" ni ningún botón que cambie algo. Solo navegar y leer.
- Si encuentras claves, tokens, contraseñas o URLs con credenciales: apunta SOLO EL NOMBRE de la
  variable (p. ej. `SUPABASE_SERVICE_ROLE_KEY`). NUNCA copies el valor, ni entero ni troceado.
- Si algo no lo encuentras, escribe "NO ENCONTRADO". No lo deduzcas ni lo inventes: que no
  aparezca un archivo no significa que no exista, significa que no lo has visto.

Recorre y resúmeme, en este orden:

1. RAÍZ: lista de carpetas y archivos de primer nivel de la rama `principal`/`main`.
2. `package.json`: versión de Next.js, React, si usa Prisma o supabase-js, gestor de paquetes,
   y la lista de scripts.
3. `README.md` y todo lo que haya en la carpeta `documentos/`: dime qué hace el producto,
   qué módulos tiene y qué está terminado vs a medias. Esto es lo más importante del encargo.
4. BASE DE DATOS — busca en este orden y dime cuál existe:
   `prisma/schema.prisma`, `supabase/migrations/`, `db/`, `drizzle/`, `sql/`.
   Dame la LISTA DE TABLAS con sus columnas principales, y si hay políticas RLS.
5. `supabase/config.toml` o similar: el `project_id`/`project_ref` del proyecto Supabase.
   Y lista de carpetas dentro de `supabase/functions/` si las hay.
6. VARIABLES DE ENTORNO: busca `.env.example`, `.env.sample`, `.env.template`, y también
   `vercel.json` y `next.config.*`. Dame solo los NOMBRES de las variables.
7. RUTAS: contenido de `app/` o `src/app/` — qué pantallas y qué endpoints de API hay.
8. `.github/workflows/`: qué comprueba el CI. Y si hay *repository secrets* configurados,
   solo sus NOMBRES (Settings → Secrets and variables → Actions).
9. ESTADO DEL PROYECTO: los Pull Requests abiertos (título y de qué van), los "Releases", y en la
   pestaña de ramas dime cuáles son las 5 más recientes y contra cuál va el trabajo vivo — hay
   258 ramas y necesito saber cuál manda.
10. `.claude/agentes/` y `.githooks/`: qué automatismos trae montados.
11. CON QUÉ SE CONSTRUYÓ: dime si ves rastro de Lovable, Bolt, Base44, Replit o v0 (badges en el
    README, dependencias raras, carpetas generadas, commits automáticos con ese nombre), o si es
    Next.js escrito a mano. Esto decide si el Supabase es suyo o se lo da la plataforma.

FORMATO DE SALIDA: un solo bloque en Markdown, con un apartado por cada punto del 1 al 11,
listo para copiar y pegar. Al final, una sección "DUDAS" con lo que no pudiste ver y por qué.
```

---

## PROMPT 2 — Inventario del Supabase de Manuel (organización `LOOR`)

> Esto es **la Fase 1 del runbook** hecha por pantalla en vez de por el conector. Lo que sale de aquí
> decide dos cosas grandes: **free vs. Pro** (25 $/mes) y **qué hacemos con la autenticación**.
> Todo son consultas de metadatos: **ni una fila de datos personales de clientes**.

```
Modo SOLO LECTURA en https://supabase.com/dashboard. Estoy logueado y soy miembro de la
organización "LOOR". No cambies ninguna configuración, no pauses ni restaures nada, no rotes
claves, no ejecutes nada que escriba (INSERT/UPDATE/DELETE/ALTER/DROP/CREATE). Solo SELECT.
NUNCA reveles ni copies el valor de una API key, contraseña o connection string: si te pido una
clave, es solo para saber si EXISTE.

A) Dime qué organizaciones y qué proyectos veo, y en cuál está el CRM de correduría (asegura).
   Si en "LOOR" no aparece NINGÚN proyecto, dímelo tal cual y para: significa que mi rol no
   alcanza a los proyectos, y hay que pedírselo a Manuel.

B) Del proyecto de asegura, de la pantalla: Reference ID, región, plan, y el uso que muestre
   (tamaño de base de datos y egress del mes).

C) Abre el SQL Editor de ESE proyecto y ejecuta estas consultas, una a una, devolviéndome el
   resultado completo de cada una en una tabla Markdown:

-- 1. Tamaño real por tabla y filas vivas (esto decide free vs Pro)
select n.nspname as schema, c.relname as tabla,
       pg_size_pretty(pg_total_relation_size(c.oid)) as tamano,
       pg_total_relation_size(c.oid) as bytes, s.n_live_tup as filas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where c.relkind = 'r' and n.nspname not in ('pg_catalog','information_schema')
order by pg_total_relation_size(c.oid) desc;

-- 2. Tamaño total de la base de datos
select pg_size_pretty(pg_database_size(current_database())) as total;

-- 3. Columnas de cada tabla (el modelo de datos que hay que traducir al schema `seguros`)
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema not in ('pg_catalog','information_schema','auth','storage','realtime','vault','extensions','graphql','net','cron')
order by table_schema, table_name, ordinal_position;

-- 4. Claves foráneas (lo que se rompe si el orden de carga es el equivocado)
select tc.table_name, kcu.column_name, ccu.table_name as referencia, ccu.column_name as ref_col
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public';

-- 5. RLS: qué tablas la tienen activada y cuántas políticas hay
select c.relname as tabla, c.relrowsecurity as rls_activada,
       (select count(*) from pg_policies p where p.tablename = c.relname) as politicas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- 6. Funciones y triggers propios (esto NO se ve en una copia fila a fila)
select n.nspname, p.proname, l.lanname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname not in ('pg_catalog','information_schema') and l.lanname in ('plpgsql','sql');

select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers where trigger_schema = 'public';

-- 7. Extensiones instaladas
select extname, extversion from pg_extension order by 1;

-- 8. Tareas programadas (si pg_cron está instalada; si da error, dilo y sigue)
select jobid, schedule, jobname, active from cron.job;

-- 9. AUTENTICACIÓN: ¿usa Supabase Auth? SOLO EL RECUENTO, ningún dato de usuario
select count(*) as usuarios, count(*) filter (where last_sign_in_at is not null) as han_entrado
from auth.users;

-- 10. Storage: buckets y si son públicos
select id, name, public from storage.buckets;

D) En Edge Functions: dime cuáles hay desplegadas y sus nombres. En Settings → Edge Functions
   → Secrets, SOLO LOS NOMBRES de los secretos.

E) En Database → Webhooks (o Integrations): si hay webhooks configurados, a qué apuntan.

Si alguna consulta da error, pégame el error tal cual y sigue con la siguiente. No la "arregles"
cambiándola por otra cosa.
```

---

## PROMPT 3 — El Vercel de Manuel (solo si llega a invitar)

```
Modo SOLO LECTURA en https://vercel.com. No cambies configuración, no despliegues, no rotes claves.

Busca el proyecto que despliega `asegura.vercel.app`. Dime: a qué equipo/cuenta pertenece, el
Root Directory, el repo de Git conectado, la rama de producción, los dominios asignados, y en
Settings → Environment Variables **SOLO LOS NOMBRES** de las variables — no pulses el ojo de
"Reveal", no copies ningún valor, ni siquiera parcialmente.

Dime también si el plan de la cuenta es Hobby o Pro: si es Hobby, no puede invitarme a un equipo
y hay que resolverlo de otra forma.

Si no tengo acceso, dilo claramente: "sin acceso", y no intentes entrar por otra vía.
```

---

## Qué hago yo con eso

- **Informe del PROMPT 1** → traduzco su modelo de datos al schema `seguros` (ya creado y vacío),
  escribo el SQL de las tablas y planifico el import a `apps/asegura`. Y digo qué está hecho de
  verdad y qué no.
- **Informe del PROMPT 2** → cierro la Fase 1 del runbook: veredicto **free vs. Pro** medido (no
  estimado), decisión sobre **autenticación** (re-plataformar al patrón de la casa vs. migrar
  `auth.users`), y la lista de lo que NO viaja en un `pg_dump` (Edge Functions, buckets, cron,
  webhooks) para que no se descubra en producción.
- **Informe del PROMPT 3** → la lista de credenciales a **rotar** (Fase 4) y las integraciones
  externas que hay cableadas de verdad.

---

## Lo que sigue pendiente de Manuel (no lo desbloquea el navegador)

1. **Invitación a su Vercel** — o, si su cuenta es Hobby, la lista de nombres de variables por aquí y
   los valores por gestor de contraseñas (nunca por WhatsApp ni correo).
2. **Confirmar que la invitación de GitHub sigue viva** (es del 12/08).
3. **Contrato de encargado de tratamiento** — borrador en
   `docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`, aún **sin NIF ni domicilios** (un identificador
   legal no se escribe de memoria) y sin revisar por la asesoría. Son datos personales de clientes
   reales: esto no es opcional.
4. **Que no borre ni desactive nada** hasta que el traspaso esté verificado en el lado de Alberto.

> Borrador de recordatorio para Manuel (WhatsApp) en `docs/TRASPASO-CORREDURIA.md`, sección
> «Recordatorio pendiente». **Sin enviar**: ninguna comunicación a terceros sale sin que Alberto
> dé el visto bueno a ese envío concreto.
