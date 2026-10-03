// ¿Persona física o jurídica? `tipoPersona` guardado manda; sin él, documento + segmento deciden.
// Dígito sin segmento jurídico → null; letra → null; sin documento, solo segmento manda.
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
 * `tipoPersona` guardado manda. Sin él: documento enmascarado acaba en dígito → 'juridica'
 * solo si segmento es jurídico (acaba en letra → null siempre; sin documento → segmento decide).
 */
export function personaDeFicha(f: {
  tipoPersona?: string | null
  dniEnmascarado?: string | null
  segmento?: string | null
}): TipoPersona | null {
  const t = leerTipo(f.tipoPersona)
  if (t) return t
  const d = typeof f.dniEnmascarado === 'string' ? f.dniEnmascarado.trim() : ''
  const esSegmentoJuridico = typeof f.segmento === 'string' && SEGMENTO_JURIDICO.test(f.segmento)

  if (d !== '') {
    if (/\d$/.test(d)) {
      // Documento enmascarado acaba en dígito → 'juridica' solo si segmento es jurídico
      return esSegmentoJuridico ? 'juridica' : null
    } else if (/[a-zA-Z]$/.test(d)) {
      // Documento acaba en letra → null siempre
      return null
    }
  }

  // Sin documento (o sin caracteres reconocibles) → 'juridica' si segmento es jurídico
  return esSegmentoJuridico ? 'juridica' : null
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
