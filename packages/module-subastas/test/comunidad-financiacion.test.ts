import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANUALIDADES_MAXIMAS,
  deudaComunidadEstimada,
  tienePropiedadHorizontal,
} from '../src/comunidad.ts'
import { costeFinanciacion, MESES_PUENTE_ASUMIDOS } from '../src/financiacion.ts'
import { calcularCoste } from '../src/costes.ts'
import { calibracionPuja } from '../src/adjudicaciones.ts'
import type { SubastaInmueble } from '../src/types.ts'

// ── Comunidad ───────────────────────────────────────────────────────────────

test('una finca rústica o una parcela no tiene comunidad: importe null, nunca 0', () => {
  for (const tipoBien of ['finca_rustica', 'parcela', 'nave', 'edificio'] as const) {
    const d = deudaComunidadEstimada({ tipoBien, superficie: 200 })
    assert.equal(d.importe, null, `${tipoBien} no debería estimar deuda`)
    assert.equal(tienePropiedadHorizontal(tipoBien), false)
  }
})

test('un piso estima por baremo y lo declara como estimación', () => {
  const d = deudaComunidadEstimada({ tipoBien: 'vivienda', superficie: 90 })
  // 90 m² × 0,5 €/m²·mes = 45 €/mes × 12 × 2 años.
  assert.equal(d.cuotaMensual, 45)
  assert.equal(d.anios, 2)
  assert.equal(d.importe, 1080)
  assert.equal(d.estimado, true)
  assert.match(d.nota, /ESTIMADA/)
  assert.match(d.nota, /9\.1\.e/)
})

test('la cuota REAL manda sobre el baremo y no se marca como estimación', () => {
  const d = deudaComunidadEstimada({ tipoBien: 'vivienda', superficie: 90, cuotaMensual: 80, aniosImpago: 3 })
  assert.equal(d.cuotaMensual, 80)
  assert.equal(d.importe, 80 * 12 * 3)
  assert.equal(d.estimado, false)
})

test('el tope legal son 4 anualidades por muchos años de impago que haya', () => {
  const d = deudaComunidadEstimada({ tipoBien: 'vivienda', superficie: 100, aniosImpago: 12 })
  assert.equal(d.anios, ANUALIDADES_MAXIMAS)
})

test('sin superficie no se inventa una cuota: importe null con explicación', () => {
  const d = deudaComunidadEstimada({ tipoBien: 'vivienda', superficie: null })
  assert.equal(d.importe, null)
  assert.match(d.nota, /administrador/)
})

test('un trastero minúsculo no baja de la cuota mínima', () => {
  const d = deudaComunidadEstimada({ tipoBien: 'trastero', superficie: 4 })
  assert.equal(d.cuotaMensual, 12) // 4 × 0,1 = 0,4 €/mes sería absurdo
})

// ── Financiación ────────────────────────────────────────────────────────────

test('el puente cobra intereses simples más comisión de apertura', () => {
  const f = costeFinanciacion(60000, { pctFinanciado: 1, tipoAnual: 0.08, meses: 4, comisionApertura: 0.01 })
  assert.equal(f.principal, 60000)
  assert.equal(f.intereses, 1600) // 60.000 × 8% × 4/12
  assert.equal(f.comision, 600)
  assert.equal(f.total, 2200)
  assert.match(f.nota, /670 LEC/)
})

test('sin financiación no hay coste del dinero', () => {
  const f = costeFinanciacion(60000, { pctFinanciado: 0, tipoAnual: 0.08 })
  assert.equal(f.total, 0)
  assert.equal(f.meses, MESES_PUENTE_ASUMIDOS)
})

// ── Integración en el coste puerta abierta ──────────────────────────────────

const piso = (extra: Partial<SubastaInmueble> = {}): SubastaInmueble => ({
  dedupeKey: 'x',
  fuente: 'boe',
  tipo: 'judicial',
  valorSubasta: 50000,
  tipoBien: 'vivienda',
  superficie: 90,
  ejecutado: 'fisica',
  ...extra,
})

test('el coste puerta abierta incluye la deuda de comunidad estimada', () => {
  const c = calcularCoste(piso())
  assert.equal(c.comunidadPendiente, 1080)
  assert.ok(c.avisos.some((a) => /ESTIMADA/.test(a)))
})

test('estimarComunidad:false vuelve al comportamiento anterior', () => {
  const c = calcularCoste(piso(), null, { estimarComunidad: false })
  assert.equal(c.comunidadPendiente, 0)
  assert.ok(c.avisos.some((a) => /No se han incluido derramas/.test(a)))
})

test('una parcela no arrastra comunidad aunque el estimador esté activo', () => {
  const c = calcularCoste(piso({ tipoBien: 'parcela' }))
  assert.equal(c.comunidadPendiente, 0)
})

test('el coste del dinero solo entra si se declara la financiación', () => {
  const sin = calcularCoste(piso())
  assert.equal(sin.costeFinanciacion, 0)

  const con = calcularCoste(piso(), null, {
    financiacion: { pctFinanciado: 1, tipoAnual: 0.08, meses: 4 },
  })
  assert.ok(con.costeFinanciacion > 0)
  assert.equal(con.total, redondear(sin.total + con.costeFinanciacion))
  // El depósito ya consignado (5% de 50.000) no se vuelve a financiar.
  assert.ok(con.costeFinanciacion < sin.total * 0.08 * (4 / 12) + 1)
})

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Calibración de la puja ──────────────────────────────────────────────────

test('sin muestra suficiente no se saca ninguna lectura', () => {
  const c = calibracionPuja([
    { provincia: 'Sevilla', valorSubasta: 100, importeAdjudicacion: 120, resultado: 'adjudicada', pujaMaxima: 100 },
  ])
  assert.equal(c.muestra, 1)
  assert.equal(c.lectura, null)
})

test('si el mercado remata por encima del techo, lo dice', () => {
  const filas = Array.from({ length: 6 }, () => ({
    provincia: 'Sevilla',
    valorSubasta: 50000,
    importeAdjudicacion: 66000,
    resultado: 'adjudicada',
    pujaMaxima: 55000,
  }))
  const c = calibracionPuja(filas)
  assert.equal(c.muestra, 6)
  assert.equal(c.porEncima, 6)
  assert.ok(c.ratioMediano! > 1.1)
  assert.match(c.lectura!, /POR ENCIMA/)
})

test('las desiertas y las que no tienen puja calculada no entran en la muestra', () => {
  const c = calibracionPuja([
    { provincia: 'Cádiz', valorSubasta: 100, importeAdjudicacion: null, resultado: 'desierta', pujaMaxima: 80 },
    { provincia: 'Cádiz', valorSubasta: 100, importeAdjudicacion: 90, resultado: 'adjudicada', pujaMaxima: null },
  ])
  assert.equal(c.muestra, 0)
  assert.equal(c.ratioMediano, null)
})
