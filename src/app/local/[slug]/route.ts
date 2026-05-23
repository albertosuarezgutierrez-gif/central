// app/local/[slug]/route.ts
// Route Handler — devuelve HTML completo, bypasea layouts de Next.js
// Los templates generan su propio <html> sin interferencia del root layout

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { UI_STRINGS, type TemplateData } from './templates/types'
import TemplateClasico from './templates/Clasico'
import TemplateUrbano from './templates/Urbano'
import TemplateMediterraneo from './templates/Mediterraneo'
import TemplateTaberna from './templates/Taberna'
import TemplateFineDining from './templates/FineDining'

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']

const TemplateMap: Record<string, React.ComponentType<{d: TemplateData}>> = {
  clasico: TemplateClasico,
  urbano: TemplateUrbano,
  mediterraneo: TemplateMediterraneo,
  taberna: TemplateTaberna,
  finedining: TemplateFineDining,
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  try {
    const supabase = createServerClient()

    const { data: web, error } = await supabase
      .from('web_restaurante')
      .select('*')
      .eq('slug', slug)
      .eq('activa', true)
      .maybeSingle()

    if (error || !web) {
      if (error) console.error('[local/route] query error:', error.message)
      return new NextResponse('Not found', { status: 404 })
    }

    const { data: rest } = await supabase
      .from('restaurantes')
      .select('nombre, direccion, ciudad, telefono, tipo_negocio, latitud, longitud')
      .eq('id', web.restaurante_id)
      .maybeSingle()

    let carta: any[] = []
    if (web.mostrar_carta) {
      const { data: prods } = await supabase
        .from('productos')
        .select('nombre, descripcion, precio, categoria')
        .eq('restaurante_id', web.restaurante_id)
        .eq('activo', true)
        .order('categoria')
      carta = prods ?? []
    }

    // Contar visita (fire & forget)
    supabase.from('web_restaurante')
      .update({ visitas_total: (web.visitas_total ?? 0) + 1 })
      .eq('id', web.id).then(() => {})

    const nombre = rest?.nombre ?? slug
    const idioma = (web.idiomas_activos ?? ['es'])[0] ?? 'es'
    const t = UI_STRINGS[idioma] ?? UI_STRINGS.es

    // Carta agrupada
    const cartaAgrupada = carta.reduce((acc: Record<string, any[]>, p: any) => {
      const cat = p.categoria ?? 'Otros'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push({ nombre: p.nombre, descripcion: p.descripcion, precio: p.precio })
      return acc
    }, {})
    const cartaFinal = Object.entries(cartaAgrupada).map(([cat, items]) => ({ cat, items: items as any[] }))

    const horarios = DIAS
      .map(d => ({ dia: d, hora: (web as any)[`horario_${d}`] }))
      .filter(h => h.hora)

    const templateData: TemplateData = {
      nombre,
      frase_bienvenida: web.frase_bienvenida,
      descripcion_local: web.descripcion_local,
      descripcion_barrio: web.descripcion_barrio,
      logo_url: web.logo_url,
      foto_portada_url: web.foto_portada_url,
      color_acento: web.color_acento ?? '#D9442B',
      telefono_reservas: web.telefono_reservas,
      url_google_maps: web.url_google_maps,
      url_reserva_directa: web.url_reserva_directa,
      whatsapp: web.whatsapp,
      mostrar_carta: web.mostrar_carta ?? true,
      mostrar_reservas: web.mostrar_reservas ?? true,
      redes_sociales: web.redes_sociales ?? {},
      carta: cartaFinal,
      horarios,
      slug,
      idioma,
      t,
    }

    const Template = TemplateMap[web.template ?? 'clasico'] ?? TemplateClasico
    const html = '<!DOCTYPE html>' + renderToStaticMarkup(
      React.createElement(Template, { d: templateData })
    )

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (e) {
    console.error('[local/route] error:', e)
    return new NextResponse('Error', { status: 500 })
  }
}
