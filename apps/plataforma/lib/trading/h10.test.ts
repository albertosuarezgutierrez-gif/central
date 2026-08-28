import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarVariante, parteH10, mediana, MIN_OBSERVACIONES, type ObsSalida } from './h10.ts'

// Genera n observaciones donde la salida por TIEMPO y la VARIANTE tienen medianas y tasas de
// batacazo controladas. `batTiempo`/`batVariante` = proporción de resultados ≤ −15%.
function muestra(n: number, medT: number, medV: number, batT: number, batV: number): ObsSalida[] {
  const out: ObsSalida[] = []
  for (let i = 0; i < n; i++) {
    const tiempo = i < n * batT ? -0.30 : medT + (i % 2 ? 0.001 : -0.001)
    const variante = i < n * batV ? -0.30 : medV + (i % 2 ? 0.001 : -0.001)
    out.push({ tiempo, variante })
  }
  return out
}

test('mediana con número par de elementos promedia los dos centrales', () => {
  assert.equal(mediana([1, 2, 3, 4]), 2.5)
  assert.equal(mediana([3, 1, 2]), 2)
})

test('por debajo del mínimo firmado NO se juzga: sin_muestra, nunca rechazada', () => {
  const v = evaluarVariante('salidaTrail25', muestra(4_999, 0.03, 0.09, 0.10, 0.02))
  assert.equal(v.veredicto, 'sin_muestra')
  assert.match(v.motivo, /4999 de 5000/)
  // Aunque los números fuesen buenísimos, no se cablea con muestra corta.
  assert.ok(Number.isNaN(v.deltaMediana))
})

test('perfil FRENO: recorta ≥5 pp de batacazos cediendo ≤1 pp de mediana', () => {
  const v = evaluarVariante('salidaCoste10', muestra(MIN_OBSERVACIONES, 0.03, 0.0250, 0.10, 0.03))
  assert.equal(v.veredicto, 'cablear_freno')
})

test('el stop −10% REAL (recorta 7,4 pp pero cede 2,7 pp) queda RECHAZADO', () => {
  // Los números medidos el 28/08/2026: es el caso que H9 rechazó "por su propia condición".
  const v = evaluarVariante('salidaStop10', muestra(MIN_OBSERVACIONES, 0.0312, 0.0045, 0.1026, 0.0290))
  assert.equal(v.veredicto, 'rechazada')
  assert.match(v.motivo, /cede/)
})

test('perfil RETORNO: mejora ≥2 pp de mediana sin subir batacazos', () => {
  const v = evaluarVariante('salidaSma50', muestra(MIN_OBSERVACIONES, 0.03, 0.06, 0.10, 0.09))
  assert.equal(v.veredicto, 'cablear_retorno')
})

test('mejora la mediana pero SUBE los batacazos → rechazada (no vale "casi")', () => {
  const v = evaluarVariante('salidaSma200', muestra(MIN_OBSERVACIONES, 0.03, 0.06, 0.10, 0.11))
  assert.equal(v.veredicto, 'rechazada')
})

test('parte: sin ninguna variante con muestra informa del progreso, no del veredicto', () => {
  const vs = [evaluarVariante('salidaTrail25', muestra(1_200, 0.03, 0.03, 0.1, 0.1))]
  const p = parteH10(vs)
  assert.match(String(p), /recolectando/)
  assert.doesNotMatch(String(p), /CUMPLE|Ninguna cumple/)
})

test('parte: con muestra y ninguna cumpliendo, lo dice y revalida la salida por tiempo', () => {
  const vs = [evaluarVariante('salidaTrail25', muestra(MIN_OBSERVACIONES, 0.03, 0.01, 0.10, 0.11))]
  const p = String(parteH10(vs))
  assert.match(p, /Ninguna cumple/)
  assert.match(p, /salida por TIEMPO queda validada/)
})

test('parte: null cuando no hay ni una observación (nada que contar)', () => {
  assert.equal(parteH10([evaluarVariante('salidaSma50', [])]), null)
})
