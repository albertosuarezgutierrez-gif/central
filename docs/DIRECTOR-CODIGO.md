# Director de código — flujo de ahorro de tokens

> Cómo un agente programador resuelve una orden de desarrollo SIN leer el repo entero.
> Implementación: `apps/plataforma/lib/ia-director-codigo.ts` + endpoint `app/api/ai/codigo`.
> Índice que consulta: tabla Supabase `mapa_arquitectura` (poblada por `scripts/auditar-estructura.mjs`
> → `docs/mapa-funciones.generated.json` → `app/api/internal/mapa-arquitectura`, auto en cada push a `main`).

## Protocolo (pégalo en el prompt/lógica del Agente Director)

Cuando recibas una orden de desarrollo (ej. "arregla el bug del login", "añade validación de IBAN"),
NO leas el repositorio entero. Sigue estos pasos:

- **Paso A — ACOTAR (0 tokens de contexto):** llama a `POST /api/ai/codigo` con `{ "tarea": "<la orden>" }`.
  Devuelve los archivos candidatos (ruta + firmas de funciones + tablas que tocan) y el modelo recomendado,
  ya elegido según presupuesto y complejidad.
- **Paso B — DECIDIR:**
  - `sinMapa: true` o `archivos` vacío → cae al método clásico (grep/lectura); el mapa no cubre esta petición.
  - `stale: true` → el mapa está algo viejo; usa los candidatos pero amplía la búsqueda si no cuadran.
  - Con candidatos → usa el PRIMERO (mayor `score`); los siguientes solo si el primero no basta.
- **Paso C — CARGAR SOLO ESE ARCHIVO:** lee el contenido COMPLETO del/los archivo(s) candidato(s). Nada más.
  (El ahorro está aquí: mandas 1 archivo, no el repositorio.)
- **Paso D — EJECUTAR (Model Routing):** envía `{ tarea + archivo completo }` al `modelo` devuelto, por
  OpenRouter. Pide un DIFF unificado o el archivo reescrito completo. NUNCA "solo el fragmento".
- **Paso E — APLICAR:** aplica el diff (`git apply`) o reescribe el archivo entero; verifica (tsc/tests)
  antes de darlo por bueno. Los archivos reales quedan intactos salvo por el cambio pedido.

## Contrato de la API — `POST /api/ai/codigo`

Auth: `Authorization: Bearer <AI_GATEWAY_SECRET>` (mismo env que la pasarela IA).

**Request:** `{ "tarea": "Arregla el bug del login", "topN": 6, "cliente": "opcional-refacturación" }`

**Response:**
```json
{
  "archivos": [
    { "ruta": "apps/rrhh/app/login/page.tsx", "resumen": "...",
      "funciones": [{ "nombre": "...", "params": "...", "retorno": "..." }],
      "tablas": ["..."], "score": 1.0 }
  ],
  "modelo": "anthropic/claude-sonnet-4.5",
  "fallbacks": ["..."],
  "sinMapa": false, "stale": false, "sha": "e7f6c66...", "tokensIndice": 320
}
```

**Snippet de orquestador (Node/TS):**
```ts
async function acotar(tarea: string) {
  const r = await fetch(`${process.env.PLATAFORMA_URL}/api/ai/codigo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tarea }),
  })
  if (!r.ok) return { sinMapa: true, archivos: [] as { ruta: string }[] } // degrada al método clásico
  return r.json() as Promise<{
    archivos: { ruta: string; funciones: unknown; tablas: string[]; score: number }[]
    modelo: string; fallbacks: string[]; sinMapa: boolean; stale: boolean
  }>
}

// Uso:
const { archivos, modelo, sinMapa } = await acotar('arregla el bug del login')
if (sinMapa || !archivos.length) { /* grep/read clásico */ }
else {
  const contenido = await fs.readFile(archivos[0].ruta, 'utf8')  // solo ESE archivo
  // → { tarea + contenido } al `modelo` por OpenRouter → recibe diff → git apply
}
```

## Notas
- El endpoint **acota + elige modelo**; la llamada que EDITA el código (Paso D) la hace el orquestador con
  el `modelo` devuelto. Alternativa: enrutar esa edición por `/api/ai/chat` (que ya pasa por el Director de
  modelos vía `lib/pasarela.ts::chatConDirector`) en vez de OpenRouter directo.
- Envs del orquestador: `PLATAFORMA_URL` + `AI_GATEWAY_SECRET` (los de Vercel).
- Enrutado por complejidad: categoría `codigo` del catálogo (`ia-director-refresh`) — barato (deepseek/
  qwen-coder) para lo mecánico, premium (claude-sonnet/opus) para lo complejo, dentro del presupuesto.
- Nunca bloquea: cualquier fallo del mapa degrada al camino clásico.

## Medir el ahorro (tabla `ai_usos`, `endpoint='codigo'`)

Cada acotado registra una fila en `ai_usos` con `endpoint='codigo'` (modelo elegido, ms, tokens del
índice devuelto, coste, `cliente_ref`). Consultas útiles (Supabase `wswbehlcuxqxyinousql`):

```sql
-- Volumen y coste del Director de código (últimos 30 días)
SELECT count(*) AS tareas,
       count(*) FILTER (WHERE ok) AS ok,
       round(avg(ms))::int AS ms_medio,
       sum(tokens) AS tokens_indice,
       round(sum(coste_eur)::numeric, 4) AS coste_eur
FROM ai_usos
WHERE endpoint = 'codigo' AND creada_at >= now() - interval '30 days';

-- Reparto por modelo (¿cuánto va a barato vs premium?)
SELECT split_part(modelo, ':', 1) AS modelo, count(*) AS tareas,
       round(sum(coste_eur)::numeric, 4) AS coste_eur
FROM ai_usos
WHERE endpoint = 'codigo' AND creada_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY tareas DESC;
```

**El ahorro real** = tokens que NO se leyeron. `ai_usos.tokens` en las filas `codigo` es el tamaño del
ÍNDICE devuelto (unos cientos de tokens); compáralo con lo que costaría leer el repo/varios archivos
enteros por tarea (decenas de miles). Regla de oro: cada tarea acotada evita leer todo menos 1 archivo.
El panel `/operador/ia` ya lista `endpoint` en los usos recientes; filtrando por `codigo` ves el detalle.
