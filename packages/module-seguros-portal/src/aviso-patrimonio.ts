// El aviso del CALENDARIO del patrimonio (24/10/2026, P13): la parte PURA, sin BD.
//
// El cálculo de qué vence y cuándo vive en `@central/module-patrimonio` (`calendarioPatrimonio`); esta capa no lo
// conoce (no depende de él): recibe ya el resultado reducido a lo que la campana y el push necesitan y decide las
// PALABRAS. Quien lo lee (`lib/patrimonio/calendario.ts` del portal) ya acotó por los titulares que ve la sesión.
//
// 🚨 Lo que este aviso NO hace, a propósito:
//  · No avisa de lo que no tiene fecha (`sin_dato`): eso es «Pendiente de ti» («dinos la fecha»), no un vencimiento.
//  · No dice «al día» de nada: solo habla de lo que vence o venció.
//  · No lleva dirección, importe ni nombre de inquilino: solo el alias que el cliente puso a su inmueble.
//  · El portal NO manda correo por esto (no tiene el email en claro); la campana y el push sí.

export type EstadoAvisoPatrimonio = 'vencida' | 'avisar'

/** Un vencimiento del calendario del patrimonio, reducido a lo mínimo. */
export type PatrimonioParaAviso = {
  /** Estable por obligación y ciclo (`Vencimiento.clave`): sirve de id del aviso y de sello del push. */
  clave: string
  /** Etiqueta de la obligación («Certificado de eficiencia energética»). */
  etiqueta: string
  /** Alias que el cliente dio al inmueble. */
  inmueble: string
  /** `YYYY-MM-DD`. */
  vence: string
  estado: EstadoAvisoPatrimonio
  /** Días hasta `vence` (negativo = pasada). */
  dias: number
}

/** Hasta cuántos días tras el vencimiento se sigue diciendo «venció» (después ya es un dato viejo, no un aviso). */
export const DIAS_MAX_VENCIDA_PATRIMONIO = 60

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })

function fechaLegible(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : FECHA.format(d)
}

/** ¿Se avisa de este vencimiento? `vencida` solo hasta `DIAS_MAX_VENCIDA_PATRIMONIO`; `avisar` siempre. */
export function patrimonioSeAvisa(p: Pick<PatrimonioParaAviso, 'estado' | 'dias'>): boolean {
  if (!Number.isInteger(p.dias)) return false
  if (p.estado === 'avisar') return p.dias >= 0
  return p.estado === 'vencida' && p.dias < 0 && p.dias >= -DIAS_MAX_VENCIDA_PATRIMONIO
}

/** Título y detalle. `null` si la fecha no es una fecha (se calla: no se inventa). */
export function textoAvisoPatrimonio(p: PatrimonioParaAviso): { titulo: string; detalle: string } | null {
  const cuando = fechaLegible(p.vence)
  if (cuando === null) return null
  if (p.estado === 'vencida') {
    return {
      titulo: `${p.etiqueta}: venció el ${cuando}`,
      detalle: `Es de «${p.inmueble}». Míralo en el calendario de tu patrimonio.`,
    }
  }
  return {
    titulo: p.dias === 0 ? `${p.etiqueta}: vence hoy` : `${p.etiqueta}: vence el ${cuando}`,
    detalle: `Es de «${p.inmueble}». Lo tienes en el calendario de tu patrimonio.`,
  }
}

/** El texto del push: SIN alias ni dirección (la pantalla de bloqueo la ve cualquiera). */
export function textoPushPatrimonio(p: Pick<PatrimonioParaAviso, 'etiqueta' | 'estado' | 'dias'>): { title: string; body: string } {
  return {
    title: p.estado === 'vencida' ? 'Tienes algo vencido en tu patrimonio' : 'Se acerca un vencimiento de tu patrimonio',
    body: `${p.etiqueta}. Míralo en el calendario.`,
  }
}
