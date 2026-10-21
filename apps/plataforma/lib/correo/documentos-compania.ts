// lib/correo/documentos-compania.ts — los PDF de un correo de compañía, a asegura (F1 del agente de correo, 21/10/2026).
//
// El triaje lo llama DESPUÉS de registrar el aviso del mismo correo: así asegura ya sabe a qué póliza/cliente casó y
// archiva el PDF ahí; si no casó, queda «sin asignar» en la bandeja «Correos de compañía». Uno por llamada (base64 ×1,37
// y Vercel corta a ~4,5 MB). Nunca se leen, ni van a la IA ni a Telegram.
//
// `cubo` es PURA (con test): qué significa cada respuesta del puerto. Lo desconocido es FALLO, nunca «guardado».
import { exclusionSeguridad } from './keywords.ts'
import type { CorreoNuevo } from './imap.ts'

export type CuboDocumento = 'guardado' | 'asignado' | 'sin_asignar' | 'repetido' | 'sin_migracion' | 'fallido'

export function cuboDocumento(status: number, json: unknown): CuboDocumento {
  const o = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (o?.estado === 'sin_migracion') return 'sin_migracion'
  if (status !== 200 || !o) return 'fallido'
  if (o.estado === 'repetido') return 'repetido'
  if (o.estado === 'guardado' || o.estado === 'asignado_previo') return o.asignado === true ? 'asignado' : 'sin_asignar'
  return 'fallido'
}

export type CuentaDocumentosCompania = Record<CuboDocumento, number> & { omitidos: number }

/** ¿Este correo puede archivar adjuntos? Solo avisos de compañía, nunca uno excluido (segunda llave tras `imap.ts`). */
export function puedeArchivarAdjuntos(correo: Pick<CorreoNuevo, 'from' | 'subject' | 'texto' | 'extracto'>, categoria: string): boolean {
  if (categoria !== 'correduria' && categoria !== 'correduria-recibo') return false
  return exclusionSeguridad(correo.from, correo.subject, correo.texto ?? correo.extracto) === null
}

/**
 * Manda los adjuntos de compañía del correo a asegura. `enviar` es el puerto (inyectable para el test). Con
 * `sin_migracion` se para (los siguientes darían lo mismo) y se cuenta lo que queda como no guardado.
 */
export async function archivarAdjuntosCompania(
  correo: Pick<CorreoNuevo, 'messageId' | 'adjuntosCompania' | 'adjuntosCompaniaOmitidos'>,
  enviar: (body: { mensajeId: string; nombre: string; mime: string; base64: string }) => Promise<{ status: number; json: unknown }>,
): Promise<CuentaDocumentosCompania> {
  const cuenta: CuentaDocumentosCompania = { guardado: 0, asignado: 0, sin_asignar: 0, repetido: 0, sin_migracion: 0, fallido: 0, omitidos: correo.adjuntosCompaniaOmitidos ?? 0 }
  const lista = correo.adjuntosCompania ?? []
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i]
    const r = await enviar({ mensajeId: correo.messageId, nombre: a.nombre, mime: a.mime, base64: a.contenido.toString('base64') })
      .catch(() => ({ status: 502, json: null }))
    const c = cuboDocumento(r.status, r.json)
    cuenta[c]++
    if (c === 'asignado' || c === 'sin_asignar') cuenta.guardado++
    if (c === 'sin_migracion') { cuenta.sin_migracion += lista.length - i - 1; break }
  }
  return cuenta
}
