import { NextResponse } from 'next/server'
const H = `<!DOCTYPE html><html lang="es">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Qué ver en Sevilla — Guía completa 2025 | House Sevillana</title>
<meta name="description" content="Los 15 imprescindibles de Sevilla: Catedral, Alcázar, Plaza de España, barrio de Santa Cruz y mucho más. Guía escrita por residentes locales."/>
<link rel="canonical" href="https://www.housesevillana.es/que-ver"/>
<meta property="og:title" content="Qué ver en Sevilla — Guía 2025"/>
<meta property="og:url" content="https://www.housesevillana.es/que-ver"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6}
.hero{background:linear-gradient(135deg,#1a3a5c,#2d5a8e);color:white;padding:50px 24px;text-align:center}
.hero h1{font-size:clamp(22px,4vw,36px);font-weight:700;margin-bottom:10px}
.container{max-width:800px;margin:0 auto;padding:32px 24px}
.lugar{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid #eee;align-items:flex-start}
.num{font-size:28px;font-weight:800;color:#B04E2A;min-width:48px;line-height:1}
.lugar h3{font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px}
.lugar p{font-size:13px;color:#555;margin:0}
.tag{font-size:10px;background:#fdf6f0;color:#B04E2A;padding:2px 8px;border-radius:20px;display:inline-block;margin-right:6px;margin-top:4px}
nav{background:#1a1a1a;padding:12px 24px;display:flex;justify-content:space-between}
nav a{color:white;text-decoration:none;font-size:13px}
.cta{background:#8B2500;color:white;padding:32px 24px;text-align:center;margin-top:32px}
.cta a{background:white;color:#8B2500;padding:12px 28px;border-radius:25px;text-decoration:none;font-weight:700;display:inline-block;margin-top:10px}
</style>
</head>
<body>
<nav>
  <a href="/" style="font-weight:700;font-size:15px">House Sevillana</a>
  <a href="/#reservar" style="background:#B04E2A;padding:7px 18px;border-radius:20px">Reservar</a>
</nav>
<div class="hero"><h1>Qué ver en Sevilla</h1><p>Los 15 imprescindibles según los que vivimos aquí</p></div>
<div class="container">
${[
["Catedral de Sevilla y la Giralda","La catedral gótica más grande del mundo. Reserva con antelación, las colas pueden ser de 2h. La subida a la Giralda vale especialmente al atardecer.","Imprescindible","2-3h"],
["Real Alcázar","Palacio en uso más antiguo de Europa. Jardines espectaculares. Reserva obligatoria online — las entradas se agotan días antes.","Imprescindible","2-3h"],
["Barrio de Santa Cruz","El antiguo barrio judío. Callejones imposibles, naranjos y casas con patios andaluces. Mejor a primera hora de la mañana o al anochecer.","Gratuito","1-2h"],
["Plaza de España","Construida para la Exposición Iberoamericana de 1929. Uno de los espacios más fotogénicos de Europa. Alquila una barca en el canal.","Gratuito","1h"],
["Museo de Bellas Artes","Uno de los mejores de España. Zurbarán, Murillo y Velázquez. A menudo ignorado por los turistas — un error.","€3","2h"],
["Basílica de la Macarena","La Virgen más venerada de Sevilla. El museo del tesoro merece la visita. Entrada libre.","Gratuito","45min"],
["Triana","El barrio de los toreros y los flamencos. Cerámica, tapas y el mejor ambiente nocturno. Cruza el Puente de Triana desde el centro.","Gratuito","Tarde entera"],
["Torre del Oro","Torre almohade del siglo XIII a orillas del Guadalquivir. Museo naval en su interior. Vistas al río desde arriba.","€3","30min"],
["Hospital de los Venerables","Barroco sevillano en estado puro. Patio impresionante. Centro Velázquez con obras originales del pintor.","€10","1h"],
["Parque de María Luisa","100 hectáreas de jardines junto a la Plaza de España. Perfecto para el calor de julio y agosto.","Gratuito","1-2h"],
["Casa de Pilatos","Palacio renacentista con azulejos mudéjares únicos. Uno de los secretos mejor guardados de la ciudad.","€12","1h"],
["Mercado de la Encarnación (Setas)","Las 'Setas de Sevilla' — controversiales pero imposibles de ignorar. Mercado de abastos debajo, pasarela panorámica arriba.","€3 pasarela","1h"],
["Alameda de Hércules","El barrio bohemio de Sevilla. Terrazas, cervecerías artesanales y el Sevilla más alternativo. Por la noche es otro mundo.","Gratuito","Noche"],
["Italica (excursión)","A 9 km. Las ruinas romanas mejor conservadas de la Península. Anfiteatro, mosaicos y poca gente. Coge el autobús M-172.","€1.50","Medio día"],
["Tablao flamenco","El flamenco en Sevilla es diferente al de cualquier otro sitio. Elige bien: evita los sitios puramente turísticos. Pide recomendación local.","€30-60","2h"]
].map((l,i)=>`
<div class="lugar">
  <div class="num">${i+1}</div>
  <div>
    <h3>${l[0]}</h3>
    <p>${l[1]}</p>
    <span class="tag">${l[2]}</span><span class="tag">${l[3]}</span>
  </div>
</div>`).join("")}
</div>
<div class="cta">
  <p style="font-size:17px;font-weight:700">¿Listo para explorar Sevilla?</p>
  <p style="font-size:13px;margin-top:6px;opacity:.85">Alójate en el centro histórico. Sin comisiones de agencia.</p>
  <a href="https://reservas.house-sevillana.com">Ver disponibilidad</a>
</div>
</body></html>`
export function GET() { return new Response(H, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) }
