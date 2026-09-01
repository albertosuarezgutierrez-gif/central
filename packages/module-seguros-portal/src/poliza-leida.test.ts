import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarPolizaLeida,
  polizaLeidaVacia,
  seLeyoAlgo,
  RAMOS_POLIZA,
} from './poliza-leida.ts'

test('lo que no es un objeto sale con los cinco campos a null', () => {
  for (const basura of [null, undefined, 'texto', 42, [{ compania: 'Mapfre' }]]) {
    assert.deepEqual(normalizarPolizaLeida(basura), polizaLeidaVacia())
  }
})

test('un campo ausente es null, no cadena vacia', () => {
  const p = normalizarPolizaLeida({ compania: 'Mapfre' })
  assert.equal(p.compania, 'Mapfre')
  assert.equal(p.numeroPoliza, null)
  assert.equal(p.ramo, null)
  assert.equal(p.primaAnual, null)
  assert.equal(p.fechaVencimiento, null)
})

test('los valores de cajon se ANULAN: son un «no lo se» disfrazado de dato', () => {
  const p = normalizarPolizaLeida({
    compania: 'Desconocido',
    numeroPoliza: 'N/A',
    ramo: 'sin datos',
    primaAnual: 'no consta',
    fechaVencimiento: '—',
  })
  assert.deepEqual(p, polizaLeidaVacia())
})

test('la cadena vacia y los espacios tambien son «no se sabe»', () => {
  const p = normalizarPolizaLeida({ compania: '   ', numeroPoliza: '' })
  assert.equal(p.compania, null)
  assert.equal(p.numeroPoliza, null)
})

test('una prima de 0 no es una prima: es un hueco', () => {
  assert.equal(normalizarPolizaLeida({ primaAnual: 0 }).primaAnual, null)
  assert.equal(normalizarPolizaLeida({ primaAnual: -10 }).primaAnual, null)
  assert.equal(normalizarPolizaLeida({ primaAnual: 'hola' }).primaAnual, null)
})

test('la prima acepta numero, cadena y el formato espanol con separador de miles', () => {
  assert.equal(normalizarPolizaLeida({ primaAnual: 312.5 }).primaAnual, 312.5)
  assert.equal(normalizarPolizaLeida({ primaAnual: '312.50' }).primaAnual, 312.5)
  assert.equal(normalizarPolizaLeida({ primaAnual: '2.162,49 €' }).primaAnual, 2162.49)
})

test('la fecha solo vale en YYYY-MM-DD y solo si existe de verdad', () => {
  assert.equal(normalizarPolizaLeida({ fechaVencimiento: '2027-03-14' }).fechaVencimiento, '2027-03-14')
  assert.equal(normalizarPolizaLeida({ fechaVencimiento: '14/03/2027' }).fechaVencimiento, null)
  assert.equal(normalizarPolizaLeida({ fechaVencimiento: '2026-02-31' }).fechaVencimiento, null)
  assert.equal(normalizarPolizaLeida({ fechaVencimiento: 'proximamente' }).fechaVencimiento, null)
})

test('un ramo fuera de la lista es null; «otros» SI es una respuesta valida', () => {
  assert.equal(normalizarPolizaLeida({ ramo: 'AUTO' }).ramo, 'auto')
  assert.equal(normalizarPolizaLeida({ ramo: 'otros' }).ramo, 'otros')
  assert.equal(normalizarPolizaLeida({ ramo: 'ciberriesgo' }).ramo, null)
  assert.ok(RAMOS_POLIZA.includes('responsabilidad_civil'))
})

test('seLeyoAlgo distingue «no hemos leido nada» de «hemos leido algo»', () => {
  assert.equal(seLeyoAlgo(polizaLeidaVacia()), false)
  assert.equal(seLeyoAlgo(normalizarPolizaLeida({ compania: 'Axa' })), true)
})
