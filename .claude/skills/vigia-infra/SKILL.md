---
name: vigia-infra
description: Agente PROGRAMADO mensual (día 8) que vigila los LÍMITES de la infraestructura — tamaño y plan de Supabase contra su cuota, hinchazón recuperable, advisors, Build Minutes y ritmo de deployments de Vercel, máquinas de Fly. Estado en docs/VIGIA-INFRA.md; Telegram + PR draft. Úsala si Alberto pregunta "¿estamos cerca de algún límite?" / "¿vamos a tener que pagar algo?" o al disparo mensual. Sin secretos.
---

# Vigía de infraestructura y cuotas

Vigila **los techos**: cuánto queda para que un proveedor deje de servir. Entorno **efímero**: cada
pasada es completa e idempotente; el estado vive en **`docs/VIGIA-INFRA.md`** (commiteado).

> 🔥 **Por qué existe.** Van tres sustos del mismo tipo, y ninguno lo cazó una alerta:
> - **15/07/2026** — ~600 US$ de Build CPU Minutes en un mes porque cada push reconstruía los once
>   proyectos Vercel (PR #904).
> - **04/09/2026** — cuota `api-deployments-paid-per-hour` (450/h, **de cuenta**) agotada por una
>   rama de PR, con los despliegues de **producción** de cuatro proyectos fallando de rebote.
> - **21/09/2026** — `central` en **644 MB** sobre un tope de 500 (plan Free), con la cartera de la
>   correduría, las finanzas y todas las apps dentro. Lo vio Claude en Chrome **de refilón**,
>   mirando otra cosa.
>
> Los tres eran medibles con una consulta. El problema nunca fue el límite: fue que nadie miraba.

> ⚠️ **REGLA DURA — un límite que no has medido NO está bien.** Si una llamada falla, devuelve
> vacío o viene truncada, eso es **«no lo sé»**, y así se escribe en el informe. Jamás «dentro de
> cuota». Es la regla de la casa (`CLAUDE.md`: «un check que se pone verde porque la consulta no
> devolvió nada es el fallo más caro que hay»), y aquí se incumple con especial facilidad porque
> los paneles de cuota son justo los que peor responden por API.
>
> **Corolario medido (05 y 07/09/2026):** una lista del MCP de Vercel prueba lo que SÍ trae, **nunca
> lo que no**. `list_projects` no devolvía `asegura-web` (existía) y `get_project.domains` devolvía
> solo los alias automáticos del equipo (los dominios reales estaban atados). Para afirmar una
> ausencia hace falta el panel o un `curl` al host, no el hueco en un JSON.

## Paso 1 — Supabase (el que más duele: ahí está el negocio)

Por `mcp__Supabase__*` sobre **`wswbehlcuxqxyinousql`** (`central`):

1. **Plan y techo.** `get_organization` → `plan`. En `free` el tope de base de datos son 500 MB.
2. **Tamaño real y margen.** `SELECT pg_size_pretty(pg_database_size(current_database()))`.
   Informa **el porcentaje del tope**, no solo los MB. 🟢 <70 % · 🟠 70-90 % · 🔴 >90 % o por encima.
3. **Hinchazón recuperable ANTES de proponer borrar nada.** El 21/09 se recuperaron **131 MB sin
   borrar una sola fila**, solo compactando; `net._http_response` tenía **0 filas vivas ocupando
   44 MB** y llevaba sin autovacuum desde el 05/08.
   ```sql
   select schemaname||'.'||relname tabla, n_live_tup vivas, n_dead_tup muertas,
          pg_size_pretty(pg_total_relation_size(relid)) tam, last_autovacuum
   from pg_stat_user_tables
   where n_dead_tup > 1000 or pg_total_relation_size(relid) > 10*1024*1024
   order by n_dead_tup desc limit 15;
   ```
   🚨 **Dato que hay que recordar cada vez: borrar filas NO baja el tamaño.** El hueco sigue
   asignado a la tabla hasta un `VACUUM FULL` (que sí toma lock exclusivo) o un `TRUNCATE`. Si
   propones un borrado sin compactar, el informe promete un ahorro que no va a llegar.
   ⚠️ `VACUUM` no corre dentro de una transacción: una sentencia por llamada, nunca en lote.
4. **Reparto por esquema**, para saber si lo que pesa es negocio o herramienta de desarrollo — y
   decirlo. El 21/09 el negocio de las trece apps sumaba <80 MB y el resto era utillaje de agentes.
5. **`get_advisors`** (`security` y `performance`), y se citan con su URL de remedio.

**Lo que NO haces:** borrar. Mides, propones con cifras y esperas a Alberto. La única excepción son
los `VACUUM FULL` sobre tablas de log internas sin filas vivas, que no pierden nada — y aun esos se
anotan en el informe uno por uno.

## Paso 2 — Vercel

Por `mcp__Vercel__*` (equipo `pisos-turisticos-projects`, `team_f4gPpt6dPuNcd5YyMt3q27uf`):

1. **Build CPU Minutes** del periodo y su tendencia contra el mes anterior.
2. **Higiene del `ignoreCommand`:** que **cada** `apps/*/vercel.json` lleve
   `"ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/<app>"` y `--sin-previews`
   (ialimp va sin el flag **a propósito**: cliente vivo). Una app nueva sin esa clave reconstruye
   todos los proyectos en cada push — es el incidente de los 600 US$.
3. **Ritmo de deployments.** Recuerda que un build `Ignored` **no es gratis del todo**: el
   deployment se crea igual y cuenta para el límite de 450/h **de cuenta**. Si ves ráfagas de
   pushes a ramas de PR, dilo: es un aviso de ritmo, no de configuración.
4. **Spend Management** sigue en 50 US$, solo aviso. Comprueba que no se ha movido.

## Paso 3 — Fly

Organización **`grupo-asegura`** de Alberto: `asegura-app-cima-adapter`, 2 máquinas en CDG. Que
sigan vivas y en su organización (no en la de Manuel). Es el eslabón por el que entra CIMA: si cae,
la ingesta de la correduría se para.

## Paso 4 — Informe

- Reescribe **`docs/VIGIA-INFRA.md`** entero (idempotente): una tabla por proveedor con
  `métrica · valor medido · techo · % · semáforo`, y la fecha de la medición en cada fila.
- **Telegram** solo si hay 🟠 o 🔴, o si algo ha cambiado de semáforo desde la pasada anterior. Un
  mes verde no se anuncia.
- **PR draft** si propones un cambio de configuración o un borrado. Nunca lo apliques tú.
- Si algo no se pudo medir, va en el informe como **«sin medir»** con el motivo, y cuenta como 🟠.

## Lo que esta skill NO hace

- No toca datos de negocio, ni secretos, ni rota credenciales.
- No decide si se paga un plan: pone el número y el coste delante de Alberto.
- No sustituye a `conectores-vigia` (¿funcionan los conectores?) ni a `psd2-health-check` (¿llegan
  los datos?). Esta pregunta solo una cosa: **¿cuánto queda para el techo?**
