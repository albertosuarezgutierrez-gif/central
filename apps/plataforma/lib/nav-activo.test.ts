import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rutaDe, activoPorRuta, activoEnLista, type EntradaNav } from './nav-activo.ts'

// Las dos listas reales que tenían el fallo, recortadas a lo que importa.
const NEGOCIO: EntradaNav[] = [
  { href: '/banca' },
  { href: '/banca?tab=ingresos', tab: 'ingresos' },
  { href: '/banca?tab=negocios', tab: 'negocios' },
  { href: '/banca?tab=fiscal', tab: 'fiscal' },
  { href: '/banca?tab=personal', tab: 'personal' },
  { href: '/expenses/pendientes' },
  { href: '/correduria' },
]
const PISOS: EntradaNav[] = [
  { href: '/sivra/pricing' },
  { href: '/sivra/pricing-auto' },
  { href: '/sivra/pricing-rentabilidad' },
  { href: '/sivra/partes/establecimientos' },
  { href: '/apartamentos' },
]

function activas(lista: EntradaNav[], path: string, tab: string | null = null): string[] {
  return lista.filter(e => activoEnLista(e, lista, path, tab)).map(e => e.href)
}

test('rutaDe se queda con la ruta y tira la query', () => {
  assert.equal(rutaDe('/banca?tab=ingresos'), '/banca')
  assert.equal(rutaDe('/banca'), '/banca')
})

test('activoPorRuta cubre las subrutas pero NO un hermano con el mismo prefijo', () => {
  assert.equal(activoPorRuta('/sivra/pricing', '/sivra/pricing'), true)
  assert.equal(activoPorRuta('/sivra/pricing', '/sivra/pricing/lab'), true)
  // El fallo original: sin la barra, esto daba true.
  assert.equal(activoPorRuta('/sivra/pricing', '/sivra/pricing-auto'), false)
  assert.equal(activoPorRuta('/sivra/pricing', '/sivra/pricing-rentabilidad'), false)
})

test('en /banca sin tab manda «Inicio», y solo él', () => {
  assert.deepEqual(activas(NEGOCIO, '/banca', null), ['/banca'])
})

for (const tab of ['ingresos', 'negocios', 'fiscal', 'personal']) {
  test(`en /banca?tab=${tab} se enciende SOLO ese segmento, no también «Inicio»`, () => {
    assert.deepEqual(activas(NEGOCIO, '/banca', tab), [`/banca?tab=${tab}`])
  })
}

test('un ?tab= desconocido cae en «Inicio» en vez de dejar el menú apagado', () => {
  assert.deepEqual(activas(NEGOCIO, '/banca', 'inventado'), ['/banca'])
})

test('una subruta de /banca deja activo al padre aunque arrastre un ?tab=', () => {
  assert.deepEqual(activas(NEGOCIO, '/banca/detalle', 'ingresos'), ['/banca'])
})

test('el ?tab= de OTRA sección no enciende ningún segmento de /banca', () => {
  assert.deepEqual(activas(NEGOCIO, '/correduria', 'fiscal'), ['/correduria'])
})

test('cada ruta de Pisos enciende exactamente una entrada', () => {
  for (const p of ['/sivra/pricing', '/sivra/pricing-auto', '/sivra/pricing-rentabilidad', '/apartamentos']) {
    assert.deepEqual(activas(PISOS, p), [p], `ruta ${p}`)
  }
})

test('una subruta de Pisos enciende su entrada padre y ninguna más', () => {
  assert.deepEqual(activas(PISOS, '/sivra/partes/establecimientos/3'), ['/sivra/partes/establecimientos'])
})

test('ninguna ruta del panel enciende dos entradas a la vez', () => {
  const rutas: [string, string | null][] = [
    ['/banca', null], ['/banca', 'ingresos'], ['/banca', 'negocios'], ['/banca', 'fiscal'],
    ['/banca', 'personal'], ['/expenses/pendientes', null], ['/correduria', null],
  ]
  for (const [p, t] of rutas) assert.equal(activas(NEGOCIO, p, t).length, 1, `${p}?tab=${t}`)
  for (const e of PISOS) assert.equal(activas(PISOS, rutaDe(e.href)).length, 1, e.href)
})
