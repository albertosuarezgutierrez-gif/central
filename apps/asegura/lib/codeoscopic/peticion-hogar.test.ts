import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirPeticionHogar,
  revisarDatosHogar,
  CAMPOS_VENDOR,
  CATALOGOS_HOGAR_OBLIGATORIOS,
  TOPE_JOYAS,
  type DatosHogar,
} from './peticion-hogar.ts'
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
  tipoViaId: 'Calle',
  nombreVia: 'Inventada',
  numeroVia: '1',
  planta: '3',
  puertaVivienda: 'IZ',
  metrosCuadrados: 76,
  anioConstruccion: 1994,
  habitaciones: 2,
  tipoVivienda: 'MiddleFloor',
  uso: 'Owner',
  ocupacion: 'MainResidence',
  ubicacion: 'CityCentre',
  material: 'NonCombustible',
  calidad: 'Normal',
  alarma: 'NoAlarm',
  puertasSecundarias: 'NonReinforcedOtherDoor',
  asentamiento: 'ReplacementValue',
  puertaPrincipalBlindada: false,
  ventanasSeguras: false,
  urbanizacionCerrada: false,
  propietarioEsTomador: true,
  capitalContinente: 61000,
  capitalContenido: 7000,
  fechaEfecto: '2026-10-01',
}

test('con los datos mínimos no hay reparos y el cuerpo es EXACTAMENTE el HomeRisk del portal', () => {
  assert.deepEqual(revisarDatosHogar(BASE), [])
  const c = construirPeticionHogar(BASE, 'Home') as any
  assert.deepEqual(c.insuranceLine, { id: 'Home' })
  assert.equal(c.effectiveDate, '2026-10-01')
  assert.deepEqual(c.risk.address, {
    postalCode: '41002',
    town: { id: 12345 },
    roadType: { id: 'Calle' },
    roadName: 'Inventada',
    roadNumber: '1',
    floor: '3',
    door: 'IZ',
  })
  assert.equal(c.risk.yearBuilt, 1994)
  assert.equal(c.risk.floorArea, 76)
  assert.equal(c.risk.rooms, 2)
  assert.deepEqual(c.risk.buildingType, { id: 'MiddleFloor' })
  assert.deepEqual(c.risk.use, { id: 'Owner' })
  assert.deepEqual(c.risk.occupancy, { id: 'MainResidence' })
  assert.deepEqual(c.risk.location, { id: 'CityCentre' })
  assert.deepEqual(c.risk.materials, { id: 'NonCombustible' })
  assert.deepEqual(c.risk.buildQuality, { id: 'Normal' })
  assert.deepEqual(c.risk.alarm, { id: 'NoAlarm' })
  assert.deepEqual(c.risk.secondaryDoorsType, { id: 'NonReinforcedOtherDoor' })
  assert.deepEqual(c.risk.settlementType, { id: 'ReplacementValue' })
  assert.equal(c.risk.securityMainDoor, false)
  assert.equal(c.risk.securityWindows, false)
  assert.equal(c.risk.gatedCommunity, false)
  assert.equal(c.risk.buildingsLimit, 61000)
  assert.equal(c.risk.contentsLimit, 7000)
  // Los cuatro límites obligatorios viajan SIEMPRE, a 0 si no hay nada que declarar.
  assert.equal(c.risk.jewelsInSafeBoxLimit, 0)
  assert.equal(c.risk.jewelsOutSafeBoxLimit, 0)
  assert.equal(c.risk.highValueItemsLimit, 0)
  assert.equal(c.risk.numberOfDangerousDogs, 0)
  // El dueño es el tomador: misma persona.
  assert.deepEqual(c.risk.owner, c.holder)
  // Lo que nadie ha dicho NO viaja: cada campo de más es un 400 posible.
  for (const k of ['securityGuard', 'lastReformYear', 'externalId', 'limits', 'propertyType', 'surface']) {
    assert.equal(k in c.risk || k in c, false, `${k} no debería viajar`)
  }
  // Y ningún nombre de la tabla se ha quedado fuera de un cuerpo completo.
  const enviados = new Set([...Object.keys(c.risk), ...Object.keys(c.risk.address)])
  const opcionales = new Set(['cadastralReference', 'lastReformYear', 'securityGuard'])
  for (const v of Object.values(CAMPOS_VENDOR)) {
    if (v === 'address' || opcionales.has(v)) continue
    assert.ok(enviados.has(v), `falta ${v} en el cuerpo`)
  }
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

test('capitales: hace falta al menos uno; un inquilino solo con contenido pasa y NO lleva dueño inventado', () => {
  const sin = revisarDatosHogar({ ...BASE, capitalContinente: null, capitalContenido: null })
  assert.ok(sin.some((r) => r.campo === 'capitalContinente' && /continente o de contenido/.test(r.motivo)))
  const inquilino = { ...BASE, uso: 'Tenant', propietarioEsTomador: false, capitalContinente: null, capitalContenido: 20000 }
  assert.deepEqual(revisarDatosHogar(inquilino), [])
  const c = construirPeticionHogar(inquilino, 'Home') as any
  assert.equal('buildingsLimit' in c.risk, false)
  assert.equal(c.risk.contentsLimit, 20000)
  assert.equal('owner' in c.risk, false)
})

test('lo que se comprueba gratis antes de pagar: dirección, m², año, habitaciones, los 9 catálogos, booleanos, joyas, fecha', () => {
  const r = revisarDatosHogar({
    ...BASE,
    cp: '4100',
    municipioId: undefined as any,
    tipoViaId: '',
    nombreVia: ' ',
    numeroVia: undefined as any,
    metrosCuadrados: 0,
    anioConstruccion: 3000,
    habitaciones: 0,
    anioUltimaReforma: 1980,
    tipoVivienda: '',
    alarma: '',
    puertaPrincipalBlindada: undefined as any,
    joyasEnCajaFuerte: TOPE_JOYAS + 1,
    perrosPeligrosos: -1,
    fechaEfecto: '01/10/2026',
  })
  const campos = r.map((x) => x.campo)
  for (const c of [
    'cp', 'municipioId', 'tipoViaId', 'nombreVia', 'numeroVia', 'metrosCuadrados', 'anioConstruccion', 'habitaciones',
    'anioUltimaReforma', 'tipoVivienda', 'alarma', 'puertaPrincipalBlindada', 'joyasEnCajaFuerte', 'perrosPeligrosos', 'fechaEfecto',
  ]) {
    assert.ok(campos.includes(c as any), `falta el reparo de ${c}`)
  }
  assert.equal(CATALOGOS_HOGAR_OBLIGATORIOS.length, 9)
  assert.throws(() => construirPeticionHogar({ ...BASE, cp: '' }, 'Home'), /datos_incompletos/)
})

test('los opcionales elegidos viajan; la reforma y el vigilante solo si se dicen; la referencia externa, si la hay', () => {
  const c = construirPeticionHogar(
    { ...BASE, anioUltimaReforma: 2015, vigilante: true, referenciaCatastral: '0000000XX0000X0000XX', joyasFueraDeCaja: 3000, referenciaExterna: 'poliza:x' },
    'Home',
  ) as any
  assert.equal(c.risk.lastReformYear, 2015)
  assert.equal(c.risk.securityGuard, true)
  assert.equal(c.risk.address.cadastralReference, '0000000XX0000X0000XX')
  assert.equal(c.risk.jewelsOutSafeBoxLimit, 3000)
  assert.equal(c.externalId, 'poliza:x')
})
