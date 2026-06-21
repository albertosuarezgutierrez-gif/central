import { prisma } from '@/lib/db'

/** Valida el secreto Bearer entrante (las verticales llaman con AI_GATEWAY_SECRET). */
export function verificarSecreto(req: Request): boolean {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  const secret = process.env.AI_GATEWAY_SECRET
  return !!secret && token === secret
}

/** Estimación barata de tokens (~4 chars/token) sumando varias cadenas de entrada/salida. */
export function estimarTokens(...partes: (string | null | undefined)[]): number {
  const chars = partes.reduce<number>((n, p) => n + (p ? p.length : 0), 0)
  return Math.ceil(chars / 4)
}

// Precio €/1k tokens por proveedor (override por env). NIM es gratis → 0; Gemini Flash ≈ bajo.
const PRECIO_1K: Record<string, number> = {
  nim: Number(process.env.AI_PRECIO_NIM_EUR_1K ?? 0),
  gemini: Number(process.env.AI_PRECIO_GEMINI_EUR_1K ?? 0.0002),
}

/** Coste € estimado de una llamada según proveedor y tokens. */
export function costeEur(proveedor: string, tokens: number): number {
  const p = PRECIO_1K[proveedor] ?? 0
  return +((p * tokens) / 1000).toFixed(6)
}

/** Registra una llamada de IA (para control de coste). Nunca lanza: un fallo de log no rompe la IA. */
export async function registrarUso(u: {
  app: string; endpoint: string; proveedor: string; modelo: string | null; ok: boolean; ms: number
  tokens?: number; costeEur?: number; error?: string | null
}): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO ai_usos (app, endpoint, proveedor, modelo, ok, ms, tokens, coste_eur, error)
      VALUES (${u.app}, ${u.endpoint}, ${u.proveedor}, ${u.modelo}, ${u.ok}, ${u.ms}, ${u.tokens ?? 0}, ${u.costeEur ?? 0}, ${u.error ?? null})`
  } catch {
    /* no romper la llamada por un fallo de registro */
  }
}

/** Presupuesto mensual GLOBAL (nº de llamadas OK). 0/no definido = sin límite. */
export async function dentroDePresupuesto(): Promise<boolean> {
  const limite = Number(process.env.AI_GATEWAY_LIMITE_MENSUAL ?? 0)
  if (!limite || Number.isNaN(limite)) return true
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM ai_usos WHERE ok = true AND creada_at >= date_trunc('month', now())`
  return Number(rows[0]?.n ?? 0) < limite
}

/** Estado del presupuesto mensual (para avisos en el god-panel). ratio>=0.8 → alerta. */
export async function estadoPresupuesto(): Promise<{ usado: number; limite: number; ratio: number }> {
  const limite = Number(process.env.AI_GATEWAY_LIMITE_MENSUAL ?? 0) || 0
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM ai_usos WHERE ok = true AND creada_at >= date_trunc('month', now())`
  const usado = Number(rows[0]?.n ?? 0)
  return { usado, limite, ratio: limite ? usado / limite : 0 }
}

export type ResumenIA = {
  mes: { total: number; ok: number; errores: number; ms_medio: number; tokens: number; coste: number }
  por_app: { app: string; n: number; coste: number }[]
  por_proveedor: { proveedor: string; n: number }[]
  recientes: { app: string; endpoint: string; proveedor: string; ok: boolean; ms: number; tokens: number; coste: number; error: string | null; creada_at: string }[]
  limite_mensual: number
  presupuesto: { usado: number; limite: number; ratio: number }
}

const num = (v: unknown) => Number((v as bigint | number | null) ?? 0)

/** Datos para el dashboard de gasto de IA del god-panel. */
export async function resumenIA(): Promise<ResumenIA> {
  const [mes, porApp, porProv, recientes, presupuesto] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint; ok: bigint; errores: bigint; ms_medio: number | null; tokens: bigint; coste: number | null }>>`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE ok) AS ok,
             count(*) FILTER (WHERE NOT ok) AS errores,
             COALESCE(avg(ms) FILTER (WHERE ok), 0)::float AS ms_medio,
             COALESCE(sum(tokens), 0) AS tokens,
             COALESCE(sum(coste_eur), 0)::float AS coste
      FROM ai_usos WHERE creada_at >= date_trunc('month', now())`,
    prisma.$queryRaw<Array<{ app: string; n: bigint; coste: number | null }>>`
      SELECT app, count(*) AS n, COALESCE(sum(coste_eur), 0)::float AS coste
      FROM ai_usos WHERE creada_at >= date_trunc('month', now())
      GROUP BY app ORDER BY n DESC`,
    prisma.$queryRaw<Array<{ proveedor: string; n: bigint }>>`
      SELECT proveedor, count(*) AS n FROM ai_usos WHERE creada_at >= date_trunc('month', now())
      GROUP BY proveedor ORDER BY n DESC`,
    prisma.$queryRaw<Array<{ app: string; endpoint: string; proveedor: string; ok: boolean; ms: number; tokens: number; coste_eur: number | null; error: string | null; creada_at: Date }>>`
      SELECT app, endpoint, proveedor, ok, ms, tokens, coste_eur, error, creada_at FROM ai_usos ORDER BY creada_at DESC LIMIT 20`,
    estadoPresupuesto(),
  ])
  return {
    mes: {
      total: num(mes[0]?.total), ok: num(mes[0]?.ok), errores: num(mes[0]?.errores),
      ms_medio: Math.round(num(mes[0]?.ms_medio)), tokens: num(mes[0]?.tokens), coste: num(mes[0]?.coste),
    },
    por_app: porApp.map(r => ({ app: r.app, n: num(r.n), coste: num(r.coste) })),
    por_proveedor: porProv.map(r => ({ proveedor: r.proveedor, n: num(r.n) })),
    recientes: recientes.map(r => ({
      app: r.app, endpoint: r.endpoint, proveedor: r.proveedor, ok: r.ok, ms: r.ms,
      tokens: num(r.tokens), coste: num(r.coste_eur), error: r.error, creada_at: String(r.creada_at),
    })),
    limite_mensual: Number(process.env.AI_GATEWAY_LIMITE_MENSUAL ?? 0) || 0,
    presupuesto,
  }
}
