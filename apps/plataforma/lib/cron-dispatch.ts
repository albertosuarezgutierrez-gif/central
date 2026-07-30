// Programación ÚNICA de los crons de plataforma. Vercel Pro admite como mucho 40 crons por
// proyecto y este llegó a declarar 60 en vercel.json: el scheduler empezó a omitir disparos
// en silencio (29/07/2026: `psd2-sync` de las 06:00 sin ningún log, con sus 3 vecinos del
// mismo minuto corriendo — auditoría, PR #1162). Desde entonces vercel.json declara UN solo
// cron (`/api/cron/dispatch`, cada minuto) y ESTE manifiesto es la fuente de verdad de qué
// corre y cuándo. Para añadir/cambiar un cron: tocar SOLO este array, nunca vercel.json.
// Horarios en UTC, igual que los crons de Vercel.

export interface CronJob {
  path: string
  schedule: string
}

export const CRON_JOBS: CronJob[] = [
  { path: '/api/cron/trading-universo', schedule: '20 */6 * * *' },
  { path: '/api/cron/trading-ranking', schedule: '0 9 * * 1' },
  { path: '/api/cron/trading-premarket', schedule: '0 13 * * 1-5' },
  { path: '/api/cron/trading-watchdog', schedule: '30 6 * * 2-6' },
  { path: '/api/cron/trading-cohetes-rebalanceo', schedule: '30 9 * * 1' },
  { path: '/api/cron/trading-cohetes-track', schedule: '0 7 * * 2-6' },
  { path: '/api/cron/agentes-latido', schedule: '45 7 * * *' },
  { path: '/api/cron/paper-tracker', schedule: '0 10 * * 1' },
  { path: '/api/cron/resumen-mensual', schedule: '0 8 1 * *' },
  { path: '/api/cron/facturas-conciliar-gmail', schedule: '30 6 * * *' },
  { path: '/api/cron/contable-proactivo', schedule: '0 9 * * 1' },
  { path: '/api/cron/concursos-ingesta', schedule: '30 */6 * * *' },
  { path: '/api/cron/concursos-radar', schedule: '0 */6 * * *' },
  { path: '/api/cron/concursos-avisos', schedule: '30 7 * * *' },
  { path: '/api/cron/concursos-cierre', schedule: '0 9 * * *' },
  { path: '/api/cron/subastas-ingesta', schedule: '0 6 * * *' },
  { path: '/api/cron/subastas-enriquecer', schedule: '15 6 * * *' },
  { path: '/api/cron/subastas-mercado', schedule: '20 6 * * *' },
  { path: '/api/cron/subastas-radar', schedule: '30 6 * * *' },
  { path: '/api/cron/subastas-avisos', schedule: '0 8 * * *' },
  { path: '/api/cron/subastas-cierre', schedule: '0 9 * * *' },
  { path: '/api/cron/borme-ingesta', schedule: '0 6 * * *' },
  { path: '/api/cron/briefing', schedule: '0 8 * * 1' },
  { path: '/api/cron/banca-alertas', schedule: '0 7 * * *' },
  { path: '/api/cron/psd2-sync', schedule: '0 6 * * *' },
  { path: '/api/sivra/expenses/fijos/generar', schedule: '0 6 1 * *' },
  { path: '/api/sivra/mercado/cron', schedule: '15 7 * * *' },
  { path: '/api/sivra/mercado/sweep', schedule: '0 3 * * 0' },
  { path: '/api/sivra/pricing/guard', schedule: '30 7 * * *' },
  { path: '/api/sivra/pricing/experiments/check-results', schedule: '0 8 * * *' },
  { path: '/api/sivra/pricing/experiments/digest', schedule: '0 9 * * 1' },
  { path: '/api/sivra/pricing/apply-auto', schedule: '30 8,14,20 * * *' },
  { path: '/api/sivra/pricing/resumen-diario', schedule: '0 9 * * *' },
  { path: '/api/sivra/pricing/pilot-track', schedule: '15 9 * * *' },
  { path: '/api/sivra/updates/sync', schedule: '0 5 * * *' },
  { path: '/api/sivra/limpiadoras/auto-sessions', schedule: '0 5 * * *' },
  { path: '/api/sivra/limpiadoras/auto-assign', schedule: '30 5 * * *' },
  { path: '/api/sivra/limpiadoras/alerta-ventana', schedule: '0 8 * * *' },
  { path: '/api/sivra/rates/snapshot', schedule: '0 7 * * *' },
  { path: '/api/sivra/mensajes/auto-reply', schedule: '*/3 * * * *' },
  { path: '/api/sivra/mensajes/resumen-diario', schedule: '0 19 * * *' },
  { path: '/api/sivra/resumen-semanal', schedule: '0 9 * * 1' },
  { path: '/api/sivra/expenses/agent/scan', schedule: '0 6 * * *' },
  { path: '/api/sivra/expenses/agent/resumen-mensual', schedule: '0 9 1 * *' },
  { path: '/api/sivra/eventos/sync', schedule: '0 4 * * 1' },
  { path: '/api/sivra/eventos/websearch', schedule: '0 5 * * 1' },
  { path: '/api/cron/cima-liq', schedule: '30 7 * * *' },
  { path: '/api/cron/facturas-scan', schedule: '15 6 * * *' },
  { path: '/api/cron/facturas-resumen-semanal', schedule: '15 9 * * 1' },
  { path: '/api/cron/categorizar-movimientos', schedule: '0 7 * * *' },
  { path: '/api/cron/resumen-semanal', schedule: '30 9 * * 1' },
  { path: '/api/cron/health-check', schedule: '0 7 * * *' },
  { path: '/api/cron/pre-renta', schedule: '0 9 1 3 *' },
  { path: '/api/sivra/domotica/programador', schedule: '25,55 8-15 * * *' },
  { path: '/api/sivra/domotica/acceso/programador', schedule: '40 4,12,20 * * *' },
  { path: '/api/cron/correo-triaje', schedule: '*/10 * * * *' },
  { path: '/api/cron/correo-digest', schedule: '30 20 * * *' },
  { path: '/api/cron/correo-resumen-semanal', schedule: '0 9 * * 1' },
  { path: '/api/cron/patrones-fiscal-refresh', schedule: '30 5 * * *' },
  { path: '/api/cron/ia-director-refresh', schedule: '0 5 * * 1' },
]

// Un campo cron → conjunto de valores permitidos; null = '*' (sin restricción). Soporta
// listas, rangos y pasos combinados ('25,55', '8-15', '*/3', '30 8,14,20', '1-5').
function parseCampo(campo: string, min: number, max: number): Set<number> | null {
  if (campo === '*') return null
  const out = new Set<number>()
  for (const parte of campo.split(',')) {
    const [rango, pasoStr] = parte.split('/')
    const paso = pasoStr === undefined ? 1 : parseInt(pasoStr, 10)
    if (!Number.isFinite(paso) || paso < 1) throw new Error(`Cron inválido: paso "${parte}"`)
    let desde: number
    let hasta: number
    if (rango === '*') {
      desde = min
      hasta = max
    } else if (rango.includes('-')) {
      const [a, b] = rango.split('-').map(n => parseInt(n, 10))
      desde = a
      hasta = b
    } else {
      desde = parseInt(rango, 10)
      // 'n/paso' (sin rango) significa "desde n hasta el máximo, de paso en paso"
      hasta = pasoStr === undefined ? desde : max
    }
    if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde < min || hasta > max || desde > hasta) {
      throw new Error(`Cron inválido: rango "${parte}" fuera de [${min},${max}]`)
    }
    for (let v = desde; v <= hasta; v += paso) out.add(v)
  }
  return out
}

// ¿La expresión (5 campos: minuto hora día-mes mes día-semana, en UTC) casa este minuto?
export function cronMatches(schedule: string, fecha: Date): boolean {
  const campos = schedule.trim().split(/\s+/)
  if (campos.length !== 5) throw new Error(`Cron inválido: "${schedule}" (se esperan 5 campos)`)
  const [sMin, sHora, sDom, sMes, sDow] = campos
  const setMin = parseCampo(sMin, 0, 59)
  const setHora = parseCampo(sHora, 0, 23)
  const setDom = parseCampo(sDom, 1, 31)
  const setMes = parseCampo(sMes, 1, 12)
  const setDow = parseCampo(sDow, 0, 7) // 7 = domingo, como 0

  if (setMin && !setMin.has(fecha.getUTCMinutes())) return false
  if (setHora && !setHora.has(fecha.getUTCHours())) return false
  if (setMes && !setMes.has(fecha.getUTCMonth() + 1)) return false

  const dow = fecha.getUTCDay()
  const domOk = !setDom || setDom.has(fecha.getUTCDate())
  const dowOk = !setDow || setDow.has(dow) || (dow === 0 && setDow.has(7))
  // Regla cron clásica: con día-mes Y día-semana AMBOS restringidos basta que case uno.
  if (setDom && setDow) return domOk || dowOk
  return domOk && dowOk
}

export function truncarAMinuto(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000)
}

// Minutos pendientes de procesar: (anterior, ahora], con tope de capMinutos hacia atrás para
// no re-disparar media mañana tras una pausa larga. Sin cursor (anterior=null) → solo el actual.
// El catch-up es lo que convierte un minuto omitido por el scheduler de Vercel (el incidente
// de psd2-sync) en un retraso de 1 minuto en vez de en un día perdido.
export function ventanaMinutos(anterior: Date | null, ahora: Date, capMinutos = 15): Date[] {
  const fin = truncarAMinuto(ahora).getTime()
  let desde = anterior === null ? fin : truncarAMinuto(anterior).getTime() + 60_000
  const tope = fin - (capMinutos - 1) * 60_000
  if (desde < tope) desde = tope
  const out: Date[] = []
  for (let t = desde; t <= fin; t += 60_000) out.push(new Date(t))
  return out
}

// Jobs que tocan en alguno de los minutos de la ventana (cada job como mucho una vez,
// aunque la ventana cubra varios de sus disparos — p. ej. */3 tras un catch-up).
export function jobsDue(minutos: Date[], jobs: CronJob[] = CRON_JOBS): CronJob[] {
  return jobs.filter(j => minutos.some(m => cronMatches(j.schedule, m)))
}
