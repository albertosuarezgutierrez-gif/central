import { leerContexto } from '@/lib/contexto'
import { documentoDePersona } from '@/lib/db'
import { esUuid } from '@/lib/rls'
import { sha256Hex, puede } from '@central/core-herramientas'

// Descarga del contrato o del certificado para un GESTOR de la cuenta (RLS + `puede(rol, 'ver_contrato')`: el empleado no).
// Se RECALCULA el hash antes de servir: si no
// cuadra, no se sirve (el documento guardado no es el firmado).
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ version: string }> }) {
  const ctx = await leerContexto()
  if (!ctx) return new Response('No autenticado', { status: 401 })
  const { version } = await params
  const tipo = new URL(req.url).searchParams.get('tipo') === 'certificado' ? 'certificado' : 'contrato'
  if (!esUuid(version)) return new Response('No encontrado', { status: 404 })
  const d = await documentoDePersona(ctx.personaId, version.toLowerCase(), tipo)
  // Doble llave: la RLS ya no se lo da al empleado; aquí se comprueba el rol de ESA cuenta (no el de la elegida).
  if (!d || !puede(ctx.cuentas.find((c) => c.id === d.cuentaId)?.rol, 'ver_contrato')) return new Response('No encontrado', { status: 404 })
  if ((await sha256Hex(d.html)) !== d.sha) return new Response('Integridad no verificada: avisa a Grupo ASegura', { status: 409 })
  const descargar = new URL(req.url).searchParams.get('descargar') === '1'
  return new Response(d.html, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-sha256': d.sha,
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
    ...(descargar ? { 'content-disposition': `attachment; filename="${tipo}-${version.slice(0, 8)}.html"` } : {}),
  } })
}
