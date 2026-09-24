import test from 'node:test'
import assert from 'node:assert/strict'
import {
  nivelCobertura,
  agruparPrecios,
  parseFiltroPrecios,
  filtroPreciosActivo,
  describirFiltroPrecios,
  eurEs,
  FILTRO_PRECIOS_VACIO,
  type PrecioComparable,
  type FiltroPrecios,
} from './comparativa-precios.ts'
import { defensaDeCartera, type CompaniaCatalogo, type Defensa } from './defensa-cartera.ts'

const url = (qs: string) => new URLSearchParams(qs)

/**
 * Precios con las etiquetas y las primas REALES medidas el 21/09/2026 en
 * `seguros.tarificacion_precios` (187 filas). No son inventadas: es lo que
 * manda el vendor.
 */
const AUTO: PrecioComparable[] = [
  { compania: 'Mapfre', categoria: 'Terceros', primaEur: 175.89, franquiciaEur: null, firmeza: 'firme' },
  { compania: 'Reale', categoria: 'Terceros', primaEur: 229.41, franquiciaEur: null, firmeza: 'firme' },
  { compania: 'Allianz', categoria: 'Terceros', primaEur: 277.94, franquiciaEur: null, firmeza: 'estimado' },
  { compania: 'Mapfre', categoria: 'Terceros Ampliado', primaEur: 209.15, franquiciaEur: null, firmeza: 'firme' },
  { compania: 'Occident', categoria: 'Terceros Ampliado', primaEur: 274.88, franquiciaEur: null, firmeza: 'firme' },
  { compania: 'Reale', categoria: 'Todo Riesgo Con Franquicia Alta', primaEur: 603.08, franquiciaEur: 600, firmeza: 'firme' },
  { compania: 'Occident', categoria: 'Todo Riesgo Con Franquicia Baja', primaEur: 418.8, franquiciaEur: 150, firmeza: 'condicionado' },
  { compania: 'Reale', categoria: 'Todo Riesgo Sin Franquicia', primaEur: 1587.83, franquiciaEur: 0, firmeza: 'estimado' },
]

const CATALOGO: CompaniaCatalogo[] = [
  { codigoDgs: 'C0058', nombreComun: 'Mapfre' },
  { codigoDgs: 'C0109', nombreComun: 'Allianz' },
  { codigoDgs: 'C0468', nombreComun: 'Occident' },
  { codigoDgs: 'C0613', nombreComun: 'Reale' },
]

// ─── Niveles ─────────────────────────────────────────────────────────────────

test('la escala de auto son cuatro niveles y las tres franquicias son UNO', () => {
  assert.equal(nivelCobertura('Terceros').clave, 'terceros')
  assert.equal(nivelCobertura('Terceros Ampliado').clave, 'terceros_ampliado')
  assert.equal(nivelCobertura('Todo Riesgo Con Franquicia Alta').clave, 'todo_riesgo_franquicia')
  assert.equal(nivelCobertura('Todo Riesgo Con Franquicia Baja').clave, 'todo_riesgo_franquicia')
  assert.equal(nivelCobertura('Todo Riesgo Sin Franquicia').clave, 'todo_riesgo')
})

test('🚨 al agrupar las tres franquicias NO se pierde cuál es: queda el matiz', () => {
  // 111 de los 187 precios traen `franquiciaEur` a null; en esas filas la
  // palabra de la etiqueta es lo ÚNICO que se sabe del importe.
  assert.equal(nivelCobertura('Todo Riesgo Con Franquicia Alta').matiz, 'alta')
  assert.equal(nivelCobertura('Todo Riesgo Con Franquicia Media').matiz, 'media')
  assert.equal(nivelCobertura('Todo Riesgo Con Franquicia Baja').matiz, 'baja')
  assert.equal(nivelCobertura('Todo Riesgo Con Franquicia Alta').etiquetaVendor, 'Todo Riesgo Con Franquicia Alta')
})

test('🚨 «Todo Riesgo» de Mapfre HOGAR no cae en el todo riesgo de auto', () => {
  // Medido: Mapfre Hogar «Todo Riesgo» = 84,80€. Sin el ramo, ese hogar se
  // sentaría junto a un todo riesgo de coche de 1.587,83€.
  assert.equal(nivelCobertura('Todo Riesgo', 'auto').clave, 'todo_riesgo')
  assert.equal(nivelCobertura('Todo Riesgo', 'hogar').clave, 'h_todo_riesgo')
  assert.equal(nivelCobertura('Todo Riesgo', 'hogar').familia, 'hogar')
})

test('🚨 una etiqueta desconocida tiene grupo PROPIO, no un cajón «otros»', () => {
  const n = nivelCobertura('Fórmula Plus Oro')
  assert.equal(n.reconocido, false)
  assert.equal(n.label, 'Fórmula Plus Oro')
  assert.equal(n.clave, 'x_formula_plus_oro')
  assert.notEqual(n.clave, 'otros')
})

test('🚨 `categoria: null` es «no declarado», no un nivel', () => {
  const n = nivelCobertura(null)
  assert.equal(n.clave, 'sin_declarar')
  assert.equal(n.reconocido, false)
  assert.equal(n.etiquetaVendor, null)
})

// ─── Agrupar y ordenar ───────────────────────────────────────────────────────

test('agrupa por cobertura y ordena de menos a más cobertura', () => {
  const c = agruparPrecios(AUTO, { ramo: 'auto' })
  assert.deepEqual(
    c.grupos.map((g) => g.nivel.clave),
    ['terceros', 'terceros_ampliado', 'todo_riesgo_franquicia', 'todo_riesgo'],
  )
  assert.equal(c.total, 8)
  assert.equal(c.mostrados, 8)
})

test('dentro del grupo manda la prima ascendente', () => {
  const c = agruparPrecios(AUTO, { ramo: 'auto' })
  const terceros = c.grupos[0]!
  assert.deepEqual(terceros.filas.map((f) => f.precio.compania), ['Mapfre', 'Reale', 'Allianz'])
})

test('🚨 una fila sin prima va al FINAL: `null` no es 0', () => {
  const c = agruparPrecios(
    [
      { compania: 'Reale', categoria: 'Terceros', primaEur: null },
      { compania: 'Mapfre', categoria: 'Terceros', primaEur: 175.89 },
    ],
    { ramo: 'auto' },
  )
  assert.deepEqual(c.grupos[0]!.filas.map((f) => f.precio.compania), ['Mapfre', 'Reale'])
})

test('los niveles no reconocidos y el «no declarado» van al final, nunca mezclados', () => {
  const c = agruparPrecios(
    [...AUTO, { compania: 'X', categoria: 'Fórmula Oro', primaEur: 10 }, { compania: 'Y', categoria: null, primaEur: 20 }],
    { ramo: 'auto' },
  )
  const claves = c.grupos.map((g) => g.nivel.clave)
  assert.equal(claves[claves.length - 1], 'sin_declarar')
  assert.equal(claves[claves.length - 2], 'x_formula_oro')
  assert.match(c.avisoEscala ?? '', /no están en la escala conocida|no está en la escala conocida/)
})

test('la escala de HOGAR se avisa: cada compañía la nombra a su manera', () => {
  // Medido: Fiatc «Básico/Ampliado», Allianz y Fidelidade «Básico/Estándar/Premium».
  const c = agruparPrecios(
    [
      { compania: 'Fiatc', categoria: 'Ampliado', primaEur: 68.8 },
      { compania: 'Allianz', categoria: 'Estándar', primaEur: 474.48 },
    ],
    { ramo: 'hogar' },
  )
  assert.equal(c.grupos.length, 2, 'Ampliado y Estándar NO se funden')
  assert.match(c.avisoEscala ?? '', /cada compañía/)
})

// ─── Defensa de cartera dentro de la tabla ───────────────────────────────────

function defensas(polizas: Parameters<typeof defensaDeCartera>[0]['polizas']): Map<string, Defensa> {
  const m = new Map<string, Defensa>()
  for (const c of ['Mapfre', 'Allianz', 'Occident', 'Reale']) {
    m.set(c, defensaDeCartera({ compania: c, catalogo: CATALOGO, polizas }))
  }
  return m
}

test('🚨 la fila bloqueada NO se esconde por defecto: el precio hace falta para defender la cartera', () => {
  const c = agruparPrecios(AUTO, {
    ramo: 'auto',
    defensaPorCompania: defensas([
      { codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', estado: 'activa', viva: true },
    ]),
  })
  assert.equal(c.mostrados, 8)
  assert.equal(c.bloqueadasOcultas, 0)
  const terceros = c.grupos[0]!
  assert.equal(terceros.filas[0]!.precio.compania, 'Mapfre')
  assert.equal(terceros.filas[0]!.bloqueada, true, 'sigue la primera por precio, marcada')
  assert.equal(terceros.bloqueadas, 1)
})

test('«la más barata que SÍ podemos emitir» es otra que «la más barata»', () => {
  const c = agruparPrecios(AUTO, {
    ramo: 'auto',
    defensaPorCompania: defensas([
      { codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', estado: 'activa', viva: true },
    ]),
  })
  const terceros = c.grupos[0]!
  assert.equal(terceros.filas[0]!.precio.compania, 'Mapfre')
  assert.equal(terceros.masBarataEmitible?.precio.compania, 'Reale')
})

test('«solo emitibles» es opt-in y cuenta lo que quita', () => {
  const filtro: FiltroPrecios = { ...FILTRO_PRECIOS_VACIO, soloEmitibles: true }
  const c = agruparPrecios(AUTO, {
    ramo: 'auto',
    filtro,
    defensaPorCompania: defensas([
      { codigoEntidadDgs: 'C0058', aseguradora: 'Mapfre', estado: 'activa', viva: true },
    ]),
  })
  assert.equal(c.bloqueadasOcultas, 2)
  assert.equal(c.mostrados, 6)
})

test('🚨 sin evaluar la defensa, ninguna fila se marca como emitible ni como bloqueada', () => {
  const c = agruparPrecios(AUTO, { ramo: 'auto' })
  assert.equal(c.grupos.every((g) => g.filas.every((f) => f.defensa === null && !f.bloqueada)), true)
})

// ─── Filtros ─────────────────────────────────────────────────────────────────

const PRESENTES = {
  niveles: ['terceros', 'terceros_ampliado', 'todo_riesgo_franquicia', 'todo_riesgo'],
  companias: ['Allianz', 'Mapfre', 'Occident', 'Reale'],
}

test('sin parámetros: ningún filtro, y se nota', () => {
  const { filtro, descartados, avisos } = parseFiltroPrecios(url(''), PRESENTES)
  assert.deepEqual(filtro, FILTRO_PRECIOS_VACIO)
  assert.deepEqual(descartados, [])
  assert.deepEqual(avisos, [])
  assert.equal(filtroPreciosActivo(filtro), false)
  assert.equal(describirFiltroPrecios(filtro, (c) => c), 'todos los precios')
})

test('🚨 un valor que no se entiende se DESCARTA y se DECLARA', () => {
  const { filtro, descartados } = parseFiltroPrecios(
    url('nivel=terceros,inventado&compania=Mapfre,Fiatc&firmeza=firme,segurisimo&franquicia=quizas&primaMax=abc'),
    PRESENTES,
  )
  assert.deepEqual(filtro.niveles, ['terceros'])
  assert.deepEqual(filtro.companias, ['Mapfre'])
  assert.deepEqual(filtro.firmezas, ['firme'])
  assert.equal(filtro.franquicia, null)
  assert.equal(filtro.primaMax, null)
  assert.deepEqual(descartados, [
    { campo: 'nivel', valor: 'inventado' },
    { campo: 'compania', valor: 'Fiatc' },
    { campo: 'firmeza', valor: 'segurisimo' },
    { campo: 'franquicia', valor: 'quizas' },
    { campo: 'primaMax', valor: 'abc' },
  ])
})

test('una horquilla al revés se DICE, no se arregla por nuestra cuenta', () => {
  const { filtro, avisos } = parseFiltroPrecios(url('primaMin=900&primaMax=200'), PRESENTES)
  assert.equal(filtro.primaMin, 900)
  assert.equal(filtro.primaMax, 200)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0]!, /al revés/)
})

test('la coma decimal española se acepta en la horquilla', () => {
  const { filtro, descartados } = parseFiltroPrecios(url('primaMax=418,80'), PRESENTES)
  assert.equal(filtro.primaMax, 418.8)
  assert.deepEqual(descartados, [])
})

test('🚨 «sin franquicia» NO recoge las que no la declaran', () => {
  // 111 de 187 vienen a null: colapsarlas en «sin franquicia» vendería un todo
  // riesgo callando lo que lleva encima.
  const c = agruparPrecios(AUTO, {
    ramo: 'auto',
    filtro: { ...FILTRO_PRECIOS_VACIO, franquicia: 'sin' },
  })
  assert.equal(c.mostrados, 1)
  assert.equal(c.grupos[0]!.filas[0]!.precio.compania, 'Reale')

  const nd = agruparPrecios(AUTO, {
    ramo: 'auto',
    filtro: { ...FILTRO_PRECIOS_VACIO, franquicia: 'no_declarada' },
  })
  assert.equal(nd.mostrados, 5)
})

test('🚨 una firmeza que no viene NO cumple «firme»', () => {
  const c = agruparPrecios(
    [{ compania: 'X', categoria: 'Terceros', primaEur: 100 }],
    { ramo: 'auto', filtro: { ...FILTRO_PRECIOS_VACIO, firmezas: ['firme'] } },
  )
  assert.equal(c.mostrados, 0)
  assert.equal(c.ocultosPorFiltro, 1)
})

test('la horquilla de prima no deja colar una fila sin prima', () => {
  const c = agruparPrecios(
    [{ compania: 'X', categoria: 'Terceros', primaEur: null }],
    { ramo: 'auto', filtro: { ...FILTRO_PRECIOS_VACIO, primaMax: 500 } },
  )
  assert.equal(c.mostrados, 0)
})

test('el resumen del filtro sale en euros españoles, con el € detrás', () => {
  assert.equal(eurEs(2162.49), '2.162,49€')
  assert.equal(eurEs(2000.12), '2.000,12€')
  const f: FiltroPrecios = { ...FILTRO_PRECIOS_VACIO, primaMax: 1587.83, soloEmitibles: true }
  const txt = describirFiltroPrecios(f, (c) => c)
  assert.match(txt, /hasta 1\.587,83€/)
  assert.match(txt, /solo las que podemos emitir/)
})

test('los desplegables se pintan con lo que hay delante, con su cuenta', () => {
  const c = agruparPrecios(AUTO, { ramo: 'auto' })
  assert.deepEqual(c.companiasPresentes, ['Allianz', 'Mapfre', 'Occident', 'Reale'])
  assert.deepEqual(c.nivelesPresentes, [
    { clave: 'terceros', label: 'Terceros', n: 3 },
    { clave: 'terceros_ampliado', label: 'Terceros ampliado', n: 2 },
    { clave: 'todo_riesgo_franquicia', label: 'Todo riesgo con franquicia', n: 2 },
    { clave: 'todo_riesgo', label: 'Todo riesgo sin franquicia', n: 1 },
  ])
})
