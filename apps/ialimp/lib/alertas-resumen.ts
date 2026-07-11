// Texto del aviso semanal a la empresa (Vanessa) sobre alertas de limpiezas SIN resolver.
// Puro y testeable (sin `@/` ni Prisma): lo consume el cron /api/cron/alertas-pendientes.

export type AlertaPendiente = {
  titulo: string
  descripcion?: string | null
  tipo?: string | null
  creada_at: string | Date
}

const APP_URL = 'https://app.ialimp.es'
const MAX_LISTA = 12

// Días transcurridos desde la creación (para el "hace N días" del listado).
export function diasDesde(fecha: string | Date, ahora: Date = new Date()): number {
  const t = fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime()
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86_400_000))
}

// Construye asunto + cuerpo de texto plano. `n` es el total real (puede superar el listado).
export function resumenAlertasPendientes(
  empresaNombre: string,
  alertas: AlertaPendiente[],
  ahora: Date = new Date(),
): { asunto: string; texto: string } {
  const n = alertas.length
  const plural = n === 1 ? 'alerta' : 'alertas'
  const asunto = `🔔 Tienes ${n} ${plural} de limpiezas sin revisar`

  const lineas = alertas.slice(0, MAX_LISTA).map(a => {
    const d = diasDesde(a.creada_at, ahora)
    const cuando = d === 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`
    const desc = a.descripcion ? ` — ${a.descripcion}` : ''
    return `• ${a.titulo}${desc} (${cuando})`
  })
  if (n > MAX_LISTA) lineas.push(`…y ${n - MAX_LISTA} más.`)

  const texto = [
    `Hola ${empresaNombre},`,
    '',
    `Tienes ${n} ${plural} de limpiezas pendientes de revisar en tu panel:`,
    '',
    ...lineas,
    '',
    `Entra para gestionarlas: ${APP_URL}`,
    '',
    'Cuando las marques como leídas dejarán de aparecer aquí.',
  ].join('\n')

  return { asunto, texto }
}
