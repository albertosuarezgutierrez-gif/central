import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { resolverPolizasDeCorreo } from '@/lib/cartera-correo-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/operador/correo/resolver — el triaje de correo de `apps/plataforma`
 * pregunta «¿este texto de un correo de aseguradora habla de alguna póliza VIVA
 * de mi cartera?» (20/09/2026).
 *
 * Body: `{ texto: string }` (asunto + extracto del correo, ya concatenados por
 * quien llama). Respuesta: `{ estado:'ok', resueltos: {clienteId, polizaId,
 * numeroPoliza}[] }` — `[]` es la respuesta NORMAL: la mayoría de correos de
 * aseguradora son comunicados genéricos, no hablan de una póliza concreta.
 * Puede traer MÁS DE UNO (una liquidación de comisiones nombra varios clientes).
 *
 * 🚨 Read-only y de coste fijo (unas pocas decenas de pólizas vivas): no
 * escribe nada. Quien resuelve decide si anota algo, por
 * `POST /api/operador/cliente/historial` (una llamada por cliente resuelto).
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const texto = typeof body?.texto === 'string' ? body.texto : ''
    const resueltos = await resolverPolizasDeCorreo(correduria.id, texto)
    return NextResponse.json({ estado: 'ok', resueltos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/resolver', e) })
  }
}
