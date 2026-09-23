# Bitácora de uso — `agente-mecanico` / `delegar-codigo`

> **Para qué.** `CLAUDE.md` § "Trabajo mecánico → SIEMPRE a un agente" pedía anotar solo los FALLOS de
> `agente-mecanico`. Eso sesga la medición: sin saber cuántas veces se usó en total, un fallo de cada
> diez y uno de cada dos son indistinguibles. Aquí se anota CADA invocación, salga bien o mal —
> numerador y denominador — para saber si el modelo económico ahorra tokens de verdad.
>
> **Quién anota.** La sesión principal, en el mismo commit/PR donde usó `agente-mecanico` o
> `delegar-codigo` (o en un commit propio a `main` si la tarea no tocó código). Una línea por uso.
>
> **Formato:**
> `- (dd/mm/aaaa) <tarea corta> — agente-mecanico|delegar-codigo — ok | fallo: <qué falló>`

## Usos (lo más reciente arriba)

- (20/09/2026) tres artículos de siniestro por ramo en `apps/asegura-web/lib/articulos.ts` (coche / fuga de agua / salud) — agente-mecanico — ok (46 tests + tsc en verde; un solo retoque a mano: «te ahorra un viaje» → «te evita un viaje», que el cepo de copy no caza porque no es de precio)
- (20/09/2026) embudo PostHog en `asegura-web` (`lib/medir.ts`, `EnlaceMedido`, 7 CTAs, formulario, calculadora, 11 tests con cepo visto en rojo) — agente-mecanico — ok con retoque: puso `calculadora_calculo` en el botón «+ Otro seguro» (la calculadora no tiene botón calcular); se movió a un `useEffect` al primer resultado con fecha
- (20/09/2026) delegar-codigo NO disponible en este contenedor (`AI_GATEWAY_SECRET` ausente) — delegar-codigo — fallo: sin secreto no hay OpenRouter; se usó agente-mecanico para las dos tareas de arriba

- (12/09/2026) endpoint `/api/internal/grafo-codigo` + `scripts/grafo-codigo-inyectar.mjs` + step de `auditoria.yml`, calcados del patrón `mapa-arquitectura` — agente-mecanico — ok (typecheck 0 errores; solo se retocó un comentario de cabecera)
- (12/09/2026) `case 'proyecto_vigente'` + guarda `never` en los 6 `switch` de los flujos «nuevo» de plataforma (PR #2806) — agente-mecanico — ok (tsc limpio, 6/6 ficheros, 123k tokens del subagente)
- (21/09/2026) botón «Guardar» + campos editables + avisos + manejo del 409 en `apps/asegura/app/(usuario)/cartera/subir/subir-poliza.tsx` — agente-mecanico — ok con retoque: tocó `globals.css` (no estaba en su lista, pero ahí es lo correcto: las media queries no caben en estilos inline) y usó DOS tokens inexistentes en asegura, `--text-muted` y `--brand-rgb` → `--muted` y `--brand-soft`. Un token que no existe invalida la declaración entera SIN dar error, así que el typecheck que pegó en su informe estaba en verde sobre un placeholder sin color y un focus sin sombra.
- (23/09/2026) envolver las 44 rutas de escritura de `apps/asegura/app/api/operador/*` con `auditado()` — agente-mecanico — ok con retoque: informó «28 archivos» (eran 44, todos bien) y dio por roto el cepo, que tenía un bug real en su regex (`=\s*(?!auditado\()` casaba con cero espacios); arreglado por la sesión.
- (23/09/2026) 34 clientes del puerto de asegura en plataforma → `cabecerasPuerto()` — agente-mecanico — ok con retoque: dejó `poliza-asegura.ts` importando `./puerto-actor` SIN `.ts`, que `node --test` no resuelve; lo cazaron los guardianes de la raíz (`pnpm test:guardia`), no los tests de la app que él corrió.
- (23/09/2026) enganchar `anotarCambio()` en las 8 libs de escritura de asegura (pieza c de ASegura OS) — agente-mecanico — ok con retoque: añadió dos lecturas a la BD (`findFirst` en `marcarRevisado`/`borrarDocumento`) que el prompt prohibía; la sesión las quitó (el `where` ya fija el estado anterior).
