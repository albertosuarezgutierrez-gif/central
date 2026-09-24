// `resolverTipoViaPorNombre()`: el callejero preguntado con `TipoVia` VACÍO,
// para el caso en que no se sabe de antemano el tipo de vía de una calle.
// Con red simulada — el servicio real no es alcanzable desde aquí (proxy de
// agente) y de todos modos no hay que gastar sus llamadas para verificar el
// parseo y el desempate.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverTipoViaPorNombre } from './http.ts'

const XML_UNA_VIA =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero><calle>' +
  '<tv>CL</tv><nv>SOCORRO</nv></calle></callejero></consulta_callejero>'

const XML_DOS_VIAS_AMBIGUAS =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero>' +
  '<calle><tv>CL</tv><nv>SAN VICENTE</nv></calle>' +
  '<calle><tv>AV</tv><nv>SAN VICENTE</nv></calle>' +
  '</callejero></consulta_callejero>'

const XML_SIN_VIAS =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero></callejero></consulta_callejero>'

/** Corre `fn` con `fetch` simulado devolviendo siempre `cuerpo`. */
async function conFetchSimulado<T>(cuerpo: string, fn: () => Promise<T>): Promise<T> {
  const fetchReal = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => cuerpo })) as unknown as typeof fetch
  try {
    return await fn()
  } finally {
    globalThis.fetch = fetchReal
  }
}

test('resolverTipoViaPorNombre: una única vía candidata devuelve su tipo', async () => {
  const r = await conFetchSimulado(XML_UNA_VIA, () => resolverTipoViaPorNombre('Sevilla', 'SEVILLA', 'Socorro'))
  assert.equal(r.tipo, 'CL')
  assert.equal(r.nombre, 'SOCORRO')
  assert.equal(r.ambigua, false)
})

test('resolverTipoViaPorNombre: dos vías con el mismo nombre y distinto tipo son ambiguas', async () => {
  const r = await conFetchSimulado(XML_DOS_VIAS_AMBIGUAS, () =>
    resolverTipoViaPorNombre('Sevilla', 'SEVILLA', 'San Vicente'),
  )
  assert.equal(r.tipo, null)
  assert.equal(r.ambigua, true, 'con candidatas y ninguna ganadora clara, es ambigüedad, no ausencia')
})

test('resolverTipoViaPorNombre: el callejero no conoce la calle → no_encontrada, no ambigua', async () => {
  const r = await conFetchSimulado(XML_SIN_VIAS, () =>
    resolverTipoViaPorNombre('Sevilla', 'SEVILLA', 'Severo Ochoa'),
  )
  assert.equal(r.tipo, null)
  assert.equal(r.ambigua, false, 'sin ninguna vía en la respuesta no hay ambigüedad: es que no está')
})
