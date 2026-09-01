import { test } from 'node:test'
import assert from 'node:assert'
import { componerOrden, fmtFecha, resumenOrdenes } from './orden-texto.ts'

const BASE = {
  piso: 'House Sevillana',
  direccion: 'Calle Socorro 24, 41003, Sevilla',
  checkIn: '2026-09-04',
  titulo: 'Colocar cuna',
  instruccion: 'Dejar montada la cuna en un dormitorio.',
}

test('el asunto lleva piso, fecha en español y el qué', () => {
  assert.equal(componerOrden(BASE).asunto, 'House Sevillana · 04/09/2026 · colocar cuna')
})

test('el cuerpo dice la fecha de entrada, el piso y la instrucción', () => {
  const { texto } = componerOrden(BASE)
  assert.match(texto, /Para la entrada del 04\/09\/2026 en House Sevillana \(Calle Socorro 24, 41003, Sevilla\):/)
  assert.match(texto, /Dejar montada la cuna en un dormitorio\./)
})

// 🚨 El guardián de esta pieza. La orden se manda sin que nadie haya visto un cobro (el caso que la
// creó es un Bizum, que el sistema no ve), así que el email NO puede insinuar que está pagada.
test('una orden NUNCA habla de dinero ni de pago', () => {
  const { asunto, texto } = componerOrden({ ...BASE, huesped: 'Raquel' })
  for (const palabra of [/pagad/i, /cobrad/i, /€/, /\beuros?\b/i, /precio/i, /import/i]) {
    assert.doesNotMatch(texto, palabra, `el cuerpo no debe mencionar ${palabra}`)
    assert.doesNotMatch(asunto, palabra, `el asunto no debe mencionar ${palabra}`)
  }
})

test('el huésped es opcional y no deja huecos raros cuando falta', () => {
  assert.match(componerOrden({ ...BASE, huesped: 'Raquel' }).texto, /\(Huésped: Raquel\.\)/)
  const sin = componerOrden(BASE).texto
  assert.doesNotMatch(sin, /Huésped/)
  assert.doesNotMatch(sin, /\n\n\n/)
})

test('sin dirección no se imprimen paréntesis vacíos', () => {
  const { texto } = componerOrden({ ...BASE, direccion: undefined })
  assert.match(texto, /en House Sevillana:/)
  assert.doesNotMatch(texto, /\(\)/)
})

// Una fecha que no se reconoce se deja tal cual: es mejor que la limpieza lea algo raro y pregunte
// a que lea una fecha inventada por un formateador que no supo parsear.
test('fmtFecha no inventa fechas', () => {
  assert.equal(fmtFecha('2026-09-04T10:00:00Z'), '04/09/2026')
  assert.equal(fmtFecha('el viernes'), 'el viernes')
  assert.equal(fmtFecha(''), '?')
})

const VISIBLE = { instruccion: 'Colocar cuna', enviadoAt: '2026-09-01T10:00:00Z', error: null, tareaId: 't-1' }

test('resumenOrdenes distingue los desenlaces de carga', () => {
  assert.equal(resumenOrdenes(undefined), null)          // aún no cargado: no se afirma nada
  assert.equal(resumenOrdenes(null)?.tono, 'aviso')      // no se pudo leer
  assert.equal(resumenOrdenes([])?.tono, 'neutro')       // leído: no hay nada pedido
  assert.equal(resumenOrdenes([VISIBLE])?.tono, 'ok')    // está en su pantalla
})

// 🚨 El caso que costó el fallo del 01/09: el email salió y Alberto lo dio por avisado, pero la
// limpieza solo mira /invitado/limpieza y allí no había nada.
test('email enviado SIN tarea no se pinta como avisado', () => {
  const r = resumenOrdenes([{ ...VISIBLE, tareaId: null }])
  assert.equal(r?.tono, 'aviso')
  assert.match(r!.texto, /NO está en la pantalla de la limpieza/)
  assert.doesNotMatch(r!.texto, /^🧹 Pedido/)
})

// Sin tarea Y sin email no se ha enterado nadie: es el estado más grave.
test('ni tarea ni email → nadie se ha enterado', () => {
  const r = resumenOrdenes([{ instruccion: 'Colocar cuna', enviadoAt: null, error: 'SMTP caído', tareaId: null }])
  assert.equal(r?.tono, 'error')
  assert.match(r!.texto, /NO se ha enterado/)
})

// El canal que importa es su pantalla: con la tarea creada, un email fallido no bloquea el trabajo.
test('con tarea, el email fallido NO degrada el titular', () => {
  const r = resumenOrdenes([{ instruccion: 'Colocar cuna', enviadoAt: null, error: 'SMTP caído', tareaId: 't-9' }])
  assert.equal(r?.tono, 'ok')
})

test('una orden invisible manda sobre las que sí se ven', () => {
  const r = resumenOrdenes([
    { instruccion: 'Colocar cuna', enviadoAt: '2026-09-01T10:00:00Z', error: null, tareaId: null },
    { ...VISIBLE, instruccion: 'Poner trona' },
  ])
  assert.equal(r?.tono, 'aviso')
  assert.match(r!.texto, /Colocar cuna/)
  assert.doesNotMatch(r!.texto, /Poner trona/)
})

test('«no se ha podido consultar» NUNCA se lee como «no hay nada pedido»', () => {
  assert.doesNotMatch(resumenOrdenes(null)!.texto, /^🧹 Sin órdenes/)
})
