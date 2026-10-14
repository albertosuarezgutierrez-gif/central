// «Escanear un documento» (13/10/2026): el cliente fotografía un recibo o una carta de su
// compañía; una IA lo CLASIFICA, lee fecha e importe y PROPONE a qué póliza suya va. El cliente
// confirma antes de archivar. Este fichero es PURO (sin red, sin BD, sin `core-ai`, que no
// se resuelve bajo `node --test`): la llamada a la IA vive en `escaner-documento-ia.ts`.
//
// Reglas que lo sostienen:
//   · Lo leído tiene procedencia `documento`, NUNCA `compania`: lo ha leído una IA de una foto.
//   · Valores de cajón ('N/A', 'no consta', '0000000') se anulan: `null` = «no se leyó», no un dato.
//   · La propuesta de póliza es una PROPUESTA: sin coincidencia clara es `null` y elige la persona.
//     Ante dos candidatas igual de buenas tampoco se adivina.
//   · La póliza candidata es SIEMPRE de la identidad (la lista la construye la ruta desde su cartera).

// Sin importar `poliza-editable`: bajo `node --test` un import relativo sin extensión no resuelve.
// Mismo criterio que `esCentinelaSinDato`: vacío, solo signos, o un solo carácter repetido ('0000000').
function esCentinelaSinDato(valor: string): boolean {
  const compacto = valor.trim().toLowerCase().replace(/[\s.\-–—_/]/g, '')
  return compacto === '' || (compacto.length >= 2 && new Set(compacto).size === 1)
}

export const TIPOS_ESCANER = ['recibo', 'renovacion', 'carta_impago', 'cambio_condiciones', 'otro'] as const
export type TipoEscaner = (typeof TIPOS_ESCANER)[number]

export const ETIQUETA_TIPO_ESCANER: Record<TipoEscaner, string> = {
  recibo: 'Recibo',
  renovacion: 'Renovación',
  carta_impago: 'Carta de impago',
  cambio_condiciones: 'Cambio de condiciones',
  otro: 'Otro documento',
}

/** Qué se ha leído de un documento. Todo lo que no se sabe es `null` (nunca 0, '' ni 'otro' de cajón). */
export type LecturaEscaner = {
  /** `null` = la IA no dijo nada utilizable; la persona elige. NO se asume 'otro'. */
  tipo: TipoEscaner | null
  /** `YYYY-MM-DD` real. */
  fecha: string | null
  /** Euros, > 0. */
  importe: number | null
  compania: string | null
  numeroPoliza: string | null
  /** Siempre `documento`: lo ha leído una IA de un papel, no lo ha confirmado la compañía. */
  procedencia: 'documento'
}

export function lecturaVacia(): LecturaEscaner {
  return { tipo: null, fecha: null, importe: null, compania: null, numeroPoliza: null, procedencia: 'documento' }
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' || esCentinelaSinDato(t) || /^(no consta|n\/?a|null|desconocid[oa]|sin dato|ninguno)$/i.test(t) ? null : t
}

function fechaIso(v: unknown): string | null {
  const t = texto(v)
  if (t === null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) return null
  const d = new Date(`${t}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t
}

function importe(v: unknown): number | null {
  let n: number
  if (typeof v === 'number') n = v
  else {
    const t = texto(v)
    if (t === null) return null
    const limpio = t.replace(/[€\s]|eur(os)?/gi, '')
    // «1.234,56» (es) y «1234.56» (en): si hay coma, es el decimal y los puntos son miles.
    n = Number(limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio)
  }
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null
  return Math.round(n * 100) / 100
}

function tipoEscaner(v: unknown): TipoEscaner | null {
  const t = texto(v)?.toLowerCase().replace(/[\s-]+/g, '_') ?? null
  return t !== null && (TIPOS_ESCANER as readonly string[]).includes(t) ? (t as TipoEscaner) : null
}

/** Lo que dijo la IA (ya parseado de JSON) → lectura segura. No lanza con basura. */
export function normalizarLecturaEscaner(bruto: unknown): LecturaEscaner {
  if (typeof bruto !== 'object' || bruto === null) return lecturaVacia()
  const o = bruto as Record<string, unknown>
  return {
    tipo: tipoEscaner(o.tipo),
    fecha: fechaIso(o.fecha),
    importe: importe(o.importe),
    compania: texto(o.compania),
    numeroPoliza: texto(o.numeroPoliza),
    procedencia: 'documento',
  }
}

export type PolizaCandidata = { id: string; compania: string | null; numeroPoliza: string | null }
export type PropuestaPoliza = { polizaId: string | null; motivo: 'numero' | 'compania' | 'ambigua' | 'sin_coincidencia' }

const compacto = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const sinAcentos = (s: string | null) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * A qué póliza propia parece ir. Primero el NÚMERO de póliza (coincidencia exacta tras quitar
 * separadores, mínimo 5 caracteres para no casar «1»); si no, la COMPAÑÍA, pero solo si hay UNA
 * candidata de esa compañía. Dos candidatas posibles → `ambigua` y `polizaId: null`.
 */
export function proponerPoliza(lectura: Pick<LecturaEscaner, 'compania' | 'numeroPoliza'>, candidatas: readonly PolizaCandidata[]): PropuestaPoliza {
  const num = compacto(lectura.numeroPoliza)
  if (num.length >= 5) {
    const porNumero = candidatas.filter((c) => compacto(c.numeroPoliza) === num)
    if (porNumero.length === 1) return { polizaId: porNumero[0]!.id, motivo: 'numero' }
    if (porNumero.length > 1) return { polizaId: null, motivo: 'ambigua' }
  }
  const comp = sinAcentos(lectura.compania)
  if (comp.length >= 3) {
    const porCompania = candidatas.filter((c) => {
      const cc = sinAcentos(c.compania)
      return cc.length >= 3 && (cc === comp || cc.includes(comp) || comp.includes(cc))
    })
    if (porCompania.length === 1) return { polizaId: porCompania[0]!.id, motivo: 'compania' }
    if (porCompania.length > 1) return { polizaId: null, motivo: 'ambigua' }
  }
  return { polizaId: null, motivo: 'sin_coincidencia' }
}

/** Una carta de impago pide avisar al corredor. Solo la decide el TIPO que confirmó la persona. */
export function esCartaImpago(tipo: unknown): boolean {
  return tipo === 'carta_impago'
}

/** Nombre del fichero archivado: dice qué es y de qué póliza, porque el puente no guarda el vínculo. */
export function nombreDeArchivo(a: {
  tipo: TipoEscaner
  compania: string | null
  numeroPoliza: string | null
  fecha: string | null
  extension: string
}): string {
  const limpia = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  const partes = [ETIQUETA_TIPO_ESCANER[a.tipo], a.compania && limpia(a.compania), a.numeroPoliza && limpia(a.numeroPoliza), a.fecha]
    .filter((x): x is string => typeof x === 'string' && x !== '')
  const ext = a.extension.replace(/[^a-z0-9]/gi, '').slice(0, 5).toLowerCase()
  return `${partes.join(' - ').slice(0, 120)}${ext ? `.${ext}` : ''}`
}

/** Texto de Telegram al corredor. Lleva identidad (como el resto de avisos del portal); sin importes. */
export function textoAvisoImpago(c: { identidadId: string; clienteNombre: string | null; compania: string | null; numeroPoliza: string | null; fecha: string | null }): string {
  const quien = c.clienteNombre ?? 'una identidad SIN vincular a tu cartera'
  const pol = c.numeroPoliza ? `, póliza ${c.numeroPoliza}` : ''
  return `⚠️ Carta de IMPAGO escaneada por ${quien}${c.compania ? ` (${c.compania}${pol})` : ''}${c.fecha ? `, fechada ${c.fecha}` : ''}.\nContáctale.\nIdentidad ${c.identidadId}`
}

/** Aviso visible al cliente tras archivar una carta de impago. */
export const AVISO_CARTA_IMPAGO = 'Contacta con tu corredor: una carta de impago puede acabar en la baja de la póliza.'

/**
 * Tope por identidad y DÍA de Madrid (cada escaneo = una llamada de IA sobre un fichero de hasta 10 MB).
 * Se cuenta en BD (`portal_aviso_leido`, claves `escaner:<AAAA-MM-DD>:<uuid>`, como `lib/captacion-declarada.ts`):
 * un contador en memoria se reinicia en cada instancia de Vercel y no es un tope real.
 */
export const MAX_ESCANEOS_POR_DIA = 15
export const PREFIJO_ESCANEO = 'escaner:'

/** `escaner:2026-10-13:` — el día es el de Madrid, no el UTC (el cupo se renueva a medianoche del cliente). */
export function prefijoEscaneosDelDia(ahora: Date): string {
  const dia = ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  return `${PREFIJO_ESCANEO}${dia}:`
}

export function claveEscaneo(ahora: Date, id: string): string {
  return `${prefijoEscaneosDelDia(ahora)}${id}`
}

/** Cupo diario de ARCHIVADOS (paso 2), aparte del de lecturas con IA. Prefijo distinto: no se pisan. */
export const MAX_ARCHIVOS_POR_DIA = 30
export const PREFIJO_ARCHIVO = 'escaner-archivo:'

export function prefijoArchivosDelDia(ahora: Date): string {
  return `${PREFIJO_ARCHIVO}${ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })}:`
}
