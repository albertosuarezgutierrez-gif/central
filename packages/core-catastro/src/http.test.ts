// Guardián de la FUGA POR EL LOG del adaptador HTTP del Catastro.
//
// Una referencia catastral identifica UNA VIVIENDA. En `apps/asegura-portal` la
// consulta va atada a la sesión de un cliente, así que una línea de log con la
// referencia es un registro de «qué vivienda miró esta persona» — dato personal
// que nadie decidió guardar. Hasta el 04/09/2026 `bajarCatastro()` hacía
// `console.warn('[catastro]', refCatastral, err)`.
//
// Este fichero tiene DOS cepos, y hacen falta los dos:
//   1. uno de COMPORTAMIENTO, que ejecuta la función con la red simulada y mira
//      lo que sale de verdad por `console.warn`;
//   2. uno ESTÁTICO sobre el código, que caza la reintroducción por otra puerta
//      (la URL de la petición lleva la referencia como parámetro, y un
//      `console.log(url)` de depuración filtra exactamente lo mismo).
//
// ⚠️ El estático BORRA LOS COMENTARIOS antes de mirar: el propio `http.ts`
// documenta la línea vieja como ejemplo de lo que no se hace, y sin eso el
// guardián se mordería a sí mismo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bajarCatastro, motivoParaLog } from './http.ts'

/** Una referencia REAL de 20: 14 de parcela + 6 del bien. */
const REF = '9872023VH5797S0001WX'
const PARCELA = REF.slice(0, 14)
const XML_ERROR =
  '<?xml version="1.0" encoding="utf-8"?><consulta_dnp><control><cudnp>0</cudnp></control>' +
  '<lerr><err><cod>1</cod><des>LA REFERENCIA CATASTRAL NO EXISTE</des></err></lerr></consulta_dnp>'

/** Corre `fn` con `fetch` simulado y devuelve todo lo que se escribió al log. */
async function conLogCapturado(cuerpo: string, fn: () => Promise<unknown>): Promise<{ log: string; valor: unknown }> {
  const fetchReal = globalThis.fetch
  const warnReal = console.warn
  const errorReal = console.error
  const logReal = console.log
  const lineas: string[] = []
  const capturar = (...args: unknown[]) => {
    lineas.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '))
  }
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => cuerpo })) as unknown as typeof fetch
  console.warn = capturar
  console.error = capturar
  console.log = capturar
  try {
    const valor = await fn()
    return { log: lineas.join('\n'), valor }
  } finally {
    globalThis.fetch = fetchReal
    console.warn = warnReal
    console.error = errorReal
    console.log = logReal
  }
}

test('el log de un error del Catastro NO lleva la referencia, ni entera ni a trozos', async () => {
  const { log, valor } = await conLogCapturado(XML_ERROR, () => bajarCatastro(REF))

  assert.equal(valor, null, 'un `<des>` de error sigue siendo `null`, no una ficha vacía')
  assert.ok(log.length > 0, 'quitar el log entero deja ciego a quien investigue un corte: tiene que decir algo')

  assert.ok(!log.includes(REF), 'la referencia completa no puede salir en el log')
  assert.ok(!log.includes(PARCELA), 'los 14 de parcela son el EDIFICIO: recortar no es anonimizar')
  // Cualquier trozo largo de la referencia vale para reidentificar el inmueble.
  for (let i = 0; i + 8 <= REF.length; i++) {
    assert.ok(!log.includes(REF.slice(i, i + 8)), `trozo de la referencia en el log: ${REF.slice(i, i + 8)}`)
  }
  // La URL lleva la referencia como parámetro: es la misma fuga por otra puerta.
  assert.ok(!log.includes('ovc.catastro'), 'la URL de la petición no se loguea')
  assert.ok(!log.toLowerCase().includes('rc='), 'ni el parámetro RC de la URL')
})

test('el log SÍ dice qué falló y por qué: sigue sirviendo para diagnosticar', async () => {
  const { log } = await conLogCapturado(XML_ERROR, () => bajarCatastro(REF))

  assert.ok(log.includes('[catastro]'), 'la etiqueta de la fuente, para poder filtrar los logs')
  assert.ok(log.includes('LA REFERENCIA CATASTRAL NO EXISTE'), 'el `<des>` del servicio es EL motivo del fallo')
  assert.match(log, /#\d+/, 'una etiqueta opaca por llamada, para correlacionar sin identificar')
  assert.match(log, /\d+\s?ms/, 'cuánto tardó: un corte del Catastro se diagnostica por el tiempo')
})

test('motivoParaLog tacha una referencia que viniera DENTRO del mensaje del servicio', () => {
  assert.equal(motivoParaLog(`NO EXISTE LA RC ${REF}`), 'NO EXISTE LA RC [ref-oculta]')
  assert.equal(motivoParaLog(`PARCELA ${PARCELA} NO ENCONTRADA`), 'PARCELA [ref-oculta] NO ENCONTRADA')
  // Un mensaje normal se conserva palabra por palabra: tachar de más es tan
  // malo como no tachar, porque el `<des>` es lo único que explica el fallo.
  assert.equal(motivoParaLog('LA REFERENCIA CATASTRAL NO EXISTE'), 'LA REFERENCIA CATASTRAL NO EXISTE')
  assert.ok(motivoParaLog('X'.repeat(500)).length <= 200, 'un cuerpo raro no vuelca medio XML al log')
})

test('ninguna línea de log de http.ts nombra la referencia, la dirección o la URL', () => {
  const fuente = readFileSync(new URL('./http.ts', import.meta.url), 'utf8')
  // Sin comentarios: el fichero DOCUMENTA la línea vieja como ejemplo de lo que
  // no se hace, y un guardián que no los quite se muerde a sí mismo.
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  const prohibidos = ['refCatastral', 'rc14', 'url', 'CATASTRO_DIR', 'CATASTRO_COORD', 'p.calle', 'q.toString', 'termino']
  const lineas = codigo.split('\n').filter((l) => /console\.(log|warn|error|info|debug)/.test(l))
  assert.ok(lineas.length > 0, 'si no queda ningún log, el diagnóstico de un corte se hace a ciegas')
  for (const linea of lineas) {
    for (const p of prohibidos) {
      assert.ok(!linea.includes(p), `«${p}» identifica la vivienda (o la lleva dentro) y no puede ir a un log: ${linea.trim()}`)
    }
  }
})
