import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { modulosDeFicha, escribirModulo } from '@/lib/portal-modulos-cartera'
import { esModuloPortal } from '@/lib/portal-modulos-operador'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Los módulos del portal («Herramientas») de UN cliente, para la ficha de /correduria (plataforma → asegura, Bearer).
 *
 *   GET  ?clienteId=…                         → catálogo con estado y si se puede activar (y por qué no)
 *   POST { clienteId, modulo, accion, actor } → 'activar' | 'retirar'
 *
 * Fase 1: «alquileres» (Patrimonio) solo con póliza EN VIGOR de CIMA; lo decide el SERVIDOR al escribir (409
 * `no_permitido`). Sin identidad del portal vinculada tampoco se activa (no hay sobre qué colgar la fila).
 * Requiere `prisma/sql/2026-10-24_portal_modulos_operador.sql` aplicado; sin él, el POST da 500 `permisos`.
 * La cola de peticiones sigue en `GET /api/operador/portal-modulos`.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const clienteId = new URL(req.url).searchParams.get('clienteId')?.trim()
    if (!clienteId) return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })
    return NextResponse.json({ estado: 'ok', ...(await modulosDeFicha(correduria.id, clienteId)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/portal-modulos', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b || typeof b.clienteId !== 'string' || b.clienteId.trim() === '') {
      return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })
    }
    if (!esModuloPortal(b.modulo)) return NextResponse.json({ estado: 'invalido', motivo: 'módulo no válido' }, { status: 422 })
    if (b.accion !== 'activar' && b.accion !== 'retirar') return NextResponse.json({ estado: 'invalido', motivo: 'acción no válida' }, { status: 422 })
    const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await escribirModulo(correduria.id, b.clienteId.trim(), b.modulo, b.accion, actor)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', cambios: r.cambios })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/portal-modulos', e) }, { status: 500 })
  }
})
