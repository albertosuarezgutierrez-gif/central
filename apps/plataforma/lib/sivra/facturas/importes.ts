// lib/sivra/facturas/importes.ts — desglose base/cuota desde el TOTAL con IVA incluido. PURO.
//
// DECISIÓN (27/10/2026): el importe de la factura es lo que PAGÓ el huésped por la estancia = `incomes.amount_gross`,
// y se trata como IVA INCLUIDO (el precio publicado al huésped en los portales es final). La base y la cuota se
// derivan de ese total con el tipo de IVA configurado en la serie. Todo en CÉNTIMOS ENTEROS: la cuota es
// total − base, así que base + cuota = total SIEMPRE (no se puede descuadrar un céntimo por redondear dos veces).
//
// No se usa `calcularFiscal` de core-fiscal: redondea base y cuota por separado en coma flotante y, en el borde
// del medio céntimo, base + cuota puede no dar el total (el CHECK de la tabla lo rechazaría al emitir).

export type Importes = { total: number; base: number; cuota: number; tipoIva: number }

export function aCentimos(eur: number): number {
  // `toFixed(6)` antes de redondear corrige 1.005*100 = 100.49999…
  return Math.round(Number((eur * 100).toFixed(6)))
}

export function tipoIvaValido(t: unknown): t is number {
  return typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 21
}

/** Desglosa un total con IVA incluido. Lanza si el total no es un importe positivo o el tipo no es válido. */
export function desglosarDesdeTotal(total: number, tipoIva: number): Importes {
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) throw new Error('total no válido')
  if (!tipoIvaValido(tipoIva)) throw new Error('tipo de IVA no válido')
  const totalC = aCentimos(total)
  if (totalC <= 0) throw new Error('total no válido')
  // Base en céntimos con redondeo «half away from zero» sobre una división exacta en enteros escalados.
  const tipoBp = Math.round(tipoIva * 100) // puntos básicos (10 % → 1000)
  const baseC = Math.round((totalC * 10000) / (10000 + tipoBp))
  const cuotaC = totalC - baseC
  return { total: totalC / 100, base: baseC / 100, cuota: cuotaC / 100, tipoIva }
}
