import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAlertaTokenAuthorized } from "@/lib/cron-auth"
import { getSession } from "@/lib/session"
import { getSmoobuKey } from "@/lib/smoobu"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// POST /api/sivra/pricing/aplicar-propuesta — RAÍLES del agente IA (Paso 4)
//
// Puerto en PLATAFORMA del endpoint homónimo de `apps/sivra`. Por qué existe aquí: la rutina
// programada de Claude Code corre en un entorno cuya política de red solo permite el dominio de
// plataforma — los dominios de sivra NO están en la allowlist, así que desde la rutina el endpoint
// original es INALCANZABLE (403 en el CONNECT del proxy). Además los crons de pricing ya viven en
// plataforma (ver `apps/sivra/CLAUDE.md`: lo interno se consolidó aquí). Comparten la MISMA base de
// datos, así que ambos escriben la misma auditoría.
//
// El agente IA DECIDE precios, pero NO escribe en Smoobu directamente. Manda aquí su propuesta y
// este endpoint la pasa SIEMPRE por los mismos raíles que la IA no puede saltarse (lección de los
// 125€). Orden de la cadena:
//
//   1. PAUSA global (`pricing_config.paused`)      → degrada a dry-run, no escribe nada.
//   2. apply_enabled por piso                       → en vivo, sólo pisos habilitados.
//   3. SUELO de coste (`pricing_settings.min_price`)→ nunca por debajo del coste.
//   4. TOPE ±max_change_pct/DÍA vs precio actual    → no pega saltos bruscos en una pasada.
//   5. TECHO opcional (`max_price`)                 → normalmente NULL (eventos sin techo).
//   6. CIRCUIT-BREAKER                              → si la propuesta CRUDA es disparatada, ABORTA
//      la pasada entera SIN escribir y devuelve alerta para revisión humana.
//   7. Sólo fechas DISPONIBLES en Smoobu (no tocar reservas).
//   8. Escribe en Smoobu `/rates` (sólo si !dryRun y no abortado).
//   9. AUDITA en `pricing_applied` (source='agente') + `pricing_decisiones`.
//
// ── AUTORIZACIÓN ESCALONADA POR PRIVILEGIO (difiere del original a propósito) ──
// Este endpoint mueve DINERO REAL (aplica precios en pisos EN VIVO), así que NO basta con el token
// de rutina para ir a producción:
//   • `ALERTA_TOKEN` (token de bajo privilegio que viaja en el prompt de las rutinas, en un campo de
//     variables que es TEXTO PLANO VISIBLE) → autoriza SÓLO dry-run. Se fuerza `dryRun=true` aunque
//     el body pida lo contrario. Basta para que el agente complete su ciclo, porque el propio skill
//     manda arrancar siempre en dry-run y que Alberto revise antes de soltarlo en vivo.
//   • `CRON_SECRET` (llave maestra) o sesión de admin → pueden aplicar EN VIVO (`dryRun:false`).
// Así el token que puede filtrarse nunca mueve un precio real, respetando el principio declarado en
// `lib/cron-auth.ts` ("nunca dinero real ni órdenes reales").

const BASE = "https://login.smoobu.com/api"
const SMOOBU_ID: Record<string, number> = {
  prop_house_sevillana: 352007,
  prop_busto_reform:    352418,
  prop_duplex_center:   352928,
  prop_luxury_busto:    352943,
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const ISO = /^\d{4}-\d{2}-\d{2}$/

// Circuit-breaker (defensa contra un agente que se desboca). Se mide sobre la propuesta CRUDA
// (intención del agente), ANTES del tope diario: así detectamos la intención disparatada aunque
// el tope la fuera a recortar igualmente, y paramos para revisión humana. Ajustables por query.
const CB_MAX_DATES = 800        // nº total de fechas con cambio en una pasada
const CB_MAX_AVG_ABS_PCT = 0.60 // % medio |propuesto-actual|/actual sobre las fechas con precio actual

type Proposal = {
  property_id: string
  rate_date: string
  price: number
  min_stay?: number | null
  motivo?: string | null
  variables?: Record<string, unknown> | null
}

export async function POST(req: NextRequest) {
  // ── Autorización escalonada (ver cabecera) ──
  const secret = process.env.CRON_SECRET
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const qs = req.nextUrl.searchParams.get("secret")
  const cronOk = !!secret && (bearer === secret || qs === secret)
  const rutinaOk = isAlertaTokenAuthorized(req)
  const sesionOk = cronOk || rutinaOk ? false : !!(await getSession())
  if (!cronOk && !rutinaOk && !sesionOk) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  // Sólo el token de rutina → dry-run forzado (no puede tocar precios en vivo).
  const soloRutina = rutinaOk && !cronOk && !sesionOk

  let body: any = {}
  try { body = await req.json() } catch { /* body vacío */ }
  const rawProposals: Proposal[] = Array.isArray(body?.proposals) ? body.proposals
    : Array.isArray(body) ? body : []

  // dryRun por defecto TRUE (body o query); fuente del cambio (para auditoría).
  const qDry = req.nextUrl.searchParams.get("dryRun")
  let dryRun = body?.dryRun === false || qDry === "false" ? false : true
  // El token de bajo privilegio NUNCA aplica en vivo, pida lo que pida el body.
  let dryRunForzado = false
  if (soloRutina && !dryRun) { dryRun = true; dryRunForzado = true }
  const fuente = String(body?.fuente ?? req.nextUrl.searchParams.get("fuente") ?? "agente").slice(0, 40)
  const cbMaxDates = Number(req.nextUrl.searchParams.get("cbMaxDates") ?? CB_MAX_DATES)
  const cbMaxAvgPct = Number(req.nextUrl.searchParams.get("cbMaxAvgPct") ?? CB_MAX_AVG_ABS_PCT)

  // Validación + saneado de la propuesta (defensivo: ignora filas mal formadas).
  const proposals = rawProposals.filter(p =>
    p && typeof p.property_id === "string" && SMOOBU_ID[p.property_id] != null &&
    typeof p.rate_date === "string" && ISO.test(p.rate_date) &&
    Number.isFinite(Number(p.price)) && Number(p.price) > 0)
  if (proposals.length === 0) {
    return NextResponse.json({ error: "propuesta vacía o inválida", recibidas: rawProposals.length }, { status: 400 })
  }

  // RAÍL 1 — Pausa global: si está pausado, NUNCA escribe (degrada a dry-run).
  let paused = false
  try {
    const cfg = await prisma.$queryRaw<{ paused: boolean }[]>(Prisma.sql`
      SELECT paused FROM pricing_config WHERE id = 1 LIMIT 1`)
    paused = cfg[0]?.paused === true
  } catch { /* sin tabla: no pausado */ }
  if (paused) dryRun = true

  const SMOOBU_KEY = await getSmoobuKey()
  if (!SMOOBU_KEY) return NextResponse.json({ error: "sin SMOOBU key" }, { status: 500 })

  // Ajustes por piso (suelo, tope diario, techo, gate de escritura).
  const settingsRows = await prisma.$queryRaw<{
    property_id: string; min_price: number | null; max_price: number | null
    max_change_pct: number; apply_enabled: boolean
  }[]>(Prisma.sql`
    SELECT property_id, min_price, max_price,
           COALESCE(max_change_pct, 0.20)::float8 AS max_change_pct,
           COALESCE(apply_enabled, false) AS apply_enabled
    FROM pricing_settings`)
  const settings = new Map(settingsRows.map(s => [s.property_id, s]))

  // Agrupar propuesta por piso.
  const byProp = new Map<string, Proposal[]>()
  for (const p of proposals) {
    const arr = byProp.get(p.property_id) ?? []
    arr.push(p); byProp.set(p.property_id, arr)
  }

  // ── FASE 1: calcular (sin escribir) el precio final de cada fecha tras los raíles ──
  type Plan = {
    propId: string; smoobuId: number; apply_enabled: boolean
    ops: { dates: string[]; daily_price: number; min_length_of_stay?: number }[]
    audit: { rate_date: string; old: number | null; proposed: number; final: number; reason: string; min_stay: number | null; motivo: string; variables: any }[]
    errors: string[]
  }
  const plans: Plan[] = []
  let cbDates = 0, cbPctSum = 0, cbPctN = 0, cbMaxSeen = 0

  for (const [propId, props] of byProp) {
    const smoobuId = SMOOBU_ID[propId]
    const s = settings.get(propId)
    const plan: Plan = { propId, smoobuId, apply_enabled: s?.apply_enabled === true, ops: [], audit: [], errors: [] }

    // Precio/disponibilidad actuales en Smoobu sobre el rango de fechas propuesto.
    const dates = props.map(p => p.rate_date).sort()
    const start = dates[0], end = dates[dates.length - 1]
    let cur: Record<string, { price: number | null; available: number }> = {}
    try {
      const res = await fetch(`${BASE}/rates?apartments[]=${smoobuId}&start_date=${start}&end_date=${end}`,
        { headers: { "Api-Key": SMOOBU_KEY, "Cache-Control": "no-cache" }, next: { revalidate: 0 } })
      if (!res.ok) { plan.errors.push(`Smoobu GET ${res.status}`); plans.push(plan); continue }
      cur = (await res.json()).data?.[smoobuId] ?? {}
    } catch (e) {
      plan.errors.push(`Smoobu GET ${String(e).slice(0, 80)}`); plans.push(plan); continue
    }

    const maxChg = s ? Number(s.max_change_pct) : 0.20
    for (const p of props) {
      const info = cur[p.rate_date]
      // RAÍL 7 — sólo fechas disponibles (no pisar reservas).
      if (!info || !info.available) {
        plan.audit.push({ rate_date: p.rate_date, old: info?.price ?? null, proposed: Math.round(Number(p.price)),
          final: info?.price != null ? Math.round(info.price) : 0, reason: "no_disponible",
          min_stay: p.min_stay ?? null, motivo: String(p.motivo ?? ""), variables: p.variables ?? null })
        continue
      }
      const old = info.price != null ? Math.round(info.price) : null
      const proposed = Math.round(Number(p.price))
      let target = proposed
      const reasons: string[] = []

      // Circuit-breaker se mide sobre la INTENCIÓN (propuesta cruda vs actual).
      cbDates++
      if (old != null && old > 0) {
        const pct = Math.abs(proposed - old) / old
        cbPctSum += pct; cbPctN++; cbMaxSeen = Math.max(cbMaxSeen, pct)
      }

      // RAÍL 3 — suelo de coste.
      if (s?.min_price != null && target < s.min_price) { target = s.min_price; reasons.push("suelo") }
      // RAÍL 4 — tope ±max_change_pct/día vs precio actual.
      if (old != null) {
        const lo = Math.round(old * (1 - maxChg)), hi = Math.round(old * (1 + maxChg))
        const capped = clamp(target, lo, hi)
        if (capped !== target) { reasons.push(target > capped ? "tope_subida" : "tope_bajada"); target = capped }
      }
      // RAÍL 5 — techo opcional del propietario (re-aplica suelo por si techo<suelo).
      if (s?.max_price != null && target > s.max_price) { target = s.max_price; reasons.push("techo") }
      if (s?.min_price != null && target < s.min_price) target = s.min_price

      if (old != null && target === old) {
        plan.audit.push({ rate_date: p.rate_date, old, proposed, final: target, reason: "sin_cambio",
          min_stay: p.min_stay ?? null, motivo: String(p.motivo ?? ""), variables: p.variables ?? null })
        continue
      }
      const ms = p.min_stay != null && Number.isFinite(Number(p.min_stay)) && Number(p.min_stay) > 0
        ? Math.round(Number(p.min_stay)) : undefined
      plan.ops.push({ dates: [p.rate_date], daily_price: target, ...(ms ? { min_length_of_stay: ms } : {}) })
      plan.audit.push({ rate_date: p.rate_date, old, proposed, final: target,
        reason: reasons.length ? reasons.join("+") : "ok", min_stay: ms ?? null,
        motivo: String(p.motivo ?? ""), variables: p.variables ?? null })
    }
    plans.push(plan)
  }

  // RAÍL 6 — CIRCUIT-BREAKER global: si la intención del agente es disparatada, ABORTA.
  const cbAvgPct = cbPctN > 0 ? cbPctSum / cbPctN : 0
  const cbTripped = cbDates > cbMaxDates || cbAvgPct > cbMaxAvgPct
  if (cbTripped) {
    // Audita la intención abortada en pricing_decisiones (dry, fuente con sufijo) para revisión.
    await auditDecisiones(plans, true, `${fuente}:CB_ABORT`).catch(() => {})
    return NextResponse.json({
      ok: false, aborted: true, circuit_breaker: {
        dates: cbDates, max_dates: cbMaxDates, avg_abs_pct: Number(cbAvgPct.toFixed(3)),
        max_abs_pct: Number(cbMaxSeen.toFixed(3)), threshold_avg_pct: cbMaxAvgPct,
      },
      message: "Circuit-breaker: la propuesta mueve demasiado. No se ha escrito NADA. Revisión humana.",
    }, { status: 409 })
  }

  // ── FASE 2: escribir (si no dry-run, no pausado, piso habilitado) + auditar ──
  const results: any[] = []
  for (const plan of plans) {
    let written = false
    const canWrite = !dryRun && !paused && plan.apply_enabled && plan.ops.length > 0
    if (canWrite) {
      try {
        const res = await fetch(`${BASE}/rates`, {
          method: "POST",
          headers: { "Api-Key": SMOOBU_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ apartments: [plan.smoobuId], operations: plan.ops }),
        })
        written = res.ok
        if (!res.ok) plan.errors.push(`Smoobu POST ${res.status}`)
      } catch (e) {
        plan.errors.push(`Smoobu POST ${String(e).slice(0, 80)}`)
      }
    }
    results.push({
      property: plan.propId, apply_enabled: plan.apply_enabled,
      fechas_con_cambio: plan.ops.length, written,
      skipped: !plan.apply_enabled && !dryRun ? "apply_enabled=false" : undefined,
      muestra: plan.audit.filter(a => a.reason !== "sin_cambio").slice(0, 4),
      errors: plan.errors.length ? plan.errors : undefined,
    })
  }

  // RAÍL 9 — auditoría completa (pricing_applied + pricing_decisiones).
  await auditApplied(plans, dryRun).catch(() => {})
  await auditDecisiones(plans, dryRun, fuente).catch(() => {})

  return NextResponse.json({
    ok: true, dryRun, paused,
    // Señal explícita para el agente: pidió vivo pero su token sólo autoriza dry-run.
    ...(dryRunForzado ? {
      dryRunForzado: true,
      message: "Token de rutina: sólo dry-run. Para aplicar en vivo hace falta CRON_SECRET o sesión de admin.",
    } : {}),
    circuit_breaker: { dates: cbDates, avg_abs_pct: Number(cbAvgPct.toFixed(3)), tripped: false },
    pisos: results.length, results,
  })
}

// Auditoría de lo aplicado/ que se aplicaría (un INSERT multi-fila por piso, como apply/route.ts).
async function auditApplied(plans: { propId: string; audit: { rate_date: string; old: number | null; final: number; reason: string }[] }[], dryRun: boolean) {
  for (const plan of plans) {
    const rows = plan.audit.filter(a => a.reason !== "sin_cambio" && a.reason !== "no_disponible")
    if (rows.length === 0) continue
    const values = rows.map(a =>
      Prisma.sql`(${plan.propId}, ${a.rate_date}::date, ${a.old}::int, ${a.final}::int, ${dryRun}, 'agente')`)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_applied (property_id, rate_date, old_price, new_price, dry_run, source)
      VALUES ${Prisma.join(values)}`)
  }
}

// Traza la DECISIÓN del agente (precio final + motivo + snapshot de variables) — alimenta el
// bucle de auto-mejora y el chat ("¿por qué X el día Y?").
async function auditDecisiones(
  plans: { propId: string; audit: { rate_date: string; final: number; min_stay: number | null; motivo: string; variables: any }[] }[],
  dryRun: boolean, fuente: string,
) {
  const ciclo = new Date()
  for (const plan of plans) {
    const rows = plan.audit.filter(a => a.final > 0)
    if (rows.length === 0) continue
    const values = rows.map(a =>
      Prisma.sql`(${ciclo}, ${plan.propId}, ${a.rate_date}::date, ${a.final}::int, ${a.min_stay}::int,
        ${a.motivo}, ${JSON.stringify(a.variables ?? {})}::jsonb, ${dryRun}, ${fuente})`)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO pricing_decisiones (ciclo_at, property_id, rate_date, price, min_stay, motivo, variables, dry_run, fuente)
      VALUES ${Prisma.join(values)}`)
  }
}
