# CLAUDE.md — apps/almacen (vertical Almacén de eventos/catering)

> **Almacén de material de eventos/catering para el cliente Joaquín Jaén** (grupo de catering y
> eventos de Sevilla; el mismo dueño que usa `apps/ia-rest` como Voice POS). Es la superficie de
> producto que se acordó en la reunión del 14/07/2026 — contexto, requisitos y auditoría en
> **`docs/ALMACEN-JJ-reunion-y-auditoria.md`**; roadmap por fases en
> `docs/superpowers/specs/2026-07-16-almacen-fase1-multialmacen-design.md`.
> Compone el módulo puro **`@central/module-materiales`**.
>
> Decisión CERRADA (15/07/2026, adenda del doc): superficie **nueva `apps/almacen` sobre la BD
> compartida del holding**, NO se extiende `apps/ia-rest` (silo transitorio). De ia-rest se reutiliza
> el *know-how* (`inventario-menaje.ts`, `api/materiales/*`), **no su BD**.

## Qué es
Control operativo de material **multi-almacén**: maestro por familias, stock por almacén, libro de
movimientos, traspasos entre almacenes, eventos/alquileres con reserva de stock, inventarios por
conteo (empleados con acceso propio) y un **escaparate público de alquiler** sin sesión.

Modelo de stock (el corazón): una celda `(material, almacén)` con **cuatro estados** —
`disponible` · `reservado` (comprometido a un evento) · `en_transito` (viajando entre almacenes) ·
`fuera` (entregado al cliente). La matemática de las transiciones es **pura** y vive en el módulo;
la app solo la persiste.

## Arquitectura
- **Módulo puro** `@central/module-materiales` (`packages/`, sin BD, con tests):
  - `eventos.ts` — `reservar` / `cancelarReserva` / `entregar` / `devolver` / `enPropiedad` / `solapa`.
  - `transferencias.ts` — `iniciarTraspaso` / `confirmarRecepcion` (parcial + roturas) / `cancelarTraspaso`.
  - `stock.ts` — `stockActualDesdeLedger`, `stockPorEspacio`, `ajusteInventario`, `valorStock`,
    `alertasStockMinimo`, `alertasVencimiento`, `expandirKit`, `calcularDepreciacion`…
- **App** (esta carpeta): Next 15 (App Router) + Prisma sobre la **BD compartida**. Capas:
  - `lib/almacen.ts` — movimientos manuales + traspasos (`registrarMovimiento`, `recomputarTotales`).
  - `lib/eventos.ts` — ciclo del evento/alquiler.
  - `lib/inventario.ts` — sesión de conteo y cierre con ajustes.
  - `lib/empleados.ts` · `lib/publico.ts` (escaparate) · `lib/materiales-repo.ts` (Prisma→`Material`)
    · `lib/ayudas.ts` (banner 💶 del radar de ayudas) · `lib/format.ts` (`eur()`).
- **Regla de escritura invariante:** toda operación que toca stock escribe **stock + su movimiento en
  la misma `prisma.$transaction`** (ver cabecera de `lib/almacen.ts`). El ledger
  (`almacen_movimientos`) es la verdad histórica; `almacen_stock` es el snapshot; los contadores de
  `almacen_materiales` son Σ del snapshot (`recomputarTotales`).
- **Marca**: `@central/brand` con `MARCA_JOAQUIN_JAEN` inyectada en `app/layout.tsx`
  (`emitirRootCss`), logo real en `public/logo-jj.png` (`app/brand.tsx`).

## Datos (BD compartida, scope `cuenta_id`)
Todas las tablas llevan prefijo `almacen_` y **todo se scopea por `cuenta_id`** (aislamiento
multi-tenant por código, no por RLS). Modelos en `prisma/schema.prisma`; DDL en `prisma/sql/`
(aplicar **a mano como `postgres`**, preview → prod: `prisma_almacen` NO tiene `CREATE`).

| Tabla | Para qué | DDL |
|---|---|---|
| `almacen_familias` | familias del maestro (Vajilla, Cristalería…) | `2026-07-15_almacen_schema.sql` |
| `almacen_materiales` | maestro; contadores globales, `unidades_por_bandeja` (la «RAKI» de Joaquín), `stock_minimo`, `coste_reposicion`, `precio_compra` | ídem (+ `precio_alquiler`/`capacidad` en `2026-07-16_almacen_alquiler_capacidad.sql`) |
| `almacen_espacios` | almacenes/ubicaciones (`tipo`: `central` \| `hacienda` \| `otro`) con ficha | `2026-07-16_almacen_fase1_operativa.sql` |
| `almacen_stock` | snapshot por `(material, espacio)`: `disponible`/`en_transito`/`reservado`/`fuera` | ídem (+ Fase 2) |
| `almacen_movimientos` | **ledger** append-only (`entrada`\|`salida`\|`devolucion`\|`rotura`\|`ajuste`\|`transferencia`) | ídem |
| `almacen_transferencias` | traspasos entre almacenes (`pendiente`\|`recibida`\|`parcial`\|`cancelada`) | ídem |
| `almacen_comentarios` | hilo polimórfico (`entidad_tipo`/`entidad_id`) con foto opcional | ídem |
| `almacen_eventos` / `almacen_evento_lineas` | eventos y alquileres (`presupuesto`→`confirmado`→`entregado`→`devuelto`→`cerrado`\|`cancelado`) | `2026-07-16_almacen_fase2_eventos.sql` |
| `almacen_empleados` | usuarios operativos creados por la oficina (bcrypt) | `2026-07-16_almacen_fase3_empleados_inventario.sql` |
| `almacen_inventarios` / `almacen_inventario_lineas` | sesión de conteo (ciego u abierto) y su cierre | ídem |

`cuentas` y `negocios` son las tablas COMPARTIDAS con `apps/plataforma` (mismas que alquiler y
transporte). Catálogo real sembrado en el tenant DEMO: 227 materiales / 21 familias, fuente en
`prisma/sql/catalogo-joaquin-jaen.json` (16/07/2026).

## Auth y sesión
- Cookie **`almacen_session`**, secreto **propio `ALMACEN_SESSION_SECRET`** (`lib/auth.ts:13`, patrón
  `env || (prod ? throw : 'dev')` — nunca literal en prod, lo vigila `test/regression-secrets.test.ts`).
- Sesión **stateless**: firma JWT + existencia, **no** valida ni escribe `session_jti` para no pisar
  la sesión de plataforma (comparten `cuentas`) — comentado en `lib/session.ts`.
- **Dos tipos de sesión en el MISMO login** (`app/api/auth/login/route.ts`): primero `cuentas`
  (`tipo: 'oficina'`), y si no casa, `almacen_empleados` (`tipo: 'empleado'`, claim `empId`).
  El JWT lleva SIEMPRE `cuentaId` como scope de tenant, también para empleados.
- **La zona `(usuario)` es solo de oficina**: `app/(usuario)/layout.tsx:10` redirige al empleado a
  `/mi`. El empleado solo cuenta inventarios; **solo la oficina cierra** un inventario.

## Rutas
**Pantallas**
- `(usuario)` (oficina): `/panel` (KPIs valor total y por almacén, bajo mínimo, traspasos pendientes
  + banner 💶 de ayudas), `/almacenes[/id]`, `/materiales[/id]`, `/eventos[/id]`, `/transferencias`,
  `/inventarios[/id]`, `/movimientos`, `/empleados`, `/familias`, `/manual` (manual de usuario
  in-app, fiel a cada pantalla).
- `/mi` y `/mi/inventario/[id]` — área móvil del empleado.
- `(publico)` **sin sesión**: `/catalogo`, `/catalogo/[id]`, `/reservar`.

**API** (`app/api/*`, todas bajo sesión salvo las marcadas)
`POST /api/auth/login` · `POST /api/auth/logout` (públicas) ·
`GET|POST|PATCH|DELETE /api/familias` · `/api/materiales` · `/api/espacios` · `/api/empleados` ·
`GET|POST /api/movimientos` · `/api/comentarios` · `/api/eventos` · `/api/inventarios` ·
`GET|POST /api/transferencias` + `POST /api/transferencias/[id]/confirmar|cancelar` ·
`POST /api/eventos/[id]/confirmar|entregar|devolver|cancelar` + `POST|DELETE /api/eventos/[id]/lineas` ·
`POST /api/inventarios/[id]/conteo|cerrar` ·
**`POST /api/publico/solicitudes` (PÚBLICA, sin sesión)**.

## Despliegue (Vercel — lo provisiona Alberto)
- Proyecto Vercel **`almacen`** (equipo *Pisos turísticos*), **Root Directory `apps/almacen`**,
  install `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`, build `prisma generate && next build`.
  `vercel.json` ya lleva su `ignoreCommand` + `--sin-previews`.
- URL de presentación al cliente (17/07/2026): `almacen-pisos-turisticos-projects.vercel.app`.
  Decisión de Alberto: **no se compra dominio**; cuando Joaquín apruebe se conecta el suyo a mano en
  el panel de Vercel (la integración Vercel MCP **no ve** este proyecto).
- **Envs (por nombre):** `DATABASE_URL`, `DIRECT_URL` (Supabase compartida, rol `prisma_almacen`),
  `ALMACEN_SESSION_SECRET`, `ALMACEN_PUBLIC_CUENTA_ID` (opcional; cuenta cuyo catálogo se publica).
- **Rol de BD `prisma_almacen`**, acotado a least-privilege el 26/07/2026 (antes tenía DML sobre las
  254 tablas de `public`, como todos los `prisma_*`): solo `SELECT/INSERT/UPDATE/DELETE` en las
  `almacen_*` + `SELECT` en `cuentas` (login) + lectura de `fiscal_ayudas`/`ayudas_perfiles` (banner).
  **Si añades una tabla nueva al `schema.prisma`, hay que darle GRANT explícito** (Supabase MCP como
  `postgres`) o en producción falla con `permission denied`. `negocios` está **deliberadamente FUERA**
  del grant (declarado en el schema pero sin uso real hoy).
- NUNCA poner `apps/` en el `.vercelignore` de la raíz (regla de la matriz).

## Landmines — qué NO romper
- 🚨 **`next.config.ts` desactiva las dos redes de seguridad del build**:
  `typescript.ignoreBuildErrors: true` y `eslint.ignoreDuringBuilds: true`. **Un `next build` verde
  NO dice que el código typechequee.** El único gate real es el job `Typecheck · almacen` de
  `.github/workflows/tests.yml` (la app está en su matriz) — en local:
  `cd apps/almacen && pnpm exec prisma generate && pnpm exec tsc --noEmit -p tsconfig.json`.
- 🚨 **El catálogo público cae por defecto a la cuenta DEMO.** `CUENTA_PUBLICA` en `lib/publico.ts:17`
  es `ALMACEN_PUBLIC_CUENTA_ID || '0de50000-…-0001'` (el tenant DEMO). Si algún día se siembra el
  tenant real y no se pone la env, la web pública seguirá enseñando el catálogo de DEMO **sin fallar**.
- ⚠️ **`Negocio.cuenta_id` del `schema.prisma` no existe así en la BD compartida**: `negocios` cuelga
  de `sociedad_id` (jerarquía Cuenta→Sociedad→Negocio). Hoy no se consulta ese modelo, pero **hay que
  corregirlo antes de cablear selección de negocio** (detectado 15/07/2026, sigue en el schema).
- **Una sola vía de escritura de stock**: los servicios de `lib/*.ts` dentro de `$transaction`. No
  escribir `almacen_stock` desde un route sin su movimiento, ni olvidar `recomputarTotales()`: el
  maestro dejaría de cuadrar con la suma de almacenes y nada fallaría.
- **`motivo` es obligatorio** en movimientos de tipo `ajuste` y `rotura` (400 si falta).
- **Rutas públicas exentas en `middleware.ts`**: `/login`, `/api/auth`, `/catalogo`, `/reservar`,
  `/api/publico`. No colgar ahí nada que dependa de la cookie. `POST /api/publico/solicitudes` **NO
  reserva stock** — crea un evento `alquiler` en `presupuesto` que la oficina confirma.
- **Prioridad de eventos (requisito de Alberto):** la web muestra el `disponible`; al confirmar un
  evento el stock pasa a `reservado` y desaparece del escaparate automáticamente. No "arreglar" eso
  mostrando `enPropiedad`.
- **`lib/ayudas.ts` traga cualquier error en un `catch` y devuelve `[]`** → sin banner. Es degradación
  deliberada del panel, pero **no autoriza a afirmar aguas abajo «no hay ayudas»** (regla global del
  monorepo: dato que no se ha mirado ≠ dato que no hay).
- Migraciones a mano como `postgres`, nunca con `prisma_almacen`.
- Capa aditiva: sin datos, las pantallas muestran estados vacíos.

## Estado y pendientes
**Hecho** (Fases 1–4, 15–17/07/2026): maestro editable por familias · multi-almacén con ledger +
snapshot + traspasos en tránsito · eventos/alquileres con ciclo completo · empleados + inventario por
conteo · escaparate público · manual in-app · marca Joaquín Jaén.

**Pendiente / no confirmado** (dilo así, no lo des por hecho):
- 🔴 **Tenant REAL de Joaquín sin sembrar.** El último dato escrito (memoria 17/07/2026 y `MATRIZ.md`)
  dice que solo está poblado el tenant DEMO. **No verificado contra la BD en esta sesión.**
- 🔴 **Cobro con Stripe bloqueado** (conector sin autorizar + claves + dominio). Hasta entonces la
  reserva web es un presupuesto que la oficina confirma a mano.
- 🟠 **No hay consolidación en `apps/plataforma`**: comprobado el 02/09/2026 que ningún archivo de
  `apps/plataforma` lee tablas `almacen_*` (sí aparece la vertical en `lib/estructura.ts`).
  **Tampoco hay intercompany aquí**: a diferencia de `apps/alquiler`/`apps/transporte`, esta app no
  escribe en `operaciones_intercompany` (verificado por grep).
- 🟠 **Fotos del catálogo alojadas en la web del cliente** (URLs externas); pendiente re-hospedarlas
  en Storage.
- **Del alcance acordado con Joaquín y aún NO construido** (ver PARTE 3 del doc): plantillas/bloques
  de material por tipo de evento (sobre `Kit`/`expandirKit`), firma y evidencia foto/vídeo atadas al
  movimiento, muelles de carga como tipo de espacio, calendario con anti-doble-reserva, modo offline,
  PIN temporal para eventuales, proveedores/compras y mantenimiento (Fase 2+), avisos por Telegram y
  el agente IA de previsión de material/personal.
