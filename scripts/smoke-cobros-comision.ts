// Smoke de la fórmula de comisión. Ejecuta: npx tsx scripts/smoke-cobros-comision.ts
// Verifica que ia.rest gana (neto plataforma > 0) en todos los casos, con repercutir on/off.
import { PLATAFORMA_DEFAULT, resolverComisionConfig, calcularComision } from '../src/lib/cobros-comision'

// Tarifa Stripe España (tarjeta EEE) que paga la plataforma en un destination charge.
const stripeFee = (totalCobrado: number) => totalCobrado * 0.015 + 0.25

let fallos = 0
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`)
  if (!cond) fallos++
}

// Fallback de defaults cuando la fila no trae valores
const cfgDefault = resolverComisionConfig(null)
check(cfgDefault.pct === PLATAFORMA_DEFAULT.pct && cfgDefault.fija === PLATAFORMA_DEFAULT.fija, 'resolver: null → defaults de plataforma')
const cfgParcial = resolverComisionConfig({ comision_pct: 3, comision_fija_eur: null, minimo_producto_eur: '5' })
check(cfgParcial.pct === 3 && cfgParcial.fija === PLATAFORMA_DEFAULT.fija && cfgParcial.minimo === 5, 'resolver: mezcla valor/NULL/string')

for (const base of [10, 40, 60, 80, 420]) {
  const { comisionEur } = calcularComision(base, cfgDefault)
  // Repercutir OFF: el invitado paga el precio base; Saboga recibe base - comisión
  const netoOff = comisionEur - stripeFee(base)
  // Repercutir ON: el invitado paga base + comisión; Saboga recibe base íntegro
  const netoOn = comisionEur - stripeFee(base + comisionEur)
  check(netoOff > 0, `base ${base}€ · repercutir OFF · comisión ${comisionEur.toFixed(2)}€ · neto plataforma ${netoOff.toFixed(2)}€`)
  check(netoOn > 0, `base ${base}€ · repercutir ON  · comisión ${comisionEur.toFixed(2)}€ · neto plataforma ${netoOn.toFixed(2)}€`)
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
process.exit(fallos === 0 ? 0 : 1)
