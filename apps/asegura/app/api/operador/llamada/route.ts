import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { quienLlama } from '@/lib/llamada'
import { CuerpoLlamada } from '@/lib/llamada-cuerpo'

export const dynamic = 'force-dynamic'

/**
 * POST /api/operador/llamada `{ "tel": "600112233" }` — ¿quién llama? Búsqueda EXACTA por índice
 * ciego del teléfono (todas sus variantes de prefijo). Solo lectura: nombre y si es cliente en
 * vigor o lead. Ni DNI, ni dirección, ni pólizas.
 *
 * 🔐 POST y no GET: un `?tel=` quedaría en los logs de Vercel. El teléfono no se registra en
 * ningún log (la auditoría de `auditado()` solo guarda ids con forma de UUID).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = CuerpoLlamada.safeParse(await req.json().catch(() => null))
  if (!cuerpo.success) return NextResponse.json({ estado: 'invalido', error: 'Cuerpo inválido: { tel: string (1-40) }' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await quienLlama(correduria.id, cuerpo.data.tel)
    const status = r.estado === 'invalido' ? 400 : r.estado === 'sin_clave_lookup' ? 503 : 200
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/llamada', e) }, { status: 500 })
  }
})
