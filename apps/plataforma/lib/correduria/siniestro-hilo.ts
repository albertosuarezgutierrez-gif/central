// Expediente de un siniestro (hilo con la compañía, plazos, espera). PURO: sin red ni env, lo importan
// los client components. Reglas: `mensajes: null` = «no se pudo leer» ≠ `[]` = «sin mensajes»;
// plazo con `fecha`/`diasRestantes` null = «falta la fecha base», NUNCA 0.

export type AutorMensaje = 'compania' | 'ia' | 'corredor' | 'interna'
export type TipoMensaje = 'comentario' | 'rehuse' | 'analisis' | 'borrador' | 'enviado' | 'nota'

export type Mensaje = {
  id: string
  autor: AutorMensaje
  tipo: TipoMensaje
  texto: string
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
  if (!autor || !tipo || typeof o.texto !== 'string') return null
  return { id: o.id as string, autor, tipo, texto: o.texto, documentoId: str(o.documentoId), creadoPor: str(o.creadoPor), creadoAt: str(o.creadoAt), meta: obj(o.meta) }
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
      baseLegal: str(o.baseLegal), verificado: o.verificado === true,
    })
  }
  return out
}

export function leerHilo(v: unknown): HiloSiniestro | null {
  const o = obj(v)
  if (!o || o.estado === 'error' || o.estado === 'sin_configurar') return null
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
  const lista = Array.isArray(v) ? v : obj(v) && Array.isArray(obj(v)!.siniestros) ? (obj(v)!.siniestros as unknown[]) : null
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

export const LIMITE_PLEGADO = 600

export function plegarTexto(texto: string, abierto: boolean, limite = LIMITE_PLEGADO): { visible: string; plegado: boolean } {
  if (abierto || texto.length <= limite) return { visible: texto, plegado: false }
  return { visible: texto.slice(0, limite).trimEnd() + '…', plegado: true }
}

export const ETIQUETA_AUTOR: Record<AutorMensaje, string> = { compania: 'Compañía', ia: 'IA', corredor: 'Alberto', interna: 'Nota interna' }

export type ModoCaja = 'compania' | 'enviado' | 'interna'
/** Qué se guarda según el selector de la caja. */
export function cuerpoCaja(modo: ModoCaja, texto: string, documentoId: string | null): { autor: AutorMensaje; tipo: TipoMensaje; texto: string; documentoId?: string } {
  const base = { texto: texto.trim(), ...(documentoId ? { documentoId } : {}) }
  if (modo === 'compania') return { autor: 'compania', tipo: 'comentario', ...base }
  if (modo === 'enviado') return { autor: 'corredor', tipo: 'enviado', ...base }
  return { autor: 'interna', tipo: 'nota', ...base }
}
