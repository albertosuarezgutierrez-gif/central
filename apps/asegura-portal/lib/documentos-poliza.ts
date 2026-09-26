// La documentación ORIGINAL de la compañía de una póliza (26/09/2026): el PDF que la aseguradora
// genera al emitir y que `apps/asegura` archiva en `seguros.documentos` con `visible_por_cliente`.
// Alberto: «la idea es que tengan acceso a la documentación original de la compañía dentro».
//
// 🔒 Aislamiento por CÓDIGO, igual que `adjuntos-parte.ts`: el id de la póliza NO consulta nada. Se lee
// primero la cartera de ESTA identidad (`carteraDeIdentidad`, que parte de `portalVinculo` y de la
// sesión) y solo si la póliza está en sus PROPIAS, y su nivel enseña documentos, se buscan los ficheros.
// Una póliza de un tercero que te autorizó NO abre sus documentos: son datos de la persona
// (`documentos: false` en `camposDeAlcance` para toda persona física) — se decide aquí por la vía corta:
// solo las propias.
//
// Solo se sirve lo que el corredor marcó `visible_por_cliente` y con un mime de la lista cerrada.
import { MIMES_DOCUMENTO, type MimeDocumento } from '@central/module-seguros'
import { camposVisibles } from '@central/module-seguros-portal'

import { carteraDeIdentidad } from './cartera-lectura'
import { prisma } from './db'

export type DocumentoPoliza = { id: string; nombre: string; bytes: number | null; creadoEn: Date }

function mimeGuardado(v: string | null): MimeDocumento | null {
  return v !== null && (MIMES_DOCUMENTO as readonly string[]).includes(v) ? (v as MimeDocumento) : null
}

/** ¿Es `polizaId` una póliza PROPIA de esta identidad con nivel que enseña documentos? */
async function polizaPropiaConDocumentos(identidadId: string, polizaId: string): Promise<boolean> {
  const cartera = await carteraDeIdentidad(identidadId)
  return cartera.propias.some((t) => camposVisibles(t.nivel).documentos && t.polizas.some((p) => p.id === polizaId))
}

/** Los documentos de la compañía de esa póliza. `null` = la póliza no es tuya (o tu nivel no los ve). */
export async function documentosDePoliza(identidadId: string, polizaId: string): Promise<DocumentoPoliza[] | null> {
  if (!(await polizaPropiaConDocumentos(identidadId, polizaId))) return null
  const filas = await prisma.documento.findMany({
    where: { polizaId, visiblePorCliente: true, contenido: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, nombreFichero: true, mimeType: true, sizeBytes: true, createdAt: true },
  })
  return filas
    .filter((f) => mimeGuardado(f.mimeType) !== null)
    .map((f) => ({ id: f.id, nombre: f.nombreFichero ?? 'documento.pdf', bytes: f.sizeBytes, creadoEn: f.createdAt }))
}

/** Un documento para descargar. `null` = no existe, no es tuyo o no se puede servir (se responde igual). */
export async function leerDocumentoPoliza(
  identidadId: string,
  polizaId: string,
  documentoId: string,
): Promise<{ nombre: string; mime: MimeDocumento; contenido: Uint8Array } | null> {
  if (!(await polizaPropiaConDocumentos(identidadId, polizaId))) return null
  const d = await prisma.documento.findFirst({
    where: { id: documentoId, polizaId, visiblePorCliente: true },
    select: { nombreFichero: true, mimeType: true, contenido: true },
  })
  const mime = d ? mimeGuardado(d.mimeType) : null
  if (!d?.contenido || !mime) return null
  return { nombre: d.nombreFichero ?? 'documento.pdf', mime, contenido: d.contenido }
}
