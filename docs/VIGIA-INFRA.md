# 🏗️ Vigía de infraestructura — cuánto queda para el techo

> Estado de la rutina **`vigia-infra`** (mensual, día 8). Este archivo se **reescribe entero** en
> cada pasada: es idempotente, no un histórico. Lo que pasó vive en `docs/CONTEXTO-SESIONES.md`.
>
> 🔴 **Regla dura:** un límite que no se ha medido **no está bien**, está *sin medir*, y así se
> escribe. Una llamada que falla, devuelve vacío o viene truncada es «no lo sé», nunca «dentro de
> cuota». Y una lista del MCP prueba lo que trae, jamás lo que no trae.

**Última pasada: 21/09/2026** (fundacional — la hizo la sesión que descubrió el problema, no la
rutina programada, que aún no ha disparado).

## Supabase — proyecto `central` (`wswbehlcuxqxyinousql`, eu-west-1)

| Métrica | Medido | Techo | % | |
|---|---|---|---|---|
| Plan de la organización | `free` | — | — | 🟠 |
| Tamaño de la base de datos | **284 MB** | 500 MB | 57 % | 🟢 |
| Tablas con hinchazón >1.000 filas muertas | 0 tras compactar | — | — | 🟢 |
| Advisors (security / performance) | sin medir en esta pasada | — | — | 🟠 |

**Cómo se llegó aquí (21/09/2026), porque marca el criterio de las próximas pasadas:** la BD estaba
en **644 MB sobre un tope de 500**, con la cartera de la correduría, las finanzas y las trece apps
dentro. Se recuperaron:

- **131 MB sin borrar una sola fila**, solo `VACUUM FULL`. El caso extremo: `net._http_response`
  con **0 filas vivas ocupando 44 MB**, sin autovacuum desde el 05/08.
- **229 MB más** al retirar el grafo de código propio (`grafo_nodos`/`grafo_aristas`/
  `grafo_embeddings`): medido sobre 86 sesiones, se usaba en **3**.

🚨 **Lección que hay que aplicar cada mes: borrar filas NO baja el tamaño.** El hueco sigue
asignado a la tabla hasta un `VACUUM FULL` o un `TRUNCATE`. Mira siempre la hinchazón **antes** de
proponer borrar datos de nadie.

⚠️ **El plan sigue en `free` y eso es un 🟠 permanente**, no un 🟢: ahí dentro hay datos personales
de asegurados y el libro de comisiones. El margen de hoy compra meses, no resuelve la cuestión.

## Vercel — equipo `pisos-turisticos-projects`

| Métrica | Medido | Techo | |
|---|---|---|---|
| Build CPU Minutes del periodo | sin medir en esta pasada | — | 🟠 |
| Apps con `ignoreCommand` + `--sin-previews` | sin verificar en esta pasada | todas menos ialimp | 🟠 |
| Spend Management | 50 US$, solo aviso (último dato conocido) | — | 🟢 |

Dos antecedentes que esta rutina existe para que no se repitan: los **~600 US$** de Build CPU de
julio (cada push reconstruía los once proyectos) y la cuota **`api-deployments-paid-per-hour`
(450/h, de cuenta)** agotada el 04/09 por una rama de PR, que tiró despliegues de **producción** de
cuatro proyectos que no tenían nada que ver.

💡 Recordatorio: un build `Ignored` **no es gratis del todo** — el deployment se crea igual y cuenta
para ese límite de 450/h.

## Fly — organización `grupo-asegura`

| Métrica | Medido | |
|---|---|---|
| `asegura-app-cima-adapter` | 2 máquinas en CDG, en la organización de Alberto (medido 21/09) | 🟢 |

Es el eslabón por el que entra CIMA. Si cae, la ingesta de la correduría se para.

## Pendiente para la primera pasada programada

Cerrar los 🟠 de «sin medir»: advisors de Supabase, Build Minutes de Vercel y la auditoría del
`ignoreCommand` app por app.
