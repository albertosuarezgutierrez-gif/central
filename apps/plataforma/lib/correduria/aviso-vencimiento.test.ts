import test from 'node:test'
import assert from 'node:assert/strict'
import { alertaVencimiento } from '@central/module-seguros'
import { DIAS_AVISO_ARRIBA, avisoVaArriba } from './aviso-vencimiento.ts'

// Todas las fechas son relativas a un `hoy` inyectado: nunca contra el reloj real.
const HOY = '2026-10-18'
const suma = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)
/** Vencimiento tal que la fecha de aviso (un mes antes) cae a `d` días de HOY. */
function vencConAvisoEn(d: number): string {
  const limite = suma(HOY, d)
  const a = Number(limite.slice(0, 4)), m = Number(limite.slice(5, 7)), dia = limite.slice(8, 10)
  const venc = m === 12 ? `${a + 1}-01-${dia}` : `${a}-${String(m + 1).padStart(2, '0')}-${dia}`
  return venc
}

test('umbral: ≤60 días para el aviso sube; 61 se queda en la tarjeta', () => {
  assert.equal(DIAS_AVISO_ARRIBA, 60)
  for (const [d, arriba] of [[0, true], [1, true], [59, true], [60, true], [61, false], [120, false]] as const) {
    const a = alertaVencimiento(vencConAvisoEn(d), HOY)
    assert.equal(a.estado, 'en_plazo', `d=${d}`)
    assert.equal(a.diasParaAvisar, d, `d=${d}`)
    assert.equal(avisoVaArriba(a), arriba, `d=${d}`)
  }
})

test('si el aviso ya pasó, vencido o sin fecha: se sigue diciendo arriba', () => {
  assert.equal(avisoVaArriba(alertaVencimiento(suma(HOY, 10), HOY)), true) // aviso_pasado
  assert.equal(alertaVencimiento(suma(HOY, 10), HOY).estado, 'aviso_pasado')
  assert.equal(avisoVaArriba(alertaVencimiento(suma(HOY, -3), HOY)), true) // vencido
  assert.equal(avisoVaArriba(alertaVencimiento(null, HOY)), true) // desconocido
})

test('en plazo sin número de días: ante la duda, arriba', () => {
  assert.equal(avisoVaArriba({ estado: 'en_plazo', diasParaAvisar: null }), true)
})
