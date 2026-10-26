import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLAVE_NO_LO_SE, NADA_CONOCIDO, TRAMOS_CONTENIDO, TRAMOS_CONTINENTE, camposSolicitud } from './solicitud-datos.ts'
import { CLAVES_PERSONALES_BORRADOR, MAX_BORRADOR_CARACTERES, borradorParaTercero, limpiarBorrador, tramoDeCapital, ultimoPasoDe, valoresDePolizaLeida } from './solicitud-borrador.ts'

const HOY = new Date('2026-10-26T10:00:00Z')
const hogar = camposSolicitud('hogar', NADA_CONOCIDO)
const moto = camposSolicitud('moto', NADA_CONOCIDO)
const vida = camposSolicitud('vida', NADA_CONOCIDO)

// ─── Tramos ──────────────────────────────────────────────────────────────────

test('tramoDeCapital: el tramo cuyo techo CUBRE el capital (nunca uno que se queda corto)', () => {
  assert.equal(tramoDeCapital(TRAMOS_CONTENIDO, 12_000), 'hasta_15000')
  assert.equal(tramoDeCapital(TRAMOS_CONTENIDO, 15_000), 'hasta_15000')
  assert.equal(tramoDeCapital(TRAMOS_CONTENIDO, 15_001), '15000_30000')
  assert.equal(tramoDeCapital(TRAMOS_CONTENIDO, 75_000), 'mas_60000')
  assert.equal(tramoDeCapital(TRAMOS_CONTINENTE, 120_000), '80000_150000')
})

test('tramoDeCapital: sin capital utilizable no propone nada (ni «que me lo calculen»)', () => {
  for (const v of [null, undefined, 0, -5, Number.NaN, '30000']) assert.equal(tramoDeCapital(TRAMOS_CONTENIDO, v), null)
})

// ─── La póliza actual leída ──────────────────────────────────────────────────

test('póliza de hogar: compañía, vencimiento y capitales a sus campos, y «tiene seguro» = sí', () => {
  const v = valoresDePolizaLeida({
    fase: 'hogar',
    datos: { compania: 'Allianz', fechaVencimiento: '2027-03-01', capitalContenido: 22_000, capitalContinente: 140_000, dni: '12345678Z', fechaNacimiento: '1980-01-01' },
  }, hogar, HOY)
  assert.equal(v.companiaActual, 'Allianz')
  assert.equal(v.vencimientoActual, '2027-03-01')
  assert.equal(v.tieneSeguro, true)
  assert.equal(v.tramoContenido, '15000_30000')
  assert.equal(v.tramoContinente, '80000_150000')
})

test('una póliza NUNCA propone DNI ni nacimiento (sale el tomador, no quien rellena)', () => {
  const v = valoresDePolizaLeida({ fase: 'auto', datos: { dni: '12345678Z', fechaNacimiento: '1980-01-01', fechaCarnet: '2000-01-01', compania: 'Mapfre' } }, moto, HOY)
  assert.equal(v.dni, undefined)
  assert.equal(v.fechaNacimiento, undefined)
  assert.equal(v.fechaCarnet, undefined)
  assert.equal(v.companiaActual, 'Mapfre')
})

test('póliza de moto: el vehículo a los campos pedidos, pasados por la validación del formulario', () => {
  const v = valoresDePolizaLeida({ fase: 'auto', datos: { matricula: '1234 bcd', marca: 'Yamaha', modelo: 'MT-07', version: 'ABS', aniosSinSiniestros: 6 } }, moto, HOY)
  assert.equal(v.matricula, '1234BCD')
  assert.equal(v.modelo, 'MT-07 ABS')
  assert.equal(v.aniosSinSiniestros, 6)
  assert.equal(v.tieneSeguro, undefined, 'sin compañía ni vencimiento no se afirma que tenga seguro')
})

test('solo campos QUE SE PIDIERON: un capital de hogar no aparece en un enlace de moto', () => {
  const v = valoresDePolizaLeida({ fase: 'hogar', datos: { capitalContenido: 20_000, metrosCuadrados: 90 } }, moto, HOY)
  assert.deepEqual(v, {})
})

test('vida: el capital asegurado de la póliza actual como punto de partida', () => {
  const v = valoresDePolizaLeida({ fase: 'contrato_solo', datos: { compania: 'Santalucía' }, bruto: { capitalAsegurado: 150_000 } }, vida, HOY)
  assert.equal(v.capitalDeseado, 150_000)
  assert.equal(v.companiaActual, 'Santalucía')
})

test('nada leído o valores que no validan → nada propuesto', () => {
  assert.deepEqual(valoresDePolizaLeida({ fase: 'ninguno' }, hogar, HOY), {})
  const v = valoresDePolizaLeida({ fase: 'hogar', datos: { fechaVencimiento: '31/02/2027', metrosCuadrados: -3 } }, hogar, HOY)
  assert.equal(v.vencimientoActual, undefined)
  assert.equal(v.metrosCuadrados, undefined)
})

// ─── Borrador ────────────────────────────────────────────────────────────────

test('borrador: solo claves pedidas (y subclaves de dirección), escalares, sin vacíos', () => {
  const b = limpiarBorrador(hogar, {
    habitaciones: '3', alarma: true, viviendaCp: '41003', viviendaNumero: '24',
    inventada: 'x', regimen: '', dni: { raro: 1 }, comentario: 'a'.repeat(5000),
    [CLAVE_NO_LO_SE]: ['alarma', 'noExiste', 7],
  })
  assert.ok(b)
  assert.equal(b!.habitaciones, '3')
  assert.equal(b!.alarma, true)
  assert.equal(b!.viviendaCp, '41003')
  assert.equal(b!.inventada, undefined)
  assert.equal(b!.regimen, undefined)
  assert.equal(b!.dni, undefined)
  assert.equal((b!.comentario as string).length, 1000)
  assert.deepEqual(b![CLAVE_NO_LO_SE], ['alarma'])
})

test('borrador: lo que no es un objeto, o pasa del tope, no se guarda', () => {
  assert.equal(limpiarBorrador(hogar, null), null)
  assert.equal(limpiarBorrador(hogar, ['a']), null)
  assert.equal(limpiarBorrador(hogar, 'x'), null)
  const grande: Record<string, string> = {}
  for (const c of hogar) if (c.tipo !== 'direccion') grande[c.clave] = 'x'.repeat(1000)
  assert.ok(JSON.stringify(grande).length > MAX_BORRADOR_CARACTERES)
  assert.equal(limpiarBorrador(hogar, grande), null)
})

// ─── Último paso ─────────────────────────────────────────────────────────────

test('último paso: la sección del último campo contestado, con su posición; sin nada → null', () => {
  assert.equal(ultimoPasoDe(hogar, {}), null)
  const p = ultimoPasoDe(hogar, { dni: '1', viviendaCp: '41003', alarma: true })
  assert.match(p!, /^Seguridad \(pregunta \d+ de \d+\)$/)
  const q = ultimoPasoDe(hogar, { dni: '1', [CLAVE_NO_LO_SE]: ['habitaciones'] })
  assert.match(q!, /^La vivienda /)
  // Sin secciones (moto): la pregunta.
  assert.match(ultimoPasoDe(moto, { matricula: '1234BCD' })!, /^Matrícula \(pregunta/)
})

test('TERCERO: el borrador que vuelve no trae DNI, nacimiento ni otro dato personal (tampoco en «No lo sé»); lo del riesgo sí', () => {
  const b = { dni: '12345678Z', fechaNacimiento: '1980-02-01', tipoCarnet: 'A2', fechaCarnet: '2015-03-15', codigoPostal: '41003', matricula: '1234ABC', marca: 'Yamaha', _noLoSe: ['fechaCarnet', 'kmAnuales'] }
  const t = borradorParaTercero(b)
  assert.deepEqual(t, { matricula: '1234ABC', marca: 'Yamaha', _noLoSe: ['kmAnuales'] })
  for (const k of CLAVES_PERSONALES_BORRADOR) assert.ok(!(k in (t ?? {})), k)
  assert.equal(borradorParaTercero({ dni: '12345678Z', _noLoSe: ['fechaNacimiento'] }), null, 'solo datos personales = nada que devolver')
  assert.equal(borradorParaTercero(null), null)
})
