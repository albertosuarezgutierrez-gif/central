// «Ya se lo he mandado a mi compañía por WhatsApp»: el cliente lo DICE y queda anotado en el
// historial de su ficha (por el puerto estrecho de asegura) y en un Telegram a Alberto.
// Nosotros no vemos esa conversación: la nota es su palabra, y lo dice.

import { tgSend } from '@central/core-telegram'
import { notaParteMandadoWhatsapp } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { requireIdentidad } from '@/lib/session'
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type ResultadoMandado =
  | { estado: 'sin_sesion' }
  | { estado: 'no_encontrado' }
  | { estado: 'ok'; anotado: boolean; avisado: boolean }

/** La identidad sale de la SESIÓN (`lib/session`), nunca de quien llama. */
export async function anotarParteMandado(parteId: string, compania: string, conPdf: boolean): Promise<ResultadoMandado> {
  let identidadId: string
  try {
    identidadId = (await requireIdentidad()).id
  } catch {
    return { estado: 'sin_sesion' }
  }
  // La pertenencia del parte, antes de nada: el id viaja en la URL y no lo firma nadie.
  const parte = await prisma.portalParteSiniestro.findFirst({
    where: { id: parteId, identidadId },
    select: { id: true, fechaHecho: true },
  })
  if (!parte) return { estado: 'no_encontrado' }
  const texto = notaParteMandadoWhatsapp(compania.slice(0, 80), parte.fechaHecho.toISOString().slice(0, 10), conPdf)

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
        body: JSON.stringify({ identidadId, texto }),
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
    avisado = (await tgSend(`${texto} (parte ${parte.id.slice(0, 8)})`)) !== null
  } catch (e) {
    console.error('[portal/parte-compania] Telegram no salió:', e instanceof Error ? e.message : e)
  }
  return { estado: 'ok', anotado, avisado }
}
