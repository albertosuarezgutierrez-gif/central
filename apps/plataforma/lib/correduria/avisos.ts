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
import type { LecturaSolicitudesPortal, SolicitudPortal } from './solicitudes-portal.ts'
import type { ResultadoLeads } from '../leads-asegura.ts'
import type { ConversionLeadsWeb } from '../leads-web-conversion-asegura.ts'
import type { LecturaOportunidadesPatrimonio } from './oportunidades-patrimonio.ts'
import type { LecturaPorTramitar } from '../carta-mediador-asegura.ts'
import type { LecturaSincroCima } from '../cima-sincro-asegura.ts'
import { textoPermiso, type LecturaPermisosPortal } from './permisos-portal.ts'

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
  'correos_compania_sin_resolver',
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
  // La bandeja vive en Mi mesa (no en Gestión): es lo único de la banda que se trabaja en la propia mesa.
  correos_compania_sin_resolver: '/correduria/mesa#correos-compania',
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
  correos_compania_sin_resolver: ['aviso de compañía por correo sin resolver (no se ha escrito en la cartera)', 'avisos de compañías por correo sin resolver (no se ha escrito en la cartera)', 'los avisos de compañías por correo'],
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

// ═══ La CAMPANA de /correduria (26/10/2026) ═══════════════════════════════════════════════════════════════════
// Alberto: «veo mucho lío en mi mesa; pon una campanita para notificaciones: leads nuevos, avisos de permisos…».
// La banda de «Mi mesa» se va a la campana de `AccionesCabecera`, y con ella lo que era aviso puntual en «Gestión».
// Fuente ÚNICA: `GET /api/correduria/avisos` (este mismo contrato, campo `campana`). PURO: la ruta lee cada fuente con
// su intérprete de siempre y aquí se agrupa, se cuenta y se ordena.
//
// 🚨 Las reglas que este bloque existe para no romper:
//   · Error de una fuente ≠ 0: el grupo sale `error` («No se ha podido comprobar …») y el contador lleva «+» (o «!» si
//     no se pudo contar nada). Nunca desaparece como si estuviera vacío.
//   · Lo que tiene PLAZO LEGAL (supresiones RGPD, quejas, partes, recibos del art. 15 LCS) va PRIMERO, marcado.
//   · Comprobado y vacío = no ocupa sitio. Apagado (Patrimonio) = no aparece.
//   · Máx. `MAX_ITEMS_GRUPO` filas por tipo (el resto, «ver todo»). Sin «leído»: lo pendiente cuenta hasta que se atiende.

export const MAX_ITEMS_GRUPO = 20

export const TIPOS_NUEVOS_CAMPANA = [
  'solicitudes_portal', 'leads_nuevos', 'permisos_portal', 'oportunidades_patrimonio', 'cartas_mediador', 'diferencias_cima',
] as const
export type TipoCampana = TipoAviso | (typeof TIPOS_NUEVOS_CAMPANA)[number]

/** Lo que corre un plazo que pone la LEY (RGPD, reglamento de quejas, LCS): arriba y en rojo. */
export const PLAZO_LEGAL: ReadonlySet<TipoCampana> = new Set<TipoCampana>(['supresiones', 'quejas', 'partes', 'recibos_lcs'])

export type ItemCampana = {
  id: string
  texto: string
  detalle: string | null
  /** Dónde se actúa. `null` = no hay pantalla a la que ir (p. ej. persona sin ficha). */
  href: string | null
  /** Solo en `solicitudes_portal`: lo que hace falta para Activar/Rechazar desde el panel. */
  solicitud?: SolicitudPortal
}

export type GrupoCampana = {
  tipo: TipoCampana
  titulo: string
  /** `parcial` = se contó una parte; alguna sub-fuente no se pudo leer. */
  estado: 'ok' | 'parcial' | 'error'
  /** Pendientes que cuentan. `null` = no se ha podido contar. */
  n: number | null
  plazoLegal: boolean
  nivel: NivelAviso
  /** La línea resumen («2 quejas abiertas · plazo …» / «No se han podido comprobar …»). */
  texto: string
  plazo: string | null
  diasRestantes: number | null
  /** «Ver todo»: dónde vive la lista entera. `null` = la lista entera se abre en el propio panel (o no hay más). */
  href: string | null
  items: ItemCampana[]
  /** Filas que no caben en `items` (ver todo). */
  mas: number
  /** Movimientos que se enseñan pero NO cuentan (permisos aceptados/revocados recientes). */
  informativos: number
}

export type Campana = {
  hoy: string
  /** Suma de pendientes legibles. */
  total: number
  /** Alguna fuente no se pudo leer entera: `total` es un SUELO. */
  parcial: boolean
  /** Lo que pinta el icono: «» (nada), «3», «3+», «!». */
  contador: string
  grupos: GrupoCampana[]
}

const TITULO_COLA: Record<TipoAviso, string> = {
  partes: 'Partes del portal', supresiones: 'Supresiones RGPD', quejas: 'Quejas', cambios_cuenta: 'Cambios de cuenta',
  recibos_lcs: 'Recibos devueltos (art. 15 LCS)', aprobaciones: 'Esperan tu OK', bajas_pue: 'Bajas de Allianz (PUE)',
  anulaciones: 'Anulaciones', recibos_sin_confirmar: 'Recibos sin confirmar', correos_compania_sin_resolver: 'Avisos de compañías por correo',
  ingesta: 'Ingesta de CIMA', puerto: 'Puerto de asegura',
}

const POS_TIPO: readonly TipoCampana[] = [
  'puerto', 'supresiones', 'quejas', 'partes', 'recibos_lcs', 'solicitudes_portal', 'leads_nuevos', 'permisos_portal',
  'aprobaciones', 'bajas_pue', 'anulaciones', 'cambios_cuenta', 'recibos_sin_confirmar', 'correos_compania_sin_resolver',
  'cartas_mediador', 'diferencias_cima', 'oportunidades_patrimonio', 'ingesta',
]

const fichaHref = (id: string | null): string | null => (id ? `/correduria/cliente/${encodeURIComponent(id)}` : null)
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

function grupoBase(tipo: TipoCampana, titulo: string): Omit<GrupoCampana, 'estado' | 'n' | 'nivel' | 'texto'> {
  return { tipo, titulo, plazoLegal: PLAZO_LEGAL.has(tipo), plazo: null, diasRestantes: null, href: null, items: [], mas: 0, informativos: 0 }
}

function grupoError(tipo: TipoCampana, titulo: string, que: string, motivo: string | null, href: string | null = null): GrupoCampana {
  return {
    ...grupoBase(tipo, titulo), href, estado: 'error', n: null, nivel: 'no_comprobado',
    texto: `No se ha podido comprobar ${que}${motivo ? ` (${motivo})` : ''}. No significa que no haya.`,
  }
}

function recortar(items: ItemCampana[]): { items: ItemCampana[]; mas: number } {
  return { items: items.slice(0, MAX_ITEMS_GRUPO), mas: Math.max(0, items.length - MAX_ITEMS_GRUPO) }
}

/** Una línea de la banda (cola de asegura, ingesta o puerto) → su grupo. Sin filas: el enlace lleva a donde se trabaja. */
export function grupoDeAviso(a: Aviso): GrupoCampana {
  return {
    ...grupoBase(a.tipo, TITULO_COLA[a.tipo]),
    estado: a.nivel === 'no_comprobado' ? 'error' : 'ok',
    // La ingesta en rojo se DICE (urgente) pero no es un pendiente que sumar: cuenta 0 (y «+» si no se pudo comprobar).
    n: a.nivel === 'no_comprobado' ? null : a.tipo === 'ingesta' ? 0 : a.n,
    nivel: a.nivel, texto: a.texto, plazo: a.plazo, diasRestantes: a.diasRestantes, href: a.href,
  }
}

export function grupoSolicitudes(l: LecturaSolicitudesPortal): GrupoCampana | null {
  const t = 'Solicitudes del portal'
  if (l.estado === 'sin_configurar') return grupoError('solicitudes_portal', t, 'las solicitudes del portal', 'falta conectar el puerto de asegura')
  if (l.estado === 'error') return grupoError('solicitudes_portal', t, 'las solicitudes del portal', l.motivo)
  if (l.solicitudes.length === 0) return null
  const n = l.solicitudes.length
  return {
    ...grupoBase('solicitudes_portal', t), estado: 'ok', n, nivel: 'aviso',
    texto: plural(n, 'herramienta pedida desde el portal', 'herramientas pedidas desde el portal'),
    ...recortar(l.solicitudes.map((s) => ({
      id: s.id, texto: `${s.cliente} · ${s.moduloNombre}`,
      detalle: s.puedeActivar ? null : s.motivoNoActivar, href: fichaHref(s.clienteId), solicitud: s,
    }))),
  }
}

/**
 * Leads nuevos: los criterios de «nuevo» que YA existen, no uno inventado.
 *   · Portal: la póliza de otra compañía que el cliente subió y es trabajo de HOY (`urgente`, `leadUrgente()` del módulo).
 *   · Web: lead `fuente='web'` sin convertir (los `pendientes` de la conversión) cuyo `lead_estado` sigue en `nuevo`
 *     (nadie lo ha movido). `null` = el puerto no lo manda: se cuenta como nuevo (no consta que se haya atendido).
 */
export function grupoLeads(portal: ResultadoLeads, web: ConversionLeadsWeb): GrupoCampana | null {
  const t = 'Leads nuevos'
  const items: ItemCampana[] = []
  const fallos: string[] = []
  if (portal.ok) {
    for (const l of portal.leads.filter((x) => x.urgente)) {
      const acc = l.fechaAccionable ? l.fechaAccionable.toISOString().slice(0, 10) : null
      items.push({
        id: `portal:${l.id}`,
        texto: `Póliza de ${l.compania ?? 'otra compañía'}${l.ramo ? ` (${l.ramo})` : ''} subida al portal`,
        detalle: l.senalCarta === 'enviada' ? 'Ha enviado la carta de no renovación a su compañía' : acc ? `Llama antes del ${fechaEs(acc)}` : null,
        href: fichaHref(l.clienteId),
      })
    }
    if (portal.ilegibles > 0) fallos.push(`${portal.ilegibles} del portal ilegibles`)
  } else fallos.push('los del portal')
  if (web.estado === 'ok') {
    for (const p of web.pendientes.filter((x) => x.leadEstado === null || x.leadEstado === 'nuevo')) {
      items.push({
        id: `web:${p.clienteId}`, texto: `${p.nombre} · entró por la web`,
        detalle: p.diasDesdeAlta === 0 ? 'hoy' : `hace ${p.diasDesdeAlta} d`, href: fichaHref(p.clienteId),
      })
    }
  } else fallos.push('los de la web')
  if (!portal.ok && web.estado !== 'ok') return grupoError('leads_nuevos', t, 'los leads nuevos', null, '/correduria?s=clientes')
  if (items.length === 0 && fallos.length === 0) return null
  const n = items.length
  return {
    ...grupoBase('leads_nuevos', t), href: '/correduria?s=clientes',
    estado: fallos.length > 0 ? 'parcial' : 'ok', n, nivel: fallos.length > 0 ? 'no_comprobado' : 'aviso',
    texto: `${plural(n, 'lead nuevo sin atender', 'leads nuevos sin atender')}${fallos.length > 0 ? ` · no se han podido comprobar ${fallos.join(' ni ')}` : ''}`,
    ...recortar(items),
  }
}

export function grupoPermisos(l: LecturaPermisosPortal): GrupoCampana | null {
  const t = 'Permisos del portal'
  if (l.estado === 'sin_configurar') return grupoError('permisos_portal', t, 'los permisos del portal', 'falta conectar el puerto de asegura')
  if (l.estado === 'error') return grupoError('permisos_portal', t, 'los permisos del portal', l.motivo)
  if (l.movimientos.length === 0) return null
  const resumen = [
    l.pendientes > 0 ? plural(l.pendientes, 'permiso esperando respuesta', 'permisos esperando respuesta') : null,
    l.recientes > 0 ? `${plural(l.recientes, 'cambio', 'cambios')} en los últimos 7 días` : null,
  ].filter(Boolean).join(' · ')
  return {
    ...grupoBase('permisos_portal', t), estado: l.truncado ? 'parcial' : 'ok', n: l.pendientes, nivel: 'aviso', texto: resumen,
    informativos: l.recientes,
    ...recortar(l.movimientos.map((m) => ({
      id: m.id, texto: textoPermiso(m),
      detalle: `${m.evento === 'aceptada' || m.evento === 'revocada' ? 'el' : 'desde el'} ${fechaEs(m.fecha.slice(0, 10))}`,
      href: fichaHref(m.deClienteId ?? m.aClienteId),
    }))),
  }
}

export function grupoPatrimonio(l: LecturaOportunidadesPatrimonio): GrupoCampana | null {
  const t = 'Oportunidades de Patrimonio'
  if (l.estado === 'apagado') return null
  if (l.estado === 'sin_configurar') return grupoError('oportunidades_patrimonio', t, 'las oportunidades de Patrimonio', 'falta conectar el puerto de asegura')
  if (l.estado === 'error') return grupoError('oportunidades_patrimonio', t, 'las oportunidades de Patrimonio', l.motivo)
  if (l.senales.length === 0) return null
  const n = l.senales.length
  return {
    ...grupoBase('oportunidades_patrimonio', t), estado: 'ok', n, nivel: 'aviso',
    texto: plural(n, 'oportunidad abierta en Patrimonio', 'oportunidades abiertas en Patrimonio'),
    ...recortar(l.senales.map((s) => ({ id: s.id, texto: `${s.cliente} · ${s.rotulo}`, detalle: s.inmueble, href: fichaHref(s.clienteId) }))),
  }
}

export function grupoCartas(l: LecturaPorTramitar): GrupoCampana | null {
  const t = 'Cartas del mediador'
  if (l.estado !== 'ok') return grupoError('cartas_mediador', t, 'las cartas de nombramiento', l.causa)
  if (l.cartas.length === 0) return null
  const n = l.cartas.length
  return {
    ...grupoBase('cartas_mediador', t), estado: 'ok', n, nivel: 'aviso',
    texto: plural(n, 'carta de nombramiento por tramitar', 'cartas de nombramiento por tramitar'),
    ...recortar(l.cartas.map((c) => ({
      id: c.id, texto: `${c.cliente ?? 'Cliente sin nombre'} · ${c.compania ?? 'compañía sin dato'}`,
      detalle: c.estado === 'firmada' ? (c.enCola ? 'Firmada · su correo espera tu OK' : 'Firmada · falta enviarla a la compañía') : 'Enviada · esperando a la compañía',
      href: `/correduria/poliza/${encodeURIComponent(c.polizaId)}`,
    }))),
  }
}

export function grupoCima(l: LecturaSincroCima): GrupoCampana | null {
  const t = 'Diferencias con CIMA'
  const g = '/correduria?s=gestion'
  if (l.estado === 'no_desplegado') return grupoError('diferencias_cima', t, 'las diferencias con CIMA', 'asegura aún no lo tiene desplegado', g)
  if (l.estado === 'sin_configurar') return grupoError('diferencias_cima', t, 'las diferencias con CIMA', 'falta conectar el puerto de asegura', g)
  if (l.estado === 'error') return grupoError('diferencias_cima', t, 'las diferencias con CIMA', l.motivo, g)
  const n = l.discrepancias.reduce((s, f) => s + f.diferencias.length, 0)
  if (n === 0) return null
  return {
    ...grupoBase('diferencias_cima', t), href: g, estado: 'ok', n, nivel: 'aviso',
    texto: plural(n, 'dato de ficha distinto del de CIMA', 'datos de ficha distintos de los de CIMA'),
    ...recortar(l.discrepancias.map((f) => ({
      id: f.clienteId, texto: f.nombre, detalle: plural(f.diferencias.length, 'campo distinto', 'campos distintos'), href: fichaHref(f.clienteId),
    }))),
  }
}

const NIVEL_POS: Record<NivelAviso, number> = { urgente: 0, no_comprobado: 1, aviso: 2 }

/** Plazo legal primero (el plazo más cercano arriba); luego urgente → no comprobado → aviso; empate, orden fijo del tipo. */
export function ordenarGrupos(gs: readonly GrupoCampana[]): GrupoCampana[] {
  return [...gs].sort((a, b) =>
    (a.plazoLegal ? 0 : 1) - (b.plazoLegal ? 0 : 1)
    || NIVEL_POS[a.nivel] - NIVEL_POS[b.nivel]
    || (a.plazo ?? '9999-12-31').localeCompare(b.plazo ?? '9999-12-31')
    || POS_TIPO.indexOf(a.tipo) - POS_TIPO.indexOf(b.tipo))
}

/** El número del icono. Error ≠ 0: con algo ilegible el total es un suelo («3+»); sin nada contado y algo ilegible, «!». */
export function contadorCampana(gs: readonly GrupoCampana[]): { total: number; parcial: boolean; contador: string } {
  let total = 0
  let parcial = false
  for (const g of gs) {
    if (g.estado !== 'ok') parcial = true
    if (g.n !== null) total += g.n
  }
  return { total, parcial, contador: total > 0 ? `${total}${parcial ? '+' : ''}` : parcial ? '!' : '' }
}

export type FuentesCampana = {
  avisos: Avisos
  solicitudes: LecturaSolicitudesPortal
  leadsPortal: ResultadoLeads
  leadsWeb: ConversionLeadsWeb
  permisos: LecturaPermisosPortal
  patrimonio: LecturaOportunidadesPatrimonio
  cartas: LecturaPorTramitar
  cima: LecturaSincroCima
}

export function componerCampana(f: FuentesCampana): Campana {
  const grupos = [
    ...f.avisos.avisos.map(grupoDeAviso),
    grupoSolicitudes(f.solicitudes),
    grupoLeads(f.leadsPortal, f.leadsWeb),
    grupoPermisos(f.permisos),
    grupoPatrimonio(f.patrimonio),
    grupoCartas(f.cartas),
    grupoCima(f.cima),
  ].filter((g): g is GrupoCampana => g !== null)
  return { hoy: f.avisos.hoy, ...contadorCampana(grupos), grupos: ordenarGrupos(grupos) }
}
