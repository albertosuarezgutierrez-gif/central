import { NextResponse } from 'next/server'
import { verificarCodigoResponsable } from '@/lib/acceso-responsable'
import { repoResponsable } from '@/lib/acceso-responsable-repo'
import { abrirSesionResponsable } from '@/lib/abrir-sesion-responsable'
import { getIp, rateLimit } from '@/lib/rate-limit'

/**
 * Paso 2 de `/login`: canjea el código del responsable. Una empresa (o la última recordada, si sigue autorizada) →
 * sesión `rrhh_session` (`typ:'responsable'` + jti, sesión única); varias sin recordada → cookie `rrhh_pending`
 * (5 min) y el selector de siempre (`/api/auth/seleccionar-empresa`). `recordar:true` = 90 días en vez de 30.
 */
export async function POST(req: Request) {
  if (!rateLimit(`acceso-responsable-verificar:${getIp(req)}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  const r = await verificarCodigoResponsable(repoResponsable, { email: body?.email, codigo: body?.codigo })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  const empresas = r.paso === 'sesion' ? [{ id: r.empresa_id, nombre: '' }] : r.empresas
  return abrirSesionResponsable(req, { usuario_id: r.usuario_id, empresas }, body?.recordar === true)
}
