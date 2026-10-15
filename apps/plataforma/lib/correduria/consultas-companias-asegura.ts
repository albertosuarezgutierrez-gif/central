// «Consultar a compañías» desde la oportunidad (fase 1, spec 2026-10-15-correduria-consultas-companias).
// Plataforma NO toca la BD ni envía el correo: reenvía al puerto de asegura (`/api/operador/*`).
// Lo PURO (tipos, interpretación) lo importa el client component; la RED solo la llaman las rutas API.
// 🚨 `null` ≠ `[]`: ramos `null` = sin clasificar; `faltan` ausente = no se sabe (no «nada falta»).
// 🚨 El DNI entero nunca llega aquí: solo `docEnmascarado`.

import { cabecerasPuerto } from '../puerto-actor.ts'

export type ContactoCompania = { id: string; nombre: string; cargo: string | null; area: string | null; email: string | null; ramos: string[] | null }
export type CompaniaConsulta = { codigoDgs: string; nombre: string; contactos: ContactoCompania[] }
export type Competencia = { compania: string | null; prima: number | null; coberturas: string | null }
/** `competencia` = es la póliza/oferta de competencia de la oportunidad (lleva aviso fijo al adjuntarla). */
export type DocumentoConsulta = { id: string; nombre: string; competencia: boolean }
export type DestinatarioDTO = { id: string; nombre: string | null; email: string | null }
export const ESTADOS_CONSULTA = ['borrador', 'enviada', 'respondida', 'pide_info', 'rechazada', 'sin_respuesta', 'descartada', 'cancelada'] as const
export type EstadoConsulta = (typeof ESTADOS_CONSULTA)[number]
export type ConsultaDTO = {
  id: string
  companiaCodigo: string
  companiaNombre: string
  destinatarios: DestinatarioDTO[]
  asunto: string
  cuerpo: string
  /** Un estado que esta versión no conoce se conserva CRUDO (no se descarta la fila). */
  estado: EstadoConsulta | (string & {})
  codigoRef: string | null
  identidadIncluida: boolean
  competenciaIncluida: boolean
  responderAntes: string | null
  /** Documentos elegidos (asegura manda `{documentoId, nombre, competencia}`). */
  adjuntos: DocumentoConsulta[]
  enviadaAt: string | null
  respondidaAt: string | null
  /** Borrador con un envío reservado y sin confirmar: no se edita ni se reenvía desde aquí (se mira en Enviados). */
  envioSinConfirmar: boolean
  /** El aviso fijo junto a los adjuntos, tal como lo manda asegura (`null` = no vino: se usa el de la vista). */
  avisoAdjuntos: string | null
}
export type PanelConsultas = {
  ramo: string | null
  companias: CompaniaConsulta[]
  /** CLAVES de campo (etiqueta con `etiquetaFaltaConsulta`). `null` = no se sabe (no se pudo calcular); `[]` = no falta nada. */
  faltan: string[] | null
  competencia: Competencia | null
  documentos: DocumentoConsulta[]
  /** `false` = asegura NO pudo leer los documentos de la ficha (≠ «no hay documentos»). */
  documentosLeidos: boolean
  /** `nombre`/`docEnmascarado` null = la ficha no lo tiene; `docLegible=false` = lo tiene pero no se pudo descifrar. */
  tomador: { nombre: string | null; docEnmascarado: string | null; docLegible: boolean } | null
  responderAntesPropuesta: string | null
  consultas: ConsultaDTO[]
  avisoAdjuntos: string | null
}

export type LecturaPanel =
  | { estado: 'ok'; datos: PanelConsultas }
  | { estado: 'sin_configurar' }
  /** Falta aplicar el SQL de consultas en asegura (503 `sin_migracion`): ni se lee ni se envía nada. */
  | { estado: 'sin_migracion' }
  | { estado: 'error'; motivo: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** `null` (sin clasificar) se conserva; `[]` (revisado, sin ramos) se conserva; solo se filtran no-textos. */
export function leerRamos(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
}

/** Un documento/adjunto del puerto: `{documentoId|id, nombre, competencia}` (o un id suelto, por compatibilidad). */
export function leerDocumento(v: unknown): DocumentoConsulta | null {
  if (typeof v === 'string') return v.trim() !== '' ? { id: v, nombre: 'Documento', competencia: false } : null
  const x = obj(v)
  const id = txt(x?.documentoId) ?? txt(x?.id)
  return x && id ? { id, nombre: txt(x.nombre) ?? 'Documento', competencia: x.competencia === true } : null
}
const leerDocumentos = (v: unknown): DocumentoConsulta[] => (Array.isArray(v) ? v : []).flatMap((d) => { const x = leerDocumento(d); return x ? [x] : [] })

export function leerConsulta(v: unknown): ConsultaDTO | null {
  const o = obj(v)
  const id = txt(o?.id)
  if (!o || !id) return null
  const estado = txt(o.estado)
  if (!estado) return null
  const destinatarios = (Array.isArray(o.destinatarios) ? o.destinatarios : []).flatMap((d): DestinatarioDTO[] => {
    const x = obj(d)
    const did = txt(x?.id)
    return x && did ? [{ id: did, nombre: txt(x.nombre), email: txt(x.email) }] : []
  })
  return {
    id,
    companiaCodigo: txt(o.companiaCodigo) ?? '',
    companiaNombre: txt(o.companiaNombre) ?? txt(o.companiaCodigo) ?? 'Compañía',
    destinatarios,
    asunto: typeof o.asunto === 'string' ? o.asunto : '',
    cuerpo: typeof o.cuerpo === 'string' ? o.cuerpo : '',
    estado,
    codigoRef: txt(o.codigoRef),
    identidadIncluida: o.identidadIncluida === true,
    competenciaIncluida: o.competenciaIncluida === true,
    responderAntes: txt(o.responderAntes),
    adjuntos: leerDocumentos(o.adjuntos),
    enviadaAt: txt(o.enviadaAt),
    respondidaAt: txt(o.respondidaAt),
    envioSinConfirmar: o.envioSinConfirmar === true,
    avisoAdjuntos: txt(o.avisoAdjuntos),
  }
}

export function leerConsultas(v: unknown): ConsultaDTO[] {
  return (Array.isArray(v) ? v : []).flatMap((x) => { const c = leerConsulta(x); return c ? [c] : [] })
}

export function interpretarPanel(status: number, json: unknown): LecturaPanel {
  const j = obj(json)
  if (j?.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (j?.estado === 'sin_migracion') return { estado: 'sin_migracion' }
  if (status !== 200 || !j || !Array.isArray(j.companias)) {
    return { estado: 'error', motivo: txt(j?.motivo) ?? txt(j?.causa) ?? `HTTP ${status}` }
  }
  const companias = j.companias.flatMap((c): CompaniaConsulta[] => {
    const o = obj(c)
    const codigoDgs = txt(o?.codigoDgs)
    if (!o || !codigoDgs) return []
    const contactos = (Array.isArray(o.contactos) ? o.contactos : []).flatMap((k): ContactoCompania[] => {
      const x = obj(k)
      const id = txt(x?.id)
      return x && id ? [{ id, nombre: txt(x.nombre) ?? 'Sin nombre', cargo: txt(x.cargo), area: txt(x.area), email: txt(x.email), ramos: leerRamos(x.ramos) }] : []
    })
    return [{ codigoDgs, nombre: txt(o.nombre) ?? codigoDgs, contactos }]
  })
  const comp = obj(j.competencia)
  const tom = obj(j.tomador)
  return {
    estado: 'ok',
    datos: {
      ramo: txt(j.ramo),
      companias,
      faltan: Array.isArray(j.faltan) ? j.faltan.filter((x): x is string => typeof x === 'string') : null,
      competencia: comp ? { compania: txt(comp.compania), prima: num(comp.prima), coberturas: txt(comp.coberturas) } : null,
      documentos: leerDocumentos(j.documentos),
      documentosLeidos: j.documentosLeidos === true,
      tomador: tom ? { nombre: txt(tom.nombre), docEnmascarado: txt(tom.docEnmascarado), docLegible: tom.docLegible === true } : null,
      responderAntesPropuesta: txt(j.responderAntesPropuesta),
      consultas: leerConsultas(j.consultas),
      avisoAdjuntos: txt(j.avisoAdjuntos),
    },
  }
}

// ─── RED ─────────────────────────────────────────────────────────────────────

export type Reenvio = { status: number; json: unknown }

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function puerto(ruta: string, init: RequestInit, topeMs = 30_000): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/${ruta}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(topeMs),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

const JSON_H = { 'content-type': 'application/json' }
const qs = (correduriaId: string | null) => (correduriaId ? `?correduriaId=${encodeURIComponent(correduriaId)}` : '')
const conId = (cuerpo: Record<string, unknown>, correduriaId: string | null) => (correduriaId ? { correduriaId, ...cuerpo } : cuerpo)

export const panelConsultasAsegura = (oportunidadId: string, correduriaId: string | null) =>
  puerto(`oportunidades/${encodeURIComponent(oportunidadId)}/consultas-companias${qs(correduriaId)}`, { method: 'GET' })
/** La IA redacta en asegura: margen amplio. */
export const redactarBorradoresAsegura = (oportunidadId: string, cuerpo: Record<string, unknown>, correduriaId: string | null) =>
  puerto(`oportunidades/${encodeURIComponent(oportunidadId)}/consultas-companias/borradores`, { method: 'POST', headers: JSON_H, body: JSON.stringify(conId(cuerpo, correduriaId)) }, 95_000)
export const editarConsultaAsegura = (id: string, cuerpo: Record<string, unknown>, correduriaId: string | null) =>
  puerto(`consultas-companias/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_H, body: JSON.stringify(conId(cuerpo, correduriaId)) })
/** SMTP en asegura: 503 `canal_no_disponible` ≠ 502 `envio_fallido` ≠ 409 ya enviada; se reenvía el status tal cual. */
export const enviarConsultaAsegura = (id: string, correduriaId: string | null) =>
  puerto(`consultas-companias/${encodeURIComponent(id)}/enviar`, { method: 'POST', headers: JSON_H, body: JSON.stringify(conId({ confirmar: true }, correduriaId)) }, 60_000)
/** `null` = sin clasificar; `[]` = revisado, sin ramos. */
export const editarRamosContactoAsegura = (id: string, ramos: string[] | null, correduriaId: string | null) =>
  puerto(`compania-contactos/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_H, body: JSON.stringify(conId({ ramos }, correduriaId)) })
export const altaContactoAsegura = (codigoDgs: string, cuerpo: Record<string, unknown>, correduriaId: string | null) =>
  puerto(`companias/${encodeURIComponent(codigoDgs)}/contactos`, { method: 'POST', headers: JSON_H, body: JSON.stringify(conId(cuerpo, correduriaId)) })
