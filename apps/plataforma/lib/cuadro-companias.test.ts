import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuadroCompanias, type CuadroCompaniaAnio } from '@central/module-seguros'
import {
  agregarLibro, aniosSelector, siniestralidadMaxima, eurONada, filasResumen, interpretarCuadro, ordenarResumen, pctONada,
  textoSiniestralidad, textoVariacion, type CuadroLeido, type FilaLibro,
} from './cuadro-companias.ts'

// Datos FICTICIOS; el año y «hoy» se inyectan.
const HOY = '2031-06-15'
const A = 2031
const un = (codigo: string, polizas: number): CuadroCompaniaAnio => cuadroCompanias({
  anio: A, hoy: HOY, siniestros: [], produccion: [],
  polizas: Array.from({ length: polizas }, () => ({
    companiaCodigoDgs: codigo, ramo: 'hogar', estado: 'activa', enVigorHoy: true, fechaEfectoInicial: '2029-01-01', fechaSituacion: null, prima: 100,
  })),
}).companias[0]!

const leido = (companias: CuadroCompaniaAnio[], anterior: CuadroCompaniaAnio[] = []): CuadroLeido => ({
  anio: A, hoy: HOY, truncado: false, produccionTruncada: false, companias, anterior, polizasSinCompania: 0, siniestrosSinCompania: 0,
})

test('interpretar: ok con forma completa; estados del puerto', () => {
  const r = interpretarCuadro(200, { estado: 'ok', anio: A, hoy: HOY, companias: [un('C1', 2)], anterior: [] })
  assert.equal(r.estado, 'ok')
  assert.deepEqual(interpretarCuadro(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarCuadro(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarCuadro(404, null), { estado: 'error', motivo: 'puerto_sin_desplegar' })
  assert.deepEqual(interpretarCuadro(200, { estado: 'error', causa: 'conexion' }), { estado: 'error', motivo: 'conexion' })
})

test('interpretar: una compañía a medias NO se pinta recortada (error, no lista corta)', () => {
  const rota = { ...un('C1', 1), cartera: undefined }
  assert.deepEqual(interpretarCuadro(200, { estado: 'ok', anio: A, companias: [un('C2', 1), rota], anterior: [] }), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarCuadro(200, { estado: 'ok', anio: A, companias: 'x', anterior: [] }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

const f = (p: Partial<FilaLibro> = {}): FilaLibro => ({
  compania_codigo: 'C1', periodo_inicio: `${A}-01-01`, esperado_bruto: 100, liq_bruto: 100, liq_remesa: 85, banco_total: 85, leido_ok: true, ...p,
})

test('libro: suma por compañía; null ≠ 0 en cada eje', () => {
  const m = agregarLibro([f(), f({ periodo_inicio: `${A}-02-01`, esperado_bruto: 50, liq_bruto: null, liq_remesa: null, banco_total: null })])
  const l = m.get('C1')!
  assert.equal(l.periodos, 2)
  assert.equal(l.devengado, 150)
  assert.equal(l.liquidado, 100)
  assert.equal(l.cobrado, 85)
  assert.equal(l.periodosSinLiquidar, 1)
  assert.equal(l.periodosSinBanco, 1)
  assert.equal(l.completo, false)
})

test('libro: ningún periodo con liquidación → liquidado null, no 0; compañía sin filas no aparece', () => {
  const l = agregarLibro([f({ liq_bruto: null, liq_remesa: null, banco_total: null })]).get('C1')!
  assert.equal(l.liquidado, null)
  assert.equal(l.cobrado, null)
  assert.equal(l.devengado, 100)
  assert.equal(agregarLibro([]).has('C1'), false)
})

test('libro: un periodo con 0 comprobado SÍ es un dato (0), y todo cubierto = completo', () => {
  const l = agregarLibro([f({ esperado_bruto: 0, liq_bruto: 0, liq_remesa: 0, banco_total: 0 })]).get('C1')!
  assert.equal(l.devengado, 0)
  assert.equal(l.liquidado, 0)
  assert.equal(l.cobrado, 0)
  assert.equal(l.completo, true)
})

test('libro: bruto negativo de Occident con remesa 0 se cuenta en positivo; leido_ok=false marca incompleto', () => {
  const l = agregarLibro([f({ liq_bruto: -40, liq_remesa: 0, leido_ok: false })]).get('C1')!
  assert.equal(l.liquidado, 40)
  assert.equal(l.noLeidos, 1)
  assert.equal(l.completo, false)
})

test('formato: null es «—», nunca 0,00€ ni 0 %', () => {
  assert.equal(eurONada(null), '—')
  assert.equal(eurONada(undefined), '—')
  assert.equal(eurONada(1234.5), '1.234,50€')
  assert.equal(eurONada(0), '0,00€')
  assert.equal(pctONada(null), '—')
  assert.equal(pctONada(12.34), '12,3 %')
  assert.equal(textoVariacion(null), null)
  assert.equal(textoVariacion(12.4), '+12 %')
  assert.equal(textoVariacion(-5), '−5 %')
})

test('siniestralidad: sin importes dice «sin importes de la compañía» con su cobertura, no 0 %', () => {
  const base = { total: 3, asistencias: 0, n: 3, conImporte: 0, sinTipo: 0, incurrido: null, ratioPct: null, muestraPequena: true } as const
  const t = textoSiniestralidad({ ...base, estado: 'sin_importes' })
  assert.equal(t.titular, 'Sin importes de la compañía')
  assert.equal(t.cobertura, 'importes en 0 de 3 siniestros')
  assert.ok(!t.titular.includes('0 %'))
  assert.equal(textoSiniestralidad({ ...base, n: 0, total: 0, estado: 'sin_siniestros' }).titular, 'Sin siniestros')
})

test('siniestralidad: parcial avisa de que el ratio es un suelo; muestra pequeña se avisa', () => {
  const t = textoSiniestralidad({ total: 5, asistencias: 0, n: 5, conImporte: 3, sinTipo: 0, incurrido: 300, ratioPct: 30, estado: 'parcial', muestraPequena: true })
  assert.equal(t.titular, '30,0 % (parcial)')
  assert.equal(t.cobertura, 'importes en 3 de 5 siniestros')
  assert.match(t.aviso ?? '', /Faltan importes de 2/)
  assert.match(t.aviso ?? '', /muestra pequeña/)
})

test('resumen: una fila por compañía de cualquiera de los dos años; sin cuadro del año = «—», no 0', () => {
  const filas = filasResumen(leido([un('C1', 3)], [un('C1', 2), un('C2', 4)]), new Map([['C1', 'Alfa']]))
  assert.equal(filas.length, 2)
  const c2 = filas.find((x) => x.codigo === 'C2')!
  assert.equal(c2.polizas, null)
  assert.equal(c2.nombre, 'C2')
  assert.equal(c2.anterior?.polizas, 4)
  assert.equal(filas.find((x) => x.codigo === 'C1')!.anterior?.polizas, 2)
})

test('ordenar: por columna, y los null SIEMPRE al final en ambos sentidos', () => {
  const filas = filasResumen(leido([un('C1', 3), un('C3', 5)], [un('C2', 1)]), new Map([['C1', 'Beta'], ['C2', 'Alfa'], ['C3', 'Gamma']]))
  assert.deepEqual(ordenarResumen(filas, 'polizas', true).map((x) => x.codigo), ['C3', 'C1', 'C2'])
  assert.deepEqual(ordenarResumen(filas, 'polizas', false).map((x) => x.codigo), ['C1', 'C3', 'C2'])
  assert.deepEqual(ordenarResumen(filas, 'nombre', false).map((x) => x.nombre), ['Alfa', 'Beta', 'Gamma'])
})

test('tope de siniestralidad: el más estricto de los objetivos que tocan el año; sin acuerdo = null', () => {
  const ok = (objetivos: Array<{ periodoDesde: string; periodoHasta: string; siniestralidadMaxPct: number | null }>, c = 'C1') =>
    ({ estado: 'ok', acuerdos: [{ companiaCodigoDgs: c, objetivos }] })
  const o = (d: string, h: string, m: number | null) => ({ periodoDesde: d, periodoHasta: h, siniestralidadMaxPct: m })
  assert.equal(siniestralidadMaxima(ok([o(`${A}-01-01`, `${A}-12-31`, 65), o(`${A}-01-01`, `${A}-06-30`, 60)]), 'C1', A), 60)
  assert.equal(siniestralidadMaxima(ok([o(`${A - 1}-01-01`, `${A - 1}-12-31`, 60)]), 'C1', A), null)
  assert.equal(siniestralidadMaxima(ok([o(`${A}-01-01`, `${A}-12-31`, null)]), 'C1', A), null)
  assert.equal(siniestralidadMaxima(ok([o(`${A}-01-01`, `${A}-12-31`, 60)], 'C2'), 'C1', A), null)
  assert.equal(siniestralidadMaxima({ estado: 'error' }, 'C1', A), null)
  assert.equal(siniestralidadMaxima(null, 'C1', A), null)
})

test('selector de años: el actual y tres atrás', () => {
  assert.deepEqual(aniosSelector(HOY), [2031, 2030, 2029, 2028])
})
