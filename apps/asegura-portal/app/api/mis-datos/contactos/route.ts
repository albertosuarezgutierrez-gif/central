import { NextResponse } from 'next/server'
import { z } from 'zod'

import { anadirContactoPropio, listarContactosPropios } from '@/lib/contactos-propios'
import { requireIdentidad } from '@/lib/session'
import { comprobarCodigoCambioCorreo } from '@/lib/verificar-correo'

export const runtime = 'nodejs'

/**
 * GET /api/mis-datos/contactos — TODOS los teléfonos/emails de la ficha de la
 * identidad de la SESIÓN (nunca de un parámetro: misma regla que `/api/mis-datos`).
 *
 * POST /api/mis-datos/contactos — añade uno NUEVO. `{ tipo, valor, etiqueta? }`.
 */
const Entrada = z.object({
  tipo: z.enum(['telefono', 'email']),
  valor: z.string().min(1).max(255),
  etiqueta: z.string().max(40).nullable().optional(),
  /** Obligatorio para un correo: el código que le llegó a ESE correo (25/09/2026). */
  codigoCorreo: z.string().max(12).optional(),
})

export async function GET() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }
  const r = await listarContactosPropios(identidad.id)
  const status = r.estado === 'ok' ? 200 : r.estado === 'sin_puente' ? 503 : r.estado === 'error' ? 502 : 409
  return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'invalido', motivo: 'datos_invalidos', campo: null }, { status: 400 })

  // 🚨 Un correo de CONTACTO también vincula (plan B de `elegirFicha`): mismo candado que el principal.
  const { codigoCorreo, ...entrada } = parsed.data
  let gastarCodigo = async () => {}
  if (entrada.tipo === 'email') {
    if (!codigoCorreo) return NextResponse.json({ estado: 'codigo_requerido' }, { status: 403 })
    const canje = await comprobarCodigoCambioCorreo(identidad.id, entrada.valor, codigoCorreo)
    if (canje.estado !== 'valido') return NextResponse.json({ estado: 'codigo_no_valido', motivo: canje.estado }, { status: 403 })
    gastarCodigo = canje.gastar
  }

  const r = await anadirContactoPropio(identidad.id, entrada)
  if (r.estado === 'ok') await gastarCodigo()
  const status =
    r.estado === 'ok' ? 201
      : r.estado === 'invalido' ? 422
        : r.estado === 'sin_puente' ? 503
          : r.estado === 'error' ? 502
            : r.estado === 'no_encontrado' ? 404
              : 409 // conflicto · sin_ficha · varias_fichas
  return NextResponse.json(r, { status })
}
