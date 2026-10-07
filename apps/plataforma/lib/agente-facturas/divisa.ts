// Divisa de una factura leída por la IA. Módulo PURO (sin imports) para testearlo con `node --test`.
//
// Regla «null ≠ 0»: si la IA no da divisa, o da algo que no es una moneda reconocible, queda `null`
// («no se sabe»), NUNCA 'EUR' por defecto: `conciliarConBanco` usa `null` para caer a la lista de
// proveedores en USD, y un 'EUR' inventado la desactivaría (tolerancia 3 % en vez de 15 %).
// La divisa es la del campo `total` (= `importe` guardado), no la de otros totales del documento.

const SIMBOLOS: Record<string, string> = {
  '€': 'EUR', '$': 'USD', 'US$': 'USD', 'USD$': 'USD', '£': 'GBP', '¥': 'JPY', '₣': 'CHF',
}

const NOMBRES: Record<string, string> = {
  EURO: 'EUR', EUROS: 'EUR', EUR: 'EUR',
  DOLAR: 'USD', DOLARES: 'USD', 'DOLAR USA': 'USD', 'DOLAR ESTADOUNIDENSE': 'USD',
  'DOLAR AMERICANO': 'USD', 'US DOLLAR': 'USD', 'US DOLLARS': 'USD', DOLLAR: 'USD', DOLLARS: 'USD',
  LIBRA: 'GBP', LIBRAS: 'GBP', 'LIBRA ESTERLINA': 'GBP', 'LIBRAS ESTERLINAS': 'GBP',
  POUND: 'GBP', POUNDS: 'GBP', 'POUND STERLING': 'GBP', STERLING: 'GBP',
  'FRANCO SUIZO': 'CHF', 'FRANCOS SUIZOS': 'CHF', 'SWISS FRANC': 'CHF',
  YEN: 'JPY', YENES: 'JPY',
}

// Códigos ISO 4217 aceptados tal cual (3 letras). Lista cerrada: «ABC» o «N/A» no son moneda.
const ISO = new Set([
  'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
  'RON', 'BGN', 'CNY', 'HKD', 'SGD', 'INR', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'UYU', 'MAD',
  'TRY', 'AED', 'SAR', 'ILS', 'ZAR', 'KRW', 'THB', 'ISK', 'RUB', 'UAH',
])

export function normalizarDivisa(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const t = valor.trim()
  if (!t) return null
  if (SIMBOLOS[t.toUpperCase()]) return SIMBOLOS[t.toUpperCase()]
  const limpio = t
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!limpio) return null
  if (ISO.has(limpio)) return limpio
  return NOMBRES[limpio] ?? null
}
