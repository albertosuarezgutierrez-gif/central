// Descarga y archiva (best-effort, idempotente) el PDF de `issuedDocuments[]`
// en `seguros.documentos`. Extraído el 23/09/2026 para compartirlo entre el
// endpoint de diagnóstico (`/api/operador/codeoscopic/documentos`) y el flujo
// de acuñado real (`emitir/route.ts`, tras `registrarPolizaEmitida`) — antes
// solo vivía en el primero; ver `apps/asegura/CLAUDE.md` § «El PDF de la
// póliza emitida SÍ se archiva».
//
// Nunca lanza: un fallo de descarga o de archivo se devuelve como `aviso`,
// nunca tumba el acuñado ni la respuesta del Submit que lo llama.

import { prismaAsegura } from '../asegura-db.ts'
import { guardarDocumento } from '../cartera-documentos.ts'
import { descargarFicheroVendor } from './cliente.ts'
import { documentosEmitidos, documentoPoliza, documentoCaducado } from './documentos-emitidos.ts'
import type { ConfigCodeoscopic } from './config.ts'

export type ResultadoArchivoDocumento = {
  documentoGuardado: { id: string; repetido: boolean } | null
  avisoDocumento: string | null
}

/**
 * `crudo` es lo que YA se tenía en la mano en la llamada que dispara esto
 * (el proyecto leído, o la respuesta del Submit): nunca se hace un `GET`
 * extra solo para buscar el documento. Si en ese momento el vendor aún no
 * lo ha generado, `documentosEmitidos()` devuelve `[]` y no se archiva nada
 * — el endpoint de diagnóstico sigue siendo el camino para reintentarlo más
 * tarde (ver el pendiente declarado en `apps/asegura/CLAUDE.md`).
 */
export async function archivarDocumentoEmitido(
  config: ConfigCodeoscopic,
  entrada: { correduriaId: string; polizaId: string; crudo: unknown },
): Promise<ResultadoArchivoDocumento> {
  const poliza = documentoPoliza(documentosEmitidos(entrada.crudo))
  if (!poliza) return { documentoGuardado: null, avisoDocumento: null }
  if (documentoCaducado(poliza)) {
    return {
      documentoGuardado: null,
      avisoDocumento: `El documento "${poliza.nombre}" caducó el ${poliza.caducaEn} — Codeoscopic ya no lo sirve.`,
    }
  }
  try {
    const yaGuardado = await prismaAsegura().documento.findFirst({
      where: { correduriaId: entrada.correduriaId, polizaId: entrada.polizaId, tipo: 'poliza', subidoPor: 'agente' },
      select: { id: true },
    })
    if (yaGuardado) return { documentoGuardado: { id: yaGuardado.id, repetido: true }, avisoDocumento: null }

    const { bytes } = await descargarFicheroVendor(config, poliza.url)
    const guardado = await guardarDocumento(entrada.correduriaId, {
      polizaId: entrada.polizaId,
      tipo: 'poliza',
      nombre: `${poliza.nombre}.pdf`,
      mime: 'application/pdf',
      contenido: bytes,
      subidoPor: 'agente',
      notas: `Descargado de Codeoscopic (issuedDocuments) el ${new Date().toISOString()}.`,
    })
    return guardado.ok
      ? { documentoGuardado: { id: guardado.documento.id, repetido: guardado.repetido }, avisoDocumento: null }
      : { documentoGuardado: null, avisoDocumento: `No se pudo archivar el PDF: ${guardado.motivo}` }
  } catch (e) {
    return {
      documentoGuardado: null,
      avisoDocumento: `No se pudo descargar el PDF del vendor: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
