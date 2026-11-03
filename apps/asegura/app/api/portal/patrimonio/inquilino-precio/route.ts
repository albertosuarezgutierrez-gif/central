import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { pedirPrecioInquilino } from '@/lib/patrimonio-inquilino-precio-portal'
import { validarSolicitudInquilino } from '@/lib/patrimonio-inquilino-precio-reglas'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Puente «El inquilino pide precio» (27/10/2026, punto 5 del estudio de patrimonio).
 *
 * POST `{ identidadId, que: 'contenido'|'rc'|'ambos', nombre, canal: 'correo'|'telefono', contacto }` — da de alta una
 * ficha NUEVA de lead (`fuente='portal'`) con ese nombre y ese contacto (cifrado aquí, que es donde está la clave), abre
 * la oportunidad `info_riesgo.origen='portal:inquilino'` con su tarea de hoy y avisa a Alberto con ids. Idempotente por
 * identidad (120 días). 🚨 NO acepta nada del propietario (ni `clienteId`, ni inmueble, ni contrato): se ignora. Esta
 * ruta no envía nada al inquilino ni a terceros. La respuesta no lleva ningún dato personal.
 */
export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const v = validarSolicitudInquilino(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', campo: v.campo }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await pedirPrecioInquilino(correduria.id, v.datos)
    if (r.estado === 'invalido') return NextResponse.json(r, { status: 422 })
    return NextResponse.json(r, { status: 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/patrimonio-inquilino-precio', e) }, { status: 503 })
  }
})
