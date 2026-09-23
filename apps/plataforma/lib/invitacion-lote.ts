/**
 * Lectura PURA de las dos respuestas del envío por lotes de la invitación al
 * portal (`/api/operador/portal/invitaciones` de asegura). Separada del
 * componente para que su cepo corra sin navegador.
 *
 * 🚨 Cada motivo por el que una ficha queda FUERA se nombra: `sin_email` se
 * arregla pidiéndole el correo, `resuelve_a_otra` resolviendo un duplicado e
 * `ilegible` en las variables de Vercel. Un «no se puede» común dejaría a
 * Alberto sin saber a dónde ir. El `Record` obliga a ponerle nombre a cada uno:
 * un motivo nuevo sin etiqueta no compila.
 */

export type MotivoFuera =
  | 'ya_entra'
  | 'ambiguo'
  | 'resuelve_a_otra'
  | 'sin_email'
  | 'ilegible'
  | 'no_comprobado'
  | 'invitado_hace_poco'

export const ETIQUETA_FUERA: Record<MotivoFuera, string> = {
  ya_entra: 'ya entran al portal',
  invitado_hace_poco: 'invitados hace menos de 30 días',
  sin_email: 'sin correo en su ficha (ver «Clientes sin canal»)',
  resuelve_a_otra: 'su correo lleva a OTRA ficha (duplicado por resolver)',
  ambiguo: 'su correo está en varias fichas (duplicado por resolver)',
  ilegible: 'correo cifrado que no se puede abrir (clave PII en Vercel)',
  no_comprobado: 'no se ha podido comprobar (no se invita a ciegas)',
}

export type Censo = {
  total: number
  maxPorLote: number
  destinatarios: Array<{ clienteId: string; nombre: string | null }>
  fuera: Array<{ motivo: string; etiqueta: string; n: number }>
  muestra: { asunto: string; texto: string } | null
}

export type ResultadoCenso = { ok: true; censo: Censo } | { ok: false; motivo: string }

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function motivoError(status: number, o: Record<string, unknown>): string {
  if (status === 401 || status === 403) return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
  if (o.estado === 'sin_configurar') return 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET o su BD).'
  if (o.motivo === 'red') return 'No se ha podido hablar con asegura.'
  return `asegura no ha podido responder: ${texto(o.causa) ?? texto(o.motivo) ?? `HTTP ${status}`}`
}

export function interpretarCenso(status: number, json: unknown): ResultadoCenso {
  const o = obj(json)
  if (status !== 200 || o.estado !== 'ok') return { ok: false, motivo: motivoError(status, o) }
  const total = num(o.total)
  const maxPorLote = num(o.maxPorLote)
  const decision = obj(o.decision)
  if (total === null || maxPorLote === null || !Array.isArray(o.destinatarios)) {
    return { ok: false, motivo: 'asegura ha contestado algo que no se entiende: no se ofrece enviar nada.' }
  }
  const destinatarios = o.destinatarios
    .map(obj)
    .filter((d) => texto(d.clienteId) !== null)
    .map((d) => ({ clienteId: d.clienteId as string, nombre: texto(d.nombre) }))
  const fuera = Object.entries(obj(decision.fuera))
    .map(([motivo, n]) => ({
      motivo,
      // Un motivo que esta versión no conoce se enseña con su nombre crudo, no se tira.
      etiqueta: (ETIQUETA_FUERA as Record<string, string>)[motivo] ?? motivo,
      n: num(n) ?? 0,
    }))
    .filter((f) => f.n > 0)
    .sort((a, b) => b.n - a.n)
  const m = obj(o.muestra)
  const muestra = texto(m.asunto) && texto(m.texto) ? { asunto: m.asunto as string, texto: m.texto as string } : null
  return { ok: true, censo: { total, maxPorLote, destinatarios, fuera, muestra } }
}

export type ResultadoLote =
  | { estado: 'hecho'; enviados: number; fallidos: Array<{ clienteId: string; motivo: string }>; sinIntentar: number; descartados: number; parado: string | null }
  /** Se cortó la espera: el envío puede haber seguido en asegura. NO es «falló». */
  | { estado: 'sin_confirmar'; motivo: string }
  | { estado: 'error'; motivo: string }

export function interpretarLote(status: number, json: unknown): ResultadoLote {
  const o = obj(json)
  const enviados = num(o.enviados)
  if ((status === 200 || status === 503) && enviados !== null && (o.estado === 'ok' || o.estado === 'parado')) {
    const fallidos = Array.isArray(o.fallidos)
      ? o.fallidos.map(obj).map((f) => ({ clienteId: String(f.clienteId ?? ''), motivo: texto(f.motivo) ?? String(f.estado ?? '') }))
      : []
    return {
      estado: 'hecho',
      enviados,
      fallidos,
      sinIntentar: num(o.sinIntentar) ?? 0,
      descartados: num(o.descartados) ?? 0,
      parado: texto(o.parado),
    }
  }
  if (o.motivo === 'red') {
    return {
      estado: 'sin_confirmar',
      motivo:
        'Se ha cortado la espera y asegura puede haber seguido enviando. No lo repitas a ciegas: vuelve a preparar la lista — quien ya recibió la invitación sale como «invitado hace menos de 30 días» y no se le escribe otra vez.',
    }
  }
  return { estado: 'error', motivo: motivoError(status, o) }
}
