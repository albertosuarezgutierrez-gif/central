import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { tgSend } from "@central/core-telegram"
import { evaluarLatido, AGENTES_VIGILADOS } from "@/lib/monitoring/latidos"
import { decidirReparacion, type IntentoPrevio } from "@/lib/monitoring/reparable"

export const dynamic = "force-dynamic"

// POST /api/internal/reclamar-reparacion   (lo llama `.github/workflows/latido-reparar.yml`, 08:00 UTC)
//
// ¿Hay algún agente cuya avería tenga pinta de arreglarse tocando código? Devuelve COMO MUCHO UNO y
// registra el intento en el MISMO movimiento (claim), igual que `cron_dispatch_cursor`: si el
// workflow muere a mitad, la fila queda en `intentando` y frena el disparo del día siguiente en vez
// de reintentar en bucle.
//
// Auth de RUTINA (`ALERTA_TOKEN`), no `CRON_SECRET`: quien llama es un workflow de GitHub y su token
// vive en los secrets del repo. El alcance de este endpoint es mínimo — leer latidos y anotar un
// intento; no aplica precios, no escribe código, no toca dinero.
//
// 🚨 LO QUE SE DEVUELVE ES EVIDENCIA, NO DIAGNÓSTICO. Se manda el `detalle` crudo del latido y nada
// más: NUNCA la `nota` de `AGENTES_VIGILADOS`. El 20/08/2026 la nota de `sivra_canal` afirmaba que
// un fallo ahí significaba que «el problema está aguas arriba, en la rutina de Booking y en el plan
// de escaparate, no en este cron» — y era falso: las 22 mediciones estaban y el cron moría en su
// primera consulta. Un reparador que lea la narración va derecho al fichero equivocado.

/** Solo se consideran los agentes cuya huella vive en `agente_latidos`: son los únicos con parte. */
type FilaLatido = {
  agente: string
  ultimo_ok_at: Date | null
  ultimo_at: Date | null
  detalle: string | null
}

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  const ahora = new Date()

  const latidos = await prisma.$queryRaw<FilaLatido[]>(Prisma.sql`
    SELECT agente, ultimo_ok_at, ultimo_at, detalle FROM agente_latidos`)

  const historial = await prisma.$queryRaw<
    { agente: string; firma: string; estado: string; intento_at: Date }[]
  >(Prisma.sql`
    SELECT agente, firma, estado, intento_at FROM agente_reparaciones
     WHERE intento_at >= now() - interval '90 days'
     ORDER BY intento_at DESC`)

  const porAgente = new Map<string, IntentoPrevio[]>()
  for (const h of historial) {
    const l = porAgente.get(h.agente) ?? []
    l.push({ firma: h.firma, estado: h.estado, intentoAt: h.intento_at })
    porAgente.set(h.agente, l)
  }

  const descartados: { agente: string; motivo: string }[] = []
  const rendidos: { agente: string; firma: string | null }[] = []

  for (const ag of AGENTES_VIGILADOS) {
    const fila = latidos.find((l: FilaLatido) => l.agente === ag.id)
    if (!fila) continue // su huella no es `agente_latidos` (tabla de dominio): no hay parte que leer

    const ev = evaluarLatido({
      ahora,
      ultimo: fila.ultimo_ok_at,
      maxHoras: ag.maxHoras,
      ultimoIntento: fila.ultimo_at,
      detalle: fila.detalle,
    })
    const d = decidirReparacion({
      ahora,
      detalle: fila.detalle,
      alerta: ev.alerta,
      historial: porAgente.get(ag.id) ?? [],
    })
    if (!d.reparar) {
      if (ev.alerta) descartados.push({ agente: ag.id, motivo: d.motivo })
      if (d.agotado) rendidos.push({ agente: ag.id, firma: d.firma })
      continue
    }

    // ── Claim: se anota el intento ANTES de contestar. Sin esto, un workflow que muera después de
    // pedir el trabajo y antes de reportar dejaría el agente elegible otra vez mañana, y otra, y otra.
    const [fijada] = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
      INSERT INTO agente_reparaciones (agente, firma, detalle, estado)
      VALUES (${ag.id}, ${d.firma}, ${fila.detalle}, 'intentando')
      RETURNING id`)

    await avisarRendidos(rendidos)
    return NextResponse.json({
      hay: true,
      reparacion: {
        id: Number(fijada.id),
        agente: ag.id,
        firma: d.firma,
        // Evidencia cruda. Sin narración, sin `nota`, sin hipótesis.
        detalle: fila.detalle,
        motivo: d.motivo,
      },
      descartados,
    })
  }

  await avisarRendidos(rendidos)
  return NextResponse.json({ hay: false, descartados })
}

/**
 * Un agente que agota sus intentos NO puede quedarse en silencio: es justo el caso en el que hace
 * falta el ojo de Alberto. Se avisa UNA vez por firma (marca `avisado_at` en el último intento).
 */
async function avisarRendidos(rendidos: { agente: string; firma: string | null }[]) {
  for (const r of rendidos) {
    const pendientes = await prisma.$executeRaw(Prisma.sql`
      UPDATE agente_reparaciones SET avisado_at = now(), estado = 'rendida'
       WHERE id = (SELECT id FROM agente_reparaciones
                    WHERE agente = ${r.agente} AND avisado_at IS NULL
                    ORDER BY intento_at DESC LIMIT 1)`)
    if (pendientes === 0) continue // ya avisado: no se repite
    const etiqueta = AGENTES_VIGILADOS.find(a => a.id === r.agente)?.etiqueta ?? r.agente
    try {
      await tgSend(
        `🔧🙅 <b>Me rindo con ${etiqueta}</b>\n\n` +
          `He intentado repararlo automáticamente y no he sabido. No voy a seguir abriendo PRs ` +
          `sobre esto: necesita tu ojo.\n\n` +
          `Última firma del fallo: <code>${r.firma ?? "(sin firma)"}</code>`,
        { html: true },
      )
    } catch { /* el aviso es best-effort; el estado en BD manda */ }
  }
}
