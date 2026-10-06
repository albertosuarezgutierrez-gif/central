import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  leerPct,
  leerTramos,
  normalizarCodigoCima,
  atribuirClave,
  conflictosCodigos,
  lineaAplicable,
  ramoDesdeTexto,
  leerSeedAcuerdos,
  type AcuerdoParaCalculo,
  type ClaveParaAtribuir,
  type ConsultaLinea,
  type LineaAcuerdo,
} from './acuerdos.ts'

// ─── Porcentajes: NULL ≠ 0 ───────────────────────────────────────────────────

test('leerPct: null/undefined es «no consta», no 0', () => {
  assert.deepEqual(leerPct(null), { ok: true, valor: null })
  assert.deepEqual(leerPct(undefined), { ok: true, valor: null })
})

test('leerPct: un 0 explícito es un DATO y se conserva como 0', () => {
  assert.deepEqual(leerPct(0), { ok: true, valor: 0 })
})

test('leerPct: rechaza texto, fuera de rango y más de 2 decimales', () => {
  assert.equal(leerPct('17,5').ok, false)
  assert.equal(leerPct('17.5').ok, false)
  assert.equal(leerPct(-1).ok, false)
  assert.equal(leerPct(100.01).ok, false)
  assert.equal(leerPct(12.345).ok, false)
  assert.equal(leerPct(Number.NaN).ok, false)
  assert.deepEqual(leerPct(17.5), { ok: true, valor: 17.5 })
  assert.deepEqual(leerPct(22.55), { ok: true, valor: 22.55 })
})

// ─── Tramos ──────────────────────────────────────────────────────────────────

test('leerTramos: tramos ordenados y contiguos son legibles; pct ausente queda null', () => {
  const r = leerTramos([
    { desde: 0, hasta: 10000, pct: 0 },
    { desde: 10000, hasta: 25000, pct: 1.5 },
    { desde: 25000, hasta: null, importe: 600 },
  ])
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.tramos.length, 3)
  assert.equal(r.tramos[0].pct, 0)
  assert.equal(r.tramos[2].pct, null)
  assert.equal(r.tramos[2].importe, 600)
})

test('leerTramos: [] es legible (sin tramos estructurados)', () => {
  assert.deepEqual(leerTramos([]), { estado: 'ok', tramos: [] })
})

test('leerTramos: solape, desorden o techo intermedio dejan TODO ilegible, no se salta el tramo', () => {
  assert.equal(leerTramos([{ desde: 0, hasta: 10000 }, { desde: 5000, hasta: null }]).estado, 'ilegible')
  assert.equal(leerTramos([{ desde: 10000, hasta: null }, { desde: 0, hasta: 5000 }]).estado, 'ilegible')
  assert.equal(leerTramos([{ desde: 0, hasta: null }, { desde: 100, hasta: null }]).estado, 'ilegible')
  assert.equal(leerTramos([{ desde: 100, hasta: 50 }]).estado, 'ilegible')
  assert.equal(leerTramos([{ desde: '0' }]).estado, 'ilegible')
  assert.equal(leerTramos([{ desde: 0, pct: '2' }]).estado, 'ilegible')
  assert.equal(leerTramos({}).estado, 'ilegible')
})

// ─── Recibo → clave ──────────────────────────────────────────────────────────

// Códigos REALES de CIMA medidos el 06/10/2026 en la cartera en vigor.
const CLAVES: ClaveParaAtribuir[] = [
  { id: 'k-allianz', companiaCodigoDgs: 'C0109', codigosCima: ['209-A/0018638/0000', '209-C/0018638/0000', '209-E/0018638/0000'] },
  { id: 'k-occ-m', companiaCodigoDgs: 'C0468', codigosCima: ['M00171'] },
  { id: 'k-occ-8', companiaCodigoDgs: 'C0468', codigosCima: ['8-92361'] },
]

test('normalizarCodigoCima: recorta, mayúsculas, y vacío es null', () => {
  assert.equal(normalizarCodigoCima('  m00171 '), 'M00171')
  assert.equal(normalizarCodigoCima(''), null)
  assert.equal(normalizarCodigoCima('   '), null)
  assert.equal(normalizarCodigoCima(null), null)
  assert.equal(normalizarCodigoCima(65792), null)
})

test('atribuirClave: manda el código del recibo', () => {
  const a = atribuirClave({ companiaCodigoDgs: 'C0468', codigoRecibo: '8-92361', codigoPoliza: 'M00171' }, CLAVES)
  assert.deepEqual(a, { estado: 'clave', claveId: 'k-occ-8', codigo: '8-92361', desde: 'recibo' })
})

test('atribuirClave: sin código en el recibo cae al de la póliza (los recibos de Generali no lo traen)', () => {
  const a = atribuirClave({ companiaCodigoDgs: 'C0109', codigoRecibo: null, codigoPoliza: '209-C/0018638/0000' }, CLAVES)
  assert.deepEqual(a, { estado: 'clave', claveId: 'k-allianz', codigo: '209-C/0018638/0000', desde: 'poliza' })
})

test('atribuirClave: un código de recibo desconocido NO cae al de la póliza', () => {
  const a = atribuirClave({ companiaCodigoDgs: 'C0468', codigoRecibo: 'X-1', codigoPoliza: 'M00171' }, CLAVES)
  assert.deepEqual(a, { estado: 'codigo_sin_asignar', codigo: 'X-1', desde: 'recibo' })
})

test('atribuirClave: sin ningún código es «sin_codigo», no una clave por defecto', () => {
  assert.deepEqual(
    atribuirClave({ companiaCodigoDgs: 'C0109', codigoRecibo: '', codigoPoliza: undefined }, CLAVES),
    { estado: 'sin_codigo' },
  )
})

test('atribuirClave: solo mira las claves de ESA compañía', () => {
  const a = atribuirClave({ companiaCodigoDgs: 'C0058', codigoRecibo: 'M00171', codigoPoliza: null }, CLAVES)
  assert.equal(a.estado, 'codigo_sin_asignar')
})

test('atribuirClave: un código en dos claves no se reparte ni se escoge', () => {
  const dup = [...CLAVES, { id: 'k-otra', companiaCodigoDgs: 'C0468', codigosCima: ['m00171'] }]
  const a = atribuirClave({ companiaCodigoDgs: 'C0468', codigoRecibo: 'M00171', codigoPoliza: null }, dup)
  assert.deepEqual(a, { estado: 'codigo_en_varias_claves', codigo: 'M00171', claveIds: ['k-occ-m', 'k-otra'] })
  assert.deepEqual(conflictosCodigos(dup), [{ companiaCodigoDgs: 'C0468', codigo: 'M00171', claveIds: ['k-occ-m', 'k-otra'] }])
  assert.deepEqual(conflictosCodigos(CLAVES), [])
})

// ─── Recibo → porcentaje pactado ─────────────────────────────────────────────

/** Las 7 líneas reales de `seguros.comision_pactada` (Allianz, RC PYME 1434). */
function lineasRcPymeAllianz(): LineaAcuerdo[] {
  const m: Array<[string, number]> = [
    ['RC Vida privada', 22.5],
    ['Explotaciones Agrícolas', 17.5],
    ['Industria y comercio', 17.5],
    ['Construcción', 17.5],
    ['Profesional', 17.5],
    ['Colectividades y Asoc', 17.5],
    ['Varios', 17.5],
  ]
  return m.map(([modalidad, pct], i) => ({
    id: `l${i}`, ramo: 'responsabilidad_civil', producto: '1434', modalidad, pctNp: pct, pctCartera: pct,
  }))
}

function acuerdo(p: Partial<AcuerdoParaCalculo> = {}): AcuerdoParaCalculo {
  return {
    id: 'a-allianz', companiaCodigoDgs: 'C0109', claveId: 'k-allianz',
    vigenciaDesde: '2026-10-28', vigenciaHasta: null, revisado: false,
    comisiones: lineasRcPymeAllianz(), ...p,
  }
}

function consulta(p: Partial<ConsultaLinea> = {}): ConsultaLinea {
  return {
    companiaCodigoDgs: 'C0109', claveId: 'k-allianz', ramo: 'responsabilidad_civil',
    producto: '1434', modalidad: null, fechaEfecto: '2026-11-15', claseRecibo: 'CA', ...p,
  }
}

test('RC PYME de Allianz: sin modalidad es AMBIGUO (22,5 % frente a 17,5 %), nunca la primera línea', () => {
  const r = lineaAplicable([acuerdo()], consulta())
  assert.equal(r.estado, 'ambiguo')
  if (r.estado !== 'ambiguo') return
  assert.equal(r.candidatas.length, 7)
  assert.deepEqual([...new Set(r.candidatas.map((c) => c.pct))].sort(), [17.5, 22.5])
})

test('RC PYME de Allianz: con modalidad se resuelve (y sin tildes también)', () => {
  const vida = lineaAplicable([acuerdo()], consulta({ modalidad: 'RC Vida privada' }))
  assert.equal(vida.estado, 'linea')
  if (vida.estado === 'linea') {
    assert.equal(vida.pct, 22.5)
    assert.deepEqual(vida.lineaIds, ['l0'])
    assert.equal(vida.revisado, false, 'el seed nace sin cotejar')
  }
  const cons = lineaAplicable([acuerdo()], consulta({ modalidad: 'construccion' }))
  assert.equal(cons.estado, 'linea')
  if (cons.estado === 'linea') assert.equal(cons.pct, 17.5)
})

test('RC PYME de Allianz: una modalidad que no está en el acuerdo es «sin_linea», no la genérica inventada', () => {
  assert.equal(lineaAplicable([acuerdo()], consulta({ modalidad: 'Náutica' })).estado, 'sin_linea')
})

test('varias líneas con el MISMO porcentaje no son ambiguas', () => {
  const soloIguales = acuerdo({ comisiones: lineasRcPymeAllianz().slice(1) })
  const r = lineaAplicable([soloIguales], consulta())
  assert.equal(r.estado, 'linea')
  if (r.estado === 'linea') {
    assert.equal(r.pct, 17.5)
    assert.equal(r.lineaIds.length, 6)
  }
})

test('NP usa el % de nueva producción y CA el de cartera; otra clase no tiene regla', () => {
  const a = acuerdo({ comisiones: [{ id: 'x', ramo: 'auto', producto: null, modalidad: null, pctNp: 14, pctCartera: 12 }] })
  const np = lineaAplicable([a], consulta({ ramo: 'auto', producto: null, claseRecibo: 'NP' }))
  const ca = lineaAplicable([a], consulta({ ramo: 'auto', producto: null, claseRecibo: 'ca' }))
  assert.equal(np.estado === 'linea' && np.pct, 14)
  assert.equal(ca.estado === 'linea' && ca.pct, 12)
  assert.deepEqual(lineaAplicable([a], consulta({ ramo: 'auto', claseRecibo: 'SU' })), { estado: 'clase_sin_regla', clase: 'SU' })
  assert.deepEqual(lineaAplicable([a], consulta({ ramo: 'auto', claseRecibo: null })), { estado: 'clase_sin_regla', clase: null })
})

test('un % que el acuerdo no dice es «pct_no_consta», jamás 0', () => {
  const a = acuerdo({ comisiones: [{ id: 'x', ramo: 'auto', producto: null, modalidad: null, pctNp: 14, pctCartera: null }] })
  const r = lineaAplicable([a], consulta({ ramo: 'auto', producto: null, claseRecibo: 'CA' }))
  assert.deepEqual(r, { estado: 'pct_no_consta', acuerdoIds: ['a-allianz'], lineaIds: ['x'] })
})

test('un 0 % pactado SÍ es un dato y sale como línea con pct 0', () => {
  const a = acuerdo({ comisiones: [{ id: 'x', ramo: 'decesos', producto: null, modalidad: null, pctNp: 0, pctCartera: 0 }] })
  const r = lineaAplicable([a], consulta({ ramo: 'decesos', producto: null }))
  assert.equal(r.estado, 'linea')
  if (r.estado === 'linea') assert.equal(r.pct, 0)
})

test('un % conocido y otro desconocido en la misma situación es ambiguo, no se toma el conocido', () => {
  const a = acuerdo({
    comisiones: [
      { id: 'x', ramo: 'auto', producto: null, modalidad: null, pctNp: 14, pctCartera: 12 },
      { id: 'y', ramo: 'auto', producto: null, modalidad: null, pctNp: 14, pctCartera: null },
    ],
  })
  assert.equal(lineaAplicable([a], consulta({ ramo: 'auto', producto: null })).estado, 'ambiguo')
})

test('vigencia: bordes incluidos, fuera de rango es «sin_acuerdo»', () => {
  const a = acuerdo({ vigenciaHasta: '2027-10-27' })
  const q = { modalidad: 'Varios' }
  assert.equal(lineaAplicable([a], consulta({ ...q, fechaEfecto: '2026-10-28' })).estado, 'linea')
  assert.equal(lineaAplicable([a], consulta({ ...q, fechaEfecto: '2027-10-27T10:00:00.000Z' })).estado, 'linea')
  assert.equal(lineaAplicable([a], consulta({ ...q, fechaEfecto: '2026-10-27' })).estado, 'sin_acuerdo')
  assert.equal(lineaAplicable([a], consulta({ ...q, fechaEfecto: '2027-10-28' })).estado, 'sin_acuerdo')
  assert.deepEqual(lineaAplicable([a], consulta({ ...q, fechaEfecto: null })), { estado: 'sin_fecha' })
  assert.deepEqual(lineaAplicable([a], consulta({ ...q, fechaEfecto: '2026-02-30' })), { estado: 'sin_fecha' })
})

test('acuerdo vigente SIN clave asignada → «acuerdo_sin_clave» (productividad pendiente), no se compara', () => {
  const sinClave = acuerdo({ claveId: null })
  assert.deepEqual(lineaAplicable([sinClave], consulta({ modalidad: 'Varios' })), { estado: 'acuerdo_sin_clave' })
})

test('el acuerdo de OTRA clave de la misma compañía no se aplica (APROMES ≠ cartera directa)', () => {
  const apromes = acuerdo({ id: 'a-apromes', claveId: 'k-apromes' })
  assert.deepEqual(lineaAplicable([apromes], consulta({ modalidad: 'Varios' })), { estado: 'sin_acuerdo' })
})

test('dos acuerdos vigentes de la misma clave con % distinto para el mismo ramo → ambiguo', () => {
  const l = (id: string, pct: number): LineaAcuerdo => ({ id, ramo: 'hogar', producto: null, modalidad: null, pctNp: pct, pctCartera: pct })
  const a1 = acuerdo({ id: 'a1', comisiones: [l('x', 25)] })
  const a2 = acuerdo({ id: 'a2', vigenciaDesde: '2026-01-01', comisiones: [l('y', 20)] })
  assert.equal(lineaAplicable([a1, a2], consulta({ ramo: 'hogar', producto: null })).estado, 'ambiguo')
})

test('una línea con ramo NULL (no mapeado) se pinta pero no calcula', () => {
  const a = acuerdo({ comisiones: [{ id: 'x', ramo: null, producto: null, modalidad: null, pctNp: 10, pctCartera: 10 }] })
  assert.equal(lineaAplicable([a], consulta({ ramo: 'auto', producto: null })).estado, 'sin_linea')
})

test('producto: la línea específica gana a la genérica; sin específica, la genérica', () => {
  const a = acuerdo({
    comisiones: [
      { id: 'gen', ramo: 'auto', producto: null, modalidad: null, pctNp: 10, pctCartera: 10 },
      { id: 'esp', ramo: 'auto', producto: '1219', modalidad: null, pctNp: 15, pctCartera: 15 },
    ],
  })
  const esp = lineaAplicable([a], consulta({ ramo: 'auto', producto: '1219' }))
  assert.equal(esp.estado === 'linea' && esp.pct, 15)
  const gen = lineaAplicable([a], consulta({ ramo: 'auto', producto: '9999' }))
  assert.equal(gen.estado === 'linea' && gen.pct, 10)
  assert.equal(lineaAplicable([a], consulta({ ramo: 'auto', producto: null })).estado, 'ambiguo')
})

test('producto: casa por el CÓDIGO aunque el ramo de la línea no esté mapeado', () => {
  const a = acuerdo({ comisiones: [{ id: 'x', ramo: null, producto: '1434', modalidad: null, pctNp: 20, pctCartera: 18 }] })
  const r = lineaAplicable([a], consulta({ ramo: 'empresas', producto: '1434' }))
  assert.equal(r.estado === 'linea' && r.pct, 18)
})

test('una línea ceñida a un producto con nombre comercial no se aplica a todo el ramo', () => {
  const a = acuerdo({ comisiones: [{ id: 'x', ramo: 'auto', producto: 'Autos nuevo producto / Ejemplo', modalidad: null, pctNp: 20, pctCartera: 20 }] })
  assert.equal(lineaAplicable([a], consulta({ ramo: 'auto', producto: '1219' })).estado, 'sin_linea')
})

// ─── Seed ────────────────────────────────────────────────────────────────────

function seedValido(): Record<string, unknown> {
  return {
    version: 1,
    acuerdos: [{
      compania: 'C0109', fuente: 'directo', fuente_nombre: null, clave: null,
      vigencia_desde: '2026-10-28', vigencia_hasta: null,
      requisitos_apertura: null, letra_pequena: null,
      documento_fuente: 'Carta de condiciones de Allianz, captura del 28/09/2026',
      comisiones: [{ ramo: 'responsabilidad_civil', ramo_texto: 'RC PYME', producto: '1434', modalidad: 'Varios', pct_np: 17.5, pct_cartera: null, notas: null }],
      objetivos: [{
        tipo: 'rappel', ambito: 'individual', base: 'primas_np', criterio_cobro: null, ramos: ['auto'],
        periodo_desde: '2026-01-01', periodo_hasta: '2026-12-31',
        tramos: [{ desde: 0, hasta: 5000, pct: null }, { desde: 5000, hasta: null, pct: 2 }],
        siniestralidad_max_pct: null, condiciones: null,
      }],
    }],
  }
}

test('seed válido: conserva los null como null (pct_cartera, criterio_cobro, pct del tramo)', () => {
  const r = leerSeedAcuerdos(seedValido())
  assert.equal(r.estado, 'ok', JSON.stringify(r))
  if (r.estado !== 'ok') return
  assert.equal(r.acuerdos[0].comisiones[0].pct_cartera, null)
  assert.equal(r.acuerdos[0].comisiones[0].pct_np, 17.5)
  assert.equal(r.acuerdos[0].objetivos[0].criterio_cobro, null)
  assert.equal(r.acuerdos[0].objetivos[0].tramos[0].pct, null)
  assert.equal(r.acuerdos[0].clave, null)
})

test('seed: un acuerdo no puede venir «cotejado» desde el fichero', () => {
  for (const campo of ['revisado', 'revisado_at']) {
    const s = seedValido()
    ;(s.acuerdos as Record<string, unknown>[])[0][campo] = campo === 'revisado' ? true : '2026-10-06'
    const r = leerSeedAcuerdos(s)
    assert.equal(r.estado, 'invalido')
    if (r.estado === 'invalido') assert.match(r.errores.join('\n'), /cotejado/)
  }
})

test('seed: devuelve TODOS los errores, no el primero', () => {
  const s = seedValido()
  const a = (s.acuerdos as Record<string, unknown>[])[0]
  a.compania = 'Allianz'
  a.vigencia_desde = '28/10/2026'
  ;(a.comisiones as Record<string, unknown>[])[0].pct_np = '17,5'
  ;(a.comisiones as Record<string, unknown>[])[0].ramo = 'rc_pyme'
  const r = leerSeedAcuerdos(s)
  assert.equal(r.estado, 'invalido')
  if (r.estado === 'invalido') assert.ok(r.errores.length >= 4, r.errores.join('\n'))
})

test('seed: duplicado (compañía, fuente, vigencia_desde) se rechaza', () => {
  const s = seedValido()
  const lista = s.acuerdos as unknown[]
  lista.push(structuredClone(lista[0]))
  const r = leerSeedAcuerdos(s)
  assert.equal(r.estado, 'invalido')
  if (r.estado === 'invalido') assert.match(r.errores.join('\n'), /duplicado/)
})

test('seed: otra_asociacion exige nombre; documento_fuente es obligatorio', () => {
  const s = seedValido()
  const a = (s.acuerdos as Record<string, unknown>[])[0]
  a.fuente = 'otra_asociacion'
  a.documento_fuente = '  '
  const r = leerSeedAcuerdos(s)
  assert.equal(r.estado, 'invalido')
  if (r.estado === 'invalido') {
    const t = r.errores.join('\n')
    assert.match(t, /fuente_nombre/)
    assert.match(t, /documento_fuente/)
  }
})

test('seed: una lista de acuerdos vacía es válida (la de APROMES, pendiente del PDF)', () => {
  assert.deepEqual(leerSeedAcuerdos({ version: 1, acuerdos: [] }), { estado: 'ok', acuerdos: [] })
})

// ─── Ramo literal → tipo_seguro ──────────────────────────────────────────────

test('ramoDesdeTexto: mapea solo coincidencias exactas (sin tildes ni mayúsculas)', () => {
  assert.equal(ramoDesdeTexto('Automóviles'), 'auto')
  assert.equal(ramoDesdeTexto('  HOGAR '), 'hogar')
  assert.equal(ramoDesdeTexto('Responsabilidad Civil'), 'responsabilidad_civil')
  assert.equal(ramoDesdeTexto('RC Profesional'), 'rc_profesional')
  assert.equal(ramoDesdeTexto('D&O'), 'dyo')
})

test('ramoDesdeTexto: lo dudoso es null, no el ramo más parecido', () => {
  for (const t of ['Transportes', 'Defensa jurídica', 'Particulares', 'Vida colectivo / decesos',
    'RC profesional del corredor', 'Comercios, Oficinas y Pymes', 'Todos', '', null]) {
    assert.equal(ramoDesdeTexto(t), null, `«${t}» no debería mapearse`)
  }
})
