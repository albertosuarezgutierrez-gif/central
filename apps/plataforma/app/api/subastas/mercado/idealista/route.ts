import { NextRequest, NextResponse } from "next/server"
import { isRoutineAuthorized } from "@/lib/cron-auth"
import { upsertComparable } from "@/lib/subastas/mercado"
import { comparablesDesdeMcpIdealista, type AnuncioIdealistaMcp } from "@central/module-subastas"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/subastas/mercado/idealista
// Ingesta de anuncios del CONECTOR de Idealista en Claude (skill `idealista-radar`). Sustituye a las
// alertas de correo de Idealista (quitadas el 24/09/2026); Fotocasa sigue por correo.
//
// Cuerpo: { "busquedas": [ { "nucleo": "Matalascañas", "properties": [ …tal cual del conector… ] } ] }
//
// La zona la decide el `nucleo` (no el título del portal, que dice «Almonte» para Matalascañas) y lo
// que cae fuera de su radio se descarta — ver `comparablesDesdeMcpIdealista`. Entra por el MISMO
// `upsertComparable` que los correos: dedupe por propertyCode y seguimiento de bajadas incluidos.
// Los avisos (chollos, 🌊 casas de playa, bajadas) NO salen de aquí: los calcula el cron
// `subastas-mercado` sobre el corpus, igual que con los anuncios del correo.
const MAX_BUSQUEDAS = 20
const MAX_ANUNCIOS_POR_BUSQUEDA = 50

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const busquedas = Array.isArray(body?.busquedas) ? body.busquedas : null
  if (!busquedas?.length) return NextResponse.json({ error: "falta `busquedas[]`" }, { status: 400 })
  if (busquedas.length > MAX_BUSQUEDAS) {
    return NextResponse.json({ error: `máximo ${MAX_BUSQUEDAS} búsquedas por llamada` }, { status: 400 })
  }

  const ahora = new Date()
  const porNucleo: Array<{ nucleo: string; recibidos: number; comparables: number; upserts: number; fueraDeZona: number; error?: string }> = []
  for (const b of busquedas) {
    const nucleo = String(b?.nucleo ?? "").trim()
    const properties: AnuncioIdealistaMcp[] = Array.isArray(b?.properties) ? b.properties.slice(0, MAX_ANUNCIOS_POR_BUSQUEDA) : []
    let res
    try {
      res = comparablesDesdeMcpIdealista(properties, nucleo)
    } catch (e: any) {
      // Núcleo sin centro: se rechaza ESA búsqueda y se dice, sin tumbar las demás.
      porNucleo.push({ nucleo, recibidos: properties.length, comparables: 0, upserts: 0, fueraDeZona: 0, error: String(e?.message ?? e) })
      continue
    }
    let upserts = 0
    for (const c of res.comparables) upserts += await upsertComparable(c, ahora)
    porNucleo.push({ nucleo, recibidos: properties.length, comparables: res.comparables.length, upserts, fueraDeZona: res.fueraDeZona.length })
  }

  const conError = porNucleo.filter((n) => n.error)
  return NextResponse.json(
    {
      ok: conError.length === 0,
      comparables: porNucleo.reduce((s, n) => s + n.comparables, 0),
      upserts: porNucleo.reduce((s, n) => s + n.upserts, 0),
      fueraDeZona: porNucleo.reduce((s, n) => s + n.fueraDeZona, 0),
      porNucleo,
    },
    // Todas rechazadas → 422 para que la rutina no lo lea como pasada buena.
    { status: conError.length === porNucleo.length ? 422 : 200 },
  )
}
