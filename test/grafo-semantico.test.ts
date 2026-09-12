// Guardián de la parte SEMÁNTICA + estructural del grafo de código propio (12/09/2026).
// `node --test` (gate `pnpm test:guardia`). Lee los FUENTES (SQL, route, workflow): lo que vigila vive
// en un `.sql` y en constantes que ni tsc ni el build contrastan con nada. Visto en rojo el 12/09/2026
// rompiendo a propósito la dimensión del vector y el orden del workflow (salida en el PR).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inyectarEmbeddings } from '../scripts/grafo-embeddings-inyectar.mjs'
import { clasificar } from '../scripts/uso-herramientas.mjs'

const ROOT = join(import.meta.dirname, '..')
const sql = readFileSync(join(ROOT, 'apps/plataforma/prisma/sql/2026-09-12_grafo_semantico.sql'), 'utf-8')
const route = readFileSync(join(ROOT, 'apps/plataforma/app/api/internal/grafo-codigo/embeddings/route.ts'), 'utf-8')
const wf = readFileSync(join(ROOT, '.github/workflows/auditoria.yml'), 'utf-8')

test('la migración declara las funciones que sustituyen a cada tool de Graphify', () => {
  for (const f of ['grafo_embeddings_sync', 'grafo_guardar_clave', 'grafo_embed_textos', 'grafo_embed_lote',
                   'grafo_buscar', 'grafo_rank_files', 'grafo_camino', 'grafo_referencias', 'grafo_imports_exports',
                   'grafo_nodo', 'grafo_subgrafo']) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${f}\\(`), `falta ${f}`)
  }
})

test('el vector tiene la MISMA dimensión que pide a OpenRouter (768) y el modelo es el de la caché semántica', () => {
  assert.match(sql, /embedding\s+vector\(768\)/)
  assert.match(sql, /'dimensions',\s*768/)
  assert.match(sql, /'openai\/text-embedding-3-small'/)
})

test('un texto que cambia PIERDE su embedding (vuelve a NULL) — si no, la búsqueda respondería con el código viejo', () => {
  assert.match(sql, /embedding\s*=\s*CASE WHEN grafo_embeddings\.hash IS DISTINCT FROM EXCLUDED\.hash THEN NULL/)
  assert.match(sql, /DELETE FROM grafo_embeddings e WHERE NOT EXISTS/, 'lo que sale del mapa sale de los embeddings')
})

test('la clave de OpenRouter vive en Vault: ni literal en el SQL ni accesible por anon/authenticated', () => {
  assert.doesNotMatch(sql, /sk-or-/)
  assert.match(sql, /vault\.decrypted_secrets WHERE name = 'grafo_openrouter_api_key'/)
  // Las SECURITY DEFINER SIN REVOKE son RPC público por PostgREST con la anon key: gasto de OpenRouter y el índice entero.
  for (const f of ['grafo_guardar_clave\\(text\\)', 'grafo_embed_textos\\(text\\[\\]\\)', 'grafo_embed_lote\\(int\\)',
                   'grafo_embeddings_sync\\(\\)', 'grafo_buscar\\(text, int\\)', 'grafo_rank_files\\(text, int, int\\)']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f} FROM public, anon, authenticated`), `${f} sin REVOKE`)
  }
  assert.match(sql, /REVOKE ALL ON public\.grafo_embeddings FROM anon, authenticated/)
})

test('grafo_camino es un BFS por niveles con visitados (no una CTE con el camino en un array), y NO es STABLE porque escribe', () => {
  const cuerpo = sql.slice(sql.indexOf('FUNCTION public.grafo_camino('), sql.indexOf('FUNCTION public.grafo_referencias('))
  assert.match(cuerpo, /CREATE TEMP TABLE _grafo_bfs/)
  assert.match(cuerpo, /WHERE NOT EXISTS \(SELECT 1 FROM _grafo_bfs v WHERE v\.ruta = d\.destino\)/, 'sin visitados el BFS explota')
  assert.doesNotMatch(cuerpo, /LANGUAGE plpgsql STABLE/, 'STABLE prohíbe INSERT en la temporal')
})

test('el puerto exige CRON_SECRET, prefiere la key DEDICADA y responde 503 (no 500) sin ninguna key', () => {
  assert.match(route, /isCronAuthorized\(req\)/)
  assert.match(route, /process\.env\.GRAFO_OPENROUTER_API_KEY \|\| process\.env\.OPENROUTER_API_KEY/)
  assert.match(route, /status: 503/)
  assert.match(route, /grafo_guardar_clave\(/)
  assert.match(route, /grafo_embeddings_sync\(\)/)
  assert.match(route, /grafo_embed_lote\(/)
  assert.match(route, /export const maxDuration = 300/)
  assert.match(route, /grafo_embed_lote\(\$\{LOTE\}::int\)/, 'Prisma manda INT8: sin ::int la función int no resuelve (42883)')
  const margen = Number(/const MARGEN_MS = ([\d_]+)/.exec(route)![1].replace(/_/g, ''))
  const curl = Number(/'CURLOPT_TIMEOUT_MS', '(\d+)'/.exec(sql)![1])
  assert.ok(margen >= curl, `el margen (${margen} ms) tiene que cubrir el timeout HTTP de un lote (${curl} ms) o Vercel mata la función a mitad`)
  assert.match(route, /usandoClavePrincipal/, 'usar la key principal se declara en la respuesta, no en silencio')
})

test('auditoria.yml calcula los embeddings DESPUÉS del mapa y del grafo, solo en main, y no depende de que el grafo haya ido bien', () => {
  const iMapa = wf.indexOf('mapa-arquitectura')
  const iGrafo = wf.indexOf('grafo-codigo-inyectar.mjs')
  const iEmb = wf.indexOf('grafo-embeddings-inyectar.mjs')
  assert.ok(iMapa > 0 && iGrafo > iMapa && iEmb > iGrafo, `orden: mapa ${iMapa} < grafo ${iGrafo} < embeddings ${iEmb}`)
  const paso = wf.slice(wf.indexOf('Calcular embeddings del grafo'), iEmb)
  assert.match(paso, /if: github\.ref_name == 'main' && !cancelled\(\)/)
})

test('inyectarEmbeddings(): repite hasta pendientes 0; un HTTP ≠ 200 o agotar las pasadas es ok:false (nunca "hecho" a medias)', async () => {
  const log = { log() {}, error() {} }
  const resp = (status: number, body: unknown) => ({ status, text: async () => JSON.stringify(body) })
  const cola = [resp(200, { embebidas: 96, pendientes: 40 }), resp(200, { embebidas: 40, pendientes: 0 })]
  const llamadas: string[] = []
  const r = await inyectarEmbeddings({ url: 'u', secret: 's', log, fetchImpl: async (_u: string, init: any) => { llamadas.push(init.headers.Authorization); return cola.shift() } })
  assert.deepEqual(r, { ok: true, total: 136, pendientes: 0 })
  assert.deepEqual(llamadas, ['Bearer s', 'Bearer s'])

  const r401 = await inyectarEmbeddings({ url: 'u', secret: 's', log, fetchImpl: async () => resp(401, { error: 'no' }) })
  assert.equal(r401.ok, false)

  const eterno = await inyectarEmbeddings({ url: 'u', secret: 's', log, maxPasadas: 2, fetchImpl: async () => resp(200, { embebidas: 1, pendientes: 5 }) })
  assert.deepEqual(eterno, { ok: false, total: 2, pendientes: -1 })

  // Un 200 sin `pendientes` NO es «al día» (regla NULL ≠ 0).
  const sinDato = await inyectarEmbeddings({ url: 'u', secret: 's', log, fetchImpl: async () => resp(200, { ok: true }) })
  assert.equal(sinDato.ok, false)

  // Un 5xx transitorio (deploy aún no READY, 429 aguas arriba) se reintenta con espera; 401/503 no.
  const esperas: number[] = []
  const cola2 = [resp(404, 'not found'), resp(500, { error: 'x' }), resp(200, { embebidas: 3, pendientes: 0 })]
  const r5 = await inyectarEmbeddings({ url: 'u', secret: 's', log, esperar: async (s: number) => { esperas.push(s) }, fetchImpl: async () => cola2.shift() })
  assert.deepEqual(r5, { ok: true, total: 3, pendientes: 0 })
  assert.deepEqual(esperas, [15, 30])
  let llamadas503 = 0
  const r503 = await inyectarEmbeddings({ url: 'u', secret: 's', log, esperar: async () => {}, fetchImpl: async () => { llamadas503++; return resp(503, { error: 'sin key' }) } })
  assert.equal(r503.ok, false)
  assert.equal(llamadas503, 1, '503 = sin key en Vercel: reintentar no lo arregla')
})

test('el medidor de uso clasifica las funciones nuevas como grafo-propio (si no, no se mide el ahorro frente a Graphify)', () => {
  for (const f of ['grafo_buscar', 'grafo_rank_files', 'grafo_camino', 'grafo_referencias', 'grafo_imports_exports', 'grafo_nodo', 'grafo_subgrafo', 'grafo_embeddings']) {
    assert.equal(clasificar('mcp__Supabase__execute_sql', { query: `select * from ${f}('x')` }), 'grafo-propio', f)
  }
})
