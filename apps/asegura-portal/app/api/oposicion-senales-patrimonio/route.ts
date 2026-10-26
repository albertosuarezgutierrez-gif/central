import { NextResponse } from 'next/server'

import {
  TIPOS_QUE_SE_REGISTRAN,
  TIPO_OPOSICION_SENALES,
  VERSION_TEXTO_OPOSICION_SENALES,
  normalizarIp,
  normalizarUserAgent,
} from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { oposicionSenalesVigente } from '@/lib/oposicion-senales'
import { getIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Derecho de OPOSICIÓN (art. 21 RGPD) a la revisión de los seguros de los inmuebles (P15 publicado, 26/10/2026; base:
 * interés legítimo informado). En las dos direcciones: `{ opuesto: true }` = me opongo · `{ opuesto: false }` = retiro la
 * oposición.
 *
 * 🚨 Reglas (cepo `test/regression-portal-patrimonio-senales.test.ts`):
 *  · NO depende de `PATRIMONIO_SENALES_ACTIVAS`: el texto está publicado y el derecho se ejerce antes de que el motor se
 *    encienda (una oposición previa impide calcular desde el primer día).
 *  · Append-only: retirar es una fila NUEVA con `otorgado:false`, jamás un UPDATE ni un DELETE. No escribe si ya está como
 *    se pide. No admite `tipo` desde el cuerpo. Sella `version_texto`, IP y navegador.
 *  · La identidad sale de la cookie; sin sesión o en la vista de corredor (solo lectura: nadie se opone por otro) → 404,
 *    nunca 403.
 *  · ⚠️ Necesita el CHECK ensanchado (`apps/asegura/prisma/sql/2026-10-26_portal_consentimiento_oposicion.sql`) ANTES del
 *    despliegue: sin él el INSERT revienta (500) y no se registra nada.
 */
export async function POST(req: Request) {
  const identidad = await getIdentidad()
  if (!identidad || identidad.corredor) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const opuesto = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { opuesto?: unknown }).opuesto : undefined
  if (typeof opuesto !== 'boolean') return NextResponse.json({ error: 'opuesto_invalido' }, { status: 400 })

  if (!TIPOS_QUE_SE_REGISTRAN.includes(TIPO_OPOSICION_SENALES)) {
    return NextResponse.json({ error: 'tipo_no_registrable' }, { status: 500 })
  }

  const vigente = await oposicionSenalesVigente(identidad.id)
  // Ya está como se pide; y retirar una oposición que nunca existió no deja fila (no hay nada que retirar).
  if (vigente === opuesto || (vigente === null && !opuesto)) return NextResponse.json({ ok: true, opuesto, sinCambio: true })

  await prisma.portalConsentimiento.create({
    data: {
      identidadId: identidad.id,
      tipo: TIPO_OPOSICION_SENALES,
      otorgado: opuesto,
      versionTexto: VERSION_TEXTO_OPOSICION_SENALES,
      ip: normalizarIp(req.headers.get('x-forwarded-for')),
      userAgent: normalizarUserAgent(req.headers.get('user-agent')),
    },
  })

  return NextResponse.json({ ok: true, opuesto })
}
