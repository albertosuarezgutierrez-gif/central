// Avisos del agente: Telegram (con enlace a la bandeja) + email de respaldo.
import { tgAlert } from '@/lib/telegram'
import { eur } from '@/lib/dinero'
import type { ReglaFaltante } from './anomalias'

function baseUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://sivra.vercel.app'
}

export interface PendienteAviso {
  proveedor: string | null
  total: number
  motivo?: string | null
}

// Aviso cuando hay facturas nuevas en la bandeja de revisión.
export async function avisaBandeja(items: PendienteAviso[]): Promise<void> {
  if (items.length === 0) return
  const url = `${baseUrl()}/expenses/pendientes`
  const lineas = items.slice(0, 8).map((i) => `• ${i.proveedor || 'desconocido'} · ${eur(i.total)}${i.motivo ? ` (${i.motivo})` : ''}`)
  const msg = `🧾 <b>${items.length}</b> factura(s) en la bandeja de revisión\n${lineas.join('\n')}\n\n👉 <a href="${url}">Revisar</a>`
  await tgAlert(msg, 'aviso')
}

// Aviso: correo que parece un gasto pero no trae factura adjunta.
export async function avisaSinAdjunto(correos: { from: string; subject: string }[]): Promise<void> {
  if (correos.length === 0) return
  const lineas = correos.slice(0, 8).map((c) => `• ${c.subject} — ${c.from}`)
  await tgAlert(`📭 ${correos.length} correo(s) parecen gasto pero SIN factura adjunta (reclámala):\n${lineas.join('\n')}`, 'aviso')
}

// Aviso: la factura se imputó pero su PDF NO llegó a Drive (falló la subida tras reintentos).
// Importa sobre todo en Booking: la liquidación debía quedar en Drive para que el contable la
// confirme; sin PDF archivado, el gasto existe pero el documento se ha perdido de vista.
export async function avisaSinDrive(items: { nombre: string; from?: string; esBooking?: boolean }[]): Promise<void> {
  if (items.length === 0) return
  const lineas = items.slice(0, 8).map((i) => `• ${i.esBooking ? '🏨 ' : ''}${i.nombre}${i.from ? ` — ${i.from}` : ''}`)
  await tgAlert(
    `⚠️ ${items.length} factura(s) imputadas pero SIN copia en Drive (falló la subida):\n${lineas.join('\n')}\n\nEl gasto está registrado; sube el PDF a mano o re-lanza el scan.`,
    'aviso',
  )
}

// Aviso: llegó un adjunto que parece factura pero NO se pudo leer (PDF escaneado/imagen, o la
// IA no extrajo nada tras Groq+NIM). Antes se perdía como un 'error' mudo; ahora se reclama.
export async function avisaNoLegibles(items: { nombre: string; from?: string }[]): Promise<void> {
  if (items.length === 0) return
  const lineas = items.slice(0, 8).map((i) => `• ${i.nombre}${i.from ? ` — ${i.from}` : ''}`)
  await tgAlert(
    `🔍 ${items.length} adjunto(s) parecen factura pero NO pude leer el importe (¿PDF escaneado?):\n${lineas.join('\n')}\n\nSúbela a mano o reenvíala en mejor calidad.`,
    'aviso',
  )
}

// Aviso: facturas a nombre de un TERCERO (llegan por reenvíos de hilos ajenos). No se imputan
// ni van a la bandeja, pero se cantan: si el agente se equivoca leyendo el destinatario, Alberto
// tiene que poder verlo aquí en vez de descubrir el gasto perdido meses después.
export async function avisaAjenas(items: { proveedor: string | null; total: number; receptor?: string | null }[]): Promise<void> {
  if (items.length === 0) return
  const lineas = items.slice(0, 8).map((i) => `• ${i.proveedor || 'desconocido'} · ${eur(i.total)} → ${i.receptor || 'otro titular'}`)
  await tgAlert(
    `🙅 ${items.length} factura(s) de terceros ignoradas (no están a tu nombre):\n${lineas.join('\n')}\n\nSi alguna SÍ es tuya, dímelo y la recupero.`,
    'aviso',
  )
}

// Aviso: facturas recurrentes que no han llegado este mes.
export async function avisaRecurrentesQueFaltan(faltan: ReglaFaltante[]): Promise<void> {
  if (faltan.length === 0) return
  const lineas = faltan.slice(0, 8).map((f) => `• ${f.proveedor || f.fingerprint}${f.importe_esperado ? ` (~${eur(f.importe_esperado)})` : ''}`)
  await tgAlert(`⏳ ${faltan.length} gasto(s) recurrente(s) aún sin llegar este mes:\n${lineas.join('\n')}`, 'aviso')
}

export interface ResumenStats {
  fuente: string
  auto: number
  bandeja: number
  duplicados: number
  omitidos?: number
  ajenas?: number
  errores: number
  alquileres?: number
}

export async function resumen(s: ResumenStats): Promise<void> {
  const omit = s.omitidos ? ` · ${s.omitidos} presupuestos omitidos` : ''
  const ajen = s.ajenas ? ` · ${s.ajenas} de terceros` : ''
  const extra = s.alquileres != null ? ` · alquileres ${s.alquileres}` : ''
  await tgAlert(
    `✅ Agente (${s.fuente}): ${s.auto} imputadas · ${s.bandeja} a bandeja · ${s.duplicados} duplicadas${omit}${ajen} · ${s.errores} errores${extra}`,
    'resuelto',
  )
}
