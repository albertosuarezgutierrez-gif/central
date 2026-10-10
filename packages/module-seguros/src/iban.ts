// IBAN: forma y dígitos de control (ISO 13616, módulo 97). PURO.
//
// Vivía en `apps/asegura/lib/codeoscopic/emitir-iban.ts`; se sube aquí (29/09/2026) porque el portal
// del cliente también valida la cuenta que teclea, y la regla de la casa es un solo módulo 97.

/** Sin espacios ni guiones, en mayúsculas. `null` si no queda nada. */
export function normalizarIban(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const limpio = v.replace(/[\s-]/g, '').toUpperCase()
  return limpio === '' ? null : limpio
}

/**
 * Forma y dígitos de control. No se restringe a `ES`: un cliente puede domiciliar en una cuenta
 * extranjera y eso lo decide la compañía, no nosotros.
 */
export function ibanValido(v: unknown): boolean {
  const iban = normalizarIban(v)
  if (!iban || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const reordenado = iban.slice(4) + iban.slice(0, 4)
  let resto = 0
  for (const ch of reordenado) {
    const n = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of n) resto = (resto * 10 + Number(d)) % 97
  }
  return resto === 1
}
