// Cola de revisión de la sincronización con Google Contacts (05/10/2026): qué hace cada botón.
// Puro y sin `node:crypto` para que lo importe también la pantalla de plataforma.
//
// 🚨 Ninguna resolución toca el VÍNCULO ni Google. En particular «Mantener CRM» sobre un contacto
// que Alberto sacó a mano del grupo SOLO cierra la revisión: el vínculo se queda
// `fuera_del_grupo` y la sincronización no lo vuelve a crear. Si se borrara el vínculo (o se
// reactivara), la hora siguiente el CRM «ganaría» y lo recrearía en el grupo contra su decisión.

export const TIPOS_REVISION = ['cambio_en_google', 'borrado_en_google', 'sacado_del_grupo', 'propuesta_lead', 'duplicado_ambiguo'] as const
export type TipoRevisionGoogle = (typeof TIPOS_REVISION)[number]

export const ACCIONES_REVISION = ['aceptar_lead', 'descartar', 'mantener_crm'] as const
export type AccionRevision = (typeof ACCIONES_REVISION)[number]

export const ETIQUETA_TIPO_REVISION: Record<TipoRevisionGoogle, string> = {
  cambio_en_google: 'Editado en Google',
  borrado_en_google: 'Borrado en Google',
  sacado_del_grupo: 'Sacado del grupo',
  propuesta_lead: 'Contacto nuevo en el grupo',
  duplicado_ambiguo: 'Teléfono ambiguo',
}

export const ETIQUETA_ACCION_REVISION: Record<AccionRevision, string> = {
  aceptar_lead: 'Aceptar como lead',
  descartar: 'Descartar',
  mantener_crm: 'Mantener CRM',
}

/** Qué botones tiene cada tipo. «Aceptar como lead» solo en un contacto que el CRM no conoce. */
export function accionesPermitidas(tipo: TipoRevisionGoogle): readonly AccionRevision[] {
  return tipo === 'propuesta_lead' ? ['aceptar_lead', 'descartar'] : ['mantener_crm', 'descartar']
}

export type EfectoResolucion =
  | {
      ok: true
      estado: 'aceptada' | 'descartada'
      /** Dar de alta un lead en el CRM con lo que había en Google (solo `aceptar_lead`). */
      altaLead: boolean
      /** Siempre `'ninguno'`: resolver una revisión nunca toca el vínculo ni Google (ver arriba). */
      vinculo: 'ninguno'
    }
  | { ok: false; motivo: string }

export function efectoResolucion(tipo: string, accion: AccionRevision): EfectoResolucion {
  if (!(TIPOS_REVISION as readonly string[]).includes(tipo)) return { ok: false, motivo: `Tipo de revisión desconocido: ${tipo}` }
  if (!accionesPermitidas(tipo as TipoRevisionGoogle).includes(accion)) {
    return { ok: false, motivo: `«${ETIQUETA_ACCION_REVISION[accion]}» no vale para «${ETIQUETA_TIPO_REVISION[tipo as TipoRevisionGoogle]}».` }
  }
  if (accion === 'aceptar_lead') return { ok: true, estado: 'aceptada', altaLead: true, vinculo: 'ninguno' }
  // «Mantener CRM» = lo de Google se rechaza (el CRM ya lo pisó o lo dejó como estaba).
  return { ok: true, estado: accion === 'mantener_crm' ? 'aceptada' : 'descartada', altaLead: false, vinculo: 'ninguno' }
}
