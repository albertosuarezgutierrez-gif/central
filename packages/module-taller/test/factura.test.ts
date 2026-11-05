// Facturación pura del taller. Cepos vistos fallar (04/11/2026), uno por aserción:
// (1) quitar el filtro `aceptadaEn == null` de lineasFacturables → rojo «ampliación no aceptada fuera».
// (2) cambiar `<= LIMITE_SIMPLIFICADA_CENT` por `true` en decidirTipoFactura → rojo «F2 por encima del límite rechazada».
// (3) cambiar `>= LIMITE_EFECTIVO_CENT` por `> LIMITE_EFECTIVO_CENT + 1` en planCobros → rojo «efectivo de 1.000 € exactos bloquea».
// (4) quitar el `cobradoCent > e.totalCent` → rojo «no se cobra más que el total».
// Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirFacturaDesdeOt, construirRectificativa, decidirTipoFactura, lineasAbonoTotal, lineasFacturables, numeroFactura,
  planCobros, totalesFactura, LIMITE_EFECTIVO_CENT, LIMITE_SIMPLIFICADA_CENT, type LineaOtFacturable,
} from '../src/index.ts'

const PB = 1900 // IVA arbitrario del test (no el general): el cálculo sale del dato de la línea
const PB2 = 500
const ACEPTADA = new Date('2026-11-01T10:00:00Z')
const nifOk = (n: string) => n === '12345678Z'

function linea(o: Partial<LineaOtFacturable> = {}): LineaOtFacturable {
  return {
    id: `l${Math.random()}`, tipo: 'mano_obra', descripcion: 'Trabajo', cantidad: 60, unidad: 'min', baseCent: 10_001,
    ivaCodigo: 'g', ivaPuntosBasicos: PB, origen: 'paquete', aceptadaEn: ACEPTADA, ...o,
  }
}
const conDatos = { nombre: 'Taxis Ana S.L.', nif: '12345678z', domicilio: 'Calle Mayor 1, 41900 Camas' }
const sinNif = { nombre: 'Ana', nif: null, domicilio: null }

test('ampliación no aceptada fuera; la aceptada dentro', () => {
  const r = lineasFacturables([linea({ id: 'a' }), linea({ id: 'b', origen: 'ampliacion', aceptadaEn: null }), linea({ id: 'c', origen: 'ampliacion' })])
  assert.deepEqual(r.incluidas.map((l) => l.otLineaId), ['a', 'c'])
  assert.deepEqual(r.excluidas, [{ id: 'b', motivo: 'ampliación sin aceptar por el cliente' }])
})

test('cuota por tipo de IVA (una vez por grupo), no suma de redondeos por línea', () => {
  // 3 líneas de 0,01 € al 19 %: por línea serían 3 × 0 = 0 céntimos; por grupo, 3 × 0,19 = 0,57 → 1 céntimo.
  const t = totalesFactura([1, 2, 3].map((i) => ({ orden: i, otLineaId: null, tipo: 'pieza', descripcion: 'x', cantidad: 1, unidad: 'ud' as const, baseCent: 1, ivaCodigo: 'g', ivaPuntosBasicos: PB })))
  assert.deepEqual(t.desglose, [{ ivaPuntosBasicos: PB, baseCent: 3, cuotaCent: 1 }])
  assert.equal(t.totalCent, 4)
  const dos = totalesFactura([
    { orden: 1, otLineaId: null, tipo: 'pieza', descripcion: 'x', cantidad: 1, unidad: 'ud', baseCent: 10_000, ivaCodigo: 'r', ivaPuntosBasicos: PB2 },
    { orden: 2, otLineaId: null, tipo: 'pieza', descripcion: 'y', cantidad: 1, unidad: 'ud', baseCent: 20_000, ivaCodigo: 'g', ivaPuntosBasicos: PB },
  ])
  assert.deepEqual(dos.desglose.map((g) => g.ivaPuntosBasicos), [PB, PB2], 'ordenado de mayor a menor tipo')
  assert.equal(dos.cuotaIvaCent, 3_800 + 500)
  assert.equal(dos.totalCent, dos.baseCent + dos.cuotaIvaCent)
})

test('F1 con NIF válido, nombre y domicilio', () => {
  const r = decidirTipoFactura(conDatos, 999_999, nifOk)
  assert.deepEqual(r, { ok: true, tipo: 'F1', destinatario: { nombre: 'Taxis Ana S.L.', nif: '12345678Z' } })
})

test('NIF escrito pero inválido NO degrada a simplificada', () => {
  const r = decidirTipoFactura({ ...conDatos, nif: '12345678A' }, 100, nifOk)
  assert.equal(r.ok, false)
})

test('F1 sin domicilio o sin nombre: se piden', () => {
  assert.equal(decidirTipoFactura({ ...conDatos, domicilio: ' ' }, 100, nifOk).ok, false)
  assert.equal(decidirTipoFactura({ ...conDatos, nombre: '' }, 100, nifOk).ok, false)
})

test('sin NIF: F2 hasta el límite (incluido)', () => {
  assert.deepEqual(decidirTipoFactura(sinNif, LIMITE_SIMPLIFICADA_CENT, nifOk), { ok: true, tipo: 'F2', destinatario: null })
})

test('F2 por encima del límite rechazada (se exigen datos)', () => {
  const r = decidirTipoFactura(sinNif, LIMITE_SIMPLIFICADA_CENT + 1, nifOk)
  assert.equal(r.ok, false)
  assert.match((r as { motivo: string }).motivo, /pide NIF/)
})

test('factura desde OT: solo aceptadas, total con IVA por grupo, sin líneas → error', () => {
  const ok = construirFacturaDesdeOt({ lineas: [linea({ baseCent: 10_000 }), linea({ aceptadaEn: null, origen: 'ampliacion', baseCent: 99_999 })], cliente: conDatos, nifValido: nifOk })
  assert.equal(ok.ok, true)
  if (!ok.ok) return
  assert.equal(ok.totales.baseCent, 10_000)
  assert.equal(ok.excluidas.length, 1)
  assert.equal(construirFacturaDesdeOt({ lineas: [linea({ aceptadaEn: null })], cliente: conDatos, nifValido: nifOk }).ok, false)
})

test('número de factura: prefijo + año + 6 cifras', () => {
  assert.equal(numeroFactura('F', 2026, 7), 'F2026-000007')
  assert.equal(numeroFactura('R', 2026, 1_234_567), 'R2026-1234567')
  assert.throws(() => numeroFactura('F', 2026, 0))
})

const original = (tipo: 'F1' | 'F2') => {
  const lineas = [{ orden: 1, otLineaId: 'a', tipo: 'pieza', descripcion: 'x', cantidad: 1, unidad: 'ud' as const, baseCent: 10_000, ivaCodigo: 'g', ivaPuntosBasicos: PB }]
  return { tipo, estado: 'emitida', lineas, totales: totalesFactura(lineas) }
}

test('rectificativa por diferencias (abono total): importes negativos, I, R1 sobre F1 y R5 sobre F2', () => {
  const o = original('F1')
  const r = construirRectificativa({ original: o, modo: 'diferencias', lineas: lineasAbonoTotal(o.lineas), causa: 'R1' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.tipo, 'R1')
  assert.equal(r.modo, 'I')
  assert.equal(r.totales.totalCent, -o.totales.totalCent)
  assert.equal(r.importeRectificado, null)
  const r5 = construirRectificativa({ original: original('F2'), modo: 'diferencias', lineas: lineasAbonoTotal(o.lineas), causa: 'R1' })
  assert.equal(r5.ok && r5.tipo, 'R5')
})

test('rectificativa por sustitución: S con base y cuota de la original; sin negativos', () => {
  const o = original('F1')
  const nuevas = [{ ...o.lineas[0], baseCent: 8_000 }]
  const r = construirRectificativa({ original: o, modo: 'sustitucion', lineas: nuevas, causa: 'R4' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.modo, 'S')
  assert.deepEqual(r.importeRectificado, { baseCent: o.totales.baseCent, cuotaCent: o.totales.cuotaIvaCent })
  assert.equal(construirRectificativa({ original: o, modo: 'sustitucion', lineas: lineasAbonoTotal(o.lineas), causa: 'R4' }).ok, false)
})

test('no se rectifica una anulada ni una rectificativa; no se deja en negativo', () => {
  const o = original('F1')
  assert.equal(construirRectificativa({ original: { ...o, estado: 'anulada' }, modo: 'diferencias', lineas: lineasAbonoTotal(o.lineas), causa: 'R1' }).ok, false)
  assert.equal(construirRectificativa({ original: { ...o, tipo: 'R1' }, modo: 'diferencias', lineas: lineasAbonoTotal(o.lineas), causa: 'R1' }).ok, false)
  const doble = [...lineasAbonoTotal(o.lineas), ...lineasAbonoTotal(o.lineas)]
  assert.equal(construirRectificativa({ original: o, modo: 'diferencias', lineas: doble, causa: 'R1' }).ok, false)
})

const tarjeta = (importeCent: number) => ({ medioCodigo: 'tarjeta', esEfectivo: false, importeCent })
const efectivo = (importeCent: number) => ({ medioCodigo: 'efectivo', esEfectivo: true, importeCent })

test('cobro dividido que suma el total → pendiente 0', () => {
  const r = planCobros({ totalCent: 150_000, yaCobrados: [], nuevos: [tarjeta(100_001), efectivo(49_999)] })
  assert.deepEqual(r, { ok: true, cobradoCent: 150_000, pendienteCent: 0, efectivoCent: 49_999 })
})

test('cobro parcial deja pendiente', () => {
  const r = planCobros({ totalCent: 150_000, yaCobrados: [{ importeCent: 20_000, esEfectivo: false }], nuevos: [tarjeta(30_000)] })
  assert.equal(r.ok && r.pendienteCent, 100_000)
})

test('no se cobra más que el total', () => {
  assert.equal(planCobros({ totalCent: 10_000, yaCobrados: [{ importeCent: 9_000, esEfectivo: false }], nuevos: [tarjeta(1_001)] }).ok, false)
})

test('efectivo > 1.000 € bloquea', () => {
  const r = planCobros({ totalCent: 500_000, yaCobrados: [], nuevos: [efectivo(LIMITE_EFECTIVO_CENT + 1)] })
  assert.equal(r.ok, false)
  assert.match((r as { motivo: string }).motivo, /Ley 7\/2012/)
})

test('efectivo de 1.000 € exactos bloquea («igual o superior»); 999,99 € pasa', () => {
  assert.equal(planCobros({ totalCent: 500_000, yaCobrados: [], nuevos: [efectivo(LIMITE_EFECTIVO_CENT)] }).ok, false)
  assert.equal(planCobros({ totalCent: 500_000, yaCobrados: [], nuevos: [efectivo(LIMITE_EFECTIVO_CENT - 1)] }).ok, true)
})

test('el efectivo se acumula entre cobros de la misma factura (fraccionar no lo esquiva)', () => {
  const r = planCobros({ totalCent: 500_000, yaCobrados: [{ importeCent: 60_000, esEfectivo: true }], nuevos: [efectivo(40_000)] })
  assert.equal(r.ok, false)
})

test('importes no enteros o ≤ 0 rechazados; factura sin importe no se cobra', () => {
  assert.equal(planCobros({ totalCent: 10_000, yaCobrados: [], nuevos: [tarjeta(0)] }).ok, false)
  assert.equal(planCobros({ totalCent: 10_000, yaCobrados: [], nuevos: [tarjeta(1.5)] }).ok, false)
  assert.equal(planCobros({ totalCent: -10_000, yaCobrados: [], nuevos: [tarjeta(1)] }).ok, false)
})
