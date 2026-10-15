import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoCivilPorDefecto, garajeInicial, garajeParaBot, garajeParaPack, garajePorDefecto, garajePrevioAplicable } from './supuestos-presupuesto.ts'

test('garajePorDefecto: el comunitario; si no, otro garaje; NUNCA la calle ni la vía pública', () => {
  const cat = [{ id: 'PublicRoad', nombre: 'Vía pública' }, { id: 'PrivateGarage', nombre: 'Garaje individual' }, { id: 'CommunalParking', nombre: 'Garaje comunitario' }]
  assert.equal(garajePorDefecto(cat)?.id, 'CommunalParking')
  assert.equal(garajePorDefecto([cat[0], cat[1]])?.id, 'PrivateGarage')
  // Por el id, si el nombre no dice nada.
  assert.equal(garajePorDefecto([{ id: 'Street', nombre: 'En la calle' }, { id: 'Garage', nombre: 'Otro' }])?.id, 'Garage')
  assert.equal(garajePorDefecto([{ id: 'Street', nombre: 'En la calle' }, { id: 'X', nombre: 'Parking público' }]), null)
  assert.equal(garajePorDefecto([]), null)
})

test('estadoCivilPorDefecto: soltero; sin él en el catálogo, null (se pregunta)', () => {
  assert.equal(estadoCivilPorDefecto([{ id: 'Married', nombre: 'Casado/a' }, { id: 'Single', nombre: 'Soltero/a' }])?.id, 'Single')
  assert.equal(estadoCivilPorDefecto([{ id: 'Single', nombre: 'S' }])?.id, 'Single')
  assert.equal(estadoCivilPorDefecto([{ id: 'Married', nombre: 'Casado/a' }]), null)
})

// 15/10/2026: el riesgo guardaba «PublicRoad» (calle), el catálogo vivo no traía ese id y se tarificaba el comunitario.
const CAT_SIN_CALLE = [{ id: 'PrivateGarage', nombre: 'Garaje individual' }, { id: 'CommunalParking', nombre: 'Garaje colectivo' }]

test('garajeInicial: un garaje del riesgo que no casa NUNCA se sustituye por el defecto', () => {
  const g = garajeInicial('PublicRoad', CAT_SIN_CALLE)
  assert.equal(g.id, '', 'queda sin elegir: ni el comunitario ni ningún otro')
  assert.equal(g.delRiesgo, false)
  assert.equal(g.sinCasar, 'En la vía pública', 'se dice en español qué dice el riesgo')
  // Código nunca visto: tampoco el defecto, y se enseña como código.
  assert.deepEqual(garajeInicial('Xyz', CAT_SIN_CALLE), { id: '', delRiesgo: false, sinCasar: '«Xyz» (código de la compañía)' })
  // Catálogo sin leer: vacío, sin afirmar que «no está en la lista».
  assert.deepEqual(garajeInicial('PublicRoad', []), { id: '', delRiesgo: false, sinCasar: null })
})

test('garajeInicial: el del riesgo se resuelve por id o por equivalencia explícita; el defecto solo sin garaje en el riesgo', () => {
  assert.deepEqual(garajeInicial('PublicRoad', [...CAT_SIN_CALLE, { id: 'Street', nombre: 'Calle' }]), { id: 'Street', delRiesgo: true, sinCasar: null })
  assert.deepEqual(garajeInicial('PrivateGarage', CAT_SIN_CALLE), { id: 'PrivateGarage', delRiesgo: true, sinCasar: null })
  for (const vacio of [null, undefined, '', '  ']) {
    assert.deepEqual(garajeInicial(vacio, CAT_SIN_CALLE), { id: 'CommunalParking', delRiesgo: false, sinCasar: null }, String(vacio))
  }
})

test('garajeParaBot: viaja el del riesgo (no null); lo elegido por el corredor, si lo cambia; el defecto no viaja', () => {
  // Riesgo «PublicRoad» sin casar y nada elegido: viaja el del riesgo (el bot lo traduce a «duerme en la calle»).
  assert.equal(garajeParaBot({ garajeRiesgo: 'PublicRoad', actual: '', elegido: false, resueltoDelRiesgo: null }), 'PublicRoad')
  // Resuelto a otro id del catálogo: viaja el código del riesgo, que el bot sí sabe traducir.
  assert.equal(garajeParaBot({ garajeRiesgo: 'PublicRoad', actual: 'Street', elegido: true, resueltoDelRiesgo: 'Street' }), 'PublicRoad')
  // El corredor eligió otro: manda lo elegido.
  assert.equal(garajeParaBot({ garajeRiesgo: 'PublicRoad', actual: 'PrivateGarage', elegido: true, resueltoDelRiesgo: null }), 'PrivateGarage')
  // Sin riesgo: el defecto de la pantalla no viaja; lo elegido sí.
  assert.equal(garajeParaBot({ garajeRiesgo: null, actual: 'CommunalParking', elegido: false, resueltoDelRiesgo: null }), null)
  assert.equal(garajeParaBot({ garajeRiesgo: null, actual: 'CommunalParking', elegido: true, resueltoDelRiesgo: null }), 'CommunalParking')
})

// 15/10/2026 (revisión): retomar `?tarificacion=` de una variante cotizada ANTES del arreglo traía el comunitario por
// defecto guardado y pisaba el garaje declarado en el riesgo.
test('garajePrevioAplicable: con garaje en el riesgo, el retomado solo vale si es el mismo que el del riesgo resuelto', () => {
  const CAT = [...CAT_SIN_CALLE, { id: 'Street', nombre: 'Calle' }]
  const base = { garajeRiesgo: 'PublicRoad', resueltoDelRiesgo: 'Street', retomada: true, elegido: true, catalogo: CAT }
  assert.equal(garajePrevioAplicable({ ...base, previo: 'CommunalParking' }), null, 'el comunitario de antes NO pisa la calle del riesgo')
  assert.equal(garajePrevioAplicable({ ...base, previo: 'Street' }), 'Street')
  // Riesgo sin casar: el retomado tampoco tapa el ✗ (se pregunta).
  assert.equal(garajePrevioAplicable({ ...base, catalogo: CAT_SIN_CALLE, resueltoDelRiesgo: null, previo: 'CommunalParking', elegido: false }), null)
  // Sin retomar, igual.
  assert.equal(garajePrevioAplicable({ ...base, retomada: false, elegido: false, previo: 'CommunalParking' }), null)
})

test('garajePrevioAplicable: sin garaje en el riesgo, retomada manda; sin retomar, solo si el corredor no eligió; siempre en catálogo', () => {
  const base = { garajeRiesgo: null, resueltoDelRiesgo: null, catalogo: CAT_SIN_CALLE }
  assert.equal(garajePrevioAplicable({ ...base, previo: 'PrivateGarage', retomada: true, elegido: true }), 'PrivateGarage')
  assert.equal(garajePrevioAplicable({ ...base, previo: 'PrivateGarage', retomada: false, elegido: false }), 'PrivateGarage')
  assert.equal(garajePrevioAplicable({ ...base, previo: 'PrivateGarage', retomada: false, elegido: true }), null)
  assert.equal(garajePrevioAplicable({ ...base, previo: 'Street', retomada: true, elegido: false }), null, 'fuera del catálogo')
  assert.equal(garajePrevioAplicable({ ...base, garajeRiesgo: '  ', previo: '', retomada: true, elegido: false }), null)
})

test('garajeParaPack: el del riesgo resuelto contra SU catálogo; si no casa, no-pack con motivo (nunca el defecto)', () => {
  assert.deepEqual(garajeParaPack('PublicRoad', [...CAT_SIN_CALLE, { id: 'Street', nombre: 'Calle' }], 'moto'), { ok: true, id: 'Street' })
  const no = garajeParaPack('PublicRoad', CAT_SIN_CALLE, 'moto')
  assert.equal(no.ok, false)
  assert.match(no.ok ? '' : no.motivo, /En la vía pública/)
  assert.match(no.ok ? '' : no.motivo, /no se tarifica con otro garaje/)
  assert.deepEqual(garajeParaPack(null, CAT_SIN_CALLE, 'coche'), { ok: true, id: 'CommunalParking' }, 'sin garaje en el riesgo: el defecto')
  assert.match((garajeParaPack('PublicRoad', null, 'coche') as { motivo: string }).motivo, /No se ha podido leer el catálogo/)
  assert.match((garajeParaPack(null, [{ id: 'Street', nombre: 'Calle' }], 'coche') as { motivo: string }).motivo, /ningún garaje reconocible/)
})
