import { prisma } from '@/lib/db'
import { tgSend } from '@central/core-telegram'
import type { OpenRouterUsage } from '@central/core-ai'

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

/**
 * Coste € REAL de una llamada OpenRouter usando el usage devuelto y los precios del catálogo
 * del Director (USD por millón de tokens, prompt/completion por separado). Si el modelo no
 * está en el catálogo o no hay usage, cae a la estimación plana `costeEur('openrouter', ...)`.
 */
export function costePorUso(
  modeloId: string,
  usage: OpenRouterUsage | undefined,
  modelos: Array<{ id: string; precio_in?: number; precio_out?: number }>,
): number {
  // El modelo real puede volver con sufijo de variante (':free', ':floor', ':nitro').
  const base = modeloId.split(':')[0]
  if (modeloId.endsWith(':free')) return 0
  const m = modelos.find(x => x.id === modeloId || x.id.split(':')[0] === base)
  if (m && usage && (m.precio_in != null || m.precio_out != null)) {
    const usd = ((usage.prompt_tokens ?? 0) * (m.precio_in ?? 0) + (usage.completion_tokens ?? 0) * (m.precio_out ?? 0)) / 1_000_000
    const eur = usd * Number(process.env.AI_USD_EUR ?? 0.9)
    return +eur.toFixed(6)
  }
  return costeEur('openrouter', usage?.total_tokens ?? 0)
}

/** Registra una llamada de IA (para control de coste). Nunca lanza: un fallo de log no rompe la IA. */
export async function registrarUso(u: {
  app: string; endpoint: string; proveedor: string; modelo: string | null; ok: boolean; ms: number
  tokens?: number; costeEur?: number; error?: string | null; clienteRef?: string | null
}): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO ai_usos (app, endpoint, proveedor, modelo, ok, ms, tokens, coste_eur, error, cliente_ref)
      VALUES (${u.app}, ${u.endpoint}, ${u.proveedor}, ${u.modelo}, ${u.ok}, ${u.ms}, ${u.tokens ?? 0}, ${u.costeEur ?? 0}, ${u.error ?? null}, ${u.clienteRef ?? null})`
  } catch {
    /* no romper la llamada por un fallo de registro */
  }
}

// ── Presupuesto DIARIO en € (bloquea solo proveedores DE PAGO; la cadena gratis sigue) ────────
// Tres niveles y el más restrictivo manda: global (env AI_GATEWAY_LIMITE_DIARIO_EUR, default 1€,
// 0 = sin límite), por vertical y por cliente (tabla ia_presupuestos). Al cruzar un umbral se
// avisa por Telegram UNA vez al día por ámbito (dedup contra los propios registros de bloqueo).

const MARCA_BLOQUEO = 'presupuesto diario excedido'

async function gastoHoy(app?: string, clienteRef?: string): Promise<number> {
  const rows = app
    ? await prisma.$queryRaw<Array<{ c: number | null }>>`
        SELECT COALESCE(sum(coste_eur), 0)::float AS c FROM ai_usos
        WHERE creada_at >= date_trunc('day', now()) AND app = ${app}`
    : clienteRef
      ? await prisma.$queryRaw<Array<{ c: number | null }>>`
          SELECT COALESCE(sum(coste_eur), 0)::float AS c FROM ai_usos
          WHERE creada_at >= date_trunc('day', now()) AND cliente_ref = ${clienteRef}`
      : await prisma.$queryRaw<Array<{ c: number | null }>>`
          SELECT COALESCE(sum(coste_eur), 0)::float AS c FROM ai_usos
          WHERE creada_at >= date_trunc('day', now())`
  return Number(rows[0]?.c ?? 0)
}

async function limiteAmbito(ambito: 'app' | 'cliente', ref: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ l: number | null }>>`
      SELECT limite_diario_eur::float AS l FROM ia_presupuestos WHERE ambito = ${ambito} AND ref = ${ref}`
    return Number(rows[0]?.l ?? 0)
  } catch { return 0 }
}

// Aviso Telegram con dedup diario: solo si hoy aún no hay ningún registro de bloqueo con este motivo.
async function avisarBloqueo(motivo: string): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM ai_usos
      WHERE creada_at >= date_trunc('day', now()) AND ok = false AND error = ${motivo}`
    if (Number(rows[0]?.n ?? 0) === 0) {
      await tgSend(`🔴 <b>IA — presupuesto diario</b>\n${motivo}. Las llamadas DE PAGO quedan bloqueadas hasta mañana; la cadena gratis sigue sirviendo. Ajusta el límite en env/ia_presupuestos si es esperado.`)
    }
  } catch { /* el aviso nunca rompe la pasarela */ }
}

/**
 * ¿Se puede hacer una llamada DE PAGO (OpenRouter/Kimi) ahora mismo? Nunca lanza.
 * Si devuelve { ok: false }, la pasarela salta el camino de pago y sirve con la cadena gratis
 * (el servicio no muere: degrada). El motivo va ya registrable en ai_usos.error.
 */
export async function dentroDePresupuestoDiario(app: string, clienteRef?: string | null): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const limiteGlobal = process.env.AI_GATEWAY_LIMITE_DIARIO_EUR === undefined
      ? 1 : Number(process.env.AI_GATEWAY_LIMITE_DIARIO_EUR)
    if (limiteGlobal > 0 && (await gastoHoy()) >= limiteGlobal) {
      const motivo = `${MARCA_BLOQUEO} (global ${limiteGlobal}€)`
      await avisarBloqueo(motivo)
      return { ok: false, motivo }
    }
    const limiteApp = await limiteAmbito('app', app)
    if (limiteApp > 0 && (await gastoHoy(app)) >= limiteApp) {
      const motivo = `${MARCA_BLOQUEO} (app ${app}: ${limiteApp}€)`
      await avisarBloqueo(motivo)
      return { ok: false, motivo }
    }
    if (clienteRef) {
      const limiteCli = await limiteAmbito('cliente', clienteRef)
      if (limiteCli > 0 && (await gastoHoy(undefined, clienteRef)) >= limiteCli) {
        const motivo = `${MARCA_BLOQUEO} (cliente ${clienteRef}: ${limiteCli}€)`
        await avisarBloqueo(motivo)
        return { ok: false, motivo }
      }
    }
    return { ok: true }
  } catch {
    // Ante un fallo del control (BD caída…), no dejar sin IA: se permite la llamada.
    return { ok: true }
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
  hoy: { coste: number; limite_diario: number }
  por_app: { app: string; n: number; coste: number }[]
  por_proveedor: { proveedor: string; n: number }[]
  por_modelo: { modelo: string; n: number; tokens: number; coste: number }[]
  /** Gasto del mes por cliente final (cliente_ref) — la base de la refacturación. */
  por_cliente: { cliente: string; n: number; tokens: number; coste: number }[]
  /** Decisiones del Director (endpoint 'director'): qué eligió y en qué modo se sirvió. */
  director: { modo: string; total_mes: number; fallos_mes: number; recientes: { modelo: string | null; ok: boolean; ms: number; creada_at: string }[] }
  recientes: { app: string; endpoint: string; proveedor: string; modelo: string | null; ok: boolean; ms: number; tokens: number; coste: number; error: string | null; creada_at: string }[]
  limite_mensual: number
  presupuesto: { usado: number; limite: number; ratio: number }
}

const num = (v: unknown) => Number((v as bigint | number | null) ?? 0)

/** Datos para el dashboard de gasto de IA del god-panel. */
export async function resumenIA(): Promise<ResumenIA> {
  const [mes, porApp, porProv, porModelo, porCliente, director, hoyCoste, recientes, presupuesto] = await Promise.all([
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
    prisma.$queryRaw<Array<{ modelo: string; n: bigint; tokens: bigint; coste: number | null }>>`
      SELECT modelo, count(*) AS n, COALESCE(sum(tokens), 0) AS tokens, COALESCE(sum(coste_eur), 0)::float AS coste
      FROM ai_usos WHERE creada_at >= date_trunc('month', now()) AND modelo IS NOT NULL AND endpoint <> 'director'
      GROUP BY modelo ORDER BY coste DESC, n DESC LIMIT 15`,
    prisma.$queryRaw<Array<{ cliente_ref: string; n: bigint; tokens: bigint; coste: number | null }>>`
      SELECT cliente_ref, count(*) AS n, COALESCE(sum(tokens), 0) AS tokens, COALESCE(sum(coste_eur), 0)::float AS coste
      FROM ai_usos WHERE creada_at >= date_trunc('month', now()) AND cliente_ref IS NOT NULL
      GROUP BY cliente_ref ORDER BY coste DESC, n DESC LIMIT 20`,
    prisma.$queryRaw<Array<{ total: bigint; fallos: bigint }>>`
      SELECT count(*) AS total, count(*) FILTER (WHERE NOT ok) AS fallos
      FROM ai_usos WHERE endpoint = 'director' AND creada_at >= date_trunc('month', now())`,
    prisma.$queryRaw<Array<{ c: number | null }>>`
      SELECT COALESCE(sum(coste_eur), 0)::float AS c FROM ai_usos WHERE creada_at >= date_trunc('day', now())`,
    prisma.$queryRaw<Array<{ app: string; endpoint: string; proveedor: string; modelo: string | null; ok: boolean; ms: number; tokens: number; coste_eur: number | null; error: string | null; creada_at: Date }>>`
      SELECT app, endpoint, proveedor, modelo, ok, ms, tokens, coste_eur, error, creada_at FROM ai_usos ORDER BY creada_at DESC LIMIT 20`,
    estadoPresupuesto(),
  ])
  const decisionesDirector = await prisma.$queryRaw<Array<{ modelo: string | null; ok: boolean; ms: number; creada_at: Date }>>`
    SELECT modelo, ok, ms, creada_at FROM ai_usos WHERE endpoint = 'director' ORDER BY creada_at DESC LIMIT 10`
    .catch(() => [] as Array<{ modelo: string | null; ok: boolean; ms: number; creada_at: Date }>)
  return {
    mes: {
      total: num(mes[0]?.total), ok: num(mes[0]?.ok), errores: num(mes[0]?.errores),
      ms_medio: Math.round(num(mes[0]?.ms_medio)), tokens: num(mes[0]?.tokens), coste: num(mes[0]?.coste),
    },
    hoy: {
      coste: num(hoyCoste[0]?.c),
      limite_diario: process.env.AI_GATEWAY_LIMITE_DIARIO_EUR === undefined ? 1 : Number(process.env.AI_GATEWAY_LIMITE_DIARIO_EUR),
    },
    por_app: porApp.map(r => ({ app: r.app, n: num(r.n), coste: num(r.coste) })),
    por_proveedor: porProv.map(r => ({ proveedor: r.proveedor, n: num(r.n) })),
    por_modelo: porModelo.map(r => ({ modelo: r.modelo, n: num(r.n), tokens: num(r.tokens), coste: num(r.coste) })),
    por_cliente: porCliente.map(r => ({ cliente: r.cliente_ref, n: num(r.n), tokens: num(r.tokens), coste: num(r.coste) })),
    director: {
      modo: process.env.OPENROUTER_API_KEY ? (process.env.DIRECTOR_MODO === 'activo' ? 'activo' : 'sombra') : 'inactivo',
      total_mes: num(director[0]?.total), fallos_mes: num(director[0]?.fallos),
      recientes: decisionesDirector.map(d => ({ modelo: d.modelo, ok: d.ok, ms: d.ms, creada_at: String(d.creada_at) })),
    },
    recientes: recientes.map(r => ({
      app: r.app, endpoint: r.endpoint, proveedor: r.proveedor, modelo: r.modelo, ok: r.ok, ms: r.ms,
      tokens: num(r.tokens), coste: num(r.coste_eur), error: r.error, creada_at: String(r.creada_at),
    })),
    limite_mensual: Number(process.env.AI_GATEWAY_LIMITE_MENSUAL ?? 0) || 0,
    presupuesto,
  }
}
