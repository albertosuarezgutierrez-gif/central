import test from 'node:test'
import assert from 'node:assert/strict'
import {
  avisosDeOferta, conGarantiaEditada, elegidasPorDefecto, estadoLectura, importeOFalta, lineasDeValor, marcaDeCelda,
  parsearImporteEs, puedeGenerarPresupuesto, importeParaInput, citaNoEncontrada,
} from './ofertas-vista.ts'

const of = (p: Partial<Parameters<typeof puedeGenerarPresupuesto>[0][number]> & { id: string }) => ({
  documentoId: null, rol: 'oferta' as const, compania: 'Mapfre', producto: null, primaNeta: null, primaTotal: 100, garantias: {},
  datosExtra: {}, estado: 'revisada' as const, recomendada: false, revisadaAt: null, revisadaPor: null, ...p,
})

test('null nunca es 0: importe y celda dicen «No figura»', () => {
  assert.equal(importeOFalta(null), 'No figura')
  assert.equal(importeOFalta(undefined), 'No figura')
  assert.equal(importeOFalta(1234.5), '1.234,50€')
  assert.deepEqual(lineasDeValor(null), ['No figura'])
  assert.deepEqual(lineasDeValor({ estado: null, capital: null, limite: null, franquicia: null }), ['No figura'])
  assert.deepEqual(lineasDeValor({ estado: 'incluida', capital: 50000, limite: null, franquicia: 0 }), ['Incluida', 'Capital 50.000,00€', 'Sin franquicia'])
  assert.deepEqual(lineasDeValor({ estado: 'excluida', capital: null, limite: null, franquicia: null }), ['Excluida'])
})

test('marcas: el hueco gana; sin marca = null', () => {
  assert.equal(marcaDeCelda({ hueco: true, peorQueActual: true, mejorQueActual: false })?.clave, 'hueco')
  assert.equal(marcaDeCelda({ hueco: false, peorQueActual: true, mejorQueActual: false })?.clave, 'peor')
  assert.equal(marcaDeCelda({ hueco: false, peorQueActual: false, mejorQueActual: true })?.clave, 'mejor')
  assert.equal(marcaDeCelda({ hueco: false, peorQueActual: false, mejorQueActual: false }), null)
})

test('importe en español: vacío = null (no figura), basura = invalido', () => {
  assert.equal(parsearImporteEs(''), null)
  assert.equal(parsearImporteEs('  '), null)
  assert.equal(parsearImporteEs('1.234,56'), 1234.56)
  assert.equal(parsearImporteEs('1.234'), 1234)
  assert.equal(parsearImporteEs('1234,5 €'), 1234.5)
  assert.equal(parsearImporteEs('12.5'), 12.5)
  assert.equal(parsearImporteEs('abc'), 'invalido')
  assert.equal(parsearImporteEs('-5'), 'invalido')
  assert.equal(importeParaInput(1234.5), '1234,5')
  assert.equal(importeParaInput(null), '')
})

test('editar una celda cambia solo ese campo y crea la garantía si no estaba', () => {
  const g = { a: { estado: 'incluida' as const, capital: 1, limite: null, franquicia: null, evidencia: { pagina: 2, texto: 'x' } } }
  const n = conGarantiaEditada(g, 'a', 'capital', 500)
  assert.equal(n.a.capital, 500)
  assert.equal(n.a.estado, 'incluida')
  assert.deepEqual(n.a.evidencia, { pagina: 2, texto: 'x' })
  assert.equal(g.a.capital, 1)
  const m = conGarantiaEditada(g, 'b', 'franquicia', null)
  assert.deepEqual(m.b, { estado: null, capital: null, limite: null, franquicia: null, evidencia: null })
})

test('lectura: fallo de escaneo se dice; sin dato de lectura no es «leída»', () => {
  assert.equal(estadoLectura({ datosExtra: {} }).clave, 'sin_lectura')
  assert.equal(estadoLectura({ datosExtra: { lectura: { ok: true, paginas: 4 } } }).texto, 'Leída (4 pág.)')
  const f = estadoLectura({ datosExtra: { lectura: { ok: false, motivo: 'PDF escaneado' } } })
  assert.equal(f.clave, 'fallo')
  assert.match(f.texto, /PDF escaneado/)
})

test('avisos: citas y cifras no encontradas con el nombre literal', () => {
  const d = { evidenciaNoEncontrada: ['rc'], cifrasNoEncontradas: ['rc.capital'], literales: { rc: 'Resp. Civil' }, descartadasSinNombre: 2 }
  const a = avisosDeOferta({ datosExtra: d })
  assert.equal(a.length, 3)
  assert.match(a[0], /Resp\. Civil/)
  assert.match(a[1], /capital/)
  assert.match(a[2], /2 garantías/)
  assert.equal(citaNoEncontrada({ datosExtra: d }, 'rc'), true)
  assert.equal(citaNoEncontrada({ datosExtra: d }, 'otra'), false)
  assert.deepEqual(avisosDeOferta({ datosExtra: {} }), [])
})

test('generar presupuesto: solo con todas las elegidas revisadas y con prima', () => {
  const o1 = of({ id: '1' }), o2 = of({ id: '2', estado: 'extraida', compania: 'AXA' })
  assert.equal(puedeGenerarPresupuesto([o1, o2], new Set()).ok, false)
  const r = puedeGenerarPresupuesto([o1, o2], new Set(['1', '2']))
  assert.equal(r.ok, false)
  assert.match((r as { motivo: string }).motivo, /AXA/)
  assert.equal(puedeGenerarPresupuesto([o1, o2], new Set(['1'])).ok, true)
  assert.equal(puedeGenerarPresupuesto([of({ id: '3', primaTotal: null })], new Set(['3'])).ok, false)
  // la póliza actual sin revisar bloquea; una descartada se ignora
  assert.equal(puedeGenerarPresupuesto([o1, of({ id: 'a', rol: 'actual', estado: 'extraida' })], new Set(['1'])).ok, false)
  assert.equal(puedeGenerarPresupuesto([o1, of({ id: 'd', estado: 'descartada' })], new Set(['1', 'd'])).ok, true)
  assert.deepEqual([...elegidasPorDefecto([o1, o2, of({ id: 'a', rol: 'actual' }), of({ id: 'd', estado: 'descartada' })])], ['1', '2'])
})
