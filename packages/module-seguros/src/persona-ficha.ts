// ¿Persona física o jurídica? Lo que decide si la ficha pide DNI + nacimiento + carnés
// (física) o solo el CIF (jurídica: comunidades de propietarios, sociedades…).
//
// 🚨 La ficha solo recibe el documento ENMASCARADO («*****9313»): la letra inicial del CIF no
// cruza el puerto. Lo que SÍ distingue es la cola: un DNI/NIE acaba SIEMPRE en letra; un CIF de
// comunidad/sociedad (A-H, J, U, V) acaba en dígito. Acabar en letra es ambiguo (CIF de P, Q, R,
// S, N, W) y NO autoriza a decir «física». Tres estados: `null` = no se sabe → se pinta lo de siempre.
import type { TipoPersona } from './cliente-edicion.ts'

const SEGMENTO_JURIDICO = /(^|[^\p{L}])(comunidad|empresa|sociedad|asociaci[oó]n|fundaci[oó]n|persona\s+jur[ií]dica)(?![\p{L}])/iu

function leerTipo(v: string | null | undefined): TipoPersona | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (t === 'fisica') return 'fisica'
  if (t === 'juridica') return 'juridica'
  return null
}

/**
 * El documento manda (`tipoPersona` guardado al validar el DNI/NIE/CIF; si no, la cola del
 * documento enmascarado); el segmento («Comunidad», «Empresa») solo desempata cuando el
 * documento no habla. Nunca convierte en jurídica a quien el documento dice física.
 */
export function personaDeFicha(f: {
  tipoPersona?: string | null
  dniEnmascarado?: string | null
  segmento?: string | null
}): TipoPersona | null {
  const t = leerTipo(f.tipoPersona)
  if (t) return t
  const d = typeof f.dniEnmascarado === 'string' ? f.dniEnmascarado.trim() : ''
  if (d !== '' && /\d$/.test(d)) return 'juridica'
  if (typeof f.segmento === 'string' && SEGMENTO_JURIDICO.test(f.segmento)) return 'juridica'
  return null
}

/**
 * Teléfono «comodín»: todo ceros o un solo dígito repetido («000000000», «999999999»),
 * lo que algunas compañías mandan cuando no hay teléfono. Con prefijo (+34/0034) también.
 */
export function esTelefonoComodin(v: string | null | undefined): boolean {
  if (typeof v !== 'string') return false
  let d = v.replace(/\D/g, '')
  if (d.startsWith('0034')) d = d.slice(4)
  else if (d.length > 9 && d.startsWith('34')) d = d.slice(2)
  return d.length >= 6 && /^(\d)\1+$/.test(d)
}
