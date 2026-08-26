---
name: central-maestro
description: >
  Dispatcher de contexto del monorepo `central` (casa de marcas). Úsalo al EMPEZAR cualquier
  trabajo sobre el proyecto cuando no esté claro de qué vertical/módulo se trata, o para tareas
  transversales (matriz, packages compartidos, reglas de Vercel, BD compartida). Identifica la
  vertical afectada y enruta al maestro correcto (ia-rest / sivra / ialimp / plataforma) ANTES
  de pensar o tocar código. NO duplica contenido: es el índice de entrada del repo.
---

# CENTRAL — dispatcher de contexto

> Punto de entrada del monorepo. No copia contexto: te manda al sitio correcto.
> La estructura viva está en `MATRIZ.md`; el estado entre sesiones en `docs/CONTEXTO-SESIONES.md`.

## Paso 0 — orienta antes de actuar
1. Lee `CLAUDE.md` (raíz, se carga solo) y, si dudas de la estructura, `MATRIZ.md`.
2. Lee la(s) entrada(s) de arriba de `docs/CONTEXTO-SESIONES.md` (estado vivo: qué se hizo / qué queda).
3. Identifica **qué vertical o capa** toca la petición y enruta (tabla de abajo).
4. Confirma el objetivo con el contexto cargado; recién entonces planifica/codifica.

## Enrutado por vertical (apps/*)
| Si la petición es de… | Vertical | Salta a la skill |
|---|---|---|
| Voice POS / hostelería, TPV, KDS, VeriFactu, QR mesa, comandas | **ia-rest** (`iarest.es`) | `ia-rest-maestro` |
| Intranet pisos turísticos Sevilla, pricing dinámico, Smoobu, finanzas piso | **sivra** | `sivra-maestro` |
| SaaS de limpiezas, app limpiadora `/l`, portal propietario, white-label | **ialimp** (`app.ialimp.es`) | `ialimp-maestro` |
| Cuadro de mando consolidado, god-panel `/admin`, Cuenta→Sociedad→Negocio, **concursos/licitaciones** | **plataforma** | `plataforma-maestro` |
| Flota/camiones como negocio, vehículos, conductores, portes, rutas, servicios de transporte, intercompany flota→catering | **transporte** | `transporte-maestro` |
| Alquiler de materiales/menaje (catálogo, tarifas/día, fianzas, disponibilidad, reserva→devolución), intercompany materiales→eventos | **alquiler** | `alquiler-maestro` |
| Correduría de seguros **OPERATIVA**: clientes, pólizas, siniestros, vencimientos, integraciones con aseguradoras | **asegura** (Grupo Asegura) — 🚧 **el ESQUELETO ya existe** en `apps/asegura` (auth, layout, manifiestos); la **cartera aún NO está migrada** | `apps/asegura/CLAUDE.md` + `docs/TRASPASO-CORREDURIA.md` |
| "¿Se ha roto algo?", auditoría, pruebas/testeo, post-rename/migración | (transversal) | `auditoria-central` |
| Logo, banner, imagen de marca, mockup visual, iconos, diseño gráfico, activo visual | (transversal Adobe CC) | `adobe-diseno` |
| "Adáptalo a la imagen corporativa de X", "corporativo 100%", cliente/tenant nuevo o rebrand, dejar la UI idéntica a SU marca (logo/colores/tipografía) | (transversal `@central/brand`) | `marca-cliente` |

### 🛡️ Seguros — DOS cosas distintas con el mismo nombre (20/08/2026)
Preguntar por «la correduría» es ambiguo y las dos respuestas viven en sitios distintos:
- **Comisiones COBRADAS** (matriz compañía×mes, CIMA/TIREA, derivado de `movimientos_bancarios`
  con `destino='seguros'`, siempre BBVA) → **existe y está vivo** en `apps/plataforma /correduria`
  + `lib/correduria.ts` → skill `plataforma-maestro`.
- **Operativa del CRM** (clientes, pólizas, siniestros) → **el ESQUELETO ya está** en `apps/asegura`
  (auth propia, layout, manifiestos; 26/08/2026), pero **la cartera NO se ha migrado**. La desarrolló
  **Manuel Suárez** (hermano de Alberto) en SU Supabase (`uijsgeocgdaxkhvwtjqs`, que Claude **sí lee por
  `project_id`**) y SU Vercel. Fase 1 CERRADA con inventario medido: **52 tablas, 32.600 clientes, 28.843
  pólizas, 92 MB**. En `central`: schema `seguros` (vacío) + rol `prisma_seguros` (inerte, sin contraseña),
  en `apps/asegura/prisma/sql/2026-08-19_asegura_bootstrap.sql`.
  🚨 **Es una migración EN CALIENTE:** CIMA/EIAC descarga ficheros a diario en el despliegue de Manuel →
  apagarlo corta la entrada de pólizas, recibos y siniestros. El corte necesita **fecha y hora acordadas**.
  ⚠️ **RLS y auth son UNA decisión:** las 86 políticas se resuelven todas por `auth.uid()` de Supabase Auth;
  al re-plataformar la auth, y con `prisma_seguros` en BYPASSRLS, el fallo no sería «no se ve nada» sino
  **«se ve todo sin que falle nada»**. Estado, mensaje a Manuel y pasos: `docs/TRASPASO-CORREDURIA.md`.

**🏷️ Nombres — los tres son correctos, cada uno en su capa** (esto causó dos planes duplicados el
20/08/2026): app/carpeta/Vercel = **`apps/asegura`** (la marca), schema y rol de BD = **`seguros`** /
`prisma_seguros` (el dominio), módulo compartido si aparece = `packages/module-seguros`. **Hubo un
`docs/ASEGURA-MIGRACION.md` que planificaba lo mismo con otro nombre: se fundió en
`docs/TRASPASO-CORREDURIA.md` y se borró.** Si lees `apps/seguros` en algún sitio, es residuo previo
a la fusión.

🚨 **Que no esté en el repo NO significa que no exista** — es el error que ya se cometió con la landing
de House Sevillana (se afirmó «no hay web» porque vivía fuera del monorepo, PR #1387→#1388). Antes de
decirle a Alberto que algo «no existe», comprueba si es que **vive fuera** de `central`.

## Capa común (matriz + packages/*) — reglas que NO se rompen
- La **raíz es la MATRIZ**, no una vertical. No metas lógica de producto en la raíz.
- Módulos compartidos en `packages/*` = **TS puro, sin build** (`@central/*`). Cada app que los consume
  DEBE listarlos en `transpilePackages` **y** declararlos en deps.
- Scope npm = **`@central/*`** (renombrado desde `@iarest/*`). El guardián `pnpm test:guardia` falla si reaparece `@iarest/`.
- **Vercel por app**: un proyecto por carpeta, Root Directory `apps/<app>`, install `--legacy-peer-deps`.
  **NUNCA** poner `apps/` en el `.vercelignore` de la raíz (se aplica a todos los proyectos).

## BD compartida (multi-tenant) — frontera crítica
- Supabase **`wswbehlcuxqxyinousql`** la comparten **ialimp + sivra + plataforma + transporte + alquiler** (schema `public`, scope `empresa_id`/`cuenta_id`).
- **ia-rest** también vive aquí, en su **schema `iarest`** (runtime + Edge Functions + crons, cierre 19/08/2026);
  su proyecto viejo `efncqyvhniaxsirhdxaa` fue borrado definitivamente (19/08/2026). Plataforma lo sigue leyendo por **puerto HTTP**
  (patrón de aislamiento entre apps), no por Prisma sobre `iarest.*`.
- **Cada app conecta con su PROPIO rol de BD** (`prisma_sivra`, `prisma_ialimp`, `prisma_plataforma`, `prisma_transporte`,
  `prisma_alquiler`; rrhh→`rrhh_app`; correduría→`prisma_seguros` sobre el schema `seguros`, creado pero
  **inerte hasta que se le ponga contraseña**). Todos: `login` + `BYPASSRLS` + grants DML en `public`, **sin CREATE** (mínimo privilegio). **NUNCA conectar una app
  como `postgres`** (superusuario): resetear su contraseña tumba a todas a la vez (incidente 26/06). Una app/vertical nueva → **dale
  su rol** clonado de `prisma_sivra`. Pooler: `<rol>.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com` (6543 pooled `?pgbouncer=true` / 5432 direct).
  Las **migraciones** se aplican como `postgres` (Supabase/MCP), no por el rol de la app.
- **Supabase auto-activa RLS** en cada tabla nueva de `public` (visto en `flota_*`/`transporte_*`/`alquiler_*`).
  Las apps no se rompen porque sus roles `prisma_*` tienen **BYPASSRLS**. PERO cualquier acceso SIN bypass
  (REST/anon, o un rol nuevo sin bypassrls) verá **0 filas** hasta que crees políticas RLS. Tenlo en cuenta.
- Cualquier cambio de RLS/buckets/GRANTs en `public` puede romper otra app silenciosamente → valida con `auditoria-central`.
- 🔴 **Claves de API de Supabase — PENDIENTE ABIERTO (19/08/2026).** La `service_role` legacy estuvo
  publicada ~3 meses en la historia del repo suelto `house-sevillana-landing` y **sigue siendo válida**
  (borrar el repo quita la exposición, no invalida la clave). El proyecto ya tiene las claves nuevas
  (`sb_secret_…` / `sb_publishable_…`, nombre `default`) conviviendo con las legacy. Dos trampas al migrar:
  el panel **no desactiva las legacy por separado** (un solo botón «Disable JWT-based API keys» mata `anon`
  Y `service_role`), y una clave nueva **no es un JWT** → viaja en la cabecera `apikey`, nunca en
  `Authorization: Bearer`. Plan, inventario y piloto en **`docs/ROTACION-SERVICE-ROLE.md`**; mientras ese
  doc siga vivo, el trabajo NO está hecho.

## Principio de la matriz
Los cambios que ROMPEN (renames de scope, reestructuras de BD, cortes de infra) se hacen **AHORA**, sin
clientes en producción (decisión de Alberto). OJO: ialimp **ya tiene cliente en vivo** (Sique Brilla) → ahí, preview verde antes de `main`.
