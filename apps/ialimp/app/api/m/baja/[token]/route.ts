// Baja / unsubscribe del mailing. GET (clic humano) y POST (List-Unsubscribe one-click).
// Marca el prospecto como baja=true → el agente nunca le vuelve a enviar.
// Público (exento en middleware).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

async function darDeBaja(token: string, motivo: string) {
  const rows = await prisma.$queryRaw<{ id: string; prospecto_id: string }[]>(Prisma.sql`
    SELECT id, prospecto_id FROM mailing_envios WHERE token = ${token}
  `)
  if (!rows[0]) return false
  const e = rows[0]
  await prisma.$executeRaw(Prisma.sql`
    UPDATE mailing_prospectos
    SET baja = true, baja_at = COALESCE(baja_at, now()), baja_motivo = ${motivo}, estado = 'descartado'
    WHERE id = ${e.prospecto_id}::uuid
  `)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mailing_eventos (envio_id, tipo) VALUES (${e.id}::uuid, 'baja')
  `)
  return true
}

function pagina() {
  return new NextResponse(
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Baja confirmada · IALIMP</title>
    <style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#1e1b4b;display:flex;
    min-height:100vh;align-items:center;justify-content:center;margin:0}
    .card{background:#fff;border-radius:16px;padding:40px;max-width:420px;text-align:center;
    box-shadow:0 12px 36px -20px rgba(30,27,75,.3)}
    .logo{font-size:24px;font-weight:800;letter-spacing:-.03em;margin-bottom:16px}
    .logo span{color:#4f46e5}h1{font-size:20px;margin:0 0 10px}p{color:#64748b;font-size:15px}</style>
    </head><body><div class="card"><div class="logo"><span>ia</span>limp</div>
    <h1>Baja confirmada</h1>
    <p>No volverás a recibir correos comerciales de IALIMP. Disculpa las molestias.</p>
    </div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    await darDeBaja(token, 'enlace')
  } catch { /* no-op */ }
  return pagina()
}

// One-click unsubscribe (header List-Unsubscribe-Post de Gmail/Outlook).
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    await darDeBaja(token, 'one-click')
  } catch { /* no-op */ }
  return new NextResponse(null, { status: 204 })
}
