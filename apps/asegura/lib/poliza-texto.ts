// Texto de los PDF de una póliza, POR DOCUMENTO (para el buscador `/api/operador/siniestro/poliza-buscar`).
// Copia de la lógica de `textoPolizaDe` (siniestro-ia.ts) pero conservando el id del documento. Sin IA, sin red:
// solo lo archivado en `documentos` de ESA correduría (el PDF de Codeoscopic archivado también vive ahí).
import { prismaAsegura } from './asegura-db'
import { textoPdfParse } from './documentos/extraer-poliza'
import { registrarErrorCartera } from './error-cartera'

export type TextoDocumentoPoliza = { documentoId: string; nombre: string; texto: string }

export async function textosPolizaPorDocumento(correduriaId: string, polizaId: string): Promise<TextoDocumentoPoliza[]> {
  const out: TextoDocumentoPoliza[] = []
  const vistos = new Set<string>()
  try {
    const docs = await prismaAsegura().documento.findMany({
      where: { correduriaId, polizaId, contenido: { not: null } },
      select: { id: true, nombreFichero: true, mimeType: true, contenido: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    for (const d of docs) {
      const esPdf = (d.mimeType ?? '').includes('pdf') || /\.pdf$/i.test(d.nombreFichero ?? '')
      if (!esPdf || !d.contenido) continue
      const t = (await textoPdfParse(Buffer.from(d.contenido))).trim()
      if (t && !vistos.has(t)) { vistos.add(t); out.push({ documentoId: d.id, nombre: d.nombreFichero ?? 'póliza.pdf', texto: t }) }
    }
  } catch (e) {
    registrarErrorCartera('siniestro/poliza-buscar documentos', e)
  }
  return out
}
