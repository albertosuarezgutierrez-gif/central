// Borrador de oferta a la baja para un chollo. La IA SOLO redacta: todas las
// cifras (precio, mediana de zona, bajadas, antigüedad) salen de la BD y van
// en el prompt — nunca las inventa el modelo. Cadena gratis de la pasarela.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { aiComplete } from '@/lib/ai-client'
import { chollosVigentes } from '@/lib/subastas/mercado'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { refAnuncio } = await req.json()
    if (!refAnuncio) return NextResponse.json({ error: 'Falta refAnuncio' }, { status: 400 })

    const ch = (await chollosVigentes()).find((c) => c.comparable.refAnuncio === String(refAnuncio))
    if (!ch) return NextResponse.json({ error: 'Ese anuncio ya no es un chollo vigente' }, { status: 404 })

    const c = ch.comparable
    const datos = [
      `Anuncio: ${c.titulo}`,
      `Precio actual: ${eur(c.precio)}`,
      c.superficie ? `Superficie: ${c.superficie} m² (${Math.round(c.precioM2 ?? 0)}€/m²)` : null,
      `Mediana de la zona (${ch.zona}, ${ch.muestra} anuncios): ${Math.round(ch.precioM2Zona)}€/m²`,
      `Descuento actual sobre la zona: ${(ch.descuento * 100).toFixed(0)}%`,
      (c.bajadas ?? 0) > 0 && c.precioInicial ? `Ha bajado ${c.bajadas} veces desde ${eur(c.precioInicial)}` : null,
      ch.antiguedadDias != null ? `Lleva ~${ch.antiguedadDias} días publicado (estimado)` : null,
      ch.velocidad ? `En la zona los anuncios tardan ~${ch.velocidad.diasMediana} días en venderse` : null,
    ].filter(Boolean).join('\n')

    const texto = await aiComplete([
      {
        role: 'user',
        content:
          `Redacta en español un mensaje breve (máx 120 palabras) para contactar por un anuncio de Idealista ` +
          `y abrir una negociación a la baja. Tono: comprador serio y educado, sin agresividad, con financiación resuelta ` +
          `y disponibilidad para visitar esta semana. Usa SOLO estos datos (no inventes ninguno) y menciona 1-2 como ` +
          `argumento suave. Termina proponiendo una visita. No pongas asunto ni firma.\n\n${datos}`,
      },
    ])
    if (!texto?.trim()) return NextResponse.json({ error: 'IA no disponible' }, { status: 502 })
    return NextResponse.json({ texto: texto.trim() })
  } catch (e: any) {
    console.error('[subastas oferta]', e)
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 })
  }
}
