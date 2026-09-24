// Clasificador PURO del fallo al enviar un mensaje al huésped por Smoobu.
//
// Por qué existe: el aviso de Telegram decía siempre lo mismo («no se pudo enviar, reintenta en un
// momento»), así que una caída de Smoobu (503, página «System Outage» — caso real 16/09/2026,
// reserva 155333446: tres pulsaciones seguidas de ✅ Enviar, ningún reintento podía funcionar) se
// veía IGUAL que una credencial mala o una reserva que ya no existe. Reintentar solo tiene sentido
// en el primer caso; en los otros dos hay que ir a tocar algo.
//
// Módulo aparte y sin dependencias para poder testearlo con `node --test` (`enviar.ts` importa
// `@/lib/smoobu`, que a su vez importa Prisma).

export type ClaseFallo =
  | 'proveedor_caido'      // Smoobu está caído: reintentar MÁS TARDE es lo único que cabe hacer
  | 'sin_credencial'       // falta/está mal la credencial → pms_connections
  | 'reserva_desconocida'  // Smoobu no reconoce esa reserva
  | 'limite'               // rate limit
  | 'rechazo'              // 4xx: Smoobu rechaza la petición (cuerpo, formato…)
  | 'red'                  // no hubo respuesta (excepción de fetch)
  | 'desconocido'

export type MotivoFallo = { clase: ClaseFallo; reintentable: boolean; texto: string }

/**
 * `status` 0 = no hubo respuesta (excepción). `cuerpo` es la respuesta CRUDA de Smoobu: solo se usa
 * para clasificar, nunca se propaga al aviso (llega HTML y rompería el parse_mode de Telegram).
 */
export function motivoFalloEnvio(status: number, cuerpo = ''): MotivoFallo {
  const c = cuerpo.toLowerCase()
  if (!status) {
    return { clase: 'red', reintentable: true, texto: 'No hubo respuesta de Smoobu (fallo de red o timeout).' }
  }
  if (c.includes('smoobu_sin_secreto')) {
    return { clase: 'sin_credencial', reintentable: false, texto: 'Falta el secreto de Smoobu para firmar (pms_connections.smoobu_api_secret). Reintentar NO lo arregla.' }
  }
  if (status === 503 || c.includes('system outage')) {
    return { clase: 'proveedor_caido', reintentable: true, texto: 'Smoobu está caído (503, «System Outage»). No es el mensaje: no hay envío posible hasta que vuelva.' }
  }
  if (status === 401 || status === 403) {
    return { clase: 'sin_credencial', reintentable: false, texto: `Smoobu rechaza la credencial (${status}). Hay que revisar la key/secret en pms_connections — reintentar NO lo arregla.` }
  }
  if (status === 404) {
    return { clase: 'reserva_desconocida', reintentable: false, texto: 'Smoobu no encuentra esa reserva (404). Reintentar NO lo arregla.' }
  }
  if (status === 429) {
    return { clase: 'limite', reintentable: true, texto: 'Smoobu está limitando las peticiones (429). Espera un minuto y reintenta.' }
  }
  if (status >= 500) {
    return { clase: 'proveedor_caido', reintentable: true, texto: `Error del lado de Smoobu (${status}). Reintenta en un rato.` }
  }
  if (status >= 400) {
    return { clase: 'rechazo', reintentable: false, texto: `Smoobu rechaza el envío (${status}). Reintentar tal cual NO lo arregla.` }
  }
  return { clase: 'desconocido', reintentable: true, texto: `Respuesta inesperada de Smoobu (${status}).` }
}

/** Aviso de Telegram completo (HTML). El motivo va en texto propio: nunca el cuerpo de Smoobu. */
export function avisoFalloEnvio(m: MotivoFallo): string {
  const cola = m.reintentable
    ? 'El borrador sigue pendiente: vuelve a darle a ✅ Enviar cuando se recupere.'
    : 'El borrador sigue pendiente, pero <b>no lo reintentes</b> hasta arreglar lo de arriba.'
  return `❌ <b>No se pudo enviar al huésped.</b>\n${m.texto}\n${cola}`
}
