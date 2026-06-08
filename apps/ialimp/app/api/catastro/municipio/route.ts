import { NextResponse } from 'next/server'

// ──────────────────────────────────────────────────────────────────
// GET /api/catastro/municipio?cp=41003
// Devuelve municipio + provincia a partir del código postal
// Fuente: OpenStreetMap Nominatim (gratuito, sin API key)
// Se ejecuta server-side → sin CORS, sin exponer la IP del usuario
// ──────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const cp = searchParams.get('cp')?.trim()

    if (!cp || !/^\d{5}$/.test(cp)) {
      return NextResponse.json(
        { error: 'Código postal inválido' },
        { status: 400 }
      )
    }

    const url = `https://nominatim.openstreetmap.org/search?postalcode=${cp}&country=ES&format=json&addressdetails=1&limit=1`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'IALIMP-SaaS/1.0 (limpieza@app.ialimp.es)',
        'Accept-Language': 'es',
      },
      // Nominatim pide máx 1 req/seg — en producción añadir cache
      next: { revalidate: 86400 }, // cache 24h por CP
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Error Nominatim' }, { status: 502 })
    }

    const data = await res.json()

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Código postal no encontrado' },
        { status: 404 }
      )
    }

    const addr = data[0].address
    const municipio =
      addr.city || addr.town || addr.village || addr.county || addr.municipality || ''
    const provincia = addr.province || addr.county || addr.state || ''
    const comunidad = addr.state || ''

    return NextResponse.json({
      cp,
      municipio,
      provincia,
      comunidad,
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
