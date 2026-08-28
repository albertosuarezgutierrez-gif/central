import { test } from 'node:test'
import assert from 'node:assert/strict'
import { medirContinuacion } from './continuacion.ts'
import type { PuntoPrecio } from './precios-stooq.ts'

const igual = (real: number | null, esperado: number | null) => {
  if (esperado == null || real == null) assert.equal(real, esperado)
  else assert.ok(Math.abs(real - esperado) < 1e-9, `${real} ≉ ${esperado}`)
}

const FECHA = '2025-01-10'
const dia = (n: number) => new Date(Date.parse(`${FECHA}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// Serie diaria sintética con un cierre por día desde el día siguiente a la entrada. `hasta` es el
// último día natural cubierto: con 364 la ventana larga queda COMPLETA, con menos queda a medias.
function serie(entrada: number, hasta: number, cierreDe: (n: number) => number): PuntoPrecio[] {
  const puntos: PuntoPrecio[] = [{ fecha: FECHA, cierre: entrada }]
  for (let n = 1; n <= hasta; n++) puntos.push({ fecha: dia(n), cierre: cierreDe(n) })
  return puntos
}

test('sin precio de entrada → todo null (no se sabe, nunca 0)', () => {
  const c = medirContinuacion([{ fecha: '2025-02-01', cierre: 100 }], FECHA)
  assert.deepEqual(c, {
    ret182: null, ret364: null, mfe364: null, mae364: null, diasMfe364: null,
    tendenciaVivaAlSalir: null,
  })
})

test('ventana larga a medias: hay ret182 pero el TECHO se queda en null (una cota inferior no es el máximo)', () => {
  // Llega al día 200: cubre 182 pero no 364.
  const puntos = serie(100, 200, n => 100 + n * 0.1)
  const c = medirContinuacion(puntos, FECHA)
  assert.ok(c.ret182 != null, 'ret182 debería estar medido')
  assert.equal(c.ret364, null)
  assert.equal(c.mfe364, null)
  assert.equal(c.mae364, null)
  assert.equal(c.diasMfe364, null)
})

test('ventana completa: techo, suelo y el día del techo', () => {
  // Sube hasta el día 120 (máximo 130) y luego baja hasta 70 en el 364.
  const puntos = serie(100, 364, n => (n <= 120 ? 100 + n * 0.25 : 130 - (n - 120) * 0.245))
  const c = medirContinuacion(puntos, FECHA)
  igual(c.mfe364, 0.30)
  assert.equal(c.diasMfe364, 120)
  assert.ok(c.mae364 != null && c.mae364 < 0, 'el suelo debería ser negativo')
  // El retorno a 364 es el del ÚLTIMO cierre, no el del techo: vender tarde cuesta.
  assert.ok(c.ret364 != null && c.ret364 < c.mfe364!)
})

test('aguantar puede ser MEJOR que la salida por tiempo — y queda medido', () => {
  // Plana hasta el 91 (+0%) y luego sube el 40%.
  const puntos = serie(100, 364, n => (n <= 91 ? 100 : 100 + (n - 91) * 0.146))
  const c = medirContinuacion(puntos, FECHA)
  igual(c.ret364, 0.39858)
  assert.ok(c.ret364! > 0, 'el arrepentimiento (ret364 − salida por tiempo) sería positivo')
})

test('tendenciaVivaAlSalir: true si el cierre del día 91 está sobre su SMA50', () => {
  const puntos = serie(100, 364, n => 100 + n) // tendencia claramente alcista
  assert.equal(medirContinuacion(puntos, FECHA).tendenciaVivaAlSalir, true)
})

test('tendenciaVivaAlSalir: false si el día 91 cierra bajo su SMA50', () => {
  const puntos = serie(100, 364, n => 200 - n) // tendencia bajista
  assert.equal(medirContinuacion(puntos, FECHA).tendenciaVivaAlSalir, false)
})

test('tendenciaVivaAlSalir: null sin 50 cierres previos al día 91 (no se pudo mirar)', () => {
  // Solo 10 cierres entre la entrada y el horizonte: la SMA50 no es evaluable.
  const puntos: PuntoPrecio[] = [{ fecha: FECHA, cierre: 100 }]
  for (let n = 1; n <= 10; n++) puntos.push({ fecha: dia(n), cierre: 100 + n })
  puntos.push({ fecha: dia(92), cierre: 130 })
  assert.equal(medirContinuacion(puntos, FECHA).tendenciaVivaAlSalir, null)
})

test('la ventana larga NO se cuenta desde antes de la entrada', () => {
  // Un desplome ANTERIOR a la fecha de entrada no puede aparecer como suelo de la operación.
  const puntos = serie(100, 364, n => 100 + n * 0.05)
  puntos.unshift({ fecha: '2024-06-01', cierre: 10 })
  const c = medirContinuacion(puntos, FECHA)
  assert.ok(c.mae364 != null && c.mae364 > -0.5, `suelo contaminado por el pasado: ${c.mae364}`)
})
