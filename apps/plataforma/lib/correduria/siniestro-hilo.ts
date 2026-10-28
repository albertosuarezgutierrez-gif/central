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
  return { id: o.id as string, autor, tipo, texto: typeof o.texto === 'string' ? o.texto : null, textoIlegible: ilegible, documentoId: str(o.documentoId), creadoPor: str(o.creadoPor), creadoAt: str(o.creadoAt), meta: obj(o.meta) }
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
export function cuerpoCaja(modo: ModoCaja, texto: string, documentoId: string | null, reclamacionSac = false): {
  autor: AutorMensaje; tipo: TipoMensaje; texto: string; documentoId?: string; reclamacionSac?: boolean
} {
  const base = { texto: texto.trim(), ...(documentoId ? { documentoId } : {}) }
  if (modo === 'compania') return { autor: 'compania', tipo: 'comentario', ...base }
  if (modo === 'rehuse') return { autor: 'compania', tipo: 'rehuse', ...base }
  if (modo === 'enviado') return { autor: 'corredor', tipo: 'enviado', ...base, ...(reclamacionSac ? { reclamacionSac: true } : {}) }
  return { autor: 'interna', tipo: 'nota', ...base }
}
