import test from 'node:test'
import assert from 'node:assert/strict'

import { ALCANCES, esAlcance } from './autorizacion.ts'
import {
  ALCANCE_FLOTA,
  empresaPermitida,
  empresasConFlota,
  fechaMatriculacionValida,
  itvDeVehiculo,
  matriculacionDeCompania,
  puedeEditarVehiculo,
  puedeNombrarJefeFlota,
  vehiculosDeFlota,
  vencimientoFlota,
  wherePolizasFlota,
  type AutorizacionFlotaFila,
  type VehiculoFlotaEntrada,
} from './flota.ts'

const HOY = new Date('2026-10-05T10:00:00Z')
const AYER = new Date('2026-10-04T10:00:00Z')

const fichas = new Map([
  ['empresa-a', { tipo: 'juridica' as const }],
  ['empresa-b', { tipo: 'juridica' as const }],
  ['persona', { tipo: 'fisica' as const }],
  ['sin-tipo', { tipo: null }],
])

const aut = (p: Partial<AutorizacionFlotaFila>): AutorizacionFlotaFila => ({
  otorganteClienteId: 'empresa-a',
  alcance: ALCANCE_FLOTA,
  polizaId: null,
  aceptadoEn: AYER,
  caducaEn: null,
  revocadoEn: null,
  ...p,
})

// ─── El alcance `flota` NO abre la empresa entera por los lectores de siempre ──

test('🚨 `flota` NO es un Alcance: ningún lector existente lo convierte en acceso a la ficha entera', () => {
  assert.equal(esAlcance(ALCANCE_FLOTA), false)
  assert.equal((ALCANCES as readonly string[]).includes(ALCANCE_FLOTA), false)
})

// ─── Quién ve qué flota ──────────────────────────────────────────────────────

test('🚨 aislamiento: el dueño de A ve la flota de A y NUNCA la de B', () => {
  const accesos = empresasConFlota({ empresasComoDueno: ['empresa-a'], propias: ['diego'], autorizaciones: [], fichaPorId: fichas, hoy: HOY })
  assert.deepEqual([...accesos], [['empresa-a', 'dueno']])
  assert.equal(empresaPermitida('empresa-b', accesos), null)
  assert.equal(empresaPermitida('empresa-a', accesos), 'empresa-a')
})

test('🚨 aislamiento: el jefe de flota de A no ve la de B aunque pida su id', () => {
  const accesos = empresasConFlota({ empresasComoDueno: [], propias: ['pepe'], autorizaciones: [aut({})], fichaPorId: fichas, hoy: HOY })
  assert.deepEqual([...accesos], [['empresa-a', 'jefe_flota']])
  assert.equal(empresaPermitida('empresa-b', accesos), null)
  assert.equal(empresaPermitida(['empresa-a'], accesos), null)
  assert.equal(empresaPermitida(undefined, accesos), null)
})

test('sin vínculo ni autorización no hay ninguna flota', () => {
  const accesos = empresasConFlota({ empresasComoDueno: [], propias: [], autorizaciones: [], fichaPorId: fichas, hoy: HOY })
  assert.equal(accesos.size, 0)
  assert.equal(empresaPermitida('empresa-a', accesos), null)
})

test('la autorización de flota pendiente, revocada o caducada no abre nada (doble aceptación)', () => {
  for (const a of [
    aut({ aceptadoEn: null }),
    aut({ revocadoEn: AYER }),
    aut({ caducaEn: AYER }),
  ]) {
    assert.equal(empresasConFlota({ empresasComoDueno: [], propias: [], autorizaciones: [a], fichaPorId: fichas, hoy: HOY }).size, 0)
  }
})

test('otro alcance (Solo ver, total) o una póliza suelta NO dan la vista de flota', () => {
  for (const a of [aut({ alcance: 'ver_economico' }), aut({ alcance: 'total' }), aut({ polizaId: 'p1' })]) {
    assert.equal(empresasConFlota({ empresasComoDueno: [], propias: [], autorizaciones: [a], fichaPorId: fichas, hoy: HOY }).size, 0)
  }
})

test('solo sociedades jurídicas EXPLÍCITAS y vivas tienen flota: un NULL no inventa una empresa', () => {
  for (const otorgante of ['persona', 'sin-tipo', 'fusionada-o-inexistente']) {
    const accesos = empresasConFlota({
      empresasComoDueno: [otorgante],
      propias: [],
      autorizaciones: [aut({ otorganteClienteId: otorgante })],
      fichaPorId: fichas,
      hoy: HOY,
    })
    assert.equal(accesos.size, 0, otorgante)
  }
})

test('si es dueño y además jefe de flota, gana dueño', () => {
  const accesos = empresasConFlota({ empresasComoDueno: ['empresa-a'], propias: [], autorizaciones: [aut({})], fichaPorId: fichas, hoy: HOY })
  assert.equal(accesos.get('empresa-a'), 'dueno')
})

test('una ficha propia no entra como jefe de sí misma', () => {
  const accesos = empresasConFlota({ empresasComoDueno: [], propias: ['empresa-a'], autorizaciones: [aut({})], fichaPorId: fichas, hoy: HOY })
  assert.equal(accesos.size, 0)
})

test('solo el dueño nombra jefes; dueño y jefe editan el vehículo; nadie más', () => {
  assert.equal(puedeNombrarJefeFlota('dueno'), true)
  assert.equal(puedeNombrarJefeFlota('jefe_flota'), false)
  assert.equal(puedeNombrarJefeFlota(undefined), false)
  assert.equal(puedeEditarVehiculo('dueno'), true)
  assert.equal(puedeEditarVehiculo('jefe_flota'), true)
  assert.equal(puedeEditarVehiculo(undefined), false)
})

test('🚨 el where de pólizas filtra SIEMPRE por las empresas autorizadas; sin empresas, no hay consulta', () => {
  const EN_VIGOR = { marca: 'en_vigor' }
  assert.equal(wherePolizasFlota([], EN_VIGOR), null)
  const w = wherePolizasFlota(['empresa-a'], EN_VIGOR)
  assert.ok(w)
  assert.deepEqual(w.AND[0].clienteId, { in: ['empresa-a'] })
  assert.deepEqual(w.AND[0].tipo, { in: ['auto', 'moto'] })
  assert.equal(w.AND[0].mergedIntoPolizaId, null)
  assert.equal(w.AND[1], EN_VIGOR)
  assert.equal(JSON.stringify(w).includes('empresa-b'), false)
})

// ─── ITV: null = no lo sabemos, nunca «al día» ───────────────────────────────

test('ITV sin fecha de matriculación ni matrícula estimable → desconocida, nunca calculada', () => {
  const itv = itvDeVehiculo({ ramo: 'auto', matricula: null, matriculacionCompania: null, matriculacionDeclarada: null, hoy: HOY })
  assert.deepEqual(itv, { estado: 'desconocida', motivo: 'sin_matriculacion' })
  const provincial = itvDeVehiculo({ ramo: 'auto', matricula: 'SE-1234-AB', matriculacionCompania: null, matriculacionDeclarada: null, hoy: HOY })
  assert.equal(provincial.estado, 'desconocida')
})

test('ITV de un ramo sin ITV (hogar) → desconocida por perfil', () => {
  assert.deepEqual(
    itvDeVehiculo({ ramo: 'hogar', matricula: null, matriculacionCompania: '2020-01-01', matriculacionDeclarada: null, hoy: HOY }),
    { estado: 'desconocida', motivo: 'sin_perfil' },
  )
})

test('la fecha de la compañía gana a la declarada, y la declarada a la estimada', () => {
  const ambas = itvDeVehiculo({ ramo: 'auto', matricula: '1234LLL', matriculacionCompania: '2024-03-10', matriculacionDeclarada: '2015-01-01', hoy: HOY })
  assert.equal(ambas.estado === 'calculada' && ambas.fuente, 'compania')
  const declarada = itvDeVehiculo({ ramo: 'auto', matricula: '1234LLL', matriculacionCompania: null, matriculacionDeclarada: '2024-03-10', hoy: HOY })
  assert.equal(declarada.estado === 'calculada' && declarada.fuente, 'declarada')
})

test('turismo de 2024: primera ITV a los 4 años, firme; y avisa de que se calcula como turismo', () => {
  const itv = itvDeVehiculo({ ramo: 'auto', matricula: null, matriculacionCompania: '2024-03-10', matriculacionDeclarada: null, hoy: HOY })
  assert.equal(itv.estado, 'calculada')
  if (itv.estado !== 'calculada') return
  assert.equal(itv.fecha, '2028-03-10')
  assert.equal(itv.fiabilidad, 'primera')
  assert.equal(itv.pronto, false)
  assert.equal(itv.calculadaComoTurismo, true)
})

test('ITV a menos de 30 días → pronto; un turismo viejo es estimación de ciclo, no un dato', () => {
  const itv = itvDeVehiculo({ ramo: 'auto', matricula: null, matriculacionCompania: null, matriculacionDeclarada: '2010-10-20', hoy: HOY })
  assert.equal(itv.estado, 'calculada')
  if (itv.estado !== 'calculada') return
  assert.equal(itv.fecha, '2026-10-20')
  assert.equal(itv.pronto, true)
  assert.equal(itv.fiabilidad, 'ciclo_estimado')
})

test('una moto no se marca como «calculada como turismo»', () => {
  const itv = itvDeVehiculo({ ramo: 'moto', matricula: null, matriculacionCompania: '2024-03-10', matriculacionDeclarada: null, hoy: HOY })
  assert.equal(itv.estado === 'calculada' && itv.calculadaComoTurismo, false)
})

test('fecha de matriculación escrita: real, no futura, no anterior a 1950', () => {
  assert.equal(fechaMatriculacionValida('2020-02-29', HOY), '2020-02-29')
  assert.equal(fechaMatriculacionValida('2021-02-29', HOY), null)
  assert.equal(fechaMatriculacionValida('2027-01-01', HOY), null)
  assert.equal(fechaMatriculacionValida('1949-12-31', HOY), null)
  assert.equal(fechaMatriculacionValida('', HOY), null)
  assert.equal(fechaMatriculacionValida(20200101, HOY), null)
})

test('matriculación de la compañía: solo una fecha real de los datos de la póliza', () => {
  assert.equal(matriculacionDeCompania({ fechaMatriculacion: '2019-05-02T00:00:00Z' }), '2019-05-02')
  assert.equal(matriculacionDeCompania({ fechaMatriculacion: 'N/A' }), null)
  assert.equal(matriculacionDeCompania(null), null)
  assert.equal(matriculacionDeCompania([]), null)
})

// ─── Vencimiento: sin fecha ≠ vigente; fecha pasada ≠ vencida ────────────────

test('vencimiento sin fecha es «sin_fecha», nunca «vigente»', () => {
  assert.equal(vencimientoFlota(null, HOY).estado, 'sin_fecha')
  assert.equal(vencimientoFlota('basura', HOY).estado, 'sin_fecha')
})

test('vencimiento pasado de una póliza en vigor = renovación sin confirmar, no «vencida»', () => {
  assert.equal(vencimientoFlota('2026-09-01', HOY).estado, 'renovacion_sin_confirmar')
  assert.equal(vencimientoFlota('2026-10-20', HOY).estado, 'pronto')
  assert.equal(vencimientoFlota('2027-06-01', HOY).estado, 'vigente')
})

// ─── La lista ────────────────────────────────────────────────────────────────

const entrada = (p: Partial<VehiculoFlotaEntrada>): VehiculoFlotaEntrada => ({
  polizaId: 'p',
  ramo: 'auto',
  compania: 'Mapfre',
  matricula: null,
  cosa: null,
  numeroPoliza: null,
  fechaVencimiento: '2027-06-01',
  matriculacionCompania: '2024-03-10',
  matriculacionDeclarada: null,
  ...p,
})

test('lista: lo urgente arriba, lo que no sabemos después (no al final), lo tranquilo al final; fuera lo que no es flota', () => {
  const lista = vehiculosDeFlota(
    [
      entrada({ polizaId: 'tranquilo', matricula: '1111BBB' }),
      entrada({ polizaId: 'desconocido', matricula: null, matriculacionCompania: null }),
      entrada({ polizaId: 'urgente', matricula: '2222CCC', fechaVencimiento: '2026-10-15' }),
      entrada({ polizaId: 'hogar', ramo: 'hogar' }),
    ],
    HOY,
  )
  assert.deepEqual(lista.map((v) => v.polizaId), ['urgente', 'desconocido', 'tranquilo'])
})

test('etiqueta: matrícula > marca/modelo > nº de póliza (último recurso)', () => {
  const [a] = vehiculosDeFlota([entrada({ matricula: ' 1234LLL ', cosa: 'Seat Ibiza · 1234LLL', numeroPoliza: '99' })], HOY)
  assert.equal(a!.etiqueta, '1234LLL')
  assert.equal(a!.clave, '1234LLL')
  const [b] = vehiculosDeFlota([entrada({ cosa: 'Seat Ibiza', numeroPoliza: '99' })], HOY)
  assert.equal(b!.etiqueta, 'Seat Ibiza')
  const [c] = vehiculosDeFlota([entrada({ numeroPoliza: '99' })], HOY)
  assert.equal(c!.etiqueta, 'Póliza nº 99')
})
