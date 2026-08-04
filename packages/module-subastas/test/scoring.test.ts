// Tests del scoring de oportunidad. La regla que más importa: sin datos, `null`
// — nunca un número inventado. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarOportunidad } from '../src/scoring.ts'
import type { SubastaInmueble } from '../src/types.ts'

const base: SubastaInmueble = {
  dedupeKey: 'SUB-JA-2026-1',
  fuente: 'boe',
  tipo: 'judicial',
  valorSubasta: 100000,
  tasacion: 200000,
  cargas: 0,
  cargasConocidas: true,
  situacionPosesoria: 'libre',
  ejecutado: 'fisica',
}

test('chollo limpio: descuento sobre el coste real, no sobre el remate', () => {
  const o = evaluarOportunidad(base)
  // Coste 108.800 sobre tasación 200.000 → 45,6% de descuento real
  assert.equal(o.valorMercado, 200000)
  assert.equal(o.descuento, 0.456)
  assert.equal(o.factorRiesgo, 1)
  assert.equal(o.puntuacion, 46)
  assert.equal(o.deposito, 5000)
})

test('las cargas preferentes se comen el descuento', () => {
  const o = evaluarOportunidad({ ...base, cargas: 60000 })
  assert.equal(o.puntuacion, 16)
})

test('ocupada: penaliza con el factor de riesgo', () => {
  const o = evaluarOportunidad({ ...base, situacionPosesoria: 'ocupada' })
  assert.equal(o.factorRiesgo, 0.55)
  assert.equal(o.puntuacion, 23)
  assert.ok(o.motivos.some((m) => m.includes('Ocupada')))
})

test('posesión desconocida penaliza menos que ocupada, pero penaliza', () => {
  const o = evaluarOportunidad({ ...base, situacionPosesoria: 'desconocida' })
  assert.equal(o.factorRiesgo, 0.8)
})

test('proindiviso: el factor es la cuota que se subasta', () => {
  const o = evaluarOportunidad({ ...base, porcentajeSubastado: 50 })
  assert.equal(o.factorRiesgo, 0.5)
  assert.equal(o.puntuacion, 23)
  assert.ok(o.avisos.some((a) => a.includes('copropietario')))
})

test('sin tasación ni valor de referencia: puntuación null, nunca inventada', () => {
  const o = evaluarOportunidad({ ...base, tasacion: null })
  assert.equal(o.puntuacion, null)
  assert.equal(o.descuento, null)
  assert.equal(o.valorMercado, null)
  assert.ok(o.motivos.some((m) => m.includes('no se puede calcular')))
  // El depósito sí se conoce: depende del valor de subasta, no de la tasación.
  assert.equal(o.deposito, 5000)
})

test('sin tasación pero con valor de referencia: se usa como referencia de mercado', () => {
  const o = evaluarOportunidad({ ...base, tasacion: null, valorReferencia: 200000 })
  assert.equal(o.valorMercado, 200000)
  assert.ok(o.puntuacion != null)
  assert.ok(o.avisos.some((a) => a.includes('valor de referencia')))
})

test('sobrecoste: el coste real supera el mercado → puntuación 0 y motivo claro', () => {
  const o = evaluarOportunidad({ ...base, tasacion: 90000 })
  assert.equal(o.puntuacion, 0)
  assert.ok(o.descuento != null && o.descuento < 0)
  assert.ok(o.motivos.some((m) => m.includes('supera el valor de mercado')))
})

test('venta de adjudicado: no hay depósito porque no se puja', () => {
  const o = evaluarOportunidad({ ...base, tipo: 'venta_adjudicado' })
  assert.equal(o.deposito, null)
})

test('los riesgos se acumulan en cadena', () => {
  const o = evaluarOportunidad({ ...base, situacionPosesoria: 'ocupada', cargasConocidas: false, sinVisita: true })
  // 0,55 × 0,70 × 0,90
  assert.equal(o.factorRiesgo, 0.347)
  assert.equal(o.puntuacion, 15)
})

// ── Tercer escalón de valor: el €/m² de mercado de la zona ──────────────────
// El BOE publica «Tasación 0,00 €» en la práctica totalidad de las subastas y
// el valor de referencia del Catastro exige certificado, así que sin este
// escalón casi ninguna subasta sería puntuable.

test('sin tasación ni valor de referencia: estima con €/m² de la zona', () => {
  const o = evaluarOportunidad({
    ...base, tasacion: null, valorReferencia: null,
    precioM2Mercado: 2000, superficie: 100, muestraMercado: 7,
  })
  assert.equal(o.valorMercado, 200000)
  assert.equal(o.origenValor, 'comparables')
  // El valor estimado penaliza: no es una tasación.
  assert.equal(o.factorRiesgo, 0.85)
  assert.ok(o.avisos.some((a) => a.includes('7 anuncios')))
  assert.ok(o.avisos.some((a) => a.includes('estimación, no una tasación')))
})

test('la tasación real manda sobre los comparables', () => {
  const o = evaluarOportunidad({ ...base, precioM2Mercado: 9999, superficie: 100 })
  assert.equal(o.valorMercado, 200000)
  assert.equal(o.origenValor, 'tasacion')
  assert.equal(o.factorRiesgo, 1)
})

test('€/m² sin superficie NO estima nada: sigue siendo `null`', () => {
  // Un €/m² sin metros no es un valor — inventarse la superficie sería
  // exactamente lo que este módulo no hace.
  const o = evaluarOportunidad({
    ...base, tasacion: null, valorReferencia: null, precioM2Mercado: 2000, superficie: null,
  })
  assert.equal(o.puntuacion, null)
  assert.equal(o.origenValor, null)
})
