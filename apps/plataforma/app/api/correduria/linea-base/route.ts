import { NextResponse } from 'next/server'
import { semanasLineaBase } from '@central/module-seguros'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { interpretarCartera, montarTabla } from '@/lib/linea-base-correduria'
import { correosPorSemana, lineaBaseAsegura } from '@/lib/linea-base-correduria-red'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/linea-base — línea base semanal (§N.2 de ASegura OS). Junta el correo (lo cuenta
 * esta app) con la cartera (puerto de asegura) y devuelve la tabla ya montada. Si una fuente falla,
 * sus filas salen a `null` con su aviso: nunca a 0.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const ahora = new Date()
  const desde = new Date(Date.parse(`${semanasLineaBase(ahora)[0]}T00:00:00Z`) - 86_400_000)
  const [puerto, correos] = await Promise.all([lineaBaseAsegura(), correosPorSemana(desde)])
  return NextResponse.json({ estado: 'ok', tabla: montarTabla(interpretarCartera(puerto.status, puerto.json), correos, ahora) })
}
