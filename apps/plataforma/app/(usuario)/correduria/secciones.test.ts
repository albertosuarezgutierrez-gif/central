import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SECCIONES, seccionDeParametro, esAccionable, contarAccionables, agregarContadores,
  textoVencidasAntiguas,
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
