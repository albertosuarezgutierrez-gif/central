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
  // 🚨 El retrovisor (trading_backtest) se quedó SIN cron: la ruta existía pero no estaba en este
  // manifiesto, así que la tabla llevaba congelada desde el 19/07/2026 mientras la pantalla seguía
  // pintando sus cifras como si fueran de hoy. Es la medición punto-en-el-tiempo de la que dependen
  // las hipótesis del pre-registro (H4 en su día, H8 ahora), y sin ella nunca se resolverían.
  // La reconstrucción a 180 meses (`MESES_RETROVISOR`) CERRÓ el 09/08/2026 a las 02:02 UTC: 1.009 de
  // 1.018 filas con los 178 snapshots en ~12,5 h con la cadencia temporal de 30 min. Las 9 restantes
  // (AGGI, AZBLY, BSP, CONE, HONA, INIO, QNT, SKHY, TRMOY) quedan con `datos` a NULL porque la fuente
  // no da precios para ellas — es un «no hay», no un «falta por hacer», y el ciclo las reintenta igual.
  // Devuelto a 2 h: en régimen estacionario solo hay que refrescar rancidez y sobra de largo.
  { path: '/api/cron/trading-backtest', schedule: '10 */2 * * *' },
  // 🔬 H10 — evalúa SEMANALMENTE las reglas de salida contra el criterio firmado en el pre-registro
  // (lunes 08:40 UTC, con el corpus del retrovisor ya movido por las pasadas del fin de semana).
  // No cablea nada: avisa cuando una variante cumple, o cuando todas fallan y H10 queda cerrada.
  { path: '/api/cron/trading-h10', schedule: '40 8 * * 1' },
  // 07:15, treinta minutos ANTES de `agentes-latido`: así el vigía de las 07:45 lee siempre una
  // huella del mismo día en vez de la de ayer. Solo lectura (operación C de SES): no envía ningún
  // parte. La fecha que lo hace urgente es el 03/09/2026, cuando caduca la hoja del certificado
  // de `*.ses.mir.es` y hay que saber si la cadena sigue cerrando.
  { path: '/api/cron/ses-latido', schedule: '15 7 * * *' },
  // Renovaciones de la correduría: 06:30, antes del vigía de las 07:45 para que
  // el parte del día lea siempre una huella fresca. Lee la cartera por el puerto
  // de central-asegura; si no puede leerla, lo dice — no se calla.
  { path: '/api/cron/correduria-renovaciones', schedule: '30 6 * * *' },
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
  // DOS pasadas en la misma expresión (11:30 y 20:30 de Madrid): el manifiesto
  // exige un path ÚNICO —lo fija `cron-dispatch.test.ts`— así que la segunda
  // hora va en el propio campo, no en una fila nueva. La de la tarde es la que
  // cuenta el desenlace EL MISMO DÍA del cierre (las subastas del Portal cierran
  // entre las 18:00 y las 19:30, con prórroga de hasta 24 h si entra una puja al
  // final); la de la mañana recoge las prorrogadas y los certificados tardíos.
  { path: '/api/cron/subastas-cierre', schedule: '30 9,18 * * *' },
  { path: '/api/cron/borme-ingesta', schedule: '0 6 * * *' },
  { path: '/api/cron/briefing', schedule: '0 8 * * 1' },
  { path: '/api/cron/banca-alertas', schedule: '0 7 * * *' },
  { path: '/api/cron/psd2-sync', schedule: '0 6 * * *' },
  { path: '/api/sivra/expenses/fijos/generar', schedule: '0 6 1 * *' },
  // 🪦 La vía Serper (mercado/cron 07:15 + mercado/sweep 03:00) se RETIRÓ el 24/08/2026: la cuenta
  // agotó créditos el 22/08 y para entonces la rutina de Booking ya acumulaba 1.100-1.300 comps
  // FIABLES por piso en 95-99 fechas — la condición que la fase 2 del landmine `market_rates.fuente`
  // exigía para retirarla. Sus precios eran de ANUNCIO sin fecha (no fiables). Las rutas siguen
  // vivas para llamadas manuales si algún día vuelve a haber SERPER_API_KEY con créditos.
  { path: '/api/sivra/pricing/guard', schedule: '30 7 * * *' },
  // Calibrado del CANAL contra el escaparate medido (19/08/2026): mide la recta
  // `escaparate = markup × base + cuota_fija` y la APLICA sola, acotada por pasada. Va DESPUÉS del
  // snapshot (07:00) y de la guardia: necesita la base del día para poder cruzarla con el portal, y
  // ANTES de `apply-auto` (08:30) para que el motor tarife el mismo día con lo recalibrado.
  { path: '/api/sivra/pricing/canal', schedule: '45 7 * * *' },
  { path: '/api/sivra/pricing/experiments/check-results', schedule: '0 8 * * *' },
  { path: '/api/sivra/pricing/apply-auto', schedule: '30 8,14,20 * * *' },
  { path: '/api/sivra/pricing/resumen-diario', schedule: '0 9 * * *' },
  { path: '/api/sivra/pricing/pilot-track', schedule: '15 9 * * *' },
  // days=7: el sync es idempotente y la ventana ancha hace que un apagón de varios días del
  // scheduler (o del webhook Smoobu) se auto-repare en la siguiente corrida — con el default
  // de 2 días, las reservas modificadas durante el apagón de julio-2026 se habrían perdido.
  { path: '/api/sivra/updates/sync?days=7', schedule: '0 5 * * *' },
  // Pasada por VENTANA DE LLEGADA (hoy..+45d, sin filtro real de modificación): refresca todas las
  // reservas próximas aunque lleven meses sin tocarse — rellena el aforo (adults/children) de las
  // antiguas (29/08/2026: 8 de 9 reservas del mes a NULL, la intranet de limpieza no podía enseñar
  // nº de huéspedes) y detecta cancelaciones a semanas vista para la sección «Últimos avisos».
  // `desde=2026-06-01` retro-rellena también el aforo de los meses YA facturados (el reparto de
  // lavandería del P&L pasó a huéspedes reales el 29/08/2026 y junio-agosto estaban a NULL).
  // Cuando el histórico esté relleno se puede quitar el `desde` y dejar solo la ventana.
  { path: '/api/sivra/updates/sync?days=800&desde=2026-06-01&ventana=45', schedule: '15 5 * * *' },
  // Vigía Booking↔Smoobu: contrasta contra Smoobu las reservas de Booking vistas por correo
  // (avisos «⚠️ no registrada» + mensajes de huésped con nº que Smoobu no reconoce) y avisa por
  // Telegram del agujero (caso James Ascott 27-29/08/2026: Smoobu caído, reserva nunca sincronizada).
  // Cada 15 min: sale en segundos cuando no hay pendientes (SELECT y fuera).
  { path: '/api/sivra/reservas-booking/verificar', schedule: '4,19,34,49 * * * *' },
  // Extras cobrados al huésped: recordatorio a las 24 h y caducidad a 48 h de la entrada. A las
  // 07:00, antes del vigía de latidos de las 07:45, para que su huella del día ya esté escrita.
  { path: '/api/cron/sivra-extras-impago', schedule: '0 7 * * *' },
  // 🔮 Foto diaria de la previsión por piso (mes en curso + 2) → `pisos_previsiones`, para poder
  // juzgar después si las previsiones se cumplen (seguimiento en /sivra/resultado-pisos) + aviso
  // «previsión floja» a ~30 días del mes. Tras el sync de Smoobu de las 05:00/05:15 a propósito:
  // la foto se toma con el calendario ya fresco del día.
  { path: '/api/cron/prevision-pisos', schedule: '50 5 * * *' },
  { path: '/api/sivra/limpiadoras/auto-sessions', schedule: '0 5 * * *' },
  { path: '/api/sivra/limpiadoras/auto-assign', schedule: '30 5 * * *' },
  { path: '/api/sivra/limpiadoras/alerta-ventana', schedule: '0 8 * * *' },
  { path: '/api/sivra/rates/snapshot', schedule: '0 7 * * *' },
  { path: '/api/sivra/mensajes/auto-reply', schedule: '*/3 * * * *' },
  // Mensajes PROGRAMADOS del ciclo de reserva (sustituto de las plantillas de Smoobu, 31/08/2026).
  // Cada 30 min: las ventanas horarias las decide la lógica pura (decidir.ts) en hora Madrid; el
  // dedupe por (booking, tipo, fecha_objetivo) hace inocua la frecuencia. Modo sombra por piso.
  { path: '/api/sivra/mensajes/programados', schedule: '7,37 * * * *' },
  { path: '/api/sivra/mensajes/resumen-diario', schedule: '0 19 * * *' },
  { path: '/api/sivra/resumen-semanal', schedule: '0 9 * * 1' },
  { path: '/api/sivra/expenses/agent/scan', schedule: '0 6 * * *' },
  { path: '/api/sivra/expenses/agent/resumen-mensual', schedule: '0 9 1 * *' },
  // DIARIOS desde el 01/08/2026 (eran semanales, lunes). Un evento que se anuncia el martes tardaba
  // hasta 6 días en llegar al motor, y si el dispatcher se saltaba ESE lunes (el catch-up solo cubre
  // 15 min) se perdía la semana entera en silencio. Ambos hacen upsert idempotente y solo escriben
  // cuando encuentran algo nuevo, así que repetirlos es barato: el de Ticketmaster no cuesta tokens y
  // el de búsqueda web va contra el presupuesto diario de la pasarela como cualquier otra llamada.
  { path: '/api/sivra/eventos/sync', schedule: '0 4 * * *' },
  // Calendario fijo de Sevilla (27/08/2026): Semana Santa derivada de la Pascua + las fechas de
  // tabla. Va DELANTE de los descubridores a propósito — lo que ya se sabe no hace falta buscarlo,
  // y así el listado de «ya registrado» que se le pasa a la IA en /websearch incluye estas fechas y
  // no gasta huecos redescubriéndolas. Siembra siempre: no hay más proveedor de precio que este
  // motor, así que gatear su propio calendario tras una env solo lo dejaba fuera (Alberto, 27/08).
  { path: '/api/sivra/eventos/calendario', schedule: '30 3 * * *' },
  { path: '/api/sivra/eventos/websearch', schedule: '0 5 * * *' },
  // Verificación automática de los PREVISTOS (12/08/2026): va DETRÁS de los dos descubridores
  // para juzgar en la misma mañana lo que acaban de encontrar. Antes esto lo hacía Alberto a mano
  // desde un Telegram — y lo que no decidía nadie se quedaba moviendo el precio para siempre.
  { path: '/api/sivra/eventos/verificar', schedule: '30 5 * * *' },
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
