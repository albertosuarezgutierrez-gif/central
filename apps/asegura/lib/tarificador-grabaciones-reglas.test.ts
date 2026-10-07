// Cepos del GRABADOR del tarificador RPA, lado asegura (07/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_LLAMADAS_POR_DEFECTO,
  comprobarSubida,
  planificarSubida,
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

test('subida multipantalla: separa en orden, re-redacta CADA pantalla y respeta 40 pantallas', () => {
  const pant = (n: number, extra = '') => `<!-- grabador:pantalla ${n}/3 · inicio · 10:00:00 -->\n<!-- grabador ASegura v3 · x -->\n<html><body><h1>P${n}</h1><input name="dni" value="12345678Z"><p>mail ana${n}@correo.es</p>${extra}</body></html>\n`
  const fichero = `<!-- grabacion ASegura v3 · multipantalla -->\n${pant(1)}${pant(2)}${pant(3, '<input type="password" value="Secreta.99">')}`
  const r = planificarSubida('grabacion-portal.test-20261007-100000.html', fichero, 0)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.multipantalla, true)
  assert.deepEqual(r.pantallas.map((p) => p.nombre), ['grabacion-portal.test-20261007-100000-p01.html', 'grabacion-portal.test-20261007-100000-p02.html', 'grabacion-portal.test-20261007-100000-p03.html'])
  assert.deepEqual(r.pantallas.map((p) => /<h1>(P\d)/.exec(p.html)![1]), ['P1', 'P2', 'P3'])
  for (const p of r.pantallas) for (const crudo of ['12345678Z', '@correo.es', 'Secreta.99']) assert.ok(!p.html.includes(crudo), `«${crudo}» sin redactar en ${p.nombre}`)
  assert.match(r.pantallas[2].html, /PANTALLA DE LOGIN/)
  assert.ok(!/PANTALLA DE LOGIN/.test(r.pantallas[0].html), 'el login no se hereda entre pantallas')
  // Pantalla suelta (modo manual): conserva su nombre.
  const una = planificarSubida('pantalla-x.html', '<html><body>x</body></html>', 3)
  assert.ok(una.ok && una.pantallas.length === 1 && una.pantallas[0].nombre === 'pantalla-x.html' && !una.multipantalla)
  // Topes: 40 pantallas entre las ya subidas y las nuevas; una pantalla de más de 4 MB rechaza el fichero entero.
  const e = planificarSubida('g.html', fichero, 38)
  assert.ok(!e.ok && /máximo 40/.test(e.mensaje))
  const grande = planificarSubida('g.html', pant(1, '<div>fila de relleno</div>'.repeat(Math.ceil(5 * 1024 * 1024 / 26))), 0)
  assert.ok(!grande.ok && /pantalla 1 del fichero.*MB/.test(grande.mensaje))
})

test('borrado: errores de permiso y de FK se distinguen; el orden obligado es pantallas → documentos → grabación', async () => {
  const { esPermisoDenegado, esFkViolada, ORDEN_BORRADO_GRABACION } = await import('./tarificador-grabaciones-reglas.ts')
  assert.equal(esPermisoDenegado(new Error('permission denied for table tarificador_grabaciones')), true)
  assert.equal(esPermisoDenegado(new Error('relation does not exist')), false)
  assert.equal(esFkViolada(new Error('update or delete on table "documentos" violates foreign key constraint')), true)
  assert.equal(esFkViolada(new Error('permission denied')), false)
  assert.deepEqual([...ORDEN_BORRADO_GRABACION], ['tarificador_grabacion_pantallas', 'documentos', 'tarificador_grabaciones'])
})

// Cepo: borrarGrabacion borra en el orden de las FKs, todo por correduría y la ruta DELETE va auditada.
test('borrado (guardián de fuente): orden de los DELETE, filtro de correduría y ruta auditada', () => {
  const lib = readFileSync(join(import.meta.dirname, 'tarificador-grabaciones.ts'), 'utf8')
  const cuerpo = lib.slice(lib.indexOf('export async function borrarGrabacion'), lib.indexOf('export type ModoAnalisis'))
  const a = cuerpo.search(/delete from \w+\.tarificador_grabacion_pantallas/)
  const b = cuerpo.search(/delete from \w+\.documentos/)
  const c = cuerpo.search(/delete from \w+\.tarificador_grabaciones /)
  assert.ok(a > 0 && b > a && c > b, 'pantallas → documentos → grabación')
  assert.equal((cuerpo.match(/correduria_id = \$\{correduriaId\}::uuid/g) ?? []).length, 4, 'cada sentencia filtra por correduría')
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app/api/operador/tarificador/grabaciones/[id]/route.ts'), 'utf8')
  assert.match(ruta, /export const DELETE = auditado\(/)
  assert.match(ruta, /operadorAutorizado\(req\)[\s\S]*borrarGrabacion/)
})
