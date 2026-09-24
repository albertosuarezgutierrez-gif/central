import test from 'node:test'
import assert from 'node:assert/strict'

import { resumirCartera, type PolizaResumible } from './resumen-cartera.ts'

const HOY = new Date('2026-09-07T00:00:00.000Z')
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const poliza = (p: Partial<PolizaResumible> = {}): PolizaResumible => ({
  fechaVencimiento: d('2026-12-01'),
  prima: { bruta: 100 },
  ...p,
})

test('suma las primas brutas conocidas y dice cuántas quedaron fuera', () => {
  const r = resumirCartera(
    [poliza({ prima: { bruta: 312.5 } }), poliza({ prima: { bruta: 468.25 } }), poliza({ prima: null })],
    HOY,
  )
  assert.equal(r.polizas, 3)
  assert.equal(r.gastoAnual, 780.75)
  assert.equal(r.conPrima, 2)
  assert.equal(r.sinPrima, 1)
})

test('🚨 sin ninguna prima el total es null, NUNCA 0', () => {
  // Un `0€` bajo «Al año» se lee como «no pagas nada», que es una afirmación.
  // Lo que hay es una ausencia, y la pantalla tiene que poder decir las dos
  // cosas por separado. Es la regla global «dato que NO hay ≠ dato que NO se ha
  // mirado» en su forma más barata de romper: un `?? 0` de una línea.
  const r = resumirCartera([poliza({ prima: null }), poliza({ prima: { bruta: null } })], HOY)
  assert.equal(r.gastoAnual, null)
  assert.equal(r.conPrima, 0)
  assert.equal(r.sinPrima, 2)
})

test('🚨 los dos «no lo sé» de la prima cuentan igual', () => {
  // `prima: null` es «tu nivel no ve primas» y `bruta: null` es «la compañía no
  // la ha informado». Son causas distintas y ninguna de las dos autoriza a
  // sumar: si una de ellas se colase como 0, el total seguiría saliendo, más
  // bajo y con la misma pinta de correcto.
  const r = resumirCartera(
    [poliza({ prima: { bruta: 200 } }), poliza({ prima: null }), poliza({ prima: { bruta: null } })],
    HOY,
  )
  assert.equal(r.gastoAnual, 200)
  assert.equal(r.sinPrima, 2)
})

test('🚨 un NaN no envenena la suma', () => {
  // Una prima que llegue como NaN desde un parseo haría que TODA la baldosa
  // dijera «NaN€», no solo esa póliza.
  const r = resumirCartera([poliza({ prima: { bruta: Number.NaN } }), poliza({ prima: { bruta: 50 } })], HOY)
  assert.equal(r.gastoAnual, 50)
  assert.equal(r.sinPrima, 1)
})

test('la suma no arrastra cola de coma flotante', () => {
  const r = resumirCartera([poliza({ prima: { bruta: 0.1 } }), poliza({ prima: { bruta: 0.2 } })], HOY)
  assert.equal(r.gastoAnual, 0.3)
})

test('«próximo» es el vencimiento más cercano, no el primero de la lista', () => {
  // El panel de ejemplo de la web pintaba `activas[0]` bajo la palabra
  // «Próximo»: la primera fila de un array escrito a mano. Con datos reales eso
  // enseña como próximo vencimiento una póliza cualquiera.
  const r = resumirCartera(
    [
      poliza({ fechaVencimiento: d('2027-03-12') }),
      poliza({ fechaVencimiento: d('2026-11-02') }),
      poliza({ fechaVencimiento: d('2026-12-28') }),
    ],
    HOY,
  )
  assert.deepEqual(r.proximoVencimiento, d('2026-11-02'))
})

test('🚨 una fecha PASADA no puede salir bajo la palabra «Próximo»', () => {
  // Hay pólizas vivas cuyo vencimiento ya pasó (medido: 18 el 07/09/2026, en
  // estado activa). El mínimo global las pondría las primeras, así que la
  // baldosa diría «Próximo: 14 mar» de un plazo que caducó.
  const r = resumirCartera(
    [poliza({ fechaVencimiento: d('2026-03-14') }), poliza({ fechaVencimiento: d('2027-01-15') })],
    HOY,
  )
  assert.deepEqual(r.proximoVencimiento, d('2027-01-15'))
  assert.equal(r.vencidas, 1)
})

test('si TODAS están vencidas no hay próximo, y se dice cuántas', () => {
  const r = resumirCartera(
    [poliza({ fechaVencimiento: d('2026-03-14') }), poliza({ fechaVencimiento: d('2026-08-01') })],
    HOY,
  )
  assert.equal(r.proximoVencimiento, null)
  assert.equal(r.vencidas, 2)
})

test('la que vence HOY todavía cuenta como próxima', () => {
  // El vencimiento es el último día de cobertura, no el primero sin ella:
  // mandarla a «vencidas» le quitaría el aviso justo el día que hay que actuar.
  const r = resumirCartera([poliza({ fechaVencimiento: HOY })], HOY)
  assert.deepEqual(r.proximoVencimiento, HOY)
  assert.equal(r.vencidas, 0)
})

test('🚨 sin fecha NO es «no vence»: se cuenta aparte', () => {
  const r = resumirCartera(
    [poliza({ fechaVencimiento: null }), poliza({ fechaVencimiento: d('2026-10-01') })],
    HOY,
  )
  assert.deepEqual(r.proximoVencimiento, d('2026-10-01'))
  assert.equal(r.sinFecha, 1)
  assert.equal(r.vencidas, 0)
})

test('una cartera vacía no afirma nada', () => {
  const r = resumirCartera([], HOY)
  assert.deepEqual(r, {
    polizas: 0,
    gastoAnual: null,
    conPrima: 0,
    sinPrima: 0,
    proximoVencimiento: null,
    vencidas: 0,
    sinFecha: 0,
  })
})
