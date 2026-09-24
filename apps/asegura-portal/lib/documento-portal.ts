/**
 * Manda a `apps/asegura` (por el puente, `/api/portal/documento`) el fichero
 * que el cliente acaba de subir, para que quede en SU ficha y Alberto lo vea y
 * lo verifique desde `plataforma` → Documentos.
 *
 * 🚨 Esto es DISTINTO de `portal_poliza_declarada`: aquella tabla es la bóveda
 * del cliente y solo guarda el NOMBRE del fichero (ver `lib/extraer-poliza.ts`).
 * El fichero de verdad —con el DNI y la matrícula dentro— no puede vivir en
 * este schema: `prisma_asegura_portal` no tiene BYPASSRLS ni el grant que haría
 * falta, y esta app pública es la que menos conviene que guarde ese contenido.
 * Por eso viaja por el mismo puente que ya usa `mis-datos.ts`, con SU propio
 * timeout (más alto: un PDF de varios MB tarda más que un JSON de contacto).
 */
const DOCUMENTO_PUENTE_TIEMPO_MS = 20_000

export type ResultadoDocumentoPropio =
  | { estado: 'ok'; documentoId: string; repetido: boolean }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

export async function guardarDocumentoPropio(
  identidadId: string,
  entrada: { tipo: string; nombre: string; mime: string; contenido: Buffer },
): Promise<ResultadoDocumentoPropio> {
  const p = puente()
  if (!p) return { estado: 'sin_puente' }

  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), DOCUMENTO_PUENTE_TIEMPO_MS)
  try {
    const body = new FormData()
    body.append('identidadId', identidadId)
    body.append('tipo', entrada.tipo)
    // `Buffer` no vale como `BlobPart` tipado en todos los runtimes: se pasa
    // por `Uint8Array`, que sí lo es en todos.
    body.append('documento', new Blob([new Uint8Array(entrada.contenido)], { type: entrada.mime }), entrada.nombre)

    const res = await fetch(`${p.base}/api/portal/documento`, {
      method: 'POST',
      headers: { authorization: `Bearer ${p.secret}` },
      body,
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null

    if (res.ok && estado === 'ok') {
      return {
        estado: 'ok',
        documentoId: typeof j?.documentoId === 'string' ? j.documentoId : '',
        repetido: j?.repetido === true,
      }
    }
    if (estado === 'invalido') return { estado: 'invalido', motivo: typeof j?.motivo === 'string' ? j.motivo : 'fichero no válido' }
    if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
    if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
    if (estado === 'sin_configurar') return { estado: 'sin_puente' }
    console.error(`[portal/documento] respuesta inesperada del puente: ${res.status} ${estado ?? 'sin estado'}`)
    return { estado: 'error', causa: `puente_${res.status}` }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    console.error('[portal/documento] el puente no respondió:', abortado ? 'timeout' : e instanceof Error ? e.message : e)
    return { estado: 'error', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}
