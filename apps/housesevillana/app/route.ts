import { NextResponse } from 'next/server';

export const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNSIgZmlsbD0iI0IwNEUyQSIvPjx0ZXh0IHg9IjE2IiB5PSIyMS41IiBmb250LWZhbWlseT0iR2VvcmdpYSxzZXJpZiIgZm9udC1zaXplPSIxNC41IiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgbGV0dGVyLXNwYWNpbmc9IjAuNSI+SFM8L3RleHQ+PC9zdmc+"/>

<!-- SEO Primary -->
<title>Casa vacacional en Sevilla centro con parking | House Sevillana</title>
<meta name="description" content="Alquila esta casa de 290m² en Sevilla centro: 6 dormitorios, 4 baños, parking privado y patio andaluz. Ideal para grupos hasta 12 personas. Reserva directa sin comisiones."/>
<link rel="canonical" href="https://www.housesevillana.es/"/>
<link rel="alternate" hreflang="es" href="https://www.housesevillana.es/"/>
<link rel="alternate" hreflang="en" href="https://www.housesevillana.es/en"/>
<link rel="alternate" hreflang="it" href="https://www.housesevillana.es/it"/>
<link rel="alternate" hreflang="x-default" href="https://www.housesevillana.es/"/>

<!-- Open Graph -->
<meta property="og:type" content="website"/>
<meta property="og:locale" content="es_ES"/>
<meta property="og:url" content="https://www.housesevillana.es/"/>
<meta property="og:title" content="Casa vacacional en Sevilla centro con parking | House Sevillana"/>
<meta property="og:description" content="Casa vacacional en Sevilla centro con parking privado y patio andaluz para 12 personas. Reserva directa sin comisiones."/>
<meta property="og:image" content="https://lh3.googleusercontent.com/d/1rDXs-fjAmmDQFTfZ7fTutPZvosAV2GMo"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="https://lh3.googleusercontent.com/d/1rDXs-fjAmmDQFTfZ7fTutPZvosAV2GMo"/>

<!-- Schema: LodgingBusiness -->
<script type="application/ld+json">{"@context":"https://schema.org","@type":"VacationRental","name":"House Sevillana","description":"Casa vacacional de 6 dormitorios con parking privado y patio andaluz en el centro histórico de Sevilla. Acreditada con VFT/SE/01179."}</script>

<!-- Schema: FAQPage -->
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"¿Tiene parking privado House Sevillana?","acceptedAnswer":{"@type":"Answer","text":"Sí. House Sevillana dispone de una plaza de garaje privado en el mismo edificio, reservable junto a tu estancia. Es una de las pocas casas turísticas del casco antiguo de Sevilla con parking propio."}},{"@type":"Question","name":"¿Para cuántas personas es House Sevillana?","acceptedAnswer":{"@type":"Answer","text":"House Sevillana tiene 6 dormitorios dobles y capacidad para hasta 12 personas. Es ideal para grupos de amigos, familias numerosas o varias parejas que viajan juntas."}},{"@type":"Question","name":"¿A qué distancia está la Catedral de Sevilla?","acceptedAnswer":{"@type":"Answer","text":"La Catedral de Sevilla está a unos 10 minutos andando desde House Sevillana. El Real Alcázar está a 12 minutos, la Torre del Oro a 14 minutos y la Plaza de España a 15 minutos a pie."}},{"@type":"Question","name":"¿Se admiten niños en House Sevillana?","acceptedAnswer":{"@type":"Answer","text":"Sí, se admiten niños de todas las edades. House Sevillana es perfecta para familias multigeneracionales gracias a sus 6 dormitorios y 4 baños. No se admiten mascotas."}},{"@type":"Question","name":"¿Se permiten despedidas de soltero en House Sevillana?","acceptedAnswer":{"@type":"Answer","text":"No. Las despedidas de soltero y eventos similares no están permitidos en House Sevillana. Hay silencio obligatorio de 21:00 a 09:00 y se aplica un depósito por daños de hasta 150€."}},{"@type":"Question","name":"¿Cuál es el horario de check-in y check-out?","acceptedAnswer":{"@type":"Answer","text":"El check-in es a partir de las 15:00 h y el check-out hasta las 12:00 h. Consulta directamente con el propietario si necesitas horario flexible."}},{"@type":"Question","name":"¿Cómo llego desde el aeropuerto de Sevilla a House Sevillana?","acceptedAnswer":{"@type":"Answer","text":"El aeropuerto de Sevilla (SVQ) está a unos 11 km. En taxi o VTC tarda aproximadamente 16-20 minutos. También puedes llegar en autobús (línea EA) hasta el centro en unos 35 minutos."}},{"@type":"Question","name":"¿Hay supermercados y restaurantes cerca?","acceptedAnswer":{"@type":"Answer","text":"Sí. A pocos metros encontrarás La Parcería Café, Ojalá Tapas y Vinos y el Restaurante Condendê (a 200 m). Hay varios supermercados en el barrio y el Mercado de la Encarnación está a 10 minutos andando."}},{"@type":"Question","name":"¿Cuál es la política de cancelación de House Sevillana?","acceptedAnswer":{"@type":"Answer","text":"La política de cancelación se detalla en el motor de reservas. Reservando directamente puedes consultar condiciones flexibles directamente con el propietario, algo que no es posible a través de portales como Booking."}},{"@type":"Question","name":"¿Por qué reservar en housesevillana.es y no en Booking.com?","acceptedAnswer":{"@type":"Answer","text":"Booking.com cobra entre un 15% y un 22% de comisión que repercute en el precio final. Reservando directamente en housesevillana.es obtienes el mejor precio garantizado, trato directo con el propietario y confirmación inmediata."}}]}</script>

<!-- GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-N5CMQL9C4M"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-N5CMQL9C4M');</script>

<!-- Performance -->
<link rel="dns-prefetch" href="//lh3.googleusercontent.com"/>
<link rel="dns-prefetch" href="//login.smoobu.com"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet"/>

<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --night:#0D0907;--night2:#1A1008;--cream:#F9F5F0;--white:#FFFFFF;
  --clay:#C4571F;--clay-l:#D96830;--clay-d:#A8461A;
  --text:#1A0F07;--muted:#6B5B50;--muted2:#8A7B72;
  --gold:#C4932A;--accent-warm:#F4A47A;
  --border:rgba(196,87,31,0.13);--border-light:rgba(196,87,31,0.07);
  --sh:0 2px 16px rgba(13,9,7,0.07),0 0 0 1px rgba(196,87,31,0.06);
  --sh-hover:0 10px 40px rgba(13,9,7,0.13),0 0 0 1px rgba(196,87,31,0.10);
  --serif:'Cormorant Garamond',Georgia,serif;
  --sans:'Outfit',system-ui,sans-serif;
  --max:1180px;--r:14px;
}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--cream);color:var(--text);overflow-x:hidden;-webkit-font-smoothing:antialiased}
a{text-decoration:none}
img{display:block}

/* Progress bar */
#prog{position:fixed;top:0;left:0;height:2px;background:var(--clay);z-index:201;width:0%;transition:width .08s linear;pointer-events:none;transform-origin:left}

/* NAV */
nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:68px;transition:background .4s,backdrop-filter .4s}
nav.scrolled{background:rgba(13,9,7,.92);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.06)}
.brand{font-family:var(--serif);font-size:1.45rem;font-weight:400;color:var(--white);letter-spacing:.04em}
.nav-links{display:flex;align-items:center;gap:2rem}
.nav-links a{font-size:.875rem;color:rgba(255,255,255,.65);font-weight:400;letter-spacing:-.012em;transition:color .2s}
.nav-links a:hover{color:var(--white)}
.btn-nav{background:var(--clay)!important;color:var(--white)!important;padding:.45rem 1.25rem;border-radius:9999px;font-size:.85rem;font-weight:500;letter-spacing:-.01em;transition:background .2s}
.btn-nav:hover{background:var(--clay-l)!important}
.ham{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:.4rem}
.ham span{display:block;width:22px;height:1.5px;background:var(--white);border-radius:2px}
.mob{display:none;flex-direction:column;background:var(--night);padding:1.25rem 1.5rem 1.75rem;gap:.25rem;border-top:1px solid rgba(255,255,255,.05)}
.mob a{font-size:.975rem;color:rgba(255,255,255,.7);font-weight:400;padding:.75rem 0;border-bottom:1px solid rgba(255,255,255,.06)}
.mob-btn{background:var(--clay);color:var(--white)!important;padding:.8rem 1.5rem;border-radius:9999px;text-align:center;margin-top:.75rem;font-weight:500;display:block}
.mob.open{display:flex}

/* HERO */
.hero{position:relative;min-height:100vh;display:flex;align-items:center;overflow:hidden}
.hero-bg{position:absolute;inset:0;z-index:0}
.hero-bg img{width:100%;height:100%;object-fit:cover;object-position:center 30%}
.hero-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(135deg,rgba(13,9,7,.86) 0%,rgba(26,16,8,.73) 45%,rgba(13,9,7,.56) 100%)}
.hero-content{position:relative;z-index:2;width:100%;max-width:var(--max);margin:0 auto;padding:9rem 2.5rem 5rem;display:grid;grid-template-columns:1fr 400px;gap:4rem;align-items:center}
.badge-hero{display:inline-flex;align-items:center;gap:.5rem;background:rgba(196,87,31,.18);border:1px solid rgba(196,87,31,.32);color:var(--accent-warm);font-size:.72rem;font-weight:500;letter-spacing:.09em;text-transform:uppercase;padding:.35rem 1rem;border-radius:9999px;margin-bottom:1.5rem}
h1{font-family:var(--serif);font-size:clamp(2.8rem,5.5vw,5rem);font-weight:400;line-height:1.06;color:var(--white);margin-bottom:1.25rem;letter-spacing:-.01em}
h1 em{font-style:italic;color:var(--accent-warm)}
.hero-sub{font-size:1.05rem;color:rgba(255,255,255,.6);line-height:1.72;margin-bottom:2rem;max-width:520px;font-weight:300;letter-spacing:-.012em}
.hero-pills{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:2.25rem}
.hero-pill{display:inline-flex;align-items:center;gap:.3rem;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.13);color:rgba(255,255,255,.82);font-size:.78rem;font-weight:400;letter-spacing:-.01em;padding:.38rem .875rem;border-radius:9999px}
.ctas{display:flex;gap:.875rem;flex-wrap:wrap}
.btn-p{background:var(--clay);color:var(--white);padding:.875rem 2.25rem;border-radius:9999px;font-size:.95rem;font-weight:500;letter-spacing:-.01em;transition:background .2s,transform .15s;display:inline-block}
.btn-p:hover{background:var(--clay-l);transform:translateY(-1px)}
.btn-s{border:1.5px solid rgba(255,255,255,.3);color:rgba(255,255,255,.88);padding:.75rem 1.875rem;border-radius:9999px;font-size:.95rem;font-weight:400;letter-spacing:-.012em;transition:all .2s;display:inline-block}
.btn-s:hover{border-color:rgba(255,255,255,.65);color:var(--white)}

/* Hero card */
.hero-card{background:rgba(255,255,255,.06);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.11);border-radius:20px;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem}
.hc-title{font-size:.68rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.35rem}
.hc-stats{display:grid;grid-template-columns:1fr 1fr;gap:.875rem}
.hcs{background:rgba(255,255,255,.05);border-radius:12px;padding:.875rem;text-align:center;border:1px solid rgba(255,255,255,.06)}
.hcs-n{font-family:var(--serif);font-size:2.1rem;font-weight:400;color:var(--white);line-height:1}
.hcs-l{font-size:.67rem;color:rgba(255,255,255,.4);margin-top:.3rem;letter-spacing:.05em;text-transform:uppercase}
.hc-rating{display:flex;align-items:center;gap:.875rem;background:rgba(196,147,42,.1);border:1px solid rgba(196,147,42,.18);border-radius:12px;padding:.875rem}
.hc-rating-n{font-family:var(--serif);font-size:2rem;font-weight:400;color:#E8B84B;line-height:1;flex-shrink:0}
.hc-rating-lbl strong{font-size:.9rem;color:var(--white);display:block;font-weight:500;letter-spacing:-.01em}
.hc-rating-lbl span{font-size:.72rem;color:rgba(255,255,255,.38)}
.hc-cta{background:var(--clay);color:var(--white);text-align:center;padding:.875rem;border-radius:9999px;font-size:.875rem;font-weight:500;letter-spacing:-.01em;transition:background .2s;display:block}
.hc-cta:hover{background:var(--clay-l)}
.scroll-ind{position:absolute;bottom:2.5rem;left:50%;transform:translateX(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:.45rem;color:rgba(255,255,255,.28)}
.scroll-ind span{font-size:.65rem;letter-spacing:.12em;text-transform:uppercase}
.scroll-dot{width:1px;height:36px;background:linear-gradient(to bottom,rgba(255,255,255,.35),transparent)}

/* TRUST BAR */
.trust-bar{background:var(--night2);border-top:1px solid rgba(255,255,255,.04);padding:.9rem 2.5rem;display:flex;justify-content:center;align-items:center;gap:1.5rem;flex-wrap:wrap}
.tb-item{display:flex;align-items:center;gap:.45rem;font-size:.8rem;color:rgba(255,255,255,.45)}
.tb-item strong{color:rgba(255,255,255,.72);font-weight:500}
.tb-sep{width:1px;height:14px;background:rgba(255,255,255,.1);flex-shrink:0}

/* SECTIONS */
.wrap{max-width:var(--max);margin:0 auto}
section{padding:5.5rem 2.5rem}
.tag{font-size:.7rem;font-weight:600;color:var(--clay);letter-spacing:.12em;text-transform:uppercase;margin-bottom:.875rem}
h2{font-family:var(--serif);font-size:clamp(2rem,4vw,3.2rem);font-weight:400;line-height:1.12;margin-bottom:1rem;letter-spacing:-.01em}
.s-sub{font-size:1rem;color:var(--muted);line-height:1.72;max-width:530px;margin-bottom:3rem;font-weight:300;letter-spacing:-.012em}

/* FEATURES */
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.125rem}
.feat{background:var(--white);border-radius:var(--r);box-shadow:var(--sh);padding:1.75rem;transition:box-shadow .25s,transform .2s}
.feat:hover{box-shadow:var(--sh-hover);transform:translateY(-2px)}
.feat.hi{background:var(--clay)}
.feat.hi .ft,.feat.hi .ficon{color:var(--white)}
.feat.hi .fd{color:rgba(255,255,255,.72)}
.feat.hi .ficon{background:rgba(255,255,255,.14)}
.ficon{width:44px;height:44px;background:rgba(196,87,31,.07);border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:.875rem;font-size:1.2rem;color:var(--clay)}
.ft{font-weight:600;font-size:.975rem;margin-bottom:.4rem;color:var(--text);letter-spacing:-.015em}
.fd{font-size:.862rem;color:var(--muted);line-height:1.62;font-weight:300}

/* GALLERY */
.gal-section{background:var(--night);padding:5.5rem 2.5rem}
.gal-section .tag{color:var(--accent-warm)}
.gal-section h2{color:var(--white)}
.gal{display:grid;grid-template-columns:1.7fr 1fr 1fr;grid-template-rows:290px 230px;gap:.75rem;margin-top:2rem}
.gi{border-radius:var(--r);overflow:hidden;background:#2A1A10;cursor:zoom-in}
.gi img{width:100%;height:100%;object-fit:cover;transition:transform .5s;display:block;pointer-events:none}
.gi:hover img{transform:scale(1.04)}
.gi-main{grid-row:1/3}

/* LIGHTBOX */
.lightbox{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:1rem}
.lb-img{max-width:90vw;max-height:88vh;object-fit:contain;border-radius:8px;pointer-events:none;user-select:none}
.lb-close{position:absolute;top:1.25rem;right:1.5rem;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:white;font-size:1.5rem;width:42px;height:42px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;line-height:1}
.lb-close:hover{background:rgba(255,255,255,.22)}
.lb-prev,.lb-next{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:white;font-size:1.4rem;width:46px;height:46px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}
.lb-prev{left:1.25rem}
.lb-next{right:1.25rem}
.lb-prev:hover,.lb-next:hover{background:rgba(255,255,255,.22)}
.lb-counter{position:absolute;bottom:1.5rem;left:50%;transform:translateX(-50%);font-size:.8rem;color:rgba(255,255,255,.45);letter-spacing:.06em;white-space:nowrap}

/* LOCATION */
.loc-grid{display:grid;grid-template-columns:1fr 1fr;gap:3.5rem;align-items:start}
.map{height:390px;border-radius:var(--r);overflow:hidden;box-shadow:var(--sh)}
.map iframe{width:100%;height:100%;border:none}
.dlist{list-style:none}
.dlist li{display:flex;justify-content:space-between;align-items:center;padding:.875rem 0;border-bottom:1px solid var(--border-light);font-size:.9rem}
.dlist li:last-child{border-bottom:none}
.dp{font-weight:400;color:var(--text);letter-spacing:-.01em}
.dt{color:var(--clay);font-weight:600;font-size:.825rem}

/* FAQ */
.faq-sec{background:var(--white)}
.faq-wrap{max-width:680px}
details{border-bottom:1px solid var(--border)}
summary{padding:1.25rem 0;cursor:pointer;font-weight:500;font-size:.95rem;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:1rem;letter-spacing:-.015em;color:var(--text)}
summary::after{content:'+';color:var(--clay);font-size:1.25rem;font-weight:300;flex-shrink:0;line-height:1}
details[open] summary::after{content:'-'}
summary::-webkit-details-marker{display:none}
.fa{padding:0 2rem 1.25rem 0;color:var(--muted);font-size:.9rem;line-height:1.78;font-weight:300}

/* POR QUE DIRECTO */
.directo-sec{background:linear-gradient(180deg,var(--cream) 0%,rgba(196,87,31,.04) 100%)}
.directo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem}
.dc{background:var(--white);border-radius:var(--r);box-shadow:var(--sh);padding:1.875rem;transition:box-shadow .25s,transform .2s}
.dc:hover{box-shadow:var(--sh-hover);transform:translateY(-2px)}
.dc-ico{font-size:2rem;margin-bottom:1rem;line-height:1}
.dc-title{font-weight:600;font-size:1rem;margin-bottom:.45rem;color:var(--text);letter-spacing:-.015em}
.dc-text{font-size:.875rem;color:var(--muted);line-height:1.65;font-weight:300}
.directo-cta{text-align:center;margin-top:2.75rem;display:flex;align-items:center;justify-content:center;gap:1.5rem;flex-wrap:wrap}
.directo-note{font-size:.9rem;color:var(--muted)}
.directo-note a{color:var(--clay);font-weight:500;transition:color .2s}
.directo-note a:hover{color:var(--clay-l)}

/* BOOKING */
.book-sec{background:var(--night);background-image:radial-gradient(ellipse 70% 50% at 50% -5%,rgba(196,87,31,.11) 0%,transparent 60%);padding:6rem 2.5rem;text-align:center}
.book-sec .tag{color:rgba(244,164,122,.75)}
.book-sec h2{color:var(--white)}
.book-sec .s-sub{color:rgba(255,255,255,.5);margin:0 auto 2.5rem;font-weight:300}
#apartmentIframe352007{min-height:600px;width:100%}

/* REVIEWS */
.rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.125rem}
.rev{background:var(--white);box-shadow:var(--sh);border-radius:var(--r);padding:1.75rem}
.stars{color:var(--gold);font-size:1rem;margin-bottom:.875rem;letter-spacing:.06em}
.rt{font-size:.875rem;color:var(--muted);line-height:1.72;margin-bottom:1rem;font-style:italic;font-weight:300}
.ra{font-size:.85rem;font-weight:600;color:var(--text);letter-spacing:-.01em}
.rs{font-size:.75rem;color:var(--muted2);margin-top:.2rem}

/* FOOTER */
footer{background:var(--night);color:rgba(255,255,255,.65);padding:4rem 2.5rem 2rem}
.fg{display:grid;grid-template-columns:2.4fr 1fr 1fr 1fr;gap:3rem;margin-bottom:3rem}
.fb{font-family:var(--serif);font-size:1.55rem;color:var(--white);margin-bottom:.875rem;font-weight:400;letter-spacing:.02em}
.ft2{font-size:.875rem;color:rgba(255,255,255,.4);line-height:1.65;max-width:240px;font-weight:300}
.fh{font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.3);margin-bottom:1.25rem}
.fl{list-style:none;display:flex;flex-direction:column;gap:.75rem}
.fl a{font-size:.862rem;color:rgba(255,255,255,.5);transition:color .2s;font-weight:300}
.fl a:hover{color:rgba(255,255,255,.88)}
.fbot{border-top:1px solid rgba(255,255,255,.06);padding-top:1.5rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem}
.fbot p,.fvft{font-size:.762rem;color:rgba(255,255,255,.28);font-weight:300}

/* WHATSAPP BUTTON */
.wa-btn{position:fixed;right:1.5rem;bottom:5.5rem;z-index:97;width:52px;height:52px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(37,211,102,.35),0 0 0 1px rgba(37,211,102,.2);transition:transform .2s,box-shadow .2s;opacity:0;pointer-events:none;transform:scale(.85)}
.wa-btn.show{opacity:1;pointer-events:auto;transform:scale(1);transition:opacity .3s,transform .3s}
.wa-btn:hover{transform:scale(1.1)!important;box-shadow:0 6px 28px rgba(37,211,102,.45)}

/* STICKY CTA (mobile only) */
.sticky-cta{display:none;position:fixed;bottom:0;left:0;right:0;z-index:99;background:var(--night2);padding:.875rem 1.25rem;gap:.75rem;border-top:1px solid rgba(255,255,255,.07);opacity:0;transform:translateY(100%);transition:opacity .3s,transform .3s}
.sticky-cta.show{opacity:1;transform:translateY(0)}
.sticky-cta a{flex:1;text-align:center;padding:.75rem;border-radius:9999px;font-size:.875rem;font-weight:500;letter-spacing:-.01em;transition:background .2s}
.sticky-cta a.sc-p{background:var(--clay);color:var(--white)}
.sticky-cta a.sc-p:hover{background:var(--clay-l)}
.sticky-cta a.sc-s{border:1.5px solid rgba(255,255,255,.28);color:rgba(255,255,255,.82)}

/* RESPONSIVE */
@media(max-width:1024px){
  .hero-content{grid-template-columns:1fr;max-width:640px}
  .hero-card{display:none}
  .feat-grid,.directo-grid{grid-template-columns:1fr 1fr}
  .rev-grid{grid-template-columns:1fr 1fr}
  .fg{grid-template-columns:1fr 1fr}
}
@media(max-width:768px){
  nav{padding:0 1.25rem}
  .nav-links{display:none}
  .ham{display:flex}
  section,.gal-section,.book-sec,footer{padding:3.5rem 1.25rem}
  h1{font-size:2.6rem}
  .hero-content{padding:8rem 1.25rem 4rem}
  .trust-bar{padding:.875rem 1.25rem;gap:.875rem}
  .tb-sep{display:none}
  .gal{grid-template-columns:1fr 1fr;grid-template-rows:170px 170px 170px}
  .gi-main{grid-row:1/2;grid-column:1/3}
  .feat-grid,.directo-grid{grid-template-columns:1fr}
  .loc-grid{grid-template-columns:1fr;gap:2rem}
  .map{height:280px}
  .rev-grid{grid-template-columns:1fr}
  .fg{grid-template-columns:1fr;gap:2rem}
  .fbot{flex-direction:column;align-items:flex-start}
  .directo-cta{flex-direction:column;gap:.875rem}
  .lb-prev{left:.5rem}
  .lb-next{right:.5rem}
  .sticky-cta{display:flex}
  body{padding-bottom:68px}
  .wa-btn{bottom:5.5rem}
}
@media(min-width:769px){
  .wa-btn{bottom:2rem}
}
</style>
<!-- Meta Pixel retargeting -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','12124662686780882173');fbq('track','PageView');
</script>
</head>
<body>

<!-- Scroll progress -->
<div id="prog"></div>

<!-- NAV -->
<nav id="mainnav">
  <a href="/" class="brand">House Sevillana</a>
  <div class="nav-links">
    <a href="#caracteristicas">La casa</a>
    <a href="#galeria">Fotos</a>
    <a href="#ubicacion">Ubicaci&oacute;n</a>
    <a href="#faq">FAQ</a>
    <a href="#reserva" class="btn-nav">Reservar directo</a>
  </div>
  <button class="ham" id="ham" aria-label="Men&uacute;"><span></span><span></span><span></span></button>
</nav>
<div class="mob" id="mob">
  <a href="#caracteristicas" onclick="cm()">La casa</a>
  <a href="#galeria" onclick="cm()">Fotos</a>
  <a href="#ubicacion" onclick="cm()">Ubicaci&oacute;n</a>
  <a href="#faq" onclick="cm()">FAQ</a>
  <a href="#reserva" class="mob-btn" onclick="cm()">Reservar directo</a>
</div>

<!-- HERO -->
<section class="hero" id="inicio">
  <div class="hero-bg">
    <img src="https://lh3.googleusercontent.com/d/1YRd-RfZKbIq-I8UqxzH3Qo4HP_6E_UF4"
         alt="Fachada House Sevillana &mdash; casa tur&iacute;stica con parking en el centro hist&oacute;rico de Sevilla"
         loading="eager" fetchpriority="high"/>
  </div>
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <div>
      <div class="badge-hero">&#9733; Reserva directa &middot; Sin comisiones</div>
      <h1>Casa con <em>parking</em><br>en el coraz&oacute;n<br>de Sevilla</h1>
      <p class="hero-sub">290 m&sup2; reformados en el casco hist&oacute;rico. 6 dormitorios, 4 ba&ntilde;os, terraza, patio andaluz y parking privado &mdash; para grupos y familias de hasta 12 personas.</p>
      <div class="hero-pills">
        <span class="hero-pill">&#127968; 290 m&sup2;</span>
        <span class="hero-pill">&#128717; 6 dorm &middot; 4 ba&ntilde;os</span>
        <span class="hero-pill">&#128663; Parking privado</span>
        <span class="hero-pill">&#9728; Terraza + Patio</span>
        <span class="hero-pill">&#128101; Hasta 12 personas</span>
      </div>
      <div class="ctas">
        <a href="https://reservas.house-sevillana.com" class="btn-p" target="_blank" rel="noopener">Consultar disponibilidad</a>
        <a href="#caracteristicas" class="btn-s">Ver la casa</a>
      </div>
    </div>
    <div class="hero-card">
      <div>
        <div class="hc-title">La propiedad</div>
        <div class="hc-stats">
          <div class="hcs"><div class="hcs-n cnt" data-n="290">290</div><div class="hcs-l">m&sup2;</div></div>
          <div class="hcs"><div class="hcs-n cnt" data-n="6">6</div><div class="hcs-l">Dorm.</div></div>
          <div class="hcs"><div class="hcs-n cnt" data-n="4">4</div><div class="hcs-l">Ba&ntilde;os</div></div>
          <div class="hcs"><div class="hcs-n cnt" data-n="12">12</div><div class="hcs-l">Hu&eacute;spedes</div></div>
        </div>
      </div>
      <div class="hc-rating">
        <div class="hc-rating-n">8.1</div>
        <div class="hc-rating-lbl">
          <strong>Muy bien valorado</strong>
          <span>Booking.com &middot; +47 rese&ntilde;as</span>
        </div>
      </div>
      <a href="#reserva" class="hc-cta">Ver disponibilidad &#8594;</a>
    </div>
  </div>
  <div class="scroll-ind" aria-hidden="true">
    <div class="scroll-dot"></div>
    <span>scroll</span>
  </div>
</section>

<!-- TRUST BAR -->
<div class="trust-bar">
  <div class="tb-item">&#128663; <strong>Parking privado</strong> &mdash; el &uacute;nico del barrio</div>
  <div class="tb-sep"></div>
  <div class="tb-item">&#10003; <strong>Confirmaci&oacute;n inmediata</strong></div>
  <div class="tb-sep"></div>
  <div class="tb-item">&#128176; Sin comisiones &mdash; <strong>ahorra hasta un 22%</strong> vs Booking</div>
  <div class="tb-sep"></div>
  <div class="tb-item">&#11088; <strong>8.1/10</strong> &middot; +47 rese&ntilde;as verificadas</div>
</div>

<!-- CARACTERÍSTICAS -->
<section id="caracteristicas">
  <div class="wrap">
    <div class="tag">La casa</div>
    <h2>Una casa sevillana para vivirla</h2>
    <p class="s-sub">290 m&sup2; reformados con materiales nobles en el coraz&oacute;n del casco hist&oacute;rico. Pensada para grupos y familias que quieren espacio, comodidad y autenticidad.</p>
    <div class="feat-grid">
      <div class="feat hi">
        <div class="ficon">&#128663;</div>
        <div class="ft">Parking privado en el edificio</div>
        <div class="fd">Rars&iacute;simo en el casco antiguo de Sevilla. 1 plaza de garaje en el propio edificio, reservable con tu estancia. Aparcar en zona hist&oacute;rica ya no es un problema.</div>
      </div>
      <div class="feat">
        <div class="ficon">&#127968;</div>
        <div class="ft">6 dormitorios dobles</div>
        <div class="fd">Todos con camas de matrimonio. Capacidad real para hasta 12 personas sin perder comodidad ni privacidad.</div>
      </div>
      <div class="feat">
        <div class="ficon">&#128705;</div>
        <div class="ft">4 ba&ntilde;os completos</div>
        <div class="fd">Con ducha o ba&ntilde;era, toallas y art&iacute;culos de bienvenida incluidos para todos los hu&eacute;spedes.</div>
      </div>
      <div class="feat">
        <div class="ficon">&#127795;</div>
        <div class="ft">Patio andaluz aut&eacute;ntico</div>
        <div class="fd">Patio sevillano con azulejos t&iacute;picos y fuente interior. El lugar favorito de todos los que nos visitan.</div>
      </div>
      <div class="feat">
        <div class="ficon">&#9728;</div>
        <div class="ft">Terraza con vistas</div>
        <div class="fd">Azotea privada con vistas al casco hist&oacute;rico. El lugar ideal para las noches de verano sevillano.</div>
      </div>
      <div class="feat">
        <div class="ficon">&#127859;</div>
        <div class="ft">Cocina totalmente equipada</div>
        <div class="fd">Horno, microondas, nevera grande, cafetera y utensilios completos. Lista para cocinar para 12 personas.</div>
      </div>
    </div>
  </div>
</section>

<!-- GALERÍA -->
<div class="gal-section" id="galeria">
  <div class="wrap">
    <div class="tag">Fotos</div>
    <h2>La casa por dentro</h2>
    <p style="font-size:.875rem;color:rgba(255,255,255,.45);margin-top:.25rem;font-weight:300">Haz clic en cualquier foto para ampliarla</p>
    <div class="gal">
      <div class="gi gi-main" onclick="openLb(0)" role="button" tabindex="0" aria-label="Ampliar foto del sal&oacute;n" onkeydown="if(event.key==='Enter')openLb(0)">
        <img src="https://lh3.googleusercontent.com/d/1rDXs-fjAmmDQFTfZ7fTutPZvosAV2GMo"
             alt="Sal&oacute;n principal House Sevillana &mdash; 290 m&sup2; en el casco hist&oacute;rico de Sevilla" loading="lazy"/>
      </div>
      <div class="gi" onclick="openLb(1)" role="button" tabindex="0" aria-label="Ampliar foto del dormitorio" onkeydown="if(event.key==='Enter')openLb(1)">
        <img src="https://lh3.googleusercontent.com/d/11KXrpvDr9wfO3W7ds0TSzMj1W7ixnQVQ"
             alt="Dormitorio House Sevillana &mdash; 6 habitaciones dobles en Sevilla centro" loading="lazy"/>
      </div>
      <div class="gi" onclick="openLb(2)" role="button" tabindex="0" aria-label="Ampliar foto del patio" onkeydown="if(event.key==='Enter')openLb(2)">
        <img src="https://lh3.googleusercontent.com/d/1oAiLqJlHLGc6iqIFtiXqZqTandNKewRf"
             alt="Patio andaluz House Sevillana &mdash; patio interior con azulejos sevillanos" loading="lazy"/>
      </div>
      <div class="gi" onclick="openLb(3)" role="button" tabindex="0" aria-label="Ampliar foto de la cocina" onkeydown="if(event.key==='Enter')openLb(3)">
        <img src="https://lh3.googleusercontent.com/d/1nSzkddZhv8ul5HMXpVsfJZfL8XJZMuzd"
             alt="Cocina House Sevillana &mdash; cocina equipada para grupos grandes" loading="lazy"/>
      </div>
      <div class="gi" onclick="openLb(4)" role="button" tabindex="0" aria-label="Ampliar foto de la fachada" onkeydown="if(event.key==='Enter')openLb(4)">
        <img src="https://lh3.googleusercontent.com/d/1YRd-RfZKbIq-I8UqxzH3Qo4HP_6E_UF4"
             alt="Fachada House Sevillana &mdash; casa hist&oacute;rica con parking en Sevilla" loading="lazy"/>
      </div>
    </div>
  </div>
</div>

<!-- UBICACIÓN -->
<section id="ubicacion">
  <div class="wrap">
    <div class="tag">Ubicaci&oacute;n</div>
    <h2>En el coraz&oacute;n del casco hist&oacute;rico</h2>
    <p class="s-sub">Calle Socorro 24, barrio de San Juli&aacute;n (41003 Sevilla). A pasos del Palacio de las Due&ntilde;as y la Iglesia de San Luis de los Franceses.</p>
    <div class="loc-grid">
      <div class="map">
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3170.8!2d-5.9924!3d37.3942!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzfCsDIzJzM5LjEiTiA1wrA1OSczMi42Ilc!5e0!3m2!1ses!2ses!4v1"
                allowfullscreen loading="lazy" title="Ubicaci&oacute;n House Sevillana &mdash; Calle Socorro 24, Sevilla"></iframe>
      </div>
      <ul class="dlist">
        <li><span class="dp">Palacio de las Due&ntilde;as</span><span class="dt">2 min a pie</span></li>
        <li><span class="dp">San Luis de los Franceses</span><span class="dt">4 min a pie</span></li>
        <li><span class="dp">Catedral de Sevilla</span><span class="dt">10 min a pie</span></li>
        <li><span class="dp">Real Alc&aacute;zar</span><span class="dt">12 min a pie</span></li>
        <li><span class="dp">Torre del Oro</span><span class="dt">14 min a pie</span></li>
        <li><span class="dp">Plaza de Espa&ntilde;a</span><span class="dt">15 min a pie</span></li>
        <li><span class="dp">Barrio de Triana</span><span class="dt">20 min a pie</span></li>
        <li><span class="dp">Estaci&oacute;n Santa Justa</span><span class="dt">25 min a pie</span></li>
        <li><span class="dp">Aeropuerto SVQ</span><span class="dt">20 min en taxi</span></li>
      </ul>
    </div>
  </div>
</section>

<!-- FAQ (10 preguntas) -->
<div class="faq-sec">
  <section id="faq">
    <div class="wrap">
      <div class="tag">Preguntas frecuentes</div>
      <h2>Todo lo que necesitas saber</h2>
      <div class="faq-wrap">
        <details open>
          <summary>&iquest;Tiene parking privado House Sevillana?</summary>
          <div class="fa">S&iacute;. Dispone de una plaza de garaje privado en el mismo edificio, reservable con tu estancia. Aparcar en el casco antiguo de Sevilla es muy complicado y costoso &mdash; esta es nuestra ventaja m&aacute;s valorada por los hu&eacute;spedes que llegan en coche.</div>
        </details>
        <details>
          <summary>&iquest;Para cu&aacute;ntas personas es House Sevillana?</summary>
          <div class="fa">6 dormitorios dobles para hasta 12 personas. Perfecta para grupos de amigos, familias numerosas multigeneracionales o varias parejas que viajan juntas a Sevilla. Si eres menos de 6 personas, tambi&eacute;n es una opci&oacute;n excepcional por el espacio y el precio por persona.</div>
        </details>
        <details>
          <summary>&iquest;A qu&eacute; distancia est&aacute; la Catedral de Sevilla?</summary>
          <div class="fa">La Catedral y la Giralda est&aacute;n a unos 10 minutos andando. El Real Alc&aacute;zar a 12 minutos, la Torre del Oro a 14 y la Plaza de Espa&ntilde;a a 15 minutos a pie. House Sevillana est&aacute; en el barrio de San Juli&aacute;n, en pleno casco antiguo, a menos de 5 minutos del Palacio de las Due&ntilde;as.</div>
        </details>
        <details>
          <summary>&iquest;Se admiten ni&ntilde;os? &iquest;Y mascotas?</summary>
          <div class="fa">Se admiten ni&ntilde;os de todas las edades. La casa es ideal para familias multigeneracionales gracias a sus dimensiones y 4 ba&ntilde;os. Las mascotas no est&aacute;n permitidas en la propiedad.</div>
        </details>
        <details>
          <summary>&iquest;Se permiten despedidas de soltero o fiestas?</summary>
          <div class="fa">No. Las despedidas de soltero/a y eventos similares no est&aacute;n permitidos. Hay silencio obligatorio entre las 21:00 y las 09:00 h. Se aplica un dep&oacute;sito de garant&iacute;a de hasta 150 &euro; que se devuelve tras el check-out si no hay desperfectos.</div>
        </details>
        <details>
          <summary>&iquest;Cu&aacute;les son los horarios de check-in y check-out?</summary>
          <div class="fa">Check-in a partir de las 15:00 h. Check-out hasta las 12:00 h. Si necesitas horario flexible &mdash; llegada tarde por el avi&oacute;n o salida despu&eacute;s de comer &mdash; cons&uacute;ltalo directamente con el propietario al reservar.</div>
        </details>
        <details>
          <summary>&iquest;C&oacute;mo llego desde el aeropuerto de Sevilla?</summary>
          <div class="fa">El aeropuerto SVQ est&aacute; a unos 11 km. En taxi o VTC son aproximadamente 16&ndash;20 minutos seg&uacute;n tr&aacute;fico. Tambi&eacute;n puedes coger el autob&uacute;s EA hasta el centro (35&ndash;40 min, sale desde la terminal). Si vienes en coche, tendr&aacute;s tu plaza de parking esperando.</div>
        </details>
        <details>
          <summary>&iquest;Hay restaurantes y supermercados cerca?</summary>
          <div class="fa">A pocos metros encontrar&aacute;s La Parcer&iacute;a Caf&eacute;, Ojal&aacute; Tapas y Vinos y el Restaurante Condend&ecirc; (200 m). El Mercado de la Encarnaci&oacute;n (Las Setas) est&aacute; a 10 minutos andando con puestos de frutas, verduras y productos locales.</div>
        </details>
        <details>
          <summary>&iquest;Cu&aacute;l es la pol&iacute;tica de cancelaci&oacute;n?</summary>
          <div class="fa">Las condiciones exactas se muestran en el motor de reservas seg&uacute;n las fechas elegidas. Reservando directamente puedes hablar con el propietario para condiciones m&aacute;s flexibles &mdash; algo imposible a trav&eacute;s de las plataformas.</div>
        </details>
        <details>
          <summary>&iquest;Por qu&eacute; reservar aqu&iacute; y no en Booking.com?</summary>
          <div class="fa">Booking.com cobra entre un 15% y un 22% de comisi&oacute;n que repercute en el precio final. Reservando en esta web obtienes el mejor precio garantizado, confirmaci&oacute;n inmediata y trato directo con el propietario para cualquier necesidad antes o durante tu estancia. Sin intermediarios, sin sorpresas.</div>
        </details>
      </div>
    </div>
  </section>
</div>

<!-- POR QUÉ DIRECTO -->
<section class="directo-sec" id="directo">
  <div class="wrap">
    <div class="tag">Mejor precio garantizado</div>
    <h2>Por qu&eacute; reservar aqu&iacute; y no en Booking</h2>
    <p class="s-sub">Los portales a&ntilde;aden entre un 15% y un 22% al precio de tu estancia. Reservar directamente tiene ventajas reales que van m&aacute;s all&aacute; del dinero.</p>
    <div class="directo-grid">
      <div class="dc">
        <div class="dc-ico">&#128176;</div>
        <div class="dc-title">Hasta un 22% m&aacute;s barato</div>
        <div class="dc-text">Sin comisiones de Booking, Airbnb ni Expedia. El ahorro va &iacute;ntegro a tu bolsillo. En una semana de estancia puede suponer 200&euro; o m&aacute;s.</div>
      </div>
      <div class="dc">
        <div class="dc-ico">&#128172;</div>
        <div class="dc-title">Trato directo con el propietario</div>
        <div class="dc-text">Hablas con Alberto, no con un call center. Flexible con horarios de llegada, parking, peticiones especiales y necesidades del grupo.</div>
      </div>
      <div class="dc">
        <div class="dc-ico">&#9889;</div>
        <div class="dc-title">Confirmaci&oacute;n inmediata</div>
        <div class="dc-text">Sin esperas ni burocracia. Tu reserva confirmada al instante por WhatsApp o email. Condiciones de cancelaci&oacute;n negociables directamente.</div>
      </div>
    </div>
    <div class="directo-cta">
      <a href="#reserva" class="btn-p">Ver disponibilidad y precios</a>
      <span class="directo-note">o ll&aacute;manos al <a href="tel:+34637349990">+34 637 349 990</a></span>
    </div>
  </div>
</section>

<!-- BOOKING -->
<div class="book-sec" id="reserva">
  <div class="wrap">
    <div class="tag">Reserva directa</div>
    <h2>Comprueba disponibilidad</h2>
    <p class="s-sub">Reserva directamente sin intermediarios. Sin comisiones. Confirmaci&oacute;n inmediata.</p>
    <div id="apartmentIframe352007"></div>
  </div>
</div>

<!-- RESEÑAS -->
<section id="resenas">
  <div class="wrap">
    <div class="tag">Rese&ntilde;as</div>
    <h2>Lo que dicen nuestros hu&eacute;spedes</h2>
    <div class="rev-grid">
      <div class="rev">
        <div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <p class="rt">"Espectacular. El patio andaluz es un sue&ntilde;o. Dormimos 10 personas comod&iacute;simas y el parking fue un plus enorme en el casco hist&oacute;rico."</p>
        <div class="ra">Mar&iacute;a G.</div><div class="rs">Booking.com &middot; 9.8/10</div>
      </div>
      <div class="rev">
        <div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <p class="rt">"Incredibly spacious house in the perfect location. The rooftop terrace with evening views was our favourite spot. Great for a large family."</p>
        <div class="ra">James T.</div><div class="rs">Airbnb &middot; 5/5</div>
      </div>
      <div class="rev">
        <div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <p class="rt">"Maison parfaite pour un grand groupe. Tr&egrave;s bien situ&eacute;. Le propri&eacute;taire tr&egrave;s r&eacute;actif. On a ador&eacute; les azulejos et le patio. On recommande &agrave; 100%."</p>
        <div class="ra">Claire D.</div><div class="rs">Booking.com &middot; 9.6/10</div>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap">
    <div class="fg">
      <div>
        <div class="fb">House Sevillana</div>
        <p class="ft2">Casa tur&iacute;stica en el casco hist&oacute;rico de Sevilla. 290 m&sup2;, 6 dormitorios, parking privado. Reserva directa sin comisiones.</p>
        <p style="margin-top:.875rem;font-size:.75rem;color:rgba(255,255,255,.28);font-weight:300">VFT/SE/01179</p>
      </div>
      <div>
        <div class="fh">La casa</div>
        <ul class="fl">
          <li><a href="#caracteristicas">Caracter&iacute;sticas</a></li>
          <li><a href="#galeria">Galer&iacute;a</a></li>
          <li><a href="#ubicacion">Ubicaci&oacute;n</a></li>
          <li><a href="#faq">FAQ</a></li>
        </ul>
      </div>
      <div>
        <div class="fh">Reservar</div>
        <ul class="fl">
          <li><a href="#reserva">Reserva directa</a></li>
          <li><a href="https://www.booking.com/hotel/es/house-sevillana-parking.es.html" target="_blank" rel="noopener noreferrer">Booking.com</a></li>
          <li><a href="https://www.airbnb.es" target="_blank" rel="noopener noreferrer">Airbnb</a></li>
        </ul>
      </div>
      <div>
        <div class="fh">Contacto</div>
        <ul class="fl">
          <li><a href="mailto:alberto.suarez.gutierrez@gmail.com">Email</a></li>
          <li><a href="tel:+34637349990">+34 637 349 990</a></li>
          <li><a href="https://wa.me/34637349990" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
          <li><a href="https://maps.google.com/?q=Calle+Socorro+24+Sevilla" target="_blank" rel="noopener noreferrer">Calle Socorro 24, Sevilla</a></li>
        </ul>
      </div>
    </div>
    <div class="fbot">
      <p>&copy; 2025 House Sevillana &middot; Bercell &middot; Todos los derechos reservados</p>
      <span class="fvft">VFT/SE/01179 &middot; Registro de Turismo de Andaluc&iacute;a</span>
    </div>
  </div>
</footer>

<!-- LIGHTBOX -->
<div id="lb-overlay" class="lightbox" style="display:none" role="dialog" aria-modal="true" aria-label="Galer&iacute;a de im&aacute;genes">
  <button class="lb-close" id="lb-close-btn" aria-label="Cerrar galer&iacute;a">&times;</button>
  <img src="" alt="" class="lb-img" id="lb-img"/>
  <button class="lb-prev" id="lb-prev-btn" aria-label="Imagen anterior">&#8592;</button>
  <button class="lb-next" id="lb-next-btn" aria-label="Imagen siguiente">&#8594;</button>
  <div class="lb-counter" id="lb-counter">1 / 5</div>
</div>

<!-- WHATSAPP -->
<a href="https://wa.me/34637349990?text=Hola%2C%20me%20interesa%20House%20Sevillana%20para%20un%20grupo" id="wa-btn" class="wa-btn" target="_blank" rel="noopener noreferrer" aria-label="Contactar por WhatsApp">
  <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
</a>

<!-- STICKY CTA (mobile) -->
<div class="sticky-cta" id="sticky-cta">
  <a href="#reserva" class="sc-p">Consultar disponibilidad</a>
  <a href="tel:+34637349990" class="sc-s">&#128222; Llamar</a>
</div>

<script>
// ── NAV SCROLL ──
(function(){
  var nav=document.getElementById('mainnav');
  function sc(){nav.classList.toggle('scrolled',window.scrollY>60)}
  window.addEventListener('scroll',sc,{passive:true});sc();
})();

// ── MOBILE MENU ──
document.getElementById('ham').onclick=function(){document.getElementById('mob').classList.toggle('open')};
function cm(){document.getElementById('mob').classList.remove('open')}

// ── SMOOBU WIDGET ──
(function(){
  var s=document.createElement('script');
  s.src='https://login.smoobu.com/js/Settings/BookingToolIframe.js';
  s.onload=function(){
    BookingToolIframe.initialize({
      url:'https://login.smoobu.com/es/booking-tool/iframe/103685/352007',
      baseUrl:'https://login.smoobu.com',
      target:'#apartmentIframe352007'
    });
  };
  document.body.appendChild(s);
})();

// ── SCROLL PROGRESS BAR ──
(function(){
  var prog=document.getElementById('prog');
  window.addEventListener('scroll',function(){
    var pct=window.scrollY/(document.body.scrollHeight-window.innerHeight)*100;
    if(prog)prog.style.width=pct+'%';
  },{passive:true});
})();

// ── LIGHTBOX ──
(function(){
  var lbImages=[
    'https://lh3.googleusercontent.com/d/1rDXs-fjAmmDQFTfZ7fTutPZvosAV2GMo',
    'https://lh3.googleusercontent.com/d/11KXrpvDr9wfO3W7ds0TSzMj1W7ixnQVQ',
    'https://lh3.googleusercontent.com/d/1oAiLqJlHLGc6iqIFtiXqZqTandNKewRf',
    'https://lh3.googleusercontent.com/d/1nSzkddZhv8ul5HMXpVsfJZfL8XJZMuzd',
    'https://lh3.googleusercontent.com/d/1YRd-RfZKbIq-I8UqxzH3Qo4HP_6E_UF4'
  ];
  var lbAlts=['Salon House Sevillana','Dormitorio House Sevillana','Patio andaluz House Sevillana','Cocina House Sevillana','Fachada House Sevillana'];
  var current=0;
  var overlay=document.getElementById('lb-overlay');
  var lbImg=document.getElementById('lb-img');
  var counter=document.getElementById('lb-counter');

  window.openLb=function(n){
    current=n;
    lbImg.src=lbImages[n];
    lbImg.alt=lbAlts[n];
    counter.textContent=(n+1)+' / '+lbImages.length;
    overlay.style.display='flex';
    document.body.style.overflow='hidden';
    document.getElementById('lb-close-btn').focus();
  };
  function closeLb(){
    overlay.style.display='none';
    document.body.style.overflow='';
  }
  function prevLb(){current=(current-1+lbImages.length)%lbImages.length;window.openLb(current)}
  function nextLb(){current=(current+1)%lbImages.length;window.openLb(current)}

  document.getElementById('lb-close-btn').onclick=closeLb;
  document.getElementById('lb-prev-btn').onclick=prevLb;
  document.getElementById('lb-next-btn').onclick=nextLb;
  overlay.addEventListener('click',function(e){if(e.target===overlay)closeLb()});
  document.addEventListener('keydown',function(e){
    if(overlay.style.display!=='none'){
      if(e.key==='Escape')closeLb();
      else if(e.key==='ArrowLeft')prevLb();
      else if(e.key==='ArrowRight')nextLb();
    }
  });
})();

// ── ANIMATED COUNTERS ──
(function(){
  function runCounter(el){
    var target=parseInt(el.getAttribute('data-n'));
    var start=null;
    var dur=900;
    function step(ts){
      if(!start)start=ts;
      var p=Math.min((ts-start)/dur,1);
      var ease=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      el.textContent=Math.round(ease*target);
      if(p<1)requestAnimationFrame(step);
      else el.textContent=target;
    }
    requestAnimationFrame(step);
  }
  if('IntersectionObserver' in window){
    var cntObs=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){runCounter(e.target);cntObs.unobserve(e.target)}
      });
    },{threshold:0.5});
    document.querySelectorAll('.cnt').forEach(function(el){
      el.textContent='0';
      cntObs.observe(el);
    });
  }
})();

// ── REVEAL ANIMATIONS ──
(function(){
  if(!('IntersectionObserver' in window))return;
  var st=document.createElement('style');
  st.textContent='.rv{opacity:0;transform:translateY(20px)}.rv.in{opacity:1;transform:none;transition:opacity .6s ease,transform .6s ease}.feat.rv.in:hover{transform:translateY(-2px)}.feat.rv:nth-child(2){transition-delay:.1s}.feat.rv:nth-child(3){transition-delay:.2s}.rev.rv:nth-child(2){transition-delay:.1s}.rev.rv:nth-child(3){transition-delay:.2s}.dc.rv:nth-child(2){transition-delay:.1s}.dc.rv:nth-child(3){transition-delay:.2s}';
  document.head.appendChild(st);
  var els=document.querySelectorAll('.feat,.rev,.dc');
  var rvObs=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){e.target.classList.add('in');rvObs.unobserve(e.target)}
    });
  },{threshold:0.08,rootMargin:'0px 0px -30px 0px'});
  els.forEach(function(el){el.classList.add('rv');rvObs.observe(el)});
})();

// ── STICKY CTA + WHATSAPP SHOW ──
(function(){
  var sticky=document.getElementById('sticky-cta');
  var wa=document.getElementById('wa-btn');
  var hero=document.getElementById('inicio');
  function update(){
    var past=window.scrollY>window.innerHeight*0.75;
    if(sticky)sticky.classList.toggle('show',past);
    if(wa)wa.classList.toggle('show',past);
  }
  window.addEventListener('scroll',update,{passive:true});
  update();
})();
</script>

<!-- Sección Reviews -->
<section style="background:#fdf6f0;padding:48px 24px">
  <div style="max-width:900px;margin:0 auto">
    <h2 style="text-align:center;font-size:clamp(20px,3vw,28px);margin-bottom:8px;font-family:Georgia,serif">Lo que dicen los huéspedes</h2>
    <p style="text-align:center;color:#666;font-size:14px;margin-bottom:32px">⭐⭐⭐⭐⭐ 9.2/10 en Booking · 4.9/5 en Airbnb</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="font-size:15px;color:#f59e0b;margin-bottom:10px">★★★★★</div>
        <p style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:12px">"La casa más especial donde nos hemos alojado. El patio andaluz es increíble y el parking privado fue clave con el coche. Volveremos seguro."</p>
        <div style="font-size:12px;color:#9ca3af">María G. · Familia de 8 · Booking</div>
      </div>
      <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="font-size:15px;color:#f59e0b;margin-bottom:10px">★★★★★</div>
        <p style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:12px">"Perfecta para grupos grandes. 6 habitaciones y todo el espacio que necesitas. A 10 minutos de la Catedral a pie. Alberto muy atento."</p>
        <div style="font-size:12px;color:#9ca3af">James T. · Grupo de amigos · Airbnb</div>
      </div>
      <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="font-size:15px;color:#f59e0b;margin-bottom:10px">★★★★★</div>
        <p style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:12px">"Vinimos para una boda en Sevilla. La terraza fue perfecta para prepararnos. El barrio de la Macarena es precioso y auténtico."</p>
        <div style="font-size:12px;color:#9ca3af">Claudia M. · Grupo boda · Booking</div>
      </div>
    </div>
  </div>
</section>

<!-- Links internos SEO -->
<section style="background:#1a1a1a;padding:32px 24px">
  <div style="max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
    <a href="/que-ver" style="background:#2d2d2d;color:white;padding:12px 16px;border-radius:10px;text-decoration:none;font-size:13px">
      🗺️ Qué ver en Sevilla
    </a>
    <a href="/barrio" style="background:#2d2d2d;color:white;padding:12px 16px;border-radius:10px;text-decoration:none;font-size:13px">
      🏘️ El barrio de la Macarena
    </a>
    <a href="https://reservas.house-sevillana.com" style="background:#B04E2A;color:white;padding:12px 16px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">
      📅 Comprobar disponibilidad
    </a>
  </div>
</section>
</body>
</html>`;

export const runtime = 'edge';

export async function GET() {
  return new NextResponse(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
