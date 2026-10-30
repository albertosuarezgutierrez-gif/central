import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkBanco, checkFacturas, checkCobrosOta, checkLimpieza, checkGastosFijos, checkDuplicados,
  coberturaFifo, cobroEnPlazo, facturasSinCargo, buscarDuplicados, veredicto, evaluarUnidad,
  unidadesDeGasto, unidadesDeMovimiento, paresDeGasto, paresBloqueados, faseDelDia, mesACerrar,
  ofrecerCierre, interpretarCallbackCierre, callbackCerrar, formatearResumenCierre, finDeMes,
  titularidadDescuadrada, type Check, type ReservaMes, type DatosCierreUnidad,
} from './cierre-mes.ts'

const MES = '2026-09'
const ok = (id: Check['id']): Check => ({ id, titulo: id, estado: 'ok', aceptado: false, detalle: '', items: [] })

// ── a) banco ─────────────────────────────────────────────────────────────────────────────────────
test('banco: null = no se sabe; [] = no se sabe (ninguna cuenta), nunca ok', () => {
  assert.equal(checkBanco(null, MES).estado, 'no_se_sabe')
  assert.equal(checkBanco([], MES).estado, 'no_se_sabe')
})

test('banco: sincronizada pasado fin de mes = ok; hasta el día 30 mismo = pendiente', () => {
  assert.equal(checkBanco([{ nombre: 'Kutxa', sincronizadaHasta: '2026-10-05', ultimoMovimiento: '2026-10-04' }], MES).estado, 'ok')
  const c = checkBanco([{ nombre: 'BBVA', sincronizadaHasta: '2026-09-30', ultimoMovimiento: '2026-09-29' }], MES)
  assert.equal(c.estado, 'pendiente')
  assert.equal(c.aceptado, false)
})

test('banco: sin sello de sincronización y sin movimientos posteriores = no se sabe (no pendiente, no ok)', () => {
  assert.equal(checkBanco([{ nombre: 'Tarjeta', sincronizadaHasta: null, ultimoMovimiento: '2026-09-28' }], MES).estado, 'no_se_sabe')
  // …pero un movimiento posterior al fin de mes prueba que el mes está dentro
  assert.equal(checkBanco([{ nombre: 'Tarjeta', sincronizadaHasta: null, ultimoMovimiento: '2026-10-02' }], MES).estado, 'ok')
})

test('banco: una cuenta atrasada manda sobre otra sin sello', () => {
  const c = checkBanco([
    { nombre: 'A', sincronizadaHasta: '2026-09-10', ultimoMovimiento: null },
    { nombre: 'B', sincronizadaHasta: null, ultimoMovimiento: null },
  ], MES)
  assert.equal(c.estado, 'pendiente')
  assert.equal(c.items.length, 2)
})

// ── b) facturas ──────────────────────────────────────────────────────────────────────────────────
test('facturas sin cargo: casa por importe ±2 % y ventana −15/+45 días, un cargo por factura', () => {
  const r = facturasSinCargo(
    [
      { id: 'f1', fecha: '2026-09-03', total: 100, nombre: 'Endesa' },
      { id: 'f2', fecha: '2026-09-04', total: 100, nombre: 'Endesa' },
      { id: 'f3', fecha: '2026-09-10', total: 50, nombre: 'Emasesa' },
    ],
    [
      { id: 'c1', fecha: '2026-09-20', importe: -101.5 },
      { id: 'c2', fecha: '2026-12-01', importe: -50 }, // fuera de ventana
    ],
  )
  assert.deepEqual(r.map(x => x.nombre), ['Endesa', 'Emasesa'])
})

test('facturas: null en cualquiera de las dos lecturas = no se sabe; ambas vacías = ok', () => {
  assert.equal(checkFacturas(null, []).estado, 'no_se_sabe')
  assert.equal(checkFacturas([], null).estado, 'no_se_sabe')
  assert.equal(checkFacturas([], []).estado, 'ok')
  const c = checkFacturas([{ fecha: '2026-09-02', importe: 30, nombre: 'Hosting' }], [])
  assert.equal(c.estado, 'pendiente')
  assert.match(c.items[0], /30,00€/)
})

// ── c) cobros OTA ────────────────────────────────────────────────────────────────────────────────
test('FIFO: el dinero cubre por orden de salida; base null = no se sabe y no consume', () => {
  const m = coberturaFifo(
    [
      { id: 'a', checkOut: '2026-09-02', base: 100 },
      { id: 'x', checkOut: '2026-09-03', base: null },
      { id: 'b', checkOut: '2026-09-05', base: 100 },
      { id: 'c', checkOut: '2026-09-09', base: 100 },
    ],
    [{ fecha: '2026-09-08', importe: 150 }, { fecha: '2026-09-12', importe: 49.5 }],
  )
  assert.equal(m.get('a'), true)
  assert.equal(m.get('x'), null)
  assert.equal(m.get('b'), true) // 99,5 de 100: dentro de la tolerancia de 1 €
  assert.equal(m.get('c'), false)
})

test('plazos: Booking 10 días tras la salida; Expedia hasta fin del mes siguiente (mes vencido)', () => {
  assert.equal(cobroEnPlazo('BOOKING', '2026-09-28', '2026-10-05'), true)
  assert.equal(cobroEnPlazo('BOOKING', '2026-09-20', '2026-10-05'), false)
  assert.equal(cobroEnPlazo('EXPEDIA', '2026-09-10', '2026-10-31'), true)
  assert.equal(cobroEnPlazo('EXPEDIA', '2026-09-10', '2026-11-01'), false)
})

const res = (p: Partial<ReservaMes>): ReservaMes => ({ id: 'r', unidad: 'prop_luxury_busto', canal: 'BOOKING', checkOut: '2026-09-10', bruto: 200, cubierta: true, ...p })

test('cobros: Expedia sin cobrar el día 15 del mes siguiente = pendiente ACEPTADO (cuadra)', () => {
  const c = checkCobrosOta([res({ canal: 'EXPEDIA', cubierta: false })], 'prop_luxury_busto', '2026-10-15')
  assert.equal(c.estado, 'pendiente')
  assert.equal(c.aceptado, true)
  assert.equal(veredicto([c]), 'cuadra')
})

test('cobros: Booking vencida sin cobrar = pendiente NO aceptado', () => {
  const c = checkCobrosOta([res({ cubierta: false })], 'prop_luxury_busto', '2026-10-15')
  assert.equal(c.estado, 'pendiente')
  assert.equal(c.aceptado, false)
})

test('cobros: un hueco vencido de otro piso del mismo pool deja pendiente también a este (el banco no separa pisos)', () => {
  const c = checkCobrosOta([
    res({ id: '1', cubierta: true }),
    res({ id: '2', unidad: 'prop_busto_reform', cubierta: false }),
  ], 'prop_luxury_busto', '2026-10-15')
  assert.equal(c.estado, 'pendiente')
  assert.equal(c.aceptado, false)
})

test('cobros: lectura caída = no se sabe; reserva sin importe = no se sabe; sin reservas = ok', () => {
  assert.equal(checkCobrosOta(null, 'prop_luxury_busto', '2026-10-15').estado, 'no_se_sabe')
  assert.equal(checkCobrosOta([res({ cubierta: null, bruto: null })], 'prop_luxury_busto', '2026-10-15').estado, 'no_se_sabe')
  assert.equal(checkCobrosOta([], 'prop_luxury_busto', '2026-10-15').estado, 'ok')
})

// ── d) limpieza ──────────────────────────────────────────────────────────────────────────────────
test('limpieza: factura del periodo con importe del piso = ok', () => {
  assert.equal(checkLimpieza({ facturaPorPiso: { prop_house_sevillana: 540 }, salidas: 6 }, 'prop_house_sevillana', MES, '2026-10-15').estado, 'ok')
})

test('limpieza: sin factura del periodo el 15 del mes siguiente = pendiente aceptado (mes vencido); el 1 del otro = pendiente', () => {
  const a = checkLimpieza({ facturaPorPiso: null, salidas: 4 }, 'prop_duplex_center', MES, '2026-10-15')
  assert.equal(a.estado, 'pendiente')
  assert.equal(a.aceptado, true)
  const b = checkLimpieza({ facturaPorPiso: null, salidas: 4 }, 'prop_duplex_center', MES, '2026-11-01')
  assert.equal(b.aceptado, false)
})

test('limpieza: la factura no incluye el piso con salidas = pendiente; salidas NULL = no se sabe; 0 salidas = ok', () => {
  assert.equal(checkLimpieza({ facturaPorPiso: { prop_duplex_center: 125 }, salidas: 3 }, 'prop_busto_reform', MES, '2026-10-15').estado, 'pendiente')
  assert.equal(checkLimpieza({ facturaPorPiso: { prop_duplex_center: 125 }, salidas: null }, 'prop_busto_reform', MES, '2026-10-15').estado, 'no_se_sabe')
  assert.equal(checkLimpieza({ facturaPorPiso: { prop_duplex_center: 125 }, salidas: 0 }, 'prop_busto_reform', MES, '2026-10-15').estado, 'ok')
  assert.equal(checkLimpieza(null, 'prop_busto_reform', MES, '2026-10-15').estado, 'no_se_sabe')
})

// ── e) gastos fijos ──────────────────────────────────────────────────────────────────────────────
test('gastos fijos: falta uno = pendiente; ninguno esperado = ok; lectura caída = no se sabe', () => {
  const d = { esperados: [{ huella: 'h1', concepto: 'IBI' }, { huella: 'h2', concepto: 'Seguro' }], generadas: ['h1'] }
  const c = checkGastosFijos(d)
  assert.equal(c.estado, 'pendiente')
  assert.deepEqual(c.items, ['Falta: Seguro'])
  assert.equal(checkGastosFijos({ ...d, generadas: ['h1', 'h2'] }).estado, 'ok')
  assert.equal(checkGastosFijos({ esperados: [], generadas: [] }).estado, 'ok')
  assert.equal(checkGastosFijos(null).estado, 'no_se_sabe')
})

// ── f) duplicados ────────────────────────────────────────────────────────────────────────────────
test('duplicados: misma cuenta+fecha+importe+concepto; los ya revisados (normal/confirmado) no cuentan', () => {
  const base = { cuenta: 'k', fecha: '2026-09-05', importe: -20, concepto: 'RECIBO  Endesa', duplicadoEstado: null }
  const g = buscarDuplicados([
    { ...base, id: '1' }, { ...base, id: '2', concepto: 'recibo endesa' },
    { ...base, id: '3', cuenta: 'otra' },
    { ...base, id: '4', importe: -21 },
  ])
  assert.equal(g.length, 1)
  assert.equal(g[0].n, 2)
  assert.equal(buscarDuplicados([{ ...base, id: '1' }, { ...base, id: '2', duplicadoEstado: 'normal' }]).length, 0)
  assert.equal(checkDuplicados(null).estado, 'no_se_sabe')
  assert.equal(checkDuplicados([]).estado, 'ok')
})

// ── veredicto ────────────────────────────────────────────────────────────────────────────────────
test('veredicto: cuadra solo con todo ok o pendiente aceptado; no_se_sabe no cuadra', () => {
  assert.equal(veredicto([ok('banco'), { ...ok('limpieza'), estado: 'pendiente', aceptado: true }]), 'cuadra')
  assert.equal(veredicto([ok('banco'), { ...ok('limpieza'), estado: 'no_se_sabe' }]), 'no_se_sabe')
  assert.equal(veredicto([{ ...ok('banco'), estado: 'no_se_sabe' }, { ...ok('limpieza'), estado: 'pendiente' }]), 'pendiente')
})

test('evaluarUnidad: todo null = seis checks no_se_sabe, nunca cuadra', () => {
  const d: DatosCierreUnidad = {
    mes: MES, unidad: 'prop_duplex_center', hoy: '2026-10-15', cuentas: null, cargosSinFactura: null,
    facturasSinCargo: null, reservas: null, limpieza: null, fijos: null, movimientos: null,
  }
  const r = evaluarUnidad(d)
  assert.equal(r.checks.length, 6)
  assert.ok(r.checks.every(c => c.estado === 'no_se_sabe'))
  assert.equal(r.veredicto, 'no_se_sabe')
})

// ── unidades / guard ─────────────────────────────────────────────────────────────────────────────
test('unidades: compartido afecta a los 4 pisos; personal o vacío a ninguno; movimiento sin piso = todo su destino', () => {
  assert.equal(unidadesDeGasto('prop_multi_apartamentos').length, 4)
  assert.deepEqual(unidadesDeGasto('prop_duplex_center'), ['prop_duplex_center'])
  assert.deepEqual(unidadesDeGasto('prop_personal'), [])
  assert.deepEqual(unidadesDeGasto(null), [])
  assert.deepEqual(unidadesDeMovimiento('turistico_duplex', null), ['prop_duplex_center'])
  assert.deepEqual(unidadesDeMovimiento('turistico_pisos', null).sort(), ['prop_busto_reform', 'prop_house_sevillana', 'prop_luxury_busto'])
  assert.deepEqual(unidadesDeMovimiento('turistico_pisos', 'prop_luxury_busto'), ['prop_luxury_busto'])
  assert.deepEqual(unidadesDeMovimiento('seguros', null), [])
})

test('guard: bloquea solo los pares cerrados que la escritura toca', () => {
  const cerrados = [{ mes: '2026-09', unidad: 'prop_duplex_center' }]
  assert.deepEqual(paresBloqueados(paresDeGasto('2026-09-14', 'prop_duplex_center'), cerrados), cerrados)
  assert.deepEqual(paresBloqueados(paresDeGasto('2026-10-01', 'prop_duplex_center'), cerrados), [])
  assert.deepEqual(paresBloqueados(paresDeGasto('2026-09-14', 'prop_luxury_busto'), cerrados), [])
  assert.equal(paresBloqueados(paresDeGasto('2026-09-14', 'prop_multi_apartamentos'), cerrados).length, 1)
})

// ── cron / botón ─────────────────────────────────────────────────────────────────────────────────
test('fase y mes: día 5 pre-cierre, día 15 cierre, siempre del mes anterior (cruce de año)', () => {
  assert.equal(faseDelDia(5), 'pre')
  assert.equal(faseDelDia(15), 'cierre')
  assert.equal(mesACerrar('2026-10-05'), '2026-09')
  assert.equal(mesACerrar('2027-01-15'), '2026-12')
  assert.equal(finDeMes('2028-02'), '2028-02-29')
})

test('botón Cerrar: solo en cierre, todo cuadra y algo sin cerrar; callback ida y vuelta', () => {
  assert.equal(ofrecerCierre('cierre', [{ veredicto: 'cuadra', estado: 'en_revision' }]), true)
  assert.equal(ofrecerCierre('pre', [{ veredicto: 'cuadra', estado: 'en_revision' }]), false)
  assert.equal(ofrecerCierre('cierre', [{ veredicto: 'cuadra', estado: null }, { veredicto: 'no_se_sabe', estado: null }]), false)
  assert.equal(ofrecerCierre('cierre', [{ veredicto: 'cuadra', estado: 'cerrado' }]), false)
  assert.equal(callbackCerrar('2026-09'), 'cmes_cerrar:2026-09')
  assert.deepEqual(interpretarCallbackCierre('cerrar', ['2026-09']), { mes: '2026-09' })
  assert.equal(interpretarCallbackCierre('cerrar', ['2026-13']), null)
  assert.equal(interpretarCallbackCierre('borrar', ['2026-09']), null)
})

test('Telegram: una línea por unidad con su veredicto y la lista de lo que falta, escapado', () => {
  const txt = formatearResumenCierre({
    mes: MES, fase: 'pre',
    resultados: [
      { unidad: 'prop_duplex_center', veredicto: 'cuadra', checks: [ok('banco')] },
      { unidad: 'prop_house_sevillana', veredicto: 'pendiente', checks: [
        { ...ok('banco'), estado: 'pendiente', detalle: 'Kutxa <atrasada>', items: ['x'] },
        { ...ok('facturas'), estado: 'pendiente', detalle: 'd' },
      ] },
    ],
  })
  assert.match(txt, /Septiembre 2026<\/b> \(pre-cierre\): Dúplex ✅ cuadra · Socorro ⚠️ 2 pendientes/)
  assert.match(txt, /&lt;atrasada&gt;/)
})

test('titularidad: cada piso suma 100', () => {
  assert.deepEqual(titularidadDescuadrada([
    { propiedadId: 'prop_house_sevillana', porcentaje: 50 }, { propiedadId: 'prop_house_sevillana', porcentaje: 50 },
    { propiedadId: 'prop_duplex_center', porcentaje: 90 },
  ]), ['prop_duplex_center'])
})
