"use client"
import { useEffect } from "react"
import Head from "next/head"

export default function HomePage() {

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

    // Cookies banner
    function aceptarCookies() {
      localStorage.setItem("cookies_ia", "accepted")
      const b = document.getElementById("cookieBanner") as HTMLElement
      if (b) b.style.display = "none"
    }
    function rechazarCookies() {
      localStorage.setItem("cookies_ia", "rejected")
      const b = document.getElementById("cookieBanner") as HTMLElement
      if (b) b.style.display = "none"
    }
    if (!localStorage.getItem("cookies_ia")) {
      const b = document.getElementById("cookieBanner") as HTMLElement
      if (b) b.style.display = "flex"
    }
    ;(window as any).aceptarCookies = aceptarCookies
    ;(window as any).rechazarCookies = rechazarCookies

    // Burger
    function toggleMenu() {
      const b = document.getElementById("burger") as HTMLElement
      const m = document.getElementById("mobMenu") as HTMLElement
      b?.classList.toggle("open")
      m?.classList.toggle("open")
      document.body.style.overflow = m?.classList.contains("open") ? "hidden" : ""
    }
    function closeMenu() {
      document.getElementById("burger")?.classList.remove("open")
      document.getElementById("mobMenu")?.classList.remove("open")
      document.body.style.overflow = ""
    }
    document.getElementById("burger")?.addEventListener("click", toggleMenu)
    document.querySelectorAll(".mob-menu a").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = (a as HTMLAnchorElement).getAttribute("href")
        if (href?.startsWith("#")) {
          e.preventDefault()
          closeMenu()
          setTimeout(() => {
            document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" })
          }, 320)
        }
      })
    })

    // Form
    async function enviar() {
      const n = (document.getElementById("nombre") as HTMLInputElement).value.trim()
      const r = (document.getElementById("restaurante") as HTMLInputElement).value.trim()
      const em = (document.getElementById("email") as HTMLInputElement).value.trim()
      const tf = (document.getElementById("telefono") as HTMLInputElement).value.trim()
      const u = (document.getElementById("usuarios") as HTMLSelectElement).value
      // Honeypot anti-spam
      const hp = (document.getElementById("website") as HTMLInputElement)?.value
      if (hp) return
      let ok = true
      ;([["nombre", n], ["restaurante", r], ["email", em]] as [string,string][]).forEach(([id, v]) => {
        const el = document.getElementById(id) as HTMLInputElement
        if (!v) { el.style.borderColor = "rgba(217,68,43,.6)"; ok = false }
        else el.style.borderColor = ""
      })
      // Validar formato email con @
      const emailEl = document.getElementById("email") as HTMLInputElement
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        emailEl.style.borderColor = "rgba(217,68,43,.6)"
        ok = false
      }
      const priv = document.getElementById("privacidad") as HTMLInputElement
      if (priv && !priv.checked) { priv.style.outline = "2px solid rgba(217,68,43,.6)"; ok = false }
      else if (priv) priv.style.outline = ""
      if (!ok) return

      const btn = document.getElementById("submitBtn") as HTMLButtonElement
      btn.disabled = true; btn.textContent = "Enviando…"

      try {
        await fetch("/api/leads/landing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: n, restaurante: r, email: em, telefono: tf, usuarios: u, origen: "landing-principal" }),
        })
      } catch {}

      const fb = document.getElementById("formBody") as HTMLElement
      const ss = document.getElementById("successState") as HTMLElement
      if (fb) fb.style.display = "none"
      if (ss) ss.style.display = "block"
    }
    ;(window as any).enviar = enviar
    document.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar() })

    // Pricing calc
    let users = 1, mesas = 0
    function calcPrice(u: number, m: number) {
      let total = 59
      const parts = ["59€ base"]
      if (u >= 2) { const u26 = Math.min(u - 1, 5); total += u26 * 20; if (u26 > 0) parts.push(`+${u26}×20€`) }
      if (u > 6) { const u7 = u - 6; total += u7 * 15; parts.push(`+${u7}×15€`) }
      if (m > 0) { total += m * 12; parts.push(`+${m}×12€ QR`) }
      return { total, breakdown: parts.join(" · ") }
    }
    function updateCalc() {
      const { total, breakdown } = calcPrice(users, mesas)
      const annual = Math.round(total * 12 * 0.82)
      const pr = document.getElementById("priceResult")
      const aa = document.getElementById("annualAmt")
      const pb = document.getElementById("priceBreakdown")
      const ul = document.getElementById("uLabel")
      if (pr) pr.innerHTML = `${total} <span style="font-size:18px;color:var(--ink3);font-family:'Inter Tight',sans-serif">€/mes</span>`
      if (aa) aa.textContent = `${annual} €/año`
      if (pb) pb.textContent = breakdown
      if (ul) ul.innerHTML = users === 1 ? "usuario incluido<br>en el precio base" : users <= 6 ? `usuarios · <span style="color:var(--ink2)">+20€ c/u</span>` : `usuarios · <span style="color:var(--ink2)">7+ a 15€ c/u</span>`
      const uc = document.getElementById("uCount")
      const mc = document.getElementById("mCount")
      if (uc) uc.textContent = String(users)
      if (mc) mc.textContent = String(mesas)
    }
    document.getElementById("uPlus")?.addEventListener("click", () => { if (users < 20) { users++; updateCalc() } })
    document.getElementById("uMinus")?.addEventListener("click", () => { if (users > 1) { users--; updateCalc() } })
    document.getElementById("mPlus")?.addEventListener("click", () => { mesas++; updateCalc() })
    document.getElementById("mMinus")?.addEventListener("click", () => { if (mesas > 0) { mesas--; updateCalc() } })

    return () => { io.disconnect(); tio.disconnect() }
  }, [])

  return (
    <>
      <title>Software de Gestión para Restaurantes, Catering y Espacios de Eventos | ia.rest</title>
      <meta name="description" content="ia.rest gestiona restaurantes, catering y espacios de eventos. Comandas por voz, KDS, APPCC, VeriFactu y portal cliente. Sin comisión. Desde 59€/mes." />
      <meta name="robots" content="index, follow" />
      <meta property="og:title" content="Software para Restaurantes, Catering y Espacios de Eventos | ia.rest" />
      <meta property="og:description" content="Gestión completa para hostelería: restaurantes, catering y espacios de eventos. Voz, KDS, APPCC, VeriFactu y portal cliente. Sin comisión. Desde 59€/mes." />
      <meta property="og:url" content="https://www.iarest.es" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://www.iarest.es/og-image.jpg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="ia.rest" />
      <meta property="og:locale" content="es_ES" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="TPV por Voz para Bares - ia.rest | Sin Comisión 59€/mes" />
      <meta name="twitter:description" content="Gestión completa para hostelería: voz, KDS, almacén, eventos, bodas y catering integrado. Sin comisión. 59€/mes." />
      <meta name="twitter:image" content="https://www.iarest.es/og-image.jpg" />
      <style dangerouslySetInnerHTML={{ __html: `:root {
  --bg: #14110E;
  --bg2: #111009;
  --bg3: #1C1814;
  --ink: #F6F1E7;
  --ink2: #D8CDB6;
  --ink3: #6B6054;
  --red: #D9442B;
  --red2: #A8311E;
  --red3: rgba(217,68,43,0.1);
  --amber: #E8A33B;
  --green: #6EBD73;
  --border: rgba(246,241,231,0.07);
  --border2: rgba(246,241,231,0.13);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--ink);font-family:'Inter Tight',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}

/* NAV */
nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:60px;border-bottom:1px solid var(--border);background:rgba(20,17,14,0.92);backdrop-filter:blur(20px)}
.logo{font-family:'Newsreader',serif;font-size:20px;font-weight:300;color:var(--ink);text-decoration:none}
.logo b{color:var(--red);font-weight:300}
.nav-links{display:flex;gap:28px;align-items:center}
.nav-links a{font-size:13px;color:var(--ink3);text-decoration:none;transition:color .2s}
.nav-links a:hover{color:var(--ink)}
.nav-cta{background:var(--red)!important;color:var(--ink)!important;padding:8px 20px;border-radius:5px;font-weight:600!important}
.nav-cta:hover{opacity:.85}

/* HERO */
.hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:100px 48px 80px;text-align:center;position:relative;overflow:hidden}
.hero-glow{position:absolute;top:-20%;left:50%;transform:translateX(-50%);width:700px;height:500px;background:radial-gradient(ellipse,rgba(217,68,43,0.13) 0%,transparent 60%);pointer-events:none}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:36px;display:flex;align-items:center;gap:12px;justify-content:center}
.eyebrow::before,.eyebrow::after{content:'';width:28px;height:1px;background:var(--red);opacity:.5}
h1{font-family:'Newsreader',serif;font-size:clamp(50px,8vw,104px);font-weight:200;line-height:1.02;letter-spacing:-3px;color:var(--ink);max-width:900px}
h1 i{font-style:italic;color:var(--red)}
.hero-sub{margin-top:28px;font-size:clamp(15px,1.8vw,18px);color:var(--ink3);font-weight:300;line-height:1.7;max-width:500px}
.hero-cta{margin-top:44px;display:flex;gap:12px;justify-content:center}
.btn-s{font-size:14px;font-weight:400;color:var(--ink3);padding:13px 24px;border:1px solid var(--border2);border-radius:6px;text-decoration:none;transition:color .2s,border-color .2s;display:inline-block}
.btn-s:hover{color:var(--ink);border-color:rgba(246,241,231,.2)}
.btn-p{font-size:14px;font-weight:600;background:var(--red);color:var(--ink);padding:13px 28px;border-radius:6px;text-decoration:none;transition:opacity .2s,transform .15s}
.btn-p:hover{opacity:.85;transform:translateY(-1px)}
.btn-s{font-size:14px;font-weight:400;color:var(--ink3);padding:13px 24px;border:1px solid var(--border2);border-radius:6px;text-decoration:none;transition:color .2s,border-color .2s}
.btn-s:hover{color:var(--ink);border-color:rgba(246,241,231,.2)}

/* STRIP */
.strip{border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex}
.strip-item{flex:1;padding:32px 0;text-align:center;border-right:1px solid var(--border)}
.strip-item:last-child{border-right:none}
.strip-num{display:block;font-family:'Newsreader',serif;font-size:clamp(26px,4vw,42px);font-weight:200;color:var(--ink);letter-spacing:-1px}
.strip-num b{color:var(--red);font-weight:200}
.strip-lbl{display:block;margin-top:5px;font-size:10px;color:var(--ink3);font-weight:500;letter-spacing:.1em;text-transform:uppercase}

/* SECTIONS */
section{padding:100px 48px}
.w{max-width:1100px;margin:0 auto}
.s-label{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:20px}
h2{font-family:'Newsreader',serif;font-size:clamp(34px,5vw,62px);font-weight:200;letter-spacing:-2px;color:var(--ink);line-height:1.05}
h2 i{font-style:italic;color:var(--red)}

/* MANIFESTO */
.manifesto{background:var(--bg2)}
.manifesto-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:end}
.manifesto-list{list-style:none}
.manifesto-list li{padding:20px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline;gap:24px}
.manifesto-list li:first-child{border-top:1px solid var(--border)}
.m-title{font-family:'Newsreader',serif;font-size:19px;font-weight:300;color:var(--ink);letter-spacing:-.3px}
.m-title i{font-style:italic;color:var(--red)}
.m-tag{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);white-space:nowrap}

/* ELIMINA */
.elimina{background:var(--bg)}
.elimina-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
.cost-rows{margin-top:32px}
.cost-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--border);font-size:14px;color:var(--ink3)}
.cost-row span:last-child{text-decoration:line-through;font-family:'JetBrains Mono',monospace;font-size:13px}
.cost-total{margin-top:20px;padding:22px 26px;border:1px solid rgba(217,68,43,.25);border-radius:10px;display:flex;justify-content:space-between;align-items:center}
.ct-l{font-size:13px;color:var(--ink3)}
.ct-l strong{display:block;font-size:15px;color:var(--ink);font-weight:600;margin-bottom:2px}
.ct-r{font-family:'Newsreader',serif;font-size:52px;color:var(--ink);letter-spacing:-2px;font-weight:200}
.ct-r small{font-family:'Inter Tight',sans-serif;font-size:14px;color:var(--ink3)}
.save-note{margin-top:10px;font-size:12px;color:var(--green)}
.save-note::before{content:'↑ '}

/* CAPABILITIES */
.cap{background:var(--bg2)}
.cap-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:var(--border);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-top:52px}
.cap-item{background:var(--bg2);padding:30px 22px;transition:background .2s}
.cap-item:hover{background:var(--bg3)}
.cap-num{display:block;font-family:'Newsreader',serif;font-size:12px;color:var(--red);font-weight:300;letter-spacing:.05em;margin-bottom:14px}
.cap-title{font-size:14px;font-weight:600;color:var(--ink);letter-spacing:-.1px;margin-bottom:6px}
.cap-sub{font-size:12px;color:var(--ink3);line-height:1.55}

/* VOZ */
.voz{background:var(--bg)}
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
.voz-pt-t{font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px;letter-spacing:-.2px}
.voz-pt-d{font-size:13px;color:var(--ink3);line-height:1.6}

/* AUTO-HEALER */
.healer{background:var(--bg2)}
.healer-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.stat{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:24px}
.stat-val{display:block;font-family:'Newsreader',serif;font-size:38px;font-weight:200;letter-spacing:-1px;margin-bottom:4px}
.stat-val.r{color:var(--red)}.stat-val.g{color:var(--green)}.stat-val.a{color:var(--amber)}
.stat-lbl{font-size:10px;color:var(--ink3);font-weight:500;text-transform:uppercase;letter-spacing:.08em}

/* FORM SECTION */
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
.submit-btn:active{transform:none}
.submit-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.form-foot{padding:14px 34px;border-top:1px solid var(--border);font-size:11px;color:var(--ink3);text-align:center}

/* SUCCESS */
.success-state{display:none;padding:44px 34px;text-align:center}
.success-icon{width:52px;height:52px;border-radius:50%;background:rgba(110,189,115,.1);border:1px solid rgba(110,189,115,.3);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 18px}
.success-t{font-family:'Newsreader',serif;font-size:26px;font-weight:300;color:var(--ink);letter-spacing:-.5px;margin-bottom:10px}
.success-s{font-size:14px;color:var(--ink3);line-height:1.6}

/* FOOTER */
footer{border-top:1px solid var(--border);padding:40px 48px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.f-logo{font-family:'Newsreader',serif;font-size:18px;font-weight:300;color:var(--ink3)}
.f-logo b{color:var(--red);font-weight:300}
.f-links{display:flex;gap:22px}
.f-links a{font-size:12px;color:var(--ink3);text-decoration:none;transition:color .2s}
.f-links a:hover{color:var(--ink)}
.f-copy{font-size:11px;color:var(--ink3)}

/* ANIM */
.fi{opacity:0;transform:translateY(16px);transition:opacity .65s ease,transform .65s ease}
.fi.d1{transition-delay:.1s}.fi.d2{transition-delay:.2s}.fi.d3{transition-delay:.3s}
.fi.on{opacity:1;transform:none}

/* BURGER */
/* BURGER */
.burger{display:none;flex-direction:column;justify-content:center;gap:5px;background:none;border:none;cursor:pointer;padding:8px;z-index:200;flex-shrink:0}
.burger span{display:block;width:22px;height:2px;background:var(--ink);border-radius:2px;transition:transform .3s,opacity .3s}
.burger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.burger.open span:nth-child(2){opacity:0}
.burger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}

/* MOB MENU */
.mob-menu{display:none;position:fixed;top:60px;left:0;right:0;bottom:0;background:rgba(20,17,14,0.98);backdrop-filter:blur(20px);z-index:99;flex-direction:column;padding:40px 28px;gap:0}
.mob-menu.open{display:flex}
.mob-menu a{font-size:32px;font-family:'Newsreader',serif;font-weight:200;color:var(--ink2);text-decoration:none;padding:20px 0;border-bottom:1px solid var(--border);letter-spacing:-1px;transition:color .2s}
.mob-menu a:hover{color:var(--ink)}
.mob-menu .mob-cta{margin-top:28px;border:none;font-family:'Inter Tight',sans-serif;font-size:15px;font-weight:700;color:var(--ink);background:var(--red);padding:16px 24px;border-radius:8px;text-align:center;letter-spacing:0;font-size:16px}

/* RESPONSIVE */
.perfiles-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;background:var(--border)}
@media(max-width:900px){
  nav{padding:0 20px}
  .nav-links{display:none!important}
  .burger{display:flex!important}
  section{padding:72px 20px}
  .manifesto-grid,.elimina-grid,.voz-grid,.healer-grid,.form-grid{grid-template-columns:1fr;gap:48px}
  .cap-grid{grid-template-columns:1fr 1fr}
  .strip{flex-wrap:wrap}
  .strip-item{min-width:50%}
  .field-row{grid-template-columns:1fr}
  .form-top,.form-body,.form-foot{padding-left:22px;padding-right:22px}
  footer{flex-direction:column;text-align:center}
  .perfiles-grid{grid-template-columns:1fr}
}
@media(max-width:500px){
  h1{letter-spacing:-2px}
  .cap-grid{grid-template-columns:1fr}
  .stats-grid{grid-template-columns:1fr 1fr}
}` }} />
      <div dangerouslySetInnerHTML={{ __html: `<nav>
  <a class="logo" href="#">ia<b>.</b>rest</a>
  <div class="nav-links">
    <a href="/hosteleria">Hostelería</a>
    <a href="/catering">Catering</a>
    <a href="/espacios">Espacios</a>
    <a href="#precios">Precios</a>
    <a href="#contacto" class="nav-cta">Demo gratuita →</a>
  </div>
  <button class="burger" id="burger" aria-label="Menú">
    <span></span><span></span><span></span>
  </button>
</nav>

<div class="mob-menu" id="mobMenu">
  <a href="/hosteleria">Hostelería</a>
  <a href="/catering">Catering</a>
  <a href="/espacios">Espacios</a>
  <a href="#precios">Precios</a>
  <a href="#contacto">Contacto</a>
  <a href="#contacto" class="mob-cta">Demo gratuita →</a>
</div>

<!-- HERO -->
<section class="hero" style="padding-bottom:0">
  <div class="hero-glow"></div>
  <div class="eyebrow fi">Software de gestión · Hostelería española · Sin comisión</div>
  <h1 class="fi d1">Gestión completa<br>para <i>hostelería.</i></h1>
  <p class="hero-sub fi d2" style="max-width:520px">Restaurante, catering o espacio de eventos. Todo en una sola herramienta. Voz, KDS, APPCC, VeriFactu y más.</p>
  <div class="hero-cta fi d2">
    <a href="#contacto" class="btn-p">Prueba 14 días gratis →</a>
    <a href="#perfiles" class="btn-s" style="font-size:14px;color:var(--ink3);padding:13px 24px;border:1px solid var(--border2);border-radius:6px;text-decoration:none;transition:color .2s,border-color .2s">¿Para qué tipo de negocio? ↓</a>
  </div>
</section>

<!-- PERFILES — las 3 tarjetas grandes clickables -->
<section id="perfiles" style="background:var(--bg2);padding:0 0 0 0">
  <div class="w perfiles-grid">

    <a href="/hosteleria" style="display:block;text-decoration:none;background:var(--bg2);padding:52px 40px;border-bottom:3px solid transparent;transition:all .25s;cursor:pointer" onmouseenter="this.style.background='var(--bg3)';this.style.borderBottomColor='var(--red)'" onmouseleave="this.style.background='var(--bg2)';this.style.borderBottomColor='transparent'">
      <div style="width:44px;height:44px;margin-bottom:22px;color:var(--red)"><svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="6" width="24" height="24" rx="2"/><line x1="14" y1="12" x2="30" y2="12"/><line x1="14" y1="16" x2="30" y2="16"/><line x1="14" y1="20" x2="22" y2="20"/><line x1="22" y1="30" x2="22" y2="36"/><line x1="14" y1="36" x2="30" y2="36"/><rect x="18" y="25" width="8" height="5" rx="1"/></svg></div>
      <div style="font-family:'Newsreader',serif;font-size:26px;font-weight:200;color:var(--ink);letter-spacing:-.5px;margin-bottom:10px;line-height:1.15">Restaurante<br>y hostelería</div>
      <p style="font-size:13px;color:var(--ink3);line-height:1.65;margin-bottom:20px">Bar, restaurante, chiringuito, feria, food truck. Comandas por voz, KDS, almacén y VeriFactu.</p>
      <div style="font-size:12px;color:var(--red);font-family:'JetBrains Mono',monospace;letter-spacing:.05em">Ver solución →</div>
    </a>

    <a href="/catering" style="display:block;text-decoration:none;background:var(--bg2);padding:52px 40px;border-bottom:3px solid var(--red);transition:all .25s;cursor:pointer" onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background='var(--bg2)'">
      <div style="width:44px;height:44px;margin-bottom:22px;color:var(--red)"><svg viewBox="0 0 44 44" fill="none"><text x="3" y="40" font-size="42" font-family="Newsreader,Georgia,serif" font-style="italic" font-weight="200" fill="currentColor">C</text></svg></div>
      <div style="font-family:'Newsreader',serif;font-size:26px;font-weight:200;color:var(--ink);letter-spacing:-.5px;margin-bottom:10px;line-height:1.15">Catering<br>y eventos</div>
      <p style="font-size:13px;color:var(--ink3);line-height:1.65;margin-bottom:20px">Del presupuesto al evento y a la caja. Portal cliente, APPCC, escandallos y VeriFactu.</p>
      <div style="font-size:12px;color:var(--red);font-family:'JetBrains Mono',monospace;letter-spacing:.05em">Ver solución →</div>
    </a>

    <a href="/espacios" style="display:block;text-decoration:none;background:var(--bg2);padding:52px 40px;border-bottom:3px solid transparent;transition:all .25s;cursor:pointer" onmouseenter="this.style.background='var(--bg3)';this.style.borderBottomColor='var(--red)'" onmouseleave="this.style.background='var(--bg2)';this.style.borderBottomColor='transparent'">
      <div style="width:44px;height:44px;margin-bottom:22px;color:var(--red)"><svg viewBox="0 0 44 44" fill="none"><text x="4" y="40" font-size="42" font-family="Newsreader,Georgia,serif" font-style="italic" font-weight="200" fill="currentColor">E</text></svg></div>
      <div style="font-family:'Newsreader',serif;font-size:26px;font-weight:200;color:var(--ink);letter-spacing:-.5px;margin-bottom:10px;line-height:1.15">Fincas<br>y espacios</div>
      <p style="font-size:13px;color:var(--ink3);line-height:1.65;margin-bottom:20px">Solicitudes de bodas.net automáticas. Contratos digitales, calendario y VeriFactu.</p>
      <div style="font-size:12px;color:var(--red);font-family:'JetBrains Mono',monospace;letter-spacing:.05em">Ver solución →</div>
    </a>

  </div>
</section>

<!-- STRIP -->
<div class="strip">
  <div class="strip-item">
    <span class="strip-num">&lt;<b>0.5</b>s</span>
    <span class="strip-lbl">Voz a cocina</span>
  </div>
  <div class="strip-item">
    <span class="strip-num">97<b>.9</b>%</span>
    <span class="strip-lbl">Se repara solo</span>
  </div>
  <div class="strip-item">
    <span class="strip-num">0<b>%</b></span>
    <span class="strip-lbl">Comisión</span>
  </div>
  <div class="strip-item">
    <span class="strip-num">6<b>+</b></span>
    <span class="strip-lbl">Herramientas que elimina</span>
  </div>
</div>

<!-- MANIFESTO -->
<section class="manifesto" id="sistema">
  <div class="w">
    <div class="manifesto-grid">
      <div class="fi">
        <div class="s-label">Todo en uno</div>
        <h2>De la voz<br>a la <i>gestoría.</i></h2>
      </div>
      <ul class="manifesto-list fi d1">
        <li><span class="m-title">Comanda por voz en <i>&lt;0.5s</i></span><span class="m-tag">Sala</span></li>
        <li><span class="m-title">Cocina que <i>se organiza sola</i></span><span class="m-tag">Cocina</span></li>
        <li><span class="m-title">Almacén <i>automático</i></span><span class="m-tag">Stock</span></li>
        <li><span class="m-title">Compras sin <i>una sola llamada</i></span><span class="m-tag">Proveedores</span></li>
        <li><span class="m-title">Contabilidad que <i>exporta sola</i></span><span class="m-tag">Gestión</span></li>
        <li><span class="m-title">VeriFactu 2026 <i>incluido</i></span><span class="m-tag">Legal</span></li>
        <li><span class="m-title">El sistema que <i>se repara solo</i></span><span class="m-tag">Infra</span></li>
      </ul>
    </div>
  </div>
</section>

<!-- ELIMINA -->
<section class="elimina" id="elimina">
  <div class="w">
    <div class="elimina-grid">
      <div class="fi">
        <div class="s-label">Lo que eliminas</div>
        <h2>No es un gasto.<br>Es una <i>consolidación.</i></h2>
        <p style="margin-top:20px;font-size:16px;color:var(--ink3);font-weight:300;line-height:1.75">Sustituye todo el stack de herramientas que ya pagas por separado. Un sistema, una factura, cero comisiones.</p>
      </div>
      <div class="fi d1">
        <div class="cost-rows">
          <div class="cost-row"><span>TPV tradicional</span><span>~90 €/mes</span></div>
          <div class="cost-row"><span>Gestión delivery (Deliverect…)</span><span>~49 €/mes</span></div>
          <div class="cost-row"><span>Software de almacén</span><span>~40 €/mes</span></div>
          <div class="cost-row"><span>VeriFactu externo</span><span>~30 €/mes</span></div>
          <div class="cost-row"><span>Exportación contable + portal asesoría</span><span>~80 €/mes</span></div>
        </div>
        <div class="cost-total">
          <div class="ct-l"><strong>ia.rest · 5 usuarios</strong>todo incluido · sin comisión</div>
          <div class="ct-r">139<small> €/mes</small></div>
        </div>
        <div class="save-note">Ahorras ~150 €/mes desde el día 1</div>
      </div>
    </div>
  </div>
</section>

<!-- CAPABILITIES -->
<section class="cap" id="capacidades">
  <div class="w">
    <div class="fi">
      <div class="s-label">Capacidades</div>
      <h2>Cada capa.<br><i>Conectada.</i></h2>
    </div>
    <div class="cap-grid fi d1">
      <div class="cap-item"><span class="cap-num">01</span><div class="cap-title">Voz → cocina</div><div class="cap-sub">Sin tocar pantalla. La orden llega sola.</div></div>
      <div class="cap-item"><span class="cap-num">02</span><div class="cap-title">Cocina organizada</div><div class="cap-sub">Cada plato, en su momento. Sin caos.</div></div>
      <div class="cap-item"><span class="cap-num">03</span><div class="cap-title">QR en mesa</div><div class="cap-sub">El cliente pide solo. Sin app, sin camarero.</div></div>
      <div class="cap-item"><span class="cap-num">04</span><div class="cap-title">Ventas online propias</div><div class="cap-sub">Delivery y recogida sin intermediarios.</div></div>
      <div class="cap-item"><span class="cap-num">05</span><div class="cap-title">Almacén automático</div><div class="cap-sub">El stock se gestiona solo. Cero entrada manual.</div></div>
      <div class="cap-item"><span class="cap-num">06</span><div class="cap-title">Ciclo de compras</div><div class="cap-sub">Del pedido al pago al proveedor. Todo cerrado.</div></div>
      <div class="cap-item"><span class="cap-num">07</span><div class="cap-title">Contabilidad</div><div class="cap-sub">Tu gestor recibe todo listo. Sin hacer nada.</div></div>
      <div class="cap-item"><span class="cap-num">08</span><div class="cap-title">Se repara solo</div><div class="cap-sub">Si algo falla, lo detecta y lo corrige. Solo.</div></div>
      <div class="cap-item"><span class="cap-num">09</span><div class="cap-title">Alertas en Telegram</div><div class="cap-sub">Cierre de caja, stock crítico o cualquier aviso directo a tu móvil.</div></div>
      <div class="cap-item"><span class="cap-num">10</span><div class="cap-title">Portal asesoría</div><div class="cap-sub">El contable ve todos sus clientes hosteleros. 303 calculado. Exporta en A3 con un clic.</div></div>
      <div class="cap-item"><span class="cap-num">11</span><div class="cap-title">Central de almacén</div><div class="cap-sub">Para grupos: stock crítico de todos los locales en tiempo real. Pedido grupal al proveedor.</div></div>
      <div class="cap-item"><span class="cap-num">12</span><div class="cap-title">Eventos y catering</div><div class="cap-sub">El cliente rellena un briefing online. El sistema calcula el precio con tus escandallos reales, barra libre y márgenes. El comercial cierra con un click. Informe post-evento automático.</div></div>
      <div class="cap-item"><span class="cap-num">13</span><div class="cap-title">Tu web incluida</div><div class="cap-sub">Web profesional con tu carta, horarios y reserva directa. Incluida en el plan, sin coste extra.</div></div>
    </div>
  </div>
</section>



<!-- AUTO-HEALER -->
<section class="healer" id="infra">
  <div class="w">
    <div class="healer-grid">
      <div class="fi">
        <div class="s-label">Infraestructura</div>
        <h2>El sistema<br><i>se repara solo.</i></h2>
        <p style="margin-top:24px;font-size:16px;color:var(--ink3);font-weight:300;line-height:1.75">Sin departamento IT. Sin llamar a soporte. El sistema resuelve sus propios problemas para que tú no tengas que hacerlo.</p>
      </div>
      <div class="stats-grid fi d1">
        <div class="stat"><span class="stat-val g">97.9<span style="font-size:18px">%</span></span><div class="stat-lbl">Autocorrección</div></div>
        <div class="stat"><span class="stat-val a">5<span style="font-size:18px">min</span></span><div class="stat-lbl">Ciclo monitor</div></div>
        <div class="stat"><span class="stat-val r">14</span><div class="stat-lbl">Checks activos</div></div>
        <div class="stat"><span class="stat-val">0</span><div class="stat-lbl">Llamadas soporte</div></div>
      </div>
    </div>
  </div>
</section>

<!-- VERTICALES -->
<section style="background:var(--bg);padding:100px 48px">
  <div class="w">
    <div class="fi" style="margin-bottom:48px">
      <div class="s-label">¿Para qué tipo de negocio?</div>
      <h2>Un sistema.<br><i>Tres soluciones.</i></h2>
    </div>
    <div class="fi d1" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2px">
      <div style="background:var(--bg2);padding:36px 28px;border-bottom:2px solid transparent;transition:border-color .2s" onmouseenter="this.style.borderBottomColor='var(--red)'" onmouseleave="this.style.borderBottomColor='transparent'">
        <div style="font-size:28px;margin-bottom:16px">🍽️</div>
        <div style="font-family:'Newsreader',serif;font-size:22px;font-weight:300;color:var(--ink);margin-bottom:8px">Restaurante y bar</div>
        <p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:20px">Comandas por voz, KDS, gestión de mesas, almacén y VeriFactu. El sistema completo para sala y cocina.</p>
        <a href="#sistema" style="font-size:12px;color:var(--red);font-family:'JetBrains Mono',monospace;letter-spacing:.05em">Ver el sistema →</a>
      </div>
      <div style="background:var(--bg2);padding:36px 28px;border-bottom:2px solid var(--red)">
        <div style="font-size:28px;margin-bottom:16px">🍱</div>
        <div style="font-family:'Newsreader',serif;font-size:22px;font-weight:300;color:var(--ink);margin-bottom:8px">Catering y eventos</div>
        <p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:20px">Del presupuesto al evento y a la factura. Portal cliente, APPCC, voz en el evento y VeriFactu. El 360 completo.</p>
        <a href="/catering" style="font-size:12px;color:var(--red);font-family:'JetBrains Mono',monospace;letter-spacing:.05em">Ver landing catering →</a>
      </div>
      <div style="background:var(--bg2);padding:36px 28px;border-bottom:2px solid transparent;transition:border-color .2s" onmouseenter="this.style.borderBottomColor='var(--red)'" onmouseleave="this.style.borderBottomColor='transparent'">
        <div style="font-size:28px;margin-bottom:16px">🏛️</div>
        <div style="font-family:'Newsreader',serif;font-size:22px;font-weight:300;color:var(--ink);margin-bottom:8px">Fincas y espacios</div>
        <p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:20px">Solicitudes de bodas.net automáticas, calendario, contratos digitales y VeriFactu. Solo pagas lo que usas.</p>
        <a href="/espacios" style="font-size:12px;color:var(--red);font-family:'JetBrains Mono',monospace;letter-spacing:.05em">Ver landing espacios →</a>
      </div>
    </div>
  </div>
</section>

<section id="precios" style="background:var(--bg2);padding:100px 48px">
  <div class="w">
    <div class="fi" style="text-align:center;margin-bottom:52px">
      <div class="s-label" style="justify-content:center;display:flex">Precio</div>
      <h2>Simple.<br><i>Sin sorpresas.</i></h2>
      <p style="margin-top:16px;font-size:16px;color:var(--ink3);font-weight:300">Sin planes fijos. Sin permanencia. Sin comisión sobre ventas.</p>
    </div>
    <div class="fi d1" style="max-width:560px;margin:0 auto;background:var(--bg);border:1px solid var(--border2);border-radius:16px;overflow:hidden">

      <!-- CALCULADORA -->
      <div style="padding:32px 36px;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;color:var(--ink3);font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:20px">Calcula tu precio</div>
        <div style="font-size:12px;color:var(--ink3);margin-bottom:8px">Usuarios (camarero, cocina, sala, contable, RRHH…)</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:4px">
          <button id="uMinus" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border2);background:none;color:var(--ink);font-size:18px;cursor:pointer;transition:border-color .2s" onmouseenter="this.style.borderColor='rgba(246,241,231,.3)'" onmouseleave="this.style.borderColor='var(--border2)'">−</button>
          <span id="uCount" style="font-family:'Newsreader',serif;font-size:48px;color:var(--ink);font-weight:200;letter-spacing:-2px;min-width:48px;text-align:center">1</span>
          <button id="uPlus" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border2);background:none;color:var(--ink);font-size:18px;cursor:pointer;transition:border-color .2s" onmouseenter="this.style.borderColor='rgba(246,241,231,.3)'" onmouseleave="this.style.borderColor='var(--border2)'">+</button>
          <span id="uLabel" style="font-size:12px;color:var(--ink3);line-height:1.4">usuario incluido<br>en el precio base</span>
        </div>
        <div style="margin-top:20px;font-size:12px;color:var(--ink3)">Mesas con QR (add-on opcional)</div>
        <div style="display:flex;align-items:center;gap:16px;margin-top:8px">
          <button id="mMinus" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border2);background:none;color:var(--ink);font-size:18px;cursor:pointer" onclick="">−</button>
          <span id="mCount" style="font-family:'Newsreader',serif;font-size:48px;color:var(--ink);font-weight:200;letter-spacing:-2px;min-width:48px;text-align:center">0</span>
          <button id="mPlus" style="width:36px;height:36px;border-radius:8px;border:1px solid var(--border2);background:none;color:var(--ink);font-size:18px;cursor:pointer">+</button>
          <span style="font-size:12px;color:var(--ink3)">+12 €/mesa/mes</span>
        </div>
      </div>

      <!-- RESULTADO -->
      <div style="padding:28px 36px;background:rgba(217,68,43,0.05);border-bottom:1px solid rgba(217,68,43,.15)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:12px;color:var(--ink3);margin-bottom:4px">Total mensual</div>
            <div id="priceResult" style="font-family:'Newsreader',serif;font-size:64px;color:var(--ink);letter-spacing:-3px;font-weight:200;line-height:1">59 <span style="font-size:18px;color:var(--ink3);font-family:'Inter Tight',sans-serif">€/mes</span></div>
          </div>
          <div style="text-align:right">
            <div id="annualPrice" style="font-size:13px;color:var(--green);font-weight:500">−18% anual</div>
            <div id="annualAmt" style="font-family:'Newsreader',serif;font-size:22px;color:var(--ink3);letter-spacing:-0.5px">580 €/año</div>
          </div>
        </div>
        <div id="priceBreakdown" style="margin-top:12px;font-size:12px;color:var(--ink3);line-height:1.7">59€ base</div>
      </div>

      <!-- NOTAS -->
      <div style="padding:20px 36px;display:flex;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--ink3);padding:5px 11px;border:1px solid var(--border);border-radius:20px">Trial 14 días</span>
        <span style="font-size:11px;color:var(--ink3);padding:5px 11px;border:1px solid var(--border);border-radius:20px">Sin permanencia</span>
        <span style="font-size:11px;color:var(--ink3);padding:5px 11px;border:1px solid var(--border);border-radius:20px">Todo incluido</span>
        <span style="font-size:11px;color:var(--ink3);padding:5px 11px;border:1px solid var(--border);border-radius:20px">Sin comisión</span>
      </div>
    </div>
  </div>
</section>

<!-- FORM -->
<section class="form-section" id="contacto" style="background:var(--bg2)">
  <div class="w">
    <div class="form-grid">
      <div class="form-copy fi">
        <div class="s-label">Contacto</div>
        <h2>14 días para<br><i>comprobarlo.</i></h2>
        <p style="margin-top:20px">Setup completo en menos de 2 horas. Soporte directo. Sin tarjeta. Si no convence, nada.</p>
        <ul>
          <li>Sin compromiso ni permanencia</li>
          <li>VeriFactu 2026 incluido desde el primer día</li>
          <li>Funciona con tu hardware actual</li>
          <li>Datos alojados en Europa</li>
          <li>Contrato SaaS transparente incluido</li>
        </ul>
      </div>
      <div class="fi d1">
        <div class="form-card">
          <div class="form-top">
            <div class="form-top-t">Quiero verlo en mi restaurante</div>
            <div class="form-top-s">Te contactamos en menos de 24h para mostrarte cómo encaja en tu local.</div>
          </div>
          <div class="form-body" id="formBody">
            {/* Honeypot anti-spam — oculto para humanos, bots lo rellenan */}
            <input type="text" id="website" name="website" style={{display:'none'}} tabIndex={-1} autoComplete="off"/>
            <div class="field"><label>Nombre</label><input type="text" id="nombre" placeholder="Tu nombre" autocomplete="given-name"/></div>
            <div class="field"><label>Restaurante</label><input type="text" id="restaurante" placeholder="Nombre del local" autocomplete="organization"/></div>
            <div class="field-row">
              <div class="field"><label>Email</label><input type="email" id="email" placeholder="tu@email.com"/></div>
              <div class="field"><label>Teléfono</label><input type="tel" id="telefono" placeholder="+34 6xx xxx xxx"/></div>
            </div>
            <div class="field">
              <label>Personas en sala y cocina</label>
              <select id="usuarios">
                <option value="" disabled selected>Selecciona</option>
                <option value="1">Solo yo (1 usuario)</option>
                <option value="2-4">Equipo pequeño (2–4)</option>
                <option value="5-9">Equipo mediano (5–9)</option>
                <option value="10+">Equipo grande (10+)</option>
                <option value="grupo">Tengo varios locales</option>
              </select>
            </div>
            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;margin-top:4px">
              <input type="checkbox" id="privacidad" style="margin-top:3px;accent-color:var(--red);cursor:pointer;flex-shrink:0"/>
              <label for="privacidad" style="font-size:12px;color:var(--ink2);line-height:1.5;cursor:pointer">He leído y acepto la <a href="/privacidad" target="_blank" style="color:var(--red)">política de privacidad</a>. Consiento que <strong>Alberto Suárez Gutiérrez (NIF 28823484E)</strong>, responsable de ia.rest, trate mis datos para gestionar mi solicitud. Puedo ejercer mis derechos de acceso, rectificación, supresión y oposición en <a href="mailto:hola@iarest.es" style="color:var(--red)">hola@iarest.es</a>.</label>
            </div>
            <button class="submit-btn" id="submitBtn" onclick="enviar()">Solicitar información →</button>
          </div>
          <div class="success-state" id="successState">
            <div class="success-icon">✓</div>
            <div class="success-t">Recibido.</div>
            <div class="success-s">Te contactamos antes de 24h.<br>Hasta entonces, preparamos todo para tu restaurante.</div>
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
    <a href="/hosteleria">Hostelería</a>
    <a href="/catering">Catering</a>
    <a href="/espacios">Espacios</a>
    <a href="https://www.instagram.com/iarest.es?igsh=cDdjNDVja3lrcTlk" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
      @iarest.es
    </a>
  </div>
  <div class="f-copy" style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center">
    <span>© 2026 ia.rest · NIF 28823484E</span>
    <a href="/privacidad" style="color:var(--ink3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='var(--ink)'" onmouseout="this.style.color='var(--ink3)'">Privacidad</a>
    <a href="/aviso-legal" style="color:var(--ink3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='var(--ink)'" onmouseout="this.style.color='var(--ink3)'">Aviso legal</a>
    <a href="/cookies" style="color:var(--ink3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='var(--ink)'" onmouseout="this.style.color='var(--ink3)'">Cookies</a>
  </div>
  <div style="width:100%;text-align:center;margin-top:12px;font-size:11px;color:var(--ink3);line-height:1.5">
    Sistema de IA de riesgo limitado conforme al Reglamento (UE) 2024/1689 (EU AI Act) · Art. 50 · Supervisión humana activa en todas las decisiones · <a href="/privacidad#ia" style="color:var(--ink3);text-decoration:underline;text-underline-offset:2px">Más información</a>
  </div>
</footer>


<!-- BANNER COOKIES -->
<div id="cookieBanner" style="display:none;position:fixed;bottom:0;left:0;right:0;z-index:999;background:#1C1814;border-top:1px solid rgba(246,241,231,0.1);padding:16px 32px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
  <p style="font-size:13px;color:var(--ink3);line-height:1.5;max-width:680px;margin:0">
    Usamos cookies técnicas necesarias para el funcionamiento del sitio. Las fuentes tipográficas se cargan desde Google Fonts (transferencia a EE.UU. bajo SCCs).
    <a href="/cookies" style="color:var(--ink2);text-decoration:underline;text-underline-offset:2px">Más información</a>
  </p>
  <div style="display:flex;gap:10px;flex-shrink:0">
    <button onclick="rechazarCookies()" style="padding:9px 18px;background:none;border:1px solid rgba(246,241,231,.15);border-radius:6px;color:var(--ink3);font-size:13px;font-family:'Inter Tight',sans-serif;cursor:pointer">Rechazar todo</button>
    <button onclick="aceptarCookies()" style="padding:9px 18px;background:var(--red);border:none;border-radius:6px;color:var(--ink);font-size:13px;font-weight:600;font-family:'Inter Tight',sans-serif;cursor:pointer">Aceptar todo</button>
  </div>
</div>` }} />
    </>
  )
}
