import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirPeticionMoto,
  revisarDatosMoto,
  exigeDetalleDeSiniestrosMoto,
} from './peticion-moto.ts'
import type { DatosMoto } from './peticion-moto.ts'

// Datos mínimos válidos. Persona inventada: aquí no entra ningún cliente real.
const BASE: DatosMoto = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  fechaNacimiento: '1985-01-01',
  sexo: 'hombre',
  estadoCivil: 'Single',
  telefono: '600000000',
  fechaCarnet: '2005-01-01',
  codigoVehiculo: 'BASE7CODE',
  matricula: '0000 xxx',
  fechaMatriculacion: '2018-06-01',
  kmAnuales: 8000,
  cpCirculacion: '41003',
  municipioCirculacionId: 12345,
  garaje: 'CommunalParking',
  experienciaConduccion: 'ThisMotorcycle',
  fechaEfecto: '2026-09-15',
}
const LINEA = 'Motorcycle'

// ─── La regla que más cotizaciones tumba (compartida con auto) ─────────────
test('la MISMA persona va en los tres papeles, y va idéntica', () => {
  const c = construirPeticionMoto(BASE, LINEA) as any
  assert.deepEqual(c.holder, c.risk.owner)
  assert.deepEqual(c.holder, c.risk.primaryDriver)
  assert.ok(c.risk.owner && c.risk.primaryDriver, 'ninguno de los tres se puede omitir')
})

test('el DNI se normaliza a mayúsculas y la matrícula pierde los espacios', () => {
  const c = construirPeticionMoto(BASE, LINEA) as any
  assert.equal(c.holder.identificationDocument.id, '00000000T')
  assert.equal(c.risk.registrationPlate, '0000XXX')
})

// ─── Lo que NO existe en moto, a diferencia de auto ─────────────────────────
test('no viaja lightTrailer ni secondaryDriver: moto no los tiene', () => {
  const json = JSON.stringify(construirPeticionMoto(BASE, LINEA))
  for (const prohibido of ['lightTrailer', 'secondaryDriver', 'installedOptions']) {
    assert.ok(!json.includes(prohibido), `${prohibido} no debería viajar en una petición de moto`)
  }
})

// ─── Lo específico de moto: la experiencia de conducción ────────────────────
test('la experiencia de conducción es obligatoria', () => {
  const r = revisarDatosMoto({ ...BASE, experienciaConduccion: undefined })
  assert.ok(r.some((x) => x.campo === 'experienciaConduccion'))
})

test('con experiencia en ESTA moto, no hace falta el código de otra', () => {
  const c = construirPeticionMoto(BASE, LINEA) as any
  assert.deepEqual(c.risk.drivingExperience, { id: 'ThisMotorcycle' })
  assert.equal(c.risk.previousMotorcycle, undefined)
})

test('con experiencia en OTRA moto, el código de esa moto es obligatorio', () => {
  const d = { ...BASE, experienciaConduccion: 'OtherMotorcycle' }
  assert.ok(revisarDatosMoto(d).some((x) => x.campo === 'motoAnteriorCodigo'))
  const c = construirPeticionMoto({ ...d, motoAnteriorCodigo: 'OTRA-MOTO-CODE' }, LINEA) as any
  assert.deepEqual(c.risk.previousMotorcycle, { code: 'OTRA-MOTO-CODE' })
})

// ─── Fecha de compra ─────────────────────────────────────────────────────────
test('sin fecha de compra se usa la de matriculación (el vendor la exige)', () => {
  assert.equal((construirPeticionMoto(BASE, LINEA) as any).risk.purchaseDate, '2018-06-01')
})

// ─── Historial (idéntico a auto) ─────────────────────────────────────────────
test('sin historial previo no se manda el bloque de la compañía anterior', () => {
  const c = construirPeticionMoto(BASE, LINEA) as any
  assert.equal(c.risk.previouslyInsured, false)
  assert.equal(c.risk.previousInsurance, undefined)
})

const CON_HISTORIAL: DatosMoto = {
  ...BASE,
  aseguradoAntes: true,
  companiaAnteriorCodigo: 'M0083',
  polizaAnterior: 'POL-000',
  aniosAsegurado: 6,
  aniosEnCompania: 3,
  aniosSinSiniestros: 6,
}

test('con historial, el bloque va completo y con el código DGS de la compañía', () => {
  const c = construirPeticionMoto(CON_HISTORIAL, LINEA) as any
  assert.equal(c.risk.previousInsurance.previousCompany.code, 'M0083')
  assert.equal(c.risk.previousInsurance.totalYearsInsured, 6)
})

test('con 2 años limpios de 6 asegurado, el vendor SÍ exige el detalle', () => {
  const d = { ...CON_HISTORIAL, aniosSinSiniestros: 2 }
  assert.equal(exigeDetalleDeSiniestrosMoto(d), true)
  assert.ok(revisarDatosMoto(d).some((x) => x.campo === 'siniestrosUltimos5'))
})

// ─── Validación previa: gratis, antes de gastar 0,50€ ───────────────────────
test('unos datos válidos no dan ningún reparo', () => {
  assert.deepEqual(revisarDatosMoto(BASE), [])
})

test('construir con datos incompletos LANZA y nombra los campos', () => {
  assert.throws(
    () => construirPeticionMoto({ ...BASE, dni: '' }, LINEA),
    /codeoscopic_datos_incompletos[\s\S]*dni/,
  )
})

// ─── Forma general: el id del ramo NUNCA se escribe a mano dentro de esto ────
test('el ramo va con el id EXACTO que se le pasa, y la referencia nuestra solo si la hay', () => {
  const sin = construirPeticionMoto(BASE, LINEA) as any
  assert.deepEqual(sin.insuranceLine, { id: 'Motorcycle' })
  assert.equal(sin.externalId, undefined)
  const con = construirPeticionMoto({ ...BASE, referenciaExterna: 'cot-000000' }, LINEA) as any
  assert.equal(con.externalId, 'cot-000000')
})
