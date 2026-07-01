import { NextRequest, NextResponse } from 'next/server'
import { categorizarLoteSinSubcategoria } from '@/lib/categoria-ia'

async function handle(req: NextRequest) {
  const retroactivo = req.nextUrl.searchParams.get('retroactivo') === 'true'
  const limite = retroactivo ? 2000 : 200
  const { procesados } = await categorizarLoteSinSubcategoria(undefined, limite)
  return NextResponse.json({ procesados })
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handle(req)
}

// GET temporal para categorización retroactiva desde herramientas sin soporte POST
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handle(req)
}
