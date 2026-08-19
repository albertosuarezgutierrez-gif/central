import { NextResponse } from 'next/server'
import { MOTOR_RESERVAS } from '../reservas'
const H = `<!DOCTYPE html><html lang="es">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Barrio Macarena Sevilla — Dónde alojarse | House Sevillana</title>
<meta name="description" content="El barrio de la Macarena en Sevilla: murallas, tabernas de siempre y la Sevilla de verdad. House Sevillana está en San Julián, la puerta de la Macarena, a 10 minutos a pie de la Catedral."/>
<link rel="canonical" href="https://www.housesevillana.es/barrio"/>
<meta property="og:title" content="Barrio Macarena Sevilla | House Sevillana"/>
<meta property="og:description" content="Vive la Sevilla de verdad. Murallas almohades, iglesias barrocas y tabernas de siempre, desde San Julián."/>
<meta property="og:url" content="https://www.housesevillana.es/barrio"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"El barrio de la Macarena en Sevilla, desde San Julián","author":{"@type":"Organization","name":"House Sevillana"},"publisher":{"@type":"Organization","name":"House Sevillana","url":"https://www.housesevillana.es"}}</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,serif;color:#1a1a1a;line-height:1.7}
.hero{background:linear-gradient(135deg,#8B2500 0%,#B04E2A 100%);color:white;padding:60px 24px;text-align:center}
.hero h1{font-size:clamp(24px,5vw,40px);margin-bottom:12px;font-weight:700}
.hero p{font-size:17px;opacity:.85;max-width:580px;margin:0 auto}
.container{max-width:760px;margin:0 auto;padding:40px 24px}
h2{font-size:24px;margin:36px 0 16px;color:#8B2500}
p{margin-bottom:16px;font-size:16px}
.poi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin:20px 0}
.poi{background:#fdf6f0;border-radius:12px;padding:16px;border-left:4px solid #B04E2A}
.poi h3{font-size:15px;margin-bottom:6px;color:#8B2500}
.poi p{font-size:13px;margin:0;color:#555}
.cta{background:#8B2500;color:white;text-align:center;padding:40px 24px;margin-top:40px}
.cta a{background:white;color:#8B2500;padding:14px 32px;border-radius:30px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;display:inline-block;margin-top:12px}
nav{background:#1a1a1a;padding:12px 24px;display:flex;justify-content:space-between;align-items:center}
nav a{color:white;text-decoration:none;font-family:Arial,sans-serif;font-size:13px}
.breadcrumb{padding:12px 24px;font-family:Arial,sans-serif;font-size:12px;color:#666;background:#fdf6f0}
.breadcrumb a{color:#B04E2A;text-decoration:none}
/* Objetivo tactil de 44px (regla del CLAUDE.md raiz). Medido a 320px: la marca del
   nav daba 26px y el boton Reservar 36px. Con flex + min-height suben a 44 sin
   cambiar el aspecto. El de la miga de pan va DENTRO de una frase ("Inicio > Barrio"),
   asi que ahi se amplia el area de toque con padding y se compensa con margen
   negativo: 44px pulsables, linea identica.
   OJO: este CSS vive dentro de un template literal de JS — nada de comillas
   invertidas en los comentarios, cierran la plantilla y rompen el build. */
nav a{display:inline-flex;align-items:center;min-height:44px}
.breadcrumb a{display:inline-block;padding:.875rem .25rem;margin:-.875rem -.25rem}
</style>
</head>
<body>
<nav>
  <a href="/" style="font-weight:700;font-size:15px">House Sevillana</a>
  <a href="/#reserva" style="background:#B04E2A;padding:7px 18px;border-radius:20px">Reservar</a>
</nav>
<div class="breadcrumb"><a href="/">Inicio</a> › Barrio</div>
<div class="hero">
  <h1>El barrio de la Macarena, desde San Julián</h1>
  <p>La Sevilla auténtica que los turistas buscan y muy pocos encuentran</p>
</div>
<div class="container">
  <p>El barrio de la Macarena es uno de los más antiguos e históricos de Sevilla. Sus calles estrechas, sus plazas tranquilas y sus tabernas de toda la vida lo convierten en el lugar perfecto para vivir la ciudad de verdad, lejos de las multitudes de la zona turística.</p>
  <p><strong>House Sevillana</strong> está en la <strong>calle Socorro 24, barrio de San Julián</strong>, dentro del Casco Antiguo. Es el barrio que hace de puerta de la Macarena: la ruta clásica del barrio arranca aquí mismo, en la plaza de San Marcos, y sube por Bustos Tavera hacia la Basílica y las murallas. Estás en la Sevilla de siempre y a la vez a menos de 15 minutos andando de los grandes monumentos.</p>

  <h2>Por qué alojarse en esta zona</h2>
  <p>Significa despertarte con olor a azahar, desayunar en una cafetería de barrio y hacer la compra en el mercado de la Feria. Es vivir Sevilla como un sevillano, no como un turista &mdash; con el centro monumental a un paseo y sin el ruido de la zona turística.</p>

  <div class="poi-grid">
    <div class="poi"><h3>Basílica de la Macarena</h3><p>Subiendo por Bustos Tavera hasta la Puerta de la Macarena. La Virgen más venerada de Sevilla; el museo del tesoro merece la visita.</p></div>
    <div class="poi"><h3>Muralla almohade</h3><p>Frente a la Basílica. Los restos mejor conservados de la muralla del s. XII.</p></div>
    <div class="poi"><h3>Mercado de la Feria</h3><p>Calle Feria arriba. El mercado más antiguo de Sevilla: tapas baratas y producto fresco.</p></div>
    <div class="poi"><h3>San Luis de los Franceses</h3><p>A 4 minutos a pie. Joya barroca con interior de mármol y pinturas de Lucas Valdés.</p></div>
    <div class="poi"><h3>Alameda de Hércules</h3><p>Al oeste, pasando San Juan de la Palma. El salón de Sevilla: terrazas y el ambiente más bohemio.</p></div>
    <div class="poi"><h3>Catedral de Sevilla</h3><p>A 10 minutos andando. La catedral gótica más grande del mundo, y la Giralda.</p></div>
  </div>

  <h2>Gastronomía del barrio</h2>
  <p>Esta parte de Sevilla conserva las tabernas de toda la vida, donde el fino de barril se sirve bien frío. Algunos clásicos del entorno:</p>
  <p><strong>Bodega San José</strong> — tapas tradicionales desde 1940. <strong>Bar El Tremendo</strong> — el mejor pescaíto frito del barrio. <strong>Taberna Coloniales</strong> — raciones generosas y precios honestos.</p>

  <h2>Cómo llegar desde el aeropuerto</h2>
  <p>El aeropuerto de San Pablo está a unos 20 minutos en taxi (unos 25€) o en autobús urbano línea EA (1,80€, cada 20 min). House Sevillana está en la calle Socorro 24, en San Julián, con plaza de aparcamiento privado reservable con la estancia.</p>
</div>
<div class="cta">
  <p style="font-family:Arial,sans-serif;font-size:18px;font-weight:700">¿Listo para vivir esta Sevilla?</p>
  <p style="font-family:Arial,sans-serif;font-size:14px;opacity:.85;margin-top:8px">290 m² · 6 dormitorios · Parking privado · Sin comisiones</p>
  <a href="${MOTOR_RESERVAS}">Comprobar disponibilidad</a>
</div>
</body></html>`
export function GET() { return new Response(H, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) }
