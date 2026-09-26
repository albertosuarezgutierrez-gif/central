import { NextResponse } from 'next/server'

import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { operadorAutorizado } from '@/lib/operador'
import { trasEmision } from '@/lib/tras-emision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/operador/emision/aviso { polizaId, prueba? } — rehace a mano lo que `/emitir` hace solo al
 * acuñar (`trasEmision`): abre la baja de la póliza sustituida y manda al cliente el correo de su
 * nuevo seguro. Existe para las pólizas emitidas ANTES de que eso fuera automático y para reenviarlo.
 * Con `prueba: true` el correo va al buzón de la correduría (`ASEGURA_MAIL_PRUEBA`, si no
 * `ASEGURA_MAIL_REPLY_TO`) y no al cliente: es como Alberto lo ve antes de mandarlo de verdad.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof b?.polizaId === 'string' ? b.polizaId.trim() : ''
  if (!UUID.test(polizaId)) return NextResponse.json({ estado: 'invalido', motivo: 'polizaId no válido' }, { status: 422 })
  const prueba = b?.prueba === true
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const [p] = await prismaAsegura().$queryRaw<{ clienteId: string; origenId: string | null }[]>`
      select cliente_id::text as "clienteId", poliza_origen_id::text as "origenId"
      from polizas where id = ${polizaId}::uuid and correduria_id = ${correduria.id}::uuid and merged_into_poliza_id is null`
    if (!p) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    let destinoPrueba: string | undefined
    if (prueba) {
      destinoPrueba = (process.env.ASEGURA_MAIL_PRUEBA || process.env.ASEGURA_MAIL_REPLY_TO || '').trim()
      if (!destinoPrueba.includes('@')) {
        return NextResponse.json({ estado: 'sin_destino_prueba', motivo: 'falta ASEGURA_MAIL_PRUEBA (o ASEGURA_MAIL_REPLY_TO) en central-asegura' }, { status: 503 })
      }
    }
    const r = await trasEmision(correduria.id, { clienteId: p.clienteId, polizaId, polizaOrigenId: p.origenId }, { prueba: destinoPrueba, traerPdf: true })
    return NextResponse.json({ estado: 'ok', prueba, ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/emision/aviso', e) }, { status: 503 })
  }
})
