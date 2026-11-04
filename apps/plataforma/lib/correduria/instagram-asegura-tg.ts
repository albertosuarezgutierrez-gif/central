// Botones `asig_*` del Instagram de Grupo ASegura (aprobar / descartar / regenerar).
// Los enruta `app/api/sivra/mensajes/telegram-webhook/route.ts` (un solo `if`, aislado) y aquí
// se resuelven. El webhook ya ha comprobado que pulsa la persona autorizada (TELEGRAM_CHAT_ID).
//
// 🚨 Toda transición es ATÓMICA (`transicionIg`): dos pulsaciones = una sola publicación.
// 🚨 «Aprobar» publica por Graph API SOLO con ASEGURA_INSTAGRAM_ACCESS_TOKEN + ASEGURA_INSTAGRAM_USER_ID
// (`decidirPublicacion`); sin ellas entrega imagen + caption para subirlo a mano (`aprobado_manual`).
import { revisarCopy, explicarInfracciones } from '@central/module-seguros'
import { publicarImagen } from '@central/core-instagram'
import { escapeHtml } from '@/lib/telegram'
import { cuentaDelLibro } from './cuenta-libro'
import { decidirPublicacion, callbackAsig, type CallbackAsig } from './instagram-asegura'
import { leerIg, transicionIg } from './instagram-asegura-db'
import { generarBorradorIg } from './instagram-asegura-generar'

import type { Boton } from '@central/core-telegram'

export type RespuestaAsig = {
  linea: string
  botones?: Boton[][]
  /** Mensaje APARTE (no cabe en la edición: el límite de Telegram es 4.096 caracteres). */
  aparte?: string
}

const NO_PENDIENTE = '⚠️ <i>Este borrador ya no está pendiente (decidido antes o caducado). No he hecho nada.</i>'

export async function resolverBotonAsig(c: Extract<CallbackAsig, { ok: true }>): Promise<RespuestaAsig> {
  const cuenta = await cuentaDelLibro()
  if (!cuenta.ok) return { linea: `🛑 ${escapeHtml(cuenta.motivo)}` }
  const cuentaId = cuenta.cuentaId

  if (c.accion === 'descartar') {
    const f = await transicionIg(cuentaId, c.id, 'pendiente', 'descartado', { motivo: 'descartado por Alberto' })
    return { linea: f ? '🗑️ <i>Descartado. No se publica.</i>' : NO_PENDIENTE }
  }

  if (c.accion === 'regenerar') {
    const f = await transicionIg(cuentaId, c.id, 'pendiente', 'descartado', { motivo: 'sustituido por otro (🔄)' })
    if (!f) return { linea: NO_PENDIENTE }
    const r = await generarBorradorIg({ temaForzado: f.tema })
    if (r.estado === 'pendiente') return { linea: `🔄 <i>Descartado. Te he mandado otro del mismo tema${r.telegram ? '' : ' (⚠️ pero Telegram no lo entregó: míralo en /correduria → Redes)'}.</i>` }
    if (r.estado === 'rechazado_copy') return { linea: '🔄 <i>Descartado. El nuevo no pasó el cepo de copy dos veces: te he mandado el motivo.</i>' }
    return { linea: `🔄 <i>Descartado, pero no pude generar otro: ${escapeHtml(r.motivo)}</i>` }
  }

  // ── aprobar ──
  const fila = await leerIg(cuentaId, c.id)
  if (!fila || fila.estado !== 'pendiente') return { linea: NO_PENDIENTE }
  if (!fila.image_url) return { linea: '🛑 <i>El borrador no tiene imagen. No se aprueba: pulsa 🔄 para otro.</i>' }

  // Segunda pasada del cepo justo antes de que salga: el texto guardado es el que se publica.
  const infr = revisarCopy([fila.titulo, fila.sub, ...(fila.puntos ?? []), fila.caption].join('\n'))
  if (infr.length) {
    await transicionIg(cuentaId, c.id, 'pendiente', 'rechazado_copy', { motivo: explicarInfracciones(infr) })
    return { linea: `🛑 <b>No se aprueba</b>: el cepo de copy lo para ahora → ${escapeHtml(explicarInfracciones(infr))}` }
  }

  const decision = decidirPublicacion(process.env)
  if (decision.modo === 'manual') {
    const f = await transicionIg(cuentaId, c.id, 'pendiente', 'aprobado_manual', { motivo: null })
    if (!f) return { linea: NO_PENDIENTE }
    return {
      linea:
        `✅ <b>Aprobado para publicar A MANO</b> (no hay perfil de Instagram conectado: faltan ${decision.faltan.map((v) => `<code>${v}</code>`).join(' y ')}). Te mando imagen y texto en el mensaje siguiente.`,
      aparte:
        `📸 <b>Para publicar a mano en Instagram</b>\n\n🖼️ Imagen (1080×1080): ${escapeHtml(fila.image_url)}\n\n📝 Texto:\n<pre>${escapeHtml(fila.caption)}</pre>`,
    }
  }

  const tomado = await transicionIg(cuentaId, c.id, 'pendiente', 'publicando')
  if (!tomado) return { linea: NO_PENDIENTE }
  let igId: string
  try {
    igId = await publicarImagen(decision.credenciales, fila.image_url, fila.caption)
  } catch (e) {
    const motivo = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    // Vuelve a pendiente para poder reintentarlo con el botón (no se reintenta solo: un
    // `media_publish` repetido a ciegas puede dejar el post dos veces).
    await transicionIg(cuentaId, c.id, 'publicando', 'pendiente', { motivo })
    return {
      linea: `🛑 <b>No se publicó</b>: ${escapeHtml(motivo)}\nSigue pendiente: mira el perfil antes de volver a pulsar ✅.`,
      botones: [[{ texto: '✅ Reintentar', callback: callbackAsig('aprobar', c.id) }, { texto: '🗑️ Descartar', callback: callbackAsig('descartar', c.id) }]],
    }
  }
  // Ya está publicado en Instagram: si falla anotarlo en BD NO se ofrece reintento (sería un segundo post).
  try {
    await transicionIg(cuentaId, c.id, 'publicando', 'publicado', { igPostId: igId, motivo: null })
  } catch (e) {
    console.error('[ig asegura] publicado pero no anotado:', e instanceof Error ? e.message : e)
    return { linea: `✅ <b>Publicado en Instagram</b> <code>${escapeHtml(igId)}</code>, pero no se pudo anotar en BD (queda «publicando»). NO lo vuelvas a publicar.` }
  }
  return { linea: `✅ <b>Publicado en Instagram.</b> <code>${escapeHtml(igId)}</code>` }
}
