import { NextResponse } from 'next/server'

import { esModuloPortal } from '@central/module-seguros-portal'

import { solicitarModuloDeSesion } from '@/lib/modulos'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/modulos  { modulo }  — «Solicitar» / «Apuntarme» en `/herramientas` (Fase 0, 22/10/2026).
 *
 * 🚨 La identidad sale de la COOKIE (`lib/modulos.ts` → `lib/session`), nunca del cuerpo. El cuerpo
 * solo trae el id del módulo, que se valida contra el catálogo cerrado; la ruta vuelve a calcular si
 * ese módulo admite petición (un módulo ya disponible o ya pedido no escribe fila).
 *
 * La FILA es el registro: si Telegram falla, la petición sigue hecha (200 con `aviso`).
 * En modo corredor `middleware.ts` ya veta el POST (403 `modo_corredor`).
 */
export async function POST(req: Request) {
  try {
    await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('catalogo', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const cuerpo = (await req.json().catch(() => null)) as { modulo?: unknown } | null
  const modulo = cuerpo?.modulo
  if (!esModuloPortal(modulo)) return NextResponse.json({ estado: 'modulo_invalido' }, { status: 400 })

  try {
    const r = await solicitarModuloDeSesion(modulo)
    const status =
      r.estado === 'registrada' ? 200
      : r.estado === 'sin_sesion' ? 401
      : r.estado === 'ya_solicitado' ? 409
      : r.estado === 'sin_comprobar' ? 503
      : 400
    return NextResponse.json(r, { status })
  } catch (e) {
    console.error('[portal/modulos] no se pudo guardar la solicitud:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 500 })
  }
}
