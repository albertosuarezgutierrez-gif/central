"use client"
import { useEffect } from "react"

export default function CateringPage() {
  useEffect(() => {
    // FAQ accordion
    document.querySelectorAll('.fq-q, .faq-q').forEach((b: any) => {
      b.addEventListener('click', () => {
        const i = b.closest('.fq-item, .faq-item')
        const o = i.classList.contains('open')
        document.querySelectorAll('.fq-item, .faq-item').forEach((x: any) => x.classList.remove('open'))
        if (!o) i.classList.add('open')
      })
      b.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click() } })
    })
    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach((l: any) => {
      l.addEventListener('click', (e: any) => {
        e.preventDefault()
        const t = document.querySelector(l.getAttribute('href'))
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
    // Form
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
        const payload: any = { nombre: nom, email: mail, telefono: tel, tipo_negocio: tipo, origen: 'landing_catering', rgpd_aceptado: true, rgpd_fecha: new Date().toISOString() }
        if (document.getElementById('emp')) payload['empresa'] = (document.getElementById('emp') as HTMLInputElement)?.value.trim()
        try {
          const r = await fetch('https://www.iarest.es/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          if (r.ok) {
            const fc = document.getElementById('fc')
            const fok = document.getElementById('fok')
            if (fc) fc.style.display = 'none'
            if (fok) fok.style.display = 'block'
          } else throw new Error()
        } catch(_) {
          const s = encodeURIComponent('Demo ia.rest Catering - ' + nom)
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
      <title>Software para Empresas de Catering en España | ia.rest</title>
      <meta name="description" content="ia.rest gestiona el ciclo completo de tu catering: presupuesto, portal cliente, APPCC, operación del evento y VeriFactu. Todo en una herramienta. Prueba 14 días gratis." />
      <link rel="canonical" href="https://www.iarest.es/catering" />
      <meta property="og:title" content="Software para Empresas de Catering en España | ia.rest" />
      <meta property="og:description" content="ia.rest gestiona el ciclo completo de tu catering: presupuesto, portal cliente, APPCC, operación del evento y VeriFactu. Todo en una herramienta. Prueba 14 días gratis." />
      <meta property="og:url" content="https://www.iarest.es/catering" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://www.iarest.es/og-catering.jpg" />
      <meta property="og:locale" content="es_ES" />
      <meta property="og:site_name" content="ia.rest" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Software para Empresas de Catering en España | ia.rest" />
      <meta name="twitter:description" content="ia.rest gestiona el ciclo completo de tu catering: presupuesto, portal cliente, APPCC, operación del evento y VeriFactu. Todo en una herramienta. Prueba 14 días gratis." />
      <meta name="twitter:image" content="https://www.iarest.es/og-catering.jpg" />
      <style dangerouslySetInnerHTML={{ __html: `:root {
  --paper:#F6F1E7; --dark:#14110E; --bg2:#1E1A15; --bg3:#2A221A;
  --red:#D9442B; --green:#3F7D44; --ink2:#D8CDB6; --ink3:#9C8E7E;
  --ink4:#6B5F52; --rule:#2E2720;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--dark);color:var(--paper);font-family:'Bricolage Grotesque',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.w{max-width:1120px;margin:0 auto}

/* TOPBAR */
.topbar{position:sticky;top:0;z-index:100;background:rgba(20,17,14,.93);backdrop-filter:blur(12px);border-bottom:1px solid var(--rule);padding:0 48px;height:60px;display:flex;align-items:center;justify-content:space-between}
.logo{font-family:'Newsreader',serif;font-size:22px;font-weight:300}
.logo .dot{color:var(--red)}
.tnav{display:flex;align-items:center;gap:28px}
.tnav a{font-size:13px;color:var(--ink3);transition:color .2s}
.tnav a:hover{color:var(--paper)}
.btn-cta{background:var(--red);color:#fff;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:700;border:none;cursor:pointer;font-family:'Bricolage Grotesque',sans-serif}

/* HERO */
.hero{padding:112px 48px 80px;border-bottom:1px solid var(--rule);position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;top:-160px;right:-160px;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(217,68,43,.07) 0%,transparent 70%);pointer-events:none}
.tag{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:100px;padding:6px 14px;font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);letter-spacing:.1em;margin-bottom:28px}
.pulse{width:6px;height:6px;border-radius:50%;background:var(--red);animation:p 2s infinite}
@keyframes p{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
h1{font-family:'Newsreader',serif;font-size:clamp(44px,7vw,88px);font-weight:300;line-height:1.0;letter-spacing:-.03em;margin-bottom:20px;max-width:860px}
h1 em{font-style:italic;color:var(--red)}
.hero-sub{font-size:18px;color:var(--ink3);font-weight:300;max-width:520px;line-height:1.6;margin-bottom:36px}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:52px}
.btn-p{background:var(--red);color:#fff;padding:13px 26px;border-radius:9px;font-weight:700;font-size:15px;transition:opacity .2s,transform .15s;display:inline-block}
.btn-p:hover{opacity:.88;transform:translateY(-1px)}
.btn-g{border:1px solid var(--rule);color:var(--ink2);padding:13px 26px;border-radius:9px;font-size:15px;transition:border-color .2s,color .2s;display:inline-block}
.btn-g:hover{border-color:var(--ink3);color:var(--paper)}
.stats{display:flex;gap:44px;flex-wrap:wrap;padding-top:28px;border-top:1px solid var(--rule)}
.sn{font-family:'Newsreader',serif;font-size:34px;font-weight:300;color:var(--paper);line-height:1}
.sn span{color:var(--red)}
.sl2{font-size:12px;color:var(--ink3);margin-top:3px;font-family:'DM Mono',monospace;letter-spacing:.06em}

/* SECCIONES */
section{padding:80px 48px}
.lbl{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:14px}
h2{font-family:'Newsreader',serif;font-size:clamp(30px,4.5vw,54px);font-weight:300;line-height:1.1;color:var(--paper);letter-spacing:-.02em}

/* DOLORES */
.dolores{background:var(--bg2)}
.d-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:2px;margin-top:40px}
.d-item{background:var(--bg3);padding:28px;border-bottom:2px solid transparent;transition:border-color .2s}
.d-item:hover{border-bottom-color:var(--red)}
.d-title{font-weight:700;font-size:15px;color:var(--paper);margin-bottom:8px}
.d-body{font-size:13px;color:var(--ink3);line-height:1.55}

/* 360 */
.fases{background:var(--dark)}
.f-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-top:40px}
.fase{background:var(--bg2);padding:32px 26px;position:relative}
.f-num{font-family:'Newsreader',serif;font-size:48px;font-weight:300;color:var(--rule);line-height:1;margin-bottom:8px}
.f-title{font-weight:700;font-size:14px;color:var(--paper);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.f-sub{font-family:'DM Mono',monospace;font-size:11px;color:var(--red);letter-spacing:.08em;margin-bottom:18px}
.f-list{list-style:none}
.f-list li{font-size:13px;color:var(--ink3);padding:5px 0;border-bottom:1px solid var(--rule);display:flex;gap:8px}
.f-list li:last-child{border-bottom:none}
.f-list li::before{content:'→';color:var(--red);flex-shrink:0}
.f-arr{position:absolute;right:-10px;top:40px;font-size:18px;color:var(--rule);z-index:2}

/* PRICING */
.pricing{background:var(--bg2)}
.p-inner{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;margin-top:16px}
.p-card{background:var(--dark);border-radius:14px;padding:36px;border:1px solid var(--rule);text-align:center;transition:border-color .2s}
.p-card:hover{border-color:var(--red)}
.p-desde{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:10px}
.p-num{font-family:'Newsreader',serif;font-size:72px;font-weight:300;color:var(--paper);line-height:1;letter-spacing:-.03em}
.p-num sup{font-size:26px;vertical-align:super;color:var(--red)}
.p-num sub{font-size:17px;color:var(--ink3)}
.p-detail{font-size:13px;color:var(--ink3);margin-top:6px}
.p-items{list-style:none;margin-top:20px;text-align:left}
.p-items li{font-size:13px;color:var(--ink2);padding:7px 0;border-bottom:1px solid var(--rule);display:flex;gap:8px}
.p-items li:last-child{border-bottom:none}
.p-items li .c{color:var(--green);flex-shrink:0}
.p-ej{background:var(--bg2);border-radius:8px;padding:16px 20px;margin-top:16px}
.pe-lbl{font-family:'DM Mono',monospace;font-size:10px;color:var(--ink4);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.pe-row{display:flex;justify-content:space-between;font-size:12px;color:var(--ink3);padding:3px 0}
.pe-total{display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:var(--paper);padding-top:8px;margin-top:4px;border-top:1px solid var(--rule)}

/* FAQ */
.faq{background:var(--dark)}
.fq-list{margin-top:36px;max-width:720px}
.fq-item{border-bottom:1px solid var(--rule)}
.fq-q{padding:16px 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:14px;font-weight:700;font-size:14px;color:var(--paper);user-select:none}
.fq-q .arr{color:var(--red);transition:transform .25s;flex-shrink:0}
.fq-a{font-size:13px;color:var(--ink3);line-height:1.6;max-height:0;overflow:hidden;transition:max-height .3s ease,padding .25s}
.fq-item.open .arr{transform:rotate(180deg)}
.fq-item.open .fq-a{max-height:160px;padding-bottom:16px}

/* CONTACTO */
.contacto{background:var(--bg2);border-top:1px solid var(--rule)}
.c-inner{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:flex-start}
.c-copy h2{font-family:'Newsreader',serif;font-size:clamp(28px,4vw,46px);font-weight:300;line-height:1.15;color:var(--paper);margin-bottom:12px}
.c-copy h2 em{font-style:italic;color:var(--red)}
.c-copy p{font-size:14px;color:var(--ink3);line-height:1.65;margin-bottom:20px}
.promises{display:flex;flex-direction:column;gap:8px;margin-top:16px}
.pr{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink3)}
.pr .ck{color:var(--green)}

/* FORM */
.f-card{background:var(--bg3);border-radius:12px;padding:32px;border:1px solid var(--rule)}
.f-ttl{font-weight:700;font-size:16px;color:var(--paper);margin-bottom:2px}
.f-sub{font-size:12px;color:var(--ink3);margin-bottom:20px}
.f-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fg{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.fg label{font-size:10px;font-family:'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.fg input,.fg select,.fg textarea{background:var(--bg2);border:1px solid var(--rule);border-radius:6px;padding:9px 12px;font-size:14px;color:var(--paper);font-family:'Bricolage Grotesque',sans-serif;outline:none;width:100%;-webkit-appearance:none;appearance:none;transition:border-color .2s}
.fg input::placeholder,.fg textarea::placeholder{color:var(--ink4)}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--red)}
.fg select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239C8E7E' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px;cursor:pointer}
.fg textarea{resize:vertical;min-height:72px}
.rgpd{display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;background:rgba(217,68,43,.05);border:1px solid rgba(217,68,43,.18);border-radius:7px;padding:11px 13px}
.rgpd input[type=checkbox]{flex-shrink:0;width:15px;height:15px;margin-top:2px;accent-color:var(--red);cursor:pointer}
.rgpd p{font-size:11px;color:var(--ink3);line-height:1.5}
.rgpd a{color:var(--ink2);text-decoration:underline}
.rgpd strong{color:var(--paper)}
.f-btn{width:100%;background:var(--red);color:#fff;padding:12px;border-radius:8px;font-weight:700;font-size:15px;border:none;cursor:pointer;font-family:'Bricolage Grotesque',sans-serif;transition:opacity .2s}
.f-btn:hover{opacity:.88}
.f-btn:disabled{opacity:.45;cursor:not-allowed}
.f-legal{font-size:11px;color:var(--ink4);text-align:center;margin-top:8px;line-height:1.4}
.f-legal a{color:var(--ink3);text-decoration:underline}
.f-ok{display:none;text-align:center;padding:24px}
.f-ok .ico{font-size:40px;margin-bottom:12px}
.f-ok h3{font-family:'Newsreader',serif;font-size:20px;font-weight:300;color:var(--paper);margin-bottom:6px}
.f-ok p{font-size:13px;color:var(--ink3)}

/* FOOTER */
footer{background:var(--dark);border-top:1px solid var(--rule);padding:32px 48px}
.f-inner{max-width:1120px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.f-logo{font-family:'Newsreader',serif;font-size:18px;font-weight:300}
.f-logo .dot{color:var(--red)}
.f-links{display:flex;gap:18px;flex-wrap:wrap}
.f-links a{font-size:12px;color:var(--ink3);transition:color .2s}
.f-links a:hover{color:var(--paper)}
.f-contact{display:flex;gap:16px;flex-wrap:wrap}
.f-contact a{font-size:12px;color:var(--ink3);transition:color .2s}
.f-contact a:hover{color:var(--paper)}
.f-copy{font-size:11px;color:var(--ink4);font-family:'DM Mono',monospace}

@media(max-width:900px){
  section,footer{padding:56px 24px}
  .hero{padding:72px 24px 56px}
  .topbar{padding:0 20px}
  .tnav{display:none}
  .f-grid,.c-inner,.p-inner{grid-template-columns:1fr;gap:32px}
  .f-row{grid-template-columns:1fr}
  .f-arr{display:none}
  .f-inner{flex-direction:column;align-items:flex-start}
}` }} />
      <div dangerouslySetInnerHTML={{ __html: `<header>
  <nav class="topbar">
    <a href="https://www.iarest.es" class="logo">ia<span class="dot">.</span>rest</a>
    <div class="tnav">
      <a href="#360">El 360</a>
      <a href="#pricing">Precio</a>
      <a href="#faq">FAQ</a>
      <a href="https://www.iarest.es/espacios">Espacios →</a>
      <a href="#contacto" class="btn-cta">Demo gratuita</a>
    </div>
  </nav>
</header>

<main>

<!-- HERO -->
<section class="hero">
  <div class="w">
    <div class="tag"><span class="pulse"></span>Software en producción · España</div>
    <h1>El catering que funciona<br><em>de principio a fin.</em></h1>
    <p class="hero-sub">Del presupuesto al evento, y del evento a la factura. Sin WhatsApp. Sin papel.</p>
    <div class="actions">
      <a href="#contacto" class="btn-p">Solicitar demo gratuita</a>
      <a href="#360" class="btn-g">Ver el 360 →</a>
    </div>
    <div class="stats">
      <div><div class="sn">59<span>€</span></div><div class="sl2">Desde / mes</div></div>
      <div><div class="sn">0<span>%</span></div><div class="sl2">Comisión</div></div>
      <div><div class="sn">14<span>d</span></div><div class="sl2">Prueba gratis</div></div>
      <div><div class="sn">1<span>h</span></div><div class="sl2">Onboarding</div></div>
    </div>
  </div>
</section>

<!-- DOLORES -->
<section class="dolores">
  <div class="w">
    <div class="lbl">El problema real</div>
    <h2>Sigues gestionando<br>con herramientas que no son para ti.</h2>
    <div class="d-grid">
      <div class="d-item">
        <div class="d-title">El presupuesto va por email</div>
        <p class="d-body">PDF, WhatsApp, cambios, otro PDF. No sabes si lo está mirando o si ya eligió a otro.</p>
      </div>
      <div class="d-item">
        <div class="d-title">El evento funciona con papel</div>
        <p class="d-body">La cocina con pantallazos. Los camareros sin sistema. El almacén no cuadra al final.</p>
      </div>
      <div class="d-item">
        <div class="d-title">APPCC rellenado a mano</div>
        <p class="d-body">Registros de alérgenos y caducidades en papel. Un dolor real en cada inspección.</p>
      </div>
      <div class="d-item">
        <div class="d-title">VeriFactu obligatorio en 2026</div>
        <p class="d-body">Facturación electrónica con QR de la AEAT. La mayoría de caterings todavía no está lista.</p>
      </div>
    </div>
  </div>
</section>

<!-- 360 -->
<section class="fases" id="360">
  <div class="w">
    <div class="lbl">El servicio 360</div>
    <h2>Antes, durante<br>y después del evento.</h2>
    <div class="f-grid">
      <div class="fase">
        <div class="f-num">01</div>
        <div class="f-title">Antes</div>
        <div class="f-sub">Comercial y planificación</div>
        <ul class="f-list">
          <li>Presupuesto en 5 min</li>
          <li>Portal cliente — menú online</li>
          <li>Contrato digital automático</li>
          <li>APPCC y 14 alérgenos</li>
          <li>Escandallos con IA</li>
          <li>Pedidos a proveedor</li>
        </ul>
        <div class="f-arr">→</div>
      </div>
      <div class="fase">
        <div class="f-num">02</div>
        <div class="f-title">Durante</div>
        <div class="f-sub">Operación del evento</div>
        <ul class="f-list">
          <li>Camareros con voz</li>
          <li>KDS cocina — sin papel</li>
          <li>Check-in QR asistentes</li>
          <li>Almacén en tiempo real</li>
          <li>Sala ↔ cocina conectadas</li>
        </ul>
        <div class="f-arr">→</div>
      </div>
      <div class="fase">
        <div class="f-num">03</div>
        <div class="f-title">Después</div>
        <div class="f-sub">Cierre y análisis</div>
        <ul class="f-list">
          <li>VeriFactu automático</li>
          <li>Coste real vs presupuestado</li>
          <li>Margen por evento</li>
          <li>Stock actualizado</li>
          <li>Contabilidad integrada</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="pricing" id="pricing">
  <div class="w">
    <div class="lbl">Precio</div>
    <div class="p-inner">
      <div>
        <h2>Por personas,<br>no por eventos.</h2>
        <p style="font-size:15px;color:var(--ink3);line-height:1.65;margin-top:14px">El propietario no cuenta. Solo pagan quienes operan: comercial, cocina, camarero.</p>
        <br>
        <a href="#contacto" class="btn-p" style="display:inline-block">Empezar prueba gratuita</a>
      </div>
      <div>
        <div class="p-card">
          <div class="p-desde">Precio mensual</div>
          <div class="p-num"><sup>€</sup>59<sub>/mes</sub></div>
          <div class="p-detail">+ 20€/usuario (2–6) · + 15€/usuario (7+)</div>
          <ul class="p-items">
            <li><span class="c">✓</span> Todo el 360 incluido</li>
            <li><span class="c">✓</span> APPCC y VeriFactu</li>
            <li><span class="c">✓</span> Portal cliente</li>
            <li><span class="c">✓</span> Voz y KDS</li>
            <li><span class="c">✓</span> 14 días de prueba</li>
          </ul>
          <div class="p-ej">
            <div class="pe-lbl">Ejemplo — 4 usuarios</div>
            <div class="pe-row"><span>Base</span><span>59€</span></div>
            <div class="pe-row"><span>3 usuarios × 20€</span><span>60€</span></div>
            <div class="pe-total"><span>Total</span><strong>119€/mes</strong></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="faq" id="faq">
  <div class="w">
    <div class="lbl">FAQ</div>
    <h2>Preguntas frecuentes.</h2>
    <div class="fq-list">
      <div class="fq-item">
        <div class="fq-q" role="button" tabindex="0">¿Cubre también la operación del evento? <span class="arr">↓</span></div>
        <div class="fq-a">Sí. Antes (presupuesto, portal cliente, APPCC), durante (voz, KDS, almacén en tiempo real) y después (VeriFactu, análisis de costes). El ciclo completo.</div>
      </div>
      <div class="fq-item">
        <div class="fq-q" role="button" tabindex="0">¿Incluye APPCC y VeriFactu? <span class="arr">↓</span></div>
        <div class="fq-a">Sí, los dos están incluidos en todos los planes sin coste adicional. VeriFactu es obligatorio para hostelería desde 2026.</div>
      </div>
      <div class="fq-item">
        <div class="fq-q" role="button" tabindex="0">¿Puedo gestionar restaurante y catering en el mismo sistema? <span class="arr">↓</span></div>
        <div class="fq-a">Sí. Mismo almacén, mismo equipo, misma herramienta. Sin duplicar nada.</div>
      </div>
      <div class="fq-item">
        <div class="fq-q" role="button" tabindex="0">¿Cuánto cuesta? <span class="arr">↓</span></div>
        <div class="fq-a">59€/mes de base más 20€ por usuario. El propietario no cuenta. Sin comisión por ventas. 14 días de prueba gratuita sin tarjeta.</div>
      </div>
      <div class="fq-item">
        <div class="fq-q" role="button" tabindex="0">¿Mis datos están protegidos? <span class="arr">↓</span></div>
        <div class="fq-a">Sí. Servidores en la UE, cifrado en tránsito y en reposo. Cumplimiento RGPD y LOPDGDD. Contacto: hola@iarest.es.</div>
      </div>
    </div>
  </div>
</section>

<!-- CONTACTO -->
<section class="contacto" id="contacto">
  <div class="w">
    <div class="c-inner">
      <div class="c-copy">
        <div class="lbl">Demo gratuita</div>
        <h2>Cuéntanos tu<br><em>catering.</em></h2>
        <p>Demo en directo del ciclo completo. Sin compromiso. Sin tarjeta.</p>
        <div class="promises">
          <div class="pr"><span class="ck">✓</span> Respuesta en menos de 24 horas</div>
          <div class="pr"><span class="ck">✓</span> Demo del 360 completo</div>
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
              <div class="fg"><label for="nom">Nombre *</label><input type="text" id="nom" name="nombre" placeholder="Tu nombre" required autocomplete="given-name"></div>
              <div class="fg"><label for="tel">Teléfono *</label><input type="tel" id="tel" name="telefono" placeholder="600 000 000" required autocomplete="tel"></div>
            </div>
            <div class="fg"><label for="emp">Empresa</label><input type="text" id="emp" name="empresa" placeholder="Nombre de tu empresa" autocomplete="organization"></div>
            <div class="fg"><label for="mail">Email *</label><input type="email" id="mail" name="email" placeholder="tu@email.com" required autocomplete="email"></div>
            <div class="fg">
              <label for="tipo">Tipo de catering *</label>
              <select id="tipo" name="tipo" required>
                <option value="" disabled selected>Selecciona</option>
                <option value="catering_puro">Solo catering y eventos</option>
                <option value="restaurante_catering">Restaurante con catering propio</option>
                <option value="catering_empresa">Catering para empresas</option>
                <option value="bodas_eventos">Bodas y celebraciones</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="rgpd">
              <input type="checkbox" id="rgpd" name="rgpd" required>
              <p><strong>Consentimiento *</strong> — He leído y acepto la <a href="https://www.iarest.es/privacidad" target="_blank">política de privacidad</a>. Consiento que <strong>Alberto Suárez Gutiérrez (NIF 28823484E)</strong> trate mis datos para gestionar esta solicitud. Derechos en <a href="mailto:hola@iarest.es">hola@iarest.es</a>.</p>
            </div>
            <button type="submit" class="f-btn" id="sb">Solicitar demo →</button>
            <p class="f-legal">Datos en servidores UE · RGPD y LOPDGDD · <a href="https://www.iarest.es/privacidad">Privacidad</a></p>
          </form>
        </div>
        <div class="f-ok" id="fok">
          <div class="ico">✅</div>
          <h3>¡Recibido!</h3>
          <p>Te contactamos antes de 24 horas.</p>
        </div>
      </div>
    </div>
    <p style="text-align:center;margin-top:20px;font-size:13px;color:var(--ink4)">
      Contacto directo —
      <a href="mailto:hola@iarest.es" style="color:var(--ink3);text-decoration:underline">hola@iarest.es</a> ·
      <a href="tel:+34637349990" style="color:var(--ink3);text-decoration:underline">+34 637 349 990</a>
    </p>
  </div>
</section>

</main>

<footer>
  <div class="f-inner">
    <div class="f-logo">ia<span class="dot">.</span>rest</div>
    <nav class="f-links">
      <a href="https://www.iarest.es">Inicio</a>
      <a href="https://www.iarest.es/espacios">Para espacios</a>
      <a href="https://www.iarest.es/blog">Blog</a>
      <a href="https://www.iarest.es/privacidad">Privacidad</a>
      <a href="https://www.iarest.es/contrato-iarest-v1.pdf">Condiciones</a>
    </nav>
    <div class="f-contact">
      <a href="mailto:hola@iarest.es">hola@iarest.es</a>
      <a href="tel:+34637349990">+34 637 349 990</a>
    </div>
    <span class="f-copy">© 2026 ia.rest · NIF 28823484E · Sevilla</span>
  </div>
</footer>` }} />
    </>
  )
}
