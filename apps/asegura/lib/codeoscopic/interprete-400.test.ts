import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarError400,
  lineasDelVendor,
  reparosDe,
  aplicarCampoPersona,
  leerCampoPersona,
  mismoValor,
  esCampoPersona,
} from './interprete-400.ts'

// El 11º 400 real (12/09/2026, proyecto 40684860), tal cual lo devolvió
// `ErrorCodeoscopic.message`. Fixture copiado del incidente, no redactado.
const UNDECIMO =
  'codeoscopic_validacion: {"error":"Bad Request","message":"The road name of the address of the holder is mandatory.\\nThe road name of the address of the primary driver is mandatory.\\nThe road name of the address of the owner is mandatory.","path":"/insurances/40684860/offers","requestId":"55c8cc5e-113331","status":400,"timestamp":"2026-09-12T11:02:10.000Z"}'

test('el 11º 400 real se traduce a UN campo (nombreVia) en los tres papeles', () => {
  const r = interpretarError400(UNDECIMO)
  assert.equal(r.campos.length, 1)
  assert.equal(r.campos[0].campo, 'nombreVia')
  assert.deepEqual(r.campos[0].papeles.sort(), ['holder', 'owner', 'primaryDriver'])
  assert.equal(r.campos[0].textos.length, 3)
  assert.deepEqual(r.noReconocidos, [])
})

test('acepta el `detalle` pelado (JSON sin el prefijo codeoscopic_)', () => {
  const detalle = UNDECIMO.replace(/^codeoscopic_validacion:\s*/, '')
  assert.equal(interpretarError400(detalle).campos[0]?.campo, 'nombreVia')
})

test('una línea que no se reconoce va a noReconocidos ENTERA, nunca se calla', () => {
  const r = interpretarError400(
    '{"message":"The road name of the address of the holder is mandatory.\\nThe `policyApplications` body part is required."}',
  )
  assert.equal(r.campos.length, 1)
  assert.deepEqual(r.noReconocidos, ['The `policyApplications` body part is required.'])
})

test('varios campos distintos salen separados, con su papel', () => {
  const r = interpretarError400(
    '{"message":"The phone of the holder is mandatory.\\nThe marital status of the primary driver is mandatory.\\nThe driving license date of the primary driver is mandatory."}',
  )
  const porCampo = Object.fromEntries(r.campos.map((c) => [c.campo, c.papeles]))
  assert.deepEqual(porCampo, {
    telefono: ['holder'],
    estadoCivil: ['primaryDriver'],
    fechaCarnet: ['primaryDriver'],
  })
})

test('«primary driver» no se confunde con «driver» ni «name» con «surname»', () => {
  const r = interpretarError400('{"message":"The surname of the primary driver is mandatory."}')
  assert.equal(r.campos[0].campo, 'apellido1')
  assert.deepEqual(r.campos[0].papeles, ['primaryDriver'])
})

test('sin JSON legible, el texto entero es una única línea (recortado a media llave)', () => {
  const lineas = lineasDelVendor('codeoscopic_validacion: {"error":"Bad Request","message":"The road na')
  assert.equal(lineas.length, 1)
  assert.match(lineas[0], /road na/)
})

test('reparosDe da Reparo[] con el texto literal del vendor en el motivo', () => {
  const r = reparosDe(interpretarError400(UNDECIMO))
  assert.equal(r.length, 1)
  assert.equal(r[0].campo, 'nombreVia')
  assert.match(r[0].motivo, /road name of the address of the holder/)
})

// ─── Escribir en la persona del proyecto ─────────────────────────────────────

const PERSONA = {
  identificationDocument: { type: { id: 'Dni' }, id: '00000000T' },
  name: 'Nombre',
  surname: 'Apellido',
  addresses: [{ postalCode: '41003', town: { id: 12345 }, primary: true }],
  phones: [{ number: '600000000', primary: true }],
}

test('nombreVia se escribe DENTRO de addresses[0] y se lee de vuelta', () => {
  const p = aplicarCampoPersona(PERSONA, 'nombreVia', ' Calle Betis ')
  assert.equal(leerCampoPersona(p, 'nombreVia'), 'Calle Betis')
  // No muta la original y conserva CP/municipio.
  assert.equal(leerCampoPersona(PERSONA, 'nombreVia'), null)
  assert.equal(leerCampoPersona(p, 'cpResidencia'), '41003')
  assert.equal(leerCampoPersona(p, 'municipioResidenciaId'), '12345')
})

test('sin dirección previa, nombreVia NO crea una dirección a medias', () => {
  const p = aplicarCampoPersona({ name: 'X' }, 'nombreVia', 'Calle Betis')
  assert.equal(p.addresses, undefined)
  assert.equal(leerCampoPersona(p, 'nombreVia'), null)
})

test('el resto de campos usan las mismas claves que construirPersona()', () => {
  let p: unknown = PERSONA
  p = aplicarCampoPersona(p, 'telefono', '600 11 22 33')
  p = aplicarCampoPersona(p, 'sexo', 'mujer')
  p = aplicarCampoPersona(p, 'estadoCivil', 'Married')
  p = aplicarCampoPersona(p, 'fechaCarnet', '2005-01-01')
  p = aplicarCampoPersona(p, 'dni', '12345678z')
  const q = p as Record<string, unknown>
  assert.deepEqual(q.phones, [{ number: '600112233', primary: true }])
  assert.deepEqual(q.gender, { id: 'Female' })
  assert.deepEqual(q.maritalStatus, { id: 'Married' })
  assert.deepEqual(q.drivingLicenses, [{ type: { id: 'B' }, date: '2005-01-01', issuingZone: { id: 'Spain' } }])
  assert.equal(leerCampoPersona(q, 'dni'), '12345678Z')
})

test('mismoValor tolera mayúsculas/espacios del vendor y traduce el sexo', () => {
  assert.equal(mismoValor('nombreVia', 'calle  betis', 'CALLE BETIS'), true)
  assert.equal(mismoValor('nombreVia', 'Calle Betis', null), false)
  assert.equal(mismoValor('sexo', 'mujer', 'Female'), true)
  assert.equal(mismoValor('telefono', '600 11 22 33', '600112233'), true)
})

test('esCampoPersona es la lista blanca: fechaEfecto o matricula NO son de la persona', () => {
  assert.equal(esCampoPersona('nombreVia'), true)
  assert.equal(esCampoPersona('fechaEfecto'), false)
  assert.equal(esCampoPersona('matricula'), false)
  assert.equal(esCampoPersona('__proto__'), false)
})
