// Estado del email y contactabilidad de una ficha de la correduría, tal como los manda asegura (07/11/2026).
// PURO. La regla vive en asegura (`apps/asegura/lib/email-estado.ts`); aquí solo se LEE y se rotula.
// `null` = no se sabe (asegura no lo manda, no lo pudo mirar o manda algo desconocido): nunca se inventa un estado.

/** Mismos valores que `email-estado.ts` de asegura (lo vigila `email-estado-asegura.test.ts`). */
export const ESTADOS_EMAIL = ['sin_comprobar', 'entregado', 'abierto', 'entro_portal', 'rebotado', 'baja'] as const
export type EstadoEmail = (typeof ESTADOS_EMAIL)[number]
export const CONTACTABILIDADES = ['localizable', 'ilocalizable', 'pendiente', 'no_aplica'] as const
export type Contactabilidad = (typeof CONTACTABILIDADES)[number]

export const ETIQUETA_ESTADO_EMAIL: Record<EstadoEmail, string> = {
  sin_comprobar: 'Email sin comprobar',
  entregado: 'Email entregado',
  abierto: 'Email abierto',
  entro_portal: 'Entró al portal',
  rebotado: 'Email rebotado',
  baja: 'Baja de correo',
}

/** Lee un estado de email del puerto; cualquier otra cosa es «no se sabe» (`null`), nunca un estado inventado. */
export function leerEstadoEmail(v: unknown): EstadoEmail | null {
  return typeof v === 'string' && (ESTADOS_EMAIL as readonly string[]).includes(v) ? (v as EstadoEmail) : null
}
export function leerContactabilidad(v: unknown): Contactabilidad | null {
  return typeof v === 'string' && (CONTACTABILIDADES as readonly string[]).includes(v) ? (v as Contactabilidad) : null
}

export const ETIQUETA_CONTACTABILIDAD: Record<Contactabilidad, string> = {
  localizable: 'Localizable',
  ilocalizable: 'Ilocalizable: email malo y sin teléfono',
  pendiente: 'Contacto sin comprobar',
  no_aplica: 'Baja de correo',
}

/** Tono de la etiqueta en la ficha. */
export function tonoEstadoEmail(e: EstadoEmail): 'negativo' | 'positivo' | 'neutral' {
  if (e === 'rebotado' || e === 'baja') return 'negativo'
  if (e === 'sin_comprobar') return 'neutral'
  return 'positivo'
}
