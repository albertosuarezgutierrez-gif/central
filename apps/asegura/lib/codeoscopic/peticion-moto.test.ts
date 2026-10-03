import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirPeticionMoto,
  revisarDatosMoto,
  exigeDetalleDeSiniestrosMoto,
} from './peticion-moto.ts'
import type { DatosMoto } from './peticion-moto.ts'
import { hoyEnMadrid, sumarDias } from './fecha-efecto.ts'

// Datos mínimos válidos. Persona inventada: aquí no entra ningún cliente real.
const BASE: DatosMoto = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  apellido2: 'Segundo',
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
  fechaEfecto: sumarDias(hoyEnMadrid(), 15),
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

test('la matrícula de la póliza anterior es la del vehículo ANTERIOR si se da (vehículo nuevo)', () => {
  const c = construirPeticionMoto({ ...CON_HISTORIAL, matriculaAnterior: '9031 ght' }, LINEA) as any
  assert.equal(c.risk.previousInsurance.registrationPlate, '9031GHT')
  assert.notEqual(c.risk.previousInsurance.registrationPlate, c.risk.registrationPlate)
})

test('sin matrícula anterior, la póliza anterior va con la matrícula actual (mismo vehículo)', () => {
  const c = construirPeticionMoto({ ...CON_HISTORIAL, matriculaAnterior: '  ' }, LINEA) as any
  assert.equal(c.risk.previousInsurance.registrationPlate, c.risk.registrationPlate)
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

test('el carné de MOTO viaja con su tipo: A con su fecha, no el B supuesto', () => {
  const c = construirPeticionMoto({ ...BASE, tipoCarnet: 'A', fechaCarnet: '2005-03-01' }, 'Motorcycle') as any
  const lic = c.risk.primaryDriver.drivingLicenses
  assert.equal(lic.length, 1)
  assert.deepEqual(lic[0].type, { id: 'A' })
  assert.equal(lic[0].date, '2005-03-01')
})

test('carné B: viaja DETRÁS del de moto (como el ejemplo oficial B + A); el de moto sigue en [0]', () => {
  const c = construirPeticionMoto(
    { ...BASE, tipoCarnet: 'A', fechaCarnet: '2005-03-01', fechaCarnetB: '1999-06-01' },
    'Motorcycle',
  ) as any
  const lic = c.risk.primaryDriver.drivingLicenses
  assert.deepEqual(
    lic.map((l: any) => [l.type.id, l.date]),
    [
      ['A', '2005-03-01'],
      ['B', '1999-06-01'],
    ],
  )
  assert.deepEqual(lic[1].issuingZone, lic[0].issuingZone, 'misma zona que el principal')
  // Si el principal YA es el B (supuesto), no se duplica.
  const soloB = construirPeticionMoto({ ...BASE, tipoCarnet: 'B', fechaCarnetB: '1999-06-01' }, 'Motorcycle') as any
  assert.equal(soloB.risk.primaryDriver.drivingLicenses.length, 1)
})

// ─── Figuras distintas del tomador (entrega 2 del riesgo, 29/09/2026) ─────────
// Personas inventadas: aquí no entra ningún cliente real.
const OTRA = {
  dni: '11111111h',
  nombre: 'Otra',
  apellido1: 'Persona',
  apellido2: 'Segundo',
  fechaNacimiento: '1960-02-02',
  sexo: 'mujer' as const,
  estadoCivil: 'Married',
  telefono: '611111111',
}

test('con propietario propio, owner es él y holder/primaryDriver siguen siendo el tomador', () => {
  const c = construirPeticionMoto({ ...BASE, propietario: OTRA }, LINEA) as any
  assert.ok(JSON.stringify(c.risk.owner).includes('11111111H'))
  assert.deepEqual(c.holder, c.risk.primaryDriver)
  assert.ok(!JSON.stringify(c.holder).includes('11111111H'))
})

test('con conductor propio, primaryDriver lleva SU carné de moto y el tomador va sin carné', () => {
  const c = construirPeticionMoto(
    { ...BASE, conductor: { ...OTRA, fechaCarnet: '2010-03-03', tipoCarnet: 'A', fechaCarnetB: '1990-01-01' } },
    LINEA,
  ) as any
  const drv = JSON.stringify(c.risk.primaryDriver)
  assert.ok(drv.includes('11111111H') && drv.includes('2010-03-03') && drv.includes('1990-01-01'))
  assert.ok(!JSON.stringify(c.holder).includes('2005-01-01'), 'el carné del tomador no viaja si no conduce')
  assert.deepEqual(c.holder, c.risk.owner, 'sin propietario propio, el tomador es el propietario')
})

test('con conductor propio, al tomador ya no se le exige carné; al conductor sí', () => {
  const { fechaCarnet: _f, ...sinCarnet } = BASE
  assert.deepEqual(revisarDatosMoto({ ...sinCarnet, conductor: { ...OTRA, fechaCarnet: '2010-03-03' } }), [])
  const r = revisarDatosMoto({ ...BASE, conductor: { ...OTRA, fechaCarnet: '' } })
  assert.ok(r.some((x) => x.campo === 'conductor'))
})

test('una figura con el MISMO DNI que el tomador se para antes de gastar (400 del vendor)', () => {
  const r = revisarDatosMoto({ ...BASE, propietario: { ...OTRA, dni: '00000000T' } })
  assert.ok(r.some((x) => x.campo === 'propietario' && /mismo DNI/.test(x.motivo)))
})

test('una figura a medias no se declara: el propietario incompleto es un reparo', () => {
  const r = revisarDatosMoto({ ...BASE, propietario: { ...OTRA, telefono: '' } })
  assert.ok(r.some((x) => x.campo === 'propietario'))
})

test('🪤 propietario que ES el conductor (mismo DNI): el MISMO objeto en owner y primaryDriver', () => {
  const c = construirPeticionMoto({ ...BASE, propietario: OTRA, conductor: { ...OTRA, fechaCarnet: '2010-03-03', tipoCarnet: 'A' } }, LINEA) as any
  assert.deepEqual(c.risk.owner, c.risk.primaryDriver, 'construido dos veces difiere en el carné: 400 pagado')
})

// ─── Propietario EMPRESA (29/09/2026): CIF en `owner`, nunca en el conductor ──
// CIF inventado con su control correcto (B + 1234567 → 4): ninguna empresa real.
const EMPRESA = { tipo: 'juridica' as const, cif: 'b-1234567 4', razonSocial: 'Empresa Inventada SL', telefono: '954000000' }

test('una empresa propietaria viaja como persona jurídica con su CIF, y el tomador sigue conduciendo', () => {
  const c = construirPeticionMoto({ ...BASE, propietario: EMPRESA }, LINEA) as any
  assert.deepEqual(c.risk.owner.identificationDocument, { type: { id: 'Cif' }, id: 'B12345674' })
  assert.equal(c.risk.owner.name, 'Empresa Inventada SL')
  assert.deepEqual(c.risk.owner.phones, [{ number: '954000000', primary: true }], 'un fijo vale para una empresa')
  for (const k of ['birthDate', 'gender', 'maritalStatus', 'surname', 'drivingLicenses']) {
    assert.equal(c.risk.owner[k], undefined, `una empresa no lleva ${k}`)
  }
  assert.deepEqual(c.holder, c.risk.primaryDriver, 'tomador = conductor, con su carné')
  assert.equal(c.holder.identificationDocument.type.id, 'Dni')
})

test('un CIF con el control mal se corta ANTES de pagar', () => {
  const r = revisarDatosMoto({ ...BASE, propietario: { ...EMPRESA, cif: 'B12345675' } })
  assert.ok(r.some((x) => x.campo === 'propietario' && /cif/.test(x.motivo)), JSON.stringify(r))
  assert.throws(() => construirPeticionMoto({ ...BASE, propietario: { ...EMPRESA, cif: 'B12345675' } }, LINEA), /codeoscopic_datos_incompletos/)
})

test('una empresa sin razón social se corta antes de pagar; con todo, no hay reparos', () => {
  assert.ok(revisarDatosMoto({ ...BASE, propietario: { ...EMPRESA, razonSocial: ' ' } }).some((x) => x.campo === 'propietario'))
  assert.deepEqual(revisarDatosMoto({ ...BASE, propietario: EMPRESA }), [])
})

// ─── TOMADOR empresa (29/09/2026): la ficha de la empresa llega por los campos de persona ──
const TOMADOR_EMPRESA: DatosMoto = {
  ...BASE,
  tomadorEsEmpresa: true,
  dni: 'B12345674',
  nombre: 'Empresa Inventada SL',
  apellido1: '',
  apellido2: null,
  fechaNacimiento: '',
  sexo: undefined as unknown as 'hombre',
  estadoCivil: '',
  fechaCarnet: '',
}
const CONDUCTOR = { ...BASE, dni: '00000001R', fechaCarnet: '2005-01-01', tipoCarnet: 'A' }

test('tomador empresa sin conductor aparte: se corta antes de pagar', () => {
  const r = revisarDatosMoto(TOMADOR_EMPRESA)
  assert.ok(r.some((x) => x.campo === 'conductor'), JSON.stringify(r))
  assert.ok(!r.some((x) => ['fechaNacimiento', 'sexo', 'estadoCivil', 'apellido1', 'fechaCarnet'].includes(x.campo)), 'a una empresa no se le piden datos de persona')
})

test('tomador empresa + conductor persona: holder y owner son la empresa (CIF), conduce la persona', () => {
  const c = construirPeticionMoto({ ...TOMADOR_EMPRESA, conductor: CONDUCTOR }, LINEA) as any
  assert.deepEqual(c.holder.identificationDocument, { type: { id: 'Cif' }, id: 'B12345674' })
  assert.equal(c.holder.name, 'Empresa Inventada SL')
  assert.equal(c.holder.birthDate, undefined)
  assert.deepEqual(c.risk.owner, c.holder, 'sin propietario aparte, la propietaria es la empresa')
  assert.equal(c.risk.primaryDriver.identificationDocument.type.id, 'Dni')
  assert.ok(c.risk.primaryDriver.drivingLicenses?.length > 0, 'el carné es el del conductor')
})

test('🪤 fecha de efecto de moto: ni pasada ni a más de 90 días (el mismo cepo que auto, antes de pagar)', () => {
  const hoy = hoyEnMadrid()
  const mal = (f: string) => revisarDatosMoto({ ...BASE, fechaEfecto: f }).filter((x) => x.campo === 'fechaEfecto')
  assert.equal(mal(sumarDias(hoy, -1)).length, 1)
  assert.match(mal(sumarDias(hoy, -1))[0].motivo, /anterior a hoy/)
  assert.equal(mal(sumarDias(hoy, 91)).length, 1)
  assert.match(mal(sumarDias(hoy, 91))[0].motivo, /90 días/)
  assert.equal(mal(hoy).length, 0)
  assert.equal(mal(sumarDias(hoy, 90)).length, 0)
})
