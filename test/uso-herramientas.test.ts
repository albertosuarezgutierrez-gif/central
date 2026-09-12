// Guardián del medidor de uso de herramientas (scripts/uso-herramientas.mjs) y de su agregador
// (scripts/ahorro-herramientas.mjs). `node --test` (gate `pnpm test:guardia`).
// Importa las funciones REALES de los dos scripts. Visto en rojo el 12/09/2026 (salida en el PR).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clasificar, textoDe, archivosCitados, acumular, esError, rutaResumen } from '../scripts/uso-herramientas.mjs'
import { agregar, tablaMarkdown, inyectarBloque } from '../scripts/ahorro-herramientas.mjs'

test('clasificar(): cada "cosa de las que tenemos" tiene su categoría, y la SQL se separa por lo que consulta', () => {
  assert.equal(clasificar('mcp__Graphify__graphify_callers', {}), 'graphify')
  assert.equal(clasificar('mcp__Supabase__execute_sql', { query: 'SELECT * FROM grafo_callers($1)' }), 'grafo-propio')
  assert.equal(clasificar('mcp__Supabase__execute_sql', { query: 'select ruta from mapa_arquitectura where …' }), 'code-map')
  assert.equal(clasificar('mcp__Supabase__execute_sql', { query: 'select 1 from incomes' }), 'sql')
  assert.equal(clasificar('mcp__Supabase_asegura__execute_sql', { query: 'select 1' }), 'sql')
  assert.equal(clasificar('Agent', { subagent_type: 'agente-mecanico' }), 'agente:agente-mecanico')
  assert.equal(clasificar('Task', {}), 'agente:general')
  assert.equal(clasificar('Read', {}), 'lectura-directa')
  assert.equal(clasificar('Grep', {}), 'lectura-directa')
  assert.equal(clasificar('Edit', {}), 'escritura')
  assert.equal(clasificar('mcp__github__get_file_contents', {}), 'mcp:github')
})

test('archivosCitados(): rutas del repo mencionadas en la respuesta, deduplicadas y solo las que existen', () => {
  const texto = 'ver apps/a/lib/ficha.ts y `apps/a/lib/ficha.ts:12`, packages/m/src/viva.ts, apps/a/no.ts y docs/X.md'
  const existe = (r: string) => ({ 'apps/a/lib/ficha.ts': 1000, 'packages/m/src/viva.ts': 500, 'docs/X.md': 10 } as Record<string, number>)[r] ?? null
  const c = archivosCitados(texto, existe)
  assert.deepEqual([...c.entries()], [['apps/a/lib/ficha.ts', 1000], ['packages/m/src/viva.ts', 500], ['docs/X.md', 10]])
})

test('textoDe() aplana string / {content:[{text}]} / objeto; esError() detecta is_error y respuestas que empiezan por Error', () => {
  assert.equal(textoDe('hola'), 'hola')
  assert.equal(textoDe({ content: [{ type: 'text', text: 'a' }, { text: 'b' }] }), 'a\nb')
  assert.equal(textoDe({ x: 1 }), '{"x":1}')
  assert.equal(esError({ is_error: true }), true)
  assert.equal(esError('Error: boom'), true)
  assert.equal(esError('todo ok'), false)
})

test('acumular(): numerador y denominador por categoría, chars citados sumados', () => {
  const r: any = { categorias: {} }
  acumular(r, { categoria: 'graphify', tool: 'mcp__Graphify__x', charsIn: 10, charsOut: 400, error: false, citados: new Map([['a', 100], ['b', 50]]) })
  acumular(r, { categoria: 'graphify', tool: 'mcp__Graphify__y', charsIn: 5, charsOut: 100, error: true, citados: new Map() })
  assert.equal(r.llamadas, 2)
  assert.deepEqual(r.categorias.graphify, { llamadas: 2, chars_in: 15, chars_out: 500, errores: 1, archivos_citados: 2, chars_citados: 150, tools: { mcp__Graphify__x: 1, mcp__Graphify__y: 1 } })
})

test('rutaResumen(): un fichero por sesión y mes, con el id saneado', () => {
  const r = rutaResumen('session_ab/../c', new Date('2026-09-12T10:00:00Z'), '/repo')
  assert.equal(r, '/repo/docs/uso-herramientas/2026-09/session_abc.json')
})

test('agregar(): sesiones, llamadas y tokens (≈ chars/4) por categoría, ordenado por llamadas', () => {
  const ag = agregar([
    { categorias: { graphify: { llamadas: 3, chars_out: 4000, chars_citados: 40000, errores: 0, tools: { a: 3 } }, 'lectura-directa': { llamadas: 10, chars_out: 80000, chars_citados: 0, errores: 0, tools: { Read: 10 } } } },
    { categorias: { graphify: { llamadas: 1, chars_out: 400, chars_citados: 0, errores: 1, tools: { a: 1 } } } },
  ])
  assert.equal(ag.sesiones, 2)
  assert.deepEqual(ag.filas.map(f => f.categoria), ['lectura-directa', 'graphify'])
  const gf = ag.filas[1]
  assert.equal(gf.sesiones, 2); assert.equal(gf.llamadas, 4); assert.equal(gf.tokens_pagados, 1100); assert.equal(gf.tokens_citados, 10000); assert.equal(gf.errores, 1)
})

test('tablaMarkdown() rotula los citados como cota superior y no como ahorro; inyectarBloque() sustituye solo el bloque marcado', () => {
  const t = tablaMarkdown(agregar([]), 'T')
  assert.match(t, /cota sup\./)
  assert.match(t, /sin datos todavía/)
  const md = '# Doc\n\nintro\n\n<!-- ahorro:inicio -->\nviejo\n<!-- ahorro:fin -->\n\ncola\n'
  const out = inyectarBloque(md, 'NUEVO')
  assert.equal(out, '# Doc\n\nintro\n\n<!-- ahorro:inicio -->\nNUEVO\n<!-- ahorro:fin -->\n\ncola\n')
  assert.match(inyectarBloque('# Sin bloque\n', 'X'), /# Sin bloque\n\n<!-- ahorro:inicio -->\nX\n<!-- ahorro:fin -->\n$/)
})

test('el hook está registrado como PostToolUse para TODAS las tools y el Stop persiste docs/uso-herramientas', () => {
  const settings = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'))
  const post = settings.hooks?.PostToolUse ?? []
  const nuestro = post.find((h: any) => h.matcher === '' && (h.hooks ?? []).some((x: any) => /uso-herramientas\.mjs/.test(x.command)))
  assert.ok(nuestro, 'falta el hook PostToolUse con matcher "" hacia scripts/uso-herramientas.mjs')
  const stop = readFileSync(new URL('../.claude/hooks/persist-memoria.sh', import.meta.url), 'utf8')
  assert.match(stop, /docs\/uso-herramientas/, 'persist-memoria.sh debe commitear docs/uso-herramientas')
})
