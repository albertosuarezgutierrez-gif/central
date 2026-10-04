import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FiguraFicha, TerceroFicha } from '@central/module-seguros'
import {
  CAMPOS_TERCERO_CLIENTE,
  CAMPOS_TERCERO_PROHIBIDOS,
  personasParaCliente,
  terceroParaCliente,
  tercerosParaCliente,
} from './personas-cliente.ts'

const FIGURA: FiguraFicha = {
  papel: 'conductor_habitual',
  etiqueta: 'Conductor habitual',
  claseFigura: null,
  tipoPersona: 'fisica',
  nombre: 'Ana Pérez',
  domicilio: { direccion: 'Socorro 24', claseVia: 'Calle', cp: '41003', localidad: 'Sevilla', provincia: '41', pais: 'ESP' },
  telefono: '600111222',
  email: 'ana@example.com',
  tipoDocumento: 'NI',
  documentoConsta: true,
  orden: null,
  porcentaje: null,
  fechaNacimiento: '1980-05-02',
  ilegible: false,
}

/** Un contrario con TODO relleno: cualquier campo que se cuele se ve. */
const CONTRARIO = {
  ...FIGURA,
  papel: 'contrario',
  etiqueta: 'Contrario',
  claseFigura: 'TE',
  orden: '1',
  porcentaje: '50',
  matricula: '1234ABC',
  compania: 'MAPFRE',
  codigoEntidadDgs: 'C0058',
  numeroPoliza: 'P-77',
  responsabilidad: 'CAUSANTE',
  // Lo que guarda la ingesta, por si un asegura roto lo mandara tal cual.
  documentoCifrado: 'v1:abc',
  documento: '12345678Z',
  documentoFinal: '678Z',
} satisfies TerceroFicha & Record<string, unknown>

const salida = terceroParaCliente(CONTRARIO)!

test('tercero: sale EXACTAMENTE la lista blanca (papel, etiqueta, nombre, matrícula, compañía)', () => {
  assert.deepEqual(Object.keys(salida).sort(), [...CAMPOS_TERCERO_CLIENTE].sort())
  assert.deepEqual(salida, { papel: 'contrario', etiqueta: 'Contrario', nombre: 'Ana Pérez', matricula: '1234ABC', compania: 'MAPFRE' })
})

// ── Un brazo por campo prohibido: si alguien lo añade a la lista blanca, cae SU test. ──
test('tercero: nunca el documento (consta)', () => assert.ok(!('documentoConsta' in salida)))
test('tercero: nunca el documento (4 últimos)', () => assert.ok(!('documentoFinal' in salida)))
test('tercero: nunca el documento cifrado', () => assert.ok(!('documentoCifrado' in salida)))
test('tercero: nunca el documento en claro', () => assert.ok(!('documento' in salida)))
test('tercero: nunca el tipo de documento', () => assert.ok(!('tipoDocumento' in salida)))
test('tercero: nunca el teléfono', () => assert.ok(!('telefono' in salida)))
test('tercero: nunca el email', () => assert.ok(!('email' in salida)))
test('tercero: nunca el domicilio', () => assert.ok(!('domicilio' in salida)))
test('tercero: nunca la fecha de nacimiento', () => assert.ok(!('fechaNacimiento' in salida)))
test('tercero: nunca la responsabilidad', () => assert.ok(!('responsabilidad' in salida)))
test('tercero: nunca el nº de póliza del contrario', () => assert.ok(!('numeroPoliza' in salida)))
test('tercero: nunca el código DGS', () => assert.ok(!('codigoEntidadDgs' in salida)))
test('tercero: nunca la clase de figura', () => assert.ok(!('claseFigura' in salida)))
test('tercero: nunca el tipo de persona', () => assert.ok(!('tipoPersona' in salida)))
test('tercero: nunca orden ni porcentaje', () => {
  assert.ok(!('orden' in salida))
  assert.ok(!('porcentaje' in salida))
})

test('tercero: ningún VALOR prohibido aparece en la salida serializada', () => {
  const json = JSON.stringify(tercerosParaCliente([CONTRARIO]))
  for (const v of ['600111222', 'ana@example.com', 'Socorro', '41003', '678Z', '12345678Z', 'v1:', 'C0058', 'P-77', 'CAUSANTE', '1980']) {
    assert.ok(!json.includes(v), `se ha colado «${v}»`)
  }
  // La lista de prohibidos y la blanca no se solapan.
  for (const k of CAMPOS_TERCERO_PROHIBIDOS) assert.ok(!(CAMPOS_TERCERO_CLIENTE as readonly string[]).includes(k), k)
})

test('tercero: la compañía solo es la del contrario; un testigo no la enseña', () => {
  assert.equal(terceroParaCliente({ ...CONTRARIO, papel: 'testigo' })?.compania, null)
  assert.equal(terceroParaCliente({ ...CONTRARIO, papel: 'conductor_contrario' })?.compania, 'MAPFRE')
  // Sin nombre, matrícula ni compañía no hay nada que enseñar.
  assert.equal(terceroParaCliente({ papel: 'testigo', telefono: '600' }), null)
  assert.ok(!JSON.stringify(terceroParaCliente({ ...CONTRARIO, nombre: 'v1:xx' })).includes('v1:'))
})

test('figuras: la suya completa (por tomador propio o mismo documento); las demás solo papel y nombre', () => {
  const r = personasParaCliente(
    [
      { figura: { ...FIGURA, papel: 'tomador', etiqueta: 'Tomador' }, documento: '99999999R' },
      { figura: FIGURA, documento: '12.345.678-z' },
      { figura: { ...FIGURA, papel: 'beneficiario', etiqueta: 'Beneficiario', nombre: 'Luis' }, documento: '11111111H' },
    ],
    { tomadorEsPropio: true, documentosPropios: ['12345678Z'] },
  )
  assert.equal(r.propias.length, 2)
  assert.equal(r.propias[1].telefono, '600111222')
  assert.equal(r.propias[1].documentoConsta, true)
  assert.ok(!('documentoFinal' in r.propias[1]))
  assert.ok(!('tipoDocumento' in r.propias[1]))
  assert.deepEqual(r.otras, [{ papel: 'beneficiario', etiqueta: 'Beneficiario', nombre: 'Luis' }])
  assert.ok(!JSON.stringify(r.otras).includes('600111222'))
})

test('figuras: el mismo NOMBRE sin documento no es él; en póliza ajena las demás no salen', () => {
  const r = personasParaCliente(
    [
      { figura: { ...FIGURA, papel: 'tomador' }, documento: null },
      { figura: FIGURA, documento: null },
      { figura: { ...FIGURA, nombre: 'Otra' }, documento: '22222222J' },
    ],
    { tomadorEsPropio: false, documentosPropios: ['12345678Z', null] },
  )
  assert.deepEqual(r, { propias: [], otras: [] })
})
