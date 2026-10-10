import { NextResponse } from 'next/server'
import { z } from 'zod'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { desconectarGoogleContactos } from '@/lib/google-contactos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const Cuerpo = z.object({ borrarContactos: z.boolean() }).strict()

/**
 * POST /api/operador/google-contactos/desconectar — revoca el acceso en Google
 * (oauth2.googleapis.com/revoke), borra el refresh token y los vínculos. Con
 * `borrarContactos: true` borra antes los contactos del grupo que CREÓ el CRM (ni uno vinculado por teléfono/id ni uno
 * personal). La cola de revisión se conserva.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!cuerpo.success) return NextResponse.json({ error: 'Cuerpo inválido: { borrarContactos: boolean }' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await desconectarGoogleContactos(correduria.id, cuerpo.data)
    return NextResponse.json(r, { status: r.estado === 'sin_conexion' ? 404 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/desconectar', e) }, { status: 500 })
  }
})
