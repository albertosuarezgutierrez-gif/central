// ────────────────────────────────────────────────────────────────────────────
// Guardián del catálogo de avisos de Telegram (panel /telegram).
//
// El panel promete dos cosas y las dos se pueden romper en silencio:
//   1. «Este interruptor apaga algo» → un id EMITIDO que no está catalogado es un aviso que llega
//      y no se puede callar (y que además no aparece en la pantalla).
//   2. «Esto es todo lo que te llega» → un id CATALOGADO que nadie emite es un interruptor que no
//      hace nada: Alberto lo apaga, sigue recibiendo el aviso y deja de creerse el panel entero.
//
// Ni `tsc` ni el build cazan ninguno de los dos: el id es un string. Por eso se lee el FUENTE.
// ────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AVISOS, AVISOS_POR_ID, CATEGORIAS, avisoDeCategoriaCorreo } from './catalogo.ts'

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
// `avisoPermitido`/`avisoEnviado` son la vía para lo que `tgAviso` no cubre (p. ej. una foto).
const EMISOR = /\b(?:tgAviso(?:Botones|Alerta)?|avisoPermitido|avisoEnviado)\(\s*'([^']+)'/g

/** Ids que se emiten con un id calculado (mapa en el catálogo), no con literal en la llamada. */
const POR_MAPA = ['personal-importante', 'huespedes', 'agoda-huespedes', 'leads-negocio', 'seguridad-sospechosa']
  .map(c => avisoDeCategoriaCorreo(c))
  .filter((v): v is string => v !== null)

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next') continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc)
    else if (nombre.endsWith('.ts') || nombre.endsWith('.tsx')) {
      if (!nombre.endsWith('.test.ts') && !nombre.endsWith('.test.tsx')) acc.push(ruta)
    }
  }
  return acc
}

function idsEmitidos(): Map<string, string[]> {
  const encontrados = new Map<string, string[]>()
  for (const ruta of [...fuentes(join(RAIZ, 'app')), ...fuentes(join(RAIZ, 'lib'))]) {
    const txt = readFileSync(ruta, 'utf8')
    for (const m of txt.matchAll(EMISOR)) {
      const lista = encontrados.get(m[1]) ?? []
      lista.push(ruta.slice(RAIZ.length))
      encontrados.set(m[1], lista)
    }
  }
  return encontrados
}

test('todo aviso emitido está en el catálogo', () => {
  const huerfanos: string[] = []
  for (const [id, ficheros] of idsEmitidos()) {
    if (!AVISOS_POR_ID.has(id)) huerfanos.push(`${id} (${ficheros.join(', ')})`)
  }
  assert.deepEqual(huerfanos, [], `avisos emitidos SIN entrada en catalogo.ts:\n${huerfanos.join('\n')}`)
})

test('todo aviso del catálogo tiene emisor', () => {
  const emitidos = new Set([...idsEmitidos().keys(), ...POR_MAPA])
  const mudos = AVISOS.filter(a => !emitidos.has(a.id)).map(a => a.id)
  assert.deepEqual(mudos, [], `interruptores que no apagan nada:\n${mudos.join('\n')}`)
})

test('los ids son únicos y su categoría existe', () => {
  const vistos = new Set<string>()
  const categorias = new Set(CATEGORIAS.map(c => c.id))
  for (const a of AVISOS) {
    assert.ok(!vistos.has(a.id), `id duplicado: ${a.id}`)
    vistos.add(a.id)
    assert.ok(categorias.has(a.categoria), `categoría desconocida en ${a.id}: ${a.categoria}`)
    assert.ok(a.titulo && a.que && a.cuando, `${a.id} sin título/qué/cuándo`)
  }
})

test('el aviso del canal roto NO se puede silenciar', () => {
  // Es el único que avisa de que los DEMÁS avisos están mudos: silenciarlo dejaría el
  // sistema entero sin voz sin que nada lo delate (el fallo auto-anulante de /api/internal/alerta).
  assert.equal(AVISOS_POR_ID.get('sistema.canal-mudo')?.critico, true)
  assert.equal(AVISOS.filter(a => a.critico).length, 1)
})

test('el mapa de categorías de correo apunta a ids catalogados', () => {
  for (const id of POR_MAPA) assert.ok(AVISOS_POR_ID.has(id), `${id} no está en el catálogo`)
  assert.equal(avisoDeCategoriaCorreo('ruido'), null)
  assert.equal(avisoDeCategoriaCorreo('contabilidad'), null)
})
