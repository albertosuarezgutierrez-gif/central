// Validación de CIF de sociedad y NIF/NIE de persona física, con dígito de control. PURO.
// F1 solo admite SOCIEDADES como cuenta (CIF en claro: no es dato personal). El NIF del firmante (persona física) solo
// se guarda porque el contrato lo exige en «Reunidos».

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

export const limpiarDocumento = (v: unknown): string =>
  typeof v === 'string' ? v.toUpperCase().replace(/[\s.\-]/g, '') : ''

/** CIF de persona jurídica: letra + 7 cifras + control (cifra o letra según el tipo). null si no es válido. */
export function cifValido(v: unknown): string | null {
  const c = limpiarDocumento(v)
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(c)
  if (!m) return null
  const [, letra, cuerpo, control] = m
  let par = 0
  let impar = 0
  for (let i = 0; i < 7; i++) {
    const d = Number(cuerpo[i])
    if (i % 2 === 1) par += d
    else { const x = d * 2; impar += Math.floor(x / 10) + (x % 10) }
  }
  const digito = (10 - ((par + impar) % 10)) % 10
  const letraControl = 'JABCDEFGHI'[digito]
  const soloLetra = 'NPQRSW'.includes(letra)
  const soloDigito = 'ABEH'.includes(letra)
  const ok = soloLetra ? control === letraControl : soloDigito ? control === String(digito) : control === letraControl || control === String(digito)
  return ok ? c : null
}

/** DNI o NIE de persona física con su letra. null si no es válido. */
export function nifPersonaValido(v: unknown): string | null {
  const c = limpiarDocumento(v)
  const m = /^([XYZ]|\d)(\d{7})([A-Z])$/.exec(c)
  if (!m) return null
  const pre = m[1] === 'X' ? '0' : m[1] === 'Y' ? '1' : m[1] === 'Z' ? '2' : m[1]
  return LETRAS_DNI[Number(pre + m[2]) % 23] === m[3] ? c : null
}
