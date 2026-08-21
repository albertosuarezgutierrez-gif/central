import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { tgSend } from "@central/core-telegram"
import { AGENTES_VIGILADOS } from "@/lib/monitoring/latidos"

export const dynamic = "force-dynamic"

// POST /api/internal/reparacion-resultado  { id, estado, prNumero?, runUrl?, motivo? }
//
// El workflow reporta cómo acabó el intento que reclamó. Cierra el claim: mientras la fila siga en
// `intentando`, el disparador no vuelve a elegir ese agente.
//
// ESTADOS QUE ACEPTA:
//   · `mergeada`   — pasó el gate de prueba y se mergeó sola. NO avisa: el éxito es silencio, y el
//                    veredicto de verdad lo dicta el latido a las 24 h (cron `agentes-latido`).
//   · `pr_abierto` — no hubo forma de probar el arreglo (sin test que discrimine, o el diff tocaba
//                    el carril acotado). Queda PR draft y SÍ avisa: este es el «no he sabido» que
//                    Alberto pidió que le llegara.
//   · `fallida`    — el orquestador no produjo nada aplicable. Avisa igual, con menos ruido.

const ESTADOS = new Set(["mergeada", "pr_abierto", "fallida"])

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const id = Number(body?.id)
  const estado = String(body?.estado ?? "")
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 })
  if (!ESTADOS.has(estado)) {
    return NextResponse.json({ error: `estado inválido: ${estado}. Válidos: ${[...ESTADOS].join(", ")}` }, { status: 400 })
  }
  const prNumero = Number.isInteger(Number(body?.prNumero)) ? Number(body.prNumero) : null
  const runUrl = body?.runUrl ? String(body.runUrl).slice(0, 500) : null
  const motivo = body?.motivo ? String(body.motivo).slice(0, 400) : null

  const [fila] = await prisma.$queryRaw<{ agente: string; firma: string }[]>(Prisma.sql`
    UPDATE agente_reparaciones
       SET estado = ${estado},
           pr_numero = COALESCE(${prNumero}::int, pr_numero),
           run_url = COALESCE(${runUrl}::text, run_url),
           -- merged_at es el reloj del veredicto de 24 h: solo se marca al mergear de verdad.
           merged_at = CASE WHEN ${estado} = 'mergeada' THEN now() ELSE merged_at END
     WHERE id = ${id}
     RETURNING agente, firma`)
  if (!fila) return NextResponse.json({ error: "reparación no encontrada" }, { status: 404 })

  const etiqueta = AGENTES_VIGILADOS.find(a => a.id === fila.agente)?.etiqueta ?? fila.agente

  // El éxito NO manda nada: si el arreglo entra y el agente vuelve a latir, Alberto no tiene por qué
  // enterarse. Solo habla lo que necesita su intervención.
  if (estado !== "mergeada") {
    const enlace = prNumero ? `\n\nPR draft: #${prNumero}` : runUrl ? `\n\nRun: ${runUrl}` : ""
    try {
      await tgSend(
        `🔧⚠️ <b>No he sabido reparar ${etiqueta}</b>\n\n` +
          (estado === "pr_abierto"
            ? "El orquestador escribió un parche pero <b>no pasó el gate de prueba</b> (o tocaba " +
              "algo del carril acotado), así que NO se ha mergeado nada. Está en un PR draft para que " +
              "lo mires."
            : "El orquestador no produjo un cambio aplicable.") +
          (motivo ? `\n\nMotivo: ${motivo}` : "") +
          enlace,
        { html: true },
      )
    } catch { /* best-effort */ }
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE agente_reparaciones SET avisado_at = now() WHERE id = ${id} AND ${estado} <> 'mergeada'`)

  return NextResponse.json({ ok: true })
}
