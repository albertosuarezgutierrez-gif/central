// Expediente de un siniestro (hilo con la compañía, plazos, espera). PURO: sin red ni env, lo importan
// los client components. Reglas: `mensajes: null` = «no se pudo leer» ≠ `[]` = «sin mensajes»;
// plazo con `fecha`/`diasRestantes` null = «falta la fecha base», NUNCA 0.

export type AutorMensaje = 'compania' | 'ia' | 'corredor' | 'interna'
export type TipoMensaje = 'comentario' | 'rehuse' | 'analisis' | 'borrador' | 'enviado' | 'nota'

export type Mensaje = {
  id: string
  autor: AutorMensaje
  tipo: TipoMensaje
  /** `null` solo con `textoIlegible` (no se pudo descifrar). */
  texto: string | null
  textoIlegible: boolean
  documentoId: string | null
  creadoPor: string | null
  creadoAt: string | null
  meta: Record<string, unknown> | null
  /** Id del mensaje que SUSTITUYE a este (edición = versión nueva). `null` = es la versión vigente. */
  sustituidoPor: string | null
}

export type Plazo = {
  clave: string
  etiqueta: string
  fecha: string | null
  diasRestantes: number | null
  baseLegal: string | null
  verificado: boolean
  /** Por qué falta la fecha o qué se ha supuesto. */
  nota: string | null
}

export type DocPoliza = { id: string; tipo: string; nombre: string | null }

export type HiloSiniestro = {
  siniestro: Record<string, unknown> | null
  poliza: { id: string; numero: string | null; compania: string | null; ramo: string | null; documentos: DocPoliza[] } | null
  documentosSiniestro: unknown[] | null
  mensajes: Mensaje[] | null
  plazos: Plazo[] | null
  diasEsperandoCompania: number | null
  /** `null` = el hilo no trae partes del portal (sin bloque); `[]` = el cliente no ha comunicado nada. */
  partesPortal: PartePortal[] | null
}

export type Esperando = { siniestroId: string; clienteId: string | null; polizaNumero: string | null; dias: number }

const AUTORES: readonly AutorMensaje[] = ['compania', 'ia', 'corredor', 'interna']
const TIPOS: readonly TipoMensaje[] = ['comentario', 'rehuse', 'analisis', 'borrador', 'enviado', 'nota']

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function leerMensaje(v: unknown): Mensaje | null {
  const o = obj(v)
  if (!o || !str(o.id)) return null
  const autor = AUTORES.find(a => a === o.autor)
  const tipo = TIPOS.find(t => t === o.tipo)
  const ilegible = o.textoIlegible === true
  if (!autor || !tipo || (typeof o.texto !== 'string' && !ilegible)) return null
  return { id: o.id as string, autor, tipo, texto: typeof o.texto === 'string' ? o.texto : null, textoIlegible: ilegible, documentoId: str(o.documentoId), creadoPor: str(o.creadoPor), creadoAt: str(o.creadoAt), meta: obj(o.meta), sustituidoPor: str(o.sustituidoPor) }
}

/** `null` = no es un array legible (no se pudo leer); un elemento ilegible se descarta. */
export function leerMensajes(v: unknown): Mensaje[] | null {
  if (!Array.isArray(v)) return null
  return v.map(leerMensaje).filter((m): m is Mensaje => m !== null)
}

export function leerPlazos(v: unknown): Plazo[] | null {
  if (!Array.isArray(v)) return null
  const out: Plazo[] = []
  for (const x of v) {
    const o = obj(x)
    if (!o || !str(o.clave)) continue
    out.push({
      clave: o.clave as string, etiqueta: str(o.etiqueta) ?? (o.clave as string), fecha: str(o.fecha), diasRestantes: num(o.diasRestantes),
      baseLegal: str(o.base_legal) ?? str(o.baseLegal), verificado: o.verificado === true, nota: str(o.nota),
    })
  }
  return out
}

export function leerHilo(v: unknown): HiloSiniestro | null {
  const o = obj(v)
  if (!o || (o.estado !== undefined && o.estado !== 'ok')) return null
  const p = obj(o.poliza)
  return {
    siniestro: obj(o.siniestro),
    poliza: p && str(p.id)
      ? {
          id: p.id as string, numero: str(p.numero), compania: str(p.compania), ramo: str(p.ramo),
          documentos: Array.isArray(p.documentos)
            ? p.documentos.flatMap(d => { const x = obj(d); return x && str(x.id) ? [{ id: x.id as string, tipo: str(x.tipo) ?? 'documento', nombre: str(x.nombre) }] : [] })
            : [],
        }
      : null,
    documentosSiniestro: Array.isArray(o.documentosSiniestro) ? o.documentosSiniestro : null,
    mensajes: leerMensajes(o.mensajes),
    plazos: leerPlazos(o.plazos),
    diasEsperandoCompania: num(o.diasEsperandoCompania),
    partesPortal: leerPartesPortal(o.partesPortal),
  }
}

export function leerEsperando(v: unknown): Esperando[] | null {
  // El puerto devuelve el array tal cual en 200; un error (500/503) es un objeto y NUNCA se lee como lista vacía.
  const lista = Array.isArray(v) ? v : null
  if (!lista) return null
  const out: Esperando[] = []
  for (const x of lista) {
    const o = obj(x)
    const dias = o ? num(o.dias) : null
    if (!o || !str(o.siniestroId) || dias === null) continue
    out.push({ siniestroId: o.siniestroId as string, clienteId: str(o.clienteId), polizaNumero: str(o.polizaNumero), dias })
  }
  return out.sort((a, b) => b.dias - a.dias)
}

/** «hace 1 día» / «hace 12 días». `null` = no se sabe (no 0). */
export function textoDias(n: number | null): string {
  if (n === null) return 'sin fecha base'
  if (n === 0) return 'hoy'
  return n === 1 ? '1 día' : `${n} días`
}

export const UMBRAL_PLAZO_ROJO = 15
export const UMBRAL_ESPERA_DESTACADA = 15

export type EstadoPlazo = { texto: string; tono: 'neutral' | 'malo'; aviso: string | null }

export function estadoPlazo(p: Plazo): EstadoPlazo {
  const aviso = p.verificado ? null : 'plazo pendiente de verificar'
  if (p.fecha === null || p.diasRestantes === null) return { texto: 'falta la fecha base', tono: 'neutral', aviso }
  const d = p.diasRestantes
  const texto = d < 0 ? `vencido hace ${textoDias(-d)}` : d === 0 ? 'vence hoy' : `quedan ${textoDias(d)}`
  return { texto, tono: d < UMBRAL_PLAZO_ROJO ? 'malo' : 'neutral', aviso }
}

/** Mensaje de error para el corredor a partir de la respuesta del puerto (`sin_migracion` = BD sin la tabla del hilo). */
export function motivoFallo(status: number, j: unknown): string {
  const o = obj(j)
  if (o?.estado === 'sin_migracion') return 'El hilo aún no está activado en la base de datos'
  return str(o?.motivo) ?? `error ${status}`
}

/** Citas de la póliza que la IA mencionó y NO aparecen en el documento (aviso a resaltar). */
export function citasNoEncontradas(meta: Record<string, unknown> | null): string[] {
  const citas = obj(meta?.citas)
  const l = citas?.noEncontradas
  return Array.isArray(l) ? l.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).filter(x => x !== '') : []
}

export const LIMITE_PLEGADO = 600

export function plegarTexto(texto: string, abierto: boolean, limite = LIMITE_PLEGADO): { visible: string; plegado: boolean } {
  if (abierto || texto.length <= limite) return { visible: texto, plegado: false }
  return { visible: texto.slice(0, limite).trimEnd() + '…', plegado: true }
}

export const ETIQUETA_AUTOR: Record<AutorMensaje, string> = { compania: 'Compañía', ia: 'IA', corredor: 'Alberto', interna: 'Nota interna' }

export type ModoCaja = 'compania' | 'rehuse' | 'enviado' | 'interna'

/** Combinaciones autor/tipo que acepta el puerto: `enviado` solo del corredor, `rehuse` solo de la compañía. */
export function combinacionValida(autor: AutorMensaje, tipo: TipoMensaje): boolean {
  if (tipo === 'enviado') return autor === 'corredor'
  if (tipo === 'rehuse') return autor === 'compania'
  if (tipo === 'analisis') return autor === 'ia'
  return true
}

/** Qué se guarda según el selector de la caja. `reclamacionSac` solo cuenta con «enviado». */
export function cuerpoCaja(modo: ModoCaja, texto: string, documentoId: string | null, reclamacionSac = false, sustituyeA: string | null = null): {
  autor: AutorMensaje; tipo: TipoMensaje; texto: string; documentoId?: string; reclamacionSac?: boolean; sustituyeA?: string
} {
  const base = { texto: texto.trim(), ...(documentoId ? { documentoId } : {}), ...(sustituyeA ? { sustituyeA } : {}) }
  if (modo === 'compania') return { autor: 'compania', tipo: 'comentario', ...base }
  if (modo === 'rehuse') return { autor: 'compania', tipo: 'rehuse', ...base }
  if (modo === 'enviado') return { autor: 'corredor', tipo: 'enviado', ...base, ...(reclamacionSac ? { reclamacionSac: true } : {}) }
  return { autor: 'interna', tipo: 'nota', ...base }
}

// ─── Versiones: editar = mensaje nuevo que sustituye al anterior (el hilo es SOLO-AÑADIR) ─────────────────────

export type MensajeVisible = { mensaje: Mensaje; /** Sustituye a otra versión. */ editado: boolean; /** Ya hay una versión posterior (solo se ve con «Ver versiones anteriores»). */ sustituido: boolean }

/**
 * Qué se pinta. Por defecto solo las vigentes (las sustituidas fuera) con `editado` si sustituyen a otra;
 * `verAnteriores` deja también las sustituidas (`sustituido: true`, para pintarlas atenuadas). Orden: el recibido.
 * Una versión que sustituye a un id que no está en la lista cuenta como editada igualmente (`meta.sustituyeA`).
 */
export function mensajesVisibles(mensajes: readonly Mensaje[], verAnteriores: boolean): MensajeVisible[] {
  const ids = new Set(mensajes.map(m => m.id))
  const sustituidosPorMeta = new Set<string>()
  for (const m of mensajes) {
    const a = str(m.meta?.sustituyeA)
    if (a !== null && a !== m.id && ids.has(a)) sustituidosPorMeta.add(a)
  }
  const out: MensajeVisible[] = []
  for (const m of mensajes) {
    const sustituido = m.sustituidoPor !== null || sustituidosPorMeta.has(m.id)
    if (sustituido && !verAnteriores) continue
    out.push({ mensaje: m, editado: str(m.meta?.sustituyeA) !== null, sustituido })
  }
  return out
}

/** Cuántas versiones sustituidas hay (para mostrar el conmutador solo si hace falta). */
export function cuentaSustituidos(mensajes: readonly Mensaje[]): number {
  return mensajes.filter(m => m.sustituidoPor !== null).length
}

/** El modo de la caja que reproduce autor/tipo de un mensaje; `null` = la caja no sabe escribir esa combinación. */
export function modoDeMensaje(m: Pick<Mensaje, 'autor' | 'tipo'>): ModoCaja | null {
  if (m.autor === 'compania' && m.tipo === 'comentario') return 'compania'
  if (m.autor === 'compania' && m.tipo === 'rehuse') return 'rehuse'
  if (m.autor === 'corredor' && m.tipo === 'enviado') return 'enviado'
  if (m.autor === 'interna' && m.tipo === 'nota') return 'interna'
  return null
}

/** «Editar» solo en mensajes NO de la IA, vigentes, legibles y con una combinación que la caja sabe escribir. */
export function puedeEditar(m: Mensaje): boolean {
  return m.autor !== 'ia' && m.sustituidoPor === null && !m.textoIlegible && m.texto !== null && modoDeMensaje(m) !== null
}

/** Autor que escribe cada modo: al editar solo se pueden elegir modos del MISMO autor que el original. */
export function autorDeModo(modo: ModoCaja): AutorMensaje {
  return modo === 'compania' || modo === 'rehuse' ? 'compania' : modo === 'enviado' ? 'corredor' : 'interna'
}

// ─── Veredicto de la IA, ficha del perito, volcado de la intranet y búsqueda en la póliza ─────────────────────

export type ArgumentoVeredicto = { texto: string; apoyo: 'poliza' | 'ley' | 'hechos'; cita: string | null; /** `false` = la cita NO se encontró; `null` = no se comprobó. */ citaVerificada: boolean | null }
export type Veredicto = {
  semaforo: 'defendible' | 'no_defendible' | 'faltan_datos'
  confianza: number | null
  resumen: string | null
  preguntas: string[]
  argumentos: ArgumentoVeredicto[]
  derivar: 'abogado' | 'perito_externo' | null
  plazosAccion: { que: string; fecha: string | null; base: string | null }[]
  otrasPolizas: { polizaId: string; ramo: string | null; compania: string | null; motivo: string | null }[]
  explicacionCliente: string | null
}

const SEMAFOROS = ['defendible', 'no_defendible', 'faltan_datos'] as const
const APOYOS = ['poliza', 'ley', 'hechos'] as const
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** `meta.veredicto` válido o `null` (entonces se muestra el texto del mensaje tal cual). Un semáforo desconocido invalida todo. */
export function leerVeredicto(meta: Record<string, unknown> | null): Veredicto | null {
  const o = obj(meta?.veredicto)
  if (!o) return null
  const semaforo = SEMAFOROS.find(s => s === o.semaforo)
  if (!semaforo) return null
  const argumentos: ArgumentoVeredicto[] = []
  for (const a of lista(o.argumentos)) {
    const x = obj(a)
    const texto = x ? str(x.texto) : null
    if (!x || !texto) continue
    argumentos.push({ texto, apoyo: APOYOS.find(p => p === x.apoyo) ?? 'hechos', cita: str(x.cita), citaVerificada: typeof x.citaVerificada === 'boolean' ? x.citaVerificada : null })
  }
  const plazosAccion: Veredicto['plazosAccion'] = []
  for (const p of lista(o.plazosAccion)) {
    const x = obj(p)
    if (x && str(x.que)) plazosAccion.push({ que: x.que as string, fecha: str(x.fecha), base: str(x.base) })
  }
  const otrasPolizas: Veredicto['otrasPolizas'] = []
  for (const p of lista(o.otrasPolizas)) {
    const x = obj(p)
    if (x && str(x.polizaId)) otrasPolizas.push({ polizaId: x.polizaId as string, ramo: str(x.ramo), compania: str(x.compania), motivo: str(x.motivo) })
  }
  return {
    semaforo, confianza: num(o.confianza), resumen: str(o.resumen),
    preguntas: lista(o.preguntas).flatMap(q => (str(q) ? [q as string] : [])),
    argumentos,
    derivar: o.derivar === 'abogado' || o.derivar === 'perito_externo' ? o.derivar : null,
    plazosAccion, otrasPolizas, explicacionCliente: str(o.explicacionCliente),
  }
}

export const SEMAFORO_VISUAL: Record<Veredicto['semaforo'], { icono: string; etiqueta: string; color: string; fondo: string }> = {
  defendible: { icono: '🟢', etiqueta: 'Defendible', color: 'var(--positive)', fondo: 'var(--positive-bg)' },
  no_defendible: { icono: '🔴', etiqueta: 'No defendible', color: 'var(--negative)', fondo: 'var(--negative-bg)' },
  faltan_datos: { icono: '🟡', etiqueta: 'Faltan datos', color: 'var(--warning)', fondo: 'var(--warning-bg)' },
}
export const ETIQUETA_DERIVAR = { abogado: 'Derivar a un abogado', perito_externo: 'Derivar a una empresa externa de peritación' } as const
export const ETIQUETA_APOYO = { poliza: 'Póliza', ley: 'Ley', hechos: 'Hechos' } as const

/** Confianza 0-1 o 0-100 → «80 %»; `null` = no se sabe. */
export function textoConfianza(c: number | null): string {
  if (c === null) return 'sin confianza indicada'
  const p = c <= 1 ? c * 100 : c
  return `${Math.round(Math.min(100, Math.max(0, p)))} %`
}

export type FichaPerito = { numeroInforme: number | null; fechaGestion: string | null; fechaProxGestion: string | null; importeCubierto: number | null; importeNoCubierto: number | null; origenCausas: string | null; afectados: number | null }

export function leerFichaPerito(v: unknown): FichaPerito | null {
  const o = obj(v)
  if (!o) return null
  return { numeroInforme: num(o.numeroInforme), fechaGestion: str(o.fechaGestion), fechaProxGestion: str(o.fechaProxGestion), importeCubierto: num(o.importeCubierto), importeNoCubierto: num(o.importeNoCubierto), origenCausas: str(o.origenCausas), afectados: num(o.afectados) }
}

/** La ficha del perito MÁS RECIENTE del hilo (por orden de aparición); `null` = ningún mensaje la trae. */
export function ultimaFichaPerito(mensajes: readonly Mensaje[] | null): FichaPerito | null {
  for (const m of [...(mensajes ?? [])].reverse()) {
    const f = leerFichaPerito(m.meta?.fichaPerito)
    if (f) return f
  }
  return null
}

export type TrozoVolcado = { emisor: string | null; rol: 'perito' | 'tramitador' | 'compania' | null; fechaOriginal: string | null; texto: string; huella: string; tipo: 'comentario' | 'rehuse'; duplicado: boolean; fichaPerito: FichaPerito | null }
export type PropuestaVolcado = { trozos: TrozoVolcado[]; fichaPerito: FichaPerito | null; duplicados: number }

export function leerPropuestaVolcado(v: unknown): PropuestaVolcado | null {
  const o = obj(v)
  if (!o || o.estado !== 'propuesta' || !Array.isArray(o.trozos)) return null
  const trozos: TrozoVolcado[] = []
  for (const t of o.trozos) {
    const x = obj(t)
    const texto = x ? str(x.texto) : null
    const huella = x ? str(x.huella) : null
    if (!x || !texto || !huella) continue
    trozos.push({
      emisor: str(x.emisor), rol: x.rol === 'perito' || x.rol === 'tramitador' || x.rol === 'compania' ? x.rol : null,
      fechaOriginal: str(x.fechaOriginal), texto, huella, tipo: x.tipo === 'rehuse' ? 'rehuse' : 'comentario',
      duplicado: x.duplicado === true, fichaPerito: leerFichaPerito(x.fichaPerito),
    })
  }
  return { trozos, fichaPerito: leerFichaPerito(o.fichaPerito), duplicados: num(o.duplicados) ?? trozos.filter(t => t.duplicado).length }
}

/** Cuántos mensajes se guardarían (los duplicados se saltan). */
export const trozosNuevos = (p: PropuestaVolcado): number => p.trozos.filter(t => !t.duplicado).length

export type ResultadoVolcado = { insertados: number; duplicados: number; preRehuse: boolean }
export function leerResultadoVolcado(v: unknown): ResultadoVolcado | null {
  const o = obj(v)
  if (!o || o.estado !== 'ok' || num(o.insertados) === null) return null
  return { insertados: o.insertados as number, duplicados: num(o.duplicados) ?? 0, preRehuse: o.preRehuse === true }
}

/** ¿La respuesta del puerto avisa de un posible rehúse? (volcado confirmado o mensaje del hilo). */
export const hayPreRehuse = (v: unknown): boolean => obj(v)?.preRehuse === true

/** Texto del aviso de Telegram por un posible rehúse. */
export function textoPreRehuse(referencia: string | null, url: string): string {
  return `⚠️ Posible rehúse en el siniestro ${referencia ?? '(sin número)'}: actúa antes de que se formalice\n${url}`
}

export type Fragmento = { documentoId: string; nombre: string | null; posicion: number | null; fragmento: string }
/** `documentos: 0` = la póliza no tiene PDF legible ≠ `fragmentos: []` = sin resultados. */
export type ResultadoBusqueda = { documentos: number; fragmentos: Fragmento[] }

export function leerBusquedaPoliza(v: unknown): ResultadoBusqueda | null {
  const o = obj(v)
  const documentos = o ? num(o.documentos) : null
  if (!o || o.estado !== 'ok' || documentos === null || !Array.isArray(o.fragmentos)) return null
  const fragmentos: Fragmento[] = []
  for (const f of o.fragmentos) {
    const x = obj(f)
    if (x && str(x.documentoId) && str(x.fragmento)) fragmentos.push({ documentoId: x.documentoId as string, nombre: str(x.nombre), posicion: num(x.posicion), fragmento: x.fragmento as string })
  }
  return { documentos, fragmentos }
}

export type TrozoResaltado = { texto: string; marca: boolean }

const sinAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Parte el fragmento en trozos marcando las palabras (≥2 letras) de la consulta, sin distinguir mayúsculas ni acentos. */
export function resaltarFragmento(fragmento: string, consulta: string): TrozoResaltado[] {
  const palabras = [...new Set(sinAcentos(consulta).toLowerCase().split(/[^a-z0-9ñ]+/).filter(p => p.length >= 2))]
  if (palabras.length === 0) return fragmento === '' ? [] : [{ texto: fragmento, marca: false }]
  // NFD cambia la longitud: se compara por carácter (un carácter con acento sigue siendo UN carácter base).
  const base = [...fragmento].map(c => sinAcentos(c).toLowerCase() || c.toLowerCase())
  const plano = base.join('')
  if (plano.length !== fragmento.length) return [{ texto: fragmento, marca: false }]
  const marcado = new Array<boolean>(fragmento.length).fill(false)
  for (const p of palabras) {
    let i = plano.indexOf(p)
    while (i !== -1) { for (let k = i; k < i + p.length; k++) marcado[k] = true; i = plano.indexOf(p, i + p.length) }
  }
  const out: TrozoResaltado[] = []
  for (let i = 0; i < fragmento.length; i++) {
    const ult = out[out.length - 1]
    if (ult && ult.marca === marcado[i]) ult.texto += fragmento[i]
    else out.push({ texto: fragmento[i], marca: marcado[i] })
  }
  return out
}

export type PartePortal = { id: string; fecha: string | null; descripcion: string | null; documentos: number | null }
/** `null` = el hilo no trae el campo (no hay bloque); `[]` = el cliente no ha comunicado nada. */
export function leerPartesPortal(v: unknown): PartePortal[] | null {
  if (!Array.isArray(v)) return null
  return v.flatMap(p => {
    const x = obj(p)
    return x && str(x.id) ? [{ id: x.id as string, fecha: str(x.fecha), descripcion: str(x.descripcion), documentos: Array.isArray(x.documentos) ? x.documentos.length : num(x.documentos) }] : []
  })
}

export type DestinatarioIa = 'compania_intranet' | 'compania' | 'cliente'
export const DESTINATARIOS_IA: { valor: DestinatarioIa; etiqueta: string }[] = [
  { valor: 'compania_intranet', etiqueta: 'Intranet de la compañía (cordial)' },
  { valor: 'compania', etiqueta: 'Correo a la compañía' },
  { valor: 'cliente', etiqueta: 'Cliente' },
]

/** Emisor y fecha original de un mensaje volcado de la intranet (si existen). */
export function origenVolcado(meta: Record<string, unknown> | null): { emisor: string | null; fechaOriginal: string | null } {
  return { emisor: str(meta?.emisor), fechaOriginal: str(meta?.fechaOriginal) }
}

/** Texto de la caja al pulsar «Responder» en una pregunta del veredicto. */
export const precargaPregunta = (pregunta: string): string => `Pregunta de la IA: ${pregunta}\nRespuesta: `

/** Cuerpo del POST de valoración. */
export function cuerpoValoracion(siniestroId: string, mensajeId: string, voto: 'bien' | 'mal', motivo: string): Record<string, unknown> {
  const m = motivo.trim()
  return { siniestroId, valoracion: { mensajeId, voto, ...(m !== '' ? { motivo: m } : {}) } }
}
