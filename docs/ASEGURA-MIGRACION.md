# Grupo Asegura — traer la correduría al monorepo (plan de migración)

> **Estado:** plan aprobado a falta de desbloquear el acceso (ver "Lo que solo puede hacer Alberto").
> Fecha: 19/08/2026. Vertical destino: `apps/asegura`. BD destino: schema `seguros` en `central`.

## Qué hay hoy (comprobado, no supuesto)

| Cosa | Estado real |
|---|---|
| Código externo | Repo GitHub **`manuelsuarez/asegura`**. Invitación de colaborador a `alberto.suarez.gutierrez@gmail.com` el **12/08/2026** (email de `noreply@github.com`). **Sin aceptar**: no aparece en los repos accesibles. |
| Acceso de Claude a ese repo | **NO**. La app de Claude solo está instalada en `albertosuarezgutierrez-gif`, y una sesión no admite añadir repos de otro dueño (`add_repo` → *cross-tier adds are not supported*). |
| Supabase | **Un solo proyecto**: `central` (`wswbehlcuxqxyinousql`, eu-west-1, plan **free**). Org `fzagbwkkzfjlsvflkkvn`. Schemas actuales: `public`, `iarest`, `rrhh`. **No existe** schema `seguros`. |
| BD del proyecto externo | **Desconocida**. Estará en un Supabase del desarrollador — hay que pedirla. NULL ≠ "no hay". |
| Correduría ya en el monorepo | `apps/plataforma` → `/correduria`: matriz de comisiones por compañía y mes derivada de `movimientos_bancarios` con `destino='seguros'`. **No hay tablas de pólizas ni de cartera.** |

## Decisión: NO se crea un proyecto Supabase nuevo

Se puede (el segundo proyecto free cuesta **0 €/mes**, el plan free da 2). Pero **no conviene**:

- **Un free se pausa solo a los 7 días de poca actividad** (docs de Supabase). Una correduría que se
  consulta a ratos se te apaga sola; recuperarlo es manual y hay ventana de 90 días.
- Los límites del free (5 GB de egress, cuotas de la org) **son por organización**, así que dos
  proyectos no dan el doble: se reparten y encima suman puntos de fallo.
- Segunda BD = **sin joins** con `movimientos_bancarios` / `cuentas` / `negocios`, doble juego de
  roles, backups, migraciones, env vars y secretos. Es justo lo que multiplica los errores.
- Rompe el patrón del monorepo: `ia-rest` y `rrhh` ya viven como **schema** dentro de `central`.

**Va así:** app `apps/asegura` + schema **`seguros`** en `central` + rol propio **`prisma_seguros`**
(`login` + `BYPASSRLS` + DML sobre `seguros`, **sin `CREATE`**, clonado de `prisma_sivra`).
"Grupo Asegura" es **marca**, no infraestructura → entra por `@central/brand` (skill `marca-cliente`).

> Cuándo sí tocaría proyecto aparte: si la correduría se vendiera/separara del grupo, o si un
> requisito legal obligara a aislar los datos. Hoy no es el caso.

## Lo que solo puede hacer Alberto (bloqueantes)

### 1. El código
1. Aceptar la invitación del email del 12/08 (`manuelsuarez invited you to manuelsuarez/asegura`).
2. Pasarlo a tu cuenta, por el orden de menos fricción:
   - **Mejor:** que Manuel **transfiera** el repo a `albertosuarezgutierrez-gif` (Settings → Transfer ownership); o
   - **copia sin historia**: clonar, borrar `.git`, crear `albertosuarezgutierrez-gif/asegura` y subirlo
     como commit inicial. **Sin historia a propósito** — un `--mirror` arrastraría claves si las hubo
     (nos pasó con `house-sevillana-landing`, ver memoria 12/08/2026).
3. Con el repo ya en tu cuenta, abrir una **sesión nueva** de Claude con `albertosuarezgutierrez-gif/asegura`
   como fuente. Desde esta sesión no se puede añadir.

### 2. La base de datos y los secretos (pedírselo al desarrollador)
- **Ref del proyecto Supabase** que usa la app, y a ser posible **transferirlo** a tu organización
  (Supabase → Settings → Transfer project). Si no lo transfiere: `pg_dump` **de esquema y de datos** por separado.
- Lista de **variables de entorno**, **Edge Functions**, **crons**, **buckets de Storage** y **políticas RLS**.
- Claves de terceros que use (email, pasarela, firma, lo que sea).
- ⚠️ Toda `service_role`/clave que te dé se considera quemada: **se rota** en cuanto se migre.

### 3. Un dato que falta
En qué plataforma se desarrolló (Lovable / Bolt / Base44 / Replit / Next.js a mano). Determina si el
Supabase es del desarrollador o suyo-de-la-plataforma, y si el repo exportado es directamente usable.

## Hecho ya (19/08/2026), sin depender de Manuel

- **Schema `seguros` creado** en `central` y **rol `prisma_seguros`** (LOGIN + BYPASSRLS, sin
  `CREATE`), **inerte: sin contraseña** → no puede conectarse hasta que Alberto ejecute
  `ALTER ROLE prisma_seguros WITH PASSWORD '…'`. Sobre `public` solo tiene **SELECT** de
  `cuentas`, `sociedades` y `negocios` (mínimo privilegio, lección de `prisma_almacen`).
  Fichero: `apps/asegura/prisma/sql/2026-08-19_asegura_bootstrap.sql`. Aplicado por MCP y verificado.
- **Sin tablas todavía**, y eso es "sin inventariar", no "no hay": el modelo vive en el repo externo.
- `docs/ASEGURA-PROMPT-CHROME.md`: prompt para que **Claude Chrome** saque el inventario del repo
  por el navegador (Alberto sí entra como colaborador) y me lo devuelva. Es el rodeo al bloqueo.

## Lo que hago yo cuando esté desbloqueado

1. **Inventario** del repo: tablas, RLS, auth, edge functions, crons, deps, y qué está de verdad hecho.
2. **Código** → `apps/asegura`: deps `workspace:*`, `transpilePackages`, y `vercel.json` con
   `"ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/asegura"` (obligatorio: sin eso
   cada push reconstruye las ~10 apps — incidente de ~600 US$ de julio).
3. **SQL** → `prisma/sql/AAAA-MM-DD_asegura_schema.sql`: `CREATE SCHEMA seguros` + tablas traducidas.
   Se aplica preview → prod, como `postgres` (nunca con el rol de la app).
4. **Rol** `prisma_seguros` con mínimo privilegio.
5. **Carga de datos** desde el dump, mapeando a la jerarquía `Cuenta → Sociedad → Negocio`.
6. **Auth**: decidir entre el `auth` de `central` o cookie propia (patrón `mariscos`).
7. **Marca** Grupo Asegura por `@central/brand` (los hex salen del logo, no a ojo).
8. **Vercel**: proyecto `asegura`, Root Directory `apps/asegura`.
9. **Enganche con `/correduria`** de plataforma: hoy adivina la compañía por el concepto bancario y
   tiene una fila "Otras" poco fiable; con las pólizas reales pasa a cruzarse contra cartera.

## Reglas del monorepo que aplican aquí

- Columnas de enriquecimiento asíncrono: `null` = "sin revisar", `[]`/`0` = "revisado, no hay". Una
  póliza sin recibos cargados **no** se pinta como "sin recibos pendientes".
- Importes en euros: `2.162,49€` (helper `eur()`), nunca `€2162.49`.
- Responsive obligatorio ≥320 px y nada de listas de cientos de filas montadas de golpe.
- Secretos de auth: `requireSecret()`, jamás `process.env.X || 'literal'`.
