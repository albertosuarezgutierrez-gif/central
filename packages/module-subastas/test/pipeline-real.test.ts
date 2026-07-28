// Prueba END-TO-END de la cadena pura con los correos REALES del BOE:
//   correo → parseo → provincia → coste "puerta abierta" → scoring → radar
// Es la que responde a «¿esto funcionaría de verdad mañana por la mañana?».
// `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearAlertaBoe } from '../src/email-boe.ts'
import { provinciaPorMunicipio } from '../src/geo.ts'
import { evaluarOportunidad } from '../src/scoring.ts'
import { coincideSubasta } from '../src/radar.ts'
import { CORREOS_REALES } from './fixtures-reales.ts'
import type { CriteriosSubasta, SubastaInmueble } from '../src/types.ts'

/** Reproduce lo que hace `lib/subastas-ingesta.ts` al ingerir un correo. */
function ingerir(): SubastaInmueble[] {
  return CORREOS_REALES.flatMap((c) =>
    parsearAlertaBoe(c.html, c.asunto).map((r) => ({
      ...r.subasta,
      provincia: provinciaPorMunicipio(r.subasta.descripcion, r.busqueda),
    })),
  )
}

// Los criterios reales de Alberto: sus seis búsquedas cubren estas 4 provincias.
const CRITERIOS: CriteriosSubasta = {
  provincias: ['Sevilla', 'Huelva', 'Cádiz', 'Asturias'],
}

test('la provincia se resuelve para las 4 alertas reales', () => {
  const subastas = ingerir()
  assert.deepEqual(
    subastas.map((s) => s.provincia),
    [
      'Sevilla',   // «Dos Hermanas» en la descripción
      'Huelva',    // descripción plantilla → cae al nombre de la búsqueda «PUNTA UMBRIA»
      'Asturias',  // «Belmonte de Miranda» / «Pravia»
      'Cádiz',     // «El Puerto de Santa María»
    ],
  )
})

test('con los criterios reales de Alberto, las 4 casan', () => {
  for (const s of ingerir()) {
    const c = coincideSubasta(s, CRITERIOS, evaluarOportunidad(s))
    assert.equal(c.casa, true, `${s.identificador} debería casar (${s.provincia})`)
  }
})

test('una subasta fuera de sus provincias se descarta', () => {
  const [sevilla] = ingerir()
  const fuera = { ...sevilla, provincia: 'Lugo' }
  assert.equal(coincideSubasta(fuera, CRITERIOS).casa, false)
})

test('sin cifras del BOE, la puntuación es null y se dice por qué', () => {
  for (const s of ingerir()) {
    const o = evaluarOportunidad(s)
    assert.equal(o.puntuacion, null, `${s.identificador} no puede puntuarse sin tasación`)
    assert.equal(o.valorMercado, null)
    assert.ok(o.motivos.some((m) => m.includes('no se puede calcular')))
    // Y el depósito tampoco se inventa: depende del valor de subasta, que falta.
    assert.equal(o.deposito, null)
  }
})

test('un filtro de descuento mínimo descarta lo no puntuable en vez de colarlo', () => {
  // Regla de seguridad: sin datos para calcular el descuento, NO se avisa.
  // Lo contrario llenaría el Telegram de subastas sin evaluar.
  for (const s of ingerir()) {
    const c = coincideSubasta(s, { ...CRITERIOS, descuentoMin: 30 }, evaluarOportunidad(s))
    assert.equal(c.casa, false)
    assert.match(c.descartadaPor ?? '', /sin datos/)
  }
})

test('en cuanto se enriquece la ficha, la misma subasta ya puntúa', () => {
  // Simula lo que añadirá la fase de enriquecimiento desde subastas.boe.es:
  // tasación, valor de salida y cargas. Nada más cambia.
  const [sevilla] = ingerir()
  const enriquecida: SubastaInmueble = {
    ...sevilla,
    valorSubasta: 120000,
    tasacion: 260000,
    cargas: 0,
    cargasConocidas: true,
    situacionPosesoria: 'libre',
    ejecutado: 'fisica',
  }
  const o = evaluarOportunidad(enriquecida)
  assert.equal(o.deposito, 6000)                       // 5% de 120.000
  assert.equal(o.coste.impuestoTransmision, 8400)      // ITP 7% de 120.000
  assert.equal(o.coste.total, 130200)                  // + notaría 1.200 + cancelación 600
  assert.equal(o.puntuacion, 50)                       // descuento real sobre 260.000
  assert.equal(coincideSubasta(enriquecida, { ...CRITERIOS, descuentoMin: 30 }, o).casa, true)
})

test('el valor de referencia del Catastro encarece el impuesto, y se avisa', () => {
  const [sevilla] = ingerir()
  const conValorRef: SubastaInmueble = {
    ...sevilla,
    valorSubasta: 120000,
    tasacion: 260000,
    valorReferencia: 190000, // el Catastro la valora muy por encima del remate
    cargas: 0,
    cargasConocidas: true,
    situacionPosesoria: 'libre',
    ejecutado: 'fisica',
  }
  const o = evaluarOportunidad(conValorRef)
  assert.equal(o.coste.baseImponible, 190000)
  assert.equal(o.coste.impuestoTransmision, 13300)     // 7% de 190.000, no de 120.000
  assert.ok(o.coste.total > 130200, 'cuesta más que sin valor de referencia')
  assert.ok(o.avisos.some((a) => a.includes('valor de referencia del Catastro')))
})
