import { NextResponse } from 'next/server'

import {
  TEXTO_CONSENTIMIENTO_COMERCIAL,
  TIPOS_QUE_SE_REGISTRAN,
  VERSION_TEXTO_COMERCIAL,
  consentimientoVigente,
  normalizarIp,
  normalizarUserAgent,
} from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * La casilla «quiero que me propongáis alternativas» (`comercial`), en las dos
 * direcciones: marcar y retirar.
 *
 * 🚨 Lo que esta ruta NO hace, y por qué:
 *
 * - No actualiza ninguna fila. `portal_consentimiento` es append-only: marcar
 *   añade una fila `otorgado: true`, retirar añade otra `otorgado: false`. La
 *   historia entera queda reconstruible (quién marcó qué, cuándo, con qué
 *   texto), que es lo único que vale como prueba (art. 7.1 RGPD).
 * - No escribe si el estado ya es el pedido: marcar dos veces no deja dos
 *   filas. `consentimientoVigente()` mira la ÚLTIMA fila del tipo.
 * - No admite `tipo` desde el cuerpo: esta ruta escribe `comercial` y nada
 *   más. `avisos` sigue sin casilla, y una ruta que aceptara el tipo como
 *   parámetro sería la forma más fácil de fabricar una fila que nadie marcó.
 * - Sella `version_texto` con `VERSION_TEXTO_COMERCIAL`: la fila dice sobre
 *   QUÉ texto exacto se marcó. Si el texto cambia de fondo, la versión sube y
 *   la casilla se vuelve a enseñar desmarcada.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  // La vista de corredor es de SOLO LECTURA: Alberto mirando la bóveda de un
  // cliente no puede consentir por él. Misma guarda que el resto de escrituras.
  if (identidad.corredor) return NextResponse.json({ error: 'solo_lectura' }, { status: 403 })

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const otorgado = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { otorgado?: unknown }).otorgado : undefined
  if (typeof otorgado !== 'boolean') return NextResponse.json({ error: 'otorgado_invalido' }, { status: 400 })

  // Guardián en tiempo de ejecución de la regla del módulo: si alguien quita
  // `comercial` de la lista, esta ruta deja de escribir en vez de escribir
  // algo que el módulo dice que no tiene casilla.
  if (!TIPOS_QUE_SE_REGISTRAN.includes('comercial')) {
    return NextResponse.json({ error: 'tipo_no_registrable' }, { status: 500 })
  }

  const previas = await prisma.portalConsentimiento.findMany({
    where: { identidadId: identidad.id, tipo: 'comercial' },
    select: { tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
  })
  // `null` también cuando la última fila es de OTRA versión del texto: así una
  // marca sobre el texto viejo se vuelve a escribir sobre el nuevo.
  const vigente = consentimientoVigente(previas, 'comercial', VERSION_TEXTO_COMERCIAL)

  // Ya está como se pide sobre el texto vigente: no se añade nada.
  if (vigente === otorgado) {
    return NextResponse.json({ ok: true, otorgado, sinCambio: true })
  }

  await prisma.portalConsentimiento.create({
    data: {
      identidadId: identidad.id,
      tipo: 'comercial',
      otorgado,
      versionTexto: VERSION_TEXTO_COMERCIAL,
      ip: normalizarIp(req.headers.get('x-forwarded-for')),
      userAgent: normalizarUserAgent(req.headers.get('user-agent')),
    },
  })

  return NextResponse.json({ ok: true, otorgado, texto: TEXTO_CONSENTIMIENTO_COMERCIAL })
}
