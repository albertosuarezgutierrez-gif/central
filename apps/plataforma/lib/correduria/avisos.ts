/**
 * Banda de avisos de «Mi mesa» (Alberto, 13/10/2026, decisión 3): lo administrativo vive en «Gestión»; en
 * la mesa solo una línea cuando algo tiene PLAZO encima o es urgente. PURO: interpreta lo que manda
 * asegura (`GET /api/operador/avisos`: cada cola reducida a {n, plazo, urgentes}) y el veredicto de la
 * ingesta de CIMA (el MISMO de la pantalla de ingesta: `veredictoIngesta`/`tituloIngesta`), y redacta,
 * ordena y enlaza cada línea. La red va por `GET /api/correduria/avisos`.
 *
 * 🚨 Tres estados por cola: `ok` con n = 0 → no ocupa sitio (comprobado, no hay); `error` o forma rara →
 * línea «No se ha podido comprobar …» (nunca desaparece en silencio). Si el puerto entero no contesta, UNA
 * línea lo dice (no nueve).
 */
import { tituloIngesta, veredictoIngesta, type VistaIngesta } from './ingesta-pantalla.ts'

export const COLAS_AVISO = [
  'partes',
  'supresiones',
  'quejas',
  'cambios_cuenta',
  'recibos_lcs',
  'aprobaciones',
  'bajas_pue',
  'anulaciones',
  'recibos_sin_confirmar',
] as const
export type ColaAviso = (typeof COLAS_AVISO)[number]
export type TipoAviso = ColaAviso | 'ingesta' | 'puerto'

export type NivelAviso = 'urgente' | 'no_comprobado' | 'aviso'

export type Aviso = {
  tipo: TipoAviso
  nivel: NivelAviso
  /** La línea entera, ya redactada («2 partes del portal sin mirar»). */
  texto: string
  /** Cuántos. `null` = no se ha podido contar (no_comprobado). */
  n: number | null
  /** Plazo MÁS cercano (aaaa-mm-dd). `null` = sin plazo legal o no consta. */
  plazo: string | null
  /** Días hasta `plazo` (negativo = vencido). `null` sin plazo. */
  diasRestantes: number | null
  /** Dónde se trabaja (pantalla de plataforma). */
  href: string
}

export type Avisos = { estado: 'ok'; hoy: string; avisos: Aviso[] }

/** Dónde se trabaja cada cola. Es la pestaña «Gestión» (antes «Hoy»); si cambia su ruta, se cambia AQUÍ y solo aquí (lo vigila avisos.test.ts). */
export const HREF_AVISO: Record<TipoAviso, string> = {
  partes: '/correduria?s=gestion',
  supresiones: '/correduria?s=gestion',
  quejas: '/correduria?s=gestion',
  cambios_cuenta: '/correduria?s=gestion',
  recibos_lcs: '/correduria?s=gestion',
  aprobaciones: '/correduria?s=gestion',
  bajas_pue: '/correduria?s=gestion',
  anulaciones: '/correduria?s=gestion',
  recibos_sin_confirmar: '/correduria?s=gestion',
  ingesta: '/correduria?s=ingesta',
  puerto: '/correduria?s=gestion',
}

/** [singular, plural, qué se dice cuando no se pudo leer]. */
const ROTULO: Record<ColaAviso, [string, string, string]> = {
  partes: ['parte del portal sin mirar', 'partes del portal sin mirar', 'los partes del portal'],
  supresiones: ['supresión RGPD pendiente de contestar', 'supresiones RGPD pendientes de contestar', 'las supresiones RGPD'],
  quejas: ['queja abierta', 'quejas abiertas', 'las quejas'],
  cambios_cuenta: ['cambio de cuenta bancaria sin tramitar', 'cambios de cuenta bancaria sin tramitar', 'los cambios de cuenta bancaria'],
  recibos_lcs: ['recibo devuelto con el plazo del art. 15 LCS corriendo y sin rescate en la mesa', 'recibos devueltos con el plazo del art. 15 LCS corriendo y sin rescate en la mesa', 'los recibos devueltos'],
  aprobaciones: ['correo que espera tu OK', 'correos que esperan tu OK', 'los correos que esperan tu OK'],
  bajas_pue: ['baja de Allianz firmada sin tramitar en el PUE', 'bajas de Allianz firmadas sin tramitar en el PUE', 'las bajas de Allianz'],
  anulaciones: ['anulación con el plazo encima', 'anulaciones con el plazo encima', 'las anulaciones en curso'],
  recibos_sin_confirmar: ['recibo vencido sin confirmar el cobro (míralo en el portal de la compañía)', 'recibos vencidos sin confirmar el cobro (míralos en el portal de la compañía)', 'los recibos vencidos'],
}

const NIVEL_ORDEN: Record<NivelAviso, number> = { urgente: 0, no_comprobado: 1, aviso: 2 }
const ISO = /^\d{4}-\d{2}-\d{2}$/

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}
function diasHasta(hoy: string, iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)
}
function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function textoPlazo(plazo: string, dias: number): string {
  if (dias < 0) return ` · plazo vencido el ${fechaEs(plazo)}`
  if (dias === 0) return ' · el plazo acaba hoy'
  return ` · plazo ${fechaEs(plazo)} (${dias} d)`
}

/** Una cola del puerto → su línea, o `null` si se comprobó y no hay nada. */
export function avisoDeCola(tipo: ColaAviso, v: unknown, hoy: string): Aviso | null {
  const o = objeto(v)
  const n = entero(o?.n)
  const urgentes = entero(o?.urgentes)
  const plazoCrudo = typeof o?.plazo === 'string' && ISO.test(o.plazo) ? o.plazo : null
  if (!o || o.estado !== 'ok' || n === null || urgentes === null || (o.plazo !== null && plazoCrudo === null)) {
    return { tipo, nivel: 'no_comprobado', texto: `No se han podido comprobar ${ROTULO[tipo][2]}`, n: null, plazo: null, diasRestantes: null, href: HREF_AVISO[tipo] }
  }
  if (n === 0) return null
  const dias = plazoCrudo ? diasHasta(hoy, plazoCrudo) : null
  const base = `${n} ${n === 1 ? ROTULO[tipo][0] : ROTULO[tipo][1]}`
  return {
    tipo,
    nivel: urgentes > 0 ? 'urgente' : 'aviso',
    texto: base + (plazoCrudo && dias !== null ? textoPlazo(plazoCrudo, dias) : ''),
    n,
    plazo: plazoCrudo,
    diasRestantes: dias,
    href: HREF_AVISO[tipo],
  }
}

/** La ingesta de CIMA: solo sale si hay pérdida medida (urgente) o no se pudo comprobar entera. */
export function avisoDeIngesta(v: VistaIngesta | null): Aviso | null {
  const ver = veredictoIngesta(v)
  if (ver === 'ok') return null
  const base = { tipo: 'ingesta' as const, n: null, plazo: null, diasRestantes: null, href: HREF_AVISO.ingesta }
  // `null` (no contestó) se trata como «no se pudo comprobar»: en el servidor no hay «todavía cargando».
  if (ver === null) return { ...base, nivel: 'no_comprobado', texto: 'No se ha podido comprobar la ingesta de CIMA' }
  return { ...base, nivel: ver === 'incidencia' ? 'urgente' : 'no_comprobado', texto: tituloIngesta(v) }
}

export function ordenarAvisos(avisos: Aviso[]): Aviso[] {
  const pos = (t: TipoAviso) => (t === 'puerto' ? -1 : t === 'ingesta' ? COLAS_AVISO.length : COLAS_AVISO.indexOf(t))
  return [...avisos].sort((a, b) =>
    NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel]
    || (a.plazo ?? '9999-12-31').localeCompare(b.plazo ?? '9999-12-31')
    || pos(a.tipo) - pos(b.tipo))
}

/**
 * Compone la banda: la respuesta del puerto de asegura (status + json) y la vista de la ingesta.
 * `hoy` (Madrid) lo pone quien llama; si asegura manda el suyo, manda el de asegura (es el de los plazos).
 */
export function componerAvisos(status: number, json: unknown, ingesta: VistaIngesta | null, hoyLocal: string): Avisos {
  const o = objeto(json)
  const hoy = typeof o?.hoy === 'string' && ISO.test(o.hoy) ? o.hoy : hoyLocal
  const avisos: Aviso[] = []
  const colas = objeto(o?.colas)
  if (status !== 200 || o?.estado !== 'ok' || !colas) {
    const motivo = o?.estado === 'sin_configurar' || status === 503
      ? 'falta conectar el puerto de asegura'
      : status === 401 || status === 403 ? 'el secreto del puerto no vale' : `respuesta ${status}`
    avisos.push({ tipo: 'puerto', nivel: 'no_comprobado', texto: `No se han podido comprobar los avisos de la correduría (${motivo})`, n: null, plazo: null, diasRestantes: null, href: HREF_AVISO.puerto })
  } else {
    for (const c of COLAS_AVISO) {
      const a = avisoDeCola(c, colas[c], hoy)
      if (a) avisos.push(a)
    }
  }
  const ing = avisoDeIngesta(ingesta)
  if (ing) avisos.push(ing)
  return { estado: 'ok', hoy, avisos: ordenarAvisos(avisos) }
}
