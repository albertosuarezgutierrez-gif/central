import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { cruzarCorreoConCima, idsAvisados, marcarAvisosCruce } from '@/lib/correo-cruce-cima-bd'
import { esTablaInexistente } from '@/lib/correo-avisos-intranet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cruce diario correo ↔ CIMA (F1 del agente de correo, 21/10/2026). Lo llama el cron `correduria-cruce-cima` de plataforma.
 *   POST {}                → { estado:'ok', nuevos, revisados, pendientes: [{ id, tipo, texto, clienteId, creado }] }
 *                            Decide y apunta (una vez por hecho) y devuelve lo que aún no ha salido por Telegram.
 *   PATCH { avisados: [ids] } → { estado:'ok', marcados } — SOLO lo que salió. Lo demás se repite en la pasada siguiente.
 * 503 `sin_migracion` (falta 2026-10-21_correo_agente_f1.sql: no se avisa de nada y se dice). Un fallo al leer la
 * cartera es 500, nunca «no hay avisos».
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await cruzarCorreoConCima(correduria.id)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: 503 })
    return NextResponse.json({ estado: 'ok', nuevos: r.nuevos, revisados: r.revisados, pendientes: r.pendientes })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/cruce-cima', e) }, { status: 500 })
  }
})

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const ids = idsAvisados(await req.json().catch(() => null))
    if (!ids) return NextResponse.json({ estado: 'invalido', motivo: 'avisados debe ser una lista de hasta 50 ids' }, { status: 422 })
    const marcados = await marcarAvisosCruce(correduria.id, ids)
    return NextResponse.json({ estado: 'ok', marcados })
  } catch (e) {
    if (esTablaInexistente(e)) return NextResponse.json({ estado: 'sin_migracion', motivo: 'falta aplicar 2026-10-21_correo_agente_f1.sql' }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/cruce-cima', e) }, { status: 500 })
  }
})
