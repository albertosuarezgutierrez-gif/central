import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { verificarTraspaso, envSecretoTraspaso } from '@central/core-herramientas/traspaso'
import { requireSecret } from '@central/core-identity'
import { prisma } from '@/lib/prisma'
import { repoResponsable } from '@/lib/acceso-responsable-repo'
import { emitirSesionResponsable, DESTINO_RESPONSABLE } from '@/lib/abrir-sesion-responsable'

// Entrada del RESPONSABLE desde «Mi empresa»: token HS256 de un solo uso (aud=rrhh, secreto PROPIO; jamás JWT_SECRET).
// El token no autoriza: se consume el jti (0037), se busca al responsable por su correo VERIFICADO y se exige
// `rrhh.usuario_empresas` para esa empresa. Nunca abre sesiones de empleado.
export const dynamic = 'force-dynamic'

const fallo = (req: Request, motivo: string) => NextResponse.redirect(new URL(`/login?traspaso=${encodeURIComponent(motivo)}`, req.url), 303)

function secreto(): string | null {
  try { return requireSecret(envSecretoTraspaso('rrhh')) || null } catch { return null }
}

export async function POST(req: Request) {
  const s = secreto()
  if (!s) return fallo(req, 'no_configurado')
  const form = await req.formData().catch(() => null)
  const r = await verificarTraspaso(form?.get('token'), 'rrhh', s)
  if (!r.ok) return fallo(req, r.error)
  if (r.carga.exp * 1000 <= Date.now()) return fallo(req, 'expirado')
  const n = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO rrhh.traspasos_usados (jti, exp) VALUES (${r.carga.jti}::uuid, ${new Date(r.carga.exp * 1000)}) ON CONFLICT (jti) DO NOTHING`)
  if (n !== 1) return fallo(req, 'usado')
  const u = await repoResponsable.responsablePorEmail(r.carga.email)
  if (!u || !u.empresas.some((e) => e.id.toLowerCase() === r.carga.ref)) return fallo(req, 'sin_acceso')
  const res = NextResponse.redirect(new URL(DESTINO_RESPONSABLE, req.url), 303)
  await emitirSesionResponsable(res, u.usuario_id, r.carga.ref, false)
  return res
}
