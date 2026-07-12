// apps/plataforma/lib/contable/intencion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarIntencion, entidadesResiduales, intencionDesdeJSON, resumenIntencion, interpretarVerificacion } from './intencion.ts'

const HOY = { anio: 2026, mes: 7 } // julio 2026

test('"gasto total junio" → mes 6 del año actual, gasto', () => {
  const r = detectarIntencion('Dime gasto total junio', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'movimientos_mes')
  if (r!.tipo === 'movimientos_mes') { assert.equal(r!.mes, 6); assert.equal(r!.anio, 2026); assert.equal(r!.signo, 'gasto') }
})

test('mes con año explícito', () => {
  const r = detectarIntencion('cuánto gasté en mayo de 2025', HOY)
  assert.ok(r && r.tipo === 'movimientos_mes')
  if (r && r.tipo === 'movimientos_mes') { assert.equal(r.mes, 5); assert.equal(r.anio, 2025) }
})

test('"mes pasado" desde julio → junio', () => {
  const r = detectarIntencion('gastos del mes pasado', HOY)
  assert.ok(r && r.tipo === 'movimientos_mes')
  if (r && r.tipo === 'movimientos_mes') { assert.equal(r.mes, 6); assert.equal(r.anio, 2026) }
})

test('"mes pasado" desde enero → diciembre del año anterior', () => {
  const r = detectarIntencion('cuánto gasté el mes pasado', { anio: 2026, mes: 1 })
  assert.ok(r && r.tipo === 'movimientos_mes')
  if (r && r.tipo === 'movimientos_mes') { assert.equal(r.mes, 12); assert.equal(r.anio, 2025) }
})

test('"cuánto llevo en luz este año" → concepto luz', () => {
  const r = detectarIntencion('¿Cuánto llevo gastado en luz este año?', HOY)
  assert.ok(r && r.tipo === 'concepto')
  if (r && r.tipo === 'concepto') { assert.equal(r.etiqueta, 'luz'); assert.equal(r.anio, 2026); assert.ok(r.terminos.includes('endesa')) }
})

test('"gastado en claude" → concepto genérico (NO total del año)', () => {
  const r = detectarIntencion('¿Cuanto llevo gastado en claude?', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.equal(r.etiqueta, 'claude')
    assert.deepEqual(r.terminos, ['claude'])
    assert.equal(r.signo, 'gasto')
    assert.equal(r.anio, 2026)
  }
})

test('"gastado en amazon" → concepto genérico amazon', () => {
  const r = detectarIntencion('cuánto he gastado en amazon', HOY)
  assert.ok(r && r.tipo === 'concepto')
  if (r && r.tipo === 'concepto') assert.equal(r.etiqueta, 'amazon')
})

test('"gastado en total este año" → acumulado del año (total NO es proveedor)', () => {
  const r = detectarIntencion('cuánto he gastado en total este año', HOY)
  assert.ok(r && r.tipo === 'movimientos_anio', `esperaba movimientos_anio, fue ${r?.tipo}`)
})

test('"gastado en amazon en junio" → concepto amazon ∩ junio (el mes NO tira el proveedor)', () => {
  const r = detectarIntencion('cuánto he gastado en amazon en junio', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.deepEqual(r.terminos, ['amazon'])
    assert.equal(r.mes, 6)
    assert.equal(r.anio, 2026)
  }
})

test('"este mes en amazon" → concepto amazon ∩ mes actual (stop-word inicial no tapa el proveedor)', () => {
  const r = detectarIntencion('cuánto he gastado este mes en amazon', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.deepEqual(r.terminos, ['amazon'])
    assert.equal(r.mes, 7)
  }
})

test('"en junio en amazon" → salta "junio" (stop) y coge "amazon"', () => {
  const r = detectarIntencion('cuánto gasté en junio en amazon', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.deepEqual(r.terminos, ['amazon'])
    assert.equal(r.mes, 6)
  }
})

test('"pisos vs correduría" → por_destino', () => {
  const r = detectarIntencion('¿Cómo van mis gastos de pisos vs correduría?', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'por_destino')
})

test('"Gastos de este año 2026 correduria" → gasto_destino seguros (NO concepto "este")', () => {
  const r = detectarIntencion('Gastos de este año 2026 correduria', HOY)
  assert.ok(r, 'esperaba intención')
  assert.equal(r!.tipo, 'gasto_destino')
  if (r && r.tipo === 'gasto_destino') {
    assert.deepEqual(r.destinos, ['seguros'])
    assert.equal(r.signo, 'gasto')
    assert.equal(r.anio, 2026)
    assert.equal(r.mes, undefined)
  }
})

test('"correduría" con tilde también → gasto_destino seguros', () => {
  const r = detectarIntencion('¿cuánto he gastado en la correduría este año?', HOY)
  assert.ok(r && r.tipo === 'gasto_destino')
  if (r && r.tipo === 'gasto_destino') assert.deepEqual(r.destinos, ['seguros'])
})

test('"ingresos de la correduría en 2025" → gasto_destino seguros, ingreso, año 2025', () => {
  const r = detectarIntencion('cuánto ingresó la correduria en 2025', HOY)
  assert.ok(r && r.tipo === 'gasto_destino')
  if (r && r.tipo === 'gasto_destino') {
    assert.deepEqual(r.destinos, ['seguros'])
    assert.equal(r.signo, 'ingreso')
    assert.equal(r.anio, 2025)
  }
})

test('"gastos de los pisos en junio" → gasto_destino turistico ∩ junio', () => {
  const r = detectarIntencion('gastos de los pisos en junio', HOY)
  assert.ok(r && r.tipo === 'gasto_destino')
  if (r && r.tipo === 'gasto_destino') {
    assert.ok(r.destinos.includes('turistico_pisos'))
    assert.equal(r.mes, 6)
    assert.equal(r.anio, 2026)
  }
})

// ── P&L por piso → ingreso ← `incomes`, gasto ← `gastos` (SIVRA), resultado = ingreso − gasto.
//    El banco agrega los pisos en turistico_pisos, así que NO puede separar por piso. ──
test('"Ingresos duplex 2026" → piso modo ingreso prop_duplex_center (de incomes, NO del banco)', () => {
  // Antes daba gasto_destino turistico_duplex, pero en INGRESO el banco no separa pisos (daba ~0).
  // La fuente real por piso es `incomes` (lo que pinta el dashboard) → intent piso.
  const r = detectarIntencion('Ingresos duplex 2026', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') {
    assert.equal(r.modo, 'ingreso')
    assert.equal(r.propertyId, 'prop_duplex_center')
    assert.equal(r.anio, 2026)
    assert.equal(r.mes, undefined)
  }
})

test('"cuánto ingresó el dúplex" (con tilde) → piso modo ingreso prop_duplex_center', () => {
  const r = detectarIntencion('¿cuánto ingresó el dúplex este año?', HOY)
  assert.ok(r && r.tipo === 'piso')
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_duplex_center') }
})

test('"ingresos de Luxury" → piso modo ingreso prop_luxury_busto', () => {
  const r = detectarIntencion('cuánto ingresó Luxury este año', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_luxury_busto') }
})

test('"ingresos de Socorro/Sevillana" → piso modo ingreso prop_house_sevillana', () => {
  const r = detectarIntencion('ingresos de la casa sevillana en 2026', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_house_sevillana') }
})

test('"ingresos de Busto Reform en junio" → piso modo ingreso prop_busto_reform ∩ mes', () => {
  const r = detectarIntencion('cuánto ingresó busto reform en junio', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') {
    assert.equal(r.modo, 'ingreso')
    assert.equal(r.propertyId, 'prop_busto_reform')
    assert.equal(r.mes, 6)
  }
})

test('"ingresos del apartamento socorro y número de reservas" → piso ingreso (NO concepto "reservas")', () => {
  // Regresión: "de reservas" se colaba como concepto genérico antes del check de piso → "No encuentro
  // cargos de reservas". Ahora el piso se detecta primero y "reservas/número" son stop-words.
  const r = detectarIntencion('Dime ingresos del apartamento socorro y número de reservas.', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_house_sevillana') }
})

test('"¿Cuántas reservas lleva Luxury?" → piso modo INGRESO (reservas = lado ingreso, no gasto)', () => {
  // Regresión: "reservas" sin la palabra "ingresos" caía a signo=gasto → contestaba el gasto del piso.
  // "reserva(s)"/"noche(s)" son métricas del lado ingreso (las sirve el handler modo ingreso).
  const r = detectarIntencion('¿Cuántas reservas lleva Luxury?', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_luxury_busto') }
})

// ── GASTO por piso → tabla `gastos` (SIVRA, = las cards del dashboard), para los 4 pisos por igual ──
test('"gastos del dúplex" → piso modo gasto prop_duplex_center (SIVRA gastos, = dashboard)', () => {
  // Cambio deliberado: el gasto por piso se lee de la tabla `gastos` (misma card del dashboard) para
  // los 4 pisos, no del banco. Antes el Dúplex iba por banco (turistico_duplex); ahora es consistente.
  const r = detectarIntencion('gastos del dúplex este año', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') {
    assert.equal(r.modo, 'gasto')
    assert.equal(r.propertyId, 'prop_duplex_center')
  }
})

test('"Gastos socorro este mes" → piso modo gasto prop_house_sevillana ∩ mes', () => {
  // Bug real: "Gastos socorro este mes" daba "No veo gasto en socorro" (gasto por piso no existía).
  const r = detectarIntencion('Gastos socorro este mes?', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') {
    assert.equal(r.modo, 'gasto')
    assert.equal(r.propertyId, 'prop_house_sevillana')
    assert.equal(r.mes, HOY.mes)
  }
})

test('"gastos de Luxury en junio" → piso modo gasto prop_luxury_busto ∩ mes', () => {
  const r = detectarIntencion('cuánto gastó Luxury en junio', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'gasto'); assert.equal(r.propertyId, 'prop_luxury_busto'); assert.equal(r.mes, 6) }
})

// ── RESULTADO por piso → ingreso − gasto (getResumenSivra / consultas por mes) ──
test('"resultado del dúplex" → piso modo resultado prop_duplex_center', () => {
  const r = detectarIntencion('¿cuál es el resultado del dúplex este año?', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'resultado'); assert.equal(r.propertyId, 'prop_duplex_center') }
})

test('"cómo va Socorro" → piso modo resultado prop_house_sevillana', () => {
  const r = detectarIntencion('¿cómo va socorro?', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'resultado'); assert.equal(r.propertyId, 'prop_house_sevillana') }
})

test('"beneficio de Busto Reform" → piso modo resultado prop_busto_reform', () => {
  const r = detectarIntencion('beneficio de busto reform en 2026', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'resultado'); assert.equal(r.propertyId, 'prop_busto_reform') }
})

// ── Rentabilidad AGREGADA de todos los pisos (bug del 👎: contestaba solo el gasto agregado) ──
test('"¿todos los pisos son rentables este mes?" → pisos_rentabilidad ∩ mes actual', () => {
  const r = detectarIntencion('¿Todos los pisos turísticos son rentables este mes?', HOY)
  assert.ok(r && r.tipo === 'pisos_rentabilidad', `esperaba pisos_rentabilidad, fue ${r?.tipo}`)
  if (r && r.tipo === 'pisos_rentabilidad') { assert.equal(r.mes, HOY.mes); assert.equal(r.anio, 2026) }
})

test('"resultado de los pisos 2026" → pisos_rentabilidad anual', () => {
  const r = detectarIntencion('resultado de los pisos en 2026', HOY)
  assert.ok(r && r.tipo === 'pisos_rentabilidad', `esperaba pisos_rentabilidad, fue ${r?.tipo}`)
  if (r && r.tipo === 'pisos_rentabilidad') { assert.equal(r.mes, undefined); assert.equal(r.anio, 2026) }
})

test('"resultado del dúplex" NO cae en pisos_rentabilidad (es UN piso concreto)', () => {
  const r = detectarIntencion('resultado del dúplex este año', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'resultado'); assert.equal(r.propertyId, 'prop_duplex_center') }
})

test('"ingresos de los pisos" (sin rentabilidad) sigue siendo gasto_destino, no pisos_rentabilidad', () => {
  const r = detectarIntencion('ingresos de los pisos este año', HOY)
  assert.ok(r && r.tipo === 'gasto_destino', `esperaba gasto_destino, fue ${r?.tipo}`)
})

test('intencionDesdeJSON: pisos_rentabilidad con mes', () => {
  const r = intencionDesdeJSON({ tipo: 'pisos_rentabilidad', anio: 2026, mes: 7 }, HOY)
  assert.ok(r && r.tipo === 'pisos_rentabilidad')
  if (r && r.tipo === 'pisos_rentabilidad') { assert.equal(r.anio, 2026); assert.equal(r.mes, 7) }
})

// ── RESULTADO de un negocio de caja bancaria (correduría) → ingreso − gasto por `destino` ──
test('"¿es rentable la correduría?" → negocio_resultado [seguros] (no gasto_destino solo-gasto)', () => {
  // Regresión: antes caía en gasto_destino gasto [seguros] → contestaba solo el gasto (mismo fallo que el 👎).
  const r = detectarIntencion('¿Es rentable la correduría?', HOY)
  assert.ok(r && r.tipo === 'negocio_resultado', `esperaba negocio_resultado, fue ${r?.tipo}`)
  if (r && r.tipo === 'negocio_resultado') { assert.deepEqual(r.destinos, ['seguros']); assert.equal(r.anio, 2026) }
})

test('"resultado de la correduría en junio" → negocio_resultado [seguros] ∩ mes', () => {
  const r = detectarIntencion('resultado de la correduría en junio', HOY)
  assert.ok(r && r.tipo === 'negocio_resultado', `esperaba negocio_resultado, fue ${r?.tipo}`)
  if (r && r.tipo === 'negocio_resultado') { assert.deepEqual(r.destinos, ['seguros']); assert.equal(r.mes, 6) }
})

test('"gastos de la correduría" (sin rentabilidad) sigue siendo gasto_destino, no negocio_resultado', () => {
  const r = detectarIntencion('gastos de la correduría este año', HOY)
  assert.ok(r && r.tipo === 'gasto_destino', `esperaba gasto_destino, fue ${r?.tipo}`)
})

test('"resultado de los pisos" NO cae en negocio_resultado (turistico_* → pisos_rentabilidad)', () => {
  const r = detectarIntencion('resultado de los pisos 2026', HOY)
  assert.ok(r && r.tipo === 'pisos_rentabilidad', `esperaba pisos_rentabilidad, fue ${r?.tipo}`)
})

test('intencionDesdeJSON: negocio_resultado excluye destinos turistico_*', () => {
  const ok = intencionDesdeJSON({ tipo: 'negocio_resultado', destinos: ['seguros'], anio: 2026 }, HOY)
  assert.ok(ok && ok.tipo === 'negocio_resultado')
  const bad = intencionDesdeJSON({ tipo: 'negocio_resultado', destinos: ['turistico_pisos'], anio: 2026 }, HOY)
  assert.equal(bad, null, 'un destino turistico_* debe rechazarse (va por pisos_rentabilidad)')
})

test('"cuánto ha facturado el dúplex" → piso modo INGRESO (facturado = revenue, no gasto)', () => {
  // Bug real: "facturado" no lo pillaba el detector de signo (solo ingres/cobr) → caía a gasto.
  const r = detectarIntencion('cuánto ha facturado el dúplex', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_duplex_center') }
})

test('"facturación de Luxury en junio" → piso modo ingreso (pasa la guarda de dinero por facturaci)', () => {
  const r = detectarIntencion('facturación de luxury en junio', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_luxury_busto'); assert.equal(r.mes, 6) }
})

test('"facturas pendientes" sigue siendo facturas_pendientes (no lo pilla facturaci/facturad)', () => {
  const r = detectarIntencion('¿qué facturas tengo pendientes?', HOY)
  assert.ok(r && r.tipo === 'facturas_pendientes', `esperaba facturas_pendientes, fue ${r?.tipo}`)
})

test('"comunidad del dúplex" NO cae al piso: sigue siendo concepto ∩ turistico_duplex', () => {
  // Guarda de prioridad: aunque "dúplex" es un piso, el concepto "comunidad" gana para COMPONER.
  const r = detectarIntencion('gastos de comunidad del dúplex este año', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.ok(r.terminos.includes('comunidad'))
    assert.deepEqual(r.destinos, ['turistico_duplex'])
  }
})

// ── Regresiones del ARNÉS DE REPLAY (preguntas reales de contable_log, 12/07/2026) ──
test('"La correduria que lleva este año?" → gasto_destino seguros (la guarda pilla "lleva", no solo "llevo")', () => {
  const r = detectarIntencion('La correduria que lleva este año?', HOY)
  assert.ok(r && r.tipo === 'gasto_destino', `esperaba gasto_destino, fue ${r?.tipo}`)
  if (r && r.tipo === 'gasto_destino') assert.deepEqual(r.destinos, ['seguros'])
})

test('"mirame los cargos del mes pasado del club mercantil" → subcategoria club (cargo = gasto)', () => {
  const r = detectarIntencion('mirame los cargos del mes pasado del club mercantil', HOY)
  assert.ok(r && r.tipo === 'subcategoria', `esperaba subcategoria, fue ${r?.tipo}`)
  if (r && r.tipo === 'subcategoria') { assert.equal(r.subcategoria, 'club'); assert.equal(r.mes, 6) }
})

test('"Que dinero llevo ganado con la correduria?" → gasto_destino seguros INGRESO (ganado = ingreso)', () => {
  const r = detectarIntencion('Que dinero llevo ganado con la correduria?', HOY)
  assert.ok(r && r.tipo === 'gasto_destino', `esperaba gasto_destino, fue ${r?.tipo}`)
  if (r && r.tipo === 'gasto_destino') { assert.deepEqual(r.destinos, ['seguros']); assert.equal(r.signo, 'ingreso') }
})

test('"dime cuanto lleva factura socorro" → piso INGRESO (factura de un piso = facturación)', () => {
  const r = detectarIntencion('dime cuanto lleva factura socorro', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'ingreso'); assert.equal(r.propertyId, 'prop_house_sevillana') }
})

// ── Composición concepto ∩ NEGOCIO: "comunidad del dúplex" ≠ total del dúplex ni comunidad global ──
test('"comunidad del dúplex este año" → concepto comunidad ∩ turistico_duplex (NO total del Dúplex)', () => {
  // Regresión del incidente: "gastos de comunidad del apartamento duplex" daba el TOTAL del Dúplex
  // (1.704,86€) porque gasto_destino cortaba antes que el concepto. Ahora compone concepto ∩ negocio.
  const r = detectarIntencion('gastos de comunidad del apartamento duplex este año', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.ok(r.terminos.includes('comunidad'))
    assert.deepEqual(r.destinos, ['turistico_duplex'])
    assert.equal(r.destinoEtiqueta, 'del Dúplex')
    assert.equal(r.anio, 2026)
  }
})

test('"comunidad" sin negocio → concepto comunidad SIN destinos (no se acota)', () => {
  const r = detectarIntencion('cuánto llevo en comunidad este año', HOY)
  assert.ok(r && r.tipo === 'concepto')
  if (r && r.tipo === 'concepto') {
    assert.ok(r.terminos.includes('comunidad'))
    assert.equal(r.destinos, undefined)
    assert.equal(r.destinoEtiqueta, undefined)
  }
})

test('"luz de los pisos" → concepto luz ∩ turistico_* (compone concepto genérico-curado con negocio)', () => {
  const r = detectarIntencion('cuánto llevo en luz de los pisos este año', HOY)
  assert.ok(r && r.tipo === 'concepto', `esperaba concepto, fue ${r?.tipo}`)
  if (r && r.tipo === 'concepto') {
    assert.equal(r.etiqueta, 'luz')
    assert.ok(r.destinos?.includes('turistico_pisos'))
    assert.equal(r.destinoEtiqueta, 'de los pisos')
  }
})

test('"dúplex" SOLO (sin concepto ni subcategoría) → piso modo gasto (SIVRA gastos, = dashboard)', () => {
  // Antes iba a gasto_destino turistico_duplex (banco); ahora el gasto por piso se lee de la tabla
  // `gastos` (misma card del dashboard) para los 4 pisos por igual → piso modo gasto.
  const r = detectarIntencion('gastos del dúplex este año', HOY)
  assert.ok(r && r.tipo === 'piso', `esperaba piso, fue ${r?.tipo}`)
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'gasto'); assert.equal(r.propertyId, 'prop_duplex_center') }
})

test('intencionDesdeJSON: concepto acotado por negocio ("comunidad del dúplex")', () => {
  const r = intencionDesdeJSON({ tipo: 'concepto', terminos: ['comunidad'], etiqueta: 'comunidad', destinos: ['turistico_duplex'], destinoEtiqueta: 'del Dúplex', anio: 2026 }, HOY)
  assert.ok(r && r.tipo === 'concepto')
  if (r && r.tipo === 'concepto') {
    assert.deepEqual(r.terminos, ['comunidad'])
    assert.deepEqual(r.destinos, ['turistico_duplex'])
    assert.equal(r.destinoEtiqueta, 'del Dúplex')
  }
})

test('intencionDesdeJSON: concepto con destino inválido descarta el destino (concepto sí, sin acotar)', () => {
  const r = intencionDesdeJSON({ tipo: 'concepto', terminos: ['comunidad'], destinos: ['inventado'] }, HOY)
  assert.ok(r && r.tipo === 'concepto')
  if (r && r.tipo === 'concepto') { assert.equal(r.destinos, undefined); assert.equal(r.destinoEtiqueta, undefined) }
})

test('"gastos de este año 2026" (sin segmento) → total anual, NO concepto "este"', () => {
  const r = detectarIntencion('gastos de este año 2026', HOY)
  assert.ok(r && r.tipo === 'movimientos_anio', `esperaba movimientos_anio, fue ${r?.tipo}`)
  if (r && r.tipo === 'movimientos_anio') assert.equal(r.anio, 2026)
})

test('facturas pendientes', () => {
  const r = detectarIntencion('¿Qué facturas de proveedor tengo pendientes?', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'facturas_pendientes')
})

test('ingresos del año', () => {
  const r = detectarIntencion('cuánto he ingresado este año', HOY)
  assert.ok(r && r.tipo === 'movimientos_anio')
  if (r && r.tipo === 'movimientos_anio') assert.equal(r.signo, 'ingreso')
})

test('"en qué tramo fiscal estamos" → tramo_fiscal (año actual)', () => {
  const r = detectarIntencion('¿En qué tramo fiscal estamos ahora mismo?', HOY)
  assert.ok(r && r.tipo === 'tramo_fiscal')
  if (r && r.tipo === 'tramo_fiscal') assert.equal(r.anio, 2026)
})

test('"mi tipo marginal de IRPF" → tramo_fiscal', () => {
  const r = detectarIntencion('cuál es mi tipo marginal de IRPF', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'tramo_fiscal')
})

test('ORDEN sobre el tramo NO se secuestra ("cámbiame el tramo") → null', () => {
  assert.equal(detectarIntencion('cámbiame el tramo a mano', HOY), null)
})

test('ORDEN de acción NO se secuestra (clasifica endesa) → null', () => {
  const r = detectarIntencion('Clasifica el recibo de Endesa como pisos', HOY)
  assert.equal(r, null)
})

test('saludo suelto → null (cae al LLM)', () => {
  assert.equal(detectarIntencion('hola, ¿qué tal?', HOY), null)
})

test('pregunta libre no estructurada → null', () => {
  assert.equal(detectarIntencion('¿me conviene amortizar el sofá?', HOY), null)
})

test('"¿cuánto en supermercado en junio?" → subcategoria supermercado ∩ junio (no total del mes)', () => {
  const r = detectarIntencion('¿Cuánto se ha gastado en supermercado en junio?', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'subcategoria')
  if (r && r.tipo === 'subcategoria') {
    assert.equal(r.subcategoria, 'supermercado')
    assert.equal(r.mes, 6)
    assert.equal(r.anio, 2026)
  }
})

test('"cuánto gasto en bares" (sin mes) → subcategoria restaurante_bar, anual', () => {
  const r = detectarIntencion('cuánto gasto en bares', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'subcategoria')
  if (r && r.tipo === 'subcategoria') {
    assert.equal(r.subcategoria, 'restaurante_bar')
    assert.equal(r.mes, undefined)
  }
})

test('"cuánto gasté en junio" (sin categoría) → sigue siendo movimientos_mes', () => {
  const r = detectarIntencion('cuánto gasté en junio', HOY)
  assert.ok(r)
  assert.equal(r!.tipo, 'movimientos_mes')
  if (r && r.tipo === 'movimientos_mes') assert.equal(r.mes, 6)
})

test("'bar' no pica en 'Barcelona' → no subcategoria por esa palabra", () => {
  const r = detectarIntencion('cuánto gasté en el hotel de Barcelona', HOY)
  // 'barcelona' NO debe activar restaurante_bar; cae a concepto genérico u otro, nunca subcategoria bar
  assert.ok(!r || r.tipo !== 'subcategoria' || (r as { subcategoria?: string }).subcategoria !== 'restaurante_bar')
})

// ── Entidad residual: NO contestar el total del año a ciegas cuando hay un filtro sin resolver ──
test('"Ingresos busto 2026" (entidad no mapeada) → null, NO total del año', () => {
  const r = detectarIntencion('Ingresos busto 2026', HOY)
  assert.equal(r, null) // 'busto' es un filtro sin resolver → se deriva a la IA, no se contesta el total
})

test('entidadesResiduales detecta la palabra sin resolver', () => {
  assert.deepEqual(entidadesResiduales('Ingresos busto 2026'), ['busto'])
})

test('"cuánto he gastado este año" NO tiene entidad residual → sigue siendo total anual', () => {
  assert.deepEqual(entidadesResiduales('cuánto he gastado este año'), [])
  const r = detectarIntencion('cuánto he gastado este año', HOY)
  assert.ok(r && r.tipo === 'movimientos_anio')
})

test('"cuánto gasté en junio" NO tiene entidad residual → sigue siendo total del mes', () => {
  assert.deepEqual(entidadesResiduales('cuánto gasté en junio'), [])
  const r = detectarIntencion('cuánto gasté en junio', HOY)
  assert.ok(r && r.tipo === 'movimientos_mes')
})

// ── Sinónimos APRENDIDOS (extras): una palabra ya resuelta se vuelve determinista ──
test('extras aprendidos: "ingresos busto 2026" → gasto_destino turistico_pisos', () => {
  const extras = [{ etiqueta: 'los pisos de Busto', destinos: ['turistico_pisos'], terminos: ['busto'] }]
  const r = detectarIntencion('Ingresos busto 2026', HOY, extras)
  assert.ok(r && r.tipo === 'gasto_destino', `esperaba gasto_destino, fue ${r?.tipo}`)
  if (r && r.tipo === 'gasto_destino') {
    assert.deepEqual(r.destinos, ['turistico_pisos'])
    assert.equal(r.signo, 'ingreso')
    assert.equal(r.anio, 2026)
  }
})

// ── intencionDesdeJSON: valida/normaliza la salida de la IA a una Intencion segura ──
test('intencionDesdeJSON: gasto_destino válido', () => {
  const r = intencionDesdeJSON({ tipo: 'gasto_destino', signo: 'ingreso', destinos: ['turistico_duplex'], etiqueta: 'el Dúplex', anio: 2026 }, HOY)
  assert.ok(r && r.tipo === 'gasto_destino')
  if (r && r.tipo === 'gasto_destino') { assert.deepEqual(r.destinos, ['turistico_duplex']); assert.equal(r.anio, 2026) }
})

test('intencionDesdeJSON: destino inválido se descarta → null', () => {
  assert.equal(intencionDesdeJSON({ tipo: 'gasto_destino', destinos: ['inventado'] }, HOY), null)
})

test('intencionDesdeJSON: piso con propertyId+modo conocidos', () => {
  const r = intencionDesdeJSON({ tipo: 'piso', modo: 'gasto', propertyId: 'prop_luxury_busto', etiqueta: 'Luxury', anio: 2026, mes: 6 }, HOY)
  assert.ok(r && r.tipo === 'piso')
  if (r && r.tipo === 'piso') { assert.equal(r.modo, 'gasto'); assert.equal(r.propertyId, 'prop_luxury_busto'); assert.equal(r.mes, 6) }
})

test('intencionDesdeJSON: piso con modo inválido cae a resultado', () => {
  const r = intencionDesdeJSON({ tipo: 'piso', modo: 'cualquiera', propertyId: 'prop_duplex_center' }, HOY)
  assert.ok(r && r.tipo === 'piso')
  if (r && r.tipo === 'piso') assert.equal(r.modo, 'resultado')
})

test('intencionDesdeJSON: piso con propertyId inventado → null', () => {
  assert.equal(intencionDesdeJSON({ tipo: 'piso', modo: 'ingreso', propertyId: 'prop_inventado' }, HOY), null)
})

test('intencionDesdeJSON: {"tipo":"ninguno"} → null (cae al LLM libre)', () => {
  assert.equal(intencionDesdeJSON({ tipo: 'ninguno' }, HOY), null)
})

test('intencionDesdeJSON: movimientos_anio sin año usa el actual', () => {
  const r = intencionDesdeJSON({ tipo: 'movimientos_anio', signo: 'gasto' }, HOY)
  assert.ok(r && r.tipo === 'movimientos_anio')
  if (r && r.tipo === 'movimientos_anio') assert.equal(r.anio, 2026)
})

// ── Verificador (lógica pura: confirma / corrige / rechaza; fail-open) ──
const PISO_ING = { tipo: 'piso', modo: 'ingreso', propertyId: 'prop_duplex_center', etiqueta: 'el Dúplex', anio: 2026 } as const

test('interpretarVerificacion: {ok:true} → confirma la original', () => {
  const r = interpretarVerificacion({ ok: true }, PISO_ING, HOY)
  assert.equal(r.accion, 'confirma')
  assert.equal(r.intn, PISO_ING)
})

test('interpretarVerificacion: sin JSON usable (fail-open) → confirma la original', () => {
  assert.equal(interpretarVerificacion(null, PISO_ING, HOY).intn, PISO_ING)
  assert.equal(interpretarVerificacion({}, PISO_ING, HOY).accion, 'confirma') // sin `ok` = confía
})

test('interpretarVerificacion: {ok:false, correccion válida} → corrige', () => {
  const r = interpretarVerificacion(
    { ok: false, correccion: { tipo: 'piso', modo: 'gasto', propertyId: 'prop_house_sevillana' } }, PISO_ING, HOY)
  assert.equal(r.accion, 'corrige')
  assert.ok(r.intn && r.intn.tipo === 'piso')
  if (r.intn && r.intn.tipo === 'piso') { assert.equal(r.intn.modo, 'gasto'); assert.equal(r.intn.propertyId, 'prop_house_sevillana') }
})

test('interpretarVerificacion: {ok:false} sin corrección → rechaza (→ null, deriva al LLM libre)', () => {
  const r = interpretarVerificacion({ ok: false }, PISO_ING, HOY)
  assert.equal(r.accion, 'rechaza')
  assert.equal(r.intn, null)
})

test('interpretarVerificacion: {ok:false, correccion inválida} → rechaza (propertyId inventado)', () => {
  const r = interpretarVerificacion({ ok: false, correccion: { tipo: 'piso', modo: 'gasto', propertyId: 'prop_x' } }, PISO_ING, HOY)
  assert.equal(r.intn, null)
})

test('resumenIntencion: piso legible', () => {
  assert.match(resumenIntencion(PISO_ING), /ingreso del piso prop_duplex_center/)
})
