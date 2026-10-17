/**
 * «Anulación confirmada por la compañía» (17/10/2026). Puro: sin BD, sin red.
 *
 * Una sustitución (vieja → nueva) solo salía del seguimiento cuando CIMA traía la baja de la vieja. Pero la
 * compañía a veces la confirma por su cauce (correo, intranet) semanas antes de que CIMA lo refleje — caso
 * Allianz 031698897: confirmada por escrito el 30/09 con efecto 01/11/2026. El corredor lo SELLA en la vieja
 * con el motivo (OBLIGATORIO: de dónde sale la confirmación) y, si la sabe, la fecha de efecto de la baja.
 *
 * 🚨 NO cambia `polizas.estado`: el estado lo manda CIMA. Tampoco usa `baja_verificada_*` («el cliente se va»):
 * esas columnas dan la póliza por `cancelada` YA y un trigger fuerza `cancelada` sobre cualquier vigente que
 * traiga CIMA, cuando aquí la vieja sigue cubriendo hasta su fecha de efecto.
 */

export const MOTIVO_ANULACION_CONFIRMADA_MIN = 10
export const MOTIVO_ANULACION_CONFIRMADA_MAX = 500

export type AnulacionConfirmadaEntrada = { polizaViejaId: string; motivo: string; fechaEfectoBaja: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fechaValida(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(a, mes - 1, d))
  return a >= 2000 && a <= 2100 && t.getUTCFullYear() === a && t.getUTCMonth() === mes - 1 && t.getUTCDate() === d
}

export function validarAnulacionConfirmada(cuerpo: unknown): { ok: true; entrada: AnulacionConfirmadaEntrada } | { ok: false; motivo: string } {
  if (typeof cuerpo !== 'object' || cuerpo === null) return { ok: false, motivo: 'Cuerpo no válido.' }
  const c = cuerpo as Record<string, unknown>
  const polizaViejaId = typeof c.polizaViejaId === 'string' ? c.polizaViejaId.trim() : ''
  if (!UUID.test(polizaViejaId)) return { ok: false, motivo: 'polizaViejaId no válido.' }
  // eslint-disable-next-line no-control-regex
  const motivo = typeof c.motivo === 'string' ? c.motivo.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''
  if (motivo.length < MOTIVO_ANULACION_CONFIRMADA_MIN) {
    return { ok: false, motivo: 'Di de dónde sale la confirmación (p. ej. «Allianz confirma por correo 30/09 anulación con efecto 01/11/2026»).' }
  }
  if (motivo.length > MOTIVO_ANULACION_CONFIRMADA_MAX) return { ok: false, motivo: `El motivo no puede pasar de ${MOTIVO_ANULACION_CONFIRMADA_MAX} caracteres.` }
  let fechaEfectoBaja: string | null = null
  if (c.fechaEfectoBaja !== undefined && c.fechaEfectoBaja !== null && c.fechaEfectoBaja !== '') {
    if (typeof c.fechaEfectoBaja !== 'string' || !fechaValida(c.fechaEfectoBaja.trim())) {
      return { ok: false, motivo: 'La fecha de efecto de la baja no es válida (AAAA-MM-DD).' }
    }
    fechaEfectoBaja = c.fechaEfectoBaja.trim()
  }
  return { ok: true, entrada: { polizaViejaId, motivo, fechaEfectoBaja } }
}

const fechaEs = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Texto de `historial_interno`. Sin datos personales: nº de póliza, compañía, motivo y quién. */
export function textoAnulacionConfirmada(a: { numeroPoliza: string | null; compania: string | null; motivo: string; fechaEfectoBaja: string | null; actor: string }): string {
  const num = a.numeroPoliza?.trim() ? `Póliza ${a.numeroPoliza.trim()}` : 'Póliza sustituida'
  const cia = a.compania?.trim() || 'la compañía'
  const efecto = a.fechaEfectoBaja ? ` con efecto ${fechaEs(a.fechaEfectoBaja)}` : ' (efecto de la baja sin indicar)'
  return `${num} (${cia}): anulación CONFIRMADA por la compañía${efecto} — sellada por ${a.actor}. Motivo: ${a.motivo}. ` +
    'El estado no cambia: lo confirmará CIMA. Sale del seguimiento de sustituciones como posible doble seguro.'
}
