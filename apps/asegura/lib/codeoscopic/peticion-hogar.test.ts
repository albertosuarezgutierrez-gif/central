import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionHogar, revisarDatosHogar, CAMPOS_VENDOR, type DatosHogar } from './peticion-hogar.ts'
import { construirPeticionAuto, type DatosAuto } from './peticion-auto.ts'

// Persona inventada: aquí no entra ningún cliente real.
const BASE: DatosHogar = {
  dni: '00000000t',
  nombre: 'Nombre',
  apellido1: 'Apellido',
  fechaNacimiento: '1985-01-01',
  sexo: 'hombre',
  estadoCivil: 'Married',
  telefono: '600 000 000',
  cp: '41002',
  municipioId: 12345,
  metrosCuadrados: 76,
  anioConstruccion: 1994,
  tipoVivienda: 'Flat',
  uso: 'Main',
  ocupacion: 'Owner',
  capitalContinente: 61000,
  capitalContenido: 7000,
  fechaEfecto: '2026-10-01',
}

test('con los datos mínimos no hay reparos y el cuerpo lleva el ramo que le dan', () => {
  assert.deepEqual(revisarDatosHogar(BASE), [])
  const c = construirPeticionHogar(BASE, 'Home') as any
  assert.deepEqual(c.insuranceLine, { id: 'Home' })
  assert.equal(c.effectiveDate, '2026-10-01')
  assert.deepEqual(c.risk[CAMPOS_VENDOR.direccion], { postalCode: '41002', town: { id: 12345 } })
  assert.equal(c.risk[CAMPOS_VENDOR.anioConstruccion], 1994)
  assert.equal(c.risk[CAMPOS_VENDOR.metrosCuadrados], 76)
  assert.deepEqual(c.risk[CAMPOS_VENDOR.capitales], { building: 61000, contents: 7000 })
  // Los opcionales que nadie eligió NO viajan: cada campo de más es un 400 posible.
  assert.equal(CAMPOS_VENDOR.alarma in c.risk, false)
  assert.equal('externalId' in c, false)
})

test('🚨 el id del ramo nunca se adivina: sin él no hay cuerpo', () => {
  assert.throws(() => construirPeticionHogar(BASE, ''), /linea_hogar_desconocida/)
})

test('la persona de hogar es la MISMA proyección que la de auto, sin carnet', () => {
  const h = construirPeticionHogar(BASE, 'Home') as any
  const auto: DatosAuto = {
    ...BASE,
    fechaCarnet: '2005-01-01',
    codigoVehiculo: 'X',
    matricula: '0000XXX',
    fechaMatriculacion: '2018-01-01',
    kmAnuales: 1000,
    cpCirculacion: '41002',
    municipioCirculacionId: 12345,
    garaje: 'G',
  }
  const a = construirPeticionAuto(auto) as any
  const { drivingLicenses, ...personaAuto } = a.holder
  assert.deepEqual(h.holder, personaAuto)
  assert.equal('drivingLicenses' in h.holder, false)
  assert.equal(h.holder.identificationDocument.id, '00000000T')
  assert.equal(h.holder.phones[0].number, '600000000')
})

test('capitales: hace falta al menos uno; un inquilino solo con contenido pasa', () => {
  const sin = revisarDatosHogar({ ...BASE, capitalContinente: null, capitalContenido: null })
  assert.ok(sin.some((r) => r.campo === 'capitalContinente' && /continente o de contenido/.test(r.motivo)))
  const inquilino = { ...BASE, ocupacion: 'Tenant', capitalContinente: null, capitalContenido: 20000 }
  assert.deepEqual(revisarDatosHogar(inquilino), [])
  const c = construirPeticionHogar(inquilino, 'Home') as any
  assert.deepEqual(c.risk.limits, { contents: 20000 })
})

test('lo que se comprueba gratis antes de pagar: CP, municipio, m², año, catálogos, fecha', () => {
  const r = revisarDatosHogar({
    ...BASE,
    cp: '4100',
    municipioId: undefined as any,
    metrosCuadrados: 0,
    anioConstruccion: 3000,
    tipoVivienda: '',
    fechaEfecto: '01/10/2026',
  })
  const campos = r.map((x) => x.campo)
  for (const c of ['cp', 'municipioId', 'metrosCuadrados', 'anioConstruccion', 'tipoVivienda', 'fechaEfecto']) {
    assert.ok(campos.includes(c as any), `falta el reparo de ${c}`)
  }
  assert.throws(() => construirPeticionHogar({ ...BASE, cp: '' }, 'Home'), /datos_incompletos/)
})

test('los opcionales elegidos viajan como {id}; la referencia externa, si la hay', () => {
  const c = construirPeticionHogar({ ...BASE, alarma: 'Connected', puerta: 'Armoured', referenciaExterna: 'poliza:x' }, 'Home') as any
  assert.deepEqual(c.risk[CAMPOS_VENDOR.alarma], { id: 'Connected' })
  assert.deepEqual(c.risk[CAMPOS_VENDOR.puerta], { id: 'Armoured' })
  assert.equal(c.externalId, 'poliza:x')
})
