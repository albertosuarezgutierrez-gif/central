// Guardián del canario del formulario público.
//
// Lo que se prueba es la REGLA, no la red: qué respuesta cuenta como «el canal funciona», cuál
// como «está roto» y cuál como «no lo sé». Esa tercera categoría es el motivo de que el módulo
// exista: un canario que traduce un timeout a 🟢 calla la avería que vino a vigilar, y uno que
// lo traduce a 🔴 despierta a Alberto por su propio problema de red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { veredictoCanarioLead } from './canario-lead.ts'

test('un 422 de plataforma es la prueba de que el lead llega', () => {
  const v = veredictoCanarioLead({ status: 422, motivo: 'Falta el nombre.', ok: false })
  assert.equal(v.estado, 'ok')
  assert.match(v.linea, /llega a plataforma/)
})

test('el 503 del formulario muerto es ROTO y nombra la variable que falta', () => {
  const v = veredictoCanarioLead({ status: 503, motivo: 'Ahora mismo no podemos recoger tu solicitud por la web.' })
  assert.equal(v.estado, 'roto')
  assert.match(v.linea, /PLATAFORMA_URL/, 'el aviso tiene que decir dónde se arregla, no solo que falla')
})

test('el 502 (el reenvío no completa) también es ROTO: el lead se pierde igual', () => {
  assert.equal(veredictoCanarioLead({ status: 502 }).estado, 'roto')
})

test('un 404 delata que la ruta de plataforma se movió', () => {
  const v = veredictoCanarioLead({ status: 404 })
  assert.equal(v.estado, 'roto')
  assert.match(v.linea, /correduria\/lead/)
})

test('aceptar un envío VACÍO es roto, no un éxito', () => {
  // Es la trampa del canario: 200 parece bueno y significa que la validación no se aplica.
  assert.equal(veredictoCanarioLead({ status: 200, ok: true }).estado, 'roto')
})

test('el 429 lo choca el propio canario: no hay veredicto', () => {
  const v = veredictoCanarioLead({ status: 429 })
  assert.equal(v.estado, 'dudoso')
  assert.notEqual(v.estado, 'ok', 'un límite por IP NO puede leerse como «la web está bien»')
})

test('si el canario no llega, se dice — no se traga', () => {
  const v = veredictoCanarioLead({ status: null, error: 'timeout' })
  assert.equal(v.estado, 'dudoso')
  assert.match(v.linea, /NO significa que esté bien/)
})

test('una respuesta inesperada nunca cuenta como OK', () => {
  for (const status of [301, 400, 401, 418, 500, 504]) {
    assert.notEqual(veredictoCanarioLead({ status }).estado, 'ok', `status ${status} no puede ser OK`)
  }
})
