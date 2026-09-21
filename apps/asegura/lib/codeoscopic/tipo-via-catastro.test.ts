import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tipoViaDelTomadorPorCatastro } from './tipo-via-catastro.ts'
import type { ClienteCartera } from './desde-cartera.ts'

// Persona inventada. Ningún cliente real aquí.
const CLIENTE_SIN_TIPO: ClienteCartera = {
  nombre: 'Nombre',
  apellidos: 'Apellido Segundo',
  dni: '00000000T',
  telefono: '600000000',
  fechaNacimiento: '1970-01-01',
  estadoCivil: 'Casado',
  saludo: '1',
  codigoPostal: '41003',
  fechaCarnet: null,
  direccion: 'Severo Ochoa 12',
}

const CATALOGO_VIAS = [
  { id: 'Street', nombre: 'Calle' },
  { id: 'Avenue', nombre: 'Avenida' },
]

const XML_UNA_VIA =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero><calle>' +
  '<tv>CL</tv><nv>SEVERO OCHOA</nv></calle></callejero></consulta_callejero>'
const XML_SIN_VIAS =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero></callejero></consulta_callejero>'
const XML_DOS_VIAS_AMBIGUAS =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero>' +
  '<calle><tv>CL</tv><nv>SEVERO OCHOA</nv></calle>' +
  '<calle><tv>AV</tv><nv>SEVERO OCHOA</nv></calle>' +
  '</callejero></consulta_callejero>'
const XML_TIPO_SIN_CATALOGO =
  '<?xml version="1.0" encoding="utf-8"?><consulta_callejero><callejero><calle>' +
  '<tv>PG</tv><nv>SEVERO OCHOA</nv></calle></callejero></consulta_callejero>'

async function conFetchSimulado<T>(cuerpo: string, fn: () => Promise<T>): Promise<T> {
  const fetchReal = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: true, status: 200, text: async () => cuerpo })) as unknown as typeof fetch
  try {
    return await fn()
  } finally {
    globalThis.fetch = fetchReal
  }
}

test('sin provincia o municipio resueltos, no se pregunta al Catastro', async () => {
  const r1 = await tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, null, 'SEVILLA', CATALOGO_VIAS)
  assert.equal(r1.estado, 'sin_datos_para_preguntar')
  const r2 = await tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, 'Sevilla', null, CATALOGO_VIAS)
  assert.equal(r2.estado, 'sin_datos_para_preguntar')
})

test('sin calle que trocear (dirección vacía), no se pregunta', async () => {
  const r = await tipoViaDelTomadorPorCatastro(
    { ...CLIENTE_SIN_TIPO, direccion: null },
    'Sevilla',
    'SEVILLA',
    CATALOGO_VIAS,
  )
  assert.equal(r.estado, 'sin_calle')
})

test('el callejero encuentra el tipo y casa con el catálogo: ok', async () => {
  const r = await conFetchSimulado(XML_UNA_VIA, () =>
    tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, 'Sevilla', 'SEVILLA', CATALOGO_VIAS),
  )
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.opcion.id, 'Street')
    assert.equal(r.nombreCatastro, 'Calle')
  }
})

test('el callejero no conoce la calle: no_encontrada', async () => {
  const r = await conFetchSimulado(XML_SIN_VIAS, () =>
    tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, 'Sevilla', 'SEVILLA', CATALOGO_VIAS),
  )
  assert.equal(r.estado, 'no_encontrada')
})

test('el callejero tiene varias calles y ninguna gana: ambigua', async () => {
  const r = await conFetchSimulado(XML_DOS_VIAS_AMBIGUAS, () =>
    tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, 'Sevilla', 'SEVILLA', CATALOGO_VIAS),
  )
  assert.equal(r.estado, 'ambigua')
})

test('el Catastro tiene un tipo que Codeoscopic no ofrece: sin_match_catalogo', async () => {
  const r = await conFetchSimulado(XML_TIPO_SIN_CATALOGO, () =>
    tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, 'Sevilla', 'SEVILLA', CATALOGO_VIAS),
  )
  assert.equal(r.estado, 'sin_match_catalogo')
  if (r.estado === 'sin_match_catalogo') assert.equal(r.nombreCatastro, 'Polígono')
})

test('un fallo de red no se afirma como ausencia: error', async () => {
  const fetchReal = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch
  try {
    const r = await tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, 'Sevilla', 'SEVILLA', CATALOGO_VIAS)
    assert.equal(r.estado, 'error')
  } finally {
    globalThis.fetch = fetchReal
  }
})

test('provincia bilingüe: sin match con el nombre moderno, reintenta con el clásico', async () => {
  let vista: string[] = []
  const fetchReal = globalThis.fetch
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url)
    vista.push(u)
    // Solo la forma clásica («Vizcaya») encuentra algo; la moderna («Bizkaia») no.
    const cuerpo = u.includes('Provincia=Vizcaya') ? XML_UNA_VIA : XML_SIN_VIAS
    return { ok: true, status: 200, text: async () => cuerpo }
  }) as unknown as typeof fetch
  try {
    const r = await tipoViaDelTomadorPorCatastro(CLIENTE_SIN_TIPO, 'Bizkaia', 'BILBAO', CATALOGO_VIAS)
    assert.equal(r.estado, 'ok', 'el reintento con el nombre clásico tiene que rescatar el match')
    assert.ok(vista.some((u) => u.includes('Provincia=Bizkaia')), 'primero se prueba con el nombre tal cual llega')
    assert.ok(vista.some((u) => u.includes('Provincia=Vizcaya')), 'y luego con el alias clásico')
  } finally {
    globalThis.fetch = fetchReal
  }
})
