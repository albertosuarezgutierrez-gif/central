import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasHasta, enVentanaVencimientos, textoTareaPrecio, validarPeticionPrecio } from './mejorar-precio.ts'

test('valida la petición: prioridad y canal obligatorios; momento solo con llamada', () => {
  assert.equal(validarPeticionPrecio({}).ok, false)
  assert.equal(validarPeticionPrecio({ prioridad: 'precio' }).ok, false)
  // Llamada sin momento: no se inventa uno.
  assert.equal(validarPeticionPrecio({ prioridad: 'precio', canal: 'llamada' }).ok, false)
  const correo = validarPeticionPrecio({ prioridad: 'ambas', canal: 'correo', momento: 'tarde', nota: '  ' })
  assert.deepEqual(correo, { ok: true, peticion: { prioridad: 'ambas', canal: 'correo', momento: null, nota: null } })
  const llamada = validarPeticionPrecio({ prioridad: 'coberturas', canal: 'llamada', momento: 'manana', nota: 'x'.repeat(900) })
  assert.ok(llamada.ok)
  assert.equal(llamada.peticion.nota?.length, 500)
  // Un valor de fuera de la lista no se cuela.
  assert.equal(validarPeticionPrecio({ prioridad: 'regalo', canal: 'correo' }).ok, false)
})

test('🪤 la ventana es de hoy a 60 días: lo pasado NO entra (no sabemos si renovó)', () => {
  assert.equal(diasHasta('2026-10-20', '2026-09-23'), 27)
  assert.equal(enVentanaVencimientos(27), true)
  assert.equal(enVentanaVencimientos(0), true)
  assert.equal(enVentanaVencimientos(60), true)
  assert.equal(enVentanaVencimientos(61), false)
  assert.equal(enVentanaVencimientos(-3), false)
  assert.equal(enVentanaVencimientos(null), false)
  assert.equal(diasHasta('no', '2026-09-23'), null)
})

test('la tarea dice qué póliza, qué le importa y cómo contactar, con la nota del cliente', () => {
  const t = textoTareaPrecio({
    ramo: 'auto', compania: 'Mapfre', numeroPoliza: '123', fechaVencimiento: '2026-10-20',
    peticion: { prioridad: 'precio', canal: 'llamada', momento: 'tarde', nota: 'cambio de coche' },
  })
  assert.match(t, /auto · Mapfre · nº 123, renueva el 2026-10-20/)
  assert.match(t, /pagar menos/)
  assert.match(t, /llamada, por la tarde/)
  assert.match(t, /Nota del cliente: cambio de coche/)
})
