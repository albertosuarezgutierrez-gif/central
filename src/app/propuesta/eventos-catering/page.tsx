"use client"
import { useEffect } from "react"

export default function EventosCateringPage() {
  useEffect(() => {
    // Scroll animations
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { (e.target as HTMLElement).classList.add("on"); io.unobserve(e.target) }
      }), { threshold: 0.08 }
    )
    document.querySelectorAll(".fi").forEach((el) => io.observe(el))

    // Form
    async function enviar() {
      const n = (document.getElementById("nombre") as HTMLInputElement).value.trim()
      const r = (document.getElementById("empresa") as HTMLInputElement).value.trim()
      const em = (document.getElementById("email") as HTMLInputElement).value.trim()
      const tf = (document.getElementById("telefono") as HTMLInputElement).value.trim()
      const hp = (document.getElementById("website") as HTMLInputElement)?.value
      if (hp) return
      let ok = true
      ;([[n, "nombre"], [r, "empresa"], [em, "email"]] as [string, string][]).forEach(([v, id]) => {
        const el = document.getElementById(id) as HTMLInputElement
        if (!v) { el.style.borderColor = "rgba(217,68,43,.6)"; ok = false }
        else el.style.borderColor = ""
      })
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        (document.getElementById("email") as HTMLInputElement).style.borderColor = "rgba(217,68,43,.6)"; ok = false
      }
      const priv = document.getElementById("privacidad") as HTMLInputElement
      if (priv && !priv.checked) { priv.style.outline = "2px solid rgba(217,68,43,.6)"; ok = false }
      else if (priv) priv.style.outline = ""
      if (!ok) return

      const btn = document.getElementById("submitBtn") as HTMLButtonElement
      btn.disabled = true; btn.textContent = "Enviando…"

      try {
        const res = await fetch("/api/leads/landing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: n, restaurante: r, email: em, telefono: tf, origen: "eventos-catering" })
        })
        if (res.ok) {
          const form = document.getElementById("leadForm") as HTMLElement
          const ok2 = document.getElementById("leadOk") as HTMLElement
          if (form) form.style.display = "none"
          if (ok2) ok2.style.display = "block"
        } else {
          btn.disabled = false; btn.textContent = "Solicitar demo gratuita"
        }
      } catch {
        btn.disabled = false; btn.textContent = "Solicitar demo gratuita"
      }
    }
    ;(window as any).enviarEvento = enviar

    // Burger
    function toggleMenu() {
      document.getElementById("burger")?.classList.toggle("open")
      const m = document.getElementById("mobMenu") as HTMLElement
      m?.classList.toggle("open")
      document.body.style.overflow = m?.classList.contains("open") ? "hidden" : ""
    }
    document.getElementById("burger")?.addEventListener("click", toggleMenu)
    document.querySelectorAll(".mob-menu a").forEach((a) => {
      a.addEventListener("click", () => {
        document.getElementById("burger")?.classList.remove("open")
        document.getElementById("mobMenu")?.classList.remove("open")
        document.body.style.overflow = ""
      })
    })
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `:root{--bg:#14110E;--bg2:#111009;--bg3:#1C1814;--ink:#F6F1E7;--ink2:#D8CDB6;--ink3:#6B6054;--red:#D9442B;--red2:#A8311E;--red3:rgba(217,68,43,0.10);--amber:#E8A33B;--green:#6EBD73;--border:rgba(246,241,231,0.07);--border2:rgba(246,241,231,0.13)}
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
.nav-cta:hover{opacity:.85}
.burger{display:none;flex-direction:column;gap:5px;cursor:pointer;padding:8px;background:none;border:none}
.burger span{display:block;width:22px;height:1.5px;background:var(--ink);transition:all .3s}
.burger.open span:nth-child(1){transform:translateY(6.5px) rotate(45deg)}
.burger.open span:nth-child(2){opacity:0}
.burger.open span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg)}
.mob-menu{display:none;position:fixed;inset:0;top:60px;background:var(--bg);z-index:99;flex-direction:column;padding:40px 32px;gap:24px}
.mob-menu.open{display:flex}
.mob-menu a{font-size:17px;color:var(--ink2);text-decoration:none;border-bottom:1px solid var(--border);padding-bottom:20px}
/* HERO */
.hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:100px 48px 80px;text-align:center;position:relative;overflow:hidden}
.hero-glow{position:absolute;top:-20%;left:50%;transform:translateX(-50%);width:700px;height:500px;background:radial-gradient(ellipse,rgba(217,68,43,0.13) 0%,transparent 60%);pointer-events:none}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:36px;display:flex;align-items:center;gap:12px;justify-content:center}
.eyebrow::before,.eyebrow::after{content:'';width:28px;height:1px;background:var(--red);opacity:.5}
h1{font-family:'Newsreader',serif;font-size:clamp(44px,7vw,96px);font-weight:200;line-height:1.02;letter-spacing:-3px;color:var(--ink);max-width:900px}
h1 i{font-style:italic;color:var(--red)}
.hero-sub{margin-top:28px;font-size:clamp(15px,1.8vw,18px);color:var(--ink3);font-weight:300;line-height:1.7;max-width:520px}
.hero-cta{margin-top:44px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-p{font-size:14px;font-weight:600;background:var(--red);color:var(--ink);padding:13px 28px;border-radius:6px;text-decoration:none;transition:opacity .2s,transform .15s;cursor:pointer;border:none}
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
.sec-inner{max-width:1100px;margin:0 auto}
.sec-label{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:20px}
h2{font-family:'Newsreader',serif;font-size:clamp(32px,4.5vw,56px);font-weight:200;letter-spacing:-1.5px;line-height:1.1;margin-bottom:24px}
h2 i{font-style:italic;color:var(--red)}
.sec-sub{font-size:16px;color:var(--ink3);line-height:1.7;max-width:560px}
/* PROBLEMS */
.prob-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1px;border:1px solid var(--border);margin-top:56px}
.prob-card{background:var(--bg3);padding:36px 28px}
.prob-icon{font-size:28px;margin-bottom:16px}
.prob-title{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:8px}
.prob-desc{font-size:13px;color:var(--ink3);line-height:1.6}
/* FEATURES */
.feat-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:56px}
.feat-card{background:var(--bg3);padding:40px 36px;position:relative;overflow:hidden}
.feat-card.full{grid-column:1/-1}
.feat-num{font-family:'Newsreader',serif;font-size:80px;font-weight:200;color:var(--border2);position:absolute;top:-10px;right:24px;line-height:1;pointer-events:none}
.feat-label{font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--red);margin-bottom:12px}
.feat-title{font-family:'Newsreader',serif;font-size:clamp(20px,2.5vw,28px);font-weight:200;color:var(--ink);margin-bottom:10px;letter-spacing:-.5px}
.feat-desc{font-size:13px;color:var(--ink3);line-height:1.7;max-width:440px}
.feat-tag{display:inline-block;margin-top:14px;font-size:11px;font-weight:600;color:var(--green);background:rgba(110,189,115,.1);padding:4px 10px;border-radius:3px}
/* USECASES */
.use-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;margin-top:52px}
.use-card{border:1px solid var(--border);padding:28px 24px;border-radius:4px;transition:border-color .2s}
.use-card:hover{border-color:var(--border2)}
.use-icon{font-size:24px;margin-bottom:12px}
.use-title{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px}
.use-desc{font-size:12px;color:var(--ink3);line-height:1.6}
/* COMPARE */
.compare-wrap{margin-top:52px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:14px 20px;text-align:left;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);border-bottom:1px solid var(--border)}
td{padding:14px 20px;border-bottom:1px solid var(--border);color:var(--ink2)}
tr:last-child td{border-bottom:none}
td:first-child{color:var(--ink);font-weight:500}
.ck{color:var(--green);font-weight:700}
.no{color:var(--ink3)}
.hl td{background:rgba(217,68,43,0.05)}
.hl td:first-child{color:var(--red)}
/* PRICING */
.price-box{background:var(--bg3);border:1px solid var(--border2);padding:48px;max-width:520px;margin:52px auto 0}
.price-main{font-family:'Newsreader',serif;font-size:clamp(48px,7vw,72px);font-weight:200;letter-spacing:-2px;color:var(--ink)}
.price-main span{font-size:18px;color:var(--ink3);font-family:'Inter Tight',sans-serif}
.price-items{margin-top:24px;display:flex;flex-direction:column;gap:10px}
.price-row{display:flex;justify-content:space-between;font-size:13px;color:var(--ink3);padding-bottom:10px;border-bottom:1px solid var(--border)}
.price-row:last-child{border-bottom:none}
.price-row b{color:var(--ink)}
/* FORM */
.form-wrap{background:var(--bg3);border:1px solid var(--border);padding:52px;max-width:600px;margin:0 auto}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.form-input{width:100%;background:var(--bg2);border:1px solid var(--border2);color:var(--ink);font-family:'Inter Tight',sans-serif;font-size:14px;padding:12px 16px;outline:none;border-radius:3px;transition:border-color .2s}
.form-input:focus{border-color:rgba(246,241,231,.3)}
.form-input::placeholder{color:var(--ink3)}
.form-label{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin-bottom:6px;display:block}
.form-field{display:flex;flex-direction:column;margin-bottom:0}
.priv{display:flex;align-items:flex-start;gap:10px;font-size:12px;color:var(--ink3);margin-top:6px;margin-bottom:20px;line-height:1.5}
.priv a{color:var(--ink3);text-decoration:underline}
.priv input{margin-top:3px;flex-shrink:0}
.lead-ok{display:none;text-align:center;padding:40px 20px}
.lead-ok-icon{font-size:48px;margin-bottom:16px}
.lead-ok h3{font-family:'Newsreader',serif;font-size:28px;font-weight:200;color:var(--ink);margin-bottom:10px}
.lead-ok p{font-size:14px;color:var(--ink3)}
/* FI animations */
.fi{opacity:0;transform:translateY(24px);transition:opacity .6s ease,transform .6s ease}
.fi.on{opacity:1;transform:none}
/* FOOTER */
footer{border-top:1px solid var(--border);padding:40px 48px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.foot-logo{font-family:'Newsreader',serif;font-size:17px;font-weight:300;color:var(--ink3);text-decoration:none}
.foot-logo b{color:var(--red);font-weight:300}
.foot-links{display:flex;gap:20px}
.foot-links a{font-size:12px;color:var(--ink3);text-decoration:none;transition:color .2s}
.foot-links a:hover{color:var(--ink)}
@media(max-width:800px){
  nav{padding:0 20px}
  .nav-links{display:none}
  .burger{display:flex}
  .hero{padding:80px 24px 60px}
  h1{letter-spacing:-1.5px}
  .strip{flex-wrap:wrap}
  .strip-item{min-width:50%;border-right:none;border-bottom:1px solid var(--border)}
  section{padding:64px 24px}
  .feat-grid{grid-template-columns:1fr}
  .feat-card.full{grid-column:auto}
  .form-grid{grid-template-columns:1fr}
  footer{flex-direction:column;align-items:flex-start;padding:32px 24px}
  .price-box{padding:32px 24px}
  .form-wrap{padding:32px 24px}
}
` }} />

      {/* FUENTES */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,200;0,300;1,200;1,300&family=Inter+Tight:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* META */}
      <title>TPV para Eventos y Catering sin Comisión | ia.rest</title>
      <meta name="description" content="Gestiona eventos, bodas, caterings y festivales gastronómicos con TPV por voz. Cobro móvil, múltiples puntos de venta y sin comisión. Desde 59€/mes." />

      {/* NAV */}
      <nav>
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <div className="nav-links">
          <a href="#solución">Solución</a>
          <a href="#casos">Casos de uso</a>
          <a href="#precio">Precio</a>
          <a href="#demo" className="nav-cta">Pedir demo</a>
        </div>
        <button className="burger" id="burger" aria-label="Menú">
          <span/><span/><span/>
        </button>
      </nav>

      {/* MOB MENU */}
      <div className="mob-menu" id="mobMenu">
        <a href="#solución">Solución</a>
        <a href="#casos">Casos de uso</a>
        <a href="#precio">Precio</a>
        <a href="#demo" className="btn-p" style={{textAlign:"center"}}>Pedir demo gratuita</a>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="eyebrow">TPV para eventos y catering</div>
        <h1>El TPV que no<br/>te cobra <i>comisión</i><br/>en cada evento</h1>
        <p className="hero-sub">
          Gestiona bodas, festivales, caterings y eventos corporativos desde un único sistema.
          Voz, cobro móvil y control en tiempo real.
        </p>
        <div className="hero-cta">
          <a href="#demo" className="btn-p">Solicitar demo gratuita</a>
          <a href="/" className="btn-s">Ver el sistema completo</a>
        </div>
      </section>

      {/* STRIP */}
      <div className="strip fi">
        <div className="strip-item">
          <span className="strip-num"><b>0%</b></span>
          <span className="strip-lbl">Comisión por evento</span>
        </div>
        <div className="strip-item">
          <span className="strip-num"><b>∞</b></span>
          <span className="strip-lbl">Puntos de venta simultáneos</span>
        </div>
        <div className="strip-item">
          <span className="strip-num">59<b>€</b></span>
          <span className="strip-lbl">Al mes, todo incluido</span>
        </div>
        <div className="strip-item">
          <span className="strip-num">14<b>d</b></span>
          <span className="strip-lbl">Trial gratuito</span>
        </div>
      </div>

      {/* EL PROBLEMA */}
      <section id="problema" style={{background:"var(--bg2)"}}>
        <div className="sec-inner">
          <div className="sec-label fi">El problema</div>
          <h2 className="fi">Gestionar un evento<br/>no debería ser <i>tan caótico</i></h2>
          <p className="sec-sub fi">
            Múltiples puntos de venta, camareros corriendo, comandas en papel y sin visión global de lo que ocurre.
          </p>
          <div className="prob-grid fi">
            {[
              { icon:"📋", title:"Comandas en papel", desc:"Errores, pérdidas y tiempos muertos que ralentizan el servicio en momentos críticos." },
              { icon:"💸", title:"Comisión por transacción", desc:"Tu software de gestión de eventos te cobra un % de cada cobro. ia.rest nunca." },
              { icon:"📡", title:"Sin visión en tiempo real", desc:"No sabes qué mesa va lenta, qué barra está colapsada o qué producto vuela." },
              { icon:"🔌", title:"Sistemas desconectados", desc:"TPV, almacén, facturación y contabilidad en herramientas distintas que no hablan entre sí." },
            ].map((p, i) => (
              <div className="prob-card" key={i}>
                <div className="prob-icon">{p.icon}</div>
                <div className="prob-title">{p.title}</div>
                <div className="prob-desc">{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOLUCIÓN */}
      <section id="solución">
        <div className="sec-inner">
          <div className="sec-label fi">La solución</div>
          <h2 className="fi">Todo lo que necesitas<br/>para <i>cualquier evento</i></h2>
          <div className="feat-grid fi">
            <div className="feat-card">
              <div className="feat-num">01</div>
              <div className="feat-label">Comandas por voz</div>
              <div className="feat-title">Dicta. La IA entiende.</div>
              <div className="feat-desc">El camarero habla al móvil y la comanda llega al KDS en segundos. Funciona con ruido de ambiente, varios idiomas y nombres de platos en español.</div>
              <span className="feat-tag">✓ Sin tocar pantalla</span>
            </div>
            <div className="feat-card">
              <div className="feat-num">02</div>
              <div className="feat-label">Puntos de venta múltiples</div>
              <div className="feat-title">Barra, mesas y barra libre simultáneas.</div>
              <div className="feat-desc">Añade tantos dispositivos como necesites. Cada punto de venta opera de forma independiente y todo converge en un panel de control unificado.</div>
              <span className="feat-tag">✓ Sin límite de dispositivos</span>
            </div>
            <div className="feat-card">
              <div className="feat-num">03</div>
              <div className="feat-label">Cobro móvil</div>
              <div className="feat-title">Cobra en cualquier punto del recinto.</div>
              <div className="feat-desc">Efectivo, tarjeta, Bizum o QR en mesa. El camarero cierra la cuenta desde su móvil, VeriFactu genera la factura automáticamente y el almacén se actualiza solo.</div>
              <span className="feat-tag">✓ Facturación legal incluida</span>
            </div>
            <div className="feat-card">
              <div className="feat-num">04</div>
              <div className="feat-label">Control de stock en eventos</div>
              <div className="feat-title">Sabe exactamente qué queda en barra.</div>
              <div className="feat-desc">Carga el stock antes del evento. El sistema descuenta automáticamente con cada venta y te avisa cuando un producto está por agotarse.</div>
              <span className="feat-tag">✓ Alertas en tiempo real</span>
            </div>
            <div className="feat-card full">
              <div className="feat-num">05</div>
              <div className="feat-label">Analytics en tiempo real</div>
              <div className="feat-title">Panel completo: ventas por barra, por producto y por hora.</div>
              <div className="feat-desc">Compara barras, detecta cuellos de botella y toma decisiones durante el evento. Al terminar, exporta el cierre contable listo para tu asesor en formato A3, Sage o Holded.</div>
              <span className="feat-tag">✓ Exportación contable incluida</span>
            </div>
          </div>
        </div>
      </section>

      {/* CASOS DE USO */}
      <section id="casos" style={{background:"var(--bg2)"}}>
        <div className="sec-inner">
          <div className="sec-label fi">Casos de uso</div>
          <h2 className="fi">Para cada tipo<br/>de <i>evento</i></h2>
          <div className="use-grid fi">
            {[
              { icon:"💍", title:"Bodas y celebraciones", desc:"Cocktail, banquete y barra libre en un solo sistema. Sin comisión por cubierto." },
              { icon:"🎵", title:"Festivales gastronómicos", desc:"Múltiples puestos con control centralizado. Stock sincronizado en tiempo real." },
              { icon:"🏢", title:"Eventos corporativos", desc:"Catering de empresa con facturación inmediata y exportación a tu asesoría." },
              { icon:"🚚", title:"Food trucks y catering móvil", desc:"Lleva el TPV donde vayas. Solo necesitas el móvil y conexión." },
              { icon:"🎉", title:"Fiestas privadas", desc:"Gestiona barra libre, menú cerrado o carta completa sin cambiar de herramienta." },
              { icon:"🏖️", title:"Chiringuitos de temporada", desc:"Arranca en 15 minutos. Sin contratos anuales ni letra pequeña." },
            ].map((u, i) => (
              <div className="use-card" key={i}>
                <div className="use-icon">{u.icon}</div>
                <div className="use-title">{u.title}</div>
                <div className="use-desc">{u.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARATIVA */}
      <section>
        <div className="sec-inner">
          <div className="sec-label fi">Comparativa</div>
          <h2 className="fi">ia.rest frente<br/>a la <i>competencia</i></h2>
          <div className="compare-wrap fi">
            <table>
              <thead>
                <tr>
                  <th>Funcionalidad</th>
                  <th style={{color:"var(--red)"}}>ia.rest</th>
                  <th>MyChefTool</th>
                  <th>Sipos Eventos</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Comandas por voz IA",         "✓","—","—"],
                  ["Sin comisión por transacción", "✓","—","—"],
                  ["Puntos de venta ilimitados",   "✓","Límite","Límite"],
                  ["KDS cocina integrado",         "✓","✓","—"],
                  ["Control stock en tiempo real", "✓","✓","—"],
                  ["Facturación VeriFactu",        "✓","—","—"],
                  ["Exportación contable A3/Sage", "✓","—","—"],
                  ["Trial 14 días gratis",         "✓","—","—"],
                  ["Precio base mensual",          "59€","99€","Consultar"],
                ].map(([feat, a, b, c], i) => (
                  <tr key={i} className={a==="✓" && b==="—" && c==="—" ? "hl" : ""}>
                    <td>{feat}</td>
                    <td className={a==="✓"?"ck":"no"}>{a}</td>
                    <td className={b==="✓"?"ck":"no"}>{b}</td>
                    <td className={c==="✓"?"ck":"no"}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PRECIO */}
      <section id="precio" style={{background:"var(--bg2)"}}>
        <div className="sec-inner" style={{textAlign:"center"}}>
          <div className="sec-label fi">Precio</div>
          <h2 className="fi">Sin sorpresas.<br/>Sin <i>comisión</i>.</h2>
          <div className="price-box fi">
            <div style={{fontSize:12,fontWeight:600,letterSpacing:".15em",textTransform:"uppercase",color:"var(--ink3)",marginBottom:12}}>Desde</div>
            <div className="price-main">59<span>€/mes</span></div>
            <p style={{fontSize:13,color:"var(--ink3)",marginTop:12,lineHeight:1.6}}>
              Todo incluido. Sin comisión por evento ni por transacción.
            </p>
            <div className="price-items" style={{marginTop:28}}>
              <div className="price-row"><span>Base (1 usuario)</span><b>59€/mes</b></div>
              <div className="price-row"><span>Usuarios adicionales (2–6)</span><b>+20€/u/mes</b></div>
              <div className="price-row"><span>Usuarios adicionales (7+)</span><b>+15€/u/mes</b></div>
              <div className="price-row"><span>Add-on QR en mesa</span><b>+12€/mesa/mes</b></div>
              <div className="price-row"><span>Descuento anual</span><b>−18%</b></div>
              <div className="price-row"><span>Trial gratuito</span><b>14 días</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* DEMO FORM */}
      <section id="demo">
        <div className="sec-inner" style={{textAlign:"center"}}>
          <div className="sec-label fi">Demo gratuita</div>
          <h2 className="fi">Pruébalo en<br/>tu próximo <i>evento</i></h2>
          <p className="sec-sub fi" style={{margin:"0 auto 48px"}}>
            Te mostramos ia.rest en acción en menos de 20 minutos. Sin compromiso.
          </p>
          <div className="form-wrap fi">
            <div id="leadForm">
              <input type="text" id="website" name="website" style={{display:"none"}} tabIndex={-1} autoComplete="off" />
              <div className="form-grid">
                <div className="form-field">
                  <label className="form-label" htmlFor="nombre">Tu nombre</label>
                  <input className="form-input" id="nombre" type="text" placeholder="Ana García" />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="empresa">Empresa / Evento</label>
                  <input className="form-input" id="empresa" type="text" placeholder="Catering Mediterráneo S.L." />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="email">Email</label>
                  <input className="form-input" id="email" type="email" placeholder="ana@catering.es" />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="telefono">Teléfono (opcional)</label>
                  <input className="form-input" id="telefono" type="tel" placeholder="+34 600 000 000" />
                </div>
              </div>
              <div className="priv">
                <input type="checkbox" id="privacidad" />
                <label htmlFor="privacidad">
                  Acepto la <a href="/privacidad" target="_blank">política de privacidad</a> y
                  que ia.rest contacte conmigo para la demo solicitada.
                </label>
              </div>
              <button id="submitBtn" className="btn-p" style={{width:"100%",fontSize:15,padding:"15px 28px"}}
                onClick={() => (window as any).enviarEvento?.()}>
                Solicitar demo gratuita →
              </button>
              <p style={{marginTop:14,fontSize:11,color:"var(--ink3)"}}>
                Sin tarjeta. Sin permanencia. Respuesta en menos de 24h.
              </p>
            </div>
            <div className="lead-ok" id="leadOk">
              <div className="lead-ok-icon">✓</div>
              <h3>¡Solicitud recibida!</h3>
              <p>Te contactamos en menos de 24 horas para coordinar la demo.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <a href="/" className="foot-logo">ia<b>.</b>rest</a>
        <div className="foot-links">
          <a href="/privacidad">Privacidad</a>
          <a href="/legal">Aviso legal</a>
          <a href="/contacto">Contacto</a>
          <a href="mailto:hola@iarest.es">hola@iarest.es</a>
        </div>
      </footer>
    </>
  )
}
