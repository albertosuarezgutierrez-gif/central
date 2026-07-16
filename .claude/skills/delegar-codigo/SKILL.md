---
name: delegar-codigo
description: Úsala en el monorepo `central` cuando una tarea de código tenga trabajo MECÁNICO o VOLUMINOSO (renames masivos, aplicar un mismo patrón a N archivos, boilerplate repetitivo, migraciones planas) y quieras AHORRAR TOKENS de Claude. El esquema "caro planifica / barato ejecuta": tú (Claude alto) organizas y decides, y delegas la escritura de cada archivo a un modelo coder BARATO vía el endpoint `/api/ai/ejecutar` de plataforma (OpenRouter, categoría `codigo`). Tú no generas los diffs grandes: solo planificas, delegas y REVISAS/verificas. NO la uses para lógica sutil (el round-trip + revisión no compensa) ni cuando no haya volumen. Gemela del endpoint; complementa a `code-map` (que acota QUÉ archivos).
---

# delegar-codigo — Claude planifica, un coder barato ejecuta

**Para qué.** Que los tokens caros de Claude se gasten en PENSAR/ORGANIZAR, no en teclear código
mecánico. El coder barato (categoría `codigo` del catálogo del Director, hoy `qwen-2.5-coder`/
`deepseek-chat` vía OpenRouter) reescribe cada archivo; tú planificas y validas.

## Cuándo SÍ
- Aplicar el MISMO cambio a muchos archivos (rename de símbolo, cambiar una firma repetida, migrar un
  patrón de import, añadir un header/campo idéntico).
- Boilerplate voluminoso y predecible (CRUD repetido, adaptadores gemelos, fixtures).
- Reescrituras planas donde la instrucción es inequívoca y el criterio de aceptación es claro.

## Cuándo NO (hazlo tú directamente)
- Lógica sutil, decisiones de arquitectura, algo con muchos casos borde o que toca invariantes del repo
  (LANDMINES de los CLAUDE.md). Ahí el coste de revisar el diff del barato ≥ hacerlo tú.
- Cambios de 1-2 archivos pequeños: el round-trip no compensa.

## Cómo (protocolo de 4 pasos)

1. **ACOTA (0 tokens)** — con la skill `code-map` o `POST /api/ai/codigo` averigua QUÉ archivos.

2. **PLANIFICA (tú, el caro)** — para cada archivo a tocar, redacta una instrucción PRECISA y su
   criterio de aceptación. Este es el trabajo que justifica tus tokens: el barato solo obedece.
   `[{ ruta, instruccion, criterio }]`.

3. **DELEGA cada archivo al ejecutor barato** — atajo con el CLI (lee el archivo y reescribe en sitio):
   ```bash
   node scripts/ai-ejecutar.mjs --ruta "<ruta>" --instruccion "<instrucción precisa>" --criterio "<aceptación>"
   # --dry para solo imprimir sin escribir; --maxTokens N (default 8000); --smoke = healthcheck del endpoint
   ```
   Envs `PLATAFORMA_URL` + `AI_GATEWAY_SECRET`. El CLI manda el `contenido` ACTUAL del archivo (el ejecutor
   trabaja archivo a archivo, no lee el repo) y escribe la respuesta en sitio; imprime el `modelo` servido.
   Alternativa de una línea sin el CLI: `curl -sS "$PLATAFORMA_URL/api/ai/ejecutar" -H "Authorization: Bearer
   $AI_GATEWAY_SECRET" -H 'Content-Type: application/json' -d '{"ruta":"…","instruccion":"…","contenido":"…"}'`
   → `{ contenido, modelo, ruta }`.

4. **REVISA + VERIFICA + INTEGRA (tú)** — escribe el `contenido` devuelto con Write, léelo por encima
   (¿hizo SOLO lo pedido?, ¿respetó estilo/imports?) y **verifica** (`tsc`/tests/build). Si el barato
   se desvió, corrige a mano o reintenta con la instrucción afinada. El diff que se commitea es tuyo.

## Reglas
- **Nunca a ciegas:** el código del barato NO se commitea sin que lo revises y pase la verificación. Tú
  eres responsable del diff.
- **Nunca bloquea:** si `/api/ai/ejecutar` no está disponible (sin `AI_GATEWAY_SECRET`, 429 de
  presupuesto, 502), haz el cambio tú. La delegación acelera/abarata, no es obligatoria.
- **Presupuesto y telemetría automáticos:** el endpoint respeta el presupuesto diario/mensual de la
  pasarela y registra cada uso en `ai_usos` (`endpoint='ejecutar'`) — el ahorro se ve en `/operador/ia`.
- **Sin secretos aquí:** solo nombres de env (`AI_GATEWAY_SECRET`, `PLATAFORMA_URL`). Los valores viven
  en Vercel.
- **Verifica antes de cerrar:** `cd apps/plataforma && npx tsc --noEmit` + `next build`, o los tests que
  toque. Sin verde, no está hecho.

## Relación con el resto
- **`code-map`** acota QUÉ archivos (0 tokens); **esta skill** delega CÓMO escribirlos al coder barato.
- Endpoint servidor: `apps/plataforma/app/api/ai/ejecutar/route.ts` (categoría `codigo` vía
  `chatConDirector`). El planificador Claude alto como servicio autónomo es la categoría `plan` del
  catálogo (Fase 2). Ver `docs/DIRECTOR-CODIGO.md` y `docs/ESTUDIO-DIRECTOR-CODIGO-TOKENS.md`.
