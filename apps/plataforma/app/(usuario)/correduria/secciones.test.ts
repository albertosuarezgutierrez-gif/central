import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SECCIONES, seccionDeParametro, esAccionable, contarAccionables, agregarContadores,
  textoVencidasAntiguas,
  textoListaTruncada,
} from './secciones.ts'

/**
 * Las cinco secciones de la correduría.
 *
 * Lo que se vigila aquí no es el reparto (eso es una decisión de diseño que
 * puede cambiar) sino las dos cosas que, si se rompen, la pantalla MIENTE:
 *   1. un `?s=` inventado no puede dejarla en blanco;
 *   2. un contador que no se ha podido leer no puede acabar pintado como 0
 *      —que es lo que hace que una pestaña esconda trabajo en silencio—, ni
 *      un contador que aún no ha cargado puede pintarse como una alarma.
 */

test('un ?s= desconocido o ausente cae en «Hoy», no en blanco', () => {
  assert.equal(seccionDeParametro(undefined), 'hoy')
  assert.equal(seccionDeParametro(''), 'hoy')
  assert.equal(seccionDeParametro('inventada'), 'hoy')
  assert.equal(seccionDeParametro('comisiones'), 'comisiones')
  // Next puede entregar el parámetro repetido como array.
  assert.equal(seccionDeParametro(['datos', 'hoy']), 'datos')
})

test('todas las secciones declaradas se resuelven a sí mismas', () => {
  for (const s of SECCIONES) assert.equal(seccionDeParametro(s), s)
  // El listado filtrable vive en su propia sección: es la herramienta de
  // trabajo, y compartir pestaña con la foto de la cartera haría que el
  // resumen —que se mira una vez al día— compitiera con el filtro.
  assert.ok(SECCIONES.includes('clientes'))
})

test('la salud de la ingesta de CIMA tiene sección propia en esta pantalla', () => {
  // No es un capricho de reparto: el panel equivalente vive en el CRM de origen
  // (`app.grupoasegura.com/salud-cima`), una app en la que Alberto no entra. Si
  // esta sección desaparece, la única forma de enterarse de que CIMA ha dejado
  // de traer datos vuelve a ser un Telegram que se pierde entre otros.
  assert.ok(SECCIONES.includes('ingesta'))
  assert.equal(seccionDeParametro('ingesta'), 'ingesta')
})

test('«a tiempo» NO es trabajo de hoy; las tres urgencias del preaviso sí', () => {
  assert.equal(esAccionable('vencida'), true)
  assert.equal(esAccionable('prorroga_inevitable'), true)
  assert.equal(esAccionable('ultima_llamada'), true)
  assert.equal(esAccionable('a_tiempo'), false)
  // Una urgencia que el puerto invente mañana no se cuela como accionable.
  assert.equal(esAccionable('lo_que_sea'), false)
})

test('contarAccionables: sin lista es «no se sabe», nunca 0', () => {
  assert.equal(contarAccionables(null), null)
  assert.equal(contarAccionables(undefined), null)
  assert.equal(contarAccionables([]), 0)
  assert.equal(
    contarAccionables([{ urgencia: 'vencida' }, { urgencia: 'a_tiempo' }, { urgencia: 'ultima_llamada' }]),
    2,
  )
})

test('agregarContadores: todo legible → el total exacto', () => {
  assert.deepEqual(agregarContadores([2, 3, 0]), { n: 5, parcial: false })
})

test('agregarContadores: una cola ilegible marca el total como SUELO, no lo esconde', () => {
  // 2 + 3 + «no se sabe» no puede pintarse como un 5 limpio: eso taparía justo
  // la cola caída. Se dice «hay al menos 5» (la barra pinta «5+»).
  assert.deepEqual(agregarContadores([2, 3, null]), { n: 5, parcial: true })
})

test('agregarContadores: si NINGUNA cola es legible, el resultado es null (se pinta «!», no 0)', () => {
  assert.equal(agregarContadores([null, null]), null)
})

test('agregarContadores: lo que aún no ha cargado no es una alarma', () => {
  // Al abrir la pantalla todos los bloques están en `undefined`. Si eso contara
  // como hueco, la barra saldría con un «!» en cada pestaña durante la carga y
  // Alberto aprendería a ignorarlo.
  assert.deepEqual(agregarContadores([undefined, undefined]), { n: 0, parcial: false })
  assert.deepEqual(agregarContadores([4, undefined]), { n: 4, parcial: false })
  // Pero un `null` de verdad mezclado con lo que aún carga SÍ es un hueco.
  assert.deepEqual(agregarContadores([4, undefined, null]), { n: 4, parcial: true })
})

test('agregarContadores: el 0 legible es un VALOR, no un hueco', () => {
  assert.deepEqual(agregarContadores([0]), { n: 0, parcial: false })
})

// ─── Las VENCIDAS son trabajo de hoy (20/09/2026) ────────────────────────────
// Hasta ese día esta rama era inalcanzable: el puerto de asegura filtraba
// `fechaVencimiento >= hoy` y una póliza vencida no llegaba nunca a la lista, así
// que este contador no podía sumarla. Medido contra la BD: 9 pólizas de Mapfre
// vencidas entre 41 y 107 días, 4.377,51 € de prima, con el badge a 0.
test('una póliza YA VENCIDA suma en el contador de «Hoy», no se pierde', () => {
  assert.equal(
    contarAccionables([
      { urgencia: 'vencida' },          // venció hace 41 días: recuperación
      { urgencia: 'vencida' },          // venció hace 107 días: sigue contando
      { urgencia: 'prorroga_inevitable' },
      { urgencia: 'a_tiempo' },         // vence dentro de 70: eso es «Cartera»
    ]),
    3,
  )
  // Y sola: el caso que el bug volvía invisible por completo.
  assert.equal(contarAccionables([{ urgencia: 'vencida' }]), 1)
})

// ─── Las vigentes con vencimiento de hace años se DECLARAN ───────────────────
test('textoVencidasAntiguas: tres estados, tres frases DISTINTAS', () => {
  const noLlega = textoVencidasAntiguas(undefined)
  const noSePudo = textoVencidasAntiguas(null)
  const ninguna = textoVencidasAntiguas(0)
  const hay = textoVencidasAntiguas(8)
  // Ninguna se parece a otra: cada una manda a mirar a un sitio distinto
  // (desplegar asegura / mirar el puerto / nada / depurar la cartera).
  assert.equal(new Set([noLlega, noSePudo, ninguna, hay]).size, 4)
  // Y los dos «no lo sé» NO pueden leerse como «no hay ninguna».
  for (const frase of [noLlega, noSePudo]) {
    assert.ok(!/^Ninguna/.test(frase), `«${frase}» empieza afirmando una ausencia no comprobada`)
  }
  assert.match(noLlega, /no llega por el puerto/)
  assert.match(noSePudo, /No se ha podido contar/)
  // El 0 SÍ es una afirmación: se ha mirado y no hay.
  assert.match(ninguna, /^Ninguna póliza vigente/)
})

test('textoVencidasAntiguas: concuerda en singular y en plural', () => {
  assert.match(textoVencidasAntiguas(1), /^1 póliza figura vigente/)
  assert.match(textoVencidasAntiguas(8), /^8 pólizas figuran vigentes/)
  // Las 8 medidas el 20/09/2026 son dato a depurar, no trabajo de hoy.
  assert.match(textoVencidasAntiguas(8), /no entran en la lista ni en el contador de «Hoy»/)
})

// ── El techo de una lista del puerto ────────────────────────────────────────

test('🚨 textoListaTruncada: `true` dice que FALTA lista y que los totales son bajos', () => {
  const t = textoListaTruncada(true, 'renovaciones')
  assert.ok(t !== null, 'con la lista recortada la pantalla NO puede callarse')
  assert.match(t!, /RECORTADA/)
  assert.match(t!, /renovaciones/)
  // Lo que se lee justo debajo (totales, recuentos) sale corto: hay que decirlo.
  assert.match(t!, /más bajos/)
})

test('🚨 textoListaTruncada: `null` NO es `false` — el estado que importa', () => {
  // `false` = asegura lo comprobó y no recortó → silencio (un cartel
  // permanente de «está completa» se deja de leer, y con él el del `true`).
  assert.equal(textoListaTruncada(false, 'renovaciones'), null)

  // `null`/`undefined` = asegura no manda el campo. Colapsarlo con `false`
  // convertiría un «no lo he comprobado» en «esto es todo».
  for (const v of [null, undefined]) {
    const t = textoListaTruncada(v, 'renovaciones')
    assert.ok(t !== null, 'un puerto que no informa el techo no autoriza a afirmar que la lista está completa')
    assert.match(t!, /no se puede afirmar/)
  }

  // Y las dos frases que SÍ se dicen tienen que ser DISTINTAS: se arreglan en
  // sitios distintos (subir el tope vs. desplegar asegura).
  assert.notEqual(textoListaTruncada(true, 'renovaciones'), textoListaTruncada(null, 'renovaciones'))
})

test('textoListaTruncada: el sujeto viaja tal cual, sin concordancias inventadas', () => {
  assert.match(textoListaTruncada(true, 'pólizas sin cobrar')!, /pólizas sin cobrar/)
  assert.match(textoListaTruncada(null, 'pólizas sin cobrar')!, /pólizas sin cobrar/)
})

// ── Y que las pantallas lo PINTEN ───────────────────────────────────────────
// Un tope que la pantalla no puede declarar no sirve: sería el mismo recorte
// mudo, movido del servidor al cliente. Se lee el FUENTE porque esto vive en
// JSX y en un `tgAviso`, donde ni `tsc` ni el build miran.

const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const leerFuente = (p: string) => sinComentarios(readFileSync(new URL(p, import.meta.url), 'utf8'))

test('🚨 Renovaciones declara el techo, y TAMBIÉN con la lista vacía', () => {
  const src = leerFuente('./Renovaciones.tsx')
  assert.match(src, /textoListaTruncada/, 'Renovaciones dejó de declarar el techo de la lista')
  assert.match(src, /truncado\?: boolean \| null/, 'el tri-estado se perdió por el camino')
  // Dos sitios: con lista y sin ella. «Ninguna vence» sobre una lista
  // recortada es la frase tranquilizadora que nadie ha comprobado.
  const usos = src.match(/<AvisoTruncado/g) ?? []
  assert.ok(usos.length >= 2, `el aviso del techo se pinta en ${usos.length} sitio(s); falta el de la lista vacía`)
})

test('🚨 la cola de retención declara el techo junto a sus otros dos huecos', () => {
  const src = leerFuente('./Retencion.tsx')
  assert.match(src, /textoListaTruncada\(datos\.truncado, 'pólizas sin cobrar'\)/,
    'Retencion dejó de declarar el techo de la criba de recibos')
})

test('🚨 una lectura de comisiones RECORTADA marca el libro como no comprobado', () => {
  // El libro no tiene pantalla propia: sus filas las escribe el cron y
  // `estadoCuadre` las pinta `no-comprobado` cuando `leido_ok = false`. Ese es
  // el camino que ya existía para un fallo de lectura, y un recorte es una
  // lectura incompleta: dejarlo en `true` daría filas con cara de comprobadas.
  const src = leerFuente('../../api/cron/cima-liq/route.ts')
  // Guarda Y escritura, JUNTAS: `leido_ok = false` ya aparece en la rama de
  // error de arriba y `com.truncado === true` en el texto del latido, así que
  // mirarlos por separado dejaba pasar que la rama del recorte no escribiera.
  assert.match(
    src,
    /if \(com\.truncado === true\)[\s\S]{0,400}?UPDATE comisiones_devengo SET leido_ok = false/,
    'la lectura recortada ya no marca el libro como no comprobado',
  )
  // `null` no puede tratarse como `false`: no se sabe si vino recortada.
  assert.match(src, /com\.truncado === null/, 'el «no se sabe» se colapsó con «lectura completa»')
})
