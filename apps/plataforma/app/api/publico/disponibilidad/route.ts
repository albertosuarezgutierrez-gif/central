import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { smoobuFetch } from '@/lib/smoobu'
import { noches, clasificar } from '@/lib/sivra/disponibilidad-publica'
import { cabecerasCors } from '@/lib/sivra/cors-publico'

export const dynamic = 'force-dynamic'

// Disponibilidad pública de un piso, para el calendario de la landing.
//
// 🔓 Endpoint SIN AUTENTICAR (está en la lista PUBLIC del middleware). Lo que publica —qué
// noches están cogidas— ya se lo enseña el motor de reservas de Smoobu a cualquiera que entre
// en él; aquí no sale ni un huésped, ni un importe, ni un identificador de reserva. La lista
// blanca de slugs impide además que sirva de índice de las propiedades del grupo.
//
// 🚨 Y por eso mismo sus cabeceras CORS son un comodín FIJO (`lib/sivra/cors-publico.ts`): esta
// respuesta se cachea en el CDN, y una respuesta cacheada no puede depender del `Origin` de quien
// pregunta. No ramifiques aquí por origen — hay un test que lo vigila.
//
// 🚨 La regla que gobierna este fichero: NUNCA devolver una lista vacía porque una consulta
// falló. Una noche está ocupada, o no se sabe, o está libre por descarte — y si no podemos
// afirmar ninguna de las tres, esto responde 503 y la landing enseña un aviso. Un
// `ocupadas: []` de consuelo se pintaría aguas abajo como un calendario entero disponible, que
// es la forma más cara de mentir que tiene esta web.

const PISOS: Record<string, { propId: string; smoobuId: string }> = {
  // Mismos identificadores que `app/api/sivra/rates/snapshot/route.ts`. Hoy la landing solo
  // pregunta por House Sevillana; los demás están listos por si se les hace web propia.
  'house-sevillana': { propId: 'prop_house_sevillana', smoobuId: '352007' },
  'busto-reform': { propId: 'prop_busto_reform', smoobuId: '352418' },
  'duplex-center': { propId: 'prop_duplex_center', smoobuId: '352928' },
  'luxury-busto': { propId: 'prop_luxury_busto', smoobuId: '352943' },
}

// 🚨 `max-age=0, must-revalidate` es para el NAVEGADOR; `s-maxage` para el CDN.
//
// Antes esto era `public, s-maxage=600, stale-while-revalidate=3600`, sin `max-age`. Para una
// caché privada (el navegador) eso NO fija vida útil, así que Chrome la calcula por heurística
// —cero, sin validador— y entonces el `stale-while-revalidate` le AUTORIZA a seguir sirviendo su
// copia guardada hasta una hora mientras revalida por detrás. Resultado el 20/08/2026: con el
// endpoint ya arreglado y respondiendo bien a cualquiera, la landing seguía enseñando el aviso de
// error, porque el navegador se servía a sí mismo la copia vieja —la que no llevaba
// `Access-Control-Allow-Origin`— de antes del arreglo. Desde el servidor era imposible de ver.
//
// Se renuncia al `stale-while-revalidate` a propósito: no hay forma de pedirlo solo para el CDN
// (`must-revalidate` vale para todas las cachés), y en un calendario del que la gente reserva es
// mejor pagar una revalidación que enseñar una noche libre que ya no lo está.
const CACHE = 'public, max-age=0, must-revalidate, s-maxage=600'

/** Antigüedad máxima del respaldo. El cron de snapshots corre a diario: 2 días = cron muerto. */
const DIAS_SNAPSHOT_VALIDO = 2

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cabecerasCors(),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}

export async function GET(req: NextRequest) {
  const cors = cabecerasCors()
  const url = new URL(req.url)

  const slug = url.searchParams.get('piso') ?? ''
  const piso = PISOS[slug]
  if (!piso) {
    // 400 con el slug de vuelta, no un listado: quien se equivoca de nombre no tiene por qué
    // enterarse de cuántos pisos hay ni de cómo se llaman los otros.
    return NextResponse.json(
      { error: 'piso desconocido', piso: slug },
      { status: 400, headers: cors },
    )
  }

  const meses = Math.min(12, Math.max(1, Number(url.searchParams.get('meses')) || 12))
  const hoy = new Date()
  const desde = fmt(hoy)
  const finDate = new Date(hoy)
  finDate.setUTCMonth(finDate.getUTCMonth() + meses)
  const hasta = fmt(finDate)
  const fechas = noches(desde, hasta)

  // --- Fuente 1: Smoobu en vivo -------------------------------------------------------------
  try {
    const res = await smoobuFetch(
      `/api/rates?apartments[]=${piso.smoobuId}&start_date=${desde}&end_date=${hasta}`,
    )
    if (res.ok) {
      const cuerpo = await res.json()
      const rates = cuerpo?.data?.[piso.smoobuId]
      // Un 200 con `data` ausente no es «no hay nada reservado»: es una respuesta que no
      // entendemos. Se cae al respaldo en vez de tomarla por buena.
      if (rates && typeof rates === 'object') {
        const { ocupadas, sinDato } = clasificar(rates, fechas)
        return NextResponse.json(
          {
            piso: slug,
            desde,
            hasta,
            fuente: 'smoobu',
            actualizado: new Date().toISOString(),
            ocupadas,
            sinDato,
          },
          { headers: { ...cors, 'Cache-Control': CACHE } },
        )
      }
    }
  } catch {
    // Red caída o JSON ilegible. Se sigue al respaldo; lo que NO se hace es seguir adelante
    // con un objeto vacío, que saldría como «todas las noches libres».
  }

  // --- Fuente 2: el último snapshot, si es reciente ------------------------------------------
  try {
    const filas = await prisma.$queryRaw<
      { rate_date: Date; available: number | null; snapshot_date: Date }[]
    >`
      SELECT rate_date, available, snapshot_date
      FROM rate_snapshots
      WHERE property_id = ${piso.propId}
        AND snapshot_date = (
          SELECT MAX(snapshot_date) FROM rate_snapshots
          WHERE property_id = ${piso.propId}
            AND snapshot_date >= CURRENT_DATE - ${DIAS_SNAPSHOT_VALIDO}::int
        )
        AND rate_date >= CURRENT_DATE
    `
    if (filas.length) {
      const rates: Record<string, { available: number | null }> = {}
      for (const f of filas) rates[fmt(new Date(f.rate_date))] = { available: f.available }
      const { ocupadas, sinDato } = clasificar(rates, fechas)
      return NextResponse.json(
        {
          piso: slug,
          desde,
          hasta,
          fuente: 'snapshot',
          // La fecha del SNAPSHOT, no la de ahora. Es el dato honesto: la landing la enseña
          // tal cual («disponibilidad actualizada el …») para que se vea que esto no viene de
          // este segundo. Poner `now()` aquí disfrazaría de fresco un dato de ayer.
          actualizado: new Date(filas[0].snapshot_date).toISOString(),
          ocupadas,
          sinDato,
        },
        { headers: { ...cors, 'Cache-Control': CACHE } },
      )
    }
  } catch {
    // BD caída. Igual que arriba: no se inventa una respuesta.
  }

  // --- Ni Smoobu ni snapshot: se dice que no se sabe -----------------------------------------
  return NextResponse.json(
    { error: 'disponibilidad no disponible' },
    { status: 503, headers: { ...cors, 'Cache-Control': 'no-store' } },
  )
}
