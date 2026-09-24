import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { borrarDocumentoAsegura, descargarDocumentoAsegura, revisarDocumentoAsegura } from '@/lib/documentos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/**
 * Lista CERRADA de tipos que este proxy está dispuesto a rotular.
 *
 * El `content-type` lo elige quien SUBIÓ el fichero, no nosotros: reenviarlo
 * tal cual deja que un `text/html` subido como «DNI» se ejecute en el origen de
 * plataforma, con la cookie de sesión de Alberto delante. Lo que no está aquí
 * se sirve como `application/octet-stream` y forzando la descarga: el navegador
 * no lo interpreta, el corredor lo abre con su programa.
 */
const TIPOS_SERVIBLES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/tiff',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

/** Solo el tipo, sin parámetros (`; charset=…`) y en minúsculas. */
function tipoBase(v: string | null): string | null {
  if (!v) return null
  const t = v.split(';')[0]?.trim().toLowerCase()
  return t || null
}

/**
 * Saneado del `content-disposition`: se conserva el nombre del fichero (es útil
 * para el corredor) pero sin caracteres de control ni comillas, que son con lo
 * que se parte la cabecera. Nunca se reenvía el valor crudo del origen.
 */
function disposicionSegura(v: string | null, forzarDescarga: boolean): string {
  const m = v?.match(/filename\s*=\s*"?([^";]+)"?/i)
  const nombre = (m?.[1] ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\]/g, '')
    .trim()
    .slice(0, 120)
  const tipo = forzarDescarga ? 'attachment' : (v?.trim().toLowerCase().startsWith('inline') ? 'inline' : 'attachment')
  return nombre ? `${tipo}; filename="${nombre}"` : tipo
}

/** GET — el fichero, en streaming desde asegura (sesión de plataforma). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  const r = await descargarDocumentoAsegura(id).catch(() => null)
  if (!r) return NextResponse.json({ error: 'asegura sin configurar o sin respuesta' }, { status: 503 })
  if (!r.ok) return NextResponse.json({ error: `asegura respondió ${r.status}` }, { status: r.status })

  const declarado = tipoBase(r.headers.get('content-type'))
  const servible = declarado !== null && TIPOS_SERVIBLES.has(declarado)

  const cabeceras = new Headers()
  cabeceras.set('content-type', servible ? declarado : 'application/octet-stream')
  const largo = r.headers.get('content-length')
  if (largo) cabeceras.set('content-length', largo)
  cabeceras.set('content-disposition', disposicionSegura(r.headers.get('content-disposition'), !servible))
  // 🚨 Sin esto, un navegador puede «adivinar» que el octet-stream es HTML y
  // ejecutarlo igual: la lista blanca de arriba no serviría de nada.
  cabeceras.set('x-content-type-options', 'nosniff')
  cabeceras.set('cache-control', 'private, no-store')
  return new Response(r.body, { headers: cabeceras })
}

/** PATCH { accion: 'revisar' } — lo marca revisado a nombre de quien tiene la sesión. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const session = guarda.session
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (body?.accion !== 'revisar') return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
  const por = (session as { email?: string; nombre?: string }).email ?? (session as { nombre?: string }).nombre ?? 'plataforma'
  const r = await revisarDocumentoAsegura(id, por)
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  const r = await borrarDocumentoAsegura(id)
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
