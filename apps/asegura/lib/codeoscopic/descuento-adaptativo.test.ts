import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rebajarDescuento, descuentosEnOpciones, ESCALONES_DESCUENTO, MAX_REINTENTOS_DESCUENTO, maximoDeLinea } from './descuento-adaptativo.ts'
import { opcionesParaReRate, idsDescuentoPorDefecto, opcionesPorDefecto } from './opciones-producto.ts'

const ALLIANZ = ['dtoCap', 'dtoVentaCruzada']
const op = (cap: number, vc: number) => [
  { id: 'dtoCap', type: 'number', value: cap },
  { id: 'dtoVentaCruzada', type: 'number', value: vc },
  { id: 'otra', type: 'boolean', value: true },
]
const err = (m: string) => `codeoscopic_validacion: ${JSON.stringify({ message: m })}`
const val = (o: unknown[], id: string) => (o.find((x) => (x as { id: string }).id === id) as { value: unknown }).value

test('400 de descuento con máximo numérico → usa ese máximo (no el escalón)', () => {
  const r = rebajarDescuento(err('dtoCap: el descuento máximo permitido es 37'), op(50, 50), ALLIANZ)
  assert.ok(r)
  assert.equal(val(r.opciones, 'dtoCap'), 37)
  assert.equal(val(r.opciones, 'dtoVentaCruzada'), 50) // el otro campo no se nombra: intacto
  assert.deepEqual(r.rebajados, { dtoCap: 37 })
})

test('400 de descuento sin máximo → escalón 50→30→20→10→0', () => {
  let o: unknown[] = op(50, 50)
  let intentos: Record<string, number> = {}
  const vistos: number[] = []
  for (let i = 0; i < 4; i++) {
    const r = rebajarDescuento(err('El descuento comercial no es válido'), o, ['dtoCap'], intentos)
    assert.ok(r)
    o = r.opciones
    intentos = r.intentos
    vistos.push(val(o, 'dtoCap') as number)
  }
  assert.deepEqual(vistos, [30, 20, 10, 0])
  assert.deepEqual([...ESCALONES_DESCUENTO], [50, 30, 20, 10, 0])
})

test('tope de reintentos por descuento y nada que bajar en 0', () => {
  assert.equal(MAX_REINTENTOS_DESCUENTO, 4)
  assert.equal(rebajarDescuento(err('discount invalid'), op(50, 50), ['dtoCap'], { dtoCap: 4 }), null)
  assert.equal(rebajarDescuento(err('discount invalid'), op(0, 50), ['dtoCap']), null)
})

test('400 que no es de descuento → null (la cascada sigue intacta)', () => {
  assert.equal(rebajarDescuento(err('The road name of the address of the holder is mandatory.'), op(50, 50), ALLIANZ), null)
  assert.equal(rebajarDescuento('', op(50, 50), ALLIANZ), null)
  // «falta el campo» ≠ «sobra descuento»
  assert.equal(rebajarDescuento(err('Occident: El campo Descuento comercial de Occident es obligatorio.'), op(50, 50), ALLIANZ), null)
})

test('máximo en inglés y rangos; no muta la entrada; respeta el tipo texto', () => {
  assert.equal(maximoDeLinea('discount cannot exceed 25'), 25)
  assert.equal(maximoDeLinea('dto entre 0 y 30'), 30)
  const entrada = [{ id: 'discount', type: 'string', value: '50' }]
  const r = rebajarDescuento(err('discount: máximo 12,5'), entrada, ['discount'])
  assert.ok(r)
  assert.equal(r.opciones && (r.opciones[0] as { value: unknown }).value, '12')
  assert.equal(entrada[0].value, '50')
})

test('solo toca ids permitidos (los que puso el código)', () => {
  assert.equal(rebajarDescuento(err('discount invalid'), [{ id: 'discount', type: 'number', value: 30 }], ['dtoCap']), null)
})

test('Occident/Fidelidade: 50 solo si el vendor devolvió el id; nunca se inventa', () => {
  const trae = [{ id: 'commercialDiscount', type: 'number', value: 30 }]
  const r = opcionesParaReRate(trae, 'Occident', 'moto') as { value: unknown }[]
  assert.equal(r[0].value, 50)
  assert.equal((opcionesParaReRate([{ id: 'x', type: 'number', value: 1 }], 'Occident', 'moto') as unknown[]).length, 1)
  assert.equal(((opcionesParaReRate([{ id: 'discount', type: 'number', value: null }], 'Fidelidade', 'hogar') as { value: unknown }[])[0]).value, 50)
  assert.equal(((opcionesParaReRate(trae, 'Fidelidade', 'hogar') as { value: unknown }[])[0]).value, 30)
  assert.equal(opcionesPorDefecto('Occident', 'moto'), null) // sin catálogo
  assert.deepEqual(idsDescuentoPorDefecto('Occident', 'hogar'), ['discount'])
  assert.deepEqual(descuentosEnOpciones(r, ['commercialDiscount']), { commercialDiscount: 50 })
})

test('🪤 la ruta NUNCA rebaja las opciones del formulario del corredor', () => {
  const src = readFileSync(new URL('../../app/api/operador/codeoscopic/oferta/route.ts', import.meta.url), 'utf8')
  assert.match(src, /if \(!productOptionsCorredor && interp\.campos\.length === 0\) \{\s*const reb = rebajarDescuento\(/)
  assert.match(src, /if \(!productOptionsCorredor && Object\.keys\(rebajesDto\)\.length > 0\)/)
  assert.match(src, /productOptionsCorredor \? \{\} : descuentosEnOpciones/)
})
