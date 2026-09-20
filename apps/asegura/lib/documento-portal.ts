/**
 * El CLIENTE sube un documento desde `apps/asegura-portal` (hoy, la póliza que
 * acaba de leer el portal) y queda en SU ficha para que Alberto lo vea y lo
 * verifique desde `plataforma` → Documentos — el mismo flujo pedido/recibido/
 * revisado que ya usa para lo que sube él.
 *
 * Mismo patrón que `lib/contacto-portal.ts`: NO recibe `clienteId`, lo resuelve
 * `fichaPropiaDe()` por `portal_vinculo` a partir de la identidad. El fichero se
 * guarda con `guardarDocumento()` (`lib/cartera-documentos.ts`), la MISMA
 * función que usa el corredor — dos caminos de escritura a `seguros.documentos`
 * divergirían en las reglas de tamaño/mime sin que nada lo avisara.
 */
import type { TipoDocumento } from '@central/module-seguros'

import { guardarDocumento } from './cartera-documentos'
import { fichaPropiaDe } from './contacto-portal'

export type ResultadoDocumentoPropio =
  | { estado: 'ok'; documentoId: string; repetido: boolean }
  /** El fichero no vale (tipo o tamaño): lo dice `revisarDocumento()`, no se inventa aquí. */
  | { estado: 'invalido'; motivo: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

export async function guardarDocumentoPropio(
  correduriaId: string,
  identidadId: string,
  entrada: { tipo: TipoDocumento; nombre: string; mime: string; contenido: Buffer },
): Promise<ResultadoDocumentoPropio> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha

  const r = await guardarDocumento(correduriaId, {
    clienteId: ficha.clienteId,
    tipo: entrada.tipo,
    nombre: entrada.nombre,
    mime: entrada.mime,
    contenido: entrada.contenido,
    // Queda escrito en la fila de dónde vino: la pantalla del corredor lo dice
    // ("subido por el cliente") en vez de parecer que lo trajo Alberto.
    subidoPor: 'cliente',
  })
  if (!r.ok) {
    if (r.status === 415) return { estado: 'invalido', motivo: r.motivo }
    return { estado: 'error', causa: r.motivo }
  }
  return { estado: 'ok', documentoId: r.documento.id, repetido: r.repetido }
}
