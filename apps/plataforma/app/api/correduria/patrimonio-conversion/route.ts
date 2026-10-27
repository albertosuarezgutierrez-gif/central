import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerPatrimonioConversion } from '@/lib/correduria/patrimonio-conversion-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/patrimonio-conversion — panel de conversión de Patrimonio (27/10/2026): por titular, lecturas de IA,
 * pólizas en vigor/nuevas y comisión de recibos (12 m). Solo lectura. `error`/`sin_configurar` ≠ «no hay titulares».
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await leerPatrimonioConversion())
}
