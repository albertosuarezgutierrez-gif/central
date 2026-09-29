import { NextResponse } from 'next/server'
import { z } from 'zod'

import { pedirCambioCuenta } from '@/lib/mis-datos'
import { requireIdentidad } from '@/lib/session'
import { comprobarCodigoCambioCuenta } from '@/lib/verificar-cuenta'

export const runtime = 'nodejs'

/**
 * POST /api/mis-datos/cuenta — el cliente pide que sus recibos se carguen en otra cuenta.
 *
 * 🚨 Exige el código que le llegó al correo de acceso (`/api/mis-datos/cuenta/codigo`), atado a ESTA
 * identidad y a ESTA cuenta. La identidad sale de la cookie, nunca del cuerpo. Y la respuesta nunca
 * devuelve el IBAN: solo la máscara.
 */
const Entrada = z.object({ iban: z.string().min(10).max(60), codigo: z.string().min(4).max(12) })

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'iban_invalido', motivo: 'Revisa la cuenta y el código.' }, { status: 400 })

  const canje = await comprobarCodigoCambioCuenta(identidad.id, parsed.data.iban, parsed.data.codigo)
  if (canje.estado !== 'valido' || !canje.iban) return NextResponse.json({ estado: 'codigo_no_valido', motivo: canje.estado }, { status: 403 })

  const r = await pedirCambioCuenta(identidad.id, canje.iban)
  // El código se gasta solo si la solicitud ha quedado guardada (o ya era su cuenta).
  if (r.estado === 'ok' || r.estado === 'sin_cambios') await canje.gastar()
  const status =
    r.estado === 'ok' || r.estado === 'sin_cambios' ? 200
      : r.estado === 'iban_invalido' ? 422
        : r.estado === 'sin_puente' ? 503
          : r.estado === 'error' ? 502
            : 409
  return NextResponse.json(r, { status })
}
