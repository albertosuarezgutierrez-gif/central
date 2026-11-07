// Seguro OBLIGATORIO por convenio (migración 0036, `rrhh.convenio_seguros_obligatorios`). Reglas PURAS: validar la obligación
// que mete a mano el responsable (con su artículo y su enlace al BOE/boletín), validar lo que declara sobre su póliza, decidir
// en qué situación está, y montar el lead que se manda a la correduría (Grupo ASegura) cuando él lo pide.
//
// 🚨 Tres estados en la cobertura: `null` = NO SE SABE (nadie ha contestado) ≠ 'no_cubierto' (ha dicho que no) ≠ 'cubierto'.
//    Nunca se pinta verde sin un 'cubierto' explícito; un 'cubierto' con el vencimiento pasado no cuenta como cubierto.
// 🚨 El lead SOLO sale cuando el responsable pulsa el botón y marca la casilla de consentimiento (no premarcada). Nada de
//    aquí envía correo ni mensaje a nadie: el lead lo registra plataforma y quien decide contactar es Alberto.

export const TIPOS_SEGURO = ['accidentes', 'vida', 'otro'] as const
export type TipoSeguroConvenio = (typeof TIPOS_SEGURO)[number]
export const CONTINGENCIAS = ['muerte', 'ip_total', 'ip_absoluta', 'gran_invalidez'] as const
export type Contingencia = (typeof CONTINGENCIAS)[number]

export const ETIQUETA_TIPO: Record<TipoSeguroConvenio, string> = { accidentes: 'accidentes', vida: 'vida', otro: 'otro tipo' }
export const ETIQUETA_CONTINGENCIA: Record<Contingencia, string> = {
  muerte: 'muerte',
  ip_total: 'incapacidad permanente total',
  ip_absoluta: 'incapacidad permanente absoluta',
  gran_invalidez: 'gran invalidez',
}

export type EstadoCobertura = 'cubierto' | 'no_cubierto' | null

export interface ObligacionSeguro {
  convenio: string
  tipo: TipoSeguroConvenio
  contingencias: Contingencia[]
  capitalCent: number
  ambito: 'todas' | 'algunas'
  /** null con ámbito 'todas'. */
  categorias: string[] | null
  articulo: string
  fuenteUrl: string
  /** YYYY-MM-DD */
  vigenteDesde: string
  /** YYYY-MM-DD; null = sin fin conocido. */
  vigenteHasta: string | null
}

export interface Cobertura {
  estado: EstadoCobertura
  aseguradora: string | null
  poliza: string | null
  /** YYYY-MM-DD; null = no se sabe. */
  vencimiento: string | null
}

export type ObligacionConCobertura = ObligacionSeguro & { id: string; cobertura: Cobertura }

/** Error con mensaje para el usuario (las acciones lo devuelven tal cual; el resto de errores, genérico). */
export class ErrorSeguroConvenio extends Error {
  constructor(m: string) { super(m); this.name = 'ErrorSeguroConvenio' }
}

const txt = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')
const RE_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
function fecha(v: unknown): string | null {
  const s = txt(v)
  if (!RE_FECHA.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

/** «30.000» / «30000,50» / 30000 → céntimos enteros. Sin float para el texto. */
export function eurosACentimos(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null
  if (typeof v !== 'string') return null
  let t = v.trim().replace(/\s|€/g, '')
  if (!t) return null
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '')
  const m = t.match(/^(\d+)(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const cent = Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'))
  return Number.isSafeInteger(cent) ? cent : null
}

/** Céntimos → «30.000,00€» (punto de miles también en 4 cifras, coma decimal, € detrás). */
export function eurCentimos(c: number): string {
  return `${(c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)}€`
}

/** Valida la obligación del formulario. Lanza `ErrorSeguroConvenio` con un mensaje legible. */
export function parsearObligacion(b: Record<string, unknown>): ObligacionSeguro {
  const convenio = txt(b.convenio)
  if (!convenio || convenio.length > 200) throw new ErrorSeguroConvenio('Indica el convenio')
  const tipo = txt(b.tipo) as TipoSeguroConvenio
  if (!TIPOS_SEGURO.includes(tipo)) throw new ErrorSeguroConvenio('Elige el tipo de seguro')
  const lista = Array.isArray(b.contingencias) ? b.contingencias.map(txt) : []
  const contingencias = CONTINGENCIAS.filter(c => lista.includes(c))
  if (contingencias.length === 0 || contingencias.length !== new Set(lista).size) throw new ErrorSeguroConvenio('Marca al menos una contingencia válida')
  const capitalCent = eurosACentimos(b.capital)
  if (capitalCent === null || capitalCent <= 0 || capitalCent > 100_000_000_000) throw new ErrorSeguroConvenio('Capital inválido')
  const ambito = txt(b.ambito)
  if (ambito !== 'todas' && ambito !== 'algunas') throw new ErrorSeguroConvenio('Indica a qué categorías obliga')
  let categorias: string[] | null = null
  if (ambito === 'algunas') {
    const crudas = Array.isArray(b.categorias) ? b.categorias : typeof b.categorias === 'string' ? b.categorias.split(/[\n;]/) : []
    const vistas = new Set<string>()
    categorias = []
    for (const c of crudas.map(txt)) {
      if (!c) continue
      if (c.length > 200) throw new ErrorSeguroConvenio('Categoría demasiado larga')
      const k = c.toLowerCase()
      if (!vistas.has(k)) { vistas.add(k); categorias.push(c) }
    }
    if (categorias.length === 0 || categorias.length > 50) throw new ErrorSeguroConvenio('Indica las categorías a las que obliga (una por línea)')
  }
  const articulo = txt(b.articulo)
  if (!articulo || articulo.length > 200) throw new ErrorSeguroConvenio('Indica el artículo del convenio')
  const fuenteUrl = txt(b.fuenteUrl)
  let url: URL | null = null
  try { url = new URL(fuenteUrl) } catch { url = null }
  if (!url || url.protocol !== 'https:' || /\s/.test(fuenteUrl) || fuenteUrl.length > 1000 || url.username || url.password) {
    throw new ErrorSeguroConvenio('Pega el enlace https del BOE o boletín donde lo dice')
  }
  const vigenteDesde = fecha(b.vigenteDesde)
  if (!vigenteDesde) throw new ErrorSeguroConvenio('Fecha de inicio de vigencia inválida')
  let vigenteHasta: string | null = null
  if (txt(b.vigenteHasta) !== '') {
    vigenteHasta = fecha(b.vigenteHasta)
    if (!vigenteHasta) throw new ErrorSeguroConvenio('Fecha de fin de vigencia inválida')
    if (vigenteHasta < vigenteDesde) throw new ErrorSeguroConvenio('La vigencia termina antes de empezar')
  }
  return { convenio, tipo, contingencias, capitalCent, ambito, categorias, articulo, fuenteUrl, vigenteDesde, vigenteHasta }
}

/** Valida lo que declara la empresa sobre su póliza. `estado` vacío = vuelve a «no se sabe». */
export function parsearCobertura(b: Record<string, unknown>): Cobertura {
  const e = txt(b.estado)
  if (e === '') return { estado: null, aseguradora: null, poliza: null, vencimiento: null }
  if (e === 'no_cubierto') return { estado: 'no_cubierto', aseguradora: null, poliza: null, vencimiento: null }
  if (e !== 'cubierto') throw new ErrorSeguroConvenio('Respuesta inválida')
  const aseguradora = txt(b.aseguradora)
  if (!aseguradora || aseguradora.length > 200) throw new ErrorSeguroConvenio('Indica la aseguradora de la póliza')
  const poliza = txt(b.poliza) || null
  if (poliza && poliza.length > 100) throw new ErrorSeguroConvenio('Número de póliza demasiado largo')
  let vencimiento: string | null = null
  if (txt(b.vencimiento) !== '') {
    vencimiento = fecha(b.vencimiento)
    if (!vencimiento) throw new ErrorSeguroConvenio('Fecha de vencimiento inválida')
  }
  return { estado: 'cubierto', aseguradora, poliza, vencimiento }
}

/** ¿Obliga hoy? (`hoy` YYYY-MM-DD, inyectado). */
export function vigenteEn(o: Pick<ObligacionSeguro, 'vigenteDesde' | 'vigenteHasta'>, hoy: string): boolean {
  return o.vigenteDesde <= hoy && (o.vigenteHasta === null || o.vigenteHasta >= hoy)
}

export type Situacion = 'no_se_sabe' | 'no_cubierto' | 'cubierto' | 'cubierto_vencido'

/** Situación de una obligación. Un 'cubierto' con vencimiento pasado NO es cubierto; sin vencimiento conocido, sí (lo dijo la empresa). */
export function situacionCobertura(c: Cobertura, hoy: string): Situacion {
  if (c.estado === null) return 'no_se_sabe'
  if (c.estado === 'no_cubierto') return 'no_cubierto'
  return c.vencimiento !== null && c.vencimiento < hoy ? 'cubierto_vencido' : 'cubierto'
}

function unirY(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  const ultimo = xs[xs.length - 1]
  return `${xs.slice(0, -1).join(', ')} ${/^h?i/i.test(ultimo) ? 'e' : 'y'} ${ultimo}`
}

/** «un seguro de accidentes por 30.000,00€ (muerte e incapacidad permanente absoluta)». */
export function fraseObligacion(o: Pick<ObligacionSeguro, 'tipo' | 'capitalCent' | 'contingencias'>): string {
  const cont = unirY(o.contingencias.map(c => ETIQUETA_CONTINGENCIA[c]))
  const tipo = o.tipo === 'otro' ? 'un seguro' : `un seguro de ${ETIQUETA_TIPO[o.tipo]}`
  return `${tipo} por ${eurCentimos(o.capitalCent)} (${cont})`
}

// ─── Lead a la correduría ─────────────────────────────────────────────────────

/** Versión del texto de consentimiento que ve el responsable (se guarda en `rrhh.leads_correduria`). Cambia el texto → cambia la versión. */
export const CONSENTIMIENTO_LEAD_VERSION = 'rrhh-seguro-convenio-2026-11-07'
export const TEXTO_CONSENTIMIENTO_LEAD =
  'Acepto que se envíen a Grupo ASegura (correduría de seguros) mi nombre, mi correo y mi teléfono, el nombre y NIF de la empresa, ' +
  'el convenio, el seguro que exige y el número de trabajadores afectados, para que revise si la empresa lo tiene cubierto y me ' +
  'contacte con una propuesta. No se envía ningún dato personal de los trabajadores.'

/** Nº de trabajadores afectados. `sinCategoria` = activos cuya categoría no consta (no se sabe si les afecta). null = no se ha podido contar. */
export type Afectados = { afectados: number; sinCategoria: number } | null

export function textoAfectados(a: Afectados): string {
  if (a === null) return 'nº de trabajadores afectados: no se ha podido contar'
  const base = `${a.afectados} ${a.afectados === 1 ? 'trabajador afectado' : 'trabajadores afectados'}`
  return a.sinCategoria > 0 ? `${base} (+${a.sinCategoria} sin categoría registrada: no se sabe)` : base
}

/** Lo que se pidió revisar, SIN datos personales (va a `rrhh.leads_correduria.resumen` y al comentario del lead). */
export function resumenLead(d: { empresa: string; nif: string | null; o: ObligacionSeguro; afectados: Afectados }): string {
  const ambito = d.o.ambito === 'todas' ? 'todas las categorías' : `categorías: ${(d.o.categorias ?? []).join(', ')}`
  return [
    `Revisión de seguro obligatorio por convenio (desde iarrhh).`,
    `Empresa: ${d.empresa}${d.nif ? ` (NIF ${d.nif})` : ''}.`,
    `Convenio: ${d.o.convenio}, ${d.o.articulo}.`,
    `Exige ${fraseObligacion(d.o)}; ${ambito}.`,
    `${textoAfectados(d.afectados)}.`,
    `Fuente: ${d.o.fuenteUrl}`,
  ].join(' ').slice(0, 1000)
}

/** Tipo de seguro del CONTRATO de leads de plataforma (`TIPOS_SEGURO_LEAD` de apps/plataforma/lib/leads-web.ts). */
export function tipoSeguroLead(t: TipoSeguroConvenio): 'vida' | 'comercio' {
  return t === 'vida' ? 'vida' : 'comercio'
}

export type ContactoLead = { nombre: string; email: string | null; telefono: string | null }

/**
 * Cuerpo para `POST /api/publico/correduria/lead` de plataforma (el MISMO contrato que el formulario de grupoasegura.es,
 * `revisarLeadWeb`). `consentimiento: true` solo si la casilla se marcó (la acción lo exige antes). `consentimiento_version`
 * NO se manda: ese campo es la versión de la política de la web pública y aquí el texto es otro; nuestra versión viaja en el
 * comentario y queda en `rrhh.leads_correduria`. `comunicaciones_comerciales` tampoco (no se ha preguntado: null ≠ false).
 */
export function cuerpoLead(contacto: ContactoLead, tipo: TipoSeguroConvenio, resumen: string): Record<string, unknown> {
  const pie = ` Consentimiento en iarrhh: ${CONSENTIMIENTO_LEAD_VERSION}.`
  return {
    nombre: contacto.nombre,
    apellidos: '',
    telefono: contacto.telefono ?? '',
    email: contacto.email ?? '',
    tipoSeguro: tipoSeguroLead(tipo),
    comentario: `${resumen.slice(0, 1000 - pie.length)}${pie}`,
    consentimiento: true,
    atribucion: { utm_source: 'iarrhh', utm_medium: 'app', utm_campaign: 'seguro-convenio', landing: '/admin/nominas/convenio/seguro' },
  }
}

export type ResultadoLead = { estado: 'enviado' | 'error' | 'rechazado'; detalle: string; mensaje: string }

/** Respuesta de plataforma → estado de la fila y mensaje al usuario. `status` 0 = no llegó (red/timeout). */
export function interpretarRespuestaLead(status: number, json: unknown): ResultadoLead {
  const j = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const motivo = typeof j.motivo === 'string' ? j.motivo.slice(0, 200) : null
  if (status >= 200 && status < 300 && j.ok === true) {
    return { estado: 'enviado', detalle: `${status}`, mensaje: 'Hecho: Grupo ASegura ha recibido tu petición y te contactará.' }
  }
  if (status === 422) {
    return { estado: 'rechazado', detalle: `422${motivo ? `: ${motivo}` : ''}`.slice(0, 300), mensaje: motivo ?? 'Revisa tus datos de contacto.' }
  }
  if (status === 0) return { estado: 'error', detalle: 'sin respuesta', mensaje: 'No se ha podido enviar ahora mismo. Inténtalo de nuevo en unos minutos.' }
  return { estado: 'error', detalle: `${status}`, mensaje: status === 429 ? 'Demasiadas peticiones desde esta conexión. Inténtalo más tarde.' : 'No se ha podido enviar ahora mismo. Inténtalo de nuevo en unos minutos.' }
}
