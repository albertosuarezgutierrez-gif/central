// Guardián del veredicto de salud del motor de precios. `node --test`.
//
// Fija los invariantes que la auditoría diaria/semanal consulta. El caso que más importa es el
// PRIMERO: a la baja el raíl no tiene salida legítima, así que romperlo es malventa — y una
// noche vendida barata no se recupera.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saludPricing, HORAS_MAX_SIN_PASADA, CAMBIOS_DIRECCION_OSCILA, type MedidaPricing } from './pricing-salud.ts'

/** Los cuatro pisos como están de verdad el 27/08/2026: motor encendido, palanca apagada. */
const PISOS = [
  { propertyId: 'prop_busto_reform',   enabled: true, applyEnabled: true, antelacionK: 0, minPrice: 65,  maxPrice: null },
  { propertyId: 'prop_duplex_center',  enabled: true, applyEnabled: true, antelacionK: 0, minPrice: 85,  maxPrice: null },
  { propertyId: 'prop_house_sevillana',enabled: true, applyEnabled: true, antelacionK: 0, minPrice: 300, maxPrice: null },
  { propertyId: 'prop_luxury_busto',   enabled: true, applyEnabled: true, antelacionK: 0, minPrice: 72,  maxPrice: null },
]

const SANO: MedidaPricing = {
  pisos: PISOS,
  horasDesdeUltimaPasada: 3.2,
  nochesUltimaPasada: 243,
  railBajaRoto: 0,
  railAlzaSinJustificar: 0,
  bajoMinimo: 0,
  oscilantes: 0,
}

test('la foto REAL del 27/08/2026 (243 noches, 4 pisos, raíl intacto) sale ✅', () => {
  const r = saludPricing(SANO)
  assert.equal(r.estado, '✅')
  assert.deepEqual(r.hallazgos, [])
})

// 🚨 EL CASO QUE NO SE PUEDE FALLAR. Medido sobre 10 días: 0 de ~4.200 noches rompieron el raíl
// a la baja. Si alguna vez ocurre, es un desplome y hay que verlo el mismo día.
test('romper el raíl A LA BAJA es 🔴 siempre', () => {
  const r = saludPricing({ ...SANO, railBajaRoto: 1 })
  assert.equal(r.estado, '🔴')
  assert.match(r.hallazgos[0].texto, /desplome/)
})

// La contraparte: al alza CON evento es el «salto de evento» de apply/route.ts, deliberado.
// La medida que entra aquí ya viene filtrada por «sin evento», así que 0 debe callar.
// Las subidas de golpe tienen DOS vías legítimas (evento y premio de mercado). La medida que
// entra aquí ya viene con las dos descontadas: por eso 0 debe callar.
test('una subida de golpe explicada (evento o premio de mercado) no genera hallazgo', () => {
  assert.equal(saludPricing({ ...SANO, railAlzaSinJustificar: 0 }).estado, '✅')
})

test('subir de golpe sin evento NI premio de mercado es 🟠, no 🔴 (sube, no malvende)', () => {
  const r = saludPricing({ ...SANO, railAlzaSinJustificar: 7 })
  assert.equal(r.estado, '🟠')
  assert.match(r.hallazgos[0].texto, /ni un evento ni el premio de mercado/)
})

test('escribir por debajo de min_price es 🔴', () => {
  const r = saludPricing({ ...SANO, bajoMinimo: 3 })
  assert.equal(r.estado, '🔴')
  assert.match(r.hallazgos[0].texto, /bajo coste/)
})

// El motor apagado es silencioso: crons verdes, latido verde, precios quietos.
test('apply_enabled=false en un piso es 🔴 aunque todo lo demás esté bien', () => {
  const pisos = PISOS.map((p, i) => i === 0 ? { ...p, applyEnabled: false } : p)
  const r = saludPricing({ ...SANO, pisos })
  assert.equal(r.estado, '🔴')
  assert.match(r.hallazgos[0].texto, /motor apagado/)
})

test('un piso sin min_price es 🔴: no hay suelo que impida malvender', () => {
  const pisos = PISOS.map((p, i) => i === 2 ? { ...p, minPrice: null } : p)
  const r = saludPricing({ ...SANO, pisos })
  assert.equal(r.estado, '🔴')
  assert.match(r.hallazgos.map(x => x.texto).join(' '), /sin min_price/)
})

// La palanca de anticipación se apagó el 27/08 el mismo día de encenderla.
test('antelacion_k distinto de 0 avisa en 🟠 y cita las condiciones para reencenderla', () => {
  const pisos = PISOS.map((p, i) => i === 1 ? { ...p, antelacionK: 1 } : p)
  const r = saludPricing({ ...SANO, pisos })
  assert.equal(r.estado, '🟠')
  assert.match(r.hallazgos[0].texto, /POSICION-MERCADO-lejano/)
})

test('más de 10 h sin pasada es 🔴 (con 3 pasadas al día se ha saltado una)', () => {
  assert.equal(saludPricing({ ...SANO, horasDesdeUltimaPasada: HORAS_MAX_SIN_PASADA + 0.1 }).estado, '🔴')
  assert.equal(saludPricing({ ...SANO, horasDesdeUltimaPasada: HORAS_MAX_SIN_PASADA - 0.1 }).estado, '✅')
})

test('sin ninguna pasada nunca es 🔴', () => {
  const r = saludPricing({ ...SANO, horasDesdeUltimaPasada: null })
  assert.equal(r.estado, '🔴')
  assert.match(r.hallazgos[0].texto, /nunca ha escrito/)
})

// Regla NULL≠0 de CLAUDE.md: «0 noches» no es «nada que cambiar» demostrado.
test('una pasada fresca con 0 noches avisa en 🟠, no la da por buena', () => {
  const r = saludPricing({ ...SANO, nochesUltimaPasada: 0 })
  assert.equal(r.estado, '🟠')
  assert.match(r.hallazgos[0].texto, /abortada/)
})

// El ciclo límite de Luxury Busto: 149→119→95→114. Un «espera 2-3 días a ver si para» no lo caza.
test('la oscilación (ciclo límite) se detecta y se nombra', () => {
  const r = saludPricing({ ...SANO, oscilantes: 51 })
  assert.equal(r.estado, '🟠')
  assert.match(r.hallazgos[0].texto, /No converge/)
  assert.ok(CAMBIOS_DIRECCION_OSCILA === 3)
})

test('un 🔴 manda sobre cualquier número de 🟠', () => {
  const r = saludPricing({ ...SANO, railBajaRoto: 1, oscilantes: 9, railAlzaSinJustificar: 4 })
  assert.equal(r.estado, '🔴')
  assert.ok(r.hallazgos.length >= 3)
})
