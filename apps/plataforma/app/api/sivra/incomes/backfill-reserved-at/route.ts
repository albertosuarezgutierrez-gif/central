import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSession } from "@/lib/session"
import { getSmoobuKey } from "@/lib/smoobu"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/sivra/incomes/backfill-reserved-at?desde=2020-01&hasta=2026-12
//
// Rellena `incomes.reserved_at` —la fecha REAL en que se hizo cada reserva— trayéndola de Smoobu.
//
// POR QUÉ (01/08/2026). El análisis de octubre daba por imposible reconstruir la curva de
// anticipación porque `incomes.createdAt` es, en casi todo el histórico, la fecha de la importación
// masiva. Cierto de esa columna — pero la API de Smoobu publica `created-at`, y lo trae también
// para las reservas antiguas (verificado contra octubre de 2024 y 2025: 108 reservas, el 100% con
// fecha real, la más antigua creada cinco meses antes de la entrada).
//
// Lo que desbloquea: medir la antelación POR PISO Y POR MES con años de histórico, en vez de con
// los 78 días que lleva vivo `rate_snapshots`. Y esa distinción no es cosmética — en octubre, Busto
// vende con 3-13 días de antelación mientras su mediana global sale 108.
//
// Es IDEMPOTENTE y solo rellena huecos (`reserved_at IS NULL`), así que se puede relanzar sin
// miedo. Pensado para dispararse a mano una vez; a partir de ahí el sync diario mantiene el dato.

const PAGE_SIZE = 100

function mesesEntre(desde: string, hasta: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = []
  const [y0, m0] = desde.split("-").map(Number)
  const [y1, m1] = hasta.split("-").map(Number)
  let y = y0, m = m0
  while (y < y1 || (y === y1 && m <= m1)) {
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
    out.push({
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to: `${y}-${String(m).padStart(2, "0")}-${ultimo}`,
    })
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const apiKey = await getSmoobuKey()
  if (!apiKey) return NextResponse.json({ ok: false, error: "SMOOBU_API_KEY no configurada" }, { status: 409 })

  const u = new URL(req.url)
  const desde = u.searchParams.get("desde") || "2020-01"
  const hasta = u.searchParams.get("hasta") || new Date().toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ ok: false, error: "desde/hasta con formato YYYY-MM" }, { status: 400 })
  }

  // Presupuesto de tiempo explícito: subir el maxDuration solo mueve la pared, lo que garantiza que
  // la pasada VUELVE (y deja constancia de por dónde iba) es cortar a tiempo. Lección del 504 de
  // `facturas-scan` del 31/07/2026.
  const deadline = Date.now() + 240_000

  const meses = mesesEntre(desde, hasta)
  let actualizadas = 0, vistas = 0, sinCasar = 0
  const errores: string[] = []
  let ultimoMes = ""
  let truncado = false

  for (const { from, to } of meses) {
    if (Date.now() > deadline) { truncado = true; break }
    ultimoMes = from.slice(0, 7)
    try {
      for (let page = 1; page <= 20; page++) {
        const q = new URLSearchParams({
          pageSize: String(PAGE_SIZE), page: String(page), from, to, showCancellation: "1",
        })
        const res = await fetch(`https://login.smoobu.com/api/reservations?${q}`, {
          headers: { "Api-Key": apiKey }, cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        })
        if (!res.ok) { errores.push(`${from}: Smoobu ${res.status}`); break }
        const data = await res.json()
        const bookings: any[] = data.bookings || []
        vistas += bookings.length

        for (const b of bookings) {
          const creada = b["created-at"]
          if (!creada) continue
          const rid = String(b.id)
          // Solo rellena huecos: no pisa lo que ya hay, así que relanzarlo es inocuo.
          const n = await prisma.$executeRaw(Prisma.sql`
            UPDATE incomes SET reserved_at = ${creada}::timestamptz
            WHERE "reservationId" = ${rid} AND reserved_at IS NULL`)
          if (n > 0) actualizadas += n
          else sinCasar++
        }

        if (page >= (data.page_count || 1)) break
        if (Date.now() > deadline) { truncado = true; break }
      }
    } catch (e) {
      errores.push(`${from}: ${String(e).slice(0, 120)}`)
    }
  }

  // Cobertura resultante, para saber si ha servido de algo sin tener que ir a mirar a mano.
  const [cobertura] = await prisma.$queryRaw<{ total: bigint; con_fecha: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS total, COUNT(reserved_at) AS con_fecha FROM incomes`)

  return NextResponse.json({
    ok: errores.length === 0 && !truncado,
    truncado,
    // `truncado` NO es un fallo: es «me quedé sin tiempo». Relanza desde `siguiente_desde`.
    siguiente_desde: truncado ? ultimoMes : null,
    meses: meses.length,
    vistas, actualizadas,
    // `sinCasar` son reservas de Smoobu que no están en `incomes` (canceladas y borradas, bloqueos,
    // o pisos que ya no gestionamos) o que ya tenían fecha. No es un error.
    sin_casar: sinCasar,
    cobertura: {
      total: Number(cobertura?.total ?? 0),
      con_fecha_real: Number(cobertura?.con_fecha ?? 0),
    },
    errores,
  })
}
