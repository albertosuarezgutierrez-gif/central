import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ladoDeGarantia,
  capitalAsegurado,
  capitalesHogar,
  eurDeCapital,
  eurDeCapitalConVolcado,
  importeDelVolcado,
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
    g('Daños al edificio por caída de árbol', 'ILIMITADO'),
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

// ─── El caso Occident, medido el 02/09/2026 sobre dos pólizas vivas ──────────
// Aquí la respuesta correcta NO es un número: es «la compañía no lo informa».
// Sus garantías de continente y contenido vienen con capital NULL y todo lo que
// trae importe es sublímite o responsabilidad civil.
const OCCIDENT_REAL: CoberturaLeible[] = [
  g('Robo del continente', null),
  g('Desperfectos al continente por robo', null),
  g('Robo y atraco del contenido', null),
  g('Hurto de contenido', null),
  g('Robo de bienes en trasteros y anexos', '5894.43'),
  g('Responsabilidad civil del inmueble', '353665.88'),
  g('Responsabilidad civil. Sublímite por víctima', '353665.88'),
  g('Responsabilidad civil medioambiental', '300000.00'),
  g('Restitución estética ampliada', '2500.00'),
  g('Honorarios de peritos', '5000.00'),
]

test('🚨 la RESPONSABILIDAD CIVIL del INMUEBLE no es capital de la vivienda', () => {
  // En EIAC (§13.3.72) `RC` es un `claves_bien` distinto de `CONTINENTE`. Su
  // garantía se llama «responsabilidad civil del inmueble» y la palabra
  // «inmueble» la metía en el lado de la vivienda: la ficha enseñaba entonces
  // 353.665,88€ como sublímite del continente, que es un número plausible y
  // falso — el modo de fallo más caro de este repo.
  assert.equal(ladoDeGarantia('Responsabilidad civil del inmueble'), null)
  assert.equal(ladoDeGarantia('Responsabilidad civil derivada del agua'), null)
  assert.equal(ladoDeGarantia('Responsabilidad civil medioambiental'), null)
  // Y no se lleva por delante al continente de verdad:
  assert.equal(ladoDeGarantia('Robo del continente'), 'vivienda')
  assert.equal(ladoDeGarantia('Daños al inmueble por incendio'), 'vivienda')
})

test('Occident: sin capital en las garantías, la respuesta es «no lo informa», no un sublímite ascendido', () => {
  const { continente, contenido } = capitalesHogar(OCCIDENT_REAL)
  assert.equal(continente.estado, 'sin_capital')
  assert.equal(contenido.estado, 'sin_capital')
})

test('sin la exclusión de RC, el continente de Occident mentiría — cepo del sesgo', () => {
  // Si alguien quita la guarda de «responsabilidad civil», este importe vuelve
  // a colarse. El cepo comprueba que HOY no aparece por ninguna vía.
  const c = capitalAsegurado(OCCIDENT_REAL, 'vivienda')
  const texto = JSON.stringify(c)
  assert.ok(!texto.includes('353665'), 'el límite de RC no puede salir del lado de la vivienda')
})

// ─── La copia del volcado, segunda fuente ROTULADA (03/09/2026) ─────────────
// El fallo que la trajo: la ficha de Occident `GPDFS3000276` decía «sin dato»
// en continente y contenido —y que la suma asegurada «viaja en el campo Bien,
// que la ingesta todavía no guarda»— mientras la copia de esa MISMA póliza en
// el volcado tenía `{"continente":"61000","contenido":"7000"}` guardado, y la
// pantalla ya estaba leyendo ese objeto para pintar los m² y el año. Medido en
// la BD: afecta a 7 de las 19 pólizas de hogar vivas.

const VOLCADO_OCCIDENT = { continente: '61000', contenido: '7000' }

test('🚨 el CONSENSO gana a la copia del volcado: lo de hoy manda sobre la foto de 2026', () => {
  // La gemela dice 61.000 y las garantías vivas corroboran 912.322. Coger el
  // volcado aquí sería sustituir el dato actual por uno viejo.
  const { continente, contenido } = capitalesHogar(HOGAR_REAL, VOLCADO_OCCIDENT)
  assert.equal(continente.estado, 'consenso')
  assert.equal(eurDeCapital(continente), 912322)
  assert.equal(contenido.estado, 'consenso')
  assert.equal(eurDeCapital(contenido), 117081)
})

test('🚨 sin consenso, la copia del volcado SÍ da el capital — y dice que viene de ahí', () => {
  const { continente, contenido } = capitalesHogar(OCCIDENT_REAL, VOLCADO_OCCIDENT)
  assert.equal(continente.estado, 'del_volcado')
  assert.equal(contenido.estado, 'del_volcado')
  if (continente.estado !== 'del_volcado' || contenido.estado !== 'del_volcado') return
  assert.equal(continente.eur, 61000)
  assert.equal(contenido.eur, 7000)
  // El rótulo NO es opcional: sin él, 61.000€ de 2026 se lee como el de hoy.
  for (const c of [continente, contenido]) {
    assert.match(c.motivo, /volcado/i, 'tiene que decir de dónde sale')
    assert.match(c.motivo, /2026/, 'tiene que fechar la foto')
    assert.match(c.motivo, /desactualizado/i, 'tiene que avisar de que puede estar viejo')
    assert.ok(!/hoy la compañía\.$/.test(c.motivo))
  }
})

test('🚨 `del_volcado` NO se cuela por `eurDeCapital`: un capital viejo no entra en un cálculo sin querer', () => {
  const { continente } = capitalesHogar(OCCIDENT_REAL, VOLCADO_OCCIDENT)
  assert.equal(continente.estado, 'del_volcado')
  assert.equal(eurDeCapital(continente), null, 'quien pide «solo el número» no se lleva el del volcado')
  // Y quien SÍ lo quiera tiene que escribir el nombre largo, que es el aviso.
  assert.equal(eurDeCapitalConVolcado(continente), 61000)
})

test('🚨 «0», «» y el texto no numérico NO son capital: son ausencia', () => {
  for (const basura of ['0', '0.00', '', '   ', '-', 'N/A', 'sin dato', 'según condicionado', null, undefined, {}, []]) {
    assert.equal(importeDelVolcado(basura), null, `«${String(basura)}» no puede ser un capital`)
    const { continente } = capitalesHogar(OCCIDENT_REAL, { continente: basura, contenido: basura })
    assert.notEqual(continente.estado, 'del_volcado', `«${String(basura)}» no puede ascender a capital`)
    assert.equal(eurDeCapitalConVolcado(continente), null)
  }
  // Y los negativos tampoco: un capital asegurado negativo no existe.
  assert.equal(importeDelVolcado('-61000'), null)
  // Lo que sí es un importe, lo es venga como texto o como número.
  assert.equal(importeDelVolcado('61000'), 61000)
  assert.equal(importeDelVolcado(' 61000 '), 61000)
  assert.equal(importeDelVolcado('61000,50'), 61000.5)
  assert.equal(importeDelVolcado(61000), 61000)
})

test('sin volcado, los estados de hoy NO cambian de semántica', () => {
  // Mismos asertos que los tests de arriba, pero comprobando que añadir el
  // parámetro no ha movido nada cuando no se pasa.
  assert.equal(capitalAsegurado(OCCIDENT_REAL, 'vivienda').estado, 'sin_capital')
  assert.equal(capitalAsegurado([g('Roturas vivienda', '1500'), g('Daños electricos vivienda', '6591')], 'vivienda').estado, 'solo_sublimites')
  assert.equal(capitalAsegurado([g('Daños vivienda', '0'), g('Robo vivienda', '0')], 'vivienda').estado, 'todo_cero')
  assert.equal(capitalAsegurado([g('Asistencia hogar', '300')], 'vivienda').estado, 'sin_garantias')
  assert.equal(capitalAsegurado(HOGAR_REAL, 'vivienda').estado, 'consenso')
  // Y con un volcado VACÍO tampoco: el estado es el mismo, solo cambia el motivo.
  const vacio = { continente: '', contenido: '' }
  assert.equal(capitalesHogar(OCCIDENT_REAL, vacio).continente.estado, 'sin_capital')
  assert.equal(capitalesHogar(HOGAR_REAL, vacio).continente.estado, 'consenso')
  assert.equal(capitalesHogar([], vacio).continente.estado, 'sin_garantias')
})

test('🚨 «no lo hay» solo se dice cuando se ha MIRADO el volcado', () => {
  // Sin mirar: el motivo no puede afirmar nada del volcado.
  const sinMirar = capitalAsegurado(OCCIDENT_REAL, 'vivienda')
  assert.ok(sinMirar.estado !== 'consenso' && sinMirar.estado !== 'del_volcado')
  assert.ok(!/volcado/i.test(sinMirar.motivo), 'sin mirarlo no se puede hablar del volcado')

  // Mirado y sin importe: entonces sí, y se dice.
  const mirado = capitalAsegurado(OCCIDENT_REAL, 'vivienda', { importe: '' })
  assert.ok(mirado.estado !== 'consenso' && mirado.estado !== 'del_volcado')
  assert.match(mirado.motivo, /volcado tampoco trae un importe/i)
  assert.equal(mirado.estado, sinMirar.estado, 'mirar el volcado no cambia el estado, solo el motivo')
})

test('🚨 el motivo de `sin_capital` NO puede negar que la póliza traiga capitales', () => {
  // El texto viejo decía «esta compañía las manda sin importe propio» y que la
  // suma asegurada «viaja en el campo Bien, que la ingesta todavía no guarda».
  // Las dos frases eran falsas en GPDFS3000276: 11 de sus 40 coberturas SÍ
  // traen capital, y la suma asegurada SÍ estaba guardada (en el volcado).
  const c = capitalAsegurado(OCCIDENT_REAL, 'vivienda')
  assert.equal(c.estado, 'sin_capital')
  if (c.estado !== 'sin_capital') return
  assert.ok(!/esta compañía las manda sin importe propio/.test(c.motivo))
  // Se afirma solo del LADO, con el número de garantías que se han mirado —dos
  // en este fixture («Robo del continente» y «Desperfectos al continente por
  // robo»), no las 40 de la póliza ni las 11 que traen importe.
  assert.match(c.motivo, /Ninguna de las 2 garantías de vivienda/)
  // Y se dice explícitamente que no habla de las demás garantías.
  assert.match(c.motivo, /de las demás garantías de la póliza esto no dice nada/)
})

test('`solo_sublimites` sigue sin ascender el mayor, tenga volcado o no', () => {
  const sueltos = [g('Roturas vivienda', '1500'), g('Daños electricos vivienda', '6591')]
  // Sin volcado: sigue siendo «no se sabe», y el mayor va etiquetado.
  const sin = capitalAsegurado(sueltos, 'vivienda', { importe: '' })
  assert.equal(sin.estado, 'solo_sublimites')
  if (sin.estado === 'solo_sublimites') assert.equal(sin.mayorEur, 6591)
  // Con volcado: el capital sale del volcado, NUNCA del sublímite de 6.591€.
  const con = capitalAsegurado(sueltos, 'vivienda', { importe: '61000' })
  assert.equal(con.estado, 'del_volcado')
  assert.equal(eurDeCapitalConVolcado(con), 61000)
  assert.ok(!JSON.stringify(con).includes('6591'), 'el sublímite no puede colarse como capital')
})

test('🚨 la RC de 176.043,86€ tampoco se cuela ahora que hay una segunda fuente', () => {
  // Cepo del caso real: GPDFS3000276 lleva la RC del inmueble a 176.043,86€.
  // Ni con volcado ni sin él puede salir por el lado de la vivienda.
  const conRc: CoberturaLeible[] = [
    g('Robo del continente', null),
    g('Desperfectos al continente por robo', null),
    g('Goteras procedentes de viviendas contiguas o superiores', null),
    g('Responsabilidad civil del inmueble', '176043.86'),
    g('Reclamación y defensa jurídica básica', '3000.00'),
  ]
  for (const volcado of [null, VOLCADO_OCCIDENT]) {
    const c = capitalAsegurado(conRc, 'vivienda', volcado ? { importe: volcado.continente } : null)
    assert.ok(!JSON.stringify(c).includes('176043'), 'el límite de RC no es capital del continente')
  }
})
