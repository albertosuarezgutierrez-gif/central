// Pixel de apertura de mailing. GET /api/m/o/<token>
// Registra la apertura y devuelve SIEMPRE un GIF 1x1 transparente (nunca 404,
// para no romper el render del cliente de correo). Público (exento en middleware).
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getIp } from '@/lib/propietario-auth'

// GIF 1x1 transparente.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function gif() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const ip = getIp(req)
    const ua = req.headers.get('user-agent') || ''
    const rows = await prisma.$queryRaw<{ id: string; prospecto_id: string; abierto: boolean }[]>(Prisma.sql`
      UPDATE mailing_envios
      SET aperturas = aperturas + 1,
          abierto_at = COALESCE(abierto_at, now())
      WHERE token = ${token}
      RETURNING id, prospecto_id, (abierto_at IS NOT NULL AND aperturas = 1) AS abierto
    `)
    if (rows[0]) {
      const e = rows[0]
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO mailing_eventos (envio_id, tipo, ip, user_agent)
        VALUES (${e.id}::uuid, 'apertura', ${ip}, ${ua})
      `)
      // Avanzar estado del prospecto a 'abierto' (sin pisar estados más avanzados).
      await prisma.$executeRaw(Prisma.sql`
        UPDATE mailing_prospectos
        SET estado = 'abierto'
        WHERE id = ${e.prospecto_id}::uuid AND estado IN ('nuevo','enviado')
      `)
    }
  } catch {
    // no-op: el pixel siempre responde
  }
  return gif()
}
