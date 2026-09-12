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

- (12/09/2026) `case 'proyecto_vigente'` + guarda `never` en los 6 `switch` de los flujos «nuevo» de plataforma (PR #2806) — agente-mecanico — ok (tsc limpio, 6/6 ficheros, 123k tokens del subagente)
