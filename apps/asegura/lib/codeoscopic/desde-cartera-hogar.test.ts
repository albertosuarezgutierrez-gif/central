import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precalificarHogarCartera, hogarDeDatos, elegirRiesgo, type HogarCartera } from './desde-cartera-hogar.ts'
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
  direccion: null,
  metrosCuadrados: 76,
  anioConstruccion: 1994,
  capitalContinente: 61000,
  capitalContenido: 7000,
  fuente: 'gemela',
}

const RESUELTOS = { municipioId: 1, estadoCivilId: 'Married', tipoVivienda: 'Flat', uso: 'Main', ocupacion: 'Owner' }

test('con la gemela completa y los ids resueltos se puede cotizar, y se DICE de dónde sale el riesgo', () => {
  const p = precalificarHogarCartera(CLIENTE, { numeroPoliza: 'X1', fechaVencimiento: '2027-09-30', hogar: GEMELA }, RESUELTOS, '2026-09-02')
  assert.deepEqual(p.faltan, [])
  assert.equal(p.fuenteRiesgo, 'gemela')
  assert.equal(p.datos.cp, '41002') // el del riesgo, NO el del tomador (41003)
  assert.equal(p.datos.fechaEfecto, '2027-10-01')
  assert.ok(p.supuestos.some((s) => /volcado de junio\/2026/.test(s.porque) && /X1/.test(s.porque)))
  // Los capitales viejos pueden quedarse cortos: optimista.
  assert.ok(p.supuestos.some((s) => s.campo === 'capitalContinente' && s.optimista === true))
})

test('🚨 sin riesgo en la póliza ni en la gemela: el Catastro tapa m²/año y el CP cae al del tomador, todo marcado', () => {
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
  // Sin capitales no se inventa nada: falta.
  assert.ok(p.faltan.some((f) => f.campo === 'capitalContinente'))
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

test('los defectos de la pantalla para tipo/uso/ocupación se declaran como supuestos', () => {
  const p = precalificarHogarCartera(
    CLIENTE,
    { numeroPoliza: null, fechaVencimiento: null, hogar: GEMELA },
    { ...RESUELTOS, supuestos: { uso: true, ocupacion: true } },
    '2026-09-02',
  )
  assert.ok(p.supuestos.some((s) => s.campo === 'uso' && s.optimista === true))
  assert.ok(p.supuestos.some((s) => s.campo === 'ocupacion'))
  assert.ok(!p.supuestos.some((s) => s.campo === 'tipoVivienda'))
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
