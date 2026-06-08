import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { RGPD_VERSION } from '@/lib/rgpd'

// POST /api/propietario/[token]/consentimiento
// Registra la autorización RGPD del cliente para acceder a su intranet.
// Público (token en URL): /api/propietario está exento de auth en el middleware.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const body = await req.json().catch(() => ({}))
    const ver = (body.version || RGPD_VERSION).toString()
    // Marketing = consentimiento APARTE y opcional (no condiciona el acceso).
    const marketing = body.marketing === true

    // Identificar al cliente por su token de acceso (scope implícito por token único).
    const clientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, empresa_id FROM clientes
      WHERE access_token = ${token} AND notif_activa = true
    `)
    if (!clientes.length) return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    const { id, empresa_id } = clientes[0]

    // Evidencia: IP y user-agent del navegador del cliente.
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null

    // Snapshot del consentimiento vigente en el cliente (servicio + marketing).
    await prisma.$executeRaw(Prisma.sql`
      UPDATE clientes SET
        rgpd_aceptado         = true,
        rgpd_aceptado_at      = now(),
        rgpd_version          = ${ver},
        marketing_aceptado    = ${marketing},
        marketing_aceptado_at = CASE WHEN ${marketing} THEN now() ELSE NULL END
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)

    // Histórico auditable (evidencia de qué se aceptó en este evento).
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO cliente_consentimientos (empresa_id, cliente_id, version, ip, user_agent, marketing)
      VALUES (${empresa_id}::uuid, ${id}::uuid, ${ver}, ${ip}, ${userAgent}, ${marketing})
    `)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
