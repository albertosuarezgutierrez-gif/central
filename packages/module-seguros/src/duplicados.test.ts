import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveParNoDuplicado,
  grupoResueltoNoDuplicado,
  gruposVivosDuplicados,
  numeroPolizaComparable,
  limpiarMotivoNoDuplicado,
  origenFicha,
  paresNoDuplicado,
  polizasDuplicadas,
  type PolizaParaDuplicados,
  type PolizaParaVigiaDuplicadas,
} from './duplicados.ts'

// ── «No es duplicado» (04/10/2026) ──────────────────────────────────────────
// Allianz 32742526 y 35374290: dos fichas vivas con el mismo número y la misma
// compañía, de clientes distintos, que son pólizas distintas de verdad. Sin una
// marca, salían para siempre en la pantalla y en el vigía.

test('claveParNoDuplicado: el par es el mismo en los dos sentidos', () => {
  assert.equal(claveParNoDuplicado('b', 'a'), 'a|b')
  assert.equal(claveParNoDuplicado('a', 'b'), 'a|b')
  assert.equal(claveParNoDuplicado('a', 'a'), null)
  assert.equal(claveParNoDuplicado(null, 'a'), null)
  assert.equal(claveParNoDuplicado('', 'a'), null)
})

test('grupoResueltoNoDuplicado: un trío con UN par marcado sigue abierto', () => {
  const marcas = new Set([claveParNoDuplicado('a', 'b')!])
  assert.equal(grupoResueltoNoDuplicado(['a', 'b'], marcas), true)
  assert.equal(grupoResueltoNoDuplicado(['a', 'b', 'c'], marcas), false)
  const todas = new Set(['a|b', 'a|c', 'b|c'])
  assert.equal(grupoResueltoNoDuplicado(['c', 'a', 'b'], todas), true)
  assert.equal(grupoResueltoNoDuplicado(['a', 'b'], null), false)
  assert.equal(grupoResueltoNoDuplicado(['a', 'b'], new Set()), false)
})

const ficha = (id: string, numero: string | null, o: Partial<PolizaParaDuplicados> = {}): PolizaParaDuplicados => ({
  id, correduriaId: 'cor-1', clienteId: `cli-${id}`, numeroPoliza: numero, codigoEntidadDgs: 'C0109',
  aseguradora: 'Allianz', origen: 'cima', estado: 'activa', clienteActivo: true, ...o,
})

test('🚨 pantalla: el par marcado «no duplicado» deja de salir; el resto sigue', () => {
  const polizas = [ficha('p1', '32742526'), ficha('p2', '032742526'), ficha('p3', '35374290'), ficha('p4', '35374290')]
  assert.equal(polizasDuplicadas(polizas).length, 2)
  const marcas = new Set([claveParNoDuplicado('p2', 'p1')!])
  const g = polizasDuplicadas(polizas, marcas)
  assert.equal(g.length, 1)
  assert.deepEqual(g[0].polizas.map((p) => p.id), ['p3', 'p4'])
})

test('pantalla: sin marcas (o marcas sin leer) se comporta como siempre', () => {
  const polizas = [ficha('p1', '32742526'), ficha('p2', '32742526')]
  assert.equal(polizasDuplicadas(polizas).length, 1)
  assert.equal(polizasDuplicadas(polizas, null).length, 1)
})

// ── UN criterio para pantalla y vigía (04/10/2026) ──────────────────────────
// La pantalla daba 0 grupos y el vigía 8: la pantalla solo miraba vivas de
// clientes activos y sin cancelar, y no quitaba los ceros a la izquierda.

test('🚨 pantalla = vigía: mismos grupos sobre las mismas fichas (volcado, cancelada, cliente inactivo, ceros, comodín)', () => {
  const fichas = [
    ficha('a1', '0035374290', { origen: 'volcado' }), ficha('a2', '35-374-290', { estado: 'cancelada' }),
    ficha('b1', '32742526', { clienteActivo: false }), ficha('b2', '32742526', { origen: 'emitida' }),
    ficha('c1', 'pendiente', { codigoEntidadDgs: 'C0058' }), ficha('c2', 'PENDIENTE', { codigoEntidadDgs: 'C0058' }),
    ficha('d1', '77777123', { codigoEntidadDgs: null }), ficha('d2', '77777123', { codigoEntidadDgs: null }),
    ficha('e1', '99999123', { codigoEntidadDgs: 'C0613' }), ficha('e2', '99999123', { codigoEntidadDgs: 'C0058' }),
  ]
  const pantalla = polizasDuplicadas(fichas)
  const vigia = gruposVivosDuplicados(fichas)
  assert.deepEqual(
    pantalla.map((g) => ({ entidad: g.compania, ref: g.polizas[0].id, fichas: g.polizas.length })).sort((x, y) => x.ref.localeCompare(y.ref)),
    vigia.slice().sort((x, y) => x.ref.localeCompare(y.ref)),
  )
  assert.deepEqual(vigia.map((g) => g.ref).sort(), ['a1', 'b1'])
  const marcas = new Set([claveParNoDuplicado('a1', 'a2')!])
  assert.deepEqual(polizasDuplicadas(fichas, marcas).map((g) => g.polizas[0].id), ['b1'])
  assert.deepEqual(gruposVivosDuplicados(fichas, marcas).map((g) => g.ref), ['b1'])
})

test('pantalla: cada ficha dice su origen; «sin casar» = emitida + CIMA, y va primero', () => {
  const g = polizasDuplicadas([
    ficha('a1', '11111222', { origen: 'volcado' }), ficha('a2', '11111222'),
    ficha('z1', '35374290', { origen: 'emitida' }), ficha('z2', '35374290'),
  ])
  assert.equal(g[0].numero, '35374290')
  assert.equal(g[0].emitidaYCima, true)
  assert.deepEqual(g[0].polizas.map((p) => p.origen), ['emitida', 'cima'])
  assert.equal(g[1].emitidaYCima, false, 'volcado + CIMA no es «sin casar»')
  assert.deepEqual(g[1].polizas.map((p) => [p.origen, p.confirmadaCima]), [['volcado', false], ['cima', true]])
})

test('pantalla: el nombre de la compañía sale de una ficha que lo tenga (no «(legacy)»)', () => {
  const g = polizasDuplicadas([ficha('a', '35374290', { aseguradora: '(legacy)' }), ficha('b', '35374290', { aseguradora: 'Allianz Seguros' })])
  assert.equal(g[0].aseguradora, 'Allianz Seguros')
  assert.equal(polizasDuplicadas([ficha('a', '35374290', { aseguradora: null }), ficha('b', '35374290', { aseguradora: '(legacy)' })])[0].aseguradora, null)
})

test('origenFicha: CIMA manda; luego volcado; luego el enum', () => {
  const o = (x: Partial<{ eiacXmlHash: string | null; idPolizaEntidad: string | null; importRef: string | null; origen: string | null }>) =>
    origenFicha({ eiacXmlHash: null, idPolizaEntidad: null, importRef: null, origen: null, ...x })
  assert.equal(o({ eiacXmlHash: 'h', importRef: 'v1' }), 'cima')
  assert.equal(o({ idPolizaEntidad: '0005919201076', origen: 'emitida_codeoscopic' }), 'cima')
  assert.equal(o({ importRef: 'v1' }), 'volcado')
  assert.equal(o({ importRef: '  ', origen: 'emitida_codeoscopic' }), 'emitida')
  assert.equal(o({ origen: 'declarada_usuario' }), 'declarada')
  assert.equal(o({ origen: 'gestionada_correduria' }), 'manual')
  assert.equal(o({}), 'manual')
})

// ── «No es duplicado»: qué se marca ─────────────────────────────────────────

test('🚨 paresNoDuplicado: un trío marca sus TRES pares, ordenados (a < b, el CHECK de la tabla)', () => {
  const fichas = [ficha('c', '35374290'), ficha('a', '0035374290'), ficha('b', '35.374.290')]
  const r = paresNoDuplicado(['c', 'a', 'b', 'a'], fichas)
  assert.deepEqual(r, { ok: true, correduriaId: 'cor-1', pares: [['a', 'b'], ['a', 'c'], ['b', 'c']] })
  // Y con esas marcas el grupo deja de salir en los dos sitios.
  const marcas = new Set(r.ok ? r.pares.map(([x, y]) => claveParNoDuplicado(x, y)!) : [])
  assert.deepEqual(polizasDuplicadas(fichas, marcas), [])
  assert.deepEqual(gruposVivosDuplicados(fichas, marcas), [])
})

test('🚨 paresNoDuplicado: no se puede marcar lo que la pantalla no enseñaría', () => {
  assert.deepEqual(paresNoDuplicado(['a'], [ficha('a', '35374290')]), { ok: false, motivo: 'pocas_polizas' })
  assert.deepEqual(paresNoDuplicado(['a', 'a'], [ficha('a', '35374290')]), { ok: false, motivo: 'pocas_polizas' })
  assert.deepEqual(paresNoDuplicado(['a', 'x'], [ficha('a', '35374290')]), { ok: false, motivo: 'poliza_desconocida' })
  assert.deepEqual(paresNoDuplicado(['a', 'b'], [ficha('a', '35374290'), ficha('b', '35374291')]), { ok: false, motivo: 'no_es_un_grupo' })
  assert.deepEqual(paresNoDuplicado(['a', 'b'], [ficha('a', '35374290'), ficha('b', '35374290', { codigoEntidadDgs: 'C0058' })]), { ok: false, motivo: 'no_es_un_grupo' })
  assert.deepEqual(paresNoDuplicado(['a', 'b'], [ficha('a', '35374290'), ficha('b', '35374290', { correduriaId: 'cor-2' })]), { ok: false, motivo: 'no_es_un_grupo' })
  assert.deepEqual(paresNoDuplicado(['a', 'b'], [ficha('a', 'pendiente'), ficha('b', 'pendiente')]), { ok: false, motivo: 'no_es_un_grupo' })
  const muchas = Array.from({ length: 21 }, (_, i) => ficha(`p${String(i).padStart(2, '0')}`, '35374290'))
  assert.deepEqual(paresNoDuplicado(muchas.map((f) => f.id), muchas), { ok: false, motivo: 'demasiadas_polizas' })
})

test('limpiarMotivoNoDuplicado: obligatorio, sin saltos, con tope', () => {
  assert.equal(limpiarMotivoNoDuplicado('  clientes\n distintos '), 'clientes distintos')
  assert.equal(limpiarMotivoNoDuplicado('   '), null)
  assert.equal(limpiarMotivoNoDuplicado(null), null)
  assert.equal(limpiarMotivoNoDuplicado(42), null)
  assert.equal(limpiarMotivoNoDuplicado('x'.repeat(900))!.length, 500)
})

// ── Vigía: criterio de «mismo número» ───────────────────────────────────────

test('numeroPolizaComparable: sin separadores ni ceros a la izquierda, en mayúsculas', () => {
  assert.equal(numeroPolizaComparable(' 0035-374.290 '), '35374290')
  assert.equal(numeroPolizaComparable('uvg4/123'), 'UVG4123')
  assert.equal(numeroPolizaComparable(null), null)
})

test('🚨 numeroPolizaComparable: un comodín NO es un número (seis «pendiente» en Mapfre no son una póliza seis veces)', () => {
  for (const c of ['pendiente', 'Pendiente', 'PENDIENTE', 'sin número', 'S/N', '12345', '00000', '0000012', 'XXXXXXX', 'ABCDEFG', '1111111']) {
    assert.equal(numeroPolizaComparable(c), null, c)
  }
})

const fila = (id: string, numero: string | null, dgs: string | null = 'C0109', correduriaId = 'cor-1'): PolizaParaVigiaDuplicadas =>
  ({ id, correduriaId, numeroPoliza: numero, codigoEntidadDgs: dgs })

test('vigía: agrupa por DGS + número comparable y devuelve el id más bajo como ref', () => {
  const g = gruposVivosDuplicados([
    fila('b2', '35374290'), fila('a1', '0035374290'),
    fila('c3', '30210000', 'C0613'), fila('d4', '30210000', 'C0613'), fila('e5', '30210000', 'C0613'),
    fila('f6', '99999123'),
  ])
  assert.deepEqual(g, [
    { entidad: 'C0109', ref: 'a1', fichas: 2 },
    { entidad: 'C0613', ref: 'c3', fichas: 3 },
  ])
})

test('vigía: misma cifra en OTRA compañía, sin DGS, comodín u OTRA correduría → no es grupo', () => {
  assert.deepEqual(gruposVivosDuplicados([fila('a', '35374290', 'C0109'), fila('b', '35374290', 'C0058')]), [])
  assert.deepEqual(gruposVivosDuplicados([fila('a', '35374290', null), fila('b', '35374290', null)]), [])
  assert.deepEqual(gruposVivosDuplicados([fila('a', 'pendiente'), fila('b', 'pendiente')]), [])
  // Multi-tenant: dos corredurías no se funden jamás.
  assert.deepEqual(gruposVivosDuplicados([fila('a', '35374290', 'C0109', 'cor-1'), fila('b', '35374290', 'C0109', 'cor-2')]), [])
})

test('🚨 vigía: el grupo con todos sus pares marcados «no duplicado» desaparece', () => {
  const filas = [fila('a', '32742526'), fila('b', '32742526'), fila('c', '35374290'), fila('d', '35374290')]
  assert.equal(gruposVivosDuplicados(filas).length, 2)
  const g = gruposVivosDuplicados(filas, new Set([claveParNoDuplicado('b', 'a')!]))
  assert.deepEqual(g, [{ entidad: 'C0109', ref: 'c', fichas: 2 }])
})

test('vigía: un id repetido (dos filas de la misma ficha) no fabrica un duplicado', () => {
  assert.deepEqual(gruposVivosDuplicados([fila('a', '32742526'), fila('a', '32742526')]), [])
})
