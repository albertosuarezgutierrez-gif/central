// apps/plataforma/lib/contable/telegram.ts
// Boca Telegram del agente de contabilidad (spec §6). Alberto es único operador → cuenta_id fijo
// (SELECT id FROM cuentas LIMIT 1, igual que los crons). Reutiliza el MISMO cerebro/acciones/
// documentos que la boca web: las confirmaciones Telegram (cont_ok/cont_no) operan sobre la tabla
// contable_accion de la Fase 2, así que no hay tabla ni cola nueva (una sola fuente de verdad).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend, tgSendButtons, escapeHtml } from '@central/core-telegram'
import { responder } from './cerebro'
import { guardarAcciones, ejecutarAccion, descartarAccion } from './acciones'
import { procesarDocumento } from './documentos'
import { resumenDocumento, accionConciliar } from './documentos-tipos'
import { logTurno } from './memoria'
import { aiTranscribe } from '@/lib/ai-client'

// cuenta_id de Alberto (único operador). Mismo criterio que facturas-scan / resumen-semanal.
export async function getCuentaTelegram(): Promise<string | null> {
  const r = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM cuentas LIMIT 1`).catch(() => [])
  return r[0]?.id || null
}

function botonesAccion(id: string, siLabel = '✅ Confirmar'): { texto: string; callback: string }[][] {
  return [[{ texto: siLabel, callback: `cont_ok:${id}` }, { texto: '✖️ Descartar', callback: `cont_no:${id}` }]]
}

// Texto libre de Alberto → cerebro → responde y, si propone acciones, manda botones de confirmación.
export async function manejarTextoLibreTg(cuentaId: string, texto: string): Promise<void> {
  const { respuesta, acciones } = await responder(cuentaId, texto, 'telegram')
  await tgSend(escapeHtml(respuesta || '…')).catch(() => {})
  for (const a of acciones) {
    await tgSendButtons(`⚙️ ${escapeHtml(a.resumen)}`, botonesAccion(a.id)).catch(() => {})
  }
}

// Foto de ticket / PDF de factura → extrae (maquinaria canónica) → propone conciliar con botón.
export async function manejarDocumentoTg(
  cuentaId: string, buffer: Buffer, mimeType: string, fileName: string,
): Promise<void> {
  await logTurno(cuentaId, 'telegram', 'user', `[documento: ${fileName || mimeType}]`)
  let doc
  try {
    doc = await procesarDocumento(cuentaId, buffer, mimeType, fileName)
  } catch {
    await tgSend('No pude leer el documento. Prueba con una foto más nítida o un PDF.').catch(() => {})
    return
  }
  if (!doc.ok) { await tgSend(escapeHtml(doc.motivo)).catch(() => {}); await logTurno(cuentaId, 'telegram', 'assistant', doc.motivo); return }

  // Extracto de tarjeta: ya se importó/categorizó/archivó; el desglose y las dudosas los manda
  // enviarResumenTarjeta. Aquí solo confirmamos con el resumen.
  if (doc.tipo === 'extracto_tarjeta') {
    await tgSend(escapeHtml(doc.resumen)).catch(() => {})
    await logTurno(cuentaId, 'telegram', 'assistant', doc.resumen)
    return
  }

  const resumen = resumenDocumento(doc.factura, doc.match)
  await logTurno(cuentaId, 'telegram', 'assistant', resumen)
  const prop = accionConciliar(doc.factura, doc.match)
  if (prop) {
    const [acc] = await guardarAcciones(cuentaId, [prop])
    if (acc) { await tgSendButtons(escapeHtml(resumen), botonesAccion(acc.id, '✅ Conciliar')).catch(() => {}); return }
  }
  await tgSend(escapeHtml(resumen)).catch(() => {})
}

// Confirmar / descartar una acción propuesta desde Telegram (callback cont_ok / cont_no).
export async function resolverAccionTg(
  cuentaId: string, accion: 'ok' | 'no', accionId: string,
): Promise<string> {
  if (!/^\d+$/.test(accionId)) return 'Acción no válida'
  if (accion === 'no') { await descartarAccion(cuentaId, accionId); return 'Descartada' }
  const r = await ejecutarAccion(cuentaId, accionId)
  return r.mensaje
}

// Descarga un fichero de Telegram por file_id (getFile → download del CDN de Telegram).
export async function descargarTelegram(
  fileId: string, mimeHint = '', nameHint = '',
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !fileId) return null
  try {
    const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(15_000) })
    const d = await meta.json().catch(() => null)
    const filePath: string = d?.result?.file_path || ''
    if (!filePath) return null
    const dl = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { signal: AbortSignal.timeout(45_000) })
    if (!dl.ok) return null
    const buffer = Buffer.from(await dl.arrayBuffer())
    const fileName = nameHint || filePath.split('/').pop() || 'documento'
    const ext = (fileName.split('.').pop() || '').toLowerCase()
    const mimeType = mimeHint
      || (ext === 'pdf' ? 'application/pdf'
        : ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
        : 'image/jpeg') // las fotos de Telegram llegan sin extensión → jpeg por defecto
    return { buffer, mimeType, fileName }
  } catch {
    return null
  }
}

// Nota de voz / audio de un mensaje de Telegram (message.voice = .oga opus, message.audio = fichero).
export function vozDeMensaje(msg: any): { fileId: string; mimeHint: string; nameHint: string } | null {
  const v = msg?.voice || msg?.audio
  if (!v?.file_id) return null
  const mimeHint = v.mime_type || (msg?.voice ? 'audio/ogg' : 'audio/mpeg')
  const nameHint = msg?.voice ? 'nota.ogg' : (v.file_name || 'audio.mp3')
  return { fileId: v.file_id, mimeHint, nameHint }
}

// Transcribe una nota de voz (Groq Whisper) y la trata como si Alberto la hubiera escrito.
export async function manejarVozTg(
  cuentaId: string, buffer: Buffer, fileName: string, mimeType: string,
): Promise<void> {
  let texto = ''
  try { texto = (await aiTranscribe(buffer, fileName, mimeType)).trim() } catch { texto = '' }
  if (!texto) { await tgSend('🎤 No pude entender la nota de voz. ¿Me lo escribes o la repites más despacio?').catch(() => {}); return }
  await tgSend(`🎤 <i>${escapeHtml(texto)}</i>`).catch(() => {}) // eco de lo que entendí, para que Alberto lo vea
  await manejarTextoLibreTg(cuentaId, texto)
}

// Extrae el file_id + pistas de mime/nombre de un mensaje de Telegram (foto o documento). null si no hay.
export function adjuntoDeMensaje(msg: any): { fileId: string; mimeHint: string; nameHint: string } | null {
  if (msg?.document?.file_id) {
    return { fileId: msg.document.file_id, mimeHint: msg.document.mime_type || '', nameHint: msg.document.file_name || '' }
  }
  if (Array.isArray(msg?.photo) && msg.photo.length) {
    const mejor = msg.photo[msg.photo.length - 1] // la última es la de mayor resolución
    return { fileId: mejor.file_id, mimeHint: 'image/jpeg', nameHint: 'foto.jpg' }
  }
  return null
}

const INTRO = `🧮 <b>Soy tu agente de contabilidad.</b> Puedes:
• Preguntarme por tus finanzas ("¿cuánto llevo en luz este año?").
• Darme criterios que recuerde ("de ahora en adelante NETFLIX es de los pisos").
• Mandarme una foto de un ticket o un PDF de factura y te propongo conciliarlo.
• Pedirme que clasifique un cargo — te propongo la acción y tú confirmas con un botón.
Para arrancar, cuéntame tu estructura: qué pisos tienes, quién tributa qué y tus criterios de gasto. Lo iré recordando.`

// Onboarding (spec §8): mensaje guía. La memoria se construye después con lo que Alberto cuente
// (canal APRENDER del cerebro), sin sembrar datos sensibles a mano.
export async function arrancarOnboarding(): Promise<void> {
  await tgSend(INTRO).catch(() => {})
}

// ¿Es un comando de arranque del agente contable? (/contable, "empezar contable"…)
export function esComandoContable(texto: string): boolean {
  return /^\/contable\b/i.test(texto.trim()) || /^(empezar|arrancar)\s+contable$/i.test(texto.trim())
}
