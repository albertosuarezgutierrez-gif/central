---
name: code-map
description: Úsala al EMPEZAR cualquier tarea de CÓDIGO cuando haya que localizar QUÉ archivo/función maneja algo, ANTES de Grep/Read a ciegas — consulta la tabla Supabase `mapa_arquitectura` (índice de firmas del repo) para acotar candidatos a coste ~0 y leer SOLO esos. No reemplaza a Grep/Read: los enfoca. Sin tabla o sin candidatos, método clásico.
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

## Relación con el resto
- Mismo índice que consume el **Director de código** (`apps/plataforma/lib/ia-director-codigo.ts`,
  endpoint `/api/ai/codigo`) para orquestadores externos. Ver `docs/DIRECTOR-CODIGO.md`.
- El índice legible del repo también está en `docs/ARQUITECTURA.generated.md` (mapa grueso: apps,
  módulos, capacidades, rutas, tablas) por si quieres el panorama sin consultar la BD.
