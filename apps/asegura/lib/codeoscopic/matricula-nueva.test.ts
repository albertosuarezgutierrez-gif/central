import test from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionAuto, revisarDatosAuto, type DatosAuto } from './peticion-auto.ts'
import { construirPeticionMoto, revisarDatosMoto, type DatosMoto } from './peticion-moto.ts'
import { hoyEnMadrid, sumarDias } from './fecha-efecto.ts'
import { reparosMatricula } from './matricula-nueva.ts'

const HOY = hoyEnMadrid()
const AUTO: DatosAuto = {
  dni: '00000000t', nombre: 'Nombre', apellido1: 'Apellido', apellido2: 'Segundo', fechaNacimiento: '1985-01-01',
  sexo: 'hombre', estadoCivil: 'Single', telefono: '600000000', fechaCarnet: '2005-01-01',
  codigoVehiculo: 'BASE7CODE', matricula: '', fechaMatriculacion: sumarDias(HOY, 20), kmAnuales: 12000,
  cpCirculacion: '41003', municipioCirculacionId: 12345, garaje: 'CommunalParking', fechaEfecto: sumarDias(HOY, 7),
}
const MOTO: DatosMoto = { ...(AUTO as unknown as DatosMoto), experienciaConduccion: 'ThisMotorcycle' }
const HISTORIAL = {
  aseguradoAntes: true, companiaAnteriorCodigo: 'M0083', polizaAnterior: 'POL-000',
  aniosAsegurado: 6, aniosEnCompania: 3, aniosSinSiniestros: 6,
} as const
const campos = (r: { campo: string }[]) => r.map((x) => x.campo)

test('vehículo NUEVO sin matrícula: se cotiza con versión + matriculación prevista, y el campo se OMITE', () => {
  assert.deepEqual(campos(revisarDatosAuto(AUTO, { vehiculoNuevo: true })), [])
  const c = construirPeticionAuto(AUTO, { vehiculoNuevo: true }) as { risk: Record<string, unknown> }
  assert.equal('registrationPlate' in c.risk, false, 'ni "" ni null: el campo no viaja')
  assert.equal(c.risk.registrationDate, AUTO.fechaMatriculacion)
  assert.deepEqual(campos(revisarDatosMoto(MOTO, { vehiculoNuevo: true })), [])
  const m = construirPeticionMoto(MOTO, 'Motorcycle', { vehiculoNuevo: true }) as { risk: Record<string, unknown> }
  assert.equal('registrationPlate' in m.risk, false)
})

test('fuera de vehículo nuevo la matrícula SIGUE siendo obligatoria (retarificar, etc.)', () => {
  assert.ok(campos(revisarDatosAuto(AUTO)).includes('matricula'))
  assert.ok(campos(revisarDatosMoto(MOTO)).includes('matricula'))
  assert.throws(() => construirPeticionAuto(AUTO), /matricula/)
})

test('sin matrícula: matriculación prevista ≤ 90 días, versión elegida y, con seguro anterior, la matrícula de ESA póliza', () => {
  assert.ok(campos(revisarDatosAuto({ ...AUTO, fechaMatriculacion: sumarDias(HOY, 91) }, { vehiculoNuevo: true })).includes('fechaMatriculacion'))
  assert.ok(campos(revisarDatosAuto({ ...AUTO, codigoVehiculo: '' }, { vehiculoNuevo: true })).includes('matricula'))
  assert.ok(campos(revisarDatosAuto({ ...AUTO, ...HISTORIAL }, { vehiculoNuevo: true })).includes('matriculaAnterior'))
  const c = construirPeticionAuto({ ...AUTO, ...HISTORIAL, matriculaAnterior: '0000 aaa' }, { vehiculoNuevo: true }) as { risk: { previousInsurance: Record<string, unknown> } }
  assert.equal(c.risk.previousInsurance.registrationPlate, '0000AAA')
})

test('con matrícula no cambia nada', () => {
  assert.deepEqual(reparosMatricula({ matricula: '0000XXX' }, { vehiculoNuevo: false }), [])
  const c = construirPeticionAuto({ ...AUTO, matricula: '0000 xxx' }, { vehiculoNuevo: true }) as { risk: Record<string, unknown> }
  assert.equal(c.risk.registrationPlate, '0000XXX')
})
