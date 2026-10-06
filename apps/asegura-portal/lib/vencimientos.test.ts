import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ofrecibleParaMejorarPrecio, primaQuePaga, vencimientosEnVentana } from './vencimientos.ts'
import { polizasConBajaEnMarcha } from './anulacion-firma.ts'
import type { PolizaPortal } from './cartera-lectura.ts'

const poliza = (id: string, vence: string | null, vigencia = 'vigente') =>
  ({ id, vigencia, fechaVencimiento: vence === null ? null : new Date(`${vence}T00:00:00Z`) }) as unknown as PolizaPortal

test('entra solo lo vigente, con fecha y dentro de la ventana, del más cercano al más lejano', () => {
  const r = vencimientosEnVentana([
    poliza('lejos', '2026-11-10'),
    poliza('cerca', '2026-09-30'),
    poliza('fuera', '2027-03-01'),
    poliza('pasada', '2026-09-01'),
    poliza('sin-fecha', null),
    poliza('anulada', '2026-10-01', 'anulada'),
  ], '2026-09-23')
  assert.deepEqual(r.map((f) => f.p.id), ['cerca', 'lejos'])
  assert.equal(r[0].dias, 7)
})

test('🪤 la prima: bruta antes que anual, y un 0 no es una prima', () => {
  assert.equal(primaQuePaga({ bruta: 480, anual: 400, mensual: null, fraccionamiento: null }), 480)
  assert.equal(primaQuePaga({ bruta: null, anual: 400, mensual: null, fraccionamiento: null }), 400)
  assert.equal(primaQuePaga({ bruta: 0, anual: 400, mensual: null, fraccionamiento: null }), null)
  assert.equal(primaQuePaga({ bruta: null, anual: null, mensual: null, fraccionamiento: null }), null)
  assert.equal(primaQuePaga(null), null)
})

const sustituida = (id: string, vence: string) =>
  ({ ...poliza(id, vence), sustituidaAt: new Date('2026-09-24T06:15:24Z') }) as unknown as PolizaPortal

test('🪤 una póliza con baja en marcha no «renueva»: sale de la lista aunque siga vigente', () => {
  const lista = [poliza('honda', '2026-11-01'), poliza('otra', '2026-11-05')]
  const conBaja = polizasConBajaEnMarcha({
    anulaciones: [],
    enRevision: [],
    firmadas: [{ id: 'a', polizaId: 'honda', estado: 'comunicada' }] as never,
  })
  assert.deepEqual(vencimientosEnVentana(lista, '2026-10-06', conBaja).map((f) => f.p.id), ['otra'])
  assert.deepEqual(vencimientosEnVentana(lista, '2026-10-06').map((f) => f.p.id), ['honda', 'otra'])
})

test('🪤 la lista y el puente comparten criterio: sustituida (sustituida_at) no se ofrece', () => {
  assert.equal(ofrecibleParaMejorarPrecio(sustituida('x', '2026-11-01')), false)
  assert.equal(ofrecibleParaMejorarPrecio(poliza('x', '2026-11-01')), true)
  assert.deepEqual(vencimientosEnVentana([sustituida('honda', '2026-11-01')], '2026-10-06'), [])
})

test('polizasConBajaEnMarcha: pendientes, en revisión y firmadas; la confirmada solo si se pide', () => {
  const f = {
    anulaciones: [{ polizaId: 'a' }, { polizaId: null }] as never,
    enRevision: [{ polizaId: 'b' }] as never,
    firmadas: [{ polizaId: 'c', estado: 'firmada' }, { polizaId: 'd', estado: 'confirmada' }] as never,
  }
  assert.deepEqual([...polizasConBajaEnMarcha(f)].sort(), ['a', 'b', 'c'])
  assert.deepEqual([...polizasConBajaEnMarcha(f, { conConfirmadas: true })].sort(), ['a', 'b', 'c', 'd'])
})

import { enVigorParaActuar, estadoMejorarPrecio, aceptaMejorarPrecio, puedeOfrecerSolicitarBaja, sinObligacionesDePolizasConBaja, titularesQueOperan } from './vencimientos.ts'

const base = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, vigencia: 'vigente', sustituidaAt: null, fechaVencimiento: new Date('2026-11-01T00:00:00Z'), ...extra }) as unknown as PolizaPortal

test('🪤 «Solicitar baja» solo donde asegura la aceptaría: vigente, no sustituida, sin baja y con puente legible', () => {
  const sinBajas = new Set<string>()
  assert.equal(puedeOfrecerSolicitarBaja(base('a'), sinBajas), true)
  assert.equal(puedeOfrecerSolicitarBaja(base('a', { vigencia: 'pendiente' }), sinBajas), false)
  assert.equal(puedeOfrecerSolicitarBaja(base('a', { vigencia: 'no_vigente', renovacionSinConfirmar: true }), sinBajas), false)
  assert.equal(puedeOfrecerSolicitarBaja(base('a', { sustituidaAt: new Date() }), sinBajas), false)
  assert.equal(puedeOfrecerSolicitarBaja(base('a'), new Set(['a'])), false)
  assert.equal(puedeOfrecerSolicitarBaja(base('a'), null), false)
  assert.equal(enVigorParaActuar(base('a')), true)
})

test('🪤 el enlace a «Mejorar el precio» y la página comparten predicado: sin fecha o sustituida, no', () => {
  assert.equal(aceptaMejorarPrecio(base('a')), true)
  assert.equal(aceptaMejorarPrecio(base('a', { fechaVencimiento: null })), false)
  assert.equal(aceptaMejorarPrecio(base('a', { sustituidaAt: new Date() })), false)
  assert.equal(aceptaMejorarPrecio(base('a', { vigencia: 'no_vigente' })), false)
})

test('🪤 la página de mejorar precio: baja en marcha se dice; puente caído (null) no inventa baja', () => {
  assert.equal(estadoMejorarPrecio(base('a'), new Set()), 'ok')
  assert.equal(estadoMejorarPrecio(base('a'), new Set(['a'])), 'baja_en_marcha')
  assert.equal(estadoMejorarPrecio(base('a'), null), 'ok')
  assert.equal(estadoMejorarPrecio(base('a', { fechaVencimiento: null }), new Set(['a'])), 'no_disponible')
})

test('🪤 avisos «renueva/vence»: salen las de pólizas con baja en marcha, no los recordatorios propios; null = tal cual', () => {
  const filas = [
    { id: '1', tipo: 'poliza', polizaId: 'honda' },
    { id: '2', tipo: 'itv', polizaId: 'honda' },
    { id: '3', tipo: 'poliza', polizaId: 'otra' },
    { id: '4', tipo: 'poliza', polizaId: null },
  ]
  assert.deepEqual(sinObligacionesDePolizasConBaja(filas, new Set(['honda'])).map((f) => f.id), ['2', '3', '4'])
  assert.deepEqual(sinObligacionesDePolizasConBaja(filas, null).map((f) => f.id), ['1', '2', '3', '4'])
  assert.deepEqual(sinObligacionesDePolizasConBaja(filas, new Set()).map((f) => f.id), ['1', '2', '3', '4'])
})

test('🪤 H1: «Solicitar baja»/«Mejorar el precio» solo en fichas cuyo vínculo OPERA (gestionar/administrar)', () => {
  const t = (nivel: string) => ({ nivel, polizas: [base('a')] })
  const todos = [t('tarjeta'), t('completo'), t('gestionar'), t('administrar'), t('raro')]
  assert.deepEqual(titularesQueOperan(todos).map((x) => x.nivel), ['gestionar', 'administrar'])
  // La lista de vencimientos (que enlaza a «Mejorar el precio») sale solo de fichas que operan.
  const hoy = '2026-10-10'
  assert.equal(vencimientosEnVentana(titularesQueOperan([t('completo')]).flatMap((x) => x.polizas), hoy).length, 0)
  assert.equal(vencimientosEnVentana(titularesQueOperan([t('gestionar')]).flatMap((x) => x.polizas), hoy).length, 1)
})

test('🪤 H1: la página y la bóveda usan titularesQueOperan / nivelPuedeOperar (si se quita, el botón vuelve a salir a solo lectura)', () => {
  const dir = new URL('../app/(portal)/boveda/', import.meta.url)
  const mejorar = readFileSync(new URL('mejorar/[id]/page.tsx', dir), 'utf8')
  assert.match(mejorar, /titularesQueOperan\(cartera\.propias\)/)
  const boveda = readFileSync(new URL('page.tsx', dir), 'utf8')
  assert.match(boveda, /puedeSolicitarBaja=\{grupo === 'mias' && opera &&/)
  assert.match(boveda, /puedeMejorarPrecio=\{opera &&/)
  assert.match(boveda, /titularesQueOperan\(cartera\.propias\)\.flatMap/)
})
