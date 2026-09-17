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
 * Los campos con la cuenta puesta donde el vendor la lee. Sin `forzar` no
 * pisa un `payment.bankAccount.iban` que ya viniera; con `forzar` lo
 * sustituye (es lo que hace la ruta: la precedencia ya la decidió ella, y así
 * lo que viaja va NORMALIZADO aunque el JSON avanzado lo trajera con espacios).
 */
export function conCuentaBancaria(campos: Record<string, unknown>, iban: string, forzar = false): Record<string, unknown> {
  if (!forzar && ibanEnCampos(campos)) return campos
  const payment = typeof campos.payment === 'object' && campos.payment !== null ? (campos.payment as Record<string, unknown>) : {}
  const bankAccount =
    typeof payment.bankAccount === 'object' && payment.bankAccount !== null
      ? (payment.bankAccount as Record<string, unknown>)
      : {}
  return { ...campos, payment: { ...payment, bankAccount: { ...bankAccount, iban } } }
}

/**
 * El texto del vendor que significa «falta la cuenta bancaria», no cualquier
 * 400 que la nombre: «The bank account holder name is mandatory» es OTRO
 * hueco, y traducirlo a `iban` mandaría a reteclear una cuenta que ya viajó.
 * Anclado a la frase medida el 12/09/2026.
 */
export function esFalloDeCuentaBancaria(mensaje: string | null | undefined): boolean {
  if (!mensaje) return false
  return /bank\s*account\s+is\s+(mandatory|required)/i.test(mensaje)
}

// ─── De dónde sale la cuenta que viaja, y si hace falta CONFIRMARLA ─────────
//
// 🚨 Dictado de Alberto (12/09/2026): «iban importante siempre confirmar». Una
// cuenta que YA conocemos del cliente (póliza, recibos de CIMA, ficha) NO se
// manda al Submit por su cuenta: la pantalla la enseña enmascarada y con su
// origen, y solo viaja si el corredor la confirma tecleando de vuelta ESA
// máscara (`cuentaConfirmada`), o teclea otro IBAN. El Submit es el contrato,
// y con qué cuenta se domicilia no puede ser una sorpresa del «emitida».

export type OrigenCuenta = 'poliza' | 'recibo' | 'cliente' | 'recibo_otra_poliza'

/** Frase corta para la pantalla, sin la cuenta dentro. */
export function describirOrigenCuenta(origen: OrigenCuenta): string {
  switch (origen) {
    case 'poliza':
      return 'la cuenta guardada en su póliza actual'
    case 'recibo':
      return 'la cuenta con la que paga los recibos de su póliza actual'
    case 'cliente':
      return 'la cuenta guardada en su ficha'
    case 'recibo_otra_poliza':
      return 'la cuenta con la que paga otra póliza suya'
  }
}

export type DecisionCuenta =
  /** Viaja al vendor. `origen` dice de dónde salió, para decirlo en la respuesta. */
  | { tipo: 'enviar'; iban: string; origen: 'tecleada' | 'json_avanzado' | OrigenCuenta }
  /** La ficha tiene cuenta y NADIE la ha confirmado: se pide confirmación, sin llamar al vendor. */
  | { tipo: 'confirmar'; iban: string; origen: OrigenCuenta }
  /** No hay cuenta en ningún sitio: se manda sin ella y decide la compañía. */
  | { tipo: 'sin_cuenta' }

/**
 * Precedencia: tecleada > JSON avanzado > ficha CONFIRMADA. La confirmación es
 * la MÁSCARA que la pantalla enseñó (`ES91…1332`): si la ficha devolviera hoy
 * otra cuenta distinta de la que se confirmó, la máscara no casa y se vuelve
 * a pedir — nunca viaja una cuenta que el corredor no ha visto.
 */
export function decidirCuentaEnvio(args: {
  ibanTecleado: string | null
  ibanJson: string | null
  ficha: { iban: string | null; origen: OrigenCuenta | null }
  cuentaConfirmada: unknown
}): DecisionCuenta {
  if (args.ibanTecleado !== null) return { tipo: 'enviar', iban: args.ibanTecleado, origen: 'tecleada' }
  if (args.ibanJson !== null) return { tipo: 'enviar', iban: args.ibanJson, origen: 'json_avanzado' }
  if (args.ficha.iban && args.ficha.origen) {
    const confirmada =
      typeof args.cuentaConfirmada === 'string' && args.cuentaConfirmada.trim() === ibanEnmascarado(args.ficha.iban)
    return confirmada
      ? { tipo: 'enviar', iban: args.ficha.iban, origen: args.ficha.origen }
      : { tipo: 'confirmar', iban: args.ficha.iban, origen: args.ficha.origen }
  }
  return { tipo: 'sin_cuenta' }
}
