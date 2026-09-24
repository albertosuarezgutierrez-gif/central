import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPOS_HISTORIAL,
  clasificarFaltan,
  dondeSeCorrige,
  type Reparo,
} from './campos-faltan.ts'

const aMano = (c: string) => ['dni', 'nombre', 'telefono', 'fechaNacimiento', 'fechaCarnet'].includes(c)
const rep = (campo: string): Reparo => ({ campo, motivo: 'hace falta para poder cotizar' })

test('los campos del historial NO mandan a la ficha del cliente', () => {
  // El caso real: la pantalla decía «corrígelo en la ficha del cliente» de dos
  // campos que tiene ella misma, y que en la ficha no existen.
  for (const c of CAMPOS_HISTORIAL) {
    assert.equal(dondeSeCorrige(c, aMano), 'historial', `${c} se arregla en esta pantalla`)
  }
})

test('companiaAnteriorCodigo y polizaAnterior, que fue lo que se vio', () => {
  const r = clasificarFaltan([rep('companiaAnteriorCodigo'), rep('polizaAnterior')], aMano)
  assert.equal(r.historial.length, 2)
  assert.equal(r.ficha.length, 0)
  assert.equal(r.desconocidos.length, 0)
})

test('el código postal de circulación SÍ se arregla en la ficha', () => {
  assert.equal(dondeSeCorrige('cpCirculacion', aMano), 'ficha')
})

test('lo que la pantalla teclea o elige no sale como aviso', () => {
  const r = clasificarFaltan([rep('dni'), rep('garaje'), rep('matricula'), rep('sexo')], aMano)
  assert.deepEqual(r, { historial: [], ficha: [], desconocidos: [] })
})

test('un campo DESCONOCIDO no se manda a la ficha por descarte', () => {
  // Si mañana el servidor devuelve un reparo nuevo, la pantalla no puede
  // inventarse dónde se corrige: eso es un viaje en balde con cara de consejo.
  assert.equal(dondeSeCorrige('campoQueNadieHaMapeado', aMano), 'desconocido')
  const r = clasificarFaltan([rep('campoQueNadieHaMapeado')], aMano)
  assert.equal(r.desconocidos.length, 1)
  assert.equal(r.ficha.length, 0)
})

test('aniosAsegurado es del historial: el reparo de los ceros no manda a la ficha', () => {
  // El reparo nuevo («0 años asegurado con seguro declarado») se arregla
  // apagando el interruptor o poniendo los años, las dos cosas AQUÍ.
  assert.equal(dondeSeCorrige('aniosAsegurado', aMano), 'historial')
})

test('sin reparos, las tres listas vacías (y null no revienta)', () => {
  assert.deepEqual(clasificarFaltan([], aMano), { historial: [], ficha: [], desconocidos: [] })
  assert.deepEqual(clasificarFaltan(null, aMano), { historial: [], ficha: [], desconocidos: [] })
})

test('mezcla real: historial + ficha + desconocido, cada uno a su sitio', () => {
  const r = clasificarFaltan(
    [rep('polizaAnterior'), rep('cpCirculacion'), rep('loQueSea'), rep('dni')],
    aMano,
  )
  assert.deepEqual(r.historial.map((x) => x.campo), ['polizaAnterior'])
  assert.deepEqual(r.ficha.map((x) => x.campo), ['cpCirculacion'])
  assert.deepEqual(r.desconocidos.map((x) => x.campo), ['loQueSea'])
})
