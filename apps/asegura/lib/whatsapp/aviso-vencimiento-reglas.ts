// Aviso de vencimiento por WhatsApp — REGLAS PURAS (sin BD, sin red; `hoy` siempre inyectado).
//
// Plantilla de UTILIDAD a dar de alta en Meta (nombre `aviso_vencimiento_poliza`, idioma es):
//   «Hola {{1}}, te escribe Grupo ASegura. Tu seguro de {{2}} vence el {{3}}. Si quieres que revisemos la renovación
//   y el precio, respóndenos aquí. Si prefieres no recibir estos avisos, dínoslo y no te escribiremos más.»
//
// Env: ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO='1' (apagado por defecto) · WHATSAPP_PLANTILLA_VENCIMIENTO (nombre)
//      · WHATSAPP_PLANTILLA_VENCIMIENTO_IDIOMA (por defecto `es`) · WHATSAPP_AVISO_VENCIMIENTO_TOPE (diario, por defecto 15).

import { escapeHtml } from '@central/core-telegram'

type Env = Record<string, string | undefined>

export const DIAS_ANTELACION = 60
/** Si el cron falla unos días, se recupera la semana anterior a los 60 días (sigue sin duplicar: hay clave única). */
export const DIAS_RECUPERACION = 7
export const TOPE_DIARIO_DEFECTO = 15
export const TOPE_DIARIO_MAX = 100
export const IDIOMA_DEFECTO = 'es'
/** Un mismo cliente no recibe otro aviso en este plazo (tiene dos pólizas que vencen seguidas: va una y luego la otra). */
export const DIAS_ENTRE_AVISOS_CLIENTE = 30

export type ConfigAviso = { plantilla: string; idioma: string; tope: number }

export function avisoActivo(env: Env = process.env): boolean {
  return env.ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO === '1'
}

/** Config válida o `null` (sin plantilla bien escrita no se envía nada: nunca se adivina un nombre). */
export function configAviso(env: Env = process.env): ConfigAviso | null {
  const plantilla = env.WHATSAPP_PLANTILLA_VENCIMIENTO?.trim() ?? ''
  if (!/^[a-z0-9_]{1,512}$/.test(plantilla)) return null
  const idioma = env.WHATSAPP_PLANTILLA_VENCIMIENTO_IDIOMA?.trim() || IDIOMA_DEFECTO
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(idioma)) return null
  const t = env.WHATSAPP_AVISO_VENCIMIENTO_TOPE?.trim()
  let tope = TOPE_DIARIO_DEFECTO
  if (t !== undefined && t !== '') {
    if (!/^\d{1,3}$/.test(t)) return null
    tope = Number(t)
    if (tope < 1 || tope > TOPE_DIARIO_MAX) return null
  }
  return { plantilla, idioma, tope }
}

/**
 * ¿Puede la IA PROMETER avisos de vencimiento al cliente? Solo si el aviso está activo Y la plantilla está configurada:
 * si no, prometerlo sería inventar un servicio que no sale.
 */
export function avisoVencimientoDisponible(env: Env = process.env): boolean {
  return avisoActivo(env) && configAviso(env) !== null
}

// ── Fechas ─────────────────────────────────────────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/
const msDia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

export function hoyMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export function fechaEs(iso: string): string {
  return ISO.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso
}

/** Días naturales de `hoy` a `venc` (negativo = ya vencida). `null` si alguna fecha no es `aaaa-mm-dd`. */
export function diasHasta(vencIso: string | null, hoyIso: string): number | null {
  if (!vencIso || !ISO.test(vencIso) || !ISO.test(hoyIso)) return null
  return Math.round((msDia(vencIso) - msDia(hoyIso)) / 86_400_000)
}

export function enVentana(dias: number | null): boolean {
  return dias !== null && dias <= DIAS_ANTELACION && dias > DIAS_ANTELACION - DIAS_RECUPERACION
}

/** Límites `aaaa-mm-dd` de la criba SQL (ambos incluidos). */
export function rangoVentana(hoyIso: string): { desde: string; hasta: string } {
  const f = (d: number) => new Date(msDia(hoyIso) + d * 86_400_000).toISOString().slice(0, 10)
  return { desde: f(DIAS_ANTELACION - DIAS_RECUPERACION + 1), hasta: f(DIAS_ANTELACION) }
}

// ── Datos de la plantilla ──────────────────────────────────────────────────────
const RAMOS: Record<string, string> = {
  auto: 'coche', moto: 'moto', hogar: 'hogar', vida: 'vida', salud: 'salud', decesos: 'decesos',
  responsabilidad_civil: 'responsabilidad civil', comercio: 'comercio', comunidades: 'comunidad', accidentes: 'accidentes',
  empresas: 'empresa', rc_profesional: 'responsabilidad civil profesional', dyo: 'D&O', flotas: 'flota', transporte_mercancias: 'transporte',
  ciberriesgos: 'ciberriesgos', decenal: 'decenal', embarcaciones: 'embarcación', mascotas: 'mascotas', impago_alquiler: 'impago de alquiler', viaje: 'viaje',
}

export function ramoLegible(tipo: string): string {
  return RAMOS[tipo] ?? 'seguro'
}

/** Primer nombre de pila, capitalizado; vacío o basura → «cliente» (la plantilla siempre queda bien escrita). */
export function primerNombre(nombre: string | null): string {
  const limpio = (nombre ?? '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/)[0] ?? ''
  if (limpio.length < 2) return 'cliente'
  return (limpio.charAt(0).toLocaleUpperCase('es') + limpio.slice(1).toLocaleLowerCase('es')).slice(0, 40)
}

export function parametrosPlantilla(p: { nombre: string | null; tipo: string; vencIso: string }): [string, string, string] {
  return [primerNombre(p.nombre), ramoLegible(p.tipo), fechaEs(p.vencIso)]
}

/** El texto que queda en `mensajes` (lo que el cliente ve), con las variables ya puestas. */
export function textoRenderizado(params: readonly [string, string, string]): string {
  return `Hola ${params[0]}, te escribe Grupo ASegura. Tu seguro de ${params[1]} vence el ${params[2]}. Si quieres que revisemos la renovación y el precio, respóndenos aquí. Si prefieres no recibir estos avisos, dínoslo y no te escribiremos más.`
}

export function claveAviso(origen: 'poliza' | 'oportunidad', id: string, vencIso: string): string {
  return `${origen}:${id}:${vencIso}`
}

/** Teléfono descifrado → dígitos con prefijo para Meta, solo si es MÓVIL. ES: 6xx/7xx. Otro país: E.164 plausible. */
export function movilParaMeta(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.replace(/[\s().-]/g, '')
  let d: string
  if (/^\+\d{8,15}$/.test(s)) d = s.slice(1)
  else if (/^00\d{8,15}$/.test(s)) d = s.slice(2)
  else if (/^[67]\d{8}$/.test(s)) d = `34${s}`
  else if (/^\d{11,15}$/.test(s)) d = s
  else return null
  if (d.startsWith('34')) return /^34[67]\d{8}$/.test(d) ? d : null
  return /^[1-9]\d{9,14}$/.test(d) ? d : null
}

// ── Decisión ───────────────────────────────────────────────────────────────────
export type Candidato = {
  origen: 'poliza' | 'oportunidad'
  id: string
  clienteId: string
  conversacionId: string
  nombre: string | null
  tipo: string
  vencIso: string
  telefono: string | null
  /** Fichas vivas que casan con el teléfono (`conversaciones.clientes_candidatos`). `null` = no se sabe. */
  candidatos: number | null
  /** Conversaciones de WhatsApp de la ficha (≠1 → ambigua: dos teléfonos). */
  conversacionesFicha: number
  optOut: boolean
  estadoConversacion: string
  /** Hay al menos un mensaje SALIENTE de Alberto (eco del móvil) en la conversación. */
  iniciadaPorAlberto: boolean
}

export type Omision =
  | 'fuera_de_ventana' | 'ficha_no_unica' | 'sin_movil' | 'opt_out' | 'sin_conversacion_previa' | 'ya_avisada' | 'cliente_reciente' | 'cliente_repetido' | 'tope'

export function motivoOmision(c: Candidato, hoyIso: string): Omision | null {
  if (!enVentana(diasHasta(c.vencIso, hoyIso))) return 'fuera_de_ventana'
  if (c.optOut) return 'opt_out'
  if (c.candidatos !== 1 || c.conversacionesFicha !== 1) return 'ficha_no_unica'
  if (movilParaMeta(c.telefono) === null) return 'sin_movil'
  if (c.estadoConversacion === 'descartada_personal' || !c.iniciadaPorAlberto) return 'sin_conversacion_previa'
  return null
}

export type Seleccion = { enviar: Candidato[]; omitidos: Partial<Record<Omision, number>> }

/** Aplica reglas, idempotencia, un aviso por cliente y el tope del día. Orden: el vencimiento más próximo primero. */
export function seleccionar(
  candidatos: readonly Candidato[],
  ctx: { hoyIso: string; yaAvisadas: ReadonlySet<string>; clientesRecientes: ReadonlySet<string>; restanteHoy: number },
): Seleccion {
  const omitidos: Seleccion['omitidos'] = {}
  const omitir = (m: Omision) => { omitidos[m] = (omitidos[m] ?? 0) + 1 }
  const enviar: Candidato[] = []
  const vistos = new Set<string>()
  const orden = [...candidatos].sort((a, b) => a.vencIso.localeCompare(b.vencIso) || a.id.localeCompare(b.id))
  for (const c of orden) {
    const m = motivoOmision(c, ctx.hoyIso)
    if (m) { omitir(m); continue }
    if (ctx.yaAvisadas.has(claveAviso(c.origen, c.id, c.vencIso))) { omitir('ya_avisada'); continue }
    if (ctx.clientesRecientes.has(c.clienteId)) { omitir('cliente_reciente'); continue }
    if (vistos.has(c.clienteId)) { omitir('cliente_repetido'); continue }
    if (enviar.length >= ctx.restanteHoy) { omitir('tope'); continue }
    vistos.add(c.clienteId)
    enviar.push(c)
  }
  return { enviar, omitidos }
}

// ── Telegram ───────────────────────────────────────────────────────────────────
export type ResumenAviso = {
  hoyIso: string
  soloContar: boolean
  candidatas: number
  enviados: { nombre: string | null; tipo: string; vencIso: string }[]
  fallidos: number
  omitidos: Seleccion['omitidos']
}

const ETIQUETA_OMISION: Record<Omision, string> = {
  fuera_de_ventana: 'fuera de ventana', ficha_no_unica: 'ficha/teléfono ambiguo', sin_movil: 'sin móvil válido', opt_out: 'baja de WhatsApp',
  sin_conversacion_previa: 'sin conversación tuya previa', ya_avisada: 'ya avisadas', cliente_reciente: 'aviso reciente al cliente',
  cliente_repetido: 'mismo cliente', tope: 'tope diario',
}

/** Sin teléfonos ni textos del cliente: solo el nombre de la ficha, el ramo y la fecha. */
export function textoTelegramAviso(r: ResumenAviso): string {
  const l = [`📅 <b>Avisos de vencimiento por WhatsApp</b> · ${fechaEs(r.hoyIso)}${r.soloContar ? ' (ensayo: no se ha enviado nada)' : ''}`]
  l.push(`${r.soloContar ? 'Se enviarían' : 'Enviados'}: ${r.enviados.length}${r.fallidos ? ` · fallidos: ${r.fallidos}` : ''} · candidatas leídas: ${r.candidatas}`)
  for (const e of r.enviados.slice(0, 15)) l.push(`• ${escapeHtml(primerNombre(e.nombre))} · ${escapeHtml(ramoLegible(e.tipo))} · vence ${fechaEs(e.vencIso)}`)
  if (r.enviados.length > 15) l.push(`… y ${r.enviados.length - 15} más`)
  const om = Object.entries(r.omitidos).filter(([m]) => m !== 'fuera_de_ventana')
  if (om.length) l.push(`Omitidas: ${om.map(([m, n]) => `${n} ${ETIQUETA_OMISION[m as Omision]}`).join(', ')}`)
  return l.join('\n')
}
