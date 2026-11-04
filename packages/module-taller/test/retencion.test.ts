// Retención de fotos: qué toca purgar. Fechas RELATIVAS a un `hoy` inyectado (nada con reloj real ni fecha fija).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  configDeAlta, FOTOS_RETENCION_MIN_DIAS, fechaLimitePurga, fotosAPurgar, lotes, plazoRetencionValido, textoFotoPurgada, validarConfig,
  type FotoCandidata, type OrdenEntrega,
} from '../src/index.ts'

const HOY = new Date(Date.UTC(2027, 5, 15, 3, 0, 0))
const hace = (dias: number, extraMs = 0) => new Date(HOY.getTime() - dias * 86_400_000 + extraMs)
const PLAZO = configDeAlta().fotosRetencionDias

const ord = (id: string, estado: string, entregadoEn: Date | null): OrdenEntrega => ({ id, estado, entregadoEn })
const foto = (id: string, otId: string, tipo = 'trabajo', purgadaEn: Date | null = null): FotoCandidata => ({ id, tipo, otId, purgadaEn })

test('plazo de alta: 180 días, y nunca por debajo del mínimo legal de 90', () => {
  assert.equal(PLAZO, 180)
  assert.equal(FOTOS_RETENCION_MIN_DIAS, 90)
  assert.equal(plazoRetencionValido(90), true)
  assert.equal(plazoRetencionValido(89), false)
  assert.equal(plazoRetencionValido(0), false)
  assert.equal(plazoRetencionValido(120.5), false)
  assert.equal(plazoRetencionValido('180'), false)
})

test('toca: entregada hace más del plazo (daños y trabajo); en el límite exacto también', () => {
  const ordenes = [ord('vieja', 'entregado', hace(PLAZO + 1)), ord('limite', 'entregado', hace(PLAZO))]
  const fotos = [foto('a', 'vieja', 'dano'), foto('b', 'vieja', 'trabajo'), foto('c', 'limite')]
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: PLAZO, hoy: HOY }), ['a', 'b', 'c'])
})

test('NO toca: dentro de plazo (un milisegundo antes del límite), sin entregar, sin fecha de entrega', () => {
  const ordenes = [
    ord('reciente', 'entregado', hace(PLAZO, 1)),
    ord('abierta', 'en_curso', hace(PLAZO + 100)),
    ord('terminada', 'terminado', hace(PLAZO + 100)),
    ord('sinfecha', 'entregado', null),
  ]
  const fotos = ['reciente', 'abierta', 'terminada', 'sinfecha'].map((o, i) => foto(`f${i}`, o))
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: PLAZO, hoy: HOY }), [])
})

test('NO toca: lo que no es foto de daños ni de trabajo (firmas, resguardo, presupuesto, factura)', () => {
  const ordenes = [ord('vieja', 'entregado', hace(PLAZO + 30))]
  const fotos = ['firma_recepcion', 'firma_entrega', 'consentimiento', 'resguardo', 'presupuesto', 'factura', ''].map((t, i) => foto(`x${i}`, 'vieja', t))
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: PLAZO, hoy: HOY }), [])
})

test('idempotente: una foto ya purgada no vuelve a salir; foto de una OT desconocida tampoco', () => {
  const ordenes = [ord('vieja', 'entregado', hace(PLAZO + 30))]
  const fotos = [foto('ya', 'vieja', 'trabajo', hace(1)), foto('huerfana', 'no-existe'), foto('nueva', 'vieja')]
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: PLAZO, hoy: HOY }), ['nueva'])
})

test('cada taller con su plazo: el mismo caso toca con 120 días y no con 365', () => {
  const ordenes = [ord('o', 'entregado', hace(200))]
  const fotos = [foto('f', 'o')]
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: 120, hoy: HOY }), ['f'])
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: 365, hoy: HOY }), [])
})

test('plazo por debajo del mínimo o fecha ilegible: no toca nada (falla cerrado)', () => {
  const ordenes = [ord('o', 'entregado', hace(500))]
  const fotos = [foto('f', 'o')]
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: 30, hoy: HOY }), [])
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: 0, hoy: HOY }), [])
  assert.deepEqual(fotosAPurgar({ fotos, ordenes, retencionDias: PLAZO, hoy: new Date('x') }), [])
  assert.deepEqual(fotosAPurgar({ fotos, ordenes: [ord('o', 'entregado', new Date('x'))], retencionDias: PLAZO, hoy: HOY }), [])
})

test('fechaLimitePurga, lotes y el texto de la foto purgada', () => {
  assert.equal(fechaLimitePurga(HOY, 90).getTime(), hace(90).getTime())
  assert.deepEqual(lotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(lotes([], 3), [])
  assert.throws(() => lotes([1], 0))
  assert.equal(textoFotoPurgada(new Date('2026-11-04T10:00:00Z')), 'Foto eliminada el 04/11/2026 (plazo de conservación)')
  // 23:30 UTC del 4 ya es 5 de noviembre en Madrid.
  assert.equal(textoFotoPurgada(new Date('2026-11-04T23:30:00Z')), 'Foto eliminada el 05/11/2026 (plazo de conservación)')
})

test('validarConfig: el plazo mínimo es 90 días (89, 0, decimal y ausente se rechazan; 90 vale)', () => {
  const c = configDeAlta()
  assert.deepEqual(validarConfig(c), [])
  c.fotosRetencionDias = 90
  assert.deepEqual(validarConfig(c), [])
  for (const malo of [89, 0, -5, 120.5]) {
    const d = configDeAlta()
    d.fotosRetencionDias = malo
    assert.ok(validarConfig(d).some((e) => e.includes('fotosRetencionDias')), `se admitió ${malo}`)
  }
  const sin = configDeAlta() as unknown as Record<string, unknown>
  delete sin.fotosRetencionDias
  assert.ok(validarConfig(sin as never).some((e) => e.includes('fotosRetencionDias')))
})
