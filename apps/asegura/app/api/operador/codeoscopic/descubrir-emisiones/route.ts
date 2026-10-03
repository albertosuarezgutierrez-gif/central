import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { pasadaDescubrimiento } from '@/lib/descubrir-emisiones'
import { DIAS_MAX, DIAS_POR_DEFECTO } from '@/lib/codeoscopic/descubrir-emisiones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Descubrimiento AUTOMÁTICO de emisiones hechas en Avant2 (03/10/2026). Lo dispara el cron de
 * plataforma `/api/cron/correduria-descubrir-emisiones` (~cada 30 min). Solo LEE el vendor
 * (`GET /insurances`, gratis); registra en la cartera solo por `sincronizarEmisionExterna` y solo
 * con un tomador demostrado por documento contra UNA ficha. El resto, a la cola de revisión.
 *
 * `POST { dias?: number }` (por defecto 14, como mucho 364). Respuesta 200 con `estado`:
 * `ok` · `credenciales_rechazadas` (401/403 del vendor: la pasada se corta) · `error_vendor`
 * (la lista no se pudo leer). `vendor_sin_configurar` → 503. Nunca «0 emisiones» si no se miró.
 */

/** Margen bajo `maxDuration` para contestar con el resumen antes de que Vercel corte. */
const PRESUPUESTO_MS = 240_000

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  let dias = DIAS_POR_DEFECTO
  const cuerpo = (await req.json().catch(() => null)) as { dias?: unknown } | null
  if (cuerpo && cuerpo.dias !== undefined) {
    if (typeof cuerpo.dias !== 'number' || !Number.isInteger(cuerpo.dias) || cuerpo.dias < 1 || cuerpo.dias > DIAS_MAX) {
      return NextResponse.json({ estado: 'error', mensaje: `dias tiene que ser un entero entre 1 y ${DIAS_MAX}` }, { status: 400 })
    }
    dias = cuerpo.dias
  }
  try {
    const correduria = await correduriaUnica().catch(() => null)
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await pasadaDescubrimiento(correduria.id, { dias, presupuestoMs: PRESUPUESTO_MS })
    if (r.estado === 'vendor_sin_configurar') {
      return NextResponse.json({ estado: 'vendor_sin_configurar', mensaje: 'Codeoscopic no está configurado' }, { status: 503 })
    }
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: registrarErrorCartera('operador/codeoscopic/descubrir-emisiones', e) }, { status: 500 })
  }
})
