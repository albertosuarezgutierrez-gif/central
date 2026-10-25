import { NextResponse } from 'next/server'

import {
  TEXTO_CONSENTIMIENTO_COMERCIAL_PATRIMONIO,
  TIPO_COMERCIAL_PATRIMONIO,
  VERSION_TEXTO_COMERCIAL_PATRIMONIO,
  normalizarIp,
  normalizarUserAgent,
  tiposQueSeRegistran,
} from '@central/module-seguros-portal'

import { consentimientoPatrimonioVigente } from '@/lib/consentimiento-patrimonio'
import { prisma } from '@/lib/db'
import { senalesActivas } from '@/lib/patrimonio-senales-activas'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * La casilla `comercial_patrimonio` (P15, BORRADOR, 26/10/2026), en las dos direcciones: dar y retirar.
 *
 * 🚨 Con `PATRIMONIO_SENALES_ACTIVAS` apagado esta ruta NO EXISTE (404 antes de mirar la sesión, el cuerpo o la BD):
 * no se puede fabricar una fila de un consentimiento que ninguna pantalla enseña.
 * Mismas reglas que `/api/consentimiento`: append-only (retirar = fila nueva `otorgado:false`), no escribe si ya está
 * como se pide sobre el texto vigente, sella `version_texto`, no admite `tipo` desde el cuerpo, y la vista de corredor
 * (solo lectura) no puede consentir por nadie.
 * ⚠️ El CHECK de `portal_consentimiento.tipo` hay que ensancharlo ANTES de encender el interruptor (ver el SQL de
 * `apps/asegura/prisma/sql/2026-10-26_portal_patrimonio_senal.sql`): sin eso el INSERT revienta y esta ruta devuelve 500.
 */
export async function POST(req: Request) {
  if (!senalesActivas()) return NextResponse.json({ error: 'no_disponible' }, { status: 404 })

  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ error: 'solo_lectura' }, { status: 403 })

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const otorgado = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { otorgado?: unknown }).otorgado : undefined
  if (typeof otorgado !== 'boolean') return NextResponse.json({ error: 'otorgado_invalido' }, { status: 400 })

  if (!tiposQueSeRegistran(true).includes(TIPO_COMERCIAL_PATRIMONIO)) {
    return NextResponse.json({ error: 'tipo_no_registrable' }, { status: 500 })
  }

  const vigente = await consentimientoPatrimonioVigente(identidad.id)
  if (vigente === otorgado) return NextResponse.json({ ok: true, otorgado, sinCambio: true })

  await prisma.portalConsentimiento.create({
    data: {
      identidadId: identidad.id,
      tipo: TIPO_COMERCIAL_PATRIMONIO,
      otorgado,
      versionTexto: VERSION_TEXTO_COMERCIAL_PATRIMONIO,
      ip: normalizarIp(req.headers.get('x-forwarded-for')),
      userAgent: normalizarUserAgent(req.headers.get('user-agent')),
    },
  })

  return NextResponse.json({ ok: true, otorgado, texto: TEXTO_CONSENTIMIENTO_COMERCIAL_PATRIMONIO })
}
