// «Ya se lo he mandado a mi compañía por WhatsApp»: el cliente lo DICE y queda anotado en el
// historial de su ficha (por el puerto estrecho de asegura) y en un Telegram a Alberto.
// Nosotros no vemos esa conversación: la nota es su palabra, y lo dice.
//
// 🚨 Del cliente solo se acepta `conPdf`. La compañía sale del PARTE (su póliza, de la cartera
// de ESTA identidad o declarada por ella): un texto libre del cuerpo acabaría en el Telegram de
// Alberto —que va en HTML— y en su ficha como si fuera una nota del sistema.

import { tgSend } from '@central/core-telegram'
import { escaparHtml, notaParteMandadoWhatsapp } from '@central/module-seguros-portal'

import { carteraDeIdentidad } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type ResultadoMandado =
  | { estado: 'sin_sesion' }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_compania' }
  | { estado: 'limite' }
  | { estado: 'ok'; anotado: boolean; avisado: boolean }

/** La compañía de la póliza del parte, leída con la identidad de la sesión. `null` = no se sabe. */
async function companiaDelParte(identidadId: string, polizaId: string | null, declaradaId: string | null): Promise<string | null> {
  if (declaradaId) {
    const d = await prisma.portalPolizaDeclarada.findFirst({ where: { id: declaradaId, identidadId }, select: { compania: true } })
    return d?.compania?.trim() || null
  }
  if (polizaId) {
    const c = await carteraDeIdentidad(identidadId)
    const p = [...c.propias, ...c.autorizadas].flatMap((t) => t.polizas).find((x) => x.id === polizaId)
    return p?.compania?.trim() || null
  }
  return null
}

/** La identidad sale de la SESIÓN (`lib/session`), nunca de quien llama. */
export async function anotarParteMandado(parteId: string, conPdf: boolean): Promise<ResultadoMandado> {
  let identidad: { id: string; nombre: string | null }
  try {
    identidad = await requireIdentidad()
  } catch {
    return { estado: 'sin_sesion' }
  }
  // La pertenencia del parte, antes de nada: el id viaja en la URL y no lo firma nadie.
  const parte = await prisma.portalParteSiniestro.findFirst({
    where: { id: parteId, identidadId: identidad.id },
    select: { id: true, fechaHecho: true, polizaId: true, polizaDeclaradaId: true },
  })
  if (!parte) return { estado: 'no_encontrado' }
  const compania = await companiaDelParte(identidad.id, parte.polizaId, parte.polizaDeclaradaId)
  if (!compania) return { estado: 'sin_compania' }
  // Dos por parte y hora: un doble toque se tolera; un bucle no llena de notas la ficha.
  if (!rateLimit(`parte-wa:${identidad.id}:${parte.id}`, 2, 60 * 60 * 1000).allowed) return { estado: 'limite' }

  const texto = notaParteMandadoWhatsapp(compania, parte.fechaHecho.toISOString().slice(0, 10), conPdf)

  let anotado = false
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (base && secret) {
    const control = new AbortController()
    const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
    try {
      const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/nota`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ identidadId: identidad.id, texto }),
        cache: 'no-store',
        signal: control.signal,
      })
      anotado = res.ok
      if (!res.ok) console.warn(`[portal/parte-compania] no queda en la ficha: HTTP ${res.status}`)
    } catch (e) {
      console.error('[portal/parte-compania] el puente no respondió:', e instanceof Error ? e.message : e)
    } finally {
      clearTimeout(reloj)
    }
  }

  let avisado = false
  try {
    // Quién es va en el aviso: si la ficha no se pudo anotar, es lo único que lo identifica.
    const quien = identidad.nombre?.trim() ? escaparHtml(identidad.nombre.trim()) : 'Un cliente'
    avisado = (await tgSend(`${quien}: ${escaparHtml(texto)} (parte ${parte.id.slice(0, 8)})`)) !== null
  } catch (e) {
    console.error('[portal/parte-compania] Telegram no salió:', e instanceof Error ? e.message : e)
  }
  return { estado: 'ok', anotado, avisado }
}
