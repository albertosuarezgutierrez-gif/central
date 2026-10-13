// Asegurados de DECESOS que son FIGURAS del riesgo (13/10/2026): de su ficha a `risk.insureds[1..]`.
// Regla de Alberto: «los campos son siempre los de Avant2» → a un asegurado solo se le pide lo que lleva
// `NaturalPerson_V1` (nombre, apellidos, nacimiento, sexo y, opcional, el documento). Nunca teléfono ni estado civil.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aseguradoDeFicha, construirAsegurado, faltanDeAseguradoFicha } from './asegurados.ts'
import { construirPeticionDecesos } from './peticion-decesos.ts'

const FICHA = { nombre: 'Lucía', apellido1: 'Pérez', apellido2: 'Gil', fechaNacimiento: '2012-05-01', sexo: 'mujer' as const }

test('ficha completa sin documento: no le falta nada (teléfono y estado civil NO se piden a un asegurado)', () => {
  assert.deepEqual(faltanDeAseguradoFicha(FICHA), [])
  const p = construirAsegurado(aseguradoDeFicha(FICHA))
  assert.deepEqual(Object.keys(p).sort(), ['birthDate', 'gender', 'name', 'surname', 'surname2'])
  assert.equal((p.gender as { id: string }).id, 'Female')
})

test('lo que falta es lo de Avant2: nombre, primer apellido, nacimiento y sexo', () => {
  assert.deepEqual(faltanDeAseguradoFicha({}).sort(), ['apellido1', 'fechaNacimiento', 'nombre', 'sexo'])
  assert.deepEqual(faltanDeAseguradoFicha({ ...FICHA, sexo: null }), ['sexo'])
  assert.deepEqual(faltanDeAseguradoFicha({ ...FICHA, fechaNacimiento: '01/05/2012' }), ['fechaNacimiento'])
})

test('DNI: viaja si es español y entonces exige el segundo apellido (regla del vendor); letra mala = falta dni', () => {
  const a = aseguradoDeFicha({ ...FICHA, dni: '12345678Z' })
  assert.equal(a.dni, '12345678Z')
  assert.deepEqual(faltanDeAseguradoFicha({ ...FICHA, dni: '12345678Z', apellido2: null }), ['apellido2'])
  assert.deepEqual(faltanDeAseguradoFicha({ ...FICHA, dni: '12345678A' }), ['dni'])
  const p = construirAsegurado(a)
  assert.deepEqual(p.identificationDocument, { type: { id: 'Dni' }, id: '12345678Z' })
})

test('NIE/pasaporte: NO viaja (la ficha no guarda la nacionalidad que exigiría) y no se inventa nacionalidad', () => {
  const a = aseguradoDeFicha({ ...FICHA, dni: 'X1234567L' })
  assert.equal(a.dni, null)
  assert.equal(a.nacionalidad, null)
  assert.deepEqual(faltanDeAseguradoFicha({ ...FICHA, dni: 'X1234567L' }), [])
  assert.equal(construirAsegurado(a).nationality, undefined)
})

test('la petición de decesos lleva al tomador primero y luego los asegurados de las fichas, en orden', () => {
  const tomador = { dni: '12345678Z', nombre: 'Ana', apellido1: 'Gil', apellido2: 'Ruiz', fechaNacimiento: '1970-01-01', sexo: 'mujer' as const, estadoCivil: 'Married', telefono: '600000000' }
  const c = construirPeticionDecesos({ ...tomador, fechaEfecto: '2026-11-01', aseguradosAdicionales: [aseguradoDeFicha(FICHA), aseguradoDeFicha({ ...FICHA, nombre: 'Pablo', sexo: 'hombre' })] }, 'Funeral') as { risk: { insureds: Array<{ name: string }> } }
  assert.deepEqual(c.risk.insureds.map((x) => x.name), ['Ana', 'Lucía', 'Pablo'])
})

// ── Cepos de fuente: lo que tsc no ve ─────────────────────────────────────────
const riesgo = readFileSync(new URL('../oportunidad-riesgo.ts', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../../app/api/operador/codeoscopic/decesos-nuevo/route.ts', import.meta.url), 'utf8')

test('cepo: en decesos la figura asegurado se revisa con lo de Avant2, ANTES del estado civil y el CP del tomador', () => {
  const i = riesgo.indexOf("if (f.rol === 'asegurado' && (op.tipo === 'decesos' || op.tipo === 'salud' || op.tipo === 'vida'))")
  assert.ok(i > 0, 'falta la rama del asegurado de decesos/salud/vida en leerRiesgo')
  const bloque = riesgo.slice(i, i + 400)
  assert.match(bloque, /faltanDeAseguradoFicha\(p\)/)
  assert.match(bloque, /p === null \? null/, 'ficha ilegible = null («no se pudo leer»), nunca []')
  assert.ok(i < riesgo.indexOf('const pideCivil = ramoPideEstadoCivil(op.tipo)'), 'el asegurado no debe pasar por el estado civil del tomador')
})

test('cepo: los asegurados del riesgo salen de las FICHAS, acotados a la correduría, y una ficha ilegible corta antes de pagar', () => {
  const i = riesgo.indexOf('export async function aseguradosDeFigurasParaCotizar')
  assert.ok(i > 0)
  const c = riesgo.slice(i, riesgo.indexOf('\n}\n', i))
  assert.match(c, /f\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(c, /f\.rol = 'asegurado'/)
  assert.match(c, /if \(!p\) return \{ ok: false/)
  assert.match(c, /vistos = new Set<string>\(\[e\.tomadorId\]\)/, 'el tomador no se repite en insureds')
  assert.match(c, /if \(!tom \|\| tom\.tomador !== e\.tomadorId\) return \{ ok: false/, 'el tomador cotizado tiene que ser el del riesgo')
  assert.ok(c.indexOf('tom.tomador !== e.tomadorId') < c.indexOf("f.rol = 'asegurado'"), 'la guarda del tomador va antes de leer asegurados')
})

test('cepo: con asegurados de las figuras, una lista en correcciones.aseguradosAdicionales se RECHAZA (pisaría las fichas)', () => {
  const i = riesgo.indexOf('export async function prepararVariante')
  const c = riesgo.slice(i, riesgo.indexOf('\n}\n', i))
  assert.match(c, /if \(deFiguras && e\.correcciones !== undefined && 'aseguradosAdicionales' in e\.correcciones\) \{\s*return \{ ok: false/)
})

test('cepo: la ruta usa los asegurados de las figuras y el write-back sigue con el cuerpo ORIGINAL (sin datos de fichas)', () => {
  assert.match(ruta, /variante\.v\.asegurados !== undefined \? \{ \.\.\.\(resueltosPedidos \?\? \{\}\), asegurados: variante\.v\.asegurados \}/)
  assert.match(ruta, /anotarCapitalDeCotizacion\(correduria\.id, \{ oportunidadId: variante\.v\.contexto\.oportunidadId, ramo: 'decesos', cuerpo, actor/)
})

test('cepo de fuente: aseguradosDeFigurasParaCotizar corta (422 vía variante) fecha imposible y >20 asegurados antes de pagar', () => {
  const f = readFileSync(new URL('../oportunidad-riesgo.ts', import.meta.url), 'utf8')
  const cuerpo = f.slice(f.indexOf('export async function aseguradosDeFigurasParaCotizar'))
  const fin = cuerpo.indexOf('\n}\n')
  const fn = cuerpo.slice(0, fin)
  assert.match(fn, /motivoFechaNacimientoImposible\(a\.fechaNacimiento\)/)
  assert.match(fn, /asegurados\.length > MAX_ADICIONALES_CORDURA/)
})
