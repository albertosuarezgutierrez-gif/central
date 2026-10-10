// Minimización ANTES de mandar texto a una IA (05/10/2026, canal WhatsApp de la correduría).
// PURO. `@central/core-ai` NO redacta nada: lo que entra en el prompt sale de casa tal cual.
//
// Sustituye por MARCADORES (no borra: la IA tiene que saber que ahí había un DNI para proponer
// «pedir copia del DNI», pero no necesita el número):
//   [EMAIL] · [IBAN] · [TARJETA] · [DNI] · [NIE] · [CIF] · [TELEFONO] · [MATRICULA] · [NUMERO] · [NOMBRE]
//
// Qué NO cubre (y por eso el prompt tampoco lleva la ficha): direcciones postales y nombres que no
// se conocen de antemano. Los nombres conocidos (el de la ficha, el del perfil de WhatsApp) se pasan
// en `opciones.nombres` y se sustituyen por [NOMBRE].
//
// El orden importa: email e IBAN antes que los números sueltos (un IBAN contiene un «teléfono»), y
// la tarjeta solo si pasa Luhn (un número de póliza de 16 dígitos no es una tarjeta: es [NUMERO]).

export type OpcionesRedaccion = {
  /** Nombres/apellidos conocidos del contacto: cada palabra de ≥3 letras se sustituye por [NOMBRE]. */
  nombres?: readonly (string | null | undefined)[]
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// IBAN: 2 letras + 2 dígitos + 10-30 alfanuméricos, admitiendo espacios cada 4.
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi
// Tarjeta: 13-19 dígitos con espacios o guiones opcionales entre grupos.
const TARJETA = /\b\d(?:[ -]?\d){12,18}\b/g
const DNI = /\b\d{8}[ -]?[A-Z]\b/gi
const NIE = /\b[XYZ][ -]?\d{7}[ -]?[A-Z]\b/gi
const CIF = /\b[ABCDEFGHJNPQRSUVW][ -]?\d{7}[ -]?[0-9A-J]\b/gi
// Teléfono: opcional +/00 y 9-15 dígitos con separadores sueltos. No cruza «/» (fechas) ni «,» (importes).
const TELEFONO = /(?:\+|\b00)?\b\d(?:[ .-]?\d){8,14}\b/g
// Matrícula española actual (1234 BCD) y provincial antigua (SE-1234-AB, M 1234 XY).
const MATRICULA_NUEVA = /\b\d{4}[ -]?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/gi
// Solo en MAYÚSCULAS: en minúsculas casaría con «en 2026 te».
const MATRICULA_ANTIGUA = /\b[A-Z]{1,2}[ -]?\d{4}[ -]?[A-Z]{1,2}\b/g
// Cualquier ristra de 7+ dígitos que haya sobrevivido (nº de póliza, de cuenta, referencia catastral…).
const NUMERO_LARGO = /\b\d{7,}\b/g

function luhn(digitos: string): boolean {
  let suma = 0
  let doble = false
  for (let i = digitos.length - 1; i >= 0; i--) {
    let n = digitos.charCodeAt(i) - 48
    if (doble) {
      n *= 2
      if (n > 9) n -= 9
    }
    suma += n
    doble = !doble
  }
  return suma % 10 === 0
}

/** Partículas y el marcador «(sin nombre)»: sustituirlas taparía medio texto. */
const NO_SON_NOMBRE = new Set(['del', 'las', 'los', 'san', 'santa', 'sin', 'nombre', 'von', 'van', 'der'])

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redactarPii(texto: string | null | undefined, opciones: OpcionesRedaccion = {}): string {
  if (typeof texto !== 'string' || texto === '') return ''
  let s = texto
  s = s.replace(EMAIL, '[EMAIL]')
  s = s.replace(IBAN, (m) => (/\d{2}/.test(m.slice(2, 4)) && m.replace(/\s/g, '').length >= 15 ? '[IBAN]' : m))
  s = s.replace(TARJETA, (m) => {
    const d = m.replace(/\D/g, '')
    return d.length >= 13 && d.length <= 19 && luhn(d) ? '[TARJETA]' : m
  })
  s = s.replace(NIE, '[NIE]')
  s = s.replace(DNI, '[DNI]')
  s = s.replace(CIF, '[CIF]')
  s = s.replace(MATRICULA_NUEVA, '[MATRICULA]')
  s = s.replace(TELEFONO, '[TELEFONO]')
  s = s.replace(MATRICULA_ANTIGUA, (m) => (/\d{4}/.test(m) ? '[MATRICULA]' : m))
  s = s.replace(NUMERO_LARGO, '[NUMERO]')
  const palabras = new Set<string>()
  for (const n of opciones.nombres ?? []) {
    if (typeof n !== 'string') continue
    for (const p of n.split(/[\s,.;:()]+/)) if (p.length >= 3 && !NO_SON_NOMBRE.has(p.toLowerCase())) palabras.add(p)
  }
  for (const p of palabras) {
    s = s.replace(new RegExp(`(?<![\\p{L}\\d])${escaparRegex(p)}(?![\\p{L}\\d])`, 'giu'), '[NOMBRE]')
  }
  return s
}
