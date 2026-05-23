// app/local/[slug]/page.tsx
// Web pública del restaurante — ISR 1h, multiidioma, 5 templates, schema.org

import { createServerClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { UI_STRINGS, type TemplateData } from './templates/types'
import TemplateClasico from './templates/Clasico'
import TemplateUrbano from './templates/Urbano'
import TemplateMediterraneo from './templates/Mediterraneo'
import TemplateTaberna from './templates/Taberna'
import TemplateFineDining from './templates/FineDining'

export const revalidate = 0  // SSR hasta confirmar — volver a 3600 tras verificar
export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ slug: string }> }

const DIAS_ES = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']

function detectarIdioma(acceptLanguage: string | null, idiomas_activos: string[]): string {
  if (!acceptLanguage || idiomas_activos.length <= 1) return idiomas_activos[0] ?? 'es'
  const prefs = acceptLanguage.split(',').map(l => l.split(';')[0].trim().substring(0,2).toLowerCase())
  for (const pref of prefs) {
    if (idiomas_activos.includes(pref)) return pref
  }
  return idiomas_activos[0] ?? 'es'
}

async function getWebData(slug: string) {
  const supabase = createServerClient()

  const { data: web, error } = await supabase
    .from('web_restaurante')
    .select('*')
    .eq('slug', slug)
    .eq('activa', true)
    .maybeSingle()

  if (error) { console.error('[local/page] web query error:', error); return null }
  if (!web) return null

  // Query separada para datos del restaurante (evita problemas de FK cache en PostgREST)
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nombre, direccion, ciudad, telefono, tipo_negocio, latitud, longitud')
    .eq('id', web.restaurante_id)
    .maybeSingle()

  let carta: any[] = []
  if (web.mostrar_carta) {
    const { data: productos } = await supabase
      .from('productos')
      .select('nombre, descripcion, precio, categoria')
      .eq('restaurante_id', web.restaurante_id)
      .eq('activo', true)
      .order('categoria')
    carta = productos ?? []
  }

  // Contar visita (fire & forget)
  supabase.from('web_restaurante')
    .update({ visitas_total: (web.visitas_total ?? 0) + 1 })
    .eq('id', web.id).then(() => {})

  return { web, rest, carta }
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
    openGraph: {
      title: web.seo_title ?? nombre,
      description: desc,
      ...(web.foto_portada_url ? { images: [web.foto_portada_url] } : {}),
      type: 'website',
      locale: 'es_ES',
    },
    alternates: {
      canonical: `https://www.iarest.es/local/${slug}`,
    },
  }
}

export default async function WebRestaurantePage({ params }: Props) {
  const { slug } = await params
  const result = await getWebData(slug)
  if (!result) notFound()

  const { web, carta, rest } = result
  const nombre = rest?.nombre ?? slug

  // Detectar idioma del visitante
  const hdrs = await headers()
  const acceptLang = hdrs.get('accept-language')
  const idiomas = web.idiomas_activos ?? ['es']
  const idioma = detectarIdioma(acceptLang, idiomas)
  const t = UI_STRINGS[idioma] ?? UI_STRINGS.es

  // Carta en el idioma correcto
  const traducciones = web.carta_traducciones ?? {}
  const cartaIdioma = idioma !== 'es' && traducciones[idioma]
    ? traducciones[idioma]
    : carta

  // Agrupar carta por categoría
  const cartaAgrupada = (cartaIdioma as any[]).reduce((acc: Record<string, any[]>, p: any) => {
    const cat = p.categoria ?? p.cat ?? 'Otros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push({ nombre: p.nombre ?? p.name, descripcion: p.descripcion, precio: p.precio })
    return acc
  }, {})

  const cartaFinal = Object.entries(cartaAgrupada).map(([cat, items]) => ({ cat, items: items as any[] }))

  // Horarios
  const horarios = DIAS_ES
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
    address: rest?.direccion ? {
      '@type': 'PostalAddress',
      streetAddress: rest.direccion,
      addressLocality: rest.ciudad ?? 'Sevilla',
      addressCountry: 'ES',
    } : undefined,
    ...(rest?.latitud && rest?.longitud ? {
      geo: { '@type': 'GeoCoordinates', latitude: rest.latitud, longitude: rest.longitud }
    } : {}),
    servesCuisine: rest?.tipo_negocio ?? 'Spanish',
    priceRange: '€€',
    image: web.foto_portada_url ?? web.logo_url,
    hasMenu: `https://www.iarest.es/local/${slug}`,
  }

  const template = web.template ?? 'clasico'
  const TemplateMap: Record<string, React.ComponentType<{d: TemplateData}>> = {
    clasico: TemplateClasico,
    urbano: TemplateUrbano,
    mediterraneo: TemplateMediterraneo,
    taberna: TemplateTaberna,
    finedining: TemplateFineDining,
  }
  const Template = TemplateMap[template] ?? TemplateClasico

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Template d={templateData} />
    </>
  )
}
