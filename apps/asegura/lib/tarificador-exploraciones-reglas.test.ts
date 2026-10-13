import test from 'node:test'
import assert from 'node:assert/strict'
import { leerCambioMapa, puedeAprobar, resumirPaso } from './tarificador-exploraciones-reglas.ts'

const resp = {
  version: 1,
  pantalla: { nombre: 'Datos del riesgo', tipo: 'formulario' },
  acciones: [
    { accion: 'rellenar', ref: 'm1e12', dato: 'inmueble.superficie_m2' },
    { accion: 'elegir', ref: 'm1e15', opcion: { valor: 'SECRETO-12345678Z' } },
    { accion: 'avanzar', ref: 'm1e40', efectoEsperado: 'siguiente_pantalla', confianza: 'alta' },
  ],
  mapeo: [],
  motivo: 'ok',
}

test('resumirPaso: acciones por clave/ref, sin valores de opciones', () => {
  const r = resumirPaso({ n: 2, huella: 'a'.repeat(16), respuesta: resp, origen: 'ia', costeEur: 0.04, errores: null })
  assert.equal(r.pantalla, 'Datos del riesgo')
  assert.deepEqual(r.acciones.map((a) => a.accion), ['rellenar', 'elegir', 'avanzar'])
  assert.equal(r.acciones[0].dato, 'inmueble.superficie_m2')
  assert.equal(r.acciones[2].detalle, 'siguiente_pantalla')
  assert.ok(!JSON.stringify(r).includes('SECRETO'), 'el valor de la opción no sale')
  assert.equal(r.rechazada, false)
})

test('resumirPaso: dato o ref con forma de texto libre se anulan; respuesta rota no revienta', () => {
  const r = resumirPaso({
    n: 1, huella: 'b'.repeat(16), origen: 'x', costeEur: Number.NaN, errores: ['x'],
    respuesta: { acciones: [{ accion: 'rellenar', ref: 'Juan Pérez', dato: '12345678Z' }, { accion: 'borrar', ref: 'm1e1' }] },
  })
  assert.equal(r.acciones.length, 1)
  assert.equal(r.acciones[0].ref, null)
  assert.equal(r.acciones[0].dato, null)
  assert.equal(r.origen, 'regla')
  assert.equal(r.costeEur, 0)
  assert.equal(r.rechazada, true)
  assert.deepEqual(resumirPaso({ n: 1, huella: 'c'.repeat(16), respuesta: null, origen: 'regla', costeEur: 0, errores: null }).acciones, [])
})

test('leerCambioMapa: solo estados conocidos', () => {
  assert.deepEqual(leerCambioMapa({ estado: 'revisado' }), { ok: true, estado: 'revisado' })
  assert.equal(leerCambioMapa({ estado: 'publicado' }).ok, false)
  assert.equal(leerCambioMapa(null).ok, false)
  assert.equal(leerCambioMapa([]).ok, false)
})

test('puedeAprobar: exige mapa y exploración cerrada', () => {
  assert.equal(puedeAprobar({ tieneMapa: false, cerrada: true }), 'sin_mapa')
  assert.equal(puedeAprobar({ tieneMapa: true, cerrada: false }), 'sin_cerrar')
  assert.equal(puedeAprobar({ tieneMapa: true, cerrada: true }), 'ok')
})
