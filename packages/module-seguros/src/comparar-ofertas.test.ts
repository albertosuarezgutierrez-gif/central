import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarGarantia, ramoOfertaDe, garantiasDelRamo } from './coberturas-taxonomia.ts'
import { RAMOS_OPORTUNIDAD } from './oportunidad-seguimiento.ts'
import { compararOfertas, cifrasDeMatriz, UMBRAL_CONTINENTE_EUR_M2, type OfertaNormalizada, type ValorGarantia } from './comparar-ofertas.ts'

const v = (p: Partial<ValorGarantia> = {}): ValorGarantia => ({ estado: null, capital: null, limite: null, franquicia: null, ...p })

/** Fixtures ANÓNIMOS inspirados en una comunidad real: 3 viviendas, 217 m², 1974. */
const ACTUAL: OfertaNormalizada = {
  id: 'act', rol: 'actual', compania: 'Compañía A', producto: 'Comunidades', primaTotal: 522.6, primaNeta: 480,
  garantias: {
    continente: v({ capital: 200000 }),
    contenido: v({ capital: 1000 }),
    rc_general: v({ limite: 300000 }),
    rc_organos_gobierno: v({ limite: 6000 }),
    danos_agua: v({ estado: 'incluida', franquicia: 400 }),
    defensa_juridica: v({ estado: 'incluida' }),
  },
}
const OFERTA_B: OfertaNormalizada = {
  id: 'b', rol: 'oferta', compania: 'Compañía B', producto: 'Hogar Comunidad', primaTotal: 612.9, primaNeta: 560,
  garantias: {
    continente: v({ capital: 250000 }),
    contenido: v({ capital: 3000 }),
    rc_general: v({ limite: 150000 }),
    // rc_organos_gobierno: no consta (hueco)
    danos_agua: v({ estado: 'incluida', franquicia: 150 }),
    defensa_juridica: v({ estado: 'excluida' }),
    'Gastos de reparación estética': v({ limite: 600 }),
  },
}
const OFERTA_C: OfertaNormalizada = {
  id: 'c', rol: 'oferta', compania: 'Compañía C', producto: null, primaTotal: 480, primaNeta: null,
  garantias: {
    continente: v({ capital: 240000 }),
    rc_general: v({ limite: 300000 }),
    rc_organos_gobierno: v({ estado: 'excluida' }),
    danos_agua: v({ estado: 'incluida', franquicia: 600 }),
  },
}
const cmp = () => compararOfertas({ ramo: 'comunidades', ofertas: [ACTUAL, OFERTA_B, OFERTA_C], superficieM2: 217 })
const celda = (r: ReturnType<typeof cmp>, clave: string, id: string) => r.filas.find(f => f.clave === clave)!.celdas.find(c => c.ofertaId === id)!

test('sinónimos reales de compañía', () => {
  assert.equal(normalizarGarantia('comunidades', 'RC administradores'), 'rc_organos_gobierno')
  assert.equal(normalizarGarantia('comunidades', 'R.C. Órganos de Gobierno'), 'rc_organos_gobierno')
  assert.equal(normalizarGarantia('comunidades', 'Enseres comunes'), 'contenido')
  assert.equal(normalizarGarantia('comunidades', 'Daños por AGUA'), 'danos_agua')
  assert.equal(normalizarGarantia('comunidades', 'Agua'), 'danos_agua')
  assert.equal(normalizarGarantia('comunidades', 'Responsabilidad Civil'), 'rc_general')
  assert.equal(normalizarGarantia('comercio', 'Pérdida de beneficios'), 'perdida_beneficios')
  assert.equal(normalizarGarantia('comercio', 'Responsabilidad civil patronal'), 'rc_patronal')
  assert.equal(normalizarGarantia('comunidades', 'Cobertura de marcianos'), null)
  assert.equal(normalizarGarantia('comunidades', ''), null)
})

test('taxonomía: claves únicas por ramo, mapeo de ramos y alineación con RAMOS_OPORTUNIDAD', () => {
  for (const r of ['comunidades', 'comercio', 'hogar', 'generico'] as const) {
    const ks = garantiasDelRamo(r).map(x => x.clave)
    assert.equal(new Set(ks).size, ks.length, r)
  }
  assert.equal(ramoOfertaDe('pymes'), 'comercio')
  for (const r of ['comunidades', 'comercio', 'hogar']) assert.ok((RAMOS_OPORTUNIDAD as readonly string[]).includes(r))
  assert.equal(ramoOfertaDe('auto'), 'generico')
  assert.equal(ramoOfertaDe(null), 'generico')
})

test('null (no figura) ≠ excluida: hueco solo cuando no consta; excluida es peor, no hueco', () => {
  const r = cmp()
  const b = celda(r, 'rc_organos_gobierno', 'b')
  assert.equal(b.consta, false)
  assert.equal(b.hueco, true)
  assert.equal(b.peorQueActual, false)
  const c = celda(r, 'rc_organos_gobierno', 'c')
  assert.equal(c.consta, true)
  assert.equal(c.hueco, false)
  assert.equal(c.peorQueActual, true)
  const dj = celda(r, 'defensa_juridica', 'b')
  assert.equal(dj.peorQueActual, true)
  assert.equal(dj.hueco, false)
})

test('no hay garantías inventadas a 0: valor ausente sigue siendo null', () => {
  const r = cmp()
  assert.equal(celda(r, 'rc_organos_gobierno', 'b').valor, null)
  assert.equal(celda(r, 'contenido', 'c').valor, null)
  assert.equal(celda(r, 'contenido', 'c').hueco, true)
  assert.equal(r.filas.find(f => f.clave === 'incendio'), undefined, 'fila canónica sin datos se omite')
})

test('marcas mejor/peor: capital, límite y franquicia', () => {
  const r = cmp()
  assert.equal(celda(r, 'continente', 'b').mejorQueActual, true)
  assert.equal(celda(r, 'rc_general', 'b').peorQueActual, true)
  assert.equal(celda(r, 'rc_general', 'c').peorQueActual, false)
  assert.equal(celda(r, 'rc_general', 'c').mejorQueActual, false)
  assert.equal(celda(r, 'danos_agua', 'b').mejorQueActual, true) // franquicia 150 < 400
  assert.equal(celda(r, 'danos_agua', 'c').peorQueActual, true) // franquicia 600 > 400
  assert.equal(celda(r, 'continente', 'act').mejorQueActual, false)
})

test('resumen: deltas de prima, contadores y franquicia máxima', () => {
  const r = cmp()
  const rb = r.resumen.find(s => s.ofertaId === 'b')!
  assert.equal(rb.deltaPrimaEur, 90.3)
  assert.equal(rb.deltaPrimaPct, 17.3)
  assert.equal(rb.huecos, 1)
  assert.equal(rb.garantiasPeor, 2) // rc_general, defensa_juridica
  assert.equal(rb.garantiasMejor, 3) // continente, contenido, agua
  assert.equal(rb.franquiciaMaxima, 150)
  const rc = r.resumen.find(s => s.ofertaId === 'c')!
  assert.equal(rc.deltaPrimaEur, -42.6)
  assert.equal(rc.franquiciaMaxima, 600)
  assert.equal(r.resumen.find(s => s.ofertaId === 'act')!.deltaPrimaEur, null)
})

test('delta nulo si falta una prima (no se asume 0)', () => {
  const sinPrima = { ...OFERTA_C, id: 'd', primaTotal: null }
  const r = compararOfertas({ ramo: 'comunidades', ofertas: [ACTUAL, sinPrima] })
  assert.equal(r.resumen[1].deltaPrimaEur, null)
  assert.equal(r.resumen[1].deltaPrimaPct, null)
})

test('infraseguro de continente por €/m²', () => {
  const r = cmp()
  const a = r.resumen.find(s => s.ofertaId === 'act')!.infraseguroContinente!
  assert.equal(a.eurPorM2, 921.66)
  assert.equal(a.umbral, UMBRAL_CONTINENTE_EUR_M2)
  assert.equal(r.resumen.find(s => s.ofertaId === 'b')!.infraseguroContinente, null) // 1.152,07 €/m²
  assert.equal(r.resumen.find(s => s.ofertaId === 'c')!.infraseguroContinente, null) // 1.105,99 €/m², por encima del umbral
})

test('sin superficie no hay alerta de infraseguro', () => {
  const r = compararOfertas({ ramo: 'comunidades', ofertas: [ACTUAL, OFERTA_B] })
  assert.ok(r.resumen.every(s => s.infraseguroContinente === null))
})

test('extras no canónicas al final', () => {
  const r = cmp()
  const ult = r.filas[r.filas.length - 1]
  assert.equal(ult.clave, 'Gastos de reparación estética')
  assert.equal(ult.canonica, false)
  assert.equal(r.filas.findIndex(f => f.clave === 'continente'), 0)
})

test('cifrasDeMatriz recoge importes, deltas y porcentajes formateados', () => {
  const s = cifrasDeMatriz(cmp())
  for (const x of ['522,60€', '200.000,00€', '200.000', '90,30€', '17,3%', '42,60€', '921,66€', '1.100,00€', '217']) {
    assert.ok(s.has(x), x)
  }
  assert.equal(s.has('999.999'), false)
})
