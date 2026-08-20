import { NextRequest, NextResponse } from "next/server"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"

export const dynamic = "force-dynamic"

// POST /api/internal/latido  { agente, ok, detalle? }
//
// Deja huella de la pasada de un agente que NO es un cron de Vercel sino una RUTINA de Claude Code
// (sesión efímera, sin acceso a `registrarLatido` porque eso corre en el servidor).
//
// POR QUÉ (06/08/2026). El vigía de latidos solo sabía de los crons: una rutina que dejara de
// dispararse —o que corriera y no terminara— no encendía ninguna luz. Es el mismo agujero que tuvo
// `facturas-scan` antes del 30/07, y el más caro de todos, porque el silencio de un agente se lee
// como «no había nada que hacer».
//
// 🚨 ALLOWLIST a propósito: solo los agentes de rutina declarados aquí. El token que abre este
// endpoint (`ALERTA_TOKEN`) viaja en prompts de rutinas, así que si se filtrara, lo peor que
// permite es marcar el latido de UNO de estos agentes — nunca inventar un agente nuevo ni tocar
// la huella de un cron del servidor (esos la escriben ellos mismos, dentro del trabajo que hacen).
const AGENTES_DE_RUTINA = ["sivra_mercado_booking", "trading_operaciones"]

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const agente = String(body?.agente ?? "")
  if (!AGENTES_DE_RUTINA.includes(agente)) {
    return NextResponse.json(
      { error: `agente no permitido: ${agente || "(vacío)"}. Permitidos: ${AGENTES_DE_RUTINA.join(", ")}` },
      { status: 400 },
    )
  }
  // `ok` tiene que venir EXPLÍCITO: un body sin el campo no puede colar como pasada buena — sería
  // un verde por omisión, que es peor que no tener latido.
  if (typeof body?.ok !== "boolean") {
    return NextResponse.json({ error: "falta `ok` (boolean explícito)" }, { status: 400 })
  }

  const detalle = body?.detalle != null ? String(body.detalle).slice(0, 500) : null
  try {
    await registrarLatido(agente, body.ok, detalle)
  } catch (e) {
    // Si la huella no se puede escribir, el fallo se DEVUELVE: una rutina que cree haber latido y
    // no lo hizo acabaría en un «sin ninguna señal» que manda a buscar al sitio equivocado.
    return NextResponse.json({ error: `no se pudo registrar: ${String(e).slice(0, 120)}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, agente, registrado: body.ok, detalle })
}
