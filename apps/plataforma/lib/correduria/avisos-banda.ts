/**
 * La banda de avisos de «Mi mesa» en el NAVEGADOR (13/10/2026). PURO: valida la respuesta de
 * `GET /api/correduria/avisos` y decide cómo se pinta cada línea. El contrato (qué cola, qué plazo) es de
 * `avisos.ts`; aquí solo se evita que una respuesta rota (500 de Vercel, HTML de error, forma vieja) acabe
 * pintada como «no hay avisos».
 *
 * 🚨 Tres estados: lista vacía con `ok` = comprobado y nada pendiente (la banda no ocupa sitio);
 * `error` = NO se ha podido comprobar (la banda lo dice: nunca desaparece en silencio).
 */
import type { Aviso, NivelAviso, TipoAviso } from './avisos.ts'

export type BandaAvisos =
  | { estado: 'ok'; avisos: Aviso[]; /** Líneas de la respuesta que no tenían la forma esperada. */ descartados: number }
  | { estado: 'error'; motivo: string }

const NIVELES: readonly NivelAviso[] = ['urgente', 'no_comprobado', 'aviso']
const TIPOS: readonly string[] = [
  'partes', 'supresiones', 'quejas', 'cambios_cuenta', 'recibos_lcs', 'aprobaciones', 'bajas_pue', 'anulaciones',
  'recibos_sin_confirmar', 'correos_compania_sin_resolver', 'ingesta', 'puerto',
]

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Solo enlaces internos de plataforma: nunca un `javascript:` ni un sitio de fuera. */
function hrefInterno(v: unknown): string | null {
  return typeof v === 'string' && /^\/[^/\\]/.test(v) ? v : null
}

function linea(v: unknown): Aviso | null {
  const r = objeto(v)
  if (!r) return null
  const nivel = NIVELES.find(n => n === r.nivel)
  const tipo = TIPOS.find(t => t === r.tipo) as TipoAviso | undefined
  const href = hrefInterno(r.href)
  if (!nivel || !tipo || !href || typeof r.texto !== 'string' || r.texto.trim() === '') return null
  return {
    tipo, nivel, href, texto: r.texto,
    n: typeof r.n === 'number' && Number.isFinite(r.n) ? r.n : null,
    plazo: typeof r.plazo === 'string' ? r.plazo : null,
    diasRestantes: typeof r.diasRestantes === 'number' && Number.isFinite(r.diasRestantes) ? r.diasRestantes : null,
  }
}

export function interpretarBanda(status: number, json: unknown): BandaAvisos {
  const o = objeto(json)
  if (status !== 200 || !o || o.estado !== 'ok' || !Array.isArray(o.avisos)) {
    return { estado: 'error', motivo: status === 401 || status === 403 ? 'sin permiso' : `respuesta ${status}` }
  }
  const avisos: Aviso[] = []
  let descartados = 0
  for (const v of o.avisos) {
    const a = linea(v)
    if (a) avisos.push(a)
    else descartados++
  }
  return { estado: 'ok', avisos, descartados }
}

/** Qué color y qué marca lleva la línea. Rojo = urgente; ámbar = no se pudo comprobar; apagado = aviso con o sin plazo. */
export function estiloAviso(nivel: NivelAviso): { color: string; fondo: string; borde: string; marca: string } {
  if (nivel === 'urgente') return { color: 'var(--negative)', fondo: 'var(--negative-bg)', borde: 'var(--negative)', marca: '!' }
  if (nivel === 'no_comprobado') return { color: 'var(--warning)', fondo: 'var(--warning-bg)', borde: 'var(--warning)', marca: '?' }
  return { color: 'var(--text)', fondo: 'var(--surface)', borde: 'var(--border)', marca: '•' }
}
