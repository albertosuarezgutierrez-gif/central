import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirPeticionAuto,
  revisarDatosAuto,
  exigeDetalleDeSiniestros,
} from './peticion-auto.ts'
import type { DatosAuto } from './peticion-auto.ts'

// Datos mínimos válidos. Persona inventada: aquí no entra ningún cliente real.
const BASE: DatosAuto = {
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
  kmAnuales: 12000,
  cpCirculacion: '41003',
  municipioCirculacionId: 12345,
  garaje: 'CommunalParking',
  fechaEfecto: '2026-09-15',
}

// ─── La regla que más cotizaciones tumba ─────────────────────────────────────
test('la MISMA persona va en los tres papeles, y va idéntica', () => {
  // El vendor cruza por DNI y rechaza si un solo campo difiere entre tomador,
  // propietario y conductor. Se comprueba por igualdad profunda, no de vista.
  const c = construirPeticionAuto(BASE) as any
  assert.deepEqual(c.holder, c.risk.owner)
  assert.deepEqual(c.holder, c.risk.primaryDriver)
  assert.ok(c.risk.owner && c.risk.primaryDriver, 'ninguno de los tres se puede omitir')
})

test('el DNI se normaliza a mayúsculas y la matrícula pierde los espacios', () => {
  const c = construirPeticionAuto(BASE) as any
  assert.equal(c.holder.identificationDocument.id, '00000000T')
  assert.equal(c.risk.registrationPlate, '0000XXX')
})

test('el sexo se traduce al vocabulario del vendor', () => {
  assert.equal((construirPeticionAuto(BASE) as any).holder.gender.id, 'Male')
  assert.equal((construirPeticionAuto({ ...BASE, sexo: 'mujer' }) as any).holder.gender.id, 'Female')
})

// ─── Lo que NO se manda ──────────────────────────────────────────────────────
test('no viajan email, calle, ocupación, situación laboral ni país de nacimiento', () => {
  const json = JSON.stringify(construirPeticionAuto(BASE))
  for (const prohibido of ['email', 'street', 'address1', 'economicOccupation', 'employmentStatus', 'birthCountry']) {
    assert.ok(!json.includes(prohibido), `${prohibido} no debería viajar a Codeoscopic`)
  }
})

// ─── Fecha de compra ─────────────────────────────────────────────────────────
test('sin fecha de compra se usa la de matriculación (el vendor la exige)', () => {
  assert.equal((construirPeticionAuto(BASE) as any).risk.purchaseDate, '2018-06-01')
})

test('con fecha de compra propia (coche de segunda mano) se respeta', () => {
  const c = construirPeticionAuto({ ...BASE, fechaCompra: '2022-03-10' }) as any
  assert.equal(c.risk.purchaseDate, '2022-03-10')
  assert.equal(c.risk.registrationDate, '2018-06-01')
})

// ─── Dirección: las dos mitades o ninguna ────────────────────────────────────
test('sin las dos mitades de la residencia, la dirección NO viaja', () => {
  const c = construirPeticionAuto({ ...BASE, cpResidencia: '41003' }) as any
  assert.equal(c.holder.addresses, undefined)
})

test('con CP y municipio, la dirección viaja completa', () => {
  const c = construirPeticionAuto({ ...BASE, cpResidencia: '41003', municipioResidenciaId: 999 }) as any
  assert.deepEqual(c.holder.addresses, [{ postalCode: '41003', town: { id: 999 }, primary: true }])
})

test('mandar municipio sin código postal es un reparo, no se cuela', () => {
  const r = revisarDatosAuto({ ...BASE, municipioResidenciaId: 999 })
  assert.ok(r.some((x) => x.campo === 'cpResidencia'))
})

// ─── Historial ───────────────────────────────────────────────────────────────
test('sin historial previo no se manda el bloque de la compañía anterior', () => {
  const c = construirPeticionAuto(BASE) as any
  assert.equal(c.risk.previouslyInsured, false)
  assert.equal(c.risk.previousInsurance, undefined)
})

const CON_HISTORIAL: DatosAuto = {
  ...BASE,
  aseguradoAntes: true,
  companiaAnteriorCodigo: 'M0083',
  polizaAnterior: 'POL-000',
  aniosAsegurado: 6,
  aniosEnCompania: 3,
  aniosSinSiniestros: 6,
}

test('con historial, el bloque va completo y con el código DGS de la compañía', () => {
  const c = construirPeticionAuto(CON_HISTORIAL) as any
  assert.equal(c.risk.previousInsurance.previousCompany.code, 'M0083')
  assert.equal(c.risk.previousInsurance.totalYearsInsured, 6)
  assert.equal(c.risk.previousInsurance.registrationPlate, '0000XXX')
})

test('marcar «asegurado antes» sin rellenar el historial da reparos, no una petición rota', () => {
  const r = revisarDatosAuto({ ...BASE, aseguradoAntes: true })
  const campos = r.map((x) => x.campo)
  for (const c of ['companiaAnteriorCodigo', 'polizaAnterior', 'aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros']) {
    assert.ok(campos.includes(c as any), `debería faltar ${c}`)
  }
})

// ─── La regla condicional anidada: la que devuelve un 400 ya pagado ─────────
test('con 6 años sin siniestros NO hace falta el detalle de los últimos 5', () => {
  assert.equal(exigeDetalleDeSiniestros(CON_HISTORIAL), false)
  const c = construirPeticionAuto(CON_HISTORIAL) as any
  assert.equal(c.risk.previousInsurance.lastFiveYearsAccidents, undefined)
})

test('con 2 años limpios de 6 asegurado, el vendor SÍ exige el detalle', () => {
  const d = { ...CON_HISTORIAL, aniosSinSiniestros: 2 }
  assert.equal(exigeDetalleDeSiniestros(d), true)
  assert.ok(revisarDatosAuto(d).some((x) => x.campo === 'siniestrosUltimos5'))
  const c = construirPeticionAuto({ ...d, siniestrosUltimos5: 1 }) as any
  assert.equal(c.risk.previousInsurance.lastFiveYearsAccidents, 1)
})

test('«cero siniestros» es una respuesta válida y no se confunde con «no contestado»', () => {
  // Es la regla NULL≠0 de la casa: 0 es un dato, undefined es un hueco.
  const d = { ...CON_HISTORIAL, aniosSinSiniestros: 2, siniestrosUltimos5: 0 }
  assert.deepEqual(revisarDatosAuto(d), [])
  const c = construirPeticionAuto(d) as any
  assert.equal(c.risk.previousInsurance.lastFiveYearsAccidents, 0)
})

test('si los años limpios coinciden con los asegurado, no se pide el detalle', () => {
  assert.equal(exigeDetalleDeSiniestros({ ...CON_HISTORIAL, aniosSinSiniestros: 6, aniosAsegurado: 6 }), false)
})

// ─── Validación previa: gratis, antes de gastar 0,50€ ───────────────────────
test('unos datos válidos no dan ningún reparo', () => {
  assert.deepEqual(revisarDatosAuto(BASE), [])
})

test('el móvil se valida aquí para no pagar un 400 del vendor', () => {
  for (const malo of ['912345678', '60000000', '6000000000', 'seiscientos']) {
    assert.ok(
      revisarDatosAuto({ ...BASE, telefono: malo }).some((x) => x.campo === 'telefono'),
      `${malo} debería dar reparo`,
    )
  }
  assert.deepEqual(revisarDatosAuto({ ...BASE, telefono: '600 00 00 00' }), [])
})

test('el municipio de circulación se pide por ID, y falta con un mensaje que dice qué hacer', () => {
  const r = revisarDatosAuto({ ...BASE, municipioCirculacionId: undefined })
  const rep = r.find((x) => x.campo === 'municipioCirculacionId')
  assert.ok(rep)
  assert.match(rep.motivo, /código postal/i)
})

test('una fecha con formato español se rechaza antes de salir', () => {
  assert.ok(revisarDatosAuto({ ...BASE, fechaEfecto: '15/09/2026' }).some((x) => x.campo === 'fechaEfecto'))
})

test('construir con datos incompletos LANZA y nombra los campos', () => {
  assert.throws(
    () => construirPeticionAuto({ ...BASE, dni: '' }),
    /codeoscopic_datos_incompletos[\s\S]*dni/,
  )
})

test('los kilómetros son obligatorios, y 0 es un valor legítimo', () => {
  assert.ok(revisarDatosAuto({ ...BASE, kmAnuales: undefined }).some((x) => x.campo === 'kmAnuales'))
  assert.deepEqual(revisarDatosAuto({ ...BASE, kmAnuales: 0 }), [])
})

// ─── Forma general ───────────────────────────────────────────────────────────
test('el ramo va como «Car» y la referencia nuestra solo si la hay', () => {
  const sin = construirPeticionAuto(BASE) as any
  assert.deepEqual(sin.insuranceLine, { id: 'Car' })
  assert.equal(sin.externalId, undefined)
  const con = construirPeticionAuto({ ...BASE, referenciaExterna: 'cot-000000' }) as any
  assert.equal(con.externalId, 'cot-000000')
})
