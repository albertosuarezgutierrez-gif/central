// apps/housesevillana/app/parking/contenido.ts
//
// Landing de intención alta: «casa/alojamiento con parking en el centro de Sevilla».
// Es la búsqueda con menos competencia y más margen que tenemos — la propia URL de
// Booking del piso es `house-sevillana-parking`, así que el ángulo ya está validado
// por el canal que hoy cobra comisión.
//
// 🚦 De dónde sale CADA dato de esta página (nada se ha puesto a ojo):
//   · Plaza, superficie, dormitorios, aforo, VFT, distancias a pie y aeropuerto →
//     del propio `app/route.ts` (la landing principal), no de una estimación.
//   · Régimen de tráfico → la ZBE de Sevilla es SOLO la Isla de la Cartuja (L-V 7-19 h;
//     etiquetas 0/ECO/C/B entran libres). El casco histórico NO es la ZBE: tiene su
//     propio régimen de acceso restringido. Confundirlos es el error habitual de las
//     webs de alquiler, y a un huésped que llega en coche le cuesta una multa.
//
// 🚫 Lo que NO se afirma aquí a propósito, porque NO está comprobado (regla de CLAUDE.md:
//    dato que no hay ≠ dato que no se ha mirado):
//   · Precio de la plaza, sus medidas y su altura libre.
//   · Si caben dos coches, una furgoneta o un coche grande.
//   · Si la calle exacta está dentro del área restringida y si hace falta dar matrícula.
//   · Precios de los aparcamientos públicos del entorno.
//   Todo eso se remite a Alberto en la reserva en vez de inventarse. Cuando se confirme,
//   se escribe aquí — y entonces sí es un argumento de venta, no una promesa a medias.

export const HTML = `<!DOCTYPE html><html lang="es">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Casa con parking privado en el centro de Sevilla | House Sevillana</title>
<meta name="description" content="Alojamiento en el casco histórico de Sevilla con plaza de garaje privada en el propio edificio. 290 m², 6 dormitorios, hasta 12 personas. Llega en coche sin buscar aparcamiento."/>
<link rel="canonical" href="https://www.housesevillana.es/parking"/>
<link rel="alternate" hreflang="es" href="https://www.housesevillana.es/parking"/>
<link rel="alternate" hreflang="en" href="https://www.housesevillana.es/en/parking"/>
<link rel="alternate" hreflang="it" href="https://www.housesevillana.es/it/parking"/>
<link rel="alternate" hreflang="x-default" href="https://www.housesevillana.es/parking"/>
<meta property="og:title" content="Casa con parking privado en el centro de Sevilla | House Sevillana"/>
<meta property="og:description" content="Plaza de garaje privada en el propio edificio, en pleno casco histórico. Llega en coche y olvídate de aparcar."/>
<meta property="og:url" content="https://www.housesevillana.es/parking"/>
<meta property="og:type" content="website"/>
<meta property="og:locale" content="es_ES"/>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"¿House Sevillana tiene parking privado?","acceptedAnswer":{"@type":"Answer","text":"Sí. Hay una plaza de garaje privada en el mismo edificio, reservable junto con la estancia. Es de las pocas casas turísticas del casco histórico de Sevilla con aparcamiento propio."}},{"@type":"Question","name":"¿Afecta la Zona de Bajas Emisiones de Sevilla a mi coche?","acceptedAnswer":{"@type":"Answer","text":"La Zona de Bajas Emisiones de Sevilla es únicamente la Isla de la Cartuja, al noroeste de la ciudad, y solo restringe de lunes a viernes no festivos de 7:00 a 19:00. Los vehículos con distintivo 0, ECO, C o B acceden libremente. El casco histórico, donde está House Sevillana, no forma parte de esa ZBE: tiene su propio régimen de tráfico restringido, así que conviene consultar la ruta de llegada al reservar."}},{"@type":"Question","name":"¿Cuánto cuesta la plaza de garaje?","acceptedAnswer":{"@type":"Answer","text":"Las condiciones de la plaza se confirman directamente con el propietario al reservar. Reservando en housesevillana.es hablas con Alberto sin intermediarios."}}]}</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,serif;color:#1a1a1a;line-height:1.7}
.hero{background:linear-gradient(135deg,#8B2500 0%,#B04E2A 100%);color:white;padding:60px 24px;text-align:center}
.hero h1{font-size:clamp(24px,5vw,40px);margin-bottom:12px;font-weight:700}
.hero p{font-size:17px;opacity:.9;max-width:580px;margin:0 auto}
.container{max-width:760px;margin:0 auto;padding:40px 24px}
h2{font-size:24px;margin:36px 0 16px;color:#8B2500}
p{margin-bottom:16px;font-size:16px}
.poi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin:20px 0}
.poi{background:#fdf6f0;border-radius:12px;padding:16px;border-left:4px solid #B04E2A}
.poi h3{font-size:15px;margin-bottom:6px;color:#8B2500}
.poi p{font-size:13px;margin:0;color:#555}
.aviso{background:#fff8e6;border-left:4px solid #C8951C;border-radius:12px;padding:16px 18px;margin:24px 0}
.aviso p{font-size:14px;margin:0;color:#4a3a12}
.aviso p+p{margin-top:10px}
details{background:#fdf6f0;border-radius:12px;padding:14px 18px;margin-bottom:10px}
summary{cursor:pointer;font-weight:700;color:#8B2500;font-size:15px;min-height:44px;display:flex;align-items:center}
details p{font-size:15px;margin:10px 0 0;color:#444}
.cta{background:#8B2500;color:white;text-align:center;padding:40px 24px;margin-top:40px}
.cta a{background:white;color:#8B2500;padding:14px 32px;border-radius:30px;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;display:inline-block;margin-top:12px;min-height:44px;line-height:1.3}
nav{background:#1a1a1a;padding:4px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
/* 44px de alto en TODO lo pulsable: en móvil un enlace de 26px se falla con el pulgar. */
nav a{color:white;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;display:inline-flex;align-items:center;min-height:44px}
.breadcrumb{padding:0 24px;font-family:Arial,sans-serif;font-size:12px;color:#666;background:#fdf6f0;display:flex;align-items:center;gap:4px;min-height:44px}
.breadcrumb a{color:#B04E2A;text-decoration:none;display:inline-flex;align-items:center;min-height:44px}
</style>
</head>
<body>
<nav>
  <a href="/" style="font-weight:700;font-size:15px">House Sevillana</a>
  <a href="https://reservas.house-sevillana.com" target="_blank" rel="noopener" style="background:#B04E2A;padding:11px 18px;border-radius:20px">Reservar</a>
</nav>
<div class="breadcrumb"><a href="/">Inicio</a> › Parking</div>
<div class="hero">
  <h1>Llega en coche al centro de Sevilla</h1>
  <p>Plaza de garaje privada en el propio edificio, en pleno casco histórico. Aparcas una vez y el resto del viaje es a pie.</p>
</div>
<div class="container">
  <p>Quien viene a Sevilla en coche descubre pronto el mismo problema: el casco histórico es un laberinto de calles estrechas, con tráfico restringido y prácticamente sin sitio donde dejar el coche. La mayoría de los alojamientos del centro resuelven esto mandándote a un aparcamiento público a diez minutos andando, con maletas.</p>
  <p><strong>House Sevillana tiene una plaza de garaje privada en el propio edificio</strong>, reservable junto con la estancia. Es de las pocas casas turísticas del casco antiguo que puede decir eso, y es lo que más agradecen los huéspedes que llegan conduciendo.</p>

  <h2>Por qué importa tanto en Sevilla</h2>
  <div class="poi-grid">
    <div class="poi"><h3>🚗 Aparcas dentro del edificio</h3><p>Del coche a la casa, sin arrastrar maletas por la calle ni buscar hueco de madrugada.</p></div>
    <div class="poi"><h3>🚶 Todo a pie desde la puerta</h3><p>Catedral a 10 min, Real Alcázar a 12, Torre del Oro a 14 y Plaza de España a 15. El coche se queda quieto.</p></div>
    <div class="poi"><h3>✈️ Aeropuerto a 11 km</h3><p>SVQ está a 16-20 min en taxi o VTC. Si alquilas coche allí, ya sabes dónde lo dejas.</p></div>
    <div class="poi"><h3>🧳 Pensado para grupos</h3><p>290 m², 6 dormitorios y 4 baños para hasta 12 personas. La casa entera para vosotros.</p></div>
  </div>

  <h2>Coche y tráfico en Sevilla: lo que conviene saber antes de venir</h2>
  <p>Circula mucha información confusa sobre esto, así que va claro y separado:</p>
  <p>La <strong>Zona de Bajas Emisiones de Sevilla es únicamente la Isla de la Cartuja</strong>, al noroeste de la ciudad. Solo restringe de lunes a viernes no festivos, de 7:00 a 19:00, y los vehículos con distintivo 0, ECO, C o B entran sin limitación. Sábados, domingos y festivos no hay restricción a ninguna hora.</p>
  <p>El <strong>casco histórico —donde está House Sevillana— no es esa ZBE</strong>. Tiene su propio régimen de acceso restringido, con reglas distintas. Confundir las dos cosas es el error más habitual, y a quien llega en coche le puede costar una multa.</p>
  <div class="aviso">
    <p><strong>Lo honesto:</strong> la ruta exacta de entrada hasta el garaje, las condiciones de la plaza y si hace falta comunicar la matrícula dependen de tu vehículo y del día de llegada. No los ponemos aquí a medias: te los confirma Alberto al reservar, por escrito y antes de que salgas de casa.</p>
    <p>Es justamente lo que un portal de reservas no puede darte: en housesevillana.es hablas con el propietario, no con un centro de atención al cliente.</p>
  </div>

  <h2>Preguntas frecuentes sobre el parking</h2>
  <details>
    <summary>¿La plaza está incluida en el precio?</summary>
    <p>Las condiciones de la plaza se confirman con el propietario al hacer la reserva. Como reservas directamente, la respuesta te llega de quien decide, sin intermediarios.</p>
  </details>
  <details>
    <summary>¿Cuántos coches caben?</summary>
    <p>Es una plaza de garaje privada en el edificio. Si viajáis en varios coches, dilo al reservar y Alberto te indica las alternativas del entorno antes de que llegues.</p>
  </details>
  <details>
    <summary>¿Y si vengo en furgoneta o con un coche grande?</summary>
    <p>Consúltalo antes de reservar indicando el modelo. Preferimos decírtelo con antelación a que te encuentres el problema con el equipaje ya cargado.</p>
  </details>
  <details>
    <summary>¿Necesito el coche para moverme por Sevilla?</summary>
    <p>No. Desde la casa se llega andando a los principales monumentos en menos de 15 minutos. El parking es para llegar y para las excursiones de un día, no para el día a día.</p>
  </details>
  <details>
    <summary>¿Es realmente una casa turística legal?</summary>
    <p>Sí. House Sevillana está acreditada con el número de registro VFT/SE/01179 de la Junta de Andalucía.</p>
  </details>

  <h2>Qué hacer con el coche una vez estás aquí</h2>
  <p>Teniendo dónde dejarlo, el coche deja de ser un estorbo y pasa a ser útil para salir de la ciudad: Itálica, Carmona, Jerez o el Parque Nacional de Doñana están todos a menos de dos horas. Vuelves por la tarde y tienes tu plaza esperando, que en el centro de Sevilla no es poca cosa.</p>
</div>
<div class="cta">
  <p style="font-family:Arial,sans-serif;font-size:18px;font-weight:700">Ven en coche sin preocuparte de aparcar</p>
  <p style="font-family:Arial,sans-serif;font-size:14px;opacity:.9;margin-top:8px">290 m² · 6 dormitorios · Garaje privado · Reserva directa sin comisiones</p>
  <a href="https://reservas.house-sevillana.com" target="_blank" rel="noopener">Consultar disponibilidad</a>
</div>
</body></html>`
