// apps/plataforma/lib/contable/intencion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarIntencion, entidadesResiduales, intencionDesdeJSON } from './intencion.ts'

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

test('"Ingresos duplex 2026" → gasto_destino turistico_duplex (NO total anual)', () => {
  // Regresión: sin la fila del Dúplex en DESTINO_SINONIMOS, 'duplex' no casaba ningún segmento y la
  // pregunta caía en movimientos_anio → devolvía TODOS los ingresos del año (cifra imposible para un piso).
  const r = detectarIntencion('Ingresos duplex 2026', HOY)
  assert.ok(r && r.tipo === 'gasto_destino', `esperaba gasto_destino, fue ${r?.tipo}`)
  if (r && r.tipo === 'gasto_destino') {
    assert.deepEqual(r.destinos, ['turistico_duplex'])
    assert.equal(r.signo, 'ingreso')
    assert.equal(r.anio, 2026)
    assert.equal(r.mes, undefined)
  }
})

test('"cuánto ingresó el dúplex" (con tilde) → gasto_destino turistico_duplex', () => {
  const r = detectarIntencion('¿cuánto ingresó el dúplex este año?', HOY)
  assert.ok(r && r.tipo === 'gasto_destino')
  if (r && r.tipo === 'gasto_destino') {
    assert.deepEqual(r.destinos, ['turistico_duplex'])
    assert.equal(r.signo, 'ingreso')
  }
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

test('"dúplex" SOLO (sin concepto ni subcategoría) → sigue siendo gasto_destino total', () => {
  const r = detectarIntencion('gastos del dúplex este año', HOY)
  assert.ok(r && r.tipo === 'gasto_destino', `esperaba gasto_destino, fue ${r?.tipo}`)
  if (r && r.tipo === 'gasto_destino') assert.deepEqual(r.destinos, ['turistico_duplex'])
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

test('intencionDesdeJSON: {"tipo":"ninguno"} → null (cae al LLM libre)', () => {
  assert.equal(intencionDesdeJSON({ tipo: 'ninguno' }, HOY), null)
})

test('intencionDesdeJSON: movimientos_anio sin año usa el actual', () => {
  const r = intencionDesdeJSON({ tipo: 'movimientos_anio', signo: 'gasto' }, HOY)
  assert.ok(r && r.tipo === 'movimientos_anio')
  if (r && r.tipo === 'movimientos_anio') assert.equal(r.anio, 2026)
})
