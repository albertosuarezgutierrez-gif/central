import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ladoDeGarantia,
  capitalAsegurado,
  capitalesHogar,
  eurDeCapital,
  GARANTIAS_MINIMAS_CONSENSO,
  type CoberturaLeible,
} from './garantias.ts'

const g = (descripcion: string, capital: string | null): CoberturaLeible => ({ descripcion, capital })

// El caso real de la cartera (importes medidos el 02/09/2026, sin cliente): seis
// garantías principales repiten el capital y los sublímites van sueltos.
const HOGAR_REAL: CoberturaLeible[] = [
  g('Daños vivienda', '912322'),
  g('Incendio y ot.daños vivienda', '912322'),
  g('Daños por agua vivienda', '912322'),
  g('Fenomenos atmosfer. vivienda', '912322'),
  g('Robo vivienda', '912322'),
  g('Consorcio', '912322'),
  g('Roturas vivienda', '1500'),
  g('Daños electricos vivienda', '6591'),
  g('Daños mobiliario', '117081'),
  g('Incendio y ot.daños mobiliario', '117081'),
  g('Daños por agua mobiliario', '117081'),
  g('Robo mobiliario', '117081'),
  g('Roturas mobiliario', '1685'),
]

test('el lado se saca del vocabulario que usan las compañías, no de una lista cerrada', () => {
  assert.equal(ladoDeGarantia('Daños vivienda'), 'vivienda')
  assert.equal(ladoDeGarantia('Robo del continente'), 'vivienda')
  assert.equal(ladoDeGarantia('Daños por agua mobiliario'), 'mobiliario')
  assert.equal(ladoDeGarantia('Hurto de contenido'), 'mobiliario')
  assert.equal(ladoDeGarantia('Ajuar doméstico'), 'mobiliario')
})

test('🚨 «desperfectos al CONTINENTE por robo» lleva las dos palabras y asegura el continente', () => {
  // Si se mirara «contenido» primero, esta garantía caería del lado equivocado y
  // su importe entraría a corroborar el capital de mobiliario.
  assert.equal(ladoDeGarantia('Desperfectos al continente por robo'), 'vivienda')
})

test('lo que no se reconoce devuelve null y NO se fuerza a un lado', () => {
  assert.equal(ladoDeGarantia('Reclamación y defensa jurídica básica'), null)
  assert.equal(ladoDeGarantia('Asistencia hogar'), null)
  assert.equal(ladoDeGarantia(null), null)
  assert.equal(ladoDeGarantia(undefined), null)
})

test('el capital es el importe que REPITEN varias garantías, no el mayor a secas', () => {
  const c = capitalAsegurado(HOGAR_REAL, 'vivienda')
  assert.equal(c.estado, 'consenso')
  if (c.estado !== 'consenso') return
  assert.equal(c.eur, 912322)
  // Cinco, no seis: «Consorcio» lleva el mismo importe pero su nombre no dice de
  // qué lado es, así que NO corrobora. Es deliberado — una garantía sin clasificar
  // no suma ni resta, y colarla aquí sería inflar la confianza del número.
  assert.equal(c.garantias, 5)
})

test('🚨 un sublímite MÁS ALTO que el capital no lo desbanca: lo que manda es cuántas coinciden', () => {
  // Una sola garantía con 2.000.000€ es un tope raro, no la suma asegurada.
  const conSublimiteEnorme = [...HOGAR_REAL, g('Garantía rara vivienda', '2000000')]
  const c = capitalAsegurado(conSublimiteEnorme, 'vivienda')
  assert.equal(c.estado, 'consenso')
  if (c.estado !== 'consenso') return
  assert.equal(c.eur, 912322, 'el sublímite de 2M no puede convertirse en el continente')
})

test('los dos lados salen a la vez y no se contaminan entre ellos', () => {
  const { continente, contenido } = capitalesHogar(HOGAR_REAL)
  assert.equal(eurDeCapital(continente), 912322)
  assert.equal(eurDeCapital(contenido), 117081)
})

test('🚨 sin corroboración NO hay capital: solo sublímites, y se dice', () => {
  const sueltos = [g('Roturas vivienda', '1500'), g('Daños electricos vivienda', '6591')]
  const c = capitalAsegurado(sueltos, 'vivienda')
  assert.equal(c.estado, 'solo_sublimites')
  if (c.estado !== 'solo_sublimites') return
  // El mayor se devuelve, pero ETIQUETADO como lo que es: quien lo pinte como
  // continente estará inventando una suma asegurada.
  assert.equal(c.mayorEur, 6591)
  assert.match(c.motivo, /sublímites/)
  assert.equal(eurDeCapital(c), null, 'un sublímite NUNCA sale como capital')
})

test('justo por debajo del mínimo todavía no es consenso; justo en el mínimo sí', () => {
  const dos = [g('Daños vivienda', '500480'), g('Robo vivienda', '500480')]
  assert.equal(capitalAsegurado(dos, 'vivienda').estado, 'solo_sublimites')
  const tres = [...dos, g('Incendio y ot.daños vivienda', '500480')]
  const c = capitalAsegurado(tres, 'vivienda')
  assert.equal(c.estado, 'consenso')
  if (c.estado !== 'consenso') return
  assert.equal(c.garantias, GARANTIAS_MINIMAS_CONSENSO)
})

test('🚨 todo a cero es un DATO («no lleva capital propio»), no un hueco', () => {
  const ceros = [g('Daños vivienda', '0'), g('Robo vivienda', '0'), g('Roturas vivienda', '0.00')]
  const c = capitalAsegurado(ceros, 'vivienda')
  assert.equal(c.estado, 'todo_cero')
  assert.match(c.estado === 'todo_cero' ? c.motivo : '', /no les pone capital propio/)
})

test('«no hay capital» y «no hay garantías de ese lado» son motivos DISTINTOS', () => {
  const sinCapital = capitalAsegurado([g('Daños vivienda', null)], 'vivienda')
  assert.equal(sinCapital.estado, 'sin_capital')

  const sinGarantias = capitalAsegurado([g('Asistencia hogar', '300')], 'vivienda')
  assert.equal(sinGarantias.estado, 'sin_garantias')
})

test('un capital ilimitado o con texto raro no corrobora nada ni rompe el recuento', () => {
  const mezcla = [
    g('Daños vivienda', '457453'),
    g('Robo vivienda', '457453'),
    g('Incendio y ot.daños vivienda', '457453'),
    g('Responsabilidad civil del inmueble', 'ILIMITADO'),
    g('Otra vivienda', 'según condicionado'),
  ]
  const c = capitalAsegurado(mezcla, 'vivienda')
  assert.equal(c.estado, 'consenso')
  if (c.estado !== 'consenso') return
  assert.equal(c.eur, 457453)
  assert.equal(c.garantias, 3, 'ni el ilimitado ni el texto cuentan como coincidencia')
})

test('el consenso dice SIEMPRE en cuántas garantías se apoya: es lo que hace explicable el número', () => {
  const c = capitalAsegurado(HOGAR_REAL, 'mobiliario')
  assert.equal(c.estado, 'consenso')
  if (c.estado !== 'consenso') return
  assert.ok(c.garantias >= GARANTIAS_MINIMAS_CONSENSO)
  assert.ok(typeof c.ejemplo === 'string' && c.ejemplo.length > 0)
})

test('una póliza sin coberturas no revienta: dice que no hay garantías', () => {
  const { continente, contenido } = capitalesHogar([])
  assert.equal(continente.estado, 'sin_garantias')
  assert.equal(contenido.estado, 'sin_garantias')
})
