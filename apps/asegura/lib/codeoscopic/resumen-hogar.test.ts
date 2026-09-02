import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumen, CATALOGOS_PANTALLA, CAMPO_DE_CATALOGO, GRUPOS } from './resumen-hogar.ts'
import { precalificarHogarCartera, type HogarCartera, type ResueltosHogar } from './desde-cartera-hogar.ts'
import type { ClienteCartera } from './desde-cartera.ts'

// Persona inventada. Ningún cliente real aquí.
const CLIENTE: ClienteCartera = {
  nombre: 'Nombre',
  apellidos: 'Apellido Segundo',
  dni: '00000000T',
  telefono: '600000000',
  fechaNacimiento: '1970-01-01',
  estadoCivil: 'Casado',
  saludo: '1',
  codigoPostal: '41003',
  fechaCarnet: null,
}

const GEMELA: HogarCartera = {
  cp: '41002',
  localidad: 'SEVILLA',
  direccion: 'CL INVENTADA 24 3º IZ',
  metrosCuadrados: 76,
  anioConstruccion: 1994,
  capitalContinente: 61000,
  capitalContenido: 7000,
  fuente: 'gemela',
}

const RESUELTOS: ResueltosHogar = {
  municipioId: 41091,
  estadoCivilId: 'Married',
  tipoViaId: 'Calle',
  tipoVivienda: 'MiddleFloor',
  uso: 'Owner',
  ocupacion: 'MainResidence',
  ubicacion: 'CityCentre',
  material: 'NonCombustible',
  calidad: 'Normal',
  alarma: 'NoAlarm',
  puertasSecundarias: 'NonReinforcedOtherDoor',
  asentamiento: 'ReplacementValue',
  propietarioEsTomador: true,
  supuestos: { uso: true, alarma: true },
}

const CATALOGOS = {
  'property-types': [{ id: 'MiddleFloor', nombre: 'Piso intermedio' }],
  uses: [{ id: 'Owner', nombre: 'Propietario' }],
  'alarm-types': [{ id: 'NoAlarm', nombre: 'Sin alarma' }],
}

function ficha(extra: Partial<ResueltosHogar> = {}, opts = {}) {
  const pre = precalificarHogarCartera(
    CLIENTE,
    { numeroPoliza: 'X1', fechaVencimiento: '2027-09-30', hogar: GEMELA },
    { ...RESUELTOS, ...extra },
    '2026-09-02',
  )
  return resumen(pre, {
    catalogos: CATALOGOS,
    estadosCiviles: [{ id: 'Married', nombre: 'Casado' }],
    municipios: [{ id: '41091', nombre: 'Sevilla' }],
    ...opts,
  })
}

test('cada fila dice de dónde sale su valor, y el riesgo del volcado se llama por su nombre', () => {
  const r = ficha()
  const de = (campo: string) => r.filas.find((f) => f.campo === campo)!
  assert.equal(de('metrosCuadrados').procedencia, 'volcado')
  assert.equal(de('capitalContinente').procedencia, 'volcado')
  assert.equal(de('nombre').procedencia, 'ficha')
  assert.equal(de('dni').procedencia, 'ficha')
  assert.equal(de('uso').procedencia, 'supuesto')
  // Sin valor no se inventa procedencia.
  assert.equal(de('referenciaCatastral').valor, null)
  assert.equal(de('referenciaCatastral').procedencia, null)
})

test('los valores se leen en cristiano: euros en español, metros, sí/no y el nombre de la opción', () => {
  const r = ficha()
  const de = (campo: string) => r.filas.find((f) => f.campo === campo)!
  assert.equal(de('capitalContinente').legible, '61.000,00€')
  assert.equal(de('metrosCuadrados').legible, '76 m²')
  assert.equal(de('puertaPrincipalBlindada').legible, 'No')
  assert.equal(de('uso').legible, 'Propietario')
  assert.equal(de('estadoCivil').legible, 'Casado')
  assert.equal(de('municipioId').legible, 'Sevilla')
  assert.equal(de('referenciaCatastral').legible, '—')
  // El vigilante tiene TRES estados: nadie ha dicho que no haya.
  assert.equal(de('vigilante').valor, null)
  assert.equal(de('vigilante').legible, 'No se sabe')
})

test('los supuestos llevan su porqué entero, y los que abaratan van marcados aparte', () => {
  const r = ficha()
  const uso = r.filas.find((f) => f.campo === 'uso')!
  assert.match(uso.porque!, /valor por defecto/)
  assert.ok(r.supuestos.length > 0)
  // Sin joyas ni perros el precio sale más barato de lo que puede acabar siendo.
  const campos = r.optimistas.map((f) => f.campo)
  assert.ok(campos.includes('joyasEnCajaFuerte') && campos.includes('perrosPeligrosos'))
  // Suponer que NO hay alarma no abarata: encarece. No debe estar entre los optimistas.
  assert.ok(!campos.includes('alarma'))
})

test('lo que falta sale con su motivo y bloquea', () => {
  const r = ficha({ municipioId: null })
  const municipio = r.filas.find((f) => f.campo === 'municipioId')!
  assert.match(municipio.falta!, /municipio/)
  assert.ok(r.faltan.some((f) => f.campo === 'municipioId'))
  assert.equal(r.listo, false)
  assert.equal(ficha().listo, true)
})

test('🚨 al cliente se le cuenta menos: ni datos internos, ni de dónde sale cada cosa', () => {
  const r = ficha({}, { nivel: 'cliente' })
  const campos = r.filas.map((f) => f.campo)
  for (const oculto of ['dni', 'fechaNacimiento', 'telefono']) {
    assert.ok(!campos.includes(oculto as never), `${oculto} no se le enseña al cliente`)
  }
  assert.ok(campos.includes('metrosCuadrados'))
  // Nada de «esto sale de tu póliza anterior».
  assert.ok(r.filas.every((f) => f.porque === null))
  assert.ok(r.filas.every((f) => f.procedencia === null || f.procedencia === 'corregido'))
})

test('lo corregido a mano manda sobre cualquier otra procedencia', () => {
  const r = ficha({}, { corregidos: new Set(['metrosCuadrados', 'uso']) })
  const de = (campo: string) => r.filas.find((f) => f.campo === campo)!
  assert.equal(de('metrosCuadrados').procedencia, 'corregido')
  assert.equal(de('uso').procedencia, 'corregido')
})

test('el tomador no se edita desde aquí; el riesgo sí', () => {
  const r = ficha()
  const de = (campo: string) => r.filas.find((f) => f.campo === campo)!
  assert.equal(de('dni').editable, false)
  assert.equal(de('nombre').editable, false)
  assert.equal(de('metrosCuadrados').editable, true)
  assert.equal(de('capitalContinente').editable, true)
})

test('los nueve desplegables llevan su catálogo pegado, y no falta ningún grupo', () => {
  const r = ficha()
  for (const cat of CATALOGOS_PANTALLA) {
    const campo = CAMPO_DE_CATALOGO[cat]
    const fila = r.filas.find((f) => f.campo === campo)!
    assert.equal(fila.control, 'opcion', `${campo} debería ser un desplegable`)
    assert.equal(fila.catalogo, cat)
  }
  const gruposUsados = new Set(r.filas.map((f) => f.grupo))
  for (const g of GRUPOS) assert.ok(gruposUsados.has(g.id), `el grupo ${g.id} se quedó vacío`)
})
