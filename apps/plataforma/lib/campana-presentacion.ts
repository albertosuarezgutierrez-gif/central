// La campaña de correo «presentación app» (Grupo ASegura), leída del puerto de asegura
// (`GET /api/operador/campana/presentacion-app`) y pintada en /correduria → Más → Campañas.
//
// Dos partes, como `supresiones-asegura.ts`:
//   1. Lo PURO (sin red ni env; lo importa el client component y lo prueba el test): leer la respuesta
//      y calcular los % del embudo.
//   2. La RED: la llamada al puerto, solo desde la ruta API de plataforma.
//
// 🚨 `null` ≠ 0. asegura manda `null` en entregados/abiertos/clics cuando algún envío no tiene eventos
// legibles: «no se sabe». Aquí NUNCA se convierte en 0 ni en un % inventado; se pinta «—».
import { cabecerasPuerto } from './puerto-actor.ts'
import { leerContactabilidad, leerEstadoEmail, type Contactabilidad, type EstadoEmail } from './email-estado-asegura.ts'
export { ETIQUETA_ESTADO_EMAIL, type Contactabilidad, type EstadoEmail } from './email-estado-asegura.ts'

export type EmbudoCampana = {
  enviados: number
  fallidos: number
  entregados: number | null
  abiertos: number | null
  clics: number | null
  visitas: number
  registrados: number
  rebotados: number | null
  bajas: number
  /**
   * Solo en campañas que sondean el email (felicitaciones): email malo Y ningún teléfono utilizable. `undefined` =
   * la campaña no lo calcula; `null` = no se puede afirmar la cifra (lista recortada o lectura caída).
   */
  ilocalizables?: number | null
}

export type EtapaPersona = 'fallido' | 'sin_datos' | 'enviado' | 'entregado' | 'abierto' | 'clic' | 'visita' | 'registrado'

export type PersonaCampana = {
  clienteId: string
  nombre: string
  /** `null` = asegura no pudo leer el correo de la ficha. */
  email: string | null
  lote: number
  loteFecha: string
  variante: string
  etapa: EtapaPersona
  enviadoEn: string | null
  entregadoEn: string | null
  abiertoEn: string | null
  clicEn: string | null
  visitaEn: string | null
  registradoEn: string | null
  bajaEn: string | null
  rebotadoEn: string | null
  /** Sonda del email de la ficha (felicitaciones). `null` = no se sabe / la campaña no lo da. */
  estadoEmail: EstadoEmail | null
  contactabilidad: Contactabilidad | null
}

export type GrupoEmbudo = { grupo: string; embudo: EmbudoCampana }

export type RespuestaCampana =
  | {
      estado: 'ok'
      campana: string
      total: EmbudoCampana
      porLote: GrupoEmbudo[]
      porVariante: GrupoEmbudo[]
      personas: PersonaCampana[]
    }
  | { estado: 'sin_migracion' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const ETAPAS: readonly string[] = ['fallido', 'sin_datos', 'enviado', 'entregado', 'abierto', 'clic', 'visita', 'registrado']

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
/** Un número finito o `null`. NO cae a 0. */
function numeroONull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function leerEmbudo(v: unknown): EmbudoCampana | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const enviados = numeroONull(o.enviados)
  const visitas = numeroONull(o.visitas)
  const registrados = numeroONull(o.registrados)
  if (enviados === null || visitas === null || registrados === null) return null
  return {
    enviados,
    fallidos: numeroONull(o.fallidos) ?? 0,
    entregados: numeroONull(o.entregados),
    abiertos: numeroONull(o.abiertos),
    clics: numeroONull(o.clics),
    visitas,
    registrados,
    rebotados: numeroONull(o.rebotados),
    bajas: numeroONull(o.bajas) ?? 0,
    // Ausente = la campaña no lo calcula (no se pinta); presente y no numérico = «no se sabe».
    ...('ilocalizables' in o ? { ilocalizables: numeroONull(o.ilocalizables) } : {}),
  }
}

function leerGrupos(v: unknown): GrupoEmbudo[] {
  if (!Array.isArray(v)) return []
  const out: GrupoEmbudo[] = []
  for (const f of v) {
    const o = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>
    const grupo = cadena(o.grupo)
    const embudo = leerEmbudo(o.embudo)
    if (grupo && embudo) out.push({ grupo, embudo })
  }
  return out
}

function leerPersona(v: unknown): PersonaCampana | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const clienteId = cadena(o.clienteId)
  const etapa = cadena(o.etapa)
  if (!clienteId || !etapa || !ETAPAS.includes(etapa)) return null
  return {
    clienteId,
    nombre: cadena(o.nombre) ?? '',
    email: cadena(o.email),
    lote: numeroONull(o.lote) ?? 0,
    loteFecha: cadena(o.loteFecha) ?? '',
    variante: cadena(o.variante) ?? '',
    etapa: etapa as EtapaPersona,
    enviadoEn: cadena(o.enviadoEn),
    entregadoEn: cadena(o.entregadoEn),
    abiertoEn: cadena(o.abiertoEn),
    clicEn: cadena(o.clicEn),
    visitaEn: cadena(o.visitaEn),
    registradoEn: cadena(o.registradoEn),
    bajaEn: cadena(o.bajaEn),
    rebotadoEn: cadena(o.rebotadoEn),
    estadoEmail: leerEstadoEmail(o.estadoEmail),
    contactabilidad: leerContactabilidad(o.contactabilidad),
  }
}

/** La lectura de `GET /api/operador/campana/presentacion-app`. Un 200 sin forma NO es «campaña vacía». */
export function interpretarCampana(status: number, json: unknown): RespuestaCampana {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const emb = (typeof o.embudo === 'object' && o.embudo !== null ? o.embudo : {}) as Record<string, unknown>
  if (o.estado === 'sin_migracion' || emb.estado === 'sin_migracion') return { estado: 'sin_migracion' }
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'error', motivo: 'ruta_no_desplegada' }
  if (status === 200 && o.estado === 'ok' && emb.estado === 'ok') {
    const total = leerEmbudo(emb.total)
    if (!total) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const personas = Array.isArray(emb.personas)
      ? emb.personas.map(leerPersona).filter((p): p is PersonaCampana => p !== null)
      : []
    return {
      estado: 'ok',
      campana: cadena(emb.campana) ?? 'presentacion_app',
      total,
      porLote: leerGrupos(emb.porLote),
      porVariante: leerGrupos(emb.porVariante),
      personas,
    }
  }
  if (status === 503) return { estado: 'sin_configurar' }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/**
 * % de `n` sobre `base`, entero. `null` si cualquiera de los dos es `null` (no se sabe) o la base es 0
 * (no hay sobre qué calcular): nunca 0 % por falta de dato.
 */
export function porcentaje(n: number | null, base: number | null): number | null {
  if (n === null || base === null || base <= 0) return null
  return Math.round((n / base) * 100)
}

export function textoPorcentaje(p: number | null): string {
  return p === null ? '—' : `${p} %`
}

/** Número en pantalla: `null` = «—», nunca 0. Miles con punto. */
export function textoNumero(n: number | null): string {
  return n === null ? '—' : String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export type PasoEmbudo = {
  clave: string; etiqueta: string; valor: number | null; pctPrevio: number | null
  /** Clave del paso sobre el que va el % (`null` en el primero). */
  base: string | null
}

/**
 * Cómo se pinta el embudo de una campaña. Por defecto, los seis pasos encadenados. Una campaña puede renombrar un
 * paso, ocultarlo (`null`) o hacerlo INDEPENDIENTE: no implica a los anteriores, su % va sobre el primero y su lista
 * es solo de quien tiene SU evento (felicitaciones: «entró al portal» no prueba que pinchara el correo).
 */
export type FormaEmbudo = {
  etiquetas?: Partial<Record<string, string | null>>
  independientes?: readonly string[]
}

/** Los pasos del embudo, cada % sobre el paso ANTERIOR visible (el primero no lleva %); un independiente, sobre el primero. */
export function pasosEmbudo(e: EmbudoCampana, forma: FormaEmbudo = {}): PasoEmbudo[] {
  const todos: [string, string, number | null][] = [
    ['enviados', 'Enviados', e.enviados],
    ['entregados', 'Entregados', e.entregados],
    ['abiertos', 'Abiertos', e.abiertos],
    ['clics', 'Clics', e.clics],
    ['visitas', 'Visitas', e.visitas],
    ['registrados', 'Registrados', e.registrados],
  ]
  const visibles = todos
    .map(([clave, etiqueta, valor]) => [clave, forma.etiquetas?.[clave] === undefined ? etiqueta : forma.etiquetas[clave], valor] as const)
    .filter((x): x is readonly [string, string, number | null] => x[1] !== null)
  const indep = new Set(forma.independientes ?? [])
  let previo: readonly [string, string, number | null] | null = null
  const out: PasoEmbudo[] = []
  for (const [i, [clave, etiqueta, valor]] of visibles.entries()) {
    const sobre = i === 0 ? null : indep.has(clave) ? visibles[0] : previo
    out.push({ clave, etiqueta, valor, base: sobre ? sobre[0] : null, pctPrevio: sobre ? porcentaje(valor, sobre[2]) : null })
    if (!indep.has(clave)) previo = [clave, etiqueta, valor]
  }
  return out
}

const NIVEL_ETAPA: Record<EtapaPersona, number> = {
  fallido: -1, sin_datos: 0, enviado: 0, entregado: 1, abierto: 2, clic: 3, visita: 4, registrado: 5,
}
/** Nivel mínimo de cada tarjeta del embudo (mismo orden y regla que `embudoCampana` de module-seguros). */
const NIVEL_PASO: Record<string, number> = { enviados: 0, entregados: 1, abiertos: 2, clics: 3, visitas: 4, registrados: 5 }
/** Evento propio de cada paso, y los posteriores que lo implican si el propio no consta. */
const EVENTOS_PASO: Record<string, (keyof PersonaCampana)[]> = {
  enviados: ['enviadoEn'],
  entregados: ['entregadoEn', 'abiertoEn', 'clicEn', 'visitaEn', 'registradoEn'],
  abiertos: ['abiertoEn', 'clicEn', 'visitaEn', 'registradoEn'],
  clics: ['clicEn', 'visitaEn', 'registradoEn'],
  visitas: ['visitaEn', 'registradoEn'],
  registrados: ['registradoEn'],
}

/**
 * Las personas de UNA tarjeta del embudo, con el MISMO criterio que la cifra (`embudoCampana`): salió
 * (no `fallido`) y su etapa más avanzada es ≥ la del paso (cada etapa implica las anteriores, así que
 * «Abiertos» incluye a quien hizo clic). Una fila por persona (la campaña es única por persona).
 * Orden: evento del paso más reciente primero.
 */
export function personasDelPaso(personas: readonly PersonaCampana[], clave: string, independiente = false): PersonaCampana[] {
  const nivel = NIVEL_PASO[clave]
  if (nivel === undefined) return []
  // Paso independiente: solo quien tiene SU evento (no se deduce de la etapa).
  const propio = EVENTOS_PASO[clave]?.[0]
  return personas
    .filter((p) => p.etapa !== 'fallido' && (independiente ? propio !== undefined && typeof p[propio] === 'string' && p[propio] !== '' : NIVEL_ETAPA[p.etapa] >= nivel))
    .sort((a, b) => (fechaDelPaso(b, clave)?.iso ?? '').localeCompare(fechaDelPaso(a, clave)?.iso ?? ''))
}

/**
 * Fecha del evento del paso. Si el propio no consta pero otro posterior lo implica (p. ej. clic sin
 * apertura registrada), se da la fecha de ese y `inferido: true`. `null` = sin fecha: no se inventa.
 */
export function fechaDelPaso(p: PersonaCampana, clave: string, independiente = false): { iso: string; inferido: boolean } | null {
  const todos = EVENTOS_PASO[clave] ?? []
  const campos = independiente ? todos.slice(0, 1) : todos
  for (const [i, c] of campos.entries()) {
    const v = p[c]
    if (typeof v === 'string' && v) return { iso: v, inferido: i > 0 }
  }
  return null
}

export const ETIQUETA_ETAPA: Record<EtapaPersona, string> = {
  fallido: 'No salió',
  sin_datos: 'Enviado (sin datos)',
  enviado: 'Enviado',
  entregado: 'Entregado',
  abierto: 'Abierto',
  clic: 'Clic',
  visita: 'Visita',
  registrado: 'Registrado',
}

/** Estado a mostrar: rebote y baja pesan más que la etapa alcanzada. */
export function estadoPersona(p: Pick<PersonaCampana, 'etapa' | 'bajaEn' | 'rebotadoEn'>): string {
  if (p.rebotadoEn) return 'Rebotado'
  if (p.bajaEn) return 'Baja'
  return ETIQUETA_ETAPA[p.etapa]
}

// ─── Red (solo desde la ruta API de plataforma) ──────────────────────────────

export type Reenvio = { status: number; json: unknown }

/** Cómo se presenta una campaña: textos de los bloques de grupos y la forma de su embudo. */
export type DefCampana = {
  id: string; titulo: string; sub: string
  forma?: FormaEmbudo
  /** Título del bloque por «variante» y por «lote», y cómo se nombran en cada persona. */
  tituloVariantes?: string; tituloLotes?: string; etiquetaLote?: string
}

/**
 * Las campañas que la pantalla sabe pedir. Mismos ids que asegura (`campana_envio.campana`; `felicitacion` es la
 * tabla de felicitaciones de cumpleaños, que asegura lee aparte).
 */
export const CAMPANAS_CORREO = [
  { id: 'presentacion_app', titulo: 'Presentación app (leads)', sub: 'Correo de presentación de la app a los leads antiguos. Solo lectura: el envío lo hace el cron de asegura.' },
  { id: 'aviso_venc_app', titulo: 'App en el aviso de vencimiento', sub: 'Bloque «Tu app gratuita» dentro del aviso de vencimiento a clientes en vigor que aún no entran al portal. Sin eventos de apertura/clic: cuenta visitas y altas por el enlace personal.' },
  {
    id: 'felicitacion', titulo: 'Felicitaciones de cumpleaños',
    sub: 'Felicitaciones por correo a clientes en vigor y ex-clientes, usadas como sonda del email de la ficha: quien rebota tiene el email malo (no es una baja). «Entró al portal» = entró en los 7 días siguientes, haya pinchado o no el correo.',
    forma: { etiquetas: { enviados: 'Felicitados', visitas: 'Entró al portal (≤7 días)', registrados: null }, independientes: ['visitas'] },
    tituloVariantes: 'Clientes en vigor frente a ex-clientes', tituloLotes: 'Por año', etiquetaLote: 'año',
  },
] as const satisfies readonly DefCampana[]
export type IdCampana = (typeof CAMPANAS_CORREO)[number]['id']

/** `null` = no es una campaña conocida (la ruta responde 400; nunca se reenvía texto libre). */
export function campanaDeParametro(v: string | null | undefined): IdCampana | null {
  if (v === null || v === undefined || v === '') return 'presentacion_app'
  return CAMPANAS_CORREO.some((c) => c.id === v) ? (v as IdCampana) : null
}

export async function campanaPresentacionAsegura(campana: IdCampana = 'presentacion_app'): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  const h = secret ? await cabecerasPuerto(secret) : null
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/operador/campana/presentacion-app?campana=${encodeURIComponent(campana)}`, {
      method: 'GET', headers: h, cache: 'no-store', signal: AbortSignal.timeout(30_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
