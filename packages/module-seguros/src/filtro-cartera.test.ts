import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseFiltroCartera, filtroActivo, describirFiltro, diasDeVentana, etiquetaRamo,
  RAMOS, ESTADOS, VENTANAS, POR_PAGINA_DEFECTO, POR_PAGINA_MAX,
} from './filtro-cartera.ts'

const url = (qs: string) => new URLSearchParams(qs)

test('sin parámetros: cartera viva, sin filtros, primera página', () => {
  const { filtro, descartados, buscable } = parseFiltroCartera(url(''))
  assert.equal(filtro.grupo, 'viva')
  assert.deepEqual(filtro.ramos, [])
  assert.equal(filtro.pagina, 1)
  assert.equal(filtro.porPagina, POR_PAGINA_DEFECTO)
  assert.deepEqual(descartados, [])
  assert.equal(buscable, true)
  assert.equal(filtroActivo(filtro), false)
})

test('🚨 un valor que no se entiende se DESCARTA y se DECLARA, nunca se ignora', () => {
  // Ignorarlo convertiría «enséñame los de ramo xyz» en «enséñamelo todo»: la
  // respuesta que más se parece a haber funcionado y que nunca es cierta.
  const { filtro, descartados } = parseFiltroCartera(url('ramo=auto,xyz&estado=inventado&vence=nunca&canal=quizas&grupo=raro'))
  assert.deepEqual(filtro.ramos, ['auto'])
  assert.deepEqual(filtro.estados, [])
  assert.equal(filtro.vence, null)
  assert.equal(filtro.canal, null)
  assert.equal(filtro.grupo, 'viva')
  assert.deepEqual(descartados, [
    { campo: 'grupo', valor: 'raro' },
    { campo: 'ramo', valor: 'xyz' },
    { campo: 'estado', valor: 'inventado' },
    { campo: 'vence', valor: 'nunca' },
    { campo: 'canal', valor: 'quizas' },
  ])
})

test('varios ramos separados por coma', () => {
  const { filtro } = parseFiltroCartera(url('ramo=auto,hogar,moto'))
  assert.deepEqual(filtro.ramos, ['auto', 'hogar', 'moto'])
})

test('venta cruzada: «con auto y SIN hogar»', () => {
  const { filtro } = parseFiltroCartera(url('ramo=auto&sinRamo=hogar'))
  assert.deepEqual(filtro.ramos, ['auto'])
  assert.deepEqual(filtro.sinRamos, ['hogar'])
  assert.match(describirFiltro(filtro), /con Auto/)
  assert.match(describirFiltro(filtro), /SIN Hogar/)
})

test('🚨 «sin ramo X» sobre LEADS se descarta: un lead no tiene ninguna póliza viva', () => {
  // Si se dejara pasar, TODOS los leads cumplirían «no tiene hogar» y el filtro
  // parecería funcionar devolviendo los 29.860 enteros.
  const { filtro } = parseFiltroCartera(url('grupo=leads&sinRamo=hogar'))
  assert.equal(filtro.grupo, 'leads')
  assert.deepEqual(filtro.sinRamos, [])
})

test('texto de menos de 3 letras: no se busca Y SE DICE', () => {
  // «no se ha buscado» ≠ «no hay resultados»: si `q` se quedara sin declarar,
  // la lista saldría entera y parecería que el texto no filtra nada.
  const { filtro, buscable } = parseFiltroCartera(url('q=jo'))
  assert.equal(buscable, false)
  assert.equal(filtro.q, '')
})

test('texto de 3 letras o más sí busca', () => {
  const { filtro, buscable } = parseFiltroCartera(url('q=%20suarez%20'))
  assert.equal(buscable, true)
  assert.equal(filtro.q, 'suarez')
})

test('un cuadro de búsqueda vacío es buscable (no es un error)', () => {
  assert.equal(parseFiltroCartera(url('q=')).buscable, true)
  assert.equal(parseFiltroCartera(url('q=%20%20')).buscable, true)
})

test('paginación: se acota y no acepta basura', () => {
  assert.equal(parseFiltroCartera(url('porPagina=5000')).filtro.porPagina, POR_PAGINA_MAX)
  assert.equal(parseFiltroCartera(url('porPagina=0')).filtro.porPagina, 1)
  assert.equal(parseFiltroCartera(url('porPagina=abc')).filtro.porPagina, POR_PAGINA_DEFECTO)
  assert.equal(parseFiltroCartera(url('porPagina=-3')).filtro.porPagina, POR_PAGINA_DEFECTO)
  assert.equal(parseFiltroCartera(url('pagina=0')).filtro.pagina, 1)
  assert.equal(parseFiltroCartera(url('pagina=7')).filtro.pagina, 7)
})

test('filtroActivo distingue la vista por defecto de una filtrada', () => {
  assert.equal(filtroActivo(parseFiltroCartera(url('')).filtro), false)
  assert.equal(filtroActivo(parseFiltroCartera(url('grupo=leads')).filtro), true)
  assert.equal(filtroActivo(parseFiltroCartera(url('canal=sin')).filtro), true)
  assert.equal(filtroActivo(parseFiltroCartera(url('provincia=Sevilla')).filtro), true)
})

test('describirFiltro dice de qué es la lista (va en la cabecera y en el CSV)', () => {
  const { filtro } = parseFiltroCartera(url('grupo=leads&provincia=Sevilla&canal=sin&q=perez'))
  const d = describirFiltro(filtro)
  assert.match(d, /leads \(volcado histórico\)/)
  assert.match(d, /de Sevilla/)
  assert.match(d, /sin email ni teléfono/)
  assert.match(d, /«perez»/)
})

test('diasDeVentana: solo los plazos tienen días', () => {
  assert.equal(diasDeVentana('d30'), 30)
  assert.equal(diasDeVentana('d60'), 60)
  assert.equal(diasDeVentana('d90'), 90)
  // «Ya vencidas», «este año» y «sin fecha» NO son un plazo de N días: devolver
  // un número aquí las convertiría en una ventana futura silenciosamente.
  assert.equal(diasDeVentana('vencidas'), null)
  assert.equal(diasDeVentana('anio'), null)
  assert.equal(diasDeVentana('sin_fecha'), null)
})

test('los catálogos no tienen duplicados y toda ventana tiene rótulo', () => {
  assert.equal(new Set(RAMOS.map(r => r.v)).size, RAMOS.length)
  assert.equal(new Set(ESTADOS.map(e => e.v)).size, ESTADOS.length)
  assert.equal(new Set(VENTANAS.map(v => v.v)).size, VENTANAS.length)
  for (const v of VENTANAS) assert.ok(v.label.length > 0)
})

test('etiquetaRamo cae al propio valor si el ramo es desconocido, no a vacío', () => {
  assert.equal(etiquetaRamo('auto'), 'Auto')
  assert.equal(etiquetaRamo('responsabilidad_civil'), 'R. Civil')
  // Un rótulo vacío pintaría una fila sin nada donde sí hay un dato.
  assert.equal(etiquetaRamo('ramo_nuevo_del_futuro'), 'ramo_nuevo_del_futuro')
})
