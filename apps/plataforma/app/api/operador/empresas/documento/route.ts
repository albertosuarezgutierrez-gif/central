import { getAdmin } from '@/lib/superadmin'
import { documentoVersion } from '@/lib/adapters/herramientas'

// Descarga del contrato firmado o del certificado (integridad verificada por «Mi empresa»: recalcula el sha256 antes de servir).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response('No autorizado', { status: 401 })
  const u = new URL(req.url)
  const v = u.searchParams.get('version') ?? ''
  const tipo = u.searchParams.get('tipo') === 'certificado' ? 'certificado' : 'contrato'
  const d = await documentoVersion(v, tipo)
  if (!d.html) return new Response(d.status === 409 ? 'Integridad NO verificada: no se sirve' : 'No disponible', { status: d.status })
  return new Response(d.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': `attachment; filename="${tipo}-${v.slice(0, 8)}.html"`, 'x-sha256': d.sha ?? '',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } })
}
