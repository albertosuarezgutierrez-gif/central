import { operadorAutorizado, noAutorizado, uuidONull } from '@/lib/http'
import { opDocumento, SinBdOperadorError } from '@/lib/db-operador'
import { sha256Hex } from '@central/core-herramientas'

// Descarga para el operador (contrato firmado / certificado). Se recalcula el hash antes de servir (verificarIntegridad).
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ version: string }> }) {
  if (!operadorAutorizado(req)) return noAutorizado()
  const v = uuidONull((await params).version)
  const tipo = new URL(req.url).searchParams.get('tipo') === 'certificado' ? 'certificado' : 'contrato'
  if (!v) return new Response('No encontrado', { status: 404 })
  let d: Awaited<ReturnType<typeof opDocumento>>
  try {
    d = await opDocumento(v, tipo)
  } catch (e) {
    if (e instanceof SinBdOperadorError) return new Response('Puerto del operador sin configurar', { status: 503 })
    throw e
  }
  if (!d) return new Response('No encontrado', { status: 404 })
  const sha = await sha256Hex(d.html)
  if (sha !== d.sha) return new Response('Integridad NO verificada', { status: 409 })
  return new Response(d.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-sha256': sha, 'x-integridad': 'verificada' } })
}
