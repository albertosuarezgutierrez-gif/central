import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  precalificarHogarCartera,
  hogarDeDatos,
  elegirRiesgo,
  partirDireccion,
  habitacionesPorSuperficie,
  type HogarCartera,
  type ResueltosHogar,
} from './desde-cartera-hogar.ts'
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
  municipioId: 1,
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
}

test('con la gemela completa y los ids resueltos se puede cotizar, y se DICE de dónde sale el riesgo', () => {
  const p = precalificarHogarCartera(CLIENTE, { numeroPoliza: 'X1', fechaVencimiento: '2027-09-30', hogar: GEMELA }, RESUELTOS, '2026-09-02')
  assert.deepEqual(p.faltan, [])
  assert.equal(p.fuenteRiesgo, 'gemela')
  assert.equal(p.datos.cp, '41002') // el del riesgo, NO el del tomador (41003)
  assert.equal(p.datos.fechaEfecto, '2027-10-01')
  // La dirección troceada para el vendor.
  assert.equal(p.datos.tipoViaId, 'Calle')
  assert.equal(p.datos.nombreVia, 'INVENTADA')
  assert.equal(p.datos.numeroVia, '24')
  assert.equal(p.datos.planta, '3')
  assert.equal(p.datos.puertaVivienda, 'IZ')
  assert.ok(p.supuestos.some((s) => /volcado de junio\/2026/.test(s.porque) && /X1/.test(s.porque)))
  // Los capitales viejos pueden quedarse cortos: optimista.
  assert.ok(p.supuestos.some((s) => s.campo === 'capitalContinente' && s.optimista === true))
})

test('🚨 lo que el vendor exige y la ficha NO tiene se supone conservador y se declara UNO POR UNO', () => {
  const p = precalificarHogarCartera(CLIENTE, { numeroPoliza: 'X1', fechaVencimiento: null, hogar: GEMELA }, RESUELTOS, '2026-09-02')
  const por = Object.fromEntries(p.supuestos.map((s) => [s.campo, s]))
  assert.equal(p.datos.habitaciones, 3) // 76 m²
  assert.ok(/76 m²/.test(por.habitaciones.porque))
  assert.equal(p.datos.puertaPrincipalBlindada, false)
  assert.equal(p.datos.ventanasSeguras, false)
  assert.equal(p.datos.urbanizacionCerrada, false)
  assert.equal(por.puertaPrincipalBlindada.optimista, false) // sin protecciones ⇒ precio más alto: conservador
  assert.equal(p.datos.joyasEnCajaFuerte, 0)
  assert.equal(p.datos.perrosPeligrosos, 0)
  assert.equal(por.joyasEnCajaFuerte.optimista, true) // sin joyas ⇒ precio más bajo: optimista
  assert.equal(por.perrosPeligrosos.optimista, true)
  // Nada de esto se supone si NO hay superficie: sin m² no hay habitaciones.
  const sinM2 = precalificarHogarCartera(CLIENTE, { numeroPoliza: null, fechaVencimiento: null, hogar: { ...GEMELA, metrosCuadrados: null } }, RESUELTOS, '2026-09-02')
  assert.equal(sinM2.datos.habitaciones, undefined)
  assert.ok(sinM2.faltan.some((f) => f.campo === 'habitaciones'))
})

test('🚨 sin riesgo en la póliza ni en la gemela: el Catastro tapa m²/año, el CP cae al del tomador y la CALLE falta', () => {
  const p = precalificarHogarCartera(
    CLIENTE,
    { numeroPoliza: null, fechaVencimiento: null, hogar: null },
    RESUELTOS,
    '2026-09-02',
    { metrosCuadrados: 80, anioConstruccion: 1990, codigoPostal: null, uso: 'Residencial' },
  )
  assert.equal(p.fuenteRiesgo, 'catastro')
  assert.equal(p.datos.metrosCuadrados, 80)
  assert.equal(p.datos.cp, '41003')
  assert.ok(p.supuestos.some((s) => s.campo === 'cp' && /donde vive el tomador/.test(s.porque)))
  assert.ok(p.supuestos.some((s) => s.campo === 'metrosCuadrados' && /CONSTRUIDA/.test(s.porque)))
  // Sin dirección no se inventa una calle: falta (y el vendor la exige).
  const campos = p.faltan.map((f) => f.campo)
  assert.ok(campos.includes('nombreVia') && campos.includes('numeroVia'))
  // Sin capitales no se inventa nada: falta.
  assert.ok(campos.includes('capitalContinente'))
})

test('nada personal se supone: sin DNI ni teléfono, faltan', () => {
  const p = precalificarHogarCartera(
    { ...CLIENTE, dni: null, telefono: null, nombre: 'Lead' },
    { numeroPoliza: null, fechaVencimiento: null, hogar: GEMELA },
    RESUELTOS,
    '2026-09-02',
  )
  const campos = p.faltan.map((f) => f.campo)
  assert.ok(campos.includes('dni') && campos.includes('telefono') && campos.includes('nombre'))
  assert.ok(!p.supuestos.some((s) => ['dni', 'telefono', 'nombre'].includes(s.campo)))
})

test('los defectos de la pantalla para los desplegables se declaran como supuestos; el dueño se supone si nadie lo dice', () => {
  const p = precalificarHogarCartera(
    CLIENTE,
    { numeroPoliza: null, fechaVencimiento: null, hogar: GEMELA },
    { ...RESUELTOS, propietarioEsTomador: null, supuestos: { ocupacion: true, alarma: true, tipoVia: true } },
    '2026-09-02',
  )
  assert.ok(p.supuestos.some((s) => s.campo === 'ocupacion' && s.optimista === true))
  assert.ok(p.supuestos.some((s) => s.campo === 'alarma' && s.optimista === false))
  assert.ok(p.supuestos.some((s) => s.campo === 'tipoViaId'))
  assert.ok(!p.supuestos.some((s) => s.campo === 'tipoVivienda'))
  assert.equal(p.datos.propietarioEsTomador, true)
  assert.ok(p.supuestos.some((s) => s.campo === 'propietarioEsTomador'))
  // Un id sin resolver no se convierte en supuesto: falta.
  const sinAlarma = precalificarHogarCartera(CLIENTE, { numeroPoliza: null, fechaVencimiento: null, hogar: GEMELA }, { ...RESUELTOS, alarma: null }, '2026-09-02')
  assert.ok(sinAlarma.faltan.some((f) => f.campo === 'alarma'))
})

test('partirDireccion: abreviaturas del CRM, número, planta y puerta; lo que no se reconoce queda a null', () => {
  assert.deepEqual(partirDireccion('CL SOCORRO 24'), { tipoVia: 'Calle', nombre: 'SOCORRO', numero: '24', planta: null, puerta: null })
  assert.deepEqual(partirDireccion('CALLE SAN JUAN DE LA PALMA, 28, 3º IZQ'), { tipoVia: 'Calle', nombre: 'SAN JUAN DE LA PALMA', numero: '28', planta: '3', puerta: 'IZQ' })
  assert.deepEqual(partirDireccion('AVDA. DE LA CONSTITUCIÓN Nº 5 BAJO B'), { tipoVia: 'Avenida', nombre: 'DE LA CONSTITUCIÓN', numero: '5', planta: 'BAJO', puerta: 'B' })
  assert.deepEqual(partirDireccion('C/Socorro 24 3ºB'), { tipoVia: 'Calle', nombre: 'Socorro', numero: '24', planta: '3', puerta: 'B' })
  assert.deepEqual(partirDireccion('PLAZA NUEVA S/N'), { tipoVia: 'Plaza', nombre: 'NUEVA', numero: null, planta: null, puerta: null })
  assert.deepEqual(partirDireccion('Socorro 24'), { tipoVia: null, nombre: 'Socorro', numero: '24', planta: null, puerta: null })
  assert.deepEqual(partirDireccion('24'), { tipoVia: null, nombre: '24', numero: null, planta: null, puerta: null })
  assert.deepEqual(partirDireccion('  '), { tipoVia: null, nombre: null, numero: null, planta: null, puerta: null })
  assert.deepEqual(partirDireccion(null), { tipoVia: null, nombre: null, numero: null, planta: null, puerta: null })
})

test('habitacionesPorSuperficie: tramos, nunca 0', () => {
  assert.equal(habitacionesPorSuperficie(30), 1)
  assert.equal(habitacionesPorSuperficie(60), 2)
  assert.equal(habitacionesPorSuperficie(76), 3)
  assert.equal(habitacionesPorSuperficie(110), 4)
  assert.equal(habitacionesPorSuperficie(200), 5)
})

test('hogarDeDatos: los números vienen como texto; lo vacío es null, nunca 0; sin nada útil → null', () => {
  const h = hogarDeDatos({ cp: '41002', metrosCuadrados: '76', anioConstruccion: '1994', continente: '61000', contenido: '' }, 'gemela', 'CL X 1')
  assert.deepEqual(h, {
    cp: '41002', localidad: null, direccion: 'CL X 1', metrosCuadrados: 76, anioConstruccion: 1994,
    capitalContinente: 61000, capitalContenido: null, fuente: 'gemela',
  })
  assert.equal(hogarDeDatos({ marca: 'x' }, 'poliza'), null)
  assert.equal(hogarDeDatos(null, 'poliza'), null)
})

test('elegirRiesgo: la póliza manda si está completa; si no, la gemela; si ninguna, lo que haya', () => {
  const propia: HogarCartera = { ...GEMELA, fuente: 'poliza', anioConstruccion: null }
  assert.equal(elegirRiesgo(propia, GEMELA)?.fuente, 'gemela')
  assert.equal(elegirRiesgo({ ...GEMELA, fuente: 'poliza' }, GEMELA)?.fuente, 'poliza')
  assert.equal(elegirRiesgo(propia, null)?.fuente, 'poliza')
  assert.equal(elegirRiesgo(null, null), null)
})
