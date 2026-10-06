import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { acuerdosCartera } from '@/lib/acuerdos'

export const dynamic = 'force-dynamic'

/**
 * GET /api/operador/companias/acuerdos — acuerdos con compañías (comisión por
 * ramo/producto, objetivos, requisitos, letra pequeña) y claves de mediador de
 * la correduría (06/10/2026, fase 1, solo lectura). Lo pinta plataforma en el
 * bloque de compañías. Spec:
 * docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
 *
 * Mismos tres estados que el resto del puerto: `sin_configurar` (NO es «no hay
 * acuerdos») · `error` con su `causa` · `ok`. Si la migración
 * `2026-10-06_seguros_acuerdos_companias.sql` aún no se ha aplicado, esto
 * responde `error` con causa `esquema`, nunca una lista vacía.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) {
      console.error('[cartera] operador/companias/acuerdos → sin_correduria · la BD responde y `corredurias` está vacía')
      return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    }
    return NextResponse.json(await acuerdosCartera(correduria.id))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/companias/acuerdos', e) })
  }
}
