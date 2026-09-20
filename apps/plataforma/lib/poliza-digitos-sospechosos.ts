// Detector PURO, sin BD, de un patrón que ya se avisaba solo en texto de ayuda:
// algunas compañías (Mapfre sobre todo) rellenan los últimos dígitos de la
// póliza con ceros a propósito para que un competidor no pueda pedir el
// control de antecedentes con ese número. El aviso estático ya existía en
// AutoNuevo.tsx/MotoNuevo.tsx; esto lo convierte en una comprobación en vivo
// mientras el corredor teclea, en vez de depender de que se fije solo.

/** ≥3 ceros seguidos en los dígitos tecleados: el patrón real de relleno. */
export function digitosPolizaSospechosos(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length === 0) return false
  return /0{3,}/.test(digitos)
}
