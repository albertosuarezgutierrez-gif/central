import { NextResponse } from 'next/server'
import { openrouterChat } from '@central/core-ai'

import { prisma } from '@/lib/db'
import { DECLARADA_NO_ELIMINADA } from '@/lib/declaradas-eliminadas'
import { getIp, rateLimit } from '@/lib/rate-limit'
import {
  decidirRevision,
  entradaDesdeFila,
  hayClaveIA,
  huellaRevision,
  normalizarPuntos,
  promptRevision,
  SISTEMA_REVISION,
  tieneMaterial,
} from '@/lib/revision-poliza'
import { guardarRevisionDeSesion, leerRevisionDeSesion, revisionesDeHoyDeSesion } from '@/lib/revision-poliza-bd'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/polizas/[id]/revision — «Revisar mi póliza» (13/10/2026). Solo con el botón (no automático:
 * cuesta). Respuesta: `{ estado: 'ok', puntos, cacheada }` | `sin_ia` | `sin_datos` | `tope` | `error`.
 *
 * 🚨 Identidad de la COOKIE; la póliza se busca con `identidadId` DENTRO del `where` (solo las PROPIAS y no
 * eliminadas; la de un titular que dio acceso es 404, no 403). Lo cacheado (misma póliza + misma huella de
 * lo leído) se sirve sin llamar a la IA. Tope por identidad contado en BD (`MAX_REVISIONES_DIA`); el de IP
 * en memoria solo frena ruido. Los fallos de la IA NO se cachean ni gastan tope.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const tope = rateLimit(`revision-poliza:${getIp(req)}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ estado: 'demasiadas' }, { status: 429 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })

  const p = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
    select: { id: true, ramo: true, compania: true, primaAnual: true, periodicidadPago: true, fechaVencimiento: true, coberturas: true, datosRamo: true },
  })
  if (!p) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })

  const entrada = entradaDesdeFila(p)
  const huella = huellaRevision(entrada)
  const cache = await leerRevisionDeSesion(p.id, huella)
  // Caché ilegible (tabla ausente, BD caída): sin ella no hay tope ni «no recalcular» → NO se llama a la IA.
  if (cache === null) return NextResponse.json({ estado: 'error' }, { status: 503 })
  const hayIa = hayClaveIA(process.env)

  const usadasHoy = cache === undefined && hayIa && tieneMaterial(entrada) ? await revisionesDeHoyDeSesion() : 0
  const decision = decidirRevision({
    hayIa,
    tieneMaterial: tieneMaterial(entrada),
    hayCache: Array.isArray(cache),
    usadasHoy,
  })

  if (decision.accion === 'cacheada' && Array.isArray(cache)) return NextResponse.json({ estado: 'ok', puntos: cache, cacheada: true })
  if (decision.accion === 'sin_ia') return NextResponse.json({ estado: 'sin_ia' })
  if (decision.accion === 'sin_datos') return NextResponse.json({ estado: 'sin_datos' })
  if (decision.accion === 'tope') return NextResponse.json({ estado: 'tope' }, { status: 429 })

  let salida: string
  try {
    // 🔒 Solo OpenRouter (el proveedor que declara la privacidad), sin la cadena de suplentes de `aiComplete`.
    salida = await openrouterChat(
      {
        apiKey: (process.env.OPENROUTER_API_KEY ?? '').trim(),
        textModel: process.env.OPENROUTER_MODEL || undefined,
        baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
      },
      [{ role: 'user', content: promptRevision(entrada) }],
      { system: SISTEMA_REVISION, maxTokens: 700, temperature: 0.2 },
    )
  } catch (e) {
    console.error('[portal/revision] la IA falló:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 502 })
  }
  const puntos = normalizarPuntos(salida)
  if (puntos === null) {
    console.warn('[portal/revision] respuesta de la IA ilegible')
    return NextResponse.json({ estado: 'error' }, { status: 502 })
  }
  try {
    await guardarRevisionDeSesion(p.id, huella, puntos)
  } catch (e) {
    // Sin caché no hay tope: se enseña igual, pero queda dicho en el log (probablemente falta el SQL).
    console.error('[portal/revision] no se pudo guardar la revisión:', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ estado: 'ok', puntos, cacheada: false })
}
