---
name: code-map
description: >-
  Úsala al EMPEZAR cualquier tarea de CÓDIGO cuando haya que localizar QUÉ archivo/función maneja algo, ANTES de Grep/Read a ciegas — consulta la tabla Supabase `mapa_arquitectura` (índice de firmas del repo) para acotar candidatos a coste ~0 y leer SOLO esos. No reemplaza a Grep/Read: los enfoca. Sin tabla o sin candidatos, método clásico.
---

# code-map — acota archivos antes de leer (ahorro de tokens)

**Para qué.** Evitar leer archivos enteros a ciegas. `mapa_arquitectura` es un índice de firmas de
función (ruta, funciones+params+retorno, resumen de cabecera, tablas SQL que toca) de TODO el repo
(~2000 archivos). Consultarlo cuesta ~0 tokens y te dice el/los archivo(s) exactos a abrir.

## Cuándo
Al recibir una orden de código ("arregla el bug del login", "añade validación de IBAN", "¿qué archivo
escribe en `movimientos_bancarios`?") y NO sepas ya el archivo. Salta este paso si ya lo sabes.

## Cómo (Supabase MCP, proyecto `wswbehlcuxqxyinousql`)

1. **Extrae 1-4 palabras clave** discriminantes de la orden (nombres, dominios, tablas). Ignora
   "arregla/bug/error/añade/el/la…".

2. **Acota por nombre/resumen/función** (trigram `word_similarity`):
   ```sql
   SELECT ruta, resumen, funciones,
          round(GREATEST(word_similarity('<keywords>', busqueda), 0)::numeric, 3) AS score
   FROM mapa_arquitectura
   WHERE busqueda ILIKE ANY (ARRAY['%<kw1>%','%<kw2>%']::text[])
   ORDER BY score DESC, length(ruta) ASC
   LIMIT 6;
   ```
   Usa `mcp__Supabase__execute_sql` con `project_id='wswbehlcuxqxyinousql'`.

3. **¿Es una tarea sobre una TABLA concreta?** ("qué toca `movimientos_bancarios`") → usa el índice GIN:
   ```sql
   SELECT ruta, jsonb_array_length(funciones) AS n_funcs
   FROM mapa_arquitectura
   WHERE 'movimientos_bancarios' = ANY(tablas)
   ORDER BY n_funcs DESC LIMIT 8;
   ```

4. **Lee SOLO** el/los archivo(s) del top del resultado (el de mayor `score`; los siguientes si el
   primero no basta). Ahí ya tienes las firmas en `funciones` para orientarte antes de abrir.

## Reglas
- **Nunca bloquea.** Si el MCP de Supabase no está, la tabla está vacía, o no hay candidatos con score
  útil → cae al método clásico (Grep/Glob/Read). El mapa acelera, no es obligatorio.
- **Frescura:** el mapa se regenera en cada push a `main` (workflow `auditoria.yml`). Un archivo recién
  creado en esta rama puede no estar aún → si no aparece lo que esperas, usa Grep.
- **No confíes ciegamente en las firmas** del índice (regex, aproximadas): son para SEÑALAR el archivo;
  la verdad es el archivo real, que sí lees entero.
- El coste real que ahorras se registra: el endpoint equivalente escribe en `ai_usos` (`endpoint='codigo'`).

## Callers, impacto, vecinos, tests → un SUBAGENTE (el grafo se retiró el 21/09/2026)

🗑️ **Las tablas `grafo_nodos`/`grafo_aristas`/`grafo_embeddings` y todas las funciones `grafo_*` ya
NO existen.** Se borraron de Supabase el 21/09/2026: ocupaban 258 MB de una BD que estaba por encima
del límite del plan Free y, medido sobre las 86 sesiones de `docs/uso-herramientas/`, se habían usado
en **3**. Si ves un `SELECT * FROM grafo_callers(...)` en algún documento viejo, está obsoleto.

**Cómo se responden ahora esas preguntas:**

| Pregunta | Cómo |
|---|---|
| ¿Dónde vive esta funcionalidad? | Este mismo mapa (`mapa_arquitectura`), que SE QUEDA |
| ¿Quién llama/usa a `X`? | `Grep` del símbolo, o un subagente si hay que cribar muchos resultados |
| ¿Qué rompe si toco este archivo? | Subagente (`Explore`): que greppee importadores y te devuelva la lista |
| ¿Qué tests cubren esto? | `Grep` del símbolo en `**/*.test.ts` |
| Pregunta en lenguaje natural sobre el código | Subagente: acota con este mapa y greppea varios patrones |

**Por qué un subagente y no leerlo tú:** se come los archivos en SU contexto y te devuelve solo el
informe — que es justo lo que aportaba el grafo. En la medición del 21/09, `general-purpose` (596k
tokens citados en 11 sesiones), `Explore` (266k en 8) y `agente-mecanico` (277k en 7) ya ahorraban
más que el grafo (75k en 3).

⚠️ **Lo que se pierde:** la búsqueda semántica sobre código. Un `Grep` no sabe qué querías decir, así
que hay que probar varios patrones. Asumido a cambio de los 258 MB.

✅ **`memoria_buscar()` sigue viva** (`memoria_embeddings`, sobre `docs/CONTEXTO-SESIONES.md` y
`docs/memoria/*.md`): para decisiones, convenciones y gotchas del proyecto. No se tocó.

## Relación con el resto
- Mismo índice que consume el **Director de código** (`apps/plataforma/lib/ia-director-codigo.ts`,
  endpoint `/api/ai/codigo`) para orquestadores externos. Ver `docs/DIRECTOR-CODIGO.md`.
- El índice legible del repo también está en `docs/ARQUITECTURA.generated.md` (mapa grueso: apps,
  módulos, capacidades, rutas, tablas) por si quieres el panorama sin consultar la BD.
