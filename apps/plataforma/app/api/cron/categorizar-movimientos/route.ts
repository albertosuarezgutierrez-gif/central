import { NextRequest, NextResponse } from 'next/server'
import { barrerSubcategoriasPersonal } from '@/lib/subcategoria-barrido'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cron diario (tras el sync bancario): reparte la SUBCATEGORÍA de gasto personal de TODAS las cuentas.
// Rescata los que quedaron en 'otros_gasto' sin clasificar mandándolos a la IA gratis. Sustituye la
// antigua vía Anthropic de pago (categorizarLoteSinSubcategoria).
//
// Vercel dispara los crons por GET; se mantiene POST para disparo manual.
async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tagged, revisar } = await barrerSubcategoriasPersonal(undefined)
  return NextResponse.json({ tagged, revisar })
}

export { handler as GET, handler as POST }
