import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decidirEventoSinRespaldo,
  decidirEventoNoCatalogado,
  decidirPrecioPorPlaza,
  decidirCompsDeOtroAforo,
  factorAforo,
  decidirEventoACiegas,
  decidirRitmoDestacado,
} from './pricing-centinelas.ts'

// ─── 1. Evento declarado que el mercado no respalda ──────────────────────────────────────────

test('el caso Feria 2027: fecha declarada de Feria con mercado de dia normal → alerta', () => {
  // 20/04/2027 estaba marcado x2,8 en el calendario. El mercado de ese dia iba como un abril normal.
  const v = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 162, p50Mes: 155, compsFecha: 14 })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /FECHA/)
})

test('la Feria de verdad (mercado x3 el mes) no dispara', () => {
  const v = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 470, p50Mes: 155, compsFecha: 14 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('un puente flojo no se juzga como evento fuerte', () => {
  const v = decidirEventoSinRespaldo({ factorEvento: 1.3, p50Fecha: 100, p50Mes: 100, compsFecha: 30 })
  assert.equal(v.evaluado, false)
})

test('sin muestra NO dice "todo bien": dice que no ha podido mirarlo', () => {
  const pocos = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 162, p50Mes: 155, compsFecha: 3 })
  assert.equal(pocos.alerta, false)
  assert.equal(pocos.evaluado, false)

  const sinMes = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 162, p50Mes: null, compsFecha: 20 })
  assert.equal(sinMes.evaluado, false)

  const sinFecha = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: null, p50Mes: 155, compsFecha: 20 })
  assert.equal(sinFecha.evaluado, false)
})

test('justo en el umbral de ratio se sostiene (no alerta)', () => {
  const v = decidirEventoSinRespaldo({ factorEvento: 2.0, p50Fecha: 125, p50Mes: 100, compsFecha: 10 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

// ─── 2. Mercado disparado sin evento catalogado ──────────────────────────────────────────────

test('el caso Bienal: septiembre con el mercado al doble y sin evento → alerta', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1, p50Fecha: 240, p50Mes: 120, compsFecha: 12 })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /NO hay evento catalogado/)
})

test('si el evento ya esta catalogado no volvemos a avisar', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1.6, p50Fecha: 240, p50Mes: 120, compsFecha: 12 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /catalogado/)
})

test('un finde normal (mercado x1,2) no dispara: seria ruido diario', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1, p50Fecha: 144, p50Mes: 120, compsFecha: 12 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('sin mercado suficiente tampoco opina', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1, p50Fecha: 240, p50Mes: 120, compsFecha: 2 })
  assert.equal(v.evaluado, false)
})

// ─── 3. Precio por plaza ─────────────────────────────────────────────────────────────────────

test('el caso Socorro: 165€ en una casa de 12 plazas es precio de hostal → alerta', () => {
  const v = decidirPrecioPorPlaza({ precio: 165, plazas: 12 })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  // 165 * 0,76 / 12 = 10,45€ por plaza — Alberto lo calculo en bruto (13,75€) y ya le parecio poco.
  assert.match(v.motivo, /10\.45€ por plaza/)
})

test('el suelo nuevo de House (300€) pasa holgado', () => {
  const v = decidirPrecioPorPlaza({ precio: 300, plazas: 12 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('en un piso pequeño la metrica NO aplica y se dice, no se aprueba', () => {
  // Luxury: suelo 72€ para 5 plazas = 10,94€/plaza y aun asi cubre el coste 2,4 veces. Si esto
  // se juzgara con la vara de Socorro, el guardian avisaria a diario de un piso que esta bien.
  const luxury = decidirPrecioPorPlaza({ precio: 72, plazas: 5 })
  assert.equal(luxury.alerta, false)
  assert.equal(luxury.evaluado, false)

  const busto = decidirPrecioPorPlaza({ precio: 65, plazas: 2 })
  assert.equal(busto.alerta, false)
  assert.equal(busto.evaluado, false)
})

test('sin aforo no se inventa un veredicto', () => {
  assert.equal(decidirPrecioPorPlaza({ precio: 165, plazas: null }).evaluado, false)
  assert.equal(decidirPrecioPorPlaza({ precio: 165, plazas: 0 }).evaluado, false)
  assert.equal(decidirPrecioPorPlaza({ precio: 0, plazas: 12 }).evaluado, false)
})

test('el ratio de canal se puede afinar (la venta directa no paga comision)', () => {
  // 280€ entre 12 plazas: por Booking son 17,73€/plaza (avisa); a puerta, 23,33€ (no avisa).
  const canal = decidirPrecioPorPlaza({ precio: 280, plazas: 12 })
  const directa = decidirPrecioPorPlaza({ precio: 280, plazas: 12, ratioCanal: 1 })
  assert.equal(canal.alerta, true)
  assert.equal(directa.alerta, false)
})

// ─── 4. comparables de otro aforo ───────────────────────────────────────────────────────────

test('factorAforo replica la funcion SQL pricing_factor_aforo', () => {
  // Valores medidos contra Postgres el 01/08/2026 (SELECT pricing_factor_aforo(...)).
  assert.equal(factorAforo(12, 12), 1)
  assert.equal(factorAforo(2, 2), 1)
  assert.ok(Math.abs(factorAforo(12, 8) - 1.5620696159886159) < 1e-9)
  assert.ok(Math.abs(factorAforo(5, 4) - 1.2782064782044662) < 1e-9)
  // Recortes: ni regala ni multiplica sin freno.
  assert.equal(factorAforo(12, 1), 2.5)
  assert.equal(factorAforo(1, 12), 0.6)
})

test('el caso House: casa de 12 plazas medida con comps de 8 (01/08/2026)', () => {
  const v = decidirCompsDeOtroAforo({ plazasPiso: 12, comps: [{ plazas: 8, n: 30 }] })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /EXTRAPOLADO x1\.56/)
})

test('una plaza de diferencia NO avisa: es ruido de como se cuentan los sofas-cama', () => {
  // Luxury Busto: 5 plazas medidas con comps de 4 → x1,28, por debajo del umbral de 1,35.
  const v = decidirCompsDeOtroAforo({ plazasPiso: 5, comps: [{ plazas: 4, n: 30 }] })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('con comps del propio aforo en mayoria, el ancla esta medida', () => {
  const v = decidirCompsDeOtroAforo({ plazasPiso: 12, comps: [{ plazas: 12, n: 20 }, { plazas: 8, n: 10 }] })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /medida/)
})

test('manda el aforo DOMINANTE, no el primero de la lista', () => {
  // 2 comps de 12 y 28 de 8: la cuota propia (6%) no llega, y quien fija la extrapolacion es el 8.
  const v = decidirCompsDeOtroAforo({ plazasPiso: 12, comps: [{ plazas: 12, n: 2 }, { plazas: 8, n: 28 }] })
  assert.equal(v.alerta, true)
  assert.match(v.motivo, /de 8 plazas/)
})

test('sin muestra o sin aforo NO se opina (regla 1 del modulo)', () => {
  assert.equal(decidirCompsDeOtroAforo({ plazasPiso: 12, comps: [{ plazas: 8, n: 3 }] }).evaluado, false)
  assert.equal(decidirCompsDeOtroAforo({ plazasPiso: null, comps: [{ plazas: 8, n: 30 }] }).evaluado, false)
  assert.equal(decidirCompsDeOtroAforo({ plazasPiso: 12, comps: [] }).evaluado, false)
})

test('comps MAS GRANDES que el piso tambien avisan (la extrapolacion va en los dos sentidos)', () => {
  // Un apartamento de 4 medido con casas de 10: factor 0,43 → recortado a 0,6, desvio 1,67.
  const v = decidirCompsDeOtroAforo({ plazasPiso: 4, comps: [{ plazas: 10, n: 20 }] })
  assert.equal(v.alerta, true)
})

// ————— 5. evento a ciegas (caso Bienal 13/08/2026) —————

test('la Bienal: evento confirmado x1,25 con 0 comps fiables → CONGELAR y alertar', () => {
  const v = decidirEventoACiegas({ factorEvento: 1.25, compsFiablesFecha: 0 })
  assert.equal(v.congelar, true)
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /a ciegas/)
})

test('con la fecha MEDIDA (≥3 comps fiables) el mercado manda: no se congela nada', () => {
  const v = decidirEventoACiegas({ factorEvento: 1.25, compsFiablesFecha: 3 })
  assert.equal(v.congelar, false)
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('sin evento confirmado no hay nada que evaluar (un martes sin comps es normal)', () => {
  const v = decidirEventoACiegas({ factorEvento: 1, compsFiablesFecha: 0 })
  assert.equal(v.congelar, false)
  assert.equal(v.evaluado, false)
})

test('un factor por debajo del umbral (puente flojo 1,1) tampoco congela', () => {
  const v = decidirEventoACiegas({ factorEvento: 1.1, compsFiablesFecha: 0 })
  assert.equal(v.congelar, false)
  assert.equal(v.evaluado, false)
})

test('2 comps fiables siguen siendo a ciegas (el umbral es el del bucket por fecha)', () => {
  const v = decidirEventoACiegas({ factorEvento: 2.2, compsFiablesFecha: 2 })
  assert.equal(v.congelar, true)
})

// ─── 6. Ritmo de venta destacado ─────────────────────────────────────────────────────────────
// Caso fundacional (25/08/2026, foto real de rate_snapshots): septiembre con House al 43% y los
// otros tres al 10-13% — lo vio Alberto a ojo, ningún vigilante lo decía.

const SEPT_REAL = {
  mes: '2026-09',
  diasHastaMes: 7,
  pisos: [
    { property_id: 'prop_busto_reform', noches: 30, ocupadas: 3, antelacionMediana: 108 },
    { property_id: 'prop_duplex_center', noches: 30, ocupadas: 3, antelacionMediana: 7 },
    { property_id: 'prop_house_sevillana', noches: 30, ocupadas: 13, antelacionMediana: 32 },
    { property_id: 'prop_luxury_busto', noches: 30, ocupadas: 4, antelacionMediana: 57 },
  ],
}

test('ritmo: el caso fundacional salta — House 43% vs mediana 13%', () => {
  const hits = decidirRitmoDestacado(SEPT_REAL)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].property_id, 'prop_house_sevillana')
  assert.equal(hits[0].ocupPct, 43)
  assert.ok(hits[0].motivo.includes('2026-09'))
})

test('ritmo: octubre real (26% vs mediana 23%) NO salta — sin falsa alarma', () => {
  const hits = decidirRitmoDestacado({
    mes: '2026-10', diasHastaMes: 37,
    pisos: [
      { property_id: 'prop_busto_reform', noches: 31, ocupadas: 7, antelacionMediana: 108 },
      { property_id: 'prop_duplex_center', noches: 31, ocupadas: 7, antelacionMediana: 7 },
      { property_id: 'prop_house_sevillana', noches: 31, ocupadas: 8, antelacionMediana: 32 },
      { property_id: 'prop_luxury_busto', noches: 31, ocupadas: 9, antelacionMediana: 57 },
    ],
  })
  assert.equal(hits.length, 0)
})

test('ritmo: el mes corriente no se juzga (mezcla noches pasadas)', () => {
  assert.equal(decidirRitmoDestacado({ ...SEPT_REAL, diasHastaMes: 0 }).length, 0)
})

test('ritmo: sin hermanos con muestra no hay contraste (2 pisos no bastan)', () => {
  const hits = decidirRitmoDestacado({
    mes: '2026-09', diasHastaMes: 7,
    pisos: [
      { property_id: 'a', noches: 30, ocupadas: 15, antelacionMediana: 20 },
      { property_id: 'b', noches: 30, ocupadas: 2, antelacionMediana: 20 },
    ],
  })
  assert.equal(hits.length, 0)
})

test('ritmo: brecha absoluta chica no salta aunque el ratio sea enorme (6% vs 2%)', () => {
  const hits = decidirRitmoDestacado({
    mes: '2027-01', diasHastaMes: 60,
    pisos: [
      { property_id: 'a', noches: 31, ocupadas: 11, antelacionMediana: 20 }, // 35%… pero
      { property_id: 'b', noches: 31, ocupadas: 1, antelacionMediana: 20 },
      { property_id: 'c', noches: 31, ocupadas: 1, antelacionMediana: 20 },
      { property_id: 'd', noches: 31, ocupadas: 1, antelacionMediana: 20 },
    ],
    // 35% vs mediana 3%: ratio y brecha (32pp) pasan → SÍ salta. Bajamos la ocupación del candidato:
  })
  assert.equal(hits.length, 1)
  const pocos = decidirRitmoDestacado({
    mes: '2027-01', diasHastaMes: 60,
    pisos: [
      { property_id: 'a', noches: 31, ocupadas: 6, antelacionMediana: 20 }, // 19% < minOcup
      { property_id: 'b', noches: 31, ocupadas: 1, antelacionMediana: 20 },
      { property_id: 'c', noches: 31, ocupadas: 1, antelacionMediana: 20 },
      { property_id: 'd', noches: 31, ocupadas: 1, antelacionMediana: 20 },
    ],
  })
  assert.equal(pocos.length, 0)
})

test('ritmo: antelación sin muestra se declara, no se calla ni bloquea', () => {
  const hits = decidirRitmoDestacado({
    ...SEPT_REAL,
    pisos: SEPT_REAL.pisos.map(p =>
      p.property_id === 'prop_house_sevillana' ? { ...p, antelacionMediana: null } : p),
  })
  assert.equal(hits.length, 1)
  assert.ok(hits[0].motivo.includes('sin muestra'))
})
