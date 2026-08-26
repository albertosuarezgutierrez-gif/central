# 🛡️ Traspaso del CRM de correduría (Manuel Suárez) → `central`

> **Estado: FASE 0 → 1 — Manuel HA RESPONDIDO: invitación a su Supabase recibida y aceptada
> (26/08/2026). El inventario sigue bloqueado por un detalle de permisos, ver «Estado de los tres
> accesos» abajo.**
> Ningún dato se ha migrado todavía; lo único hecho en `central` son los cimientos vacíos (ver
> «Hecho ya»). Este documento es el runbook del traspaso y **la ÚNICA fuente de verdad** mientras dure.
> Cuando el traspaso se cierre, esto se sustituye por `apps/asegura/CLAUDE.md` y una entrada en
> `docs/CONTEXTO-SESIONES.md`.
>
> 🔗 **Documento único (20/08/2026).** Hasta hoy había **dos planes en paralelo** para lo mismo, escritos
> por dos sesiones distintas que no se vieron: este (`docs/TRASPASO-CORREDURIA.md`, vertical `apps/seguros`)
> y `docs/ASEGURA-MIGRACION.md` (vertical `apps/asegura`). Se han **fundido en este**, que absorbe todo lo
> que el otro tenía y el otro se ha borrado. Si encuentras una referencia suelta a `apps/seguros`, es de
> antes de la fusión: el nombre bueno es **`apps/asegura`**.

## 📍 Estado de los tres accesos (comprobado el 26/08/2026, no supuesto)

| Acceso | Estado real | Qué falta |
|---|---|---|
| **Supabase** | ✅ Manuel invitó a Alberto a su organización **`LOOR`** (`qdrmgpvqhcmhmpcrvtan`, plan **free**). Correo de `welcome@supabase.com` del **26/08/2026 07:42**; Alberto la aceptó. Desde esta sesión, `get_organization('qdrmgpvqhcmhmpcrvtan')` **responde** → la membresía es real | 🔴 **`list_projects` NO devuelve ningún proyecto de `LOOR`**: se sigue viendo solo `central`. La causa más probable es que **la app OAuth de Claude se autoriza POR ORGANIZACIÓN** (de ahí los correos «OAuth Application Approval» del 15 y 18/08, uno por organización): la de Alberto está autorizada, `LOOR` no. **Acción de Alberto:** volver a conectar el conector de Supabase y, en el selector de organización, marcar también **LOOR** (o «todas»). Si tras eso sigue sin aparecer, entonces es que Manuel le dio un rol *acotado a proyectos* y hay que pedirle rol de organización |
| **GitHub** | ⚠️ Invitación del **12/08/2026** a `manuelsuarez/asegura`, sin confirmar que esté aceptada | 🔴 **Claude no puede leer ese repo desde esta sesión, pase lo que pase**: `add_repo` → *cross-tier adds are not supported* (esta sesión ya tiene fuentes de `albertosuarezgutierrez-gif`). Haría falta una sesión NUEVA con `manuelsuarez/asegura` como fuente inicial, y eso exige que la app de Claude esté instalada en la cuenta de Manuel. Mientras tanto, el rodeo sigue siendo `docs/ASEGURA-PROMPT-CHROME.md` (Claude Chrome) o un ZIP del árbol de trabajo |
| **Vercel** | 🔴 Sin invitación: `list_teams` solo devuelve `pisos-turisticos-projects` | Pedírsela a Manuel (o, si su cuenta es Hobby, la lista de **nombres** de variables por aquí y los **valores** por gestor de contraseñas) |

> **Regla de esta tabla:** «no lo veo» ≠ «no existe». Que un proyecto no salga en `list_projects` no
> dice nada del CRM de Manuel; dice que este conector todavía no tiene permiso para mirarlo.

**Nada se ha copiado todavía.** La Fase 1 (inventario y medición) no puede empezar hasta que el
proyecto de `LOOR` sea visible desde el conector.

## 🏷️ Cómo se llama cada cosa (y por qué no todo igual)

| Pieza | Nombre | Por qué |
|---|---|---|
| Vertical / carpeta / proyecto Vercel | **`apps/asegura`** | Es la **marca** del negocio, «Grupo Asegura». Y la carpeta ya existe con su SQL aplicado (PR #1489): renombrarla ahora sería churn sin ganancia |
| Schema de la BD | **`seguros`** | **Ya creado y aplicado** en `central`. Es el **dominio**, no la marca: si mañana la marca cambia, el schema no se toca |
| Rol de BD de la app | **`prisma_seguros`** | Ya creado (inerte, sin contraseña). Renombrar un rol vivo por estética no se hace |
| Módulo compartido, si aparece | **`packages/module-seguros`** | Los módulos van por dominio (`module-pesca`, `module-flota`), no por marca |
| Secreto de sesión | **`ASEGURA_SESSION_SECRET`** | Los envs van por app |

> **La confusión de fondo, dicha una vez:** «Asegura» es el **cliente/marca** y «seguros» es el
> **dominio**. Ambos nombres son correctos, cada uno en su capa. Lo que estaba mal era tener dos
> documentos usándolos como si fueran dos proyectos distintos.

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
| Código | repo de Manuel | `apps/asegura` del monorepo | copia del árbol de trabajo, **sin historia git**; el repo original se transfiere y se archiva aparte |
| Despliegue | Vercel de Manuel | proyecto nuevo en `pisos-turisticos-projects` | Root Directory `apps/asegura` |
| Credenciales de proveedores | envs de Manuel | envs del proyecto Vercel nuevo | lista de nombres + **rotación** |

### Decisiones ya tomadas (20/08/2026)
1. **Schema `seguros` dentro de `central`**, no un proyecto Supabase aparte. Lo manda `MATRIZ.md`:
   una sola BD para todo el holding (dos proyectos = doble cobro y consolidación imposible).
2. **Vertical nueva `apps/asegura`** con su proyecto Vercel propio, patrón `apps/mariscos`.
3. **Free vs. Pro de Supabase se decide midiendo el dump real**, no con la estimación de los ~200 MB.
4. **NO se transfiere el proyecto Supabase de Manuel.** Sería un segundo proyecto (rompe el punto 1) y
   exigiría meterle como miembro de la organización que contiene TODOS los datos del holding. Se copia
   el contenido y él borra el suyo después.

> **Por qué un segundo proyecto Supabase no es «gratis» aunque el free permita dos.** Cuesta 0 €/mes,
> sí, pero: (a) **un proyecto free se pausa solo a los 7 días de poca actividad** —una correduría que
> se consulta a ratos se apaga sola, y recuperarla es manual, con ventana de 90 días—; (b) los límites
> del free (5 GB de egress, cuotas) son **por organización**, así que dos proyectos no dan el doble:
> se reparten y suman puntos de fallo; (c) sin joins contra `movimientos_bancarios` / `cuentas` /
> `negocios` la consolidación es imposible, y hay que duplicar roles, backups, migraciones y envs.
> **Cuándo sí tocaría proyecto aparte:** si la correduría se vendiera o se separara del grupo, o si un
> requisito legal obligara a aislar los datos. Hoy no es el caso.

### Punto de partida verificado (20/08/2026)
- Supabase: una sola organización (`fzagbwkkzfjlsvflkkvn`), **plan FREE**, un solo proyecto `central`.
  Uso ≈ **180 MB** de 500 (`public` 151 MB · `iarest` 22 MB · `rrhh` 1,5 MB). `cron` y `net` ya instaladas.
- Vercel: equipo `pisos-turisticos-projects` (`team_f4gPpt6dPuNcd5YyMt3q27uf`).
- En el repo, `apps/asegura/` existe pero **solo contiene su SQL de cimientos** — no hay app Next.js
  todavía, ni `package.json`, ni `CLAUDE.md` propio.

### ✅ Hecho ya en `central` (19/08/2026, PR #1489) — sin depender de Manuel
- **Schema `seguros` creado** y **rol `prisma_seguros`** (LOGIN + BYPASSRLS, **sin `CREATE`**), en
  `apps/asegura/prisma/sql/2026-08-19_asegura_bootstrap.sql`. Aplicado por MCP y verificado.
- El rol está **inerte a propósito: sin contraseña**. No puede conectarse hasta que Alberto ejecute
  `ALTER ROLE prisma_seguros WITH PASSWORD '…'`. Sobre `public` solo tiene **SELECT** de `cuentas`,
  `sociedades` y `negocios` (mínimo privilegio, lección de `prisma_almacen`).
- **Cero tablas.** Y eso es «sin inventariar», no «no hay»: el modelo de datos vive en el sistema de
  Manuel. La Fase 1 es la que lo cierra.

### 🚧 Frontera con lo que YA existe (no confundir, no duplicar)
`apps/plataforma` ya tiene `/correduria` + `lib/correduria.ts` + `app/api/correduria/*` + CIMA/TIREA.
Eso es la **contabilidad de las comisiones cobradas** de ASegura S.L. (CS-F/0170), derivada del banco
(`movimientos_bancarios`, `destino='seguros'`, siempre BBVA). **No se toca en este traspaso.**

Lo de Manuel es la **operativa**: clientes, pólizas, siniestros, vencimientos, integraciones con
aseguradoras. Conviven. Que plataforma consolide leyendo `seguros.*` (como ya hace con `rrhh.*`) o por
puerto HTTP es una **fase posterior**, fuera del alcance del PR de traspaso.

**Lo que esa fase posterior arregla, para no perderlo de vista:** hoy `/correduria` **adivina la
compañía por el concepto bancario** y arrastra una fila «Otras» poco fiable. Con la cartera real
cargada deja de adivinar: se cruza cada ingreso contra las pólizas. Es la ganancia concreta del
traspaso para lo que ya existe — pero se hace **después** de que los datos estén dentro y verificados,
no durante.

---

## 🔌 ¿Hace falta montar un MCP o una API para copiar los datos?

**No, y conviene no hacerlo.** Son dos necesidades distintas y cada una ya tiene su herramienta:

**Para MIRAR (inventario, Fase 1) → el MCP de Supabase que Alberto YA tiene.**
No hay que construir nada. El conector de Supabase de Claude lista *todos* los proyectos de la cuenta,
en cualquier organización. Así que basta con que **Manuel invite a Alberto a SU organización de
Supabase** (*Organization → Team → Invite*). En cuanto acepte, el proyecto de Manuel aparece en
`list_projects` y Claude puede hacer `list_tables`, `execute_sql`, `get_advisors`, ver migraciones y
funciones — sin que viaje ninguna contraseña por WhatsApp.

Con rol **Read-only** basta para *mirar*; con **Administrator** (opción A de abajo) además se hace todo
lo demás sin volver a molestarle. Esa es la única diferencia entre las dos opciones.

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

Resumiendo: **invitación a su organización para inspeccionar + `pg_dump` para el traslado.** Cero
código nuevo de fontanería.

---

## 🧩 GitHub: el repo externo, y por qué NO se hace igual que Supabase y Vercel

### Estado real del acceso (comprobado, no supuesto)

| Cosa | Estado |
|---|---|
| El repo | **`manuelsuarez/asegura`** en GitHub. **787 commits, 258 ramas**, suite e2e, tickets de Linear (`LOO-xxx`), desplegado en `asegura.vercel.app`. No es un prototipo: es un proyecto con historia |
| Invitación a Alberto | Enviada el **12/08/2026** (correo de `noreply@github.com`) como colaborador. Sin confirmar que esté aceptada — el repo no aparece entre los accesibles (ver «Estado de los tres accesos», 26/08/2026) |
| Acceso de Claude a ese repo | **NO, y no se puede arreglar desde aquí.** La app de Claude solo está instalada en `albertosuarezgutierrez-gif`, y una sesión no admite añadir repos de otro dueño (`add_repo` → *cross-tier adds are not supported*) |

**El rodeo mientras siga bloqueado:** `docs/ASEGURA-PROMPT-CHROME.md` es un prompt listo para que
**Claude Chrome** saque el inventario del repo por el navegador —Alberto sí entra como colaborador— y
lo devuelva aquí. No sustituye al acceso real, pero desbloquea el inventario sin esperar a Manuel.

**Y un dato que falta y decide bastante:** **en qué plataforma se desarrolló** (Lovable / Bolt /
Base44 / Replit / Next.js a mano). Determina si el Supabase es de Manuel o es el que le da la
plataforma, y si el código exportado es directamente usable o hay que reescribir el andamiaje.

### Por qué el código no viaja como repo


Los otros dos activos se **copian**. El código **no se transfiere como repo**: entra como carpeta
`apps/asegura` dentro de `central`. Un repo suelto más sería justo lo contrario de la matriz — ya pasó
con `house-sevillana-landing`, que vivía fuera y por eso era invisible al leer el monorepo.

Y hay una regla dura: **se importa el árbol de trabajo, SIN la historia git.** Precedente del
12/08/2026: la historia de `house-sevillana-landing` contenía una `service_role` de Supabase. Un
`clone` + merge arrastraría toda la historia de Manuel, y **un secreto borrado de un fichero sigue
vivo en los commits antiguos**. Borrarlo después no arregla nada: una clave publicada está quemada
aunque luego borres el repo.

**Qué hacer con su repo original, entonces:** que **lo transfiera a la cuenta de GitHub de Alberto**
(*Settings → Transfer ownership*) y ahí se deja **privado y archivado** como museo consultable — fuera
de `central`, sin contaminar el monorepo.

🚨 **Pero AL FINAL, no al principio:** transferir el repo rompe la conexión git de su proyecto de
Vercel y le tumba el despliegue. Mientras el traspaso no esté verificado, su sistema tiene que seguir
en pie (es la comparación lado a lado de la verificación). Así que primero acceso de LECTURA, y la
transferencia como último paso. Si no quiere o no puede transferirlo (repo dentro de una organización
suya, por ejemplo), se pierde el museo, no el traspaso: a `central` solo entra el árbol de trabajo.

⚠️ Al transferirlo, los secretos de su historia pasan a la cuenta de Alberto. Da igual: se rotan
igualmente (Fase 4) y el repo queda privado y archivado.

**Revisar antes de archivar:** si su repo tiene GitHub Actions o *repository secrets*, no viajan a
`central` (que tiene su propio CI). Comprobar si algún workflow hace algo imprescindible — un deploy,
un cron, una sincronización — antes de darlo por muerto.

---

## 📩 Qué pedirle a Manuel

> ✅ **ENVIADO por WhatsApp el 20/08/2026** (lo envió Alberto). La Fase 0 deja de ser el bloqueo:
> ahora se espera respuesta de Manuel. El texto se conserva abajo tal cual se mandó, como referencia
> de qué se le pidió exactamente.
>
> 📄 **Falta entregarle el documento que le promete el punto 6**: el contrato de encargado de
> tratamiento. Borrador en **`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`** — pendiente de rellenar
> quién firma como responsable, de revisión por la asesoría, y del visto bueno de Alberto antes de
> enviarlo (regla del repo: ninguna comunicación a terceros sin autorización para ese envío concreto).

### Lo más fácil para Manuel: que dé ACCESO, no que haga TAREAS

Casi todo lo que hay que hacer puede hacerlo Alberto con Claude **si tiene acceso**. Convertir cada
paso en una tarea para Manuel es lo que alarga el traspaso semanas: hay que explicárselo, esperarle,
y si sale mal, repetir. Por eso la **opción A es la recomendada**: son **tres invitaciones y se acabó**.

| | Opción A — tres invitaciones | Opción B — lista de tareas |
|---|---|---|
| Trabajo de Manuel | ~5 minutos, sin tocar SQL | 1-2 horas repartidas en días |
| Idas y venidas | ninguna | una por cada paso |
| Cuándo usarla | por defecto | solo si no quiere dar ese acceso |

---

### ✅ Opción A — recomendada

🚨 **El orden importa: la transferencia del repo va LA ÚLTIMA.** Transferir el repositorio de GitHub
rompe la conexión git de su proyecto de Vercel, así que **le tumba el despliegue en ese momento**. Eso
choca de frente con «no desactives nada hasta que confirme». Así que el repo se pide **al final**, ya
verificado el traspaso; mientras tanto, acceso de lectura y basta.

**Mensaje:**

Hola Manuel:

Vamos a llevar el CRM de la correduría a mi propia infraestructura, para integrarlo con el resto de mis
negocios. Para que no te lleve tiempo, lo más práctico es que me des acceso y lo hago yo:

1. **Supabase** — invítame a tu organización (*Organization → Team → Invite*) con rol
   **Administrator**, a `alberto.suarez.gutierrez@gmail.com`. Con eso saco yo la copia de la base de
   datos sin pedirte nada más. Lo revocas cuando acabemos.
   *(Si en esa organización tienes proyectos de otros clientes, no me invites: dime y lo hacemos de
   otra forma — no necesito ver nada tuyo que no sea esto.)*
2. **GitHub** — añádeme como colaborador con permiso de lectura, para copiarme el código.
3. **Vercel** — invítame a tu equipo, para ver las variables de entorno y la configuración del dominio
   sin que tengas que copiármelas a mano. *(Si tu cuenta es del plan gratuito y no te deja invitar,
   dímelo y me pasas los nombres de las variables; los valores por gestor de contraseñas.)*

Y tres cosas más:

4. **No borres ni desactives nada** — Supabase, Vercel ni el repo — hasta que yo te confirme que está
   todo verificado funcionando en mi lado. Te aviso expresamente.
5. **Al final del todo**, cuando ya te haya confirmado que funciona, transfiéreme el repositorio
   (*Settings → Transfer ownership*). Lo dejo archivado por si algún día hace falta consultar el
   historial. Lo dejo para el final a propósito, porque al transferirlo se te desconecta el despliegue
   de Vercel.
6. **Protección de datos.** Son datos personales de clientes reales, así que necesitamos dejar por
   escrito el contrato de encargado de tratamiento, la fecha de entrega y el borrado posterior de tu
   copia. Te paso el documento.

Si algo de esto no te encaja, dímelo y lo hacemos al revés: me pasas tú las copias y yo te voy pidiendo
lo que falte.

Gracias,
Alberto

**Qué desbloquea cada acceso (lo hace Claude, no Manuel):**

| Acceso | Lo que pasamos a poder hacer solos |
|---|---|
| Supabase Administrator | Crear el rol de lectura · `alter schema public rename to seguros` · lanzar backup · `pg_dump` · ver Edge Functions y sus secrets · listar buckets · comprobar si usa `auth.users` · ver `cron.job`, RLS, funciones y triggers |
| GitHub lectura | El código completo sin depender de un ZIP suelto ni de que él lo prepare |
| Vercel (miembro de equipo) | Leer los **valores** de las variables de entorno, la config del dominio y qué integraciones externas hay cableadas de verdad |
| GitHub transferencia (al final) | El historial, archivado fuera de `central` |

Con eso, **la Fase 1 entera y el inventario dejan de necesitar a Manuel.**

### ⚠️ Tres motivos legítimos por los que puede no poder — y qué hacer

No son excusas; son límites reales. Conviene anticiparlos para no quedarse bloqueado esperando:

| Si… | Por qué | Alternativa |
|---|---|---|
| Su organización de Supabase tiene **proyectos de otros clientes** | Invitar a Alberto como Administrator se los expondría. Es una razón profesional para negarse, no cabezonería | Que mueva **solo este proyecto** a una organización nueva vacía (*Project → Settings → General → Transfer*) y ahí sí invite; o que se quede en la opción B (cadena de lectura) |
| Su **Vercel es plan gratuito** (Hobby) | Las cuentas personales de Vercel no admiten miembros de equipo; invitar exige plan de pago | Que copie la lista de nombres de las variables, y los valores por gestor de contraseñas. Es lo único de la opción B que no se puede evitar |
| El repo está en **una organización de GitHub** suya, o lo quiere para su portfolio | Transferir un repo de una organización necesita permisos de la organización, y puede que no quiera desprenderse de él | Lectura y ya: se copia el árbol de trabajo (que es lo único que entra en `central`) y se renuncia al historial. Se pierde el «museo», no el traspaso |

Regla general: **ninguna de las tres es bloqueante.** Si falla una, se sustituye por su fila de la
opción B y el traspaso sigue.

---

### 🅱️ Opción B — si prefiere no dar ese acceso

Entonces sí hay que pedirle cosas concretas. Es el mismo traspaso, más lento:

1. **Invitación de solo lectura a su organización de Supabase** (lo mínimo, para poder inspeccionar el
   esquema sin contraseñas por mensaje).
2. **Cadena de conexión de lectura** para el volcado (*Settings → Database → Connection string*, modo
   Direct, puerto 5432). Que no dé la de `postgres`; que cree un rol:
   ```sql
   create role traspaso_lectura login password '<una contraseña larga>';
   grant usage on schema public to traspaso_lectura;
   grant select on all tables in schema public to traspaso_lectura;
   grant select on all sequences in schema public to traspaso_lectura;
   ```
   Que la mande por gestor de contraseñas, **no por correo ni WhatsApp**.
3. **Renombrar el schema** justo antes del volcado definitivo, tras lanzar backup desde el panel:
   ```sql
   alter schema public rename to seguros;
   create schema public;
   ```
   Si no quiere tocarlo, lo resolvemos por nuestro lado (Fase 2, plan B).
4. **El código**: acceso de lectura al repo, o un ZIP del árbol de la rama desplegada. **No hace falta
   el historial** para el traspaso; si además quiere cedérselo, la transferencia del repo se pide **al
   final**, nunca ahora (le tumbaría el despliegue de Vercel).
5. **Inventario por escrito de lo que no viaja en un `pg_dump`** — esto es lo caro de su tiempo, y es
   justo lo que la opción A nos deja averiguar solos:
   - **Edge Functions** desplegadas (cuáles, su código, qué *secrets* usan).
   - **Buckets de Storage**: nombres, si son públicos, tamaño aproximado.
   - **Autenticación**: ¿Supabase Auth (`auth.users`) o tabla propia? ¿Cuántos usuarios reales?
     ¿Login con Google / magic link?
   - **Tareas programadas** (`pg_cron`) y **webhooks** configurados.
   - **Integraciones externas**: qué proveedor, qué endpoints, qué credencial y con qué nombre de
     variable de entorno.
   - **Variables de entorno de Vercel**: lista de nombres aquí, **valores por canal aparte**.
   - Dominio propio, si lo hay, y dónde está registrado.
6. **No borrar nada** hasta confirmación, y **contrato de encargado de tratamiento** (igual que en A:
   estos dos puntos no son negociables en ninguna de las dos opciones).

---

### 📝 Recordatorio pendiente para Manuel — BORRADOR, SIN ENVIAR (26/08/2026)

De los tres accesos que se le pidieron el 20/08, ha dado **uno**: Supabase. Faltan Vercel y confirmar
que la invitación de GitHub del 12/08 sigue viva. Texto propuesto para WhatsApp — **no se manda hasta
que Alberto dé el visto bueno a este envío concreto** (regla del repo sobre comunicaciones a terceros):

> Hola Manuel: gracias, ya estoy dentro de la organización de Supabase. Me faltan dos cosas para no
> volver a molestarte:
>
> 1. **Vercel** — invítame a tu equipo para ver la configuración y los nombres de las variables de
>    entorno. Si tu cuenta es del plan gratuito no te dejará invitar: dímelo y me pasas solo la lista
>    de **nombres** de las variables; los valores por gestor de contraseñas, no por aquí.
> 2. **GitHub** — la invitación al repo es del 12 de agosto y creo que ha caducado. ¿Me la vuelves a
>    mandar? Solo lectura, para copiarme el código.
>
> Y una comprobación: en Supabase veo la organización pero no me aparece ningún proyecto dentro.
> Puede ser cosa mía, pero si me diste un rol acotado a proyectos concretos, ¿puedes ponerlo a nivel
> de organización?
>
> Recuerda: **no borres ni desactives nada** hasta que te confirme que está todo funcionando en mi
> lado. Te aviso expresamente. Y te paso el documento de protección de datos que te dije.

⚠️ **Lo que NO se le pide todavía:** la transferencia del repositorio. Va la última, ya verificado el
traspaso, porque al transferirlo se le desconecta el despliegue de Vercel.

---

## Fase 1 — Inventario y medición (antes de tocar nada)

Con el acceso a su organización (opción A o B), a través del conector de Supabase, desde una sesión
de Claude:

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

## Fase 3 — El código como vertical `apps/asegura`

Molde vivo: `apps/mariscos` (PR #1055). Ficheros obligatorios dentro de `apps/asegura/`:

- `package.json` — deps `@central/*` con **`workspace:*`**, nunca `file:`.
- `vercel.json` — 🚨 **el `ignoreCommand` es obligatorio desde el primer commit.** Sin él, como todos
  los proyectos Vercel cuelgan del MISMO repo, cada push reconstruye TODAS las apps (incidente de
  ~600 US$/mes, PR #904):
  ```json
  {
    "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/asegura",
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
  🚨 Secreto de sesión (`ASEGURA_SESSION_SECRET`) **sin fallback a literal**: usar la guarda multilínea
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

**Registros fuera de `apps/asegura/`** (si falta alguno, la app queda a medias en el sistema — a
`mariscos` todavía le faltan cuatro):

| Fichero | Qué añadir |
|---|---|
| `.github/workflows/tests.yml` (~l.56) | `asegura` en la matriz de `typecheck` |
| `CLAUDE.md` (raíz) | bullet en la lista de verticales |
| `MATRIZ.md` | árbol ASCII (~l.34) **y** tabla de verticales (~l.50) |
| `docs/ESTRUCTURA.md` | fila en la tabla de apps |
| `docs/FUENTES-DE-VERDAD.md` | `apps/asegura/CLAUDE.md` → `apps/asegura/**` |
| `apps/plataforma/lib/estructura.ts` | entrada en el array `VERTICALES` |
| `.claude/skills/central-maestro/SKILL.md` | fila de enrutado + mención en el bloque de BD/roles |
| `.claude/skills/asegura-maestro/SKILL.md` | skill router de la vertical (nueva) |
| `docs/CONTEXTO-SESIONES.md` | entrada de la sesión |
| — | regenerar con `pnpm auditar` |

`pnpm-workspace.yaml`, `.vercelignore` y `scripts/vercel-ignore-build.mjs` **no se tocan**.

---

## Fase 4 — Vercel y proveedores externos

1. Proyecto nuevo en `pisos-turisticos-projects`, **Root Directory `apps/asegura`**, install
   `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.
2. Envs: `DATABASE_URL` / `DIRECT_URL` por el pooler con el rol propio
   (`prisma_seguros.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com`, 6543 pooled
   `?pgbouncer=true` / 5432 directa), `ASEGURA_SESSION_SECRET`, y una por integración externa.
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
   `vercel-ignore-build`), `pnpm auditar:check`, y el `typecheck` de la matriz para `asegura`.
4. **Build**: preview de Vercel en verde desde `apps/asegura`, y comprobar que un commit que solo toca
   `apps/asegura/` **no** dispara builds de las otras apps.
5. **Funcional**: login, alta de póliza y **una llamada real a cada integración externa** con las
   credenciales rotadas. Una integración que no se ha probado no está migrada, está sin comprobar.
6. **Comparación lado a lado**: la app de Manuel todavía viva junto a la nueva, misma consulta en
   ambas, mismo resultado. **Solo entonces** se le da luz verde para borrar.

---

## Orden de ejecución

```
0. Mensaje a Manuel                 → ✅ enviado 20/08/2026    [esperando su respuesta]
1. Inventario + medición            → sección nueva en este doc + decisión free/Pro
2. Schema `seguros` + rol + volcado → datos dentro de `central`
3. apps/asegura + registros + skill → PR draft
4. Proyecto Vercel + envs rotadas   → preview verde
5. Verificación end-to-end          → luz verde a Manuel
6. Transferencia del repo + archivo → lo ÚLTIMO (le corta el despliegue)
```

**Lo que bloquea hoy es la respuesta de Manuel**, no el mensaje. Lo único que se puede adelantar sin
él es el inventario del repo por Claude Chrome (`docs/ASEGURA-PROMPT-CHROME.md`) y el contrato de
encargado de tratamiento (`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`).

Las fases 1 y 3 pueden solaparse en cuanto haya acceso. La 2 necesita el volcado definitivo; la 4
necesita la 2 y la 3. **La 6 va después de la 5, siempre**: mientras el traspaso no esté verificado,
su sistema tiene que seguir en pie para la comparación lado a lado.

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
