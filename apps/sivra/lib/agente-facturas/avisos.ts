// Avisos del agente: Telegram (con enlace a la bandeja) + email de respaldo.
import { tgAlert } from '@/lib/telegram'
import { notifyOwner } from '@/lib/pricing-notify'
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
  const lineas = items.slice(0, 8).map((i) => `• ${i.proveedor || 'desconocido'} · ${i.total.toFixed(2)}€${i.motivo ? ` (${i.motivo})` : ''}`)
  const msg = `🧾 <b>${items.length}</b> factura(s) en la bandeja de revisión\n${lineas.join('\n')}\n\n👉 <a href="${url}">Revisar</a>`
  await tgAlert(msg, 'aviso')
  await notifyOwner({
    subject: `SIVRA · ${items.length} factura(s) por revisar`,
    html: `<p>${items.length} factura(s) en la bandeja:</p><ul>${items.map((i) => `<li>${i.proveedor || 'desconocido'} — ${i.total.toFixed(2)}€${i.motivo ? ` (${i.motivo})` : ''}</li>`).join('')}</ul><p><a href="${url}">Revisar bandeja</a></p>`,
  })
}

// Aviso: correo que parece un gasto pero no trae factura adjunta.
export async function avisaSinAdjunto(correos: { from: string; subject: string }[]): Promise<void> {
  if (correos.length === 0) return
  const lineas = correos.slice(0, 8).map((c) => `• ${c.subject} — ${c.from}`)
  await tgAlert(`📭 ${correos.length} correo(s) parecen gasto pero SIN factura adjunta (reclámala):\n${lineas.join('\n')}`, 'aviso')
}

// Aviso: facturas recurrentes que no han llegado este mes.
export async function avisaRecurrentesQueFaltan(faltan: ReglaFaltante[]): Promise<void> {
  if (faltan.length === 0) return
  const lineas = faltan.slice(0, 8).map((f) => `• ${f.proveedor || f.fingerprint}${f.importe_esperado ? ` (~${f.importe_esperado.toFixed(2)}€)` : ''}`)
  await tgAlert(`⏳ ${faltan.length} gasto(s) recurrente(s) aún sin llegar este mes:\n${lineas.join('\n')}`, 'aviso')
}

export interface ResumenStats {
  fuente: string
  auto: number
  bandeja: number
  duplicados: number
  errores: number
  alquileres?: number
}

export async function resumen(s: ResumenStats): Promise<void> {
  const extra = s.alquileres != null ? ` · alquileres ${s.alquileres}` : ''
  await tgAlert(
    `✅ Agente (${s.fuente}): ${s.auto} imputadas · ${s.bandeja} a bandeja · ${s.duplicados} duplicadas · ${s.errores} errores${extra}`,
    'resuelto',
  )
}
