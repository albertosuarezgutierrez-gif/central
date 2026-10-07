// Cepos del GRABADOR del tarificador RPA, lado asegura (07/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_LLAMADAS_POR_DEFECTO,
  comprobarSubida,
  esTablaSinCrear,
  leerAltaGrabacion,
  maxLlamadasGrabador,
  MAX_OPCIONES_IA,
  respuestaIACortada,
  promptAnalisis,
  sistemaAnalisis,
} from './tarificador-grabaciones-reglas.ts'

test('tope de llamadas por grabación: env 1..200, si no 60', () => {
  assert.equal(maxLlamadasGrabador({}), MAX_LLAMADAS_POR_DEFECTO)
  assert.equal(maxLlamadasGrabador({ TARIFICADOR_GRABADOR_MAX_LLAMADAS: '10' }), 10)
  for (const v of ['0', '201', '-3', 'muchas', '2.5']) assert.equal(maxLlamadasGrabador({ TARIFICADOR_GRABADOR_MAX_LLAMADAS: v }), MAX_LLAMADAS_POR_DEFECTO, v)
})

test('alta: compañía y ramo obligatorios, tamaños acotados', () => {
  assert.deepEqual(leerAltaGrabacion({ compania: ' Mapfre ', ramo: 'Hogar', producto: '', nota: null }), { ok: true, alta: { compania: 'Mapfre', ramo: 'Hogar', producto: null, nota: null } })
  assert.equal(leerAltaGrabacion({ ramo: 'Hogar' }).ok, false)
  assert.equal(leerAltaGrabacion({ compania: 'X', ramo: 'y'.repeat(81) }).ok, false)
  assert.equal(leerAltaGrabacion({ compania: 'X', ramo: 'Y', nota: 'n'.repeat(2001) }).ok, false)
  assert.equal(leerAltaGrabacion(null).ok, false)
})

test('subida: tope de pantallas, tamaño y que sea HTML', () => {
  assert.equal(comprobarSubida('p.html', 100, '<!-- grabador ASegura v1 --><html>', 0), null)
  assert.match(comprobarSubida('p.html', 100, '<html>', 40)!, /40 pantallas/)
  assert.match(comprobarSubida('p.html', 5 * 1024 * 1024, '<html>', 0)!, /MB/)
  assert.match(comprobarSubida('p.html', 10, '%PDF-1.7', 0)!, /HTML/)
})

test('SQL sin aplicar se reconoce (tabla o columna)', () => {
  assert.ok(esTablaSinCrear(new Error('relation "x" does not exist')))
  assert.ok(esTablaSinCrear(new Error('code: 42703 column tarificador_grabacion_id')))
  assert.ok(!esTablaSinCrear(new Error('password authentication failed')))
})

test('el prompt de la IA pide JSON estricto y que ante la duda un botón sea PROHIBIDO', () => {
  const s = sistemaAnalisis()
  assert.match(s, /SOLO un objeto JSON/)
  assert.match(s, /ANTE LA DUDA, "prohibido"/)
  for (const p of ['emitir', 'contratar', 'formalizar', 'grabar', 'archivar', 'firmar', 'pagar']) assert.ok(s.includes(p), p)
  assert.match(promptAnalisis({ compania: 'Mapfre', ramo: 'Hogar', producto: null, pantalla: 2, total: 5, html: '<form>' }), /Pantalla 2 de 5/)
})

test('rutas del grabador: Bearer de operador, escrituras auditadas, sin SQL en la ruta', () => {
  const base = join(import.meta.dirname, '../app/api/operador/tarificador/grabaciones')
  for (const r of ['route.ts', '[id]/route.ts', '[id]/pantallas/route.ts', '[id]/analizar/route.ts']) {
    const src = readFileSync(join(base, r), 'utf8')
    assert.match(src, /operadorAutorizado\(req\)/, r)
    for (const m of src.matchAll(/export (?:const|async function) (POST|PATCH|PUT|DELETE)\b[^\n]*/g)) assert.match(m[0], /auditado\(/, `${r}: ${m[1]} sin auditado()`)
    assert.ok(!/\bseguros\s*\.\s*[a-z_]/i.test(src), `${r}: el SQL va en lib/, no en la ruta`)
  }
})

test('el prompt pide un tope de opciones por select y salida compacta', () => {
  assert.equal(MAX_OPCIONES_IA, 25)
  assert.match(sistemaAnalisis(), /MÁXIMO 25 opciones/)
})

test('respuestaIACortada: JSON cortado sí; completo, sin llaves o con llaves en cadenas no', () => {
  assert.equal(respuestaIACortada('{"titulo":"x","campos":[{"etiqueta":"a","opciones":["1","2'), true)
  assert.equal(respuestaIACortada('```json\n{"campos":[{"a":1},{"a":'), true)
  assert.equal(respuestaIACortada('{"t":"llave } dentro","c":[1,2'), true)
  assert.equal(respuestaIACortada('{"t":"a","c":[]}'), false)
  assert.equal(respuestaIACortada('Aquí: {"t":"}"} fin'), false)
  assert.equal(respuestaIACortada('no hay json'), false)
})
