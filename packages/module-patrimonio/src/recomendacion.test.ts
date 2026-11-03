import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DIAS_RECOMPENSA_RECOMENDACION,
  DIAS_VALIDEZ_RECOMENDACION,
  caducidadRecomendacion,
  estadoRecomendacion,
  finRecompensaRecomendacion,
  normalizarCorreoRecomendado,
  puedeCanjearRecomendacion,
  recompensaRecomendacionVigente,
  textoRecomendacion,
} from './recomendacion.ts'

// Fechas SIEMPRE relativas a una `hoy` inyectada: nunca fecha fija contra el reloj real.
const HOY = new Date()
const dias = (n: number, desde: Date = HOY) => new Date(desde.getTime() + n * 24 * 60 * 60 * 1000)

test('el correo se normaliza (trim + minúsculas) y lo que no es un correo es null', () => {
  assert.equal(normalizarCorreoRecomendado('  Ana.Lopez@Correo.ES '), 'ana.lopez@correo.es')
  for (const malo of ['', 'ana', 'ana@', '@correo.es', 'ana@correo', 'a b@correo.es', 'ana@correo.es,otro@x.es', 600, null, undefined, 'ana@correo.es‮', '<a@b.es>']) {
    assert.equal(normalizarCorreoRecomendado(malo), null, String(malo))
  }
  assert.equal(normalizarCorreoRecomendado(`${'a'.repeat(250)}@b.es`), null)
})

test('estado: conseguida > anulada > caducada > pendiente, y sin fecha de caducidad = caducada', () => {
  const caduca = caducidadRecomendacion(HOY)
  assert.equal(caduca.getTime() - HOY.getTime(), DIAS_VALIDEZ_RECOMENDACION * 24 * 3600 * 1000)
  const base = { anuladaEn: null, caducaEn: caduca, canjeadaEn: null }
  assert.equal(estadoRecomendacion(base, HOY), 'pendiente')
  assert.equal(estadoRecomendacion(base, caduca), 'caducada')
  assert.equal(estadoRecomendacion({ ...base, caducaEn: null }, HOY), 'caducada')
  assert.equal(estadoRecomendacion({ ...base, anuladaEn: HOY }, HOY), 'anulada')
  assert.equal(estadoRecomendacion({ ...base, canjeadaEn: HOY }, dias(900)), 'conseguida', 'un canje hecho no se deshace ni caduca')
})

test('🚨 canje: no el propio recomendador, no una cuenta anterior a la recomendación, no si no consta cuándo se creó', () => {
  const creada = dias(-1)
  const c = { recomendadorIdentidadId: 'A', creadaEn: creada, anuladaEn: null, caducaEn: caducidadRecomendacion(creada), canjeadaEn: null }
  assert.equal(puedeCanjearRecomendacion(c, { identidadId: 'B', creadaEn: dias(0) }, HOY), true)
  assert.equal(puedeCanjearRecomendacion(c, { identidadId: 'A', creadaEn: dias(0) }, HOY), false, 'a sí mismo')
  assert.equal(puedeCanjearRecomendacion(c, { identidadId: 'B', creadaEn: dias(-30) }, HOY), false, 'ya tenía cuenta')
  assert.equal(puedeCanjearRecomendacion(c, { identidadId: 'B', creadaEn: null }, HOY), false, 'null = no se sabe')
  assert.equal(puedeCanjearRecomendacion({ ...c, canjeadaEn: HOY }, { identidadId: 'B', creadaEn: dias(0) }, HOY), false, 'ya canjeada')
  assert.equal(puedeCanjearRecomendacion({ ...c, anuladaEn: HOY }, { identidadId: 'B', creadaEn: dias(0) }, HOY), false, 'anulada')
  assert.equal(puedeCanjearRecomendacion(c, { identidadId: 'B', creadaEn: dias(0) }, dias(DIAS_VALIDEZ_RECOMENDACION + 5, creada)), false, 'caducada')
})

test('recompensa: 90 días desde el canje, justo en el límite ya no, y null/vacío = ninguna', () => {
  const canje = dias(-10)
  const fin = finRecompensaRecomendacion(canje)
  assert.equal(fin.getTime() - canje.getTime(), DIAS_RECOMPENSA_RECOMENDACION * 24 * 3600 * 1000)
  assert.equal(DIAS_RECOMPENSA_RECOMENDACION >= 90, true, '90 días como MÍNIMO')
  assert.equal(recompensaRecomendacionVigente([canje], HOY), true)
  assert.equal(recompensaRecomendacionVigente([canje], fin), false)
  assert.equal(recompensaRecomendacionVigente([canje], new Date(fin.getTime() - 1)), true)
  assert.equal(recompensaRecomendacionVigente([], HOY), false)
  assert.equal(recompensaRecomendacionVigente([null], HOY), false)
  assert.equal(recompensaRecomendacionVigente([dias(-200), null, dias(-5)], HOY), true, 'vale la más reciente')
})

test('el texto que se comparte solo presenta el portal: lleva el enlace y nada de pólizas ni dinero', () => {
  const t = textoRecomendacion('https://portal.ejemplo.es')
  assert.match(t, /https:\/\/portal\.ejemplo\.es/)
  assert.match(t, /90 días/)
  assert.doesNotMatch(t, /póliza|prima|€|matrícula|comisión/i)
})
