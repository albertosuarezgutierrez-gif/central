import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { borrarDocumento, leerDocumento, marcarRevisado } from '@/lib/cartera-documentos'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/operador/documentos/[id] — el fichero entero (bytes).
 *
 * 🚨 SIEMPRE como DESCARGA (`attachment`) y con un mime de la lista cerrada,
 * nunca con el que mandó quien lo subió (`leerDocumento()` lo pasa por
 * `mimeParaServir()`). Mismo patrón que la ruta gemela del portal
 * (`apps/asegura-portal/app/api/siniestros/[id]/adjuntos/[documentoId]`), y por
 * la misma razón: estos bytes pueden venir del CLIENTE (`/api/portal/documento`
 * → `guardarDocumentoPropio`), así que servirlos `inline` con un tipo que el
 * navegador ejecute es un XSS en nuestro dominio, con la cookie de sesión del
 * corredor que abra el documento desde `/correduria`.
 */
export async function GET(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  const correduria = await correduriaUnica()
  if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 500 })
  const d = await leerDocumento(correduria.id, id)
  if (!d) return NextResponse.json({ error: 'no existe o no tiene fichero' }, { status: 404 })
  return new Response(new Uint8Array(d.contenido), {
    headers: {
      'content-type': d.mime,
      'content-length': String(d.contenido.length),
      // El nombre va en ASCII plano + UTF-8 codificado: los navegadores viejos leen el primero.
      // Las comillas y la barra invertida se quitan: en esta cabecera son inyección, no acentos.
      'content-disposition': `attachment; filename="${d.nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
      'cache-control': 'private, no-store',
      // Cinturón sobre tirantes: aunque el mime venga de la lista cerrada, el
      // navegador no debe adivinar otro leyendo los primeros bytes.
      'x-content-type-options': 'nosniff',
    },
  })
}

/** PATCH { accion: 'revisar', por } — marca revisado. */
export const PATCH = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  const correduria = await correduriaUnica()
  if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 500 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (body?.accion !== 'revisar') return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
  const por = typeof body.por === 'string' && body.por.trim() ? body.por.trim() : 'corredor'
  const ok = await marcarRevisado(correduria.id, id, por)
  if (!ok) return NextResponse.json({ error: 'no existe, no es de esta correduría o aún está pedido' }, { status: 404 })
  return NextResponse.json({ estado: 'ok' })
})

/** DELETE — el corredor se equivocó de ficha. */
export const DELETE = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  const correduria = await correduriaUnica()
  if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 500 })
  const ok = await borrarDocumento(correduria.id, id)
  if (!ok) return NextResponse.json({ error: 'no existe' }, { status: 404 })
  return NextResponse.json({ estado: 'ok' })
})
