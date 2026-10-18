import test from 'node:test'
import assert from 'node:assert/strict'
import { alertaVencimiento } from '@central/module-seguros'
import { DIAS_AVISO_ARRIBA, avisoVaArriba, idsConChipAviso, polizaLlevaChipAviso } from './aviso-vencimiento.ts'

// Todas las fechas son relativas a un `hoy` inyectado: nunca contra el reloj real.
const HOY = '2026-10-18'
const CON_CHIP = { tieneChip: true }
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
    assert.equal(avisoVaArriba(a, CON_CHIP), arriba, `d=${d}`)
  }
})

test('si el aviso ya pasó, vencido o sin fecha: se sigue diciendo arriba', () => {
  assert.equal(avisoVaArriba(alertaVencimiento(suma(HOY, 10), HOY), CON_CHIP), true) // aviso_pasado
  assert.equal(alertaVencimiento(suma(HOY, 10), HOY).estado, 'aviso_pasado')
  assert.equal(avisoVaArriba(alertaVencimiento(suma(HOY, -3), HOY), CON_CHIP), true) // vencido
  assert.equal(avisoVaArriba(alertaVencimiento(null, HOY), CON_CHIP), true) // desconocido
})

test('en plazo sin número de días: ante la duda, arriba', () => {
  assert.equal(avisoVaArriba({ estado: 'en_plazo', diasParaAvisar: null }, CON_CHIP), true)
})

test('sin chip en su tarjeta (o sin saberlo) el aviso lejano se queda arriba', () => {
  const lejos = alertaVencimiento(vencConAvisoEn(120), HOY)
  assert.equal(avisoVaArriba(lejos, { tieneChip: true }), false)
  assert.equal(avisoVaArriba(lejos, { tieneChip: false }), true)
})

test('polizaLlevaChipAviso: misma regla que la tarjeta', () => {
  const base = { viva: true, estado: 'en_vigor', sustituida: false, fechaVencimiento: '2027-03-01' }
  assert.equal(polizaLlevaChipAviso(base), true)
  assert.equal(polizaLlevaChipAviso({ ...base, estado: ' cancelada ' }), false)
  for (const estado of ['vencida', 'competencia', 'fin_riesgo']) assert.equal(polizaLlevaChipAviso({ ...base, estado }), false, estado)
  assert.equal(polizaLlevaChipAviso({ ...base, sustituida: true }), false)
  assert.equal(polizaLlevaChipAviso({ ...base, viva: false }), false)
  assert.equal(polizaLlevaChipAviso({ ...base, fechaVencimiento: null }), false)
  assert.equal(polizaLlevaChipAviso(base, { eliminable: true }), false)
  assert.equal(polizaLlevaChipAviso(base, { historica: true }), false)
})

test('proximo sin chip con >60 días: el aviso va arriba', () => {
  const lejos = alertaVencimiento(vencConAvisoEn(120), HOY)
  const p = { viva: true, estado: 'fin_riesgo', fechaVencimiento: vencConAvisoEn(120) }
  assert.equal(avisoVaArriba(lejos, { tieneChip: polizaLlevaChipAviso(p) }), true)
  assert.equal(avisoVaArriba(lejos, { tieneChip: polizaLlevaChipAviso({ ...p, estado: 'en_vigor' }) }), false)
})

test('idsConChipAviso: viva pero en Oportunidades o histórica → sin chip → el KPI se queda arriba', () => {
  const p = (id: string) => ({ id, viva: true, estado: 'en_vigor', fechaVencimiento: '2027-03-01' })
  const reparto = {
    conNosotros: [
      { clase: 'poliza' as const, poliza: p('a') },
      { clase: 'poliza' as const, poliza: p('h'), historica: true as const },
      { clase: 'oportunidad' as const },
    ],
  }
  const ids = idsConChipAviso(reparto)
  assert.deepEqual([...ids], ['a'])
  const lejos = { estado: 'en_plazo', diasParaAvisar: 120 }
  assert.equal(avisoVaArriba(lejos, { tieneChip: ids.has('a') }), false)
  // Viva pero ausente de «Con nosotros» (va en Oportunidades) o histórica: arriba.
  assert.equal(avisoVaArriba(lejos, { tieneChip: ids.has('o') }), true)
  assert.equal(avisoVaArriba(lejos, { tieneChip: ids.has('h') }), true)
})
