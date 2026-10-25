// Continente mínimo estimado (m² del Catastro × €/m² por tipo) y oferta del seguro de la comunidad.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CLAVES_COSTE,
  COSTE_RECONSTRUCCION_POR_TIPO,
  claveCoste,
  esPisoEnEdificio,
  estimarContinenteMinimo,
  ofreceSeguroComunidad,
} from './coste-reconstruccion.ts'
import { alertaInfraseguro } from './infraseguro.ts'

test('piso de 90 m² → 90.000 € (90 × 1.000), en céntimos, marcado estimación y por verificar', () => {
  const r = estimarContinenteMinimo({ superficieM2: 90, uso: 'vivienda', tipoVivienda: 'piso' })
  assert.deepEqual(r, { capitalCent: 9_000_000, superficieM2: 90, eurPorM2: 1000, clave: 'vivienda_piso', estimacion: true, porVerificar: true })
})

test('🚨 sin superficie (null, 0, negativa, NaN) o uso sin continente propio → null, nunca 0', () => {
  for (const m2 of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(estimarContinenteMinimo({ superficieM2: m2, uso: 'vivienda' }), null, String(m2))
  }
  for (const uso of ['garaje', 'trastero', 'otro', 'cualquier cosa']) assert.equal(estimarContinenteMinimo({ superficieM2: 50, uso }), null, uso)
})

test('el tipo de vivienda del Catastro elige la fila; sin tipo, la vivienda genérica (la más baja)', () => {
  assert.equal(claveCoste('vivienda', 'unifamiliar'), 'vivienda_unifamiliar')
  assert.equal(claveCoste('vivienda', null), 'vivienda')
  assert.equal(claveCoste('local', 'piso'), 'local', 'el tipo de vivienda no afecta a un local')
  assert.ok(COSTE_RECONSTRUCCION_POR_TIPO.vivienda.eurPorM2 <= COSTE_RECONSTRUCCION_POR_TIPO.vivienda_unifamiliar.eurPorM2)
})

test('🚨 todo valor del catálogo es por_verificar, con fuente y fecha dd/mm/aaaa (cepo: no se promociona sin revisar)', () => {
  for (const k of CLAVES_COSTE) {
    const e = COSTE_RECONSTRUCCION_POR_TIPO[k]
    assert.equal(e.estado, 'por_verificar', k)
    assert.ok(e.fuente.length > 10, `${k}: sin fuente`)
    assert.match(e.fecha, /^\d{2}\/\d{2}\/\d{4}$/, k)
    assert.ok(e.eurPorM2 > 0, k)
  }
})

test('redondeo a la centena de euros', () => {
  assert.equal(estimarContinenteMinimo({ superficieM2: 77.7, uso: 'oficina' })!.capitalCent, 6_990_000) // 69.930 € → 69.900 €
})

test('extremo a extremo con la alerta: capital < estimación × 0,9 → infraseguro; = 0,9 → ok; sin capital → sin_dato', () => {
  const v = estimarContinenteMinimo({ superficieM2: 100, uso: 'vivienda', tipoVivienda: 'unifamiliar' })!.capitalCent // 110.000 €
  const base = { valorEstimado: v, enComunidad: false, polizaComunidadEnlazada: false }
  assert.equal(alertaInfraseguro({ ...base, capitalContinente: Math.round(v * 0.9) - 1 }).estado, 'infraseguro')
  assert.equal(alertaInfraseguro({ ...base, capitalContinente: Math.round(v * 0.9) }).estado, 'ok')
  assert.deepEqual(alertaInfraseguro({ ...base, capitalContinente: null }), { estado: 'sin_dato', motivo: 'sin_capital' })
  const sinM2 = estimarContinenteMinimo({ superficieM2: null, uso: 'vivienda' })
  assert.deepEqual(alertaInfraseguro({ ...base, valorEstimado: sinM2?.capitalCent ?? null, capitalContinente: 50_000_000 }), {
    estado: 'sin_dato', motivo: 'sin_valor_estimado',
  })
})

test('piso en edificio: comunidad marcada o Catastro lo dice; unifamiliar o no-comunidad = no; nada = no se sabe', () => {
  assert.equal(esPisoEnEdificio({ enComunidad: true, tipoCatastro: null }), true)
  assert.equal(esPisoEnEdificio({ enComunidad: null, tipoCatastro: 'piso' }), true)
  assert.equal(esPisoEnEdificio({ enComunidad: false, tipoCatastro: null }), false)
  assert.equal(esPisoEnEdificio({ enComunidad: null, tipoCatastro: 'unifamiliar' }), false)
  assert.equal(esPisoEnEdificio({ enComunidad: null, tipoCatastro: null }), null)
})

test('🚨 seguro de la comunidad: solo piso + presidente marcado + SIN póliza de comunidad en vigor; null nunca ofrece', () => {
  const ok = { esPiso: true, presidente: true, polizaComunidadVigente: false }
  assert.equal(ofreceSeguroComunidad(ok), true)
  assert.equal(ofreceSeguroComunidad({ ...ok, esPiso: false }), false)
  assert.equal(ofreceSeguroComunidad({ ...ok, esPiso: null }), false)
  assert.equal(ofreceSeguroComunidad({ ...ok, presidente: false }), false)
  assert.equal(ofreceSeguroComunidad({ ...ok, presidente: null }), false)
  assert.equal(ofreceSeguroComunidad({ ...ok, polizaComunidadVigente: true }), false)
  assert.equal(ofreceSeguroComunidad({ ...ok, polizaComunidadVigente: null }), false, 'no se pudo comprobar: no se ofrece')
})
