import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmarDireccion } from './confirmar.ts'

const XML_UNA_VIA_CON_TIPO =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero><calle>' +
  '<tv>CL</tv><nv>SEVERO OCHOA</nv></calle></callejero></consulta_callejero>'
const XML_SIN_VIAS =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero></callejero></consulta_callejero>'
const XML_DOS_VIAS_AMBIGUAS =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero>' +
  '<calle><tv>CL</tv><nv>SAN VICENTE</nv></calle>' +
  '<calle><tv>AV</tv><nv>SAN VICENTE</nv></calle>' +
  '</callejero></consulta_callejero>'

async function conFetchSimulado<T>(cuerpo: string, fn: () => Promise<T>): Promise<T> {
  const fetchReal = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => cuerpo })) as unknown as typeof fetch
  try {
    return await fn()
  } finally {
    globalThis.fetch = fetchReal
  }
}

test('sin provincia o municipio, no se pregunta: sin_lugar', async () => {
  const r1 = await confirmarDireccion('Severo Ochoa 12', null, 'SEVILLA')
  assert.equal(r1.estado, 'sin_lugar')
  const r2 = await confirmarDireccion('Severo Ochoa 12', 'Sevilla', null)
  assert.equal(r2.estado, 'sin_lugar')
})

test('sin calle que trocear, no se pregunta', async () => {
  const r = await confirmarDireccion(null, 'Sevilla', 'SEVILLA')
  assert.equal(r.estado, 'sin_calle')
})

test('dirección SIN tipo de vía: se pregunta al callejero por tipo y nombre', async () => {
  const r = await conFetchSimulado(XML_UNA_VIA_CON_TIPO, () => confirmarDireccion('Severo Ochoa 12', 'Sevilla', 'SEVILLA'))
  assert.equal(r.estado, 'candidato')
  if (r.estado === 'candidato') {
    assert.match(r.candidato.texto, /^Calle Severo Ochoa, 12$/)
    assert.equal(r.candidato.tipoVia, null) // sin catálogo del vendor, no se empareja
  }
})

test('dirección CON tipo de vía: se confirma/corrige solo el nombre', async () => {
  const r = await conFetchSimulado(XML_UNA_VIA_CON_TIPO, () => confirmarDireccion('Calle Severo Ochoa 12', 'Sevilla', 'SEVILLA'))
  assert.equal(r.estado, 'candidato')
  if (r.estado === 'candidato') assert.match(r.candidato.texto, /^Calle Severo Ochoa, 12$/)
})

test('el callejero no conoce la calle: no_encontrada', async () => {
  const r = await conFetchSimulado(XML_SIN_VIAS, () => confirmarDireccion('Calle Inventada 5', 'Sevilla', 'SEVILLA'))
  assert.equal(r.estado, 'no_encontrada')
})

test('varias calles con el mismo nombre y ninguna gana: ambigua', async () => {
  const r = await conFetchSimulado(XML_DOS_VIAS_AMBIGUAS, () => confirmarDireccion('San Vicente 40', 'Sevilla', 'SEVILLA'))
  assert.equal(r.estado, 'ambigua')
})

test('un fallo de red no se afirma como ausencia: error', async () => {
  const fetchReal = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch
  try {
    const r = await confirmarDireccion('Severo Ochoa 12', 'Sevilla', 'SEVILLA')
    assert.equal(r.estado, 'error')
  } finally {
    globalThis.fetch = fetchReal
  }
})

test('con un candidato IDÉNTICO a lo tecleado, sigue devolviéndose (lo colapsa el llamador, no aquí)', async () => {
  const r = await conFetchSimulado(XML_UNA_VIA_CON_TIPO, () => confirmarDireccion('Calle Severo Ochoa 12', 'Sevilla', 'SEVILLA'))
  assert.equal(r.estado, 'candidato')
})
