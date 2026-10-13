// Runner tipado por ramo (13/10/2026): el riesgo de un trabajo se valida con el validador DEL RAMO del adaptador y llega
// tipado al adaptador. Adaptadores FALSOS (sin navegador) y datos SINTÉTICOS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FormularioAuto, RiesgoComunidad } from '@central/module-tarificacion'
import type { Page } from 'playwright'
import type { ContextoPortal } from '../src/adaptador.ts'
import { prepararTrabajo, type AdaptadorComunidades, type AdaptadorVehiculo } from '../src/ramo.ts'

const HOY = new Date('2026-10-13T10:00:00Z')
const page = {} as Page
const ctx = {} as ContextoPortal

const formularioMoto = {
  ramo: 'moto',
  matricula: '1234BCD',
  codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'hombre' },
  tomadorEsConductor: true,
  tomadorEsPropietario: true,
  aniosAseguradoAnterior: 5,
  siniestrosUltimos5Anios: 0,
  garajeNoche: true,
  seleccionVehiculo: { marca: 'MARCA DE PRUEBA', modelo: 'MODELO DE PRUEBA', clase: 2, cilindradaCc: 250 },
}

function adaptadorMotoFalso() {
  const llamadas: FormularioAuto[] = []
  const a: AdaptadorVehiculo = {
    compania: 'allianz', ramo: 'moto', credencial: 'X', version: '0.0.0',
    async tarificar(_p, form) { llamadas.push(form); return { ofertas: [] } },
  }
  return { a, llamadas }
}

function adaptadorComunidadFalso() {
  const llamadas: RiesgoComunidad[] = []
  const a: AdaptadorComunidades = {
    compania: 'allianz', ramo: 'comunidades', credencial: 'X', version: '0.0.0',
    async tarificar(_p, riesgo) { llamadas.push(riesgo); return { ofertas: [] } },
  }
  return { a, llamadas }
}

const comunidadValida = {
  ramo: 'comunidades', direccion: { via: null, numero: null, codigoPostal: '41003', municipio: 'Sevilla', provincia: 'Sevilla' },
  fechaEfecto: '2026-11-01', fechaTermino: '2027-11-01', m2Construidos: 1200, anioConstruccion: 1990, plantas: 4,
  tipoVivienda: 'Viviendas Pisos en Alto', uso: 'Habitual', numEdificios: 1, numViviendasYLocales: 20, listaPropietarios: 'Propietarios', capitalContinente: 900000,
}

test('MOTO con formulario válido llega al adaptador (con seleccionVehiculo intacta)', async () => {
  const { a, llamadas } = adaptadorMotoFalso()
  const p = prepararTrabajo(a, formularioMoto, HOY)
  assert.equal(p.ok, true)
  if (!p.ok) return
  assert.equal(p.comunidad, null, 'un ramo de vehículo no tiene emisión asistida')
  await p.tarificar(page, ctx)
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].ramo, 'moto')
  assert.deepEqual(llamadas[0].seleccionVehiculo, { marca: 'MARCA DE PRUEBA', modelo: 'MODELO DE PRUEBA', clase: 2, cilindradaCc: 250 })
})

test('MOTO con formulario inválido NO llega al adaptador: errores (→ `datos`) y sin tarificar', () => {
  const { a, llamadas } = adaptadorMotoFalso()
  const p = prepararTrabajo(a, { ...formularioMoto, matricula: 'no-es-matricula', codigoPostal: '1' }, HOY)
  assert.equal(p.ok, false)
  if (!p.ok) assert.ok(p.errores.length >= 2)
  assert.equal(llamadas.length, 0)
})

test('un RiesgoComunidad no vale para Moto (ni un formulario de moto para Comunidades)', () => {
  assert.equal(prepararTrabajo(adaptadorMotoFalso().a, comunidadValida, HOY).ok, false)
  assert.equal(prepararTrabajo(adaptadorComunidadFalso().a, formularioMoto, HOY).ok, false)
})

test('un formulario de auto no se cuela en el adaptador de moto', () => {
  const p = prepararTrabajo(adaptadorMotoFalso().a, { ...formularioMoto, ramo: 'auto' }, HOY)
  assert.equal(p.ok, false)
})

test('COMUNIDADES sigue igual: valida con validarRiesgoComunidad y expone la emisión', async () => {
  const { a, llamadas } = adaptadorComunidadFalso()
  const p = prepararTrabajo(a, comunidadValida, HOY)
  assert.equal(p.ok, true)
  if (!p.ok) return
  assert.equal(p.comunidad?.adaptador, a)
  await p.tarificar(page, ctx)
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].ramo, 'comunidades')
  assert.equal(prepararTrabajo(a, { ...comunidadValida, m2Construidos: null }, HOY).ok, false)
})

test('el registro de la imagen: Moto entra SOLO con MOTO_ACTIVO (encendido el 13/10/2026 → está), Comunidades sí', async () => {
  const { adaptadores } = await import('../src/adapters/index.ts')
  const { MOTO_ACTIVO } = await import('../src/adapters/allianz/auto.ts')
  assert.equal(adaptadores.claves().includes('allianz::comunidades'), true)
  assert.equal(adaptadores.claves().includes('allianz::moto'), MOTO_ACTIVO)
  assert.equal(adaptadores.obtener('allianz', 'auto'), null, 'Turismos no se registra')
})
