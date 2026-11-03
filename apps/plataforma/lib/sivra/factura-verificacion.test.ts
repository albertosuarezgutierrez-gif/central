import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  NIF_SQB,
  botonesVerificacionSqb,
  costeMedioLavanderia,
  cuadrePorPiso,
  esProveedorSqb,
  estimarLavanderia,
  huespedNoches,
  mensajeVerificacionSqb,
  verificarFacturaSqb,
} from './factura-verificacion.ts'

const TARIFAS = { A: 20, B: 25 }
const NOMBRES = { A: 'Piso A', B: 'Piso B' }
const pisoA = (p: Parameters<typeof cuadrePorPiso>[0]) => cuadrePorPiso(p).find((x) => x.propertyId === 'A')!

// Mes relativo a hoy (nada de fechas fijas).
const hoy = new Date()
const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

// ── Identidad ────────────────────────────────────────────────────────────────────
test('esProveedorSqb: por NIF', () => assert.equal(esProveedorSqb({ nif: `ES ${NIF_SQB}`, proveedor: 'Otro' }), true))
test('esProveedorSqb: NIF distinto con nombre parecido NO es SQB', () =>
  assert.equal(esProveedorSqb({ nif: 'B11111111', proveedor: 'SI QUE BRILLA SOCIEDAD LIMITADA' }), false))
test('esProveedorSqb: sin NIF, por nombre completo', () =>
  assert.equal(esProveedorSqb({ proveedor: 'SI QUE BRILLA SOCIEDAD LIMITADA' }), true))
test('esProveedorSqb: una palabra suelta no basta', () => {
  assert.equal(esProveedorSqb({ proveedor: 'Brilla Cristales SL' }), false)
  assert.equal(esProveedorSqb({ proveedor: 'Limpiezas Si' }), false)
})

// ── Huésped-noches ───────────────────────────────────────────────────────────────
test('huespedNoches: usa huéspedes reales', () =>
  assert.equal(huespedNoches([{ nights: 3, adults: 2, children: 1, maxGuests: 6 }]), 9))
test('huespedNoches: sin aforo cae a la capacidad', () =>
  assert.equal(huespedNoches([{ nights: 2, adults: null, children: null, maxGuests: 4 }]), 8))
test('huespedNoches: sin aforo ni capacidad → null (no 0)', () =>
  assert.equal(huespedNoches([{ nights: 2, adults: null, children: null, maxGuests: null }]), null))
test('huespedNoches: noches desconocidas → null', () =>
  assert.equal(huespedNoches([{ nights: null, adults: 2, children: 0, maxGuests: 4 }]), null))

// ── Coste medio ──────────────────────────────────────────────────────────────────
test('costeMedioLavanderia: Σ lavandería / Σ huésped-noches (ponderado)', () => {
  const c = costeMedioLavanderia([
    { lavanderia: 100, huespedNoches: 100 },
    { lavanderia: 300, huespedNoches: 100 },
    { lavanderia: 100, huespedNoches: 200 },
  ])
  assert.equal(c, 1.25)
})
test('costeMedioLavanderia: sin histórico suficiente → null', () => {
  assert.equal(costeMedioLavanderia([]), null)
  assert.equal(costeMedioLavanderia([{ lavanderia: 100, huespedNoches: 100 }, { lavanderia: 50, huespedNoches: 50 }]), null)
})
test('costeMedioLavanderia: meses con lavandería 0 o sin huésped-noches no cuentan', () => {
  const h = [
    { lavanderia: 0, huespedNoches: 100 },
    { lavanderia: 80, huespedNoches: null },
    { lavanderia: 100, huespedNoches: 100 },
    { lavanderia: 100, huespedNoches: 100 },
  ]
  assert.equal(costeMedioLavanderia(h), null) // solo 2 válidos
  assert.equal(costeMedioLavanderia(h, 2), 1)
})

// ── Banda de lavandería ──────────────────────────────────────────────────────────
test('estimarLavanderia: dentro de la banda → ok', () => {
  const e = estimarLavanderia({ huespedNoches: 100, coste: 1, facturada: 110 })
  assert.equal(e.estado, 'ok')
  assert.equal(e.estimada, 100)
  assert.equal(e.desvioPct, 10)
})
test('estimarLavanderia: justo en +15 % → ok', () =>
  assert.equal(estimarLavanderia({ huespedNoches: 100, coste: 1, facturada: 115 }).estado, 'ok'))
test('estimarLavanderia: por encima de +15 % → fuera con desvío', () => {
  const e = estimarLavanderia({ huespedNoches: 100, coste: 1, facturada: 130 })
  assert.equal(e.estado, 'fuera')
  assert.equal(e.desvioPct, 30)
})
test('estimarLavanderia: por debajo de −15 % → fuera con desvío negativo', () => {
  const e = estimarLavanderia({ huespedNoches: 100, coste: 1, facturada: 70 })
  assert.equal(e.estado, 'fuera')
  assert.equal(e.desvioPct, -30)
})
test('estimarLavanderia: sin coste medio → sin_referencia (nunca ok)', () => {
  const e = estimarLavanderia({ huespedNoches: 100, coste: null, facturada: 100 })
  assert.equal(e.estado, 'sin_referencia')
  assert.equal(e.estimada, null)
  assert.equal(e.desvioPct, null)
})
test('estimarLavanderia: sin huésped-noches → sin_referencia', () =>
  assert.equal(estimarLavanderia({ huespedNoches: null, coste: 1, facturada: 0 }).estado, 'sin_referencia'))

// ── Cuadre por piso ──────────────────────────────────────────────────────────────
const base = { tarifas: TARIFAS, nombres: NOMBRES }
test('cuadrePorPiso: facturadas = salidas y tarifa cerrada → ok', () =>
  assert.equal(pisoA({ ...base, lineas: [{ propertyId: 'A', sesiones: 3, importe: 60 }], salidas: { A: 3 } }).estado, 'ok'))
test('cuadrePorPiso: factura de más → sobra, con salida cancelada y orden extra como pista', () => {
  const a = pisoA({ ...base, lineas: [{ propertyId: 'A', sesiones: 4, importe: 80 }], salidas: { A: 3 }, canceladas: { A: 1 }, ordenesExtra: { A: 1 } })
  assert.equal(a.estado, 'sobra')
  assert.match(a.nota, /1 limpieza\(s\) de más/)
  assert.match(a.nota, /cancelada/)
  assert.match(a.nota, /orden\(es\) extra/)
})
test('cuadrePorPiso: factura de menos → falta', () => {
  const a = pisoA({ ...base, lineas: [{ propertyId: 'A', sesiones: 2, importe: 40 }], salidas: { A: 3 } })
  assert.equal(a.estado, 'falta')
  assert.match(a.nota, /1 limpieza\(s\) sin facturar/)
})
test('cuadrePorPiso: piso con salidas que no aparece en la factura → «piso sin facturar»', () => {
  const a = pisoA({ ...base, lineas: [{ propertyId: 'B', sesiones: 1, importe: 25 }], salidas: { A: 2, B: 1 } })
  assert.equal(a.estado, 'falta')
  assert.match(a.nota, /piso sin facturar/)
})
test('cuadrePorPiso: mismas sesiones pero importe ≠ tarifa cerrada → tarifa', () => {
  const a = pisoA({ ...base, lineas: [{ propertyId: 'A', sesiones: 3, importe: 66 }], salidas: { A: 3 } })
  assert.equal(a.estado, 'tarifa')
})
test('cuadrePorPiso: varias líneas del mismo piso se suman', () => {
  const a = pisoA({ ...base, lineas: [{ propertyId: 'A', sesiones: 2, importe: 40 }, { propertyId: 'A', sesiones: 1, importe: 20 }], salidas: { A: 3 } })
  assert.equal(a.facturadas, 3)
  assert.equal(a.estado, 'ok')
})
test('cuadrePorPiso: importe esperado = salidas × tarifa cerrada', () =>
  assert.equal(pisoA({ ...base, lineas: [], salidas: { A: 3 } }).importeEsperado, 60))

// ── Veredicto y mensaje ──────────────────────────────────────────────────────────
function entrada(over: { facturadas?: number; lav?: ReturnType<typeof estimarLavanderia>; total?: number } = {}) {
  const pisos = cuadrePorPiso({
    ...base,
    lineas: [{ propertyId: 'A', sesiones: over.facturadas ?? 3, importe: (over.facturadas ?? 3) * 20 }],
    salidas: { A: 3 },
  }).filter((p) => p.propertyId === 'A')
  return {
    periodo, numero: '2026/1', totalFactura: over.total ?? 193.6, pisos,
    lavanderia: over.lav ?? estimarLavanderia({ huespedNoches: 100, coste: 1, facturada: 100 }),
    costeMedio: 1, huespedNoches: 100,
  }
}
test('verificarFacturaSqb: todo cuadra y lavandería en banda → ok, total esperado con IVA', () => {
  const v = verificarFacturaSqb(entrada())
  assert.equal(v.veredicto, 'ok')
  assert.equal(v.totalEsperado, 193.6) // (60 + 100) × 1,21
})
test('verificarFacturaSqb: lavandería fuera de banda → revisar con el desvío', () => {
  const v = verificarFacturaSqb(entrada({ lav: estimarLavanderia({ huespedNoches: 100, coste: 1, facturada: 150 }) }))
  assert.equal(v.veredicto, 'revisar')
  assert.match(v.motivos.join(' '), /Lavandería \+50 %/)
})
test('verificarFacturaSqb: lavandería sin referencia NUNCA da ✅', () => {
  const v = verificarFacturaSqb(entrada({ lav: estimarLavanderia({ huespedNoches: 100, coste: null, facturada: 100 }) }))
  assert.equal(v.veredicto, 'revisar')
  assert.equal(v.totalEsperado, null)
  assert.match(v.motivos.join(' '), /sin referencia/)
})
test('verificarFacturaSqb: limpieza de más → revisar', () =>
  assert.equal(verificarFacturaSqb(entrada({ facturadas: 4 })).veredicto, 'revisar'))
test('verificarFacturaSqb: reservas sin fecha de salida impiden el ✅', () =>
  assert.equal(verificarFacturaSqb({ ...entrada(), sinFechaSalida: 1 }).veredicto, 'revisar'))
test('verificarFacturaSqb: errores aritméticos impiden el ✅', () =>
  assert.equal(verificarFacturaSqb({ ...entrada(), aritmetica: ['Total mal'] }).veredicto, 'revisar'))

test('mensajeVerificacionSqb: cuadra → ✅, dinero con eur() y «pendiente de tu transferencia»', () => {
  const m = mensajeVerificacionSqb(verificarFacturaSqb(entrada()))
  assert.match(m, /✅ <b>Cuadra<\/b>/)
  assert.match(m, /193,60€/)
  assert.match(m, /Pendiente de tu transferencia/)
  assert.doesNotMatch(m, /Pagar/)
})
test('mensajeVerificacionSqb: no cuadra → ⚠️ Revisar con el motivo', () => {
  const m = mensajeVerificacionSqb(verificarFacturaSqb(entrada({ facturadas: 4 })))
  assert.match(m, /⚠️ <b>Revisar<\/b>/)
  assert.match(m, /de más/)
})
test('mensajeVerificacionSqb: sin referencia lo dice, no pone ✅ en la lavandería', () => {
  const m = mensajeVerificacionSqb(verificarFacturaSqb(entrada({ lav: estimarLavanderia({ huespedNoches: 100, coste: null, facturada: 100 }) })))
  assert.match(m, /❔ Lavandería: facturada 100,00€ · sin referencia/)
  assert.doesNotMatch(m, /✅ Lavandería/)
})

// ── Botones: SQB NUNCA lleva «Pagar» ─────────────────────────────────────────────
test('botonesVerificacionSqb: sin pago_aprobar ni «Pagar»', () => {
  const planos = botonesVerificacionSqb('f-1').flat()
  assert.equal(planos.some((b) => b.callback.startsWith('pago_aprobar')), false)
  assert.equal(planos.some((b) => /pagar/i.test(b.texto)), false)
})
test('botonesVerificacionSqb: mantiene Aplazar y Rechazar', () => {
  const cb = botonesVerificacionSqb('f-1').flat().map((b) => b.callback)
  assert.deepEqual(cb, ['pago_aplazar:f-1', 'pago_rechazar:f-1'])
})

// ── Cepo de fuente: notificarFactura desvía a SQB ANTES de construir los botones con Pagar ──
test('pagos.ts: notificarFactura desvía a SQB antes de los botones de Pagar', () => {
  const src = readFileSync(new URL('../agente-facturas/pagos.ts', import.meta.url), 'utf8')
  const i = src.indexOf('async function notificarFactura(')
  const cuerpo = src.slice(i, src.indexOf('\n}\n', i))
  const iSqb = cuerpo.indexOf('esProveedorSqb(')
  const iPagar = cuerpo.indexOf("pago_aprobar:")
  assert.ok(iSqb > 0, 'falta la rama SQB')
  assert.ok(iPagar > 0)
  assert.ok(iSqb < iPagar, 'la rama SQB debe ir antes del botón Pagar')
  const j = src.indexOf('async function notificarVerificacionSqb(')
  const fnSqb = src.slice(j, src.indexOf('\n}\n', j))
  assert.doesNotMatch(fnSqb, /pago_aprobar/)
})
