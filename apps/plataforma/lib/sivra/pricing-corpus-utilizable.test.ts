import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_COMPS_PASADA, sqlUltimaPasadaUtil, avisoPisosSinTarifar } from './pricing-corpus-utilizable.ts'
import { MIN_EUR_PLAZA_COMP } from './pricing-comps-plausibles.ts'

test('la pasada elegida se filtra por plausibilidad ANTES de contar', () => {
  const sql = sqlUltimaPasadaUtil()
  // Lo que hacía falla el 22/08: el MAX() se calculaba sobre TODAS las filas, así que una pasada
  // de puro ruido ganaba. El filtro tiene que estar dentro de la subconsulta, no fuera.
  assert.match(sql, new RegExp(`price_night >= ${MIN_EUR_PLAZA_COMP} \\* guests`))
  assert.match(sql, new RegExp(`HAVING COUNT\\(\\*\\) >= ${MIN_COMPS_PASADA}`))
  const posFiltro = sql.indexOf('price_night >=')
  const posHaving = sql.indexOf('HAVING')
  assert.ok(posFiltro < posHaving, 'el filtro de €/plaza va antes del recuento, no después')
})

test('el aforo NULL no se juzga aquí tampoco', () => {
  // Coherente con esCompPlausible: un comp sin aforo declarado es un «no lo sé», y un «no lo sé»
  // no autoriza a descartarlo del recuento.
  assert.match(sqlUltimaPasadaUtil(), /guests IS NULL OR guests <= 0 OR/)
})

test('el SQL no interpola nada de fuera (va a Prisma.raw)', () => {
  // Si alguna vez este texto acepta un parámetro, deja de poder ir en un Prisma.raw.
  assert.equal(sqlUltimaPasadaUtil.length, 0, 'la función no debe aceptar argumentos')
  assert.doesNotMatch(sqlUltimaPasadaUtil(), /\$\{|\$\d/, 'sin marcadores de parámetro')
})

test('sin pisos saltados NO hay aviso', () => {
  // Un aviso que salta siempre deja de leerse.
  assert.equal(avisoPisosSinTarifar([], 5, 7), null)
})

test('el aviso distingue «pocos comparables» de «mercado viejo»', () => {
  const txt = avisoPisosSinTarifar([
    { property: 'prop_house_sevillana', sample_n: 1, market_age_days: 0 },
    { property: 'prop_busto_reform', sample_n: 40, market_age_days: 12 },
  ], 5, 7)
  assert.ok(txt)
  assert.match(txt, /house_sevillana: 1 comparable\(s\) utilizables \(hacen falta 5\)/)
  assert.match(txt, /busto_reform: mercado de hace 12d \(máximo 7\)/)
})

test('🚨 el aviso NO dice que los precios estén bien, dice que no se han mirado', () => {
  // El fallo de esta familia es exactamente ese: convertir un «no lo sé» en un «todo en orden».
  const txt = avisoPisosSinTarifar([{ property: 'prop_house_sevillana', sample_n: 1, market_age_days: 0 }], 5, 7)
  assert.ok(txt)
  assert.match(txt, /no se ha podido mirar/)
  assert.doesNotMatch(txt, /correcto|en orden|✅/)
})

test('el caso real del 22/08: House con 1 comp de 22 se salta y se avisa', () => {
  const txt = avisoPisosSinTarifar([{ property: 'prop_house_sevillana', sample_n: 1, market_age_days: 0 }], 5, 7)
  assert.ok(txt)
  assert.match(txt, /1 piso\(s\) NO se han tarificado/)
  assert.match(txt, /sivra_mercado_booking/, 'apunta a dónde mirar')
})
