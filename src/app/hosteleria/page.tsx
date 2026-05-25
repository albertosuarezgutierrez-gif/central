"use client"
import { useEffect } from "react"

export default function HosteleriaPage() {
  useEffect(() => {
    document.querySelectorAll('.fq').forEach((b: any) => {
      b.addEventListener('click', () => {
        const i = b.closest('.fi'), o = i.classList.contains('open')
        document.querySelectorAll('.fi').forEach((x: any) => x.classList.remove('open'))
        if (!o) i.classList.add('open')
      })
    })
    document.querySelectorAll('a[href^="#"]').forEach((l: any) => {
      l.addEventListener('click', (e: any) => {
        e.preventDefault()
        const t = document.querySelector(l.getAttribute('href'))
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
    const form = document.getElementById('cf')
    if (form) {
      form.addEventListener('submit', async (e: any) => {
        e.preventDefault()
        const btn = document.getElementById('sb') as HTMLButtonElement
        const nom = (document.getElementById('nom') as HTMLInputElement)?.value.trim()
        const mail = (document.getElementById('mail') as HTMLInputElement)?.value.trim()
        const tel = (document.getElementById('tel') as HTMLInputElement)?.value.trim()
        const tipo = (document.getElementById('tipo') as HTMLSelectElement)?.value
        const rgpd = (document.getElementById('rgpd') as HTMLInputElement)?.checked
        if (!nom || !mail || !tel || !tipo) { alert('Rellena los campos obligatorios (*).'); return }
        if (!rgpd) { alert('Acepta la política de privacidad.'); return }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { alert('Email no válido.'); return }
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...' }
        try {
          const r = await fetch('/api/leads/landing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nom, email: mail, telefono: tel, tipo_negocio: tipo, origen: 'landing_hosteleria', rgpd_aceptado: true, rgpd_fecha: new Date().toISOString() }) })
          if (r.ok) {
            const fc = document.getElementById('fc'), fok = document.getElementById('fok')
            if (fc) fc.style.display = 'none'
            if (fok) fok.style.display = 'block'
          } else throw new Error()
        } catch(_) {
          const s = encodeURIComponent('Demo ia.rest Hosteleria - ' + nom)
          const b2 = encodeURIComponent('Nombre: ' + nom + '\nEmail: ' + mail + '\nTel: ' + tel + '\nTipo: ' + tipo + '\nRGPD: Si')
          window.location.href = 'mailto:hola@iarest.es?subject=' + s + '&body=' + b2
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'Solicitar demo →' }
        }
      })
    }
  }, [])

  return (
    <>
      <title>Software TPV para Hostelería en España | ia.rest</title>
      <meta name="description" content="ia.rest gestiona cualquier negocio de hostelería: bar, restaurante, chiringuito, feria y food truck. TPV por voz, KDS, almacén y VeriFactu. Desde 59€/mes." />
      <meta name="keywords" content="software TPV hostelería España, programa gestión bar restaurante, TPV chiringuito hostelería, software feria hostelería, gestión restaurante voz, verifactu hostelería 2026" />
      <link rel="canonical" href="https://www.iarest.es/hosteleria" />
      <meta property="og:title" content="Software TPV para Hostelería | ia.rest" />
      <meta property="og:description" content="Bar, restaurante, chiringuito, feria. Si sirves, ia.rest lo gestiona. TPV por voz, KDS y VeriFactu desde 59€/mes." />
      <meta property="og:url" content="https://www.iarest.es/hosteleria" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://www.iarest.es/og-hosteleria.jpg" />
      <meta property="og:locale" content="es_ES" />
      <meta property="og:site_name" content="ia.rest" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Software TPV para Hostelería | ia.rest" />
      <meta name="twitter:description" content="Bar, restaurante, chiringuito, feria. Si sirves, ia.rest lo gestiona." />
      <meta name="twitter:image" content="https://www.iarest.es/og-hosteleria.jpg" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "SoftwareApplication", "@id": "https://www.iarest.es/#software-hosteleria", "name": "ia.rest — TPV para Hostelería", "url": "https://www.iarest.es/hosteleria", "applicationCategory": "BusinessApplication", "operatingSystem": "Web, Android", "description": "Sistema de gestión para hostelería: bar, restaurante, chiringuito, feria y food truck. TPV por voz, KDS, almacén, VeriFactu y APPCC.", "offers": { "@type": "Offer", "price": "59", "priceCurrency": "EUR" }, "provider": { "@type": "Organization", "name": "ia.rest", "url": "https://www.iarest.es", "telephone": "+34637349990", "email": "hola@iarest.es" } },
          { "@type": "FAQPage", "mainEntity": [
            { "@type": "Question", "name": "¿ia.rest funciona para chiringuitos y puestos de feria?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. ia.rest está diseñado para cualquier negocio que sirva en mesa o mostrador: bar, restaurante, chiringuito, puesto de feria o food truck. El sistema funciona desde el móvil sin necesidad de hardware fijo." } },
            { "@type": "Question", "name": "¿ia.rest incluye VeriFactu?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. Incluido en todos los planes. Obligatorio para hostelería desde 2026." } },
            { "@type": "Question", "name": "¿Cuánto cuesta?", "acceptedAnswer": { "@type": "Answer", "text": "59€/mes de base más 20€ por usuario. Sin comisión por ventas. Prueba gratuita 14 días sin tarjeta." } },
            { "@type": "Question", "name": "¿Funciona sin internet estable?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. ia.rest tiene modo offline para chiringuitos y ferias donde la conexión puede ser inestable. Las comandas se sincronizan cuando vuelve la conexión." } }
          ]},
          { "@type": "BreadcrumbList", "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "ia.rest", "item": "https://www.iarest.es" },
            { "@type": "ListItem", "position": 2, "name": "Software TPV Hostelería", "item": "https://www.iarest.es/hosteleria" }
          ]}
        ]
      })}} />
      <style dangerouslySetInnerHTML={{ __html: `
:root{--p:#F6F1E7;--d:#14110E;--b2:#1E1A15;--b3:#2A221A;--r:#D9442B;--g:#3F7D44;--i2:#D8CDB6;--i3:#9C8E7E;--i4:#6B5F52;--ru:#2E2720}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--d);color:var(--p);font-family:'Bricolage Grotesque',sans-serif;-webkit-font-smoothing:antialiased}
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;1,300&family=DM+Mono:wght@300;400&family=Bricolage+Grotesque:wght@300;400;700&display=swap');
a{color:inherit;text-decoration:none}
.w{max-width:1120px;margin:0 auto}
.topbar{position:sticky;top:0;z-index:100;background:rgba(20,17,14,.93);backdrop-filter:blur(12px);border-bottom:1px solid var(--ru);padding:0 48px;height:60px;display:flex;align-items:center;justify-content:space-between}
.logo{font-family:'Newsreader',serif;font-size:22px;font-weight:300}.logo .dot{color:var(--r)}
.tnav{display:flex;align-items:center;gap:28px}
.tnav a{font-size:13px;color:var(--i3);transition:color .2s}.tnav a:hover{color:var(--p)}
.bcta{background:var(--r);color:#fff;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:700;border:none;cursor:pointer;font-family:'Bricolage Grotesque',sans-serif}
sec{padding:80px 48px}
.lbl{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--r);margin-bottom:14px}
h1{font-family:'Newsreader',serif;font-size:clamp(44px,7vw,88px);font-weight:300;line-height:1.0;letter-spacing:-.03em;margin-bottom:18px;max-width:860px}
h1 em{font-style:italic;color:var(--r)}
h2{font-family:'Newsreader',serif;font-size:clamp(30px,4.5vw,54px);font-weight:300;line-height:1.1;color:var(--p);letter-spacing:-.02em}
.hero{padding:112px 48px 80px;border-bottom:1px solid var(--ru);position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;top:-160px;right:-160px;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(217,68,43,.07) 0%,transparent 70%);pointer-events:none}
.tag{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--ru);border-radius:100px;padding:6px 14px;font-family:'DM Mono',monospace;font-size:11px;color:var(--i3);letter-spacing:.1em;margin-bottom:28px}
.pulse{width:6px;height:6px;border-radius:50%;background:var(--r);animation:pu 2s infinite}
@keyframes pu{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
.hero-sub{font-size:18px;color:var(--i3);font-weight:300;max-width:540px;line-height:1.6;margin-bottom:36px}
.acts{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:52px}
.bp{background:var(--r);color:#fff;padding:13px 26px;border-radius:9px;font-weight:700;font-size:15px;transition:opacity .2s,transform .15s;display:inline-block}.bp:hover{opacity:.88;transform:translateY(-1px)}
.bg{border:1px solid var(--ru);color:var(--i2);padding:13px 26px;border-radius:9px;font-size:15px;display:inline-block;transition:border-color .2s,color .2s}.bg:hover{border-color:var(--i3);color:var(--p)}
.stats{display:flex;gap:44px;flex-wrap:wrap;padding-top:28px;border-top:1px solid var(--ru)}
.sn{font-family:'Newsreader',serif;font-size:34px;font-weight:300;color:var(--p);line-height:1}.sn span{color:var(--r)}
.sl{font-size:12px;color:var(--i3);margin-top:3px;font-family:'DM Mono',monospace;letter-spacing:.06em}
/* NEGOCIOS */
.neg{background:var(--b2)}
.neg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:2px;margin-top:40px}
.neg-item{background:var(--b3);padding:28px 22px;border-bottom:2px solid transparent;transition:border-color .2s;cursor:default;text-align:center}
.neg-item:hover{border-bottom-color:var(--r)}
.neg-ico{font-size:32px;margin-bottom:12px}
.neg-name{font-weight:700;font-size:15px;color:var(--p);margin-bottom:4px}
.neg-sub{font-size:12px;color:var(--i3)}
/* FUNCIONALIDADES */
.func{background:var(--d)}
.func-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;margin-top:40px;border:1px solid var(--ru);border-radius:12px;overflow:hidden}
.func-item{padding:24px;background:var(--d);border-right:1px solid var(--ru);border-bottom:1px solid var(--ru);transition:background .2s}.func-item:hover{background:var(--b2)}
.func-num{font-family:'DM Mono',monospace;font-size:11px;color:var(--r);margin-bottom:8px}
.func-name{font-weight:700;font-size:14px;color:var(--p);margin-bottom:4px}
.func-tag{font-size:11px;color:var(--i3)}
/* FERIA */
.feria{background:var(--b2)}
.feria-inner{display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center;margin-top:16px}
.feria-items{list-style:none;margin-top:24px}
.feria-items li{font-weight:700;font-size:15px;color:var(--p);padding:12px 0;border-bottom:1px solid var(--ru);display:flex;gap:10px;align-items:center}
.feria-items li::before{content:'→';color:var(--r);flex-shrink:0}
.feria-visual{background:var(--b3);border-radius:12px;padding:32px;border:1px solid var(--ru);text-align:center}
.feria-visual .big{font-family:'Newsreader',serif;font-size:72px;font-weight:300;color:var(--p);line-height:1}
.feria-visual .big span{color:var(--r)}
.feria-visual p{font-size:13px;color:var(--i3);margin-top:8px}
/* PRICING */
.pricing{background:var(--d)}
.p-inner{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;margin-top:16px}
.p-card{background:var(--b2);border-radius:14px;padding:36px;border:1px solid var(--ru);text-align:center;transition:border-color .2s}.p-card:hover{border-color:var(--r)}
.p-desde{font-family:'DM Mono',monospace;font-size:11px;color:var(--i3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:10px}
.p-num{font-family:'Newsreader',serif;font-size:72px;font-weight:300;color:var(--p);line-height:1;letter-spacing:-.03em}
.p-num sup{font-size:26px;vertical-align:super;color:var(--r)}
.p-num sub{font-size:17px;color:var(--i3)}
.p-det{font-size:13px;color:var(--i3);margin-top:6px}
.p-items{list-style:none;margin-top:20px;text-align:left}
.p-items li{font-size:13px;color:var(--i2);padding:7px 0;border-bottom:1px solid var(--ru);display:flex;gap:8px}.p-items li:last-child{border-bottom:none}
.p-items li .c{color:var(--g);flex-shrink:0}
.p-ej{background:var(--b3);border-radius:8px;padding:16px 20px;margin-top:16px}
.pe-lb{font-family:'DM Mono',monospace;font-size:10px;color:var(--i4);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.pe-r{display:flex;justify-content:space-between;font-size:12px;color:var(--i3);padding:3px 0}
.pe-t{display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:var(--p);padding-top:8px;margin-top:4px;border-top:1px solid var(--ru)}
/* FAQ */
.faq{background:var(--b2)}
.fq-list{margin-top:36px;max-width:720px}
.fi{border-bottom:1px solid var(--ru)}
.fq{padding:16px 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:14px;font-weight:700;font-size:14px;color:var(--p);user-select:none}
.fq .arr{color:var(--r);transition:transform .25s;flex-shrink:0}
.fa{font-size:13px;color:var(--i3);line-height:1.6;max-height:0;overflow:hidden;transition:max-height .3s ease,padding .25s}
.fi.open .arr{transform:rotate(180deg)}
.fi.open .fa{max-height:160px;padding-bottom:16px}
/* CONTACTO */
.contacto{background:var(--d);border-top:1px solid var(--ru)}
.c-inner{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:flex-start}
.c-copy h2{font-size:clamp(26px,4vw,44px);margin-bottom:12px}
.c-copy h2 em{font-style:italic;color:var(--r)}
.c-copy p{font-size:14px;color:var(--i3);line-height:1.65;margin-bottom:16px}
.prs{display:flex;flex-direction:column;gap:8px;margin-top:16px}
.pr{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--i3)}.pr .ck{color:var(--g)}
.f-card{background:var(--b2);border-radius:12px;padding:32px;border:1px solid var(--ru)}
.f-ttl{font-weight:700;font-size:16px;color:var(--p);margin-bottom:2px}
.f-sub{font-size:12px;color:var(--i3);margin-bottom:20px}
.f-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fg{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.fg label{font-size:10px;font-family:'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--i3)}
.fg input,.fg select{background:var(--b3);border:1px solid var(--ru);border-radius:6px;padding:9px 12px;font-size:14px;color:var(--p);font-family:'Bricolage Grotesque',sans-serif;outline:none;width:100%;-webkit-appearance:none;appearance:none;transition:border-color .2s}
.fg input::placeholder{color:var(--i4)}
.fg input:focus,.fg select:focus{border-color:var(--r)}
.fg select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239C8E7E' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;cursor:pointer}
.rgpd{display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;background:rgba(217,68,43,.05);border:1px solid rgba(217,68,43,.18);border-radius:7px;padding:11px 13px}
.rgpd input[type=checkbox]{flex-shrink:0;width:15px;height:15px;margin-top:2px;accent-color:var(--r);cursor:pointer}
.rgpd p{font-size:11px;color:var(--i3);line-height:1.5}
.rgpd a{color:var(--i2);text-decoration:underline}
.rgpd strong{color:var(--p)}
.f-btn{width:100%;background:var(--r);color:#fff;padding:12px;border-radius:8px;font-weight:700;font-size:15px;border:none;cursor:pointer;font-family:'Bricolage Grotesque',sans-serif;transition:opacity .2s}.f-btn:hover{opacity:.88}.f-btn:disabled{opacity:.45;cursor:not-allowed}
.f-legal{font-size:11px;color:var(--i4);text-align:center;margin-top:8px;line-height:1.4}
.f-legal a{color:var(--i3);text-decoration:underline}
.f-ok{display:none;text-align:center;padding:24px}
.f-ok .ico{font-size:40px;margin-bottom:12px}
.f-ok h3{font-family:'Newsreader',serif;font-size:20px;font-weight:300;color:var(--p);margin-bottom:6px}
.f-ok p{font-size:13px;color:var(--i3)}
footer{background:var(--d);border-top:1px solid var(--ru);padding:32px 48px}
.f-inner{max-width:1120px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.f-logo{font-family:'Newsreader',serif;font-size:18px;font-weight:300}.f-logo .dot{color:var(--r)}
.f-links{display:flex;gap:18px;flex-wrap:wrap}
.f-links a{font-size:12px;color:var(--i3);transition:color .2s}.f-links a:hover{color:var(--p)}
.f-contact{display:flex;gap:16px;flex-wrap:wrap}
.f-contact a{font-size:12px;color:var(--i3);transition:color .2s}.f-contact a:hover{color:var(--p)}
.f-copy{font-size:11px;color:var(--i4);font-family:'DM Mono',monospace}
@media(max-width:900px){
  sec,footer{padding:56px 24px}.hero{padding:72px 24px 56px}.topbar{padding:0 20px}.tnav{display:none}
  .c-inner,.p-inner,.feria-inner{grid-template-columns:1fr;gap:32px}.f-row{grid-template-columns:1fr}
  .f-inner{flex-direction:column;align-items:flex-start}
}
      `}} />
      <div dangerouslySetInnerHTML={{ __html: `

<header>
  <nav class="topbar">
    <a href="/" class="logo">ia<span class="dot">.</span>rest</a>
    <div class="tnav">
      <a href="/catering">Catering</a>
      <a href="/espacios">Espacios</a>
      <a href="#pricing">Precio</a>
      <a href="#contacto" class="bcta">Demo gratuita</a>
    </div>
  </nav>
</header>

<main>

<section class="hero">
  <div class="w">
    <div class="tag"><span class="pulse"></span>TPV en producción · España</div>
    <h1>Para cualquier negocio<br>que <em>sirva en mesa</em><br><em>o mostrador.</em></h1>
    <p class="hero-sub">Bar, restaurante, chiringuito, feria, food truck. Si sirves, ia.rest lo gestiona.</p>
    <div class="acts">
      <a href="#contacto" class="bp">Solicitar demo gratuita</a>
      <a href="#negocios" class="bg">Ver para quién es →</a>
    </div>
    <div class="stats">
      <div><div class="sn">59<span>€</span></div><div class="sl">Desde / mes</div></div>
      <div><div class="sn">0<span>%</span></div><div class="sl">Comisión</div></div>
      <div><div class="sn">14<span>d</span></div><div class="sl">Prueba gratis</div></div>
      <div><div class="sn">1<span>h</span></div><div class="sl">Onboarding</div></div>
    </div>
  </div>
</section>

<sec class="neg" id="negocios">
  <div class="w">
    <div class="lbl">Para quién es</div>
    <h2>Si sirves comida o bebida,<br>esto es para ti.</h2>
    <div class="neg-grid">
      <div class="neg-item">
        <div class="neg-ico">🍺</div>
        <div class="neg-name">Bar y cafetería</div>
        <div class="neg-sub">Mostrador y terraza</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🍽️</div>
        <div class="neg-name">Restaurante</div>
        <div class="neg-sub">Sala completa</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🌊</div>
        <div class="neg-name">Chiringuito</div>
        <div class="neg-sub">Playa y exterior</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🎡</div>
        <div class="neg-name">Feria y eventos</div>
        <div class="neg-sub">Temporal y móvil</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🚐</div>
        <div class="neg-name">Food truck</div>
        <div class="neg-sub">Sin hardware fijo</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🏨</div>
        <div class="neg-name">Hotel y resort</div>
        <div class="neg-sub">Multi-punto de venta</div>
      </div>
    </div>
  </div>
</sec>

<sec class="func" id="sistema">
  <div class="w">
    <div class="lbl">El sistema</div>
    <h2>Todo lo que necesitas.<br>Nada que no uses.</h2>
    <div class="func-grid">
      <div class="func-item">
        <div class="func-num">01</div>
        <div class="func-name">Comandas por voz</div>
        <div class="func-tag">Sin tocar pantalla</div>
      </div>
      <div class="func-item">
        <div class="func-num">02</div>
        <div class="func-name">KDS en cocina</div>
        <div class="func-tag">Sin papel</div>
      </div>
      <div class="func-item">
        <div class="func-num">03</div>
        <div class="func-name">VeriFactu</div>
        <div class="func-tag">Obligatorio 2026</div>
      </div>
      <div class="func-item">
        <div class="func-num">04</div>
        <div class="func-name">Almacén</div>
        <div class="func-tag">Stock en tiempo real</div>
      </div>
      <div class="func-item">
        <div class="func-num">05</div>
        <div class="func-name">QR en mesa</div>
        <div class="func-tag">Pedido del cliente</div>
      </div>
      <div class="func-item">
        <div class="func-num">06</div>
        <div class="func-name">Multi-local</div>
        <div class="func-tag">Un solo panel</div>
      </div>
    </div>
  </div>
</sec>

<sec class="feria">
  <div class="w">
    <div class="lbl">Para chiringuito y feria</div>
    <div class="feria-inner">
      <div>
        <h2>Funciona donde<br>otros no llegan.</h2>
        <ul class="feria-items">
          <li>Desde el móvil, sin hardware fijo</li>
          <li>Modo offline para conexión inestable</li>
          <li>Setup en menos de 1 hora</li>
          <li>Cierre de caja al final del día</li>
          <li>VeriFactu incluido</li>
        </ul>
      </div>
      <div class="feria-visual">
        <div class="big">1<span>h</span></div>
        <p>De la caja de cartón<br>al sistema operativo.</p>
      </div>
    </div>
  </div>
</sec>

<sec class="pricing" id="pricing">
  <div class="w">
    <div class="lbl">Precio</div>
    <div class="p-inner">
      <div>
        <h2>Por personas,<br>no por ventas.</h2>
        <p style="font-size:15px;color:var(--i3);line-height:1.65;margin-top:14px">Sin comisión por cada venta. Sin planes fijos. Solo pagas por los usuarios de tu equipo.</p>
        <br>
        <a href="#contacto" class="bp" style="display:inline-block">Empezar prueba gratuita</a>
      </div>
      <div>
        <div class="p-card">
          <div class="p-desde">Precio mensual</div>
          <div class="p-num"><sup>€</sup>59<sub>/mes</sub></div>
          <div class="p-det">+ 20€/usuario (2–6) · + 15€/usuario (7+)</div>
          <ul class="p-items">
            <li><span class="c">✓</span> Voz, KDS y VeriFactu</li>
            <li><span class="c">✓</span> Almacén y cierre de caja</li>
            <li><span class="c">✓</span> QR en mesa (add-on)</li>
            <li><span class="c">✓</span> Multi-local incluido</li>
            <li><span class="c">✓</span> 14 días de prueba gratis</li>
          </ul>
          <div class="p-ej">
            <div class="pe-lb">Ejemplo — Bar 3 usuarios</div>
            <div class="pe-r"><span>Base</span><span>59€</span></div>
            <div class="pe-r"><span>2 usuarios × 20€</span><span>40€</span></div>
            <div class="pe-t"><span>Total</span><strong>99€/mes</strong></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</sec>

<sec class="faq">
  <div class="w">
    <div class="lbl">FAQ</div>
    <h2>Preguntas frecuentes.</h2>
    <div class="fq-list">
      <div class="fi">
        <div class="fq" role="button" tabindex="0">¿Funciona para chiringuitos y puestos de feria? <span class="arr">↓</span></div>
        <div class="fa">Sí. ia.rest funciona desde el móvil sin hardware fijo. Tiene modo offline para cuando la conexión es inestable. Setup en menos de una hora.</div>
      </div>
      <div class="fi">
        <div class="fq" role="button" tabindex="0">¿Incluye VeriFactu? <span class="arr">↓</span></div>
        <div class="fa">Sí. VeriFactu con QR de la AEAT está incluido en todos los planes. Obligatorio para hostelería desde 2026. Sin coste adicional.</div>
      </div>
      <div class="fi">
        <div class="fq" role="button" tabindex="0">¿Cuánto cuesta para un bar pequeño? <span class="arr">↓</span></div>
        <div class="fa">59€/mes si lo gestionas tú solo. Si tienes camarero y cocina, 99€/mes (base + 2 usuarios × 20€). Sin comisión por ventas, sin sorpresas.</div>
      </div>
      <div class="fi">
        <div class="fq" role="button" tabindex="0">¿Necesito comprar hardware nuevo? <span class="arr">↓</span></div>
        <div class="fa">No. ia.rest funciona desde cualquier móvil o tablet. Si ya tienes impresoras térmicas, las conectamos. No hay hardware obligatorio.</div>
      </div>
      <div class="fi">
        <div class="fq" role="button" tabindex="0">¿Mis datos están protegidos? <span class="arr">↓</span></div>
        <div class="fa">Sí. Servidores en la UE, cifrado en tránsito y en reposo. Cumplimiento RGPD y LOPDGDD. Contacto: hola@iarest.es.</div>
      </div>
    </div>
  </div>
</sec>

<sec class="contacto" id="contacto">
  <div class="w">
    <div class="c-inner">
      <div class="c-copy">
        <div class="lbl">Demo gratuita</div>
        <h2>Cuéntanos<br><em>tu negocio.</em></h2>
        <p>Demo en directo adaptada a tu tipo de local. Sin compromiso. Sin tarjeta.</p>
        <div class="prs">
          <div class="pr"><span class="ck">✓</span> Respuesta en menos de 24 horas</div>
          <div class="pr"><span class="ck">✓</span> Demo adaptada a tu negocio</div>
          <div class="pr"><span class="ck">✓</span> 14 días de prueba gratuita</div>
          <div class="pr"><span class="ck">✓</span> Onboarding incluido</div>
        </div>
      </div>
      <div class="f-card">
        <div id="fc">
          <div class="f-ttl">Solicitar demo gratuita</div>
          <div class="f-sub">Te llamamos nosotros.</div>
          <form id="cf" novalidate>
            <div class="f-row">
              <div class="fg"><label for="nom">Nombre *</label><input type="text" id="nom" placeholder="Tu nombre" required autocomplete="given-name"></div>
              <div class="fg"><label for="tel">Teléfono *</label><input type="tel" id="tel" placeholder="600 000 000" required autocomplete="tel"></div>
            </div>
            <div class="fg"><label for="mail">Email *</label><input type="email" id="mail" placeholder="tu@email.com" required autocomplete="email"></div>
            <div class="fg">
              <label for="tipo">Tipo de negocio *</label>
              <select id="tipo" required>
                <option value="" disabled selected>Selecciona</option>
                <option value="bar">Bar o cafetería</option>
                <option value="restaurante">Restaurante</option>
                <option value="chiringuito">Chiringuito</option>
                <option value="feria">Feria o evento temporal</option>
                <option value="food_truck">Food truck</option>
                <option value="hotel">Hotel o resort</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="rgpd">
              <input type="checkbox" id="rgpd" required>
              <p><strong>Consentimiento *</strong> — He leído y acepto la <a href="/privacidad" target="_blank">política de privacidad</a>. Consiento que <strong>Alberto Suárez Gutiérrez (NIF 28823484E)</strong> trate mis datos para gestionar esta solicitud. Derechos en <a href="mailto:hola@iarest.es">hola@iarest.es</a>.</p>
            </div>
            <button type="submit" class="f-btn" id="sb">Solicitar demo →</button>
            <p class="f-legal">Datos en servidores UE · RGPD y LOPDGDD · <a href="/privacidad">Privacidad</a></p>
          </form>
        </div>
        <div class="f-ok" id="fok">
          <div class="ico">✅</div>
          <h3>¡Recibido!</h3>
          <p>Te contactamos antes de 24 horas.</p>
        </div>
      </div>
    </div>
    <p style="text-align:center;margin-top:20px;font-size:13px;color:var(--i4)">
      Contacto directo —
      <a href="mailto:hola@iarest.es" style="color:var(--i3);text-decoration:underline">hola@iarest.es</a> ·
      <a href="tel:+34637349990" style="color:var(--i3);text-decoration:underline">+34 637 349 990</a>
    </p>
  </div>
</sec>

</main>

<footer>
  <div class="f-inner">
    <div class="f-logo">ia<span class="dot">.</span>rest</div>
    <nav class="f-links">
      <a href="/">Inicio</a>
      <a href="/catering">Catering</a>
      <a href="/espacios">Espacios</a>
      <a href="/blog">Blog</a>
      <a href="/privacidad">Privacidad</a>
    </nav>
    <div class="f-contact">
      <a href="mailto:hola@iarest.es">hola@iarest.es</a>
      <a href="tel:+34637349990">+34 637 349 990</a>
    </div>
    <span class="f-copy">© 2026 ia.rest · NIF 28823484E · Sevilla</span>
  </div>
</footer>

      `}} />
    </>
  )
}
