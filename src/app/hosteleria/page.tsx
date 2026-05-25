"use client"
import { useEffect } from "react"

export default function HosteleriaPage() {
  useEffect(() => {
    // Scroll animations
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { (e.target as HTMLElement).classList.add("on"); io.unobserve(e.target) }
      }), { threshold: 0.08 }
    )
    document.querySelectorAll(".fi").forEach((el) => io.observe(el))

    // Terminal reveal
    const tls = document.querySelectorAll<HTMLElement>("#tlines > div")
    tls.forEach((l, i) => { l.style.opacity = "0"; l.style.transition = `opacity .25s ease ${i * 0.1}s` })
    const tio = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { tls.forEach((l) => (l.style.opacity = "1")); tio.unobserve(e.target) }
    }), { threshold: 0.4 })
    const tb = document.querySelector("#tlines")
    if (tb) tio.observe(tb)

    // Burger
    function toggleMenu() {
      document.getElementById("burger")?.classList.toggle("open")
      document.getElementById("mobMenu")?.classList.toggle("open")
      document.body.style.overflow = document.getElementById("mobMenu")?.classList.contains("open") ? "hidden" : ""
    }
    document.getElementById("burger")?.addEventListener("click", toggleMenu)
    document.querySelectorAll(".mob-menu a").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = (a as HTMLAnchorElement).getAttribute("href")
        if (href?.startsWith("#")) {
          e.preventDefault()
          document.getElementById("burger")?.classList.remove("open")
          document.getElementById("mobMenu")?.classList.remove("open")
          document.body.style.overflow = ""
          setTimeout(() => { document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" }) }, 320)
        }
      })
    })

    // Form
    async function enviar() {
      const n = (document.getElementById("nombre") as HTMLInputElement)?.value.trim()
      const em = (document.getElementById("email") as HTMLInputElement)?.value.trim()
      const tf = (document.getElementById("telefono") as HTMLInputElement)?.value.trim()
      const ti = (document.getElementById("tipo") as HTMLSelectElement)?.value
      const hp = (document.getElementById("website") as HTMLInputElement)?.value
      if (hp) return
      const priv = document.getElementById("privacidad") as HTMLInputElement
      let ok = true
      if (!n) { (document.getElementById("nombre") as HTMLInputElement).style.borderColor = "rgba(217,68,43,.6)"; ok = false }
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { (document.getElementById("email") as HTMLInputElement).style.borderColor = "rgba(217,68,43,.6)"; ok = false }
      if (!priv?.checked) { if (priv) priv.style.outline = "2px solid rgba(217,68,43,.6)"; ok = false }
      if (!ok) return
      const btn = document.getElementById("submitBtn") as HTMLButtonElement
      btn.disabled = true; btn.textContent = "Enviando…"
      try {
        await fetch("/api/leads/landing", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: n, email: em, telefono: tf, tipo_negocio: ti, origen: "landing-hosteleria" })
        })
      } catch(_) {}
      const fb = document.getElementById("formBody") as HTMLElement
      const ss = document.getElementById("successState") as HTMLElement
      if (fb) fb.style.display = "none"
      if (ss) ss.style.display = "block"
    }
    ;(window as any).enviar = enviar
    document.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar() })

    return () => { io.disconnect(); tio.disconnect() }
  }, [])

  return (
    <>
      <title>Software TPV para Hostelería en España | ia.rest</title>
      <meta name="description" content="ia.rest gestiona cualquier negocio de hostelería: bar, restaurante, chiringuito, feria y food truck. Comandas por voz, KDS, VeriFactu y almacén. Desde 59€/mes." />
      <meta name="robots" content="index, follow" />
      <meta property="og:title" content="Software TPV para Hostelería | ia.rest" />
      <meta property="og:description" content="Bar, restaurante, chiringuito, feria, food truck. Si sirves, ia.rest lo gestiona. Voz, KDS y VeriFactu desde 59€/mes." />
      <meta property="og:url" content="https://www.iarest.es/hosteleria" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://www.iarest.es/og-hosteleria.jpg" />
      <meta property="og:site_name" content="ia.rest" />
      <meta property="og:locale" content="es_ES" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Software TPV para Hostelería | ia.rest" />
      <meta name="twitter:description" content="Bar, restaurante, chiringuito, feria. Si sirves, ia.rest lo gestiona." />
      <meta name="twitter:image" content="https://www.iarest.es/og-hosteleria.jpg" />
      <link rel="canonical" href="https://www.iarest.es/hosteleria" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "SoftwareApplication", "@id": "https://www.iarest.es/#tpv-hosteleria", "name": "ia.rest — TPV para Hostelería", "url": "https://www.iarest.es/hosteleria", "applicationCategory": "BusinessApplication", "operatingSystem": "Web, Android", "description": "TPV por voz para bar, restaurante, chiringuito, feria y food truck. KDS, almacén, VeriFactu y sin comisión.", "offers": { "@type": "Offer", "price": "59", "priceCurrency": "EUR" }, "provider": { "@type": "Organization", "name": "ia.rest", "url": "https://www.iarest.es", "telephone": "+34637349990", "email": "hola@iarest.es" } },
          { "@type": "FAQPage", "mainEntity": [
            { "@type": "Question", "name": "¿ia.rest funciona para chiringuitos y ferias?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. Funciona desde el móvil, sin hardware fijo, con modo offline para conexiones inestables. Setup en menos de una hora." } },
            { "@type": "Question", "name": "¿Incluye VeriFactu?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. Incluido en todos los planes sin coste adicional. Obligatorio para hostelería desde 2026." } },
            { "@type": "Question", "name": "¿Cuánto cuesta para un bar?", "acceptedAnswer": { "@type": "Answer", "text": "59€/mes si lo gestionas solo. Con un camarero y cocina, 99€/mes. Sin comisión por ventas." } }
          ]},
          { "@type": "BreadcrumbList", "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "ia.rest", "item": "https://www.iarest.es" },
            { "@type": "ListItem", "position": 2, "name": "TPV Hostelería", "item": "https://www.iarest.es/hosteleria" }
          ]}
        ]
      })}} />
      <style dangerouslySetInnerHTML={{ __html: `:root{--bg:#14110E;--bg2:#111009;--bg3:#1C1814;--ink:#F6F1E7;--ink2:#D8CDB6;--ink3:#6B6054;--red:#D9442B;--red2:#A8311E;--red3:rgba(217,68,43,0.1);--amber:#E8A33B;--green:#6EBD73;--border:rgba(246,241,231,0.07);--border2:rgba(246,241,231,0.13)}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--ink);font-family:'Inter Tight',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:60px;border-bottom:1px solid var(--border);background:rgba(20,17,14,0.92);backdrop-filter:blur(20px)}
.logo{font-family:'Newsreader',serif;font-size:20px;font-weight:300;color:var(--ink);text-decoration:none}
.logo b{color:var(--red);font-weight:300}
.nav-links{display:flex;gap:28px;align-items:center}
.nav-links a{font-size:13px;color:var(--ink3);text-decoration:none;transition:color .2s}
.nav-links a:hover{color:var(--ink)}
.nav-cta{background:var(--red)!important;color:var(--ink)!important;padding:8px 20px;border-radius:5px;font-weight:600!important}
.hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:100px 48px 80px;text-align:center;position:relative;overflow:hidden}
.hero-glow{position:absolute;top:-10%;left:50%;transform:translateX(-50%);width:900px;height:600px;background:radial-gradient(ellipse at center,rgba(217,68,43,0.18) 0%,rgba(217,68,43,0.04) 45%,transparent 70%);pointer-events:none}
.hero-noise{position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");pointer-events:none;opacity:.4}
.social-proof{display:inline-flex;align-items:center;gap:10px;background:rgba(246,241,231,.04);border:1px solid var(--border2);border-radius:100px;padding:8px 18px;font-size:12px;color:var(--ink3);margin-bottom:28px;letter-spacing:-.1px}
.social-proof .dot{width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}
.social-proof strong{color:var(--ink2)}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:36px;display:flex;align-items:center;gap:12px;justify-content:center}
.eyebrow::before,.eyebrow::after{content:'';width:28px;height:1px;background:var(--red);opacity:.5}
h1{font-family:'Newsreader',serif;font-size:clamp(50px,8vw,104px);font-weight:200;line-height:1.02;letter-spacing:-3px;color:var(--ink);max-width:900px}
h1 i{font-style:italic;color:var(--red)}
.hero-sub{margin-top:28px;font-size:clamp(15px,1.8vw,18px);color:var(--ink3);font-weight:300;line-height:1.7;max-width:500px}
.hero-cta{margin-top:44px;display:flex;gap:12px;justify-content:center}
.btn-p{font-size:14px;font-weight:600;background:var(--red);color:var(--ink);padding:13px 28px;border-radius:6px;text-decoration:none;transition:opacity .2s,transform .15s}
.btn-p:hover{opacity:.85;transform:translateY(-1px)}
.btn-s{font-size:14px;font-weight:400;color:var(--ink3);padding:13px 24px;border:1px solid var(--border2);border-radius:6px;text-decoration:none;transition:color .2s,border-color .2s}
.btn-s:hover{color:var(--ink);border-color:rgba(246,241,231,.2)}
.strip{border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex}
.strip-item{flex:1;padding:32px 0;text-align:center;border-right:1px solid var(--border)}
.strip-item:last-child{border-right:none}
.strip-num{display:block;font-family:'Newsreader',serif;font-size:clamp(26px,4vw,42px);font-weight:200;color:var(--ink);letter-spacing:-1px}
.strip-num b{color:var(--red);font-weight:200}
.strip-lbl{display:block;margin-top:5px;font-size:10px;color:var(--ink3);font-weight:500;letter-spacing:.1em;text-transform:uppercase}
section{padding:100px 48px}
.w{max-width:1100px;margin:0 auto}
.s-label{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:20px}
h2{font-family:'Newsreader',serif;font-size:clamp(34px,5vw,62px);font-weight:200;letter-spacing:-2px;color:var(--ink);line-height:1.05}
h2 i{font-style:italic;color:var(--red)}
.cap{background:var(--bg2)}
.bento{display:grid;grid-template-columns:repeat(12,1fr);grid-template-rows:auto;gap:2px;margin-top:52px;background:var(--border);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.bi{background:var(--bg2);padding:32px 26px;transition:background .2s;position:relative;overflow:hidden}
.bi:hover{background:var(--bg3)}
.bi.span2{grid-column:span 4}
.bi.span3{grid-column:span 6}
.bi.span4{grid-column:span 4}
.bi.big{grid-column:span 6;padding:40px 36px}
.bi.wide{grid-column:span 12;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:40px}
.bi-num{font-family:'Newsreader',serif;font-size:12px;color:var(--red);font-weight:300;letter-spacing:.05em;margin-bottom:16px;display:block}
.bi-title{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:-.1px;margin-bottom:6px}
.bi-sub{font-size:12px;color:var(--ink3);line-height:1.55}
.bi-big-num{font-family:'Newsreader',serif;font-size:72px;font-weight:200;color:var(--ink);line-height:1;letter-spacing:-3px;margin-bottom:8px}
.bi-big-num b{color:var(--red);font-weight:200}
.bi-corner{position:absolute;bottom:16px;right:20px;font-size:32px;opacity:.12}
/* separadores sección */
.sec-divider{display:flex;align-items:center;gap:20px;padding:0 48px;margin:0;border-top:1px solid var(--border)}
.sec-divider-num{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink3);letter-spacing:.12em;padding:14px 0;white-space:nowrap}
.sec-divider-line{flex:1;height:0}
/* tipos negocio mejorado */
.neg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-top:52px;border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--border)}
.voz-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
.terminal{background:#0C0A08;border:1px solid var(--border2);border-radius:12px;overflow:hidden}
.t-bar{padding:13px 16px;background:#111009;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center}
.d{width:9px;height:9px;border-radius:50%}
.dr{background:#ff5f57}.dy{background:#ffbd2e}.dg{background:#28ca41}
.t-body{padding:26px 20px;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:2}
.tc{color:var(--ink3)}.tr{color:var(--red)}.tg{color:var(--green)}.ta{color:var(--amber)}
.cur{display:inline-block;width:7px;height:13px;background:var(--red);animation:bl 1s step-end infinite;vertical-align:middle}
@keyframes bl{0%,49%{opacity:1}50%,100%{opacity:0}}
.voz-pts{list-style:none}
.voz-pt{padding:22px 0;border-bottom:1px solid var(--border)}
.voz-pt:first-child{border-top:1px solid var(--border)}
.voz-pt-t{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:0;letter-spacing:-.2px}
.negocios{background:var(--bg2)}
.neg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-top:52px}
.neg-item{background:var(--bg3);padding:32px 24px;transition:background .2s}
.neg-item:hover{background:#221E19}
.neg-ico{font-size:28px;margin-bottom:16px}
.neg-name{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:-.2px;margin-bottom:4px}
.neg-sub{font-size:12px;color:var(--ink3)}
.healer{background:var(--bg2)}
.healer-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.stat{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:24px}
.stat-val{display:block;font-family:'Newsreader',serif;font-size:38px;font-weight:200;letter-spacing:-1px;margin-bottom:4px}
.stat-val.r{color:var(--red)}.stat-val.g{color:var(--green)}.stat-val.a{color:var(--amber)}
.stat-lbl{font-size:10px;color:var(--ink3);font-weight:500;text-transform:uppercase;letter-spacing:.08em}
.form-section{background:var(--bg)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start}
.form-copy h2{margin-bottom:24px}
.form-copy p{font-size:16px;color:var(--ink3);font-weight:300;line-height:1.75}
.form-copy ul{list-style:none;margin-top:32px}
.form-copy ul li{padding:14px 0;border-bottom:1px solid var(--border);font-size:14px;color:var(--ink2);display:flex;gap:10px}
.form-copy ul li:first-child{border-top:1px solid var(--border)}
.form-copy ul li::before{content:'—';color:var(--red);flex-shrink:0}
.form-card{background:var(--bg2);border:1px solid var(--border2);border-radius:16px;overflow:hidden}
.form-top{padding:30px 34px 26px;border-bottom:1px solid var(--border)}
.form-top-t{font-family:'Newsreader',serif;font-size:22px;font-weight:300;color:var(--ink);letter-spacing:-.5px;margin-bottom:6px}
.form-top-s{font-size:13px;color:var(--ink3);line-height:1.5}
.form-body{padding:26px 34px 30px}
.field{margin-bottom:14px}
.field label{display:block;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin-bottom:7px}
.field input,.field select{width:100%;padding:11px 14px;background:rgba(246,241,231,.04);border:1px solid var(--border2);border-radius:7px;color:var(--ink);font-size:14px;font-family:'Inter Tight',sans-serif;outline:none;transition:border-color .2s,background .2s;-webkit-appearance:none}
.field input::placeholder{color:var(--ink3)}
.field input:focus,.field select:focus{border-color:rgba(217,68,43,.45);background:rgba(246,241,231,.06)}
.field select{color:var(--ink3);cursor:pointer}
.field select option{background:#1C1814;color:var(--ink)}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.submit-btn{width:100%;padding:14px;background:var(--red);color:var(--ink);border:none;border-radius:7px;font-size:15px;font-weight:700;font-family:'Inter Tight',sans-serif;cursor:pointer;margin-top:6px;transition:background .2s,transform .15s;letter-spacing:-.1px}
.submit-btn:hover{background:var(--red2);transform:translateY(-1px)}
.submit-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.form-foot{padding:14px 34px;border-top:1px solid var(--border);font-size:11px;color:var(--ink3);text-align:center}
.success-state{display:none;padding:44px 34px;text-align:center}
.success-icon{width:52px;height:52px;border-radius:50%;background:rgba(110,189,115,.1);border:1px solid rgba(110,189,115,.3);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 18px}
.success-t{font-family:'Newsreader',serif;font-size:26px;font-weight:300;color:var(--ink);letter-spacing:-.5px;margin-bottom:10px}
.success-s{font-size:14px;color:var(--ink3);line-height:1.6}
footer{border-top:1px solid var(--border);padding:40px 48px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.f-logo{font-family:'Newsreader',serif;font-size:18px;font-weight:300;color:var(--ink3)}
.f-logo b{color:var(--red);font-weight:300}
.f-links{display:flex;gap:22px}
.f-links a{font-size:12px;color:var(--ink3);text-decoration:none;transition:color .2s}
.f-links a:hover{color:var(--ink)}
.f-copy{font-size:11px;color:var(--ink3)}
.fi{opacity:0;transform:translateY(16px);transition:opacity .65s ease,transform .65s ease}
.fi.d1{transition-delay:.1s}.fi.d2{transition-delay:.2s}.fi.d3{transition-delay:.3s}
.fi.on{opacity:1;transform:none}
.burger{display:none;flex-direction:column;justify-content:center;gap:5px;background:none;border:none;cursor:pointer;padding:8px;z-index:200;flex-shrink:0}
.burger span{display:block;width:22px;height:2px;background:var(--ink);border-radius:2px;transition:transform .3s,opacity .3s}
.burger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.burger.open span:nth-child(2){opacity:0}
.burger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.mob-menu{display:none;position:fixed;top:60px;left:0;right:0;bottom:0;background:rgba(20,17,14,0.98);backdrop-filter:blur(20px);z-index:99;flex-direction:column;padding:40px 28px;gap:0}
.mob-menu.open{display:flex}
.mob-menu a{font-size:32px;font-family:'Newsreader',serif;font-weight:200;color:var(--ink2);text-decoration:none;padding:20px 0;border-bottom:1px solid var(--border);letter-spacing:-1px;transition:color .2s}
.mob-menu a:hover{color:var(--ink)}
.mob-menu .mob-cta{margin-top:28px;border:none;font-family:'Inter Tight',sans-serif;font-size:15px;font-weight:700;color:var(--ink);background:var(--red);padding:16px 24px;border-radius:8px;text-align:center}
@media(max-width:900px){
  nav{padding:0 20px}.nav-links{display:none!important}.burger{display:flex!important}
  section{padding:72px 20px}.sec-divider{padding:0 20px}
  .voz-grid,.healer-grid,.form-grid{grid-template-columns:1fr;gap:48px}
  .neg-grid{grid-template-columns:1fr 1fr}
  .bento{grid-template-columns:1fr 1fr}.bi.big,.bi.wide,.bi.span2,.bi.span3,.bi.span4{grid-column:span 1}.bi.wide{display:block}.bi-big-num{font-size:52px}
  .strip{flex-wrap:wrap}.strip-item{min-width:50%}
  .field-row{grid-template-columns:1fr}
  .form-top,.form-body,.form-foot{padding-left:22px;padding-right:22px}
  footer{flex-direction:column;text-align:center}
}
@media(max-width:500px){h1{letter-spacing:-2px}.neg-grid,.bento{grid-template-columns:1fr}}
      `}} />
      <div dangerouslySetInnerHTML={{ __html: `

<nav>
  <a class="logo" href="/">ia<b>.</b>rest</a>
  <div class="nav-links">
    <a href="#negocios">Para quién</a>
    <a href="#sistema">Sistema</a>
    <a href="/catering">Catering</a>
    <a href="/espacios">Espacios</a>
    <a href="#contacto" class="nav-cta">Demo gratuita →</a>
  </div>
  <button class="burger" id="burger" aria-label="Menú"><span></span><span></span><span></span></button>
</nav>

<div class="mob-menu" id="mobMenu">
  <a href="#negocios">Para quién</a>
  <a href="#sistema">Sistema</a>
  <a href="/catering">Catering</a>
  <a href="/espacios">Espacios</a>
  <a href="#contacto" class="mob-cta">Demo gratuita →</a>
</div>

<!-- HERO -->
<section class="hero">
  <div class="hero-glow"></div>
  <div class="hero-noise"></div>
  <div class="social-proof fi"><span class="dot"></span>En producción · Sevilla · <strong>Ovejas Negras, Catering JJ y más</strong></div>
  <div class="eyebrow fi">Software TPV · Hostelería española · Sin comisión</div>
  <h1 class="fi d1">Si sirves,<br><i>ia.rest lo gestiona.</i></h1>
  <p class="hero-sub fi d2">Bar, restaurante, chiringuito, feria, food truck. Comandas por voz, sin papel, sin comisión.</p>
  <div class="hero-cta fi d2">
    <a href="#contacto" class="btn-p">Demo gratuita →</a>
    <a href="#negocios" class="btn-s">Ver para quién es</a>
  </div>
</section>

<!-- STRIP -->
<div class="strip">
  <div class="strip-item">
    <span class="strip-num">59<b>€</b></span>
    <span class="strip-lbl">Desde / mes</span>
  </div>
  <div class="strip-item">
    <span class="strip-num">0<b>%</b></span>
    <span class="strip-lbl">Comisión</span>
  </div>
  <div class="strip-item">
    <span class="strip-num"><b>&lt;</b>1h</span>
    <span class="strip-lbl">Setup</span>
  </div>
  <div class="strip-item">
    <span class="strip-num">14<b>d</b></span>
    <span class="strip-lbl">Prueba gratis</span>
  </div>
</div>

<div class="sec-divider"><span class="sec-divider-num">01 — PARA QUIÉN ES</span></div>

<!-- PARA QUIÉN -->
<section class="negocios" id="negocios">
  <div class="w">
    <div class="s-label fi">Para quién es</div>
    <h2 class="fi">Cualquier negocio<br>que sirva en mesa<br>o <i>mostrador.</i></h2>
    <div class="neg-grid fi d1">
      <div class="neg-item">
        <div class="neg-ico">🍺</div>
        <div class="neg-name">Bar y cafetería</div>
        <div class="neg-sub">Mostrador · Terraza</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🍽️</div>
        <div class="neg-name">Restaurante</div>
        <div class="neg-sub">Sala completa · KDS</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🌊</div>
        <div class="neg-name">Chiringuito</div>
        <div class="neg-sub">Playa · Exterior · Offline</div>
      </div>
      <div class="neg-item">
        <div class="neg-ico">🎡</div>
        <div class="neg-name">Feria y eventos</div>
        <div class="neg-sub">Temporal · Móvil</div>
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
</section>

<div class="sec-divider"><span class="sec-divider-num">02 — EL SISTEMA</span></div>

<!-- CAPACIDADES -->
<section class="cap" id="sistema">
  <div class="w">
    <div class="s-label fi">El sistema</div>
    <h2 class="fi">Todo lo que necesitas.<br><i>Nada que no uses.</i></h2>
    <div class="bento fi d1">

      <!-- Bloque grande: Voz -->
      <div class="bi big">
        <span class="bi-num">01</span>
        <div class="bi-big-num">🎙<b>Voz</b></div>
        <div class="bi-title">Comandas por voz</div>
        <div class="bi-sub">Sin tocar ninguna pantalla. En español natural. Desde cualquier móvil.</div>
        <div class="bi-corner">🎙</div>
      </div>

      <!-- Bloque grande: KDS -->
      <div class="bi big">
        <span class="bi-num">02</span>
        <div class="bi-big-num">KDS</div>
        <div class="bi-title">Cocina sin papel</div>
        <div class="bi-sub">La comanda llega al instante. La cocina confirma. El camarero recibe el aviso.</div>
        <div class="bi-corner">📟</div>
      </div>

      <!-- 4 bloques medianos -->
      <div class="bi span2">
        <span class="bi-num">03</span>
        <div class="bi-title">VeriFactu</div>
        <div class="bi-sub">Facturación legal con QR de la AEAT. Obligatorio 2026. Incluido.</div>
        <div class="bi-corner">🧾</div>
      </div>
      <div class="bi span2">
        <span class="bi-num">04</span>
        <div class="bi-title">Almacén</div>
        <div class="bi-sub">Stock en tiempo real. Pedidos a proveedor automáticos.</div>
        <div class="bi-corner">📦</div>
      </div>
      <div class="bi span2">
        <span class="bi-num">05</span>
        <div class="bi-title">QR en mesa</div>
        <div class="bi-sub">El cliente escanea y pide solo. Sin camarero, sin esperas.</div>
        <div class="bi-corner">📱</div>
      </div>

      <!-- Bloque ancho: stats offline/feria -->
      <div class="bi wide">
        <div>
          <span class="bi-num">06 — Chiringuito · Feria · Food truck</span>
          <div class="bi-title" style="font-size:18px;margin-bottom:8px">Funciona donde otros no llegan.</div>
          <div class="bi-sub">Modo offline para conexiones inestables. Sin hardware fijo. Setup en menos de 1 hora.</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="background:rgba(246,241,231,.04);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center">
            <div style="font-family:'Newsreader',serif;font-size:38px;font-weight:200;color:var(--red);line-height:1">0</div>
            <div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em;margin-top:4px">Hardware necesario</div>
          </div>
          <div style="background:rgba(246,241,231,.04);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center">
            <div style="font-family:'Newsreader',serif;font-size:38px;font-weight:200;color:var(--green);line-height:1">1h</div>
            <div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em;margin-top:4px">Setup completo</div>
          </div>
        </div>
      </div>

      <!-- Últimos bloques -->
      <div class="bi span2">
        <span class="bi-num">07</span>
        <div class="bi-title">Cierre de caja</div>
        <div class="bi-sub">Automático al final del turno. Con desglose por método de pago.</div>
        <div class="bi-corner">💰</div>
      </div>
      <div class="bi span2">
        <span class="bi-num">08</span>
        <div class="bi-title">Multi-local</div>
        <div class="bi-sub">Un solo panel para todos tus locales. Mismo almacén, mismo equipo.</div>
        <div class="bi-corner">🏢</div>
      </div>
      <div class="bi span2">
        <span class="bi-num">09</span>
        <div class="bi-title">Sin comisión</div>
        <div class="bi-sub">59€/mes fijo. Sin % por cada venta. Sin sorpresas en la factura.</div>
        <div class="bi-corner">✓</div>
      </div>

    </div>
  </div>
</section>

<div class="sec-divider"><span class="sec-divider-num">03 — VOZ</span></div>

<!-- VOZ -->
<section class="voz">
  <div class="w">
    <div class="voz-grid">
      <div class="terminal fi">
        <div class="t-bar"><div class="d dr"></div><div class="d dy"></div><div class="d dg"></div></div>
        <div class="t-body" id="tlines">
          <div><span class="tc">camarero@mesa-4 ~$</span> <span class="tr">escuchar</span></div>
          <div><span class="tg">▶ </span><span class="tc">mic activo...</span></div>
          <div><span class="ta">"dos cañas y una ración de jamón"</span></div>
          <div><span class="tg">✓ </span><span class="tc">comanda enviada a cocina</span></div>
          <div><span class="tg">✓ </span><span class="tc">ticket generado</span></div>
          <div><span class="tc">camarero@mesa-4 ~$</span> <span class="cur"></span></div>
        </div>
      </div>
      <div>
        <div class="s-label fi">Comandas por voz</div>
        <h2 class="fi">Hablas.<br><i>La cocina recibe.</i></h2>
        <ul class="voz-pts fi d1">
          <li class="voz-pt"><div class="voz-pt-t">Sin tocar ninguna pantalla</div></li>
          <li class="voz-pt"><div class="voz-pt-t">Funciona con ruido de fondo</div></li>
          <li class="voz-pt"><div class="voz-pt-t">Desde cualquier móvil</div></li>
          <li class="voz-pt"><div class="voz-pt-t">En español natural</div></li>
        </ul>
      </div>
    </div>
  </div>
</section>

<div class="sec-divider"><span class="sec-divider-num">04 — CONTACTO</span></div>

<!-- FORM -->
<section class="form-section" id="contacto">
  <div class="w">
    <div class="form-grid">
      <div class="form-copy fi">
        <div class="s-label">Contacto</div>
        <h2>14 días para<br><i>comprobarlo.</i></h2>
        <p style="margin-top:20px">Setup en menos de 1 hora. Soporte directo. Sin tarjeta. Si no convence, nada.</p>
        <ul>
          <li>Sin compromiso ni permanencia</li>
          <li>VeriFactu 2026 incluido</li>
          <li>Funciona con tu hardware actual</li>
          <li>Datos alojados en Europa</li>
        </ul>
      </div>
      <div class="fi d1">
        <div class="form-card">
          <div class="form-top">
            <div class="form-top-t">Quiero verlo en mi negocio</div>
            <div class="form-top-s">Te contactamos en menos de 24h.</div>
          </div>
          <div class="form-body" id="formBody">
            <input type="text" id="website" name="website" style="display:none" tabindex="-1" autocomplete="off"/>
            <div class="field"><label>Nombre</label><input type="text" id="nombre" placeholder="Tu nombre" autocomplete="given-name"/></div>
            <div class="field-row">
              <div class="field"><label>Email</label><input type="email" id="email" placeholder="tu@email.com"/></div>
              <div class="field"><label>Teléfono</label><input type="tel" id="telefono" placeholder="+34 6xx xxx xxx"/></div>
            </div>
            <div class="field">
              <label>Tipo de negocio</label>
              <select id="tipo">
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
            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;margin-top:4px">
              <input type="checkbox" id="privacidad" style="margin-top:3px;accent-color:var(--red);cursor:pointer;flex-shrink:0"/>
              <label for="privacidad" style="font-size:12px;color:var(--ink2);line-height:1.5;cursor:pointer">He leído y acepto la <a href="/privacidad" target="_blank" style="color:var(--red)">política de privacidad</a>. Consiento que <strong>Alberto Suárez Gutiérrez (NIF 28823484E)</strong>, responsable de ia.rest, trate mis datos para gestionar mi solicitud. Derechos en <a href="mailto:hola@iarest.es" style="color:var(--red)">hola@iarest.es</a>.</label>
            </div>
            <button class="submit-btn" id="submitBtn" onclick="enviar()">Solicitar información →</button>
          </div>
          <div class="success-state" id="successState">
            <div class="success-icon">✓</div>
            <div class="success-t">Recibido.</div>
            <div class="success-s">Te contactamos antes de 24h.</div>
          </div>
          <div class="form-foot">Sin compromiso · Sin tarjeta · Datos protegidos</div>
          <div class="form-foot" style="margin-top:8px">¿Prefieres escribir o llamar? <a href="mailto:hola@iarest.es" style="color:var(--red);text-decoration:none">hola@iarest.es</a> · <a href="tel:+34637349990" style="color:var(--red);text-decoration:none">637 349 990</a></div>
        </div>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="f-logo">ia<b>.</b>rest</div>
  <div class="f-links">
    <a href="/">Inicio</a>
    <a href="/catering">Catering</a>
    <a href="/espacios">Espacios</a>
    <a href="/blog">Blog</a>
    <a href="/privacidad">Privacidad</a>
  </div>
  <div class="f-copy">© 2026 ia.rest · NIF 28823484E · hola@iarest.es · +34 637 349 990</div>
</footer>

      `}} />
    </>
  )
}
