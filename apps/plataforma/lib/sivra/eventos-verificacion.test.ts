import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decidirVerificacion, nombresParecidos, senalMercado, detalleVerificacion, verificacionFiable,
  type SenalDura, type SenalPrensa, type SenalMercado, type ContextoVerificacion,
} from './eventos-verificacion.ts'

const SIN_DURA: SenalDura = { corrobora: false }
const SIN_MERCADO: SenalMercado = { estado: 'sin_datos' }
const LEJOS: ContextoVerificacion = { diasVista: 120, verificacionesPrevias: 0, fecha: '2026-12-05' }

test('una fuente dura (ya hay entradas) confirma sin más preguntas', () => {
  const d = decidirVerificacion(
    { corrobora: true, fuente: 'ticketmaster' },
    { veredicto: 'no_verificable' },
    SIN_MERCADO, LEJOS,
  )
  assert.equal(d.estado, 'confirmado')
  assert.equal(d.util, true, 'corroborar ES haber mirado, aunque la prensa fallara')
})

test('la prensa confirma con confianza alta → confirmado', () => {
  const d = decidirVerificacion(SIN_DURA, { veredicto: 'confirmado', confianza: 0.9 }, SIN_MERCADO, LEJOS)
  assert.equal(d.estado, 'confirmado')
  assert.equal(d.confianza, 0.9)
})

test('la prensa confirma con confianza JUSTITA → NO se confirma (el factor pleno se gana)', () => {
  const d = decidirVerificacion(SIN_DURA, { veredicto: 'confirmado', confianza: 0.7 }, SIN_MERCADO, LEJOS)
  assert.equal(d.estado, null)
  assert.equal(d.util, true)
})

test('desmentido → descartado, no vuelve a proponerse', () => {
  const d = decidirVerificacion(
    SIN_DURA, { veredicto: 'desmentido', evidencia: 'ABC — el festival se traslada a Málaga' },
    SIN_MERCADO, LEJOS,
  )
  assert.equal(d.estado, 'descartado')
  assert.match(d.motivo, /Málaga/)
})

// ————— LA REGLA DE LA CASA: no se decide con lo que no se ha podido mirar —————

test('🚨 con la búsqueda CAÍDA no se decide nada, ni siquiera a 3 días de la fecha', () => {
  const d = decidirVerificacion(SIN_DURA, { veredicto: 'no_verificable' }, SIN_MERCADO, {
    diasVista: 3, verificacionesPrevias: 5, fecha: '2026-08-15',
  })
  assert.equal(d.estado, null, 'una búsqueda caída NO es un evento inexistente')
  assert.equal(d.util, false)
  assert.equal(d.veredicto, 'no_verificable')
})

test('🚨 cerca de la fecha pero SIN verificaciones útiles previas: aún no caduca', () => {
  // Primera vez que se mira de verdad: cuenta 1, hacen falta 2.
  const d = decidirVerificacion(SIN_DURA, { veredicto: 'sin_informacion' }, SIN_MERCADO, {
    diasVista: 10, verificacionesPrevias: 0, fecha: '2026-08-22',
  })
  assert.equal(d.estado, null)
  assert.equal(d.util, true)
})

test('cerca de la fecha y ya mirado dos veces sin que nadie lo confirme → descartado', () => {
  const d = decidirVerificacion(SIN_DURA, { veredicto: 'sin_informacion' }, SIN_MERCADO, {
    diasVista: 10, verificacionesPrevias: 1, fecha: '2026-08-22',
  })
  assert.equal(d.estado, 'descartado')
  assert.equal(d.veredicto, 'caducado')
})

test('lejos de la fecha NO se caduca aunque lleve muchas pasadas sin novedad', () => {
  const d = decidirVerificacion(SIN_DURA, { veredicto: 'sin_informacion' }, SIN_MERCADO, {
    diasVista: 200, verificacionesPrevias: 12, fecha: '2027-03-01',
  })
  assert.equal(d.estado, null, 'a 200 días la falta de noticias es normal, no es un desmentido')
})

// ————— Mercado: la señal de dinero —————

test('el mercado que ya cotiza la noche confirma, si la prensa lo mantiene', () => {
  const d = decidirVerificacion(
    SIN_DURA, { veredicto: 'sigue_previsto', confianza: 0.7 },
    { estado: 'sube', ratio: 1.4, comps: 6 }, LEJOS,
  )
  assert.equal(d.estado, 'confirmado')
  assert.equal(d.veredicto, 'mercado_confirma')
})

test('🚨 el mercado NO confirma si la prensa no se ha podido leer (una sola pata no basta)', () => {
  const d = decidirVerificacion(
    SIN_DURA, { veredicto: 'no_verificable' }, { estado: 'sube', ratio: 1.4, comps: 6 }, LEJOS,
  )
  assert.equal(d.estado, null)
})

test('el mercado PLANO no descarta nada por sí solo', () => {
  const d = decidirVerificacion(
    SIN_DURA, { veredicto: 'sigue_previsto', confianza: 0.8 },
    { estado: 'plano', ratio: 1.02, comps: 9 }, LEJOS,
  )
  assert.equal(d.estado, null)
})

// ————— Fecha movida —————

test('si la prensa da otra fecha, el evento se MUDA (no se pierde ni se duplica)', () => {
  const d = decidirVerificacion(
    SIN_DURA,
    { veredicto: 'confirmado', confianza: 0.9, fechaConfirmada: '2026-12-12' },
    SIN_MERCADO,
    { diasVista: 120, verificacionesPrevias: 0, fecha: '2026-12-05', desde: '2026-08-12', hasta: '2027-08-12' },
  )
  assert.equal(d.estado, 'descartado', 'la fila de la fecha equivocada deja de proteger esa noche')
  assert.equal(d.reubicarA, '2026-12-12')
  assert.equal(d.reubicarComo, 'confirmado')
})

test('una fecha movida FUERA del horizonte no reubica nada', () => {
  const d = decidirVerificacion(
    SIN_DURA,
    { veredicto: 'confirmado', confianza: 0.9, fechaConfirmada: '2029-01-01' },
    SIN_MERCADO,
    { diasVista: 120, verificacionesPrevias: 0, fecha: '2026-12-05', desde: '2026-08-12', hasta: '2027-08-12' },
  )
  assert.equal(d.estado, 'confirmado', 'la fecha fuera de rango se ignora, el veredicto vale igual')
  assert.equal(d.reubicarA, undefined)
})

test('la misma fecha repetida por la prensa no cuenta como mudanza', () => {
  const d = decidirVerificacion(
    SIN_DURA,
    { veredicto: 'confirmado', confianza: 0.85, fechaConfirmada: '2026-12-05' },
    SIN_MERCADO, LEJOS,
  )
  assert.equal(d.estado, 'confirmado')
  assert.equal(d.reubicarA, undefined)
})

// ————— Nombres —————

test('🚨 dos eventos distintos el mismo día NO se confirman entre ellos', () => {
  assert.equal(nombresParecidos('Final de la Copa del Rey', 'Concierto de Dani Fernández'), false)
  assert.equal(nombresParecidos('Mangafest Winter Edition', 'Sevilla FC - Betis'), false)
})

test('el mismo evento con nombre más largo o más corto sí casa', () => {
  assert.equal(nombresParecidos('Mangafest Winter Edition', 'Mangafest'), true)
  assert.equal(nombresParecidos('Final Copa del Rey 2027', 'Copa del Rey: final en La Cartuja'), true)
  assert.equal(nombresParecidos('Icónica Sevilla Fest', 'Iconica Sevilla Fest 2026'), true, 'sin tildes')
})

test('pares REALES del corpus (Supabase, 12/08/2026): confirma lo que toca y solo lo que toca', () => {
  // Fixture copiado del corpus VIVO, no inventado: es donde se ve si el criterio sirve. Las tres
  // primeras filas son la trampa buena — un previsto «Bienal de Flamenco» convive en la misma
  // fecha con conciertos DE la Bienal (sí confirman) y con una convención de tatuajes (no).
  const casan: [string, string][] = [
    ['Bienal de Flamenco 2026 — 1er finde', 'Rosario La Tremendita - Menos es más (Bienal Flamenco)'],
    ['Bienal de Flamenco 2026 — clausura', 'Clausura Bienal de Flamenco'],
    ['Convención Global IGLTA 2026', 'Convención Global IGLTA 2026'],
  ]
  const noCasan: [string, string][] = [
    ['Bienal de Flamenco 2026 — 2o finde', 'Sevilla Tattoo Convention'],
    ['Mangafest Winter Edition', 'Sevilla FC vs Málaga CF'],
    ['Final Copa del Rey 2027', 'Feria de Abril 2027 (oficial 13-18 abr, alumbrado 12)'],
  ]
  for (const [a, b] of casan) assert.equal(nombresParecidos(a, b), true, `debería casar: ${a} / ${b}`)
  for (const [a, b] of noCasan) assert.equal(nombresParecidos(a, b), false, `NO debería casar: ${a} / ${b}`)
})

test('un nombre vacío o solo de palabras huecas nunca casa', () => {
  assert.equal(nombresParecidos('', 'Mangafest'), false)
  assert.equal(nombresParecidos('en Sevilla', 'Mangafest en Sevilla'), false)
})

// ————— Señal de mercado —————

test('sin corpus fiable el mercado dice «no lo sé», no «no sube»', () => {
  assert.deepEqual(senalMercado([]), { estado: 'sin_datos' })
  assert.deepEqual(
    senalMercado([{ scenario: 'prop_x', p50Fecha: 300, compsFecha: 2, p50Base: 100, fechasBase: 5 }]),
    { estado: 'sin_datos' },
    'con 2 comps no se opina',
  )
  assert.deepEqual(
    senalMercado([{ scenario: 'prop_x', p50Fecha: 300, compsFecha: 9, p50Base: 100, fechasBase: 1 }]),
    { estado: 'sin_datos' },
    'una fecha no es la línea de un mes',
  )
})

test('el mercado sube cuando la noche está claramente por encima de su mes', () => {
  const s = senalMercado([
    { scenario: 'prop_a', p50Fecha: 120, compsFecha: 8, p50Base: 110, fechasBase: 6 },
    { scenario: 'prop_b', p50Fecha: 260, compsFecha: 5, p50Base: 130, fechasBase: 4 },
  ])
  assert.equal(s.estado, 'sube')
  assert.equal(s.estado === 'sube' && Number(s.ratio.toFixed(2)), 2)
})

// ————— Parte de la pasada —————

test('el parte pone DELANTE lo que no se pudo verificar', () => {
  const txt = detalleVerificacion({
    revisados: 4, confirmados: 0, descartados: 0, reubicados: 0, sinVerificar: 3, errores: [],
  })
  assert.match(txt, /^⚠️ 3 sin poder verificar/)
  assert.match(txt, /NO es «no hay evento»/)
})

test('media pasada sin verificar deja el latido en ROJO', () => {
  const base = { revisados: 4, confirmados: 0, descartados: 0, reubicados: 0, errores: [] }
  assert.equal(verificacionFiable({ ...base, sinVerificar: 2 }), false)
  assert.equal(verificacionFiable({ ...base, sinVerificar: 1 }), true)
  assert.equal(verificacionFiable({ ...base, sinVerificar: 0, errores: ['BD caída'] }), false)
})

test('sin cola que verificar la pasada es buena (eso sí es «todo en orden»)', () => {
  assert.equal(
    verificacionFiable({ revisados: 0, confirmados: 0, descartados: 0, reubicados: 0, sinVerificar: 0, errores: [] }),
    true,
  )
  assert.match(
    detalleVerificacion({ revisados: 0, confirmados: 0, descartados: 0, reubicados: 0, sinVerificar: 0, errores: [] }),
    /nada pendiente/,
  )
})
