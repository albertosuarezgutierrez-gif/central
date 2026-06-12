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
| SaaS de limpiezas, app limpiadora `/l`, portal propietario, concursos, white-label | **ialimp** (`app.ialimp.es`) | `ialimp-maestro` |
| Cuadro de mando consolidado, god-panel `/admin`, Cuenta→Sociedad→Negocio | **plataforma** | `plataforma-maestro` |
| "¿Se ha roto algo?", auditoría, pruebas/testeo, post-rename/migración | (transversal) | `auditoria-central` |

## Capa común (matriz + packages/*) — reglas que NO se rompen
- La **raíz es la MATRIZ**, no una vertical. No metas lógica de producto en la raíz.
- Módulos compartidos en `packages/*` = **TS puro, sin build** (`@central/*`). Cada app que los consume
  DEBE listarlos en `transpilePackages` **y** declararlos en deps.
- Scope npm = **`@central/*`** (renombrado desde `@iarest/*`). El guardián `pnpm test:guardia` falla si reaparece `@iarest/`.
- **Vercel por app**: un proyecto por carpeta, Root Directory `apps/<app>`, install `--legacy-peer-deps`.
  **NUNCA** poner `apps/` en el `.vercelignore` de la raíz (se aplica a todos los proyectos).

## BD compartida (multi-tenant) — frontera crítica
- Supabase **`wswbehlcuxqxyinousql`** la comparten **ialimp + sivra + plataforma** (schema `public`, scope `empresa_id`/`cuenta_id`).
- **ia-rest** usa schema `iarest` (aislado por `search_path`), pero sus **datos vivos** siguen en su proyecto propio
  `efncqyvhniaxsirhdxaa`; plataforma lo lee por **puerto HTTP**, no por Prisma sobre `iarest.*` (clon vacío).
- Cualquier cambio de RLS/buckets/GRANTs en `public` puede romper otra app silenciosamente → valida con `auditoria-central`.

## Principio de la matriz
Los cambios que ROMPEN (renames de scope, reestructuras de BD, cortes de infra) se hacen **AHORA**, sin
clientes en producción (decisión de Alberto). OJO: ialimp **ya tiene cliente en vivo** (Sique Brilla) → ahí, preview verde antes de `main`.