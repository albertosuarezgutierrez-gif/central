// Los LEADS del portal —pólizas que el cliente sube y que la casa no lleva—
// leídos del puerto de asegura (`GET /api/operador/leads`) y convertidos en
// algo que la pantalla pueda pintar sin adivinar nada.
//
// Dos partes, como en `cartera-lista-asegura.ts` y `duplicados-asegura.ts`:
//   1. Lo PURO: `interpretarLeads` (test en `lib/leads-asegura.test.ts`), que
//      importa el client component.
//   2. La RED: `leadsAsegura()`, solo desde la ruta API de plataforma.
//
// ─── La regla que gobierna este fichero ─────────────────────────────────────
// Una respuesta que no se entiende degrada a error, JAMÁS a una lista vacía.
// «No he podido leer los leads» y «no hay ninguno» se pintan igual de vacíos, y
// solo uno de los dos autoriza a decirle a Alberto que ahí no hay nada que
// trabajar. Lo mismo, campo a campo:
//
//   · `yaEnCartera: null`   = no se ha podido comprobar   (nunca «no es tuya»)
//   · `primaAnual: null`    = la póliza no informa prima  (nunca 0,00 €)
//   · `sinIdentificar: null`= el puerto no manda el dato  (nunca «0 sin identificar»)
//
// Y una fila sin `id` no es una fila que no exista: no hay ficha a la que ir,
// así que no se pinta — pero se CUENTA en `ilegibles` y la pantalla lo dice.
import { MOTIVOS_PUERTO, type MotivoPuerto, describirCausaAsegura } from './correduria-puerto.ts'

export type { MotivoPuerto }
export { MOTIVOS_PUERTO, describirCausaAsegura }

export type EstadoLead = 'confirmado' | 'sin_confirmar' | 'sin_fecha'

export type LeadVista = {
  id: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  estado: EstadoLead
  fechaVencimiento: Date | null
  fechaAccionable: Date | null
  diasParaAccionable: number | null
  ventanaPasada: boolean
  /**
   * Trabajo de HOY. Lo calcula el PUERTO con `leadUrgente()` del módulo puro y
   * llega ya resuelto: la regla («dos semanas antes de que se cierre la
   * ventana») vive en un solo sitio, y copiar aquí el umbral sería tener dos
   * verdades sobre qué es urgente. Un valor que no sea `true` es «no urgente».
   */
  urgente: boolean
  /** `null` = no se ha podido comprobar si ya la lleva la casa. NUNCA colapsar a false. */
  yaEnCartera: false | null
  /** `null` = no se ha casado con ninguna ficha: hay que identificar a la persona. */
  clienteId: string | null
  subidaEn: Date | null
  documentoNombre: string | null
  primaAnual: number | null
  /**
   * De quién dijo el CLIENTE que era. `'sin_preguntar'` no es «suya»: son las
   * filas de antes de que existiera la pregunta, y también las que dijeron
   * «de mi empresa» sin decir cuál. Cambia a quién llamas y qué le dices.
   */
  titularTipo: 'propio' | 'empresa' | 'sin_preguntar'
  titularEmpresa: string | null
  /**
   * La ficha de la cartera que corresponde al CIF que declaró, si esa sociedad
   * ya está fichada. `null` cubre tres casos que la pantalla dice distinto: no
   * dijo empresa, no dio un CIF válido, o **no la tienes fichada** — que no es
   * un fallo: es el lead.
   */
  fichaEmpresaId: string | null
}

export type ResultadoLeads =
  | { ok: true; leads: LeadVista[]; sinIdentificar: number | null; ilegibles: number }
  | { ok: false; motivo: MotivoPuerto | 'sin_configurar'; causa: string | null }

const ESTADOS: readonly EstadoLead[] = ['confirmado', 'sin_confirmar', 'sin_fecha']

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Texto ISO → `Date`. Una fecha que no parsea es `null`, nunca «Invalid Date». */
function fecha(v: unknown): Date | null {
  const t = cadena(v)
  if (t === null) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `'sin_preguntar'` ante cualquier duda: es el estado que no afirma nada. */
function titularDe(bruto: unknown): 'propio' | 'empresa' | 'sin_preguntar' {
  const t = cadena(obj(bruto)?.tipo)
  return t === 'propio' || t === 'empresa' ? t : 'sin_preguntar'
}

export function interpretarLeads(bruto: unknown): ResultadoLeads {
  const raiz = obj(bruto)
  if (raiz === null) return { ok: false, motivo: 'respuesta_ilegible', causa: null }

  const estado = cadena(raiz.estado)
  // Se distinguen a propósito: `sin_configurar` se arregla poniendo
  // `ASEGURA_OPERADOR_SECRET` en ESTE proyecto; `asegura_error` se arregla en la
  // BD de asegura. Un único «no se pudo» manda a mirar donde no es.
  if (estado === 'sin_configurar') return { ok: false, motivo: 'sin_configurar', causa: null }
  if (estado === 'error') {
    return { ok: false, motivo: 'asegura_error', causa: describirCausaAsegura(cadena(raiz.causa) ?? undefined) }
  }
  if (estado !== 'ok' || !Array.isArray(raiz.leads)) {
    return { ok: false, motivo: 'respuesta_ilegible', causa: null }
  }

  const leads: LeadVista[] = []
  let ilegibles = 0
  for (const bruta of raiz.leads) {
    const f = obj(bruta)
    const id = f === null ? null : cadena(f.id)
    // Sin id no hay ficha a la que ir. Se cuenta en vez de desaparecer: una
    // lista más corta sin decirlo esconde clientes.
    if (f === null || id === null) {
      ilegibles++
      continue
    }
    const est = cadena(f.estado)
    leads.push({
      id,
      compania: cadena(f.compania),
      numeroPoliza: cadena(f.numeroPoliza),
      ramo: cadena(f.ramo),
      // Un estado que no reconocemos no se inventa: se trata como el más
      // conservador («la fecha no está confirmada»), que es el que hace que la
      // pantalla avise en vez de callar.
      estado: est !== null && (ESTADOS as readonly string[]).includes(est) ? (est as EstadoLead) : 'sin_confirmar',
      fechaVencimiento: fecha(f.fechaVencimiento),
      fechaAccionable: fecha(f.fechaAccionable),
      diasParaAccionable: numero(f.diasParaAccionable),
      ventanaPasada: f.ventanaPasada === true,
      urgente: f.urgente === true,
      // 🚨 Solo un `false` explícito es «comprobado, no es de la casa».
      // Cualquier otra cosa —`null`, ausente, basura— es «no lo sabemos».
      yaEnCartera: f.yaEnCartera === false ? false : null,
      clienteId: cadena(f.clienteId),
      // Solo los dos valores explícitos cuentan. Cualquier otra cosa —ausente,
      // null, basura— es «no se preguntó»: inventar aquí un `propio` diría que
      // el cliente afirmó algo que no afirmó.
      titularTipo: titularDe(f.titular),
      titularEmpresa: cadena(obj(f.titular)?.nombre),
      fichaEmpresaId: cadena(f.fichaEmpresaId),
      subidaEn: fecha(f.subidaEn),
      documentoNombre: cadena(f.documentoNombre),
      primaAnual: numero(f.primaAnual),
    })
  }

  return { ok: true, leads, sinIdentificar: numero(raiz.sinIdentificar), ilegibles }
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export type Reenvio = { status: number; json: unknown }

/** `GET /api/operador/leads` — las pólizas que suben los clientes al portal. */
export async function leadsAsegura(): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/leads`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
