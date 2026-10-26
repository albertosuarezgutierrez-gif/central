import { NextResponse } from 'next/server'
import { verificarPasswordResponsable, normalizarEmail } from '@/lib/acceso-password'
import { repoPassword } from '@/lib/acceso-password-repo'
import { empresasAutorizadas } from '@/lib/acceso-responsable-repo'
import { abrirSesionResponsable } from '@/lib/abrir-sesion-responsable'
import { enmascararEmail } from '@/lib/sesion-responsable-reglas'
import { getIp, rateLimit } from '@/lib/rate-limit'

/**
 * «Entrar con contraseña» (opcional, solo responsables y SOLO los correos de `RRHH_LOGIN_PASSWORD_EMAILS`; sin la
 * variable, nadie). Topes PERSISTENTES en BD (`lib/acceso-password.ts`): 5 fallos por correo y 30 por IP cada 15 min;
 * superados, la cuenta queda bloqueada con la MISMA respuesta. 🚨 Respuesta uniforme: fuera de la lista, inexistente,
 * sin contraseña válida, errónea o bloqueado dan el mismo 401 `credenciales_invalidas`, siempre tras un bcrypt.
 * La sesión se abre con el MISMO `usuario_id` cuya contraseña se ha comparado (no se vuelve a buscar por correo).
 * El tope en memoria por IP es solo un primer filtro barato contra el bot torpe (antes de tocar la BD).
 */
export async function POST(req: Request) {
  const ip = getIp(req)
  if (!rateLimit(`acceso-responsable-password-ip:${ip}`, 30, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  const v = await verificarPasswordResponsable(repoPassword, { email: body?.email, password: body?.password, ip })
  if (!v.ok) {
    if (v.status === 401) console.warn(`[acceso-responsable] contraseña no válida para ${enmascararEmail(normalizarEmail(body?.email))}`)
    return NextResponse.json({ error: v.error }, { status: v.status })
  }
  const empresas = await empresasAutorizadas(v.usuario_id)
  if (empresas.length === 0) return NextResponse.json({ error: 'credenciales_invalidas' }, { status: 401 })
  return abrirSesionResponsable(req, { usuario_id: v.usuario_id, empresas }, body?.recordar === true)
}
