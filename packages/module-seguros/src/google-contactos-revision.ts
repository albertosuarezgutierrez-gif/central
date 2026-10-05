// Cola de revisión de la sincronización con Google Contacts (05/10/2026): qué hace cada botón.
// Puro y sin `node:crypto` para que lo importe también la pantalla de plataforma.
//
// 🚨 Ninguna resolución toca Google, y solo UNA toca el VÍNCULO: «Unificar» (abajo). En particular
// «Mantener CRM» sobre un contacto que Alberto sacó a mano del grupo SOLO cierra la revisión: el
// vínculo se queda `fuera_del_grupo` y la sincronización no lo vuelve a crear. Si se borrara el
// vínculo (o se reactivara), la hora siguiente el CRM «ganaría» y lo recrearía en el grupo contra
// su decisión.
//
// «Unificar» (05/10/2026, decisión de Alberto): un `duplicado_ambiguo` INEQUÍVOCO (un solo contacto
// de su agenda y una sola ficha) se resuelve creando el vínculo ficha ↔ ese contacto con origen
// `adoptado` y hash `HASH_PENDIENTE_UNIFICAR` (google-contactos.ts). La pasada siguiente lo adopta:
// emoji, entradas gestionadas, etiqueta; lo demás de Alberto se conserva. Nunca con varios candidatos.
//   · «Unificar» (por defecto, también «Unificar todos»): rellena el MOTE de la ficha
//     (`seguros.cliente_mote`) con el nombre que Alberto le tiene puesto, limpio (`limpiarMote`): a la
//     familia la guarda por relación («mamá»). El contacto queda «🟢 mamá» y la ficha va a la nota
//     («Ficha: …»). El CRM sigue mandando: el mote es un dato del CRM, editable en la ficha.
//   · «Unificar con nombre del CRM»: sin mote; el nombre que tenía queda en la nota, fuera del bloque.
//
// «Usar como mote» (`cambio_en_google` con el nombre cambiado): Alberto lo renombró en Google →
// ese nombre pasa a ser el mote (en vez de pisarlo con el del CRM). Solo fichas, no compañías.

export const TIPOS_REVISION = ['cambio_en_google', 'borrado_en_google', 'sacado_del_grupo', 'propuesta_lead', 'duplicado_ambiguo'] as const
export type TipoRevisionGoogle = (typeof TIPOS_REVISION)[number]

export const ACCIONES_REVISION = ['aceptar_lead', 'descartar', 'mantener_crm', 'unificar', 'unificar_nombre_crm', 'usar_como_mote'] as const
export type AccionRevision = (typeof ACCIONES_REVISION)[number]

/**
 * Por qué un `duplicado_ambiguo` (columna `motivo`, migración 2026-10-05d; `null` = filas anteriores,
 * no se sabe → sin «Unificar»):
 *   · `nombre_distinto`: UN contacto con ese teléfono, con OTRO nombre (y una sola ficha con ese número).
 *   · `telefono_compartido`: varios contactos (o varias fichas) con el mismo número.
 *   · `mismo_email` / `mismo_nombre`: el teléfono no casa, pero fuera de la etiqueta hay UN contacto
 *     (sin id externo) con el mismo correo o el mismo nombre completo: no se crea un duplicado.
 *   · `varios_candidatos`: lo mismo con VARIOS contactos (o varias fichas) posibles.
 */
export const MOTIVOS_DUPLICADO = ['nombre_distinto', 'telefono_compartido', 'mismo_email', 'mismo_nombre', 'varios_candidatos'] as const
export type MotivoDuplicado = (typeof MOTIVOS_DUPLICADO)[number]
/** Solo estos son inequívocos (un contacto ↔ una ficha): los únicos con «Unificar». */
export const MOTIVOS_UNIFICABLES: readonly MotivoDuplicado[] = ['nombre_distinto', 'mismo_email', 'mismo_nombre']
/**
 * «Unificar todos» SOLO con `nombre_distinto` (mismo teléfono: la prueba más fuerte). `mismo_email` /
 * `mismo_nombre` se miran una a una: dos personas pueden llamarse igual.
 */
export const MOTIVOS_UNIFICABLES_EN_LOTE: readonly MotivoDuplicado[] = ['nombre_distinto']

export function esMotivoDuplicado(m: unknown): m is MotivoDuplicado {
  return typeof m === 'string' && (MOTIVOS_DUPLICADO as readonly string[]).includes(m)
}

export const ETIQUETA_TIPO_REVISION: Record<TipoRevisionGoogle, string> = {
  cambio_en_google: 'Editado en Google',
  borrado_en_google: 'Borrado en Google',
  sacado_del_grupo: 'Sacado del grupo',
  propuesta_lead: 'Contacto nuevo en el grupo',
  duplicado_ambiguo: 'Teléfono ambiguo',
}

export const ETIQUETA_MOTIVO_DUPLICADO: Record<MotivoDuplicado, string> = {
  nombre_distinto: 'Mismo teléfono, otro nombre',
  telefono_compartido: 'Teléfono compartido',
  mismo_email: 'Mismo correo',
  mismo_nombre: 'Mismo nombre',
  varios_candidatos: 'Varios posibles',
}

export const ETIQUETA_ACCION_REVISION: Record<AccionRevision, string> = {
  aceptar_lead: 'Aceptar como lead',
  descartar: 'Descartar',
  mantener_crm: 'Mantener CRM',
  unificar: 'Unificar (mi nombre como mote)',
  unificar_nombre_crm: 'Unificar con nombre del CRM',
  usar_como_mote: 'Usar como mote',
}

/**
 * Qué botones tiene cada tipo. «Aceptar como lead» solo en un contacto que el CRM no conoce;
 * «Unificar» solo en un `duplicado_ambiguo` con motivo inequívoco (`MOTIVOS_UNIFICABLES`).
 */
export function accionesPermitidas(tipo: TipoRevisionGoogle, motivo: string | null = null, campos: readonly string[] = []): readonly AccionRevision[] {
  if (tipo === 'propuesta_lead') return ['aceptar_lead', 'descartar']
  if (tipo === 'cambio_en_google' && (campos.includes('nombre') || campos.includes('apellidos'))) return ['usar_como_mote', 'mantener_crm', 'descartar']
  if (tipo === 'duplicado_ambiguo' && esMotivoDuplicado(motivo) && MOTIVOS_UNIFICABLES.includes(motivo)) return ['unificar', 'unificar_nombre_crm', 'mantener_crm', 'descartar']
  return ['mantener_crm', 'descartar']
}

export type EfectoResolucion =
  | {
      ok: true
      estado: 'aceptada' | 'descartada'
      /** Dar de alta un lead en el CRM con lo que había en Google (solo `aceptar_lead`). */
      altaLead: boolean
      /**
       * `'ninguno'`: resolver no toca el vínculo ni Google (ver arriba). `'unificar'`: crear el vínculo
       * ficha ↔ resourceName de la revisión, PENDIENTE (lo escribe la pasada siguiente). Google, nunca.
       */
      vinculo: 'ninguno' | 'unificar'
      /**
       * Guardar como MOTE de la ficha el nombre que había en Google: `unificar` y `usar_como_mote`.
       * (`unificar_nombre_crm` no: el contacto pasa a llamarse como la ficha.)
       */
      mote: boolean
    }
  | { ok: false; motivo: string }

export function efectoResolucion(tipo: string, accion: AccionRevision, motivo: string | null = null, campos: readonly string[] = []): EfectoResolucion {
  if (!(TIPOS_REVISION as readonly string[]).includes(tipo)) return { ok: false, motivo: `Tipo de revisión desconocido: ${tipo}` }
  if (!accionesPermitidas(tipo as TipoRevisionGoogle, motivo, campos).includes(accion)) {
    return {
      ok: false,
      motivo: (accion === 'unificar' || accion === 'unificar_nombre_crm') && tipo === 'duplicado_ambiguo'
        ? 'No se puede unificar: no es inequívoco (varios contactos o varias fichas posibles).'
        : `«${ETIQUETA_ACCION_REVISION[accion]}» no vale para «${ETIQUETA_TIPO_REVISION[tipo as TipoRevisionGoogle]}».`,
    }
  }
  if (accion === 'aceptar_lead') return { ok: true, estado: 'aceptada', altaLead: true, vinculo: 'ninguno', mote: false }
  if (accion === 'unificar' || accion === 'unificar_nombre_crm') {
    return { ok: true, estado: 'aceptada', altaLead: false, vinculo: 'unificar', mote: accion === 'unificar' }
  }
  if (accion === 'usar_como_mote') return { ok: true, estado: 'aceptada', altaLead: false, vinculo: 'ninguno', mote: true }
  // «Mantener CRM» = lo de Google se rechaza (el CRM ya lo pisó o lo dejó como estaba).
  return { ok: true, estado: accion === 'mantener_crm' ? 'aceptada' : 'descartada', altaLead: false, vinculo: 'ninguno', mote: false }
}
