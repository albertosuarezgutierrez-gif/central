// La cuenta bancaria del Submit (`payment.bankAccount.iban` dentro de
// `policyApplications[]`, ver `docs/CODEOSCOPIC-TRASPASO-MANUEL.md`). Puro:
// sin red ni BD, para poder verlo fallar.
//
// 🚨 Duodécimo 400 real de Codeoscopic (12/09/2026, proyecto 40684860, Allianz):
// «The bank account is mandatory according to the selected companies and
// payment types.» — el Submit exige IBAN según compañía y forma de pago, y
// ni `polizas.cuenta_bancaria` ni `clientes.cuenta_bancaria` lo tenían. El
// IBAN NUNCA se inventa: sale de la ficha (descifrado) o lo teclea el
// corredor en plataforma; si no está en ninguno de los dos sitios, el 400 se
// traduce a un hueco (`faltan_campos: ['iban']`) en vez de enseñarse como
// fallo del vendor.

/** Sin espacios ni guiones, en mayúsculas. `null` si no queda nada. */
export function normalizarIban(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const limpio = v.replace(/[\s-]/g, '').toUpperCase()
  return limpio === '' ? null : limpio
}

/**
 * Forma y dígitos de control (ISO 13616, módulo 97). No se restringe a `ES`:
 * un cliente puede domiciliar en una cuenta extranjera y eso lo decide la
 * compañía, no nosotros.
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

/** Solo lo que un humano necesita para reconocer la cuenta: país + últimos 4. */
export function ibanEnmascarado(v: unknown): string {
  const iban = normalizarIban(v)
  if (!iban) return '—'
  return `${iban.slice(0, 4)}…${iban.slice(-4)}`
}

/** `payment.bankAccount.iban` si ya viaja en los campos (p. ej. tecleado en el JSON avanzado). */
export function ibanEnCampos(campos: Record<string, unknown>): string | null {
  const payment = campos.payment
  if (typeof payment !== 'object' || payment === null) return null
  const cuenta = (payment as Record<string, unknown>).bankAccount
  if (typeof cuenta !== 'object' || cuenta === null) return null
  return normalizarIban((cuenta as Record<string, unknown>).iban)
}

/**
 * Separa el `iban` de primer nivel que manda plataforma (la caja de la
 * pantalla) del resto de campos. El vendor no conoce esa clave: hay que
 * moverla a `payment.bankAccount.iban` con `conCuentaBancaria()`.
 */
export function extraerIbanTecleado(campos: Record<string, unknown>): {
  iban: string | null
  resto: Record<string, unknown>
} {
  const { iban, ...resto } = campos
  return { iban: normalizarIban(iban), resto }
}

/**
 * Los campos con la cuenta puesta donde el vendor la lee. No pisa un
 * `payment.bankAccount.iban` que ya viniera: lo tecleado a mano en el JSON
 * avanzado manda sobre lo que se dedujo de la ficha.
 */
export function conCuentaBancaria(campos: Record<string, unknown>, iban: string): Record<string, unknown> {
  if (ibanEnCampos(campos)) return campos
  const payment = typeof campos.payment === 'object' && campos.payment !== null ? (campos.payment as Record<string, unknown>) : {}
  const bankAccount =
    typeof payment.bankAccount === 'object' && payment.bankAccount !== null
      ? (payment.bankAccount as Record<string, unknown>)
      : {}
  return { ...campos, payment: { ...payment, bankAccount: { ...bankAccount, iban } } }
}

/** El texto del vendor que significa «falta la cuenta bancaria», no cualquier 400. */
export function esFalloDeCuentaBancaria(mensaje: string | null | undefined): boolean {
  if (!mensaje) return false
  return /bank\s*account/i.test(mensaje) && /mandatory|required|obligator/i.test(mensaje)
}
