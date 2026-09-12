# Grafo de código propio + medición del uso de herramientas — diseño (12/09/2026)

**Origen.** Alberto: «Estamos usando graphify y se acaba free, ¿podríamos crear nuestro propio graphify?»
→ «Hazlo, revisa todo y […] se debería controlar el ahorro que tenemos con cada cosa que tenemos» →
«Controlar el uso como bien dices».

**Diagnóstico previo.** Graphify llevaba 3 días como regla obligatoria sin medir cuánto ahorra. Ya
existía medio grafo en casa (`mapa_arquitectura` + `scripts/auditar-estructura.mjs` + skill `code-map`):
firmas por archivo, sin ARISTAS. Lo que faltaba para sustituir el uso diario era import/llamada y las
consultas derivadas (callers, vecinos, impacto, tests).

## Decisiones

1. **Extractor por regex, Node puro, sin compilador** (`scripts/grafo-codigo.mjs`). El workflow
   `auditoria.yml` corre sin `pnpm install`, así que la API de TypeScript no está disponible. Los
   imports son sintaxis simple y se resuelven bien; las llamadas se detectan sobre nombres importados
   o declarados en el archivo. Precisión medida contra Graphify el mismo día: callers idénticos en el
   símbolo probado. Lo que no ve se declara en la cabecera del script.
2. **Barriles resueltos en el extractor** (`resolverSimbolo`, ≤4 saltos) y **en SQL**
   (`grafo_deps_archivo`: dependencia archivo→archivo por import literal O por símbolo usado). Sin lo
   segundo, el impacto de `cartera-viva.ts` se paraba en `index.ts`.
3. **Sin MCP propio** (fase 1). Las consultas van por el MCP de Supabase que ya está conectado, con
   funciones SQL empaquetadas (`grafo_callers/callees/impacto/vecinos/tests_de/find`). Un servidor MCP
   HTTP en plataforma solo si esto resulta torpe de usar.
4. **Carga por lotes** (`/api/internal/grafo-codigo`, `scripts/grafo-codigo-inyectar.mjs`): el JSON
   pesa ~15 MB y Vercel corta a 4,5 MB. El último lote borra por `sha` → nunca hay una ventana con la
   tabla vacía. No se commitea el JSON (churn).
5. **Medición automática por hook `PostToolUse`** (`scripts/uso-herramientas.mjs`), un JSON por sesión
   y mes, persistido por el `Stop` hook. Mide uso y coste; **no mide utilidad** (eso sigue manual). Los
   «tokens citados» son cota superior del ahorro y se rotulan así.
6. **Graphify pasa a segundo plano**: mientras haya cuota, solo para `query_graph` semántico; callers/
   impacto/vecinos/tests van al grafo propio. `CLAUDE.md` actualizado.

## Fuera de alcance (a propósito)
Embeddings/`query_graph` semántico; memoria `remember`; servidor MCP propio; medir utilidad automáticamente.

## Verificación
Tests `test/grafo-codigo.test.ts` (10) y `test/uso-herramientas.test.ts` (8), vistos en rojo rompiendo
a propósito la resolución de barriles, el salto de statements multilínea y la clasificación del hook.
Funciones SQL probadas sobre un set sintético (rollback). Extractor sobre el repo entero: 4.124 archivos,
17.215 nodos, 61.925 aristas, 1,8 s.
