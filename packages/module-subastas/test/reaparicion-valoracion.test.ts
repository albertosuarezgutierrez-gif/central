import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claveFinca, detectarReapariciones, textoReaparicion, type Convocatoria } from '../src/reaparicion.ts'
import { referenciaPorZona, type TasacionPactada } from '../src/valoracion-historica.ts'
import { calibracionPorCargas, type ResultadoConCargas } from '../src/adjudicaciones.ts'

function conv(extra: Partial<Convocatoria> = {}): Convocatoria {
  return {
    dedupeKey: 'A',
    identificador: 'SUB-JA-2026-1',
    refCatastral: 'L00400300QJ30C0001BU',
    fincaRegistral: null,
    registroPropiedad: null,
    valorSubasta: 50000,
    fechaFin: '2026-09-01T00:00:00Z',
    resultado: null,
    municipio: 'BELMONTE DE MIRANDA',
    descripcion: 'parcela',
    ...extra,
  }
}

// ── Reaparición con el tipo rebajado ────────────────────────────────────────

test('la misma finca (por catastro) que vuelve más barata se detecta', () => {
  const r = detectarReapariciones([
    conv({ dedupeKey: 'vieja', identificador: 'SUB-JA-2025-9', valorSubasta: 50000, resultado: 'desierta', fechaFin: '2025-11-01T00:00:00Z' }),
    conv({ dedupeKey: 'nueva', valorSubasta: 32000 }),
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].actual.dedupeKey, 'nueva')
  assert.equal(r[0].bajada, 0.36)
  assert.equal(r[0].bajadaEur, 18000)
  assert.equal(r[0].clave, 'catastro')
  assert.ok(textoReaparicion(r[0]).includes('36%'))
  assert.ok(textoReaparicion(r[0]).includes('quedó desierta'))
})

test('sin referencia catastral empareja por finca registral + registro', () => {
  const base = { refCatastral: null, fincaRegistral: '24482', registroPropiedad: 'BELMONTE DE MIRANDA' }
  const r = detectarReapariciones([
    conv({ ...base, dedupeKey: 'v', valorSubasta: 80000, resultado: 'desierta' }),
    conv({ ...base, dedupeKey: 'n', valorSubasta: 60000 }),
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].clave, 'finca_registral')
})

test('NUNCA empareja por descripción o municipio (dos pisos del mismo bloque)', () => {
  const r = detectarReapariciones([
    conv({ dedupeKey: 'v', refCatastral: null, valorSubasta: 90000, resultado: 'desierta' }),
    conv({ dedupeKey: 'n', refCatastral: null, valorSubasta: 40000 }),
  ])
  assert.equal(r.length, 0)
})

test('una bajada pequeña no genera aviso', () => {
  const r = detectarReapariciones([
    conv({ dedupeKey: 'v', valorSubasta: 50000, resultado: 'desierta' }),
    conv({ dedupeKey: 'n', valorSubasta: 48000 }), // 4%
  ])
  assert.equal(r.length, 0)
})

test('si la nueva es más CARA no es una oportunidad', () => {
  const r = detectarReapariciones([
    conv({ dedupeKey: 'v', valorSubasta: 40000, resultado: 'desierta' }),
    conv({ dedupeKey: 'n', valorSubasta: 55000 }),
  ])
  assert.equal(r.length, 0)
})

test('hacen falta una viva y una concluida', () => {
  assert.equal(detectarReapariciones([conv({ dedupeKey: 'a' }), conv({ dedupeKey: 'b', valorSubasta: 30000 })]).length, 0)
  assert.equal(detectarReapariciones([
    conv({ dedupeKey: 'a', resultado: 'desierta' }),
    conv({ dedupeKey: 'b', valorSubasta: 30000, resultado: 'desierta' }),
  ]).length, 0)
})

test('la bajada se mide contra el tipo MÁS ALTO del histórico', () => {
  const r = detectarReapariciones([
    conv({ dedupeKey: 'v1', valorSubasta: 100000, resultado: 'desierta' }),
    conv({ dedupeKey: 'v2', valorSubasta: 70000, resultado: 'desierta' }),
    conv({ dedupeKey: 'n', valorSubasta: 50000 }),
  ])
  assert.equal(r[0].bajada, 0.5) // 100.000 → 50.000, no 70.000 → 50.000
})

test('claveFinca rechaza una referencia catastral a medias', () => {
  assert.equal(claveFinca(conv({ refCatastral: '1234' })), null)
  assert.equal(claveFinca(conv({ refCatastral: null, fincaRegistral: '24482', registroPropiedad: null })), null)
  assert.equal(claveFinca(conv({ refCatastral: ' l00400300qj30c0001bu ' }))?.clave, 'rc:L00400300QJ30C0001BU')
})

// ── Calibración por cargas ──────────────────────────────────────────────────

function res(extra: Partial<ResultadoConCargas> = {}): ResultadoConCargas {
  return {
    provincia: 'ASTURIAS',
    valorSubasta: 100000,
    importeAdjudicacion: 60000,
    resultado: 'adjudicada',
    cargasSubsistentes: 0,
    cargasConocidas: true,
    ...extra,
  }
}

test('calibración por cargas separa los tres grupos y calcula la tasa de desiertas', () => {
  const c = calibracionPorCargas([
    res({ cargasSubsistentes: 40000, resultado: 'desierta', importeAdjudicacion: null }),
    res({ cargasSubsistentes: 30000, resultado: 'desierta', importeAdjudicacion: null }),
    res({ cargasSubsistentes: 0, importeAdjudicacion: 70000 }),
    res({ cargasSubsistentes: 0, importeAdjudicacion: 80000 }),
    res({ cargasConocidas: false, cargasSubsistentes: null }),
  ])
  const conCargas = c.find((x) => x.grupo === 'con_cargas')!
  const sinCargas = c.find((x) => x.grupo === 'sin_cargas')!
  const sinLeer = c.find((x) => x.grupo === 'sin_leer')!

  assert.equal(conCargas.muestra, 2)
  assert.equal(conCargas.tasaDesierta, 1) // las dos desiertas
  assert.equal(conCargas.ratioMediano, null) // sin importes
  assert.equal(sinCargas.muestra, 2)
  assert.equal(sinCargas.tasaDesierta, 0)
  assert.equal(sinCargas.ratioMediano, 0.75) // mediana de 0,70 y 0,80
  assert.equal(sinLeer.muestra, 1)
})

test('calibración sin datos no concluye nada', () => {
  const c = calibracionPorCargas([])
  assert.equal(c.length, 3)
  assert.ok(c.every((x) => x.muestra === 0 && x.ratioMediano === null && x.tasaDesierta === null))
})

// ── Serie de valoración propia ──────────────────────────────────────────────

function tas(extra: Partial<TasacionPactada> = {}): TasacionPactada {
  return { zona: 'BELMONTE DE MIRANDA', anio: 2009, importe: 47274.9, superficie: 100, ...extra }
}

test('referencia por zona: mediana de €/m² histórico con muestra suficiente', () => {
  const r = referenciaPorZona([
    tas({ importe: 40000, superficie: 100 }), // 400
    tas({ importe: 60000, superficie: 100 }), // 600
    tas({ importe: 50000, superficie: 100 }), // 500
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].eurM2Historico, 500)
  assert.equal(r[0].muestra, 3)
  assert.equal(r[0].eurM2Actualizado, null) // sin factores
})

test('con factores por año se actualiza a euros de hoy', () => {
  const r = referenciaPorZona(
    [tas({ importe: 50000 }), tas({ importe: 50000 }), tas({ importe: 50000 })],
    { 2009: 0.8 },
  )
  assert.equal(r[0].eurM2Historico, 500)
  assert.equal(r[0].eurM2Actualizado, 400)
})

test('muestra insuficiente o sin superficie no produce referencia', () => {
  assert.equal(referenciaPorZona([tas(), tas()]).length, 0)
  assert.equal(referenciaPorZona([tas({ superficie: null }), tas({ superficie: null }), tas({ superficie: null })]).length, 0)
  assert.equal(referenciaPorZona([tas({ importe: 0 }), tas({ importe: 0 }), tas({ importe: 0 })]).length, 0)
})

test('el rango de años se expone para avisar de una serie vieja', () => {
  const r = referenciaPorZona([tas({ anio: 2005 }), tas({ anio: 2009 }), tas({ anio: 2021 })])
  assert.equal(r[0].anioMin, 2005)
  assert.equal(r[0].anioMax, 2021)
})
