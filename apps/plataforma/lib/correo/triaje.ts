// lib/correo/triaje.ts — Orquestador del triaje de correo.
//
// pasadaTriaje(): cursor → lee lo nuevo por IMAP → dedupe en BD → clasifica → actúa (etiqueta /
// archiva / avisa / enruta huéspedes) → auto-aprende → actualiza cursor. Respeta TRIAJE_DRY_RUN
// (modo sombra: clasifica y anota pero NO toca Gmail ni avisa). digestTriaje() y resumenSemanal()
// mandan los resúmenes por Telegram. Todo best-effort: un fallo por correo no aborta la pasada.
import { prisma } from '@/lib/db'
import { tgSend, escapeHtml } from '@central/core-telegram'
import { abrirTriaje } from './imap'
import { clasificar, quizaAutoAprender } from './clasificador'
import { enrutarHuesped } from './huespedes'
import { rutaDe, ETIQUETAS_INTOCABLES } from './rutas'

// Modo sombra por DEFECTO en el arranque: clasifica y anota en BD pero NO etiqueta/archiva/avisa.
// Es la red de seguridad de la mejora 1 — mientras Alberto valida los primeros digests, el agente
// no toca su bandeja. Para pasar a VIVO, poner `TRIAJE_DRY_RUN=false` en Vercel plataforma.
const DRY_RUN = () => process.env.TRIAJE_DRY_RUN !== 'false'

function yaEtiquetado(labels: string[]): boolean {
  return labels.some(l =>
    ETIQUETAS_INTOCABLES.includes(l) || l.startsWith('Triaje/') || l.startsWith('Facturas'),
  )
}

function fmtFecha(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Construye el aviso inmediato de Telegram (remitente + resumen + acción/fecha + por qué importa).
function mensajeAviso(o: {
  categoria: string; remitente: string; asunto: string; resumen: string
  accion: string | null; fechaLimite: Date | null; cautela: boolean
}): string {
  const cabecera = o.cautela ? '⚠️ <b>Posible suplantación / phishing</b>' : `📬 <b>${escapeHtml(etiquetaBonita(o.categoria))}</b>`
  const lineas = [
    cabecera,
    `<b>${escapeHtml(o.remitente)}</b>`,
    escapeHtml(o.asunto),
    o.resumen && o.resumen !== o.asunto ? `🤖 ${escapeHtml(o.resumen)}` : '',
  ]
  if (o.accion) lineas.push(`➡️ ${escapeHtml(o.accion)}`)
  if (o.fechaLimite) lineas.push(`🗓️ Fecha límite: <b>${fmtFecha(o.fechaLimite)}</b>`)
  if (o.cautela) lineas.push('🔒 No he tocado nada. Verifica antes de pulsar ningún enlace.')
  return lineas.filter(Boolean).join('\n')
}

function etiquetaBonita(categoria: string): string {
  const m: Record<string, string> = {
    'personal-importante': 'Personal importante',
    'huespedes': 'Huésped',
    'leads-negocio': 'Oportunidad de negocio',
    'seguridad-sospechosa': 'Seguridad',
  }
  return m[categoria] ?? categoria
}

export async function pasadaTriaje(): Promise<Record<string, number>> {
  const stats = { nuevos: 0, saltados: 0, duplicados: 0, etiquetados: 0, archivados: 0, avisados: 0, errores: 0, sombra: 0 }
  const cur = await prisma.$queryRaw<{ last_uid: number; uidvalidity: bigint | null }[]>`
    SELECT last_uid, uidvalidity FROM correo_cursor WHERE buzon = 'INBOX' LIMIT 1
  `
  const lastUid = cur[0]?.last_uid ?? 0
  const uidValidityPrevio = cur[0]?.uidvalidity != null ? Number(cur[0].uidvalidity) : null

  const sesion = await abrirTriaje()
  let maxUid = lastUid
  try {
    // Tope BAJO por pasada: cada correo hace 1 llamada a la IA en serie; con la función limitada a
    // 300s, ~30 correos la agotaban (504) y el cursor no avanzaba → re-escaneo infinito. Con 10 la
    // pasada termina holgada (10×≤20s), el cursor avanza y las siguientes drenan el resto (cada 10 min).
    const nuevos = await sesion.listarNuevos(lastUid, uidValidityPrevio, 10)
    stats.nuevos = nuevos.length

    for (const correo of nuevos) {
      maxUid = Math.max(maxUid, correo.uid)
      let filaId: bigint | null = null
      try {
        // Skip: ya lo cazó un filtro Gmail existente o una pasada anterior de triaje.
        if (yaEtiquetado(correo.labels)) { stats.saltados++; continue }

        // Dedupe ANTES de actuar: si la fila ya existe (otra pasada), no re-actuamos.
        const ins = await prisma.$queryRaw<{ id: bigint }[]>`
          INSERT INTO correo_triaje (gmail_message_id, uid, remitente, asunto, fecha, categoria, via)
          VALUES (${correo.messageId}, ${correo.uid}, ${correo.from}, ${correo.subject.slice(0, 500)},
                  ${correo.fecha}, 'pendiente', 'skip')
          ON CONFLICT (gmail_message_id) DO NOTHING
          RETURNING id
        `
        if (!ins.length) { stats.duplicados++; continue }
        filaId = ins[0].id

        const c = await clasificar(correo)
        const ruta = rutaDe(c.categoria)
        let accion = 'ninguna'

        if (DRY_RUN()) {
          accion = 'sombra'
          stats.sombra++
        } else {
          // Etiquetar / archivar.
          if (ruta.etiqueta) { await sesion.etiquetar(correo.uid, ruta.etiqueta); stats.etiquetados++; accion = 'etiquetada' }
          if (ruta.archivar) { await sesion.archivar(correo.uid); stats.archivados++; accion = 'etiquetada_archivada' }

          // Huéspedes → agente de SIVRA (best-effort; si no resuelve, sigue el aviso normal).
          if (ruta.enrutarSivra) await enrutarHuesped(correo).catch(() => ({ enrutado: false }))

          // Aviso inmediato.
          if (ruta.aviso === 'inmediato') {
            await tgSend(mensajeAviso({
              categoria: c.categoria, remitente: correo.fromRaw, asunto: correo.subject,
              resumen: c.resumen, accion: c.accionSugerida, fechaLimite: c.fechaLimite, cautela: !!ruta.cautela,
            }))
            stats.avisados++
          }

          // Auto-aprendizaje de reglas.
          if (c.via === 'ia') await quizaAutoAprender(correo.from, c.categoria, c.confianza).catch(() => {})
        }

        await prisma.$executeRaw`
          UPDATE correo_triaje SET
            categoria = ${c.categoria}, confianza = ${c.confianza}, via = ${c.via}, accion = ${accion},
            resumen = ${c.resumen}, accion_sugerida = ${c.accionSugerida}, fecha_limite = ${c.fechaLimite},
            notificado = ${accion !== 'sombra' && ruta.aviso === 'inmediato'}
          WHERE id = ${filaId}
        `
      } catch (e) {
        stats.errores++
        console.error('[triaje] error con correo', correo.uid, e)
        // No dejar la fila colgada en 'pendiente' (el dedupe la saltaría para siempre): márcala 'error'.
        if (filaId != null) {
          await prisma.$executeRaw`UPDATE correo_triaje SET categoria='error', accion='error' WHERE id=${filaId}`.catch(() => {})
        }
      }
    }
  } finally {
    // Avanza el cursor SIEMPRE (aunque el bucle fallara), y cierra la sesión.
    await prisma.$executeRaw`
      INSERT INTO correo_cursor (buzon, last_uid, uidvalidity, updated_at)
      VALUES ('INBOX', ${maxUid}, ${BigInt(sesion.uidValidity)}, now())
      ON CONFLICT (buzon) DO UPDATE SET last_uid = EXCLUDED.last_uid, uidvalidity = EXCLUDED.uidvalidity, updated_at = now()
    `.catch(() => {})
    await sesion.cerrar()
  }
  return stats
}

// Digest diario: recuento por categoría de las últimas 24 h + lista corta de lo relevante no avisado.
export async function digestTriaje(): Promise<{ total: number }> {
  const filas = await prisma.$queryRaw<{ categoria: string; remitente: string; asunto: string; accion_sugerida: string | null }[]>`
    SELECT categoria, remitente, asunto, accion_sugerida
    FROM correo_triaje
    WHERE digest_at IS NULL AND created_at > now() - interval '24 hours' AND categoria <> 'pendiente'
    ORDER BY created_at DESC
  `
  if (!filas.length) return { total: 0 }

  const conteo: Record<string, number> = {}
  for (const f of filas) conteo[f.categoria] = (conteo[f.categoria] ?? 0) + 1

  const resumenCategorias = Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `• ${escapeHtml(etiquetaBonita(cat))}: ${n}`)
    .join('\n')

  const aRevisar = filas
    .filter(f => ['contabilidad', 'correduria', 'dudoso'].includes(f.categoria))
    .slice(0, 12)
    .map(f => `– ${escapeHtml(f.remitente)}: ${escapeHtml(f.asunto.slice(0, 70))}`)
    .join('\n')

  const modo = DRY_RUN() ? '\n<i>(modo sombra: no he tocado nada, solo he clasificado)</i>' : ''
  const msg = [
    `📮 <b>Triaje de correo — resumen del día</b> (${filas.length} correos)`,
    resumenCategorias,
    aRevisar ? `\n<b>Para tu ojo:</b>\n${aRevisar}` : '',
    modo,
  ].filter(Boolean).join('\n')
  await tgSend(msg)

  await prisma.$executeRaw`
    UPDATE correo_triaje SET digest_at = now()
    WHERE digest_at IS NULL AND created_at > now() - interval '24 hours' AND categoria <> 'pendiente'
  `
  return { total: filas.length }
}

// Resumen semanal de valor (mejora 6): señal de "esto te está ahorrando trabajo" + detector de deriva.
export async function resumenSemanal(): Promise<{ total: number }> {
  const rows = await prisma.$queryRaw<{ triados: bigint; ruido: bigint; avisos: bigint; dudosos: bigint }[]>`
    SELECT count(*) FILTER (WHERE categoria <> 'pendiente')                    AS triados,
           count(*) FILTER (WHERE categoria = 'ruido')                         AS ruido,
           count(*) FILTER (WHERE notificado)                                  AS avisos,
           count(*) FILTER (WHERE categoria = 'dudoso')                        AS dudosos
    FROM correo_triaje
    WHERE created_at > now() - interval '7 days'
  `
  const r = rows[0]
  const triados = Number(r?.triados ?? 0)
  const msg = [
    '🗂️ <b>Triaje de correo — resumen semanal</b>',
    `Esta semana clasifiqué <b>${triados}</b> correos.`,
    `• Ruido archivado: ${Number(r?.ruido ?? 0)}`,
    `• Avisos que te mandé: ${Number(r?.avisos ?? 0)}`,
    `• Dudosos (los dejé en bandeja): ${Number(r?.dudosos ?? 0)}`,
  ].join('\n')
  await tgSend(msg)
  return { total: triados }
}
