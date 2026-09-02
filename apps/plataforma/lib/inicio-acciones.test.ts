import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionesDeInicio, todoComprobado, BANCO_STALE_H, type EstadoInicio } from './inicio-acciones.ts'

/** Todo comprobado y sin nada pendiente: el caso «no tienes nada que hacer». */
const LIMPIO: EstadoInicio = {
  porRevisar: 0, ingresosPorRevisar: 0, duplicados: 0, facturasPendientes: 0,
  horasDesdeBanco: 3,
  polizas: { estado: 'ok', enDias: 60, polizas: [] },
}
const claves = (e: EstadoInicio) => accionesDeInicio(e).map(a => a.clave)

test('sin nada pendiente y todo comprobado, la banda está vacía', () => {
  assert.deepEqual(accionesDeInicio(LIMPIO), [])
  assert.equal(todoComprobado(LIMPIO), true)
})

test('un cero de verdad NO pinta fila, pero un null SÍ', () => {
  assert.deepEqual(claves({ ...LIMPIO, porRevisar: 0 }), [])
  assert.deepEqual(claves({ ...LIMPIO, porRevisar: null }), ['por-revisar-desconocido'])
})

test('el null dice «no se sabe», nunca «no hay»', () => {
  const a = accionesDeInicio({ ...LIMPIO, duplicados: null })[0]
  assert.match(a.titulo, /No se pudo contar/)
  assert.match(a.detalle, /No es que no haya: es que no se sabe/)
})

test('el banco viejo va PRIMERO: envenena todos los números de la página', () => {
  const c = claves({ ...LIMPIO, horasDesdeBanco: BANCO_STALE_H + 1, porRevisar: 5 })
  assert.equal(c[0], 'banco-viejo')
})

test('el banco fresco no pinta nada y el desconocido avisa', () => {
  assert.deepEqual(claves({ ...LIMPIO, horasDesdeBanco: BANCO_STALE_H }), [])
  assert.deepEqual(claves({ ...LIMPIO, horasDesdeBanco: null }), ['banco-desconocido'])
})

test('el banco viejo se cuenta en días cuando pasa de uno', () => {
  const a = accionesDeInicio({ ...LIMPIO, horasDesdeBanco: 75 })[0]
  assert.match(a.titulo, /3 días/)
})

test('una póliza a ≤15 días es roja; más lejos, ámbar', () => {
  const cerca = accionesDeInicio({ ...LIMPIO, polizas: { estado: 'ok', enDias: 60, polizas: [{ cliente: 'Pérez', dias: 12 }] } })[0]
  assert.equal(cerca.urgencia, 'roja')
  const lejos = accionesDeInicio({ ...LIMPIO, polizas: { estado: 'ok', enDias: 60, polizas: [{ cliente: 'Pérez', dias: 40 }] } })[0]
  assert.equal(lejos.urgencia, 'ambar')
})

test('con varias pólizas se nombra la más próxima, no la primera de la lista', () => {
  const a = accionesDeInicio({
    ...LIMPIO,
    polizas: { estado: 'ok', enDias: 60, polizas: [{ cliente: 'Lejos', dias: 50 }, { cliente: 'Cerca', dias: 4 }] },
  })[0]
  assert.match(a.titulo, /2 pólizas vencen/)
  assert.match(a.detalle, /Cerca, en 4 días/)
})

test('si los vencimientos no se pueden leer, se dice — y se dice que NO significa que no venza nada', () => {
  const a = accionesDeInicio({ ...LIMPIO, polizas: { estado: 'error', motivo: 'red' } })[0]
  assert.match(a.titulo, /No se han podido leer los vencimientos/)
  assert.match(a.detalle, /NO significa que no venza ninguna póliza/)
  assert.equal(todoComprobado({ ...LIMPIO, polizas: { estado: 'error', motivo: 'red' } }), false)
})

test('sin_configurar no es un error: la correduría puede no estar enchufada', () => {
  assert.deepEqual(claves({ ...LIMPIO, polizas: { estado: 'sin_configurar' } }), [])
  assert.equal(todoComprobado({ ...LIMPIO, polizas: { estado: 'sin_configurar' } }), true)
})

test('el orden es rojo → ámbar → info, no el de declaración', () => {
  const u = accionesDeInicio({
    porRevisar: 3, ingresosPorRevisar: 1, duplicados: 0, facturasPendientes: 2,
    horasDesdeBanco: 200,
    polizas: { estado: 'ok', enDias: 60, polizas: [{ cliente: 'X', dias: 40 }] },
  }).map(a => a.urgencia)
  assert.deepEqual(u, [...u].sort((a, b) => ({ roja: 0, ambar: 1, info: 2 })[a] - ({ roja: 0, ambar: 1, info: 2 })[b]))
  assert.equal(u[0], 'roja')
})

test('el singular y el plural se dicen bien', () => {
  assert.match(accionesDeInicio({ ...LIMPIO, porRevisar: 1 })[0].titulo, /^1 movimiento sin clasificar$/)
  assert.match(accionesDeInicio({ ...LIMPIO, porRevisar: 2 })[0].titulo, /^2 movimientos sin clasificar$/)
  const una = accionesDeInicio({ ...LIMPIO, polizas: { estado: 'ok', enDias: 60, polizas: [{ cliente: 'X', dias: 1 }] } })[0]
  assert.match(una.titulo, /1 póliza vence/)
  assert.match(una.detalle, /en 1 día\./)
})

test('cada acción lleva a una pantalla donde se puede hacer algo', () => {
  const todas = accionesDeInicio({
    porRevisar: 1, ingresosPorRevisar: 1, duplicados: 1, facturasPendientes: 1, horasDesdeBanco: null,
    polizas: { estado: 'ok', enDias: 60, polizas: [{ cliente: 'X', dias: 3 }] },
  })
  assert.equal(todas.length, 6)
  for (const a of todas) assert.match(a.href, /^\/[a-z]/, `${a.clave} sin destino`)
})

test('sin banco vinculado NO se avisa de frescura: no aplica ≠ no se sabe', () => {
  assert.deepEqual(claves({ ...LIMPIO, horasDesdeBanco: 'no_aplica' }), [])
  assert.equal(todoComprobado({ ...LIMPIO, horasDesdeBanco: 'no_aplica' }), true)
})
