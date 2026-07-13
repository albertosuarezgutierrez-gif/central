import { nimVision, cleanJSON, type NimConfig } from '@central/core-ai'
import { prisma } from './db'

// 🛒 Tickets de supermercado: OCR de las líneas con IA de visión (NVIDIA NIM, gratis) + normalización
// de producto/súper + guardado en tickets_compra/tickets_lineas. El comparador de precios (F5b) lee de
// estas tablas. Degrada limpio sin NVIDIA_API_KEY o si las tablas aún no están aplicadas.

export type TicketLinea = {
  productoRaw: string
  productoNorm: string
  cantidad: number | null
  precioUnit: number | null
  precioTotal: number | null
}
export type TicketOCR = {
  super: string
  superNorm: string
  fecha: string | null      // 'YYYY-MM-DD'
  total: number | null
  lineas: TicketLinea[]
}

const TIPOS_IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export function tipoImagenValido(t: string): boolean {
  return (TIPOS_IMG as readonly string[]).includes(t === 'image/jpg' ? 'image/jpeg' : t)
}

// Súpers conocidos → clave normalizada estable (para agrupar y comparar). Si no casa ninguno,
// cae a una versión saneada del nombre.
const SUPERS: Array<[RegExp, string]> = [
  [/mercadona/i, 'mercadona'],
  [/\bdia\b|d[ií]a\s*%|distribuidora internacional/i, 'dia'],
  [/lidl/i, 'lidl'],
  [/carrefour/i, 'carrefour'],
  [/\baldi\b/i, 'aldi'],
  [/alcampo|auchan/i, 'alcampo'],
  [/eroski/i, 'eroski'],
  [/consum/i, 'consum'],
  [/ahorramas|ahorra\s*m[aá]s/i, 'ahorramas'],
  [/mercado\s*de\s*abastos|super\s*sol|supersol/i, 'supersol'],
]

export function normalizarSuper(nombre: string): string {
  const n = (nombre || '').trim()
  for (const [re, key] of SUPERS) if (re.test(n)) return key
  return quitarAcentos(n.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40) || 'otro'
}

function quitarAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Clave normalizada de producto para comparar el MISMO artículo entre súpers (v1, difusa pero útil):
// minúsculas, sin acentos, sin puntuación, colapsando espacios. Se afina con uso (F5b).
export function normalizarProducto(raw: string): string {
  return quitarAcentos((raw || '').toLowerCase())
    .replace(/[^a-z0-9%.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function num(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null
  const n = typeof x === 'number' ? x : Number(String(x).replace(',', '.').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

const PROMPT = `Eres un OCR de tickets de supermercado españoles. De la imagen extrae un JSON con:
- "super": nombre del supermercado (Mercadona, DIA, Lidl, Carrefour…)
- "fecha": fecha de la compra en formato YYYY-MM-DD (o null)
- "total": importe TOTAL pagado como número (o null)
- "lineas": array de líneas de producto, cada una: {"producto": texto del producto tal cual, "cantidad": número o null, "precioUnit": precio unitario o null, "precioTotal": precio de esa línea o null}
Ignora líneas que no sean productos (IVA, TOTAL, TARJETA, cambio, etc.). Usa punto decimal.
Responde SOLO el objeto JSON, sin texto adicional.`

// OCR de la imagen del ticket → cabecera + líneas. null si no hay IA o no se reconoce nada útil.
export async function ocrTicket(base64: string, mediaType: string): Promise<TicketOCR | null> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) return null
  const config: NimConfig = { apiKey }
  const mt = mediaType === 'image/jpg' ? 'image/jpeg' : mediaType

  try {
    const raw = await nimVision(config, '', [{ data: base64, mediaType: mt }], PROMPT, 1500, { temperature: 0.05, signal: AbortSignal.timeout(40_000) })
    const p = JSON.parse(cleanJSON(raw)) as { super?: string; fecha?: string; total?: unknown; lineas?: Array<Record<string, unknown>> }
    const lineasRaw = Array.isArray(p.lineas) ? p.lineas : []
    const lineas: TicketLinea[] = lineasRaw
      .map(l => {
        const productoRaw = String(l.producto ?? '').trim()
        return {
          productoRaw,
          productoNorm: normalizarProducto(productoRaw),
          cantidad: num(l.cantidad),
          precioUnit: num(l.precioUnit),
          precioTotal: num(l.precioTotal),
        }
      })
      .filter(l => l.productoRaw && l.productoNorm)
    if (!lineas.length) return null
    const superNombre = String(p.super ?? '').trim() || 'Súper'
    return {
      super: superNombre,
      superNorm: normalizarSuper(superNombre),
      fecha: p.fecha ? String(p.fecha).slice(0, 10) : null,
      total: num(p.total),
      lineas,
    }
  } catch {
    return null
  }
}

export type TicketGuardado = { id: string; nLineas: number }

// Persiste el ticket + sus líneas (denormalizando super_norm/fecha para el comparador). Lanza si las
// tablas no existen todavía (el caller lo captura para avisar de aplicar la migración).
export async function guardarTicket(cuentaId: string, t: TicketOCR): Promise<TicketGuardado> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO tickets_compra (cuenta_id, super, super_norm, fecha, total, n_lineas)
    VALUES (${cuentaId}::uuid, ${t.super}, ${t.superNorm}, ${t.fecha ? t.fecha : null}::date, ${t.total}, ${t.lineas.length})
    RETURNING id
  `
  const ticketId = rows[0]?.id
  if (!ticketId) throw new Error('no insert')

  for (const l of t.lineas) {
    await prisma.$executeRaw`
      INSERT INTO tickets_lineas (ticket_id, cuenta_id, producto_raw, producto_norm, cantidad, precio_unit, precio_total, super_norm, fecha)
      VALUES (${ticketId}::uuid, ${cuentaId}::uuid, ${l.productoRaw}, ${l.productoNorm}, ${l.cantidad}, ${l.precioUnit}, ${l.precioTotal}, ${t.superNorm}, ${t.fecha ? t.fecha : null}::date)
    `
  }
  return { id: ticketId, nLineas: t.lineas.length }
}

export type TicketResumen = { id: string; super: string; superNorm: string; fecha: string | null; total: number | null; nLineas: number }

// Últimos tickets de la cuenta (para el panel de /banca).
export async function listarTickets(cuentaId: string, limite = 20): Promise<TicketResumen[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; super: string; super_norm: string; fecha: string | null; total: unknown; n_lineas: number }>>`
    SELECT id, super, super_norm, fecha::text AS fecha, total, n_lineas
    FROM tickets_compra
    WHERE cuenta_id = ${cuentaId}::uuid
    ORDER BY COALESCE(fecha, creado_en::date) DESC, creado_en DESC
    LIMIT ${limite}
  `
  return rows.map(r => ({
    id: r.id, super: r.super, superNorm: r.super_norm, fecha: r.fecha,
    total: r.total === null ? null : Number(r.total), nLineas: Number(r.n_lineas),
  }))
}
