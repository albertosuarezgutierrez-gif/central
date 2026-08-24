import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resumenLecturasCaidas, avisoLecturasCaidas, EFECTO_LECTURA, type LecturaCaida,
} from './pricing-lecturas.ts'

test('sin fallos → null en resumen y aviso (el caso normal no genera ruido)', () => {
  assert.equal(resumenLecturasCaidas([]), null)
  assert.equal(avisoLecturasCaidas([]), null)
})

test('el resumen nombra cada lectura caída, en orden', () => {
  const fallos: LecturaCaida[] = [
    { nombre: 'bucket_mes', error: 'Error: timeout' },
    { nombre: 'vuelos', error: 'Error: 42883' },
  ]
  assert.equal(resumenLecturasCaidas(fallos), 'lecturas caídas: bucket_mes, vuelos')
})

test('el aviso dice el EFECTO de cada lectura, no solo su nombre', () => {
  const aviso = avisoLecturasCaidas([{ nombre: 'bucket_fecha', error: 'Error: conexión' }])!
  assert.match(aviso, /bucket_fecha/)
  assert.match(aviso, /estacionalidad/)
  // Y el error crudo, porque decide a qué log ir.
  assert.match(aviso, /conexión/)
})

test('el aviso deja claro que la pasada NO se abortó (esto no es un rail_ciego)', () => {
  const aviso = avisoLecturasCaidas([{ nombre: 'prior_estacional', error: 'x' }])!
  assert.match(aviso, /NO se abortó/)
})

test('una lectura desconocida no revienta el aviso (cae a «señal perdida»)', () => {
  const aviso = avisoLecturasCaidas([{ nombre: 'lectura_futura', error: 'x' }])!
  assert.match(aviso, /lectura_futura: señal perdida/)
})

test('🚨 las seis lecturas de la auditoría tienen efecto declarado', () => {
  for (const nombre of ['bucket_mes', 'bucket_fecha', 'vuelos', 'antelacion', 'prior_estacional', 'velocidad_reservas']) {
    assert.ok(EFECTO_LECTURA[nombre], `falta el efecto de ${nombre}`)
  }
})
