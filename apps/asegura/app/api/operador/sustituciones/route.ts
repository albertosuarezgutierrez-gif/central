import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { confirmarAnulacionCompania, dobleSeguroEnSeguimiento, sustitucionesEnSeguimiento } from '@/lib/cartera-sustituciones'
import { auditado } from '@/lib/auditoria'
import { validarAnulacionConfirmada } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

// GET /api/operador/sustituciones — pólizas sustituidas por retarificación
// (cambio de compañía) que llevan ≥3 días esperando a que CIMA confirme la
// nueva. Read-only, gratis. Mismos cuatro estados que el resto del puerto.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ estado: 'error' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const lista = await sustitucionesEnSeguimiento(correduria.id)
    if (lista === null) return NextResponse.json({ estado: 'error' })
    // `null` = no se pudo leer el doble seguro: se manda `null` (≠ `[]` = ninguno), la lista principal sigue.
    const dobleSeguro = await dobleSeguroEnSeguimiento(correduria.id)
    return NextResponse.json({ estado: 'ok', sustituciones: lista, dobleSeguro })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/sustituciones', e) })
  }
}

const STATUS_SELLO: Record<string, number> = { ok: 200, no_encontrada: 404, no_sustituida: 409, ya_confirmada: 409, sin_migracion: 503 }

// POST /api/operador/sustituciones — «Anulación confirmada por la compañía» sobre la póliza VIEJA (17/10/2026).
//   { accion:'anulacion_confirmada', polizaViejaId, motivo (obligatorio), fechaEfectoBaja? (AAAA-MM-DD), actor }
//   → 200 ok · 404 · 409 no_sustituida|ya_confirmada · 422 invalida · 503 sin_migracion|sin_configurar
// Vive aquí y no en /anulaciones: aquello es el EXPEDIENTE que tramita la correduría (firma del tomador →
// comunicada → confirmada); esto es dejar constancia de que la compañía ya la confirmó por su cauce, para cerrar
// el seguimiento de esta sustitución. No toca `polizas.estado` (lo manda CIMA). Deja fila en `historial_interno`.
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (b?.accion !== 'anulacion_confirmada') return NextResponse.json({ estado: 'invalida', motivo: 'accion no válida' }, { status: 422 })
    const v = validarAnulacionConfirmada(b)
    if (!v.ok) return NextResponse.json({ estado: 'invalida', motivo: v.motivo }, { status: 422 })
    const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await confirmarAnulacionCompania(correduria.id, v.entrada, actor)
    return NextResponse.json(r, { status: STATUS_SELLO[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/sustituciones', e) }, { status: 500 })
  }
})
