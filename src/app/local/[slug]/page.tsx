// app/local/[slug]/page.tsx
import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { UI_STRINGS, type TemplateData } from './templates/types'
import TemplateClasico from './templates/Clasico'
import TemplateUrbano from './templates/Urbano'
import TemplateMediterraneo from './templates/Mediterraneo'
import TemplateTaberna from './templates/Taberna'
import TemplateFineDining from './templates/FineDining'

export const revalidate = 3600

interface Props { params: Promise<{ slug: string }> }

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']

async function getWebData(slug: string) {
  try {
    const supabase = createServerClient()

    const { data: web, error: webErr } = await supabase
      .from('web_restaurante')
      .select('*')
      .eq('slug', slug)
      .eq('activa', true)
      .maybeSingle()

    if (webErr) { console.error('[web] query error:', webErr.message); return null }
    if (!web) { console.log('[web] not found:', slug); return null }

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

    return { web, rest, carta }
  } catch (e) {
    console.error('[web] unexpected error:', e)
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await getWebData(slug)
  if (!result) return {}
  const { web, rest } = result
  const nombre = rest?.nombre ?? slug
  const desc = web.seo_description ?? web.descripcion_local ?? `Visita ${nombre} en Sevilla`
  return {
    title: web.seo_title ?? `${nombre} — Restaurante en Sevilla`,
    description: desc,
    openGraph: { title: nombre, description: desc, ...(web.foto_portada_url ? { images: [web.foto_portada_url] } : {}) },
    alternates: { canonical: `https://www.iarest.es/local/${slug}` },
  }
}

export default async function WebRestaurantePage({ params }: Props) {
  const { slug } = await params
  const result = await getWebData(slug)
  if (!result) notFound()

  const { web, carta, rest } = result
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

  // Schema.org Restaurant
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: nombre,
    description: web.descripcion_local ?? '',
    url: `https://www.iarest.es/local/${slug}`,
    telephone: web.telefono_reservas,
    servesCuisine: rest?.tipo_negocio ?? 'Spanish',
    priceRange: '€€',
    image: web.foto_portada_url ?? web.logo_url,
    hasMenu: `https://www.iarest.es/local/${slug}`,
    address: rest?.direccion ? {
      '@type': 'PostalAddress',
      streetAddress: rest.direccion,
      addressLocality: rest?.ciudad ?? 'Sevilla',
      addressCountry: 'ES',
    } : undefined,
  }

  const TemplateMap: Record<string, React.ComponentType<{d: TemplateData}>> = {
    clasico: TemplateClasico,
    urbano: TemplateUrbano,
    mediterraneo: TemplateMediterraneo,
    taberna: TemplateTaberna,
    finedining: TemplateFineDining,
  }
  const Template = TemplateMap[web.template ?? 'clasico'] ?? TemplateClasico

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <Template d={templateData} />
    </>
  )
}
