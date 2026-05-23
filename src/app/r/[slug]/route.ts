// app/r/[slug]/route.ts
// Web pública del restaurante — Route Handler sin react-dom/server

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { UI_STRINGS } from './templates/types'
import type { TemplateData } from './templates/types'

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']

function buildHTML(d: TemplateData): string {
  const a = d.color_acento

  // Carta HTML
  const cartaHTML = d.mostrar_carta && d.carta.length > 0 ? `
    <div class="sec">
      <h2 class="sec-title">${d.t.carta}</h2>
      ${d.carta.map(c => `
        <div class="cat-label">${c.cat}</div>
        ${c.items.map(i => `
          <div class="item">
            <div>
              <span class="item-name">${i.nombre}</span>
              ${i.descripcion ? `<p class="item-desc">${i.descripcion}</p>` : ''}
            </div>
            ${i.precio != null ? `<span class="price">${Number(i.precio).toFixed(2)} €</span>` : ''}
          </div>
        `).join('')}
      `).join('')}
    </div>` : ''

  // Horarios HTML
  const horariosHTML = d.horarios.length > 0 ? `
    <div class="sec">
      <h2 class="sec-title">${d.t.horarios}</h2>
      ${d.horarios.map(h => `
        <div class="h-item"><span class="h-dia">${h.dia}</span><span>${h.hora}</span></div>
      `).join('')}
    </div>` : ''

  // Reservas HTML
  const reservasHTML = d.mostrar_reservas && (d.telefono_reservas || d.url_reserva_directa || d.whatsapp) ? `
    <div class="reserva" id="reservar">
      <h2 class="res-t">${d.t.reservar}</h2>
      <p class="res-s">${d.t.reserva_directa}</p>
      <div class="btn-group">
        ${d.telefono_reservas ? `<a href="tel:${d.telefono_reservas}" class="btn">${d.t.llamar}</a>` : ''}
        ${d.whatsapp ? `<a href="https://wa.me/${d.whatsapp.replace(/\D/g,'')}" class="btn">${d.t.whatsapp}</a>` : ''}
        ${d.url_reserva_directa ? `<a href="${d.url_reserva_directa}" class="btn btn-main">${d.t.online}</a>` : ''}
      </div>
    </div>` : ''

  // Ubicación HTML
  const ubicacionHTML = d.url_google_maps ? `
    <div class="sec" style="text-align:center">
      <a href="${d.url_google_maps}" target="_blank" rel="noopener noreferrer" class="btn btn-main">${d.t.maps}</a>
    </div>` : ''

  // Redes HTML
  const redesHTML = Object.values(d.redes_sociales).some(Boolean) ? `
    <div class="redes">
      ${d.redes_sociales.instagram ? `<a href="https://instagram.com/${d.redes_sociales.instagram.replace('@','')}" target="_blank" rel="noopener" class="red">Instagram</a>` : ''}
      ${d.redes_sociales.facebook ? `<a href="${d.redes_sociales.facebook}" target="_blank" rel="noopener" class="red">Facebook</a>` : ''}
      ${d.redes_sociales.tiktok ? `<a href="https://tiktok.com/@${d.redes_sociales.tiktok.replace('@','')}" target="_blank" rel="noopener" class="red">TikTok</a>` : ''}
      ${d.redes_sociales.tripadvisor ? `<a href="${d.redes_sociales.tripadvisor}" target="_blank" rel="noopener" class="red">TripAdvisor</a>` : ''}
    </div>` : ''

  // CSS por template
  const css = getCSS(d.template ?? 'clasico', a)

  // Hero
  const heroHTML = getHero(d)

  return `<!DOCTYPE html>
<html lang="${d.idioma}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${d.nombre} — Restaurante</title>
  <meta name="description" content="${(d.descripcion_local ?? '').substring(0,160)}"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  ${getFontLink(d.template ?? 'clasico')}
  <style>${css}</style>
</head>
<body>
  ${heroHTML}
  ${d.frase_bienvenida ? `<p class="frase">"${d.frase_bienvenida}"</p>` : ''}
  ${d.descripcion_local ? `<p class="desc">${d.descripcion_local}</p>` : ''}
  ${d.descripcion_barrio ? `<p class="desc barrio">${d.descripcion_barrio}</p>` : ''}
  ${reservasHTML}
  ${cartaHTML}
  ${horariosHTML}
  ${ubicacionHTML}
  ${redesHTML}
  <footer>
    <p>${d.t.footer} <a href="https://www.iarest.es" target="_blank" rel="noopener">ia.rest</a> · Sistema inteligente para hostelería</p>
  </footer>
</body>
</html>`
}

function getHero(d: TemplateData): string {
  const t = d.template ?? 'clasico'
  const nombre = `<h1 class="hero-title">${d.nombre}</h1>`
  const logo = d.logo_url ? `<img src="${d.logo_url}" alt="${d.nombre}" class="hero-logo"/>` : nombre

  if (d.foto_portada_url) {
    return `<div class="hero" style="background:url(${d.foto_portada_url}) center/cover">
      <div class="hero-overlay"></div>
      <div class="hero-inner">${logo}</div>
    </div>`
  }
  return `<header class="hero"><div class="hero-inner">${logo}<p class="hero-sub">Sevilla · Restaurante</p></div></header>`
}

function getFontLink(template: string): string {
  const fonts: Record<string, string> = {
    clasico: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:wght@300;400;600&display=swap',
    urbano: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;700&display=swap',
    mediterraneo: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=Nunito:wght@300;400;700&display=swap',
    taberna: 'https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Josefin+Sans:wght@300;400;700&display=swap',
    finedining: 'https://fonts.googleapis.com/css2?family=Tenor+Sans&family=Didact+Gothic&family=EB+Garamond:ital,wght@0,400;1,400&display=swap',
  }
  return `<link href="${fonts[template] ?? fonts.clasico}" rel="stylesheet"/>`
}

function getCSS(template: string, acento: string): string {
  const base = `
    *{box-sizing:border-box;margin:0;padding:0}
    a{text-decoration:none;color:inherit}
    body{-webkit-font-smoothing:antialiased}
    .max{max-width:680px;margin:0 auto;padding:0 24px}
    .sec{max-width:680px;margin:0 auto;padding:36px 24px 0}
    .sec-title{font-size:24px;margin-bottom:18px}
    .cat-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${acento};margin:18px 0 10px;font-weight:700}
    .item{display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid rgba(0,0,0,.08)}
    .item-name{font-size:15px}
    .item-desc{font-size:12px;opacity:.6;margin-top:2px}
    .price{font-weight:700;color:${acento};margin-left:16px;white-space:nowrap}
    .frase{max-width:680px;margin:32px auto 0;padding:0 24px;font-size:18px;font-style:italic;text-align:center;line-height:1.65}
    .desc{max-width:680px;margin:10px auto 0;padding:0 24px;font-size:15px;line-height:1.8}
    .barrio{font-size:13px;opacity:.6}
    .reserva{max-width:680px;margin:32px auto 0;padding:28px 24px;text-align:center}
    .res-t{font-size:22px;margin-bottom:6px}
    .res-s{font-size:12px;opacity:.6;margin-bottom:18px}
    .btn-group{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
    .btn{padding:11px 20px;font-size:13px;border:1px solid ${acento};color:${acento};border-radius:8px;display:inline-block;cursor:pointer}
    .btn-main{background:${acento};color:#fff;border-color:${acento}}
    .h-item{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(0,0,0,.08);font-size:14px}
    .h-dia{text-transform:capitalize;opacity:.7}
    .redes{max-width:680px;margin:28px auto 0;padding:0 24px;display:flex;gap:16px;flex-wrap:wrap}
    .red{font-size:13px;opacity:.5;font-weight:500}
    footer{max-width:680px;margin:36px auto 0;padding:20px 24px 32px;font-size:11px;opacity:.4;letter-spacing:1px}`

  const themes: Record<string, string> = {
    clasico: `body{background:#FAF7F2;color:#1a1208;font-family:'Cormorant Garamond',Georgia,serif}
      .hero{background:#1a1208;padding:52px 24px 44px;text-align:center}
      .hero-overlay{position:absolute;inset:0;background:rgba(0,0,0,.4)}
      .hero-inner{position:relative}
      .hero-logo{height:64px;object-fit:contain;filter:brightness(0) invert(1);margin-bottom:10px}
      .hero-title{font-family:'Playfair Display',serif;font-size:44px;font-weight:700;color:#FAF7F2;letter-spacing:2px}
      .hero-sub{font-size:12px;color:${acento};letter-spacing:4px;text-transform:uppercase;margin-top:8px}
      .frase{font-family:'Playfair Display',serif;color:#5a3e1b}
      .sec-title{font-family:'Playfair Display',serif;border-bottom:1px solid ${acento};padding-bottom:6px;margin-bottom:18px;color:#1a1208}
      .reserva{background:#1a1208;border:1px solid ${acento}}
      .res-t{font-family:'Playfair Display',serif;color:#FAF7F2;font-size:24px}
      .res-s{color:rgba(250,247,242,.5)}
      .btn{color:${acento};border-color:${acento}}
      footer{color:#9a8060}`,

    urbano: `body{background:#0D0D0D;color:#F0EDE8;font-family:'DM Sans',system-ui,sans-serif}
      .hero{background:#0D0D0D;padding:48px 24px 36px}
      .hero-logo{height:52px;object-fit:contain;filter:invert(1);margin-bottom:10px}
      .hero-title{font-family:'Bebas Neue',sans-serif;font-size:68px;line-height:.9;letter-spacing:2px;color:#F0EDE8}
      .hero-sub{font-size:10px;color:${acento};letter-spacing:4px;text-transform:uppercase;margin-top:12px}
      .frase{color:#888;font-weight:300}
      .sec-title{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;color:${acento}}
      .item{border-bottom:1px solid #1a1a1a}
      .price{font-family:'Bebas Neue';font-size:20px}
      .reserva{background:#111;border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a}
      .res-t{font-family:'Bebas Neue';font-size:28px;letter-spacing:2px}
      footer{color:#2a2a2a}`,

    mediterraneo: `body{background:#FDF6EC;color:#2D1B0E;font-family:'Nunito',system-ui,sans-serif}
      .hero{background:linear-gradient(160deg,${acento}dd 0%,${acento} 100%);padding:44px 24px 60px;text-align:center;position:relative}
      .hero::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:48px;background:#FDF6EC;clip-path:ellipse(55% 100% at 50% 100%)}
      .hero-overlay{display:none}
      .hero-inner{position:relative}
      .hero-logo{height:60px;object-fit:contain;filter:brightness(0) invert(1);margin-bottom:10px}
      .hero-title{font-family:'Lora',serif;font-size:40px;font-weight:600;color:#fff;line-height:1.1}
      .hero-sub{font-size:12px;font-weight:300;color:rgba(255,255,255,.7);letter-spacing:3px;text-transform:uppercase;margin-top:8px}
      .frase{font-family:'Lora',serif;font-style:italic;color:${acento}}
      .sec-title{font-family:'Lora',serif;color:#2D1B0E}
      .reserva{background:linear-gradient(135deg,${acento}cc,${acento});border-radius:16px;margin:28px 16px 0}
      .res-t{font-family:'Lora',serif;color:#fff}
      .res-s{color:rgba(255,255,255,.7)}
      .btn{color:#fff;border-color:rgba(255,255,255,.5);border-radius:20px}
      .btn-main{background:#fff;color:${acento};border-color:#fff;border-radius:20px}`,

    taberna: `body{background:#F9F4EE;color:#2a1a0e;font-family:'Josefin Sans',system-ui,sans-serif}
      .hero{background:${acento};padding:40px 24px;text-align:center;position:relative;overflow:hidden}
      .hero::before{content:'';position:absolute;inset:0;opacity:.07;background-image:repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%),repeating-linear-gradient(-45deg,#fff 0,#fff 1px,transparent 0,transparent 50%);background-size:14px 14px}
      .hero-overlay{display:none}
      .hero-inner{position:relative}
      .hero-logo{height:64px;object-fit:contain;filter:brightness(0) invert(1);margin-bottom:10px}
      .hero-title{font-family:'Crimson Text',serif;font-size:46px;font-weight:600;color:#FFF8F0;line-height:1}
      .hero-sub{font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,248,240,.55);margin-top:10px}
      .frase{font-family:'Crimson Text',serif;font-style:italic;color:${acento};border-left:3px solid ${acento};padding-left:16px;text-align:left}
      .sec-title{font-family:'Crimson Text',serif;font-size:22px;font-style:italic}
      .item{font-family:'Crimson Text',serif;font-size:16px;border-bottom:1px dashed #D8C8B8}
      .reserva{background:#2a1a0e}
      .res-t{font-family:'Crimson Text',serif;color:#FFF8F0;font-style:italic}
      .res-s{color:rgba(255,248,240,.4)}
      .btn{color:#FFF8F0;border-color:rgba(255,248,240,.3)}
      .btn-main{background:${acento};border-color:${acento}}`,

    finedining: `body{background:#080808;color:#E8E0D0;font-family:'Didact Gothic',system-ui,sans-serif}
      .hero{padding:52px 24px 44px;text-align:center;border-bottom:1px solid ${acento}33}
      .hero-overlay{display:none}
      .hero-logo{height:70px;object-fit:contain;filter:brightness(0) invert(1) sepia(.3);margin-bottom:12px}
      .hero-title{font-family:'Tenor Sans',serif;font-size:52px;font-weight:400;color:#E8E0D0;letter-spacing:8px;text-transform:uppercase;line-height:1}
      .hero-sub{font-size:9px;color:${acento};letter-spacing:6px;text-transform:uppercase;margin-top:14px}
      .frase{font-family:'EB Garamond',serif;font-style:italic;color:#9A8A6A}
      .sec-title{font-family:'Tenor Sans';letter-spacing:3px;text-transform:uppercase;color:${acento};font-size:14px}
      .item{border-bottom:1px solid #111}
      .item-name{font-family:'Tenor Sans';letter-spacing:1px;color:#D0C8B8}
      .price{font-size:13px}
      .reserva{border:1px solid #1a1512;position:relative}
      .reserva::before{content:'◆';position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#080808;padding:0 10px;color:${acento};font-size:11px}
      .res-t{font-family:'Tenor Sans';letter-spacing:3px;font-size:22px}
      .res-s{color:#333}
      .btn{color:${acento};border-color:${acento}55;border-radius:0}
      .btn-main{background:${acento}22;border-color:${acento}}
      footer{color:#1a1512;border-top:1px solid #0d0d0d}`,
  }

  return base + '\n' + (themes[template] ?? themes.clasico)
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

    supabase.from('web_restaurante')
      .update({ visitas_total: (web.visitas_total ?? 0) + 1 })
      .eq('id', web.id).then(() => {})

    const nombre = rest?.nombre ?? slug
    const idioma = (web.idiomas_activos ?? ['es'])[0] ?? 'es'
    const t = UI_STRINGS[idioma] ?? UI_STRINGS.es

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
      template: web.template ?? 'clasico',
    }

    const html = buildHTML(templateData)

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (e) {
    console.error('[r/route] error:', e)
    return new NextResponse('Error interno', { status: 500 })
  }
}
