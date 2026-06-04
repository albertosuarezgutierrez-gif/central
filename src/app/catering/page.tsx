"use client"
import { useEffect } from "react"
import LandingClickTracker from "@/components/LandingClickTracker"

export default function CateringPage() {
  useEffect(() => {
    // FAQ
    document.querySelectorAll('.fq-q, .faq-q').forEach((b: any) => {
      b.addEventListener('click', () => {
        const i = b.closest('.fq-item, .faq-item'), o = i?.classList.contains('open')
        document.querySelectorAll('.fq-item, .faq-item').forEach((x: any) => x.classList.remove('open'))
        if (!o) i?.classList.add('open')
      })
    })

    // ---- DEMO FLUJO ----
    const stepData = [
      { l1:'Tiempo de respuesta', v1:{t:'4 min',c:'g'}, s1:'Desde solicitud recibida', l2:'Presupuesto', v2:{t:'12.400€',c:''}, s2:'Boda · 180 comensales · Valencia', l3:'ia.rest hace', v3:{t:'Portal activo',c:''}, s3:'El cliente ya puede ver su presupuesto' },
      { l1:'Estado', v1:{t:'Firmado',c:'g'}, s1:'Contrato digital desde el móvil', l2:'APPCC', v2:{t:'Generado',c:'g'}, s2:'14 alérgenos declarados automáticamente', l3:'ia.rest hace', v3:{t:'Contrato auto',c:''}, s3:'Sin imprimir, sin escanear nada' },
      { l1:'Coste ingredientes', v1:{t:'3.720€',c:'a'}, s1:'Escandallo × 180 personas', l2:'Rappel aplicado', v2:{t:'— 186€',c:'g'}, s2:'Descuento proveedor automático', l3:'Coste real', v3:{t:'3.534€',c:'g'}, s3:'Pedido generado a 3 proveedores' },
      { l1:'Stock', v1:{t:'100%',c:'g'}, s1:'Mercancía recibida · OCR albarán', l2:'Albarán vs pedido', v2:{t:'Cuadra',c:'g'}, s2:'3-way match automático', l3:'Roturas previstas', v3:{t:'0',c:'g'}, s3:'Almacén listo para el evento' },
      { l1:'Margen en vivo', v1:{t:'71,5%',c:'g'}, s1:'Calculado en tiempo real', l2:'Desviación', v2:{t:'+ 81€',c:'a'}, s2:'vs escandallo previsto', l3:'ia.rest', v3:{t:'Voz + KDS',c:''}, s3:'Camareros y cocina conectados' },
      { l1:'Beneficio neto', v1:{t:'8.785€',c:'g'}, s1:'Este evento · Real', l2:'Margen final', v2:{t:'70,8%',c:'g'}, s2:'vs 71,5% previsto', l3:'VeriFactu', v3:{t:'Emitida',c:'g'}, s3:'Factura #2026-0089 · QR AEAT ✓' }
    ]
    let cur = 0
    const steps: any[] = Array.from(document.querySelectorAll('.fstep'))
    const fpFill = document.getElementById('fpFill')

    function goTo(n: number) {
      cur = n
      steps.forEach((s: any, i: number) => {
        s.classList.remove('active','done')
        if (i < n) s.classList.add('done')
        if (i === n) s.classList.add('active')
      })
      if (fpFill) fpFill.style.width = Math.round(((n+1)/steps.length)*100)+'%'
      const d = stepData[n]
      if (!d) return
      const inner = document.getElementById('fpInner')
      if (inner) { inner.style.animation='none'; void inner.offsetWidth; inner.style.animation='' }
      ;[1,2,3].forEach((col: number) => {
        const lbl = document.getElementById('fp-lbl'+col)
        const val = document.getElementById('fp-val'+col)
        const sub = document.getElementById('fp-sub'+col)
        if (lbl) lbl.textContent = (d as any)['l'+col]
        if (val) { val.textContent = (d as any)['v'+col].t; val.className = 'fpanel-col-val'+((d as any)['v'+col].c ? ' '+(d as any)['v'+col].c : '') }
        if (sub) sub.textContent = (d as any)['s'+col]
      })
    }

    steps.forEach((s: any, i: number) => s.addEventListener('click', () => { clearInterval(autoTimer); goTo(i) }))

    let autoTimer: any = null
    let started = false

    const stepsEl = document.getElementById('steps')
    const io = new IntersectionObserver((entries: any[]) => {
      entries.forEach((e: any) => {
        if (e.isIntersecting && !started) {
          started = true
          goTo(0)
          autoTimer = setInterval(() => {
            cur = (cur+1) % steps.length
            goTo(cur)
            if (cur === steps.length-1) {
              clearInterval(autoTimer)
              setTimeout(() => {
                autoTimer = setInterval(() => {
                  cur = (cur+1) % steps.length
                  goTo(cur)
                  if (cur === steps.length-1) clearInterval(autoTimer)
                }, 2200)
              }, 3000)
            }
          }, 2200)
        }
        e.target.classList.add('on')
      })
    }, { threshold: 0.3 })
    if (stepsEl) io.observe(stepsEl)

    const io2 = new IntersectionObserver((entries: any[]) => {
      entries.forEach((e: any) => { if(e.isIntersecting){ e.target.classList.add('on'); io2.unobserve(e.target) } })
    }, { threshold: 0.08 })
    document.querySelectorAll('.fi').forEach((el: any) => { if(el.id!=='steps') io2.observe(el) })

    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach((l: any) => {
      l.addEventListener('click', (e: any) => {
        e.preventDefault()
        const t = document.querySelector(l.getAttribute('href'))
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })


    // Form catering
    async function enviarCatering() {
      const n = (document.getElementById('cnombre') as HTMLInputElement)?.value.trim()
      const em = (document.getElementById('cemail') as HTMLInputElement)?.value.trim()
      const tf = (document.getElementById('ctelefono') as HTMLInputElement)?.value.trim()
      const emp = (document.getElementById('cempresa') as HTMLInputElement)?.value.trim()
      const hp = (document.getElementById('cw') as HTMLInputElement)?.value
      const priv = document.getElementById('crgpd') as HTMLInputElement
      if (hp) return
      if (!n || !em) { alert('Rellena los campos obligatorios (nombre y email).'); return }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { alert('Email no válido.'); return }
      if (!priv?.checked) { alert('Acepta la política de privacidad.'); return }
      const btn = document.getElementById('csubmit') as HTMLButtonElement
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...' }
      try {
        await fetch('/api/leads/landing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: n, restaurante: emp || 'Empresa de catering', email: em, telefono: tf, origen: 'landing-catering' })
        })
      } catch(_) {}
      const fb = document.getElementById('cateringFormBody')
      const ok = document.getElementById('cateringOK')
      if (fb) fb.style.display = 'none'
      if (ok) ok.style.display = 'block'
    }
    ;(window as any).enviarCatering = enviarCatering

    // Hero briefing → presupuesto — animación en bucle
    let cCancelled = false
    const cWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    async function cRun() {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('#cbriefing .cbf-row'))
      const calc = document.getElementById('ccalc')
      const quoteLabel = document.getElementById('cquoteLabel')
      const quote = document.getElementById('cquote')
      const margin = document.getElementById('cmargin')
      if (!calc || !quoteLabel || !quote || !margin || rows.length === 0) return
      while (!cCancelled) {
        rows.forEach((r) => r.classList.remove('show'))
        calc.classList.remove('show'); quoteLabel.style.opacity = '0'
        quote.classList.remove('show'); margin.classList.remove('show')
        await cWait(700); if (cCancelled) return
        for (const r of rows) { r.classList.add('show'); await cWait(520); if (cCancelled) return }
        await cWait(400); calc.classList.add('show'); await cWait(1500); if (cCancelled) return
        calc.classList.remove('show'); quoteLabel.style.opacity = '1'; await cWait(250)
        quote.classList.add('show'); await cWait(700); margin.classList.add('show')
        await cWait(3600); if (cCancelled) return
      }
    }
    cRun()

    return () => { io.disconnect(); io2.disconnect(); cCancelled = true }
  }, [])

  return (
    <>
      <LandingClickTracker />
      <title>Software para Empresas de Catering en España | ia.rest</title>
      <meta name="description" content="ia.rest: presupuesto, portal cliente, APPCC, control de costes y VeriFactu. El ciclo completo de tu catering, automatizado. Desde 59€/mes." />
      <link rel="canonical" href="https://www.iarest.es/catering" />
      <meta property="og:title" content="Software para Catering | ia.rest" />
      <meta property="og:description" content="Del presupuesto a la caja. ia.rest gestiona el ciclo completo de tu catering." />
      <meta property="og:url" content="https://www.iarest.es/catering" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://www.iarest.es/og-catering.jpg" />
      <meta property="og:locale" content="es_ES" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content="https://www.iarest.es/og-catering.jpg" />
      <style dangerouslySetInnerHTML={{ __html: `:root{
  --bg:#14110E;--bg2:#111009;--bg3:#1C1814;
  --ink:#F6F1E7;--ink2:#D8CDB6;--ink3:#6B6054;
  --red:#D9442B;--red2:#A8311E;
  --amber:#E8A33B;--green:#6EBD73;
  --border:rgba(246,241,231,0.07);--border2:rgba(246,241,231,0.13);
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

/* HERO */
.hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:100px 48px 80px;text-align:center;position:relative;overflow:hidden}
.hero-glow{position:absolute;top:-20%;left:50%;transform:translateX(-50%);width:700px;height:500px;background:radial-gradient(ellipse,rgba(217,68,43,0.13) 0%,transparent 60%);pointer-events:none}
.eyebrow{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:36px;display:flex;align-items:center;gap:12px;justify-content:center}
.eyebrow::before,.eyebrow::after{content:'';width:28px;height:1px;background:var(--red);opacity:.5}
h1{font-family:'Newsreader',serif;font-size:clamp(50px,8vw,104px);font-weight:200;line-height:1.02;letter-spacing:-3px;color:var(--ink);max-width:900px}
h1 i{font-style:italic;color:var(--red)}
.hero-sub{margin-top:28px;font-size:clamp(15px,1.8vw,18px);color:var(--ink3);font-weight:300;line-height:1.7;max-width:540px}
.hero-cta{margin-top:44px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-p{font-size:14px;font-weight:600;background:var(--red);color:var(--ink);padding:13px 28px;border-radius:6px;text-decoration:none;transition:opacity .2s,transform .15s;cursor:pointer;border:none;font-family:'Inter Tight',sans-serif}
.btn-p:hover{opacity:.85;transform:translateY(-1px)}
.btn-s{font-size:14px;color:var(--ink3);padding:13px 24px;border:1px solid var(--border2);border-radius:6px;text-decoration:none;transition:color .2s,border-color .2s;cursor:pointer;background:none;font-family:'Inter Tight',sans-serif}
.btn-s:hover{color:var(--ink);border-color:rgba(246,241,231,.2)}
.btn-wa{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;background:#25D366;color:#0B3D2E;padding:13px 22px;border-radius:6px;text-decoration:none;cursor:pointer;border:none;font-family:'Inter Tight',sans-serif;transition:opacity .2s,transform .15s}
.btn-wa:hover{opacity:.9;transform:translateY(-1px)}
.btn-wa svg{flex-shrink:0}

/* HERO 2-COL + DEMO BRIEFING */
.hero-inner{display:grid;grid-template-columns:1.02fr .98fr;gap:52px;align-items:center;max-width:1180px;margin:0 auto;width:100%;position:relative;z-index:2}
.hero-copy{text-align:left}
.hero-copy .eyebrow{justify-content:flex-start}
.hero-copy h1{max-width:none}
.hero-copy .hero-sub{margin-left:0}
.hero-copy .hero-cta{justify-content:flex-start}
.hero-demo{position:relative}
.demo-badge{position:absolute;top:-13px;right:14px;z-index:3;background:var(--bg3);border:1px solid var(--border2);border-radius:20px;padding:5px 14px;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);display:flex;align-items:center;gap:7px}
.demo-badge .ddot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:cpulse 1.8s infinite}
@keyframes cpulse{0%{box-shadow:0 0 0 0 rgba(110,189,115,.5)}70%{box-shadow:0 0 0 7px rgba(110,189,115,0)}100%{box-shadow:0 0 0 0 rgba(110,189,115,0)}}
.cpanel{background:#0C0A08;border:1px solid var(--border2);border-radius:14px;overflow:hidden;box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
.cp-bar{padding:13px 16px;background:#111009;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center}
.cp-bar .cvd{width:9px;height:9px;border-radius:50%}.cp-bar .cvdr{background:#ff5f57}.cp-bar .cvdy{background:#ffbd2e}.cp-bar .cvdg{background:#28ca41}
.cp-title{margin-left:10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink3)}
.cp-body{padding:20px 20px 22px;min-height:360px}
.cstep-label{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.cstep-label .cln{flex:1;height:1px;background:var(--border)}
.cbf{display:flex;flex-direction:column;gap:9px;margin-bottom:16px}
.cbf-row{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s}
.cbf-row.show{opacity:1;transform:none}
.cbf-k{font-size:12px;color:var(--ink3)}
.cbf-v{font-size:14px;color:var(--ink);font-weight:500}
.ccalc{display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--amber);margin:6px 0 14px;opacity:0;transition:opacity .4s}
.ccalc.show{opacity:1}
.ccalc .cspin{width:12px;height:12px;border:1.5px solid rgba(232,163,59,.3);border-top-color:var(--amber);border-radius:50%;animation:cspin .7s linear infinite}
@keyframes cspin{to{transform:rotate(360deg)}}
.cquote{border:1px solid rgba(217,68,43,.2);border-radius:11px;overflow:hidden;opacity:0;transform:translateY(10px);transition:opacity .45s,transform .45s}
.cquote.show{opacity:1;transform:none}
.cq-line{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);font-size:13px;color:var(--ink2)}
.cq-line .cqc{font-family:'JetBrains Mono',monospace;color:var(--ink);font-size:13px}
.cq-total{display:flex;justify-content:space-between;align-items:center;padding:15px 16px;background:rgba(217,68,43,0.06)}
.cq-total .ctl{font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em}
.cq-total .ctr{font-family:'Newsreader',serif;font-size:32px;font-weight:200;color:var(--ink);letter-spacing:-1px}
.cmargin{margin-top:12px;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(110,189,115,.08);border:1px solid rgba(110,189,115,.25);border-radius:9px;opacity:0;transition:opacity .45s}
.cmargin.show{opacity:1}
.cmargin .cml{font-size:12px;color:var(--ink2)}
.cmargin .cmr{font-family:'Newsreader',serif;font-size:26px;color:var(--green);font-weight:300}

/* STRIP */
.strip{border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex}
.strip-item{flex:1;padding:32px 0;text-align:center;border-right:1px solid var(--border)}
.strip-item:last-child{border-right:none}
.strip-num{display:block;font-family:'Newsreader',serif;font-size:clamp(26px,4vw,42px);font-weight:200;color:var(--ink);letter-spacing:-1px}
.strip-num b{color:var(--red);font-weight:200}
.strip-lbl{display:block;margin-top:5px;font-size:10px;color:var(--ink3);font-weight:500;letter-spacing:.1em;text-transform:uppercase}

/* SECCIÓN COSTES VISUAL */
.costes{background:var(--bg2);padding:100px 48px}
.w{max-width:1100px;margin:0 auto}
.s-label{font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--red);margin-bottom:20px}
h2{font-family:'Newsreader',serif;font-size:clamp(34px,5vw,62px);font-weight:200;letter-spacing:-2px;color:var(--ink);line-height:1.05}
h2 i{font-style:italic;color:var(--red)}

/* Grid de tarjetas de coste */
.cost-cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-top:60px;background:var(--border);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.cost-card{background:var(--bg2);padding:36px 28px;transition:background .2s}
.cost-card:hover{background:var(--bg3)}
.cost-card-label{font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--ink3);margin-bottom:20px}
.cost-card-num{font-family:'Newsreader',serif;font-size:clamp(40px,5vw,64px);font-weight:200;letter-spacing:-2px;line-height:1;margin-bottom:8px}
.cost-card-num.g{color:var(--green)}
.cost-card-num.r{color:var(--red)}
.cost-card-num.a{color:var(--amber)}
.cost-card-desc{font-size:13px;color:var(--ink3);line-height:1.6}
.cost-card-sub{font-size:11px;color:var(--ink3);margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-family:'JetBrains Mono',monospace}

/* SECCIÓN FLUJO — timeline horizontal */
.flujo{background:var(--bg);padding:100px 48px}
.flujo-header{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:end;margin-bottom:64px}
.flujo-steps{display:flex;gap:0;position:relative}
.flujo-steps::before{content:'';position:absolute;top:19px;left:0;right:0;height:1px;background:var(--border2)}
.fstep{flex:1;padding-right:20px;position:relative;z-index:1;cursor:pointer}
.fstep-dot{width:38px;height:38px;border-radius:50%;background:var(--bg2);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-family:'Newsreader',serif;font-size:13px;color:var(--ink3);margin-bottom:20px;transition:all .35s cubic-bezier(.4,0,.2,1);flex-shrink:0}
.fstep.active .fstep-dot{background:var(--red);border-color:var(--red);color:var(--ink);box-shadow:0 0 20px rgba(217,68,43,.35)}
.fstep.done .fstep-dot{background:rgba(110,189,115,.12);border-color:var(--green);color:var(--green)}
.fstep-title{font-size:13px;font-weight:600;color:var(--ink3);transition:color .3s;letter-spacing:-.1px;line-height:1.35;margin-bottom:4px}
.fstep.active .fstep-title{color:var(--ink)}
.fstep.done .fstep-title{color:var(--ink3)}
.fstep-sub{font-size:11px;color:var(--ink3);line-height:1.5;opacity:0;transition:opacity .3s}
.fstep.active .fstep-sub{opacity:1;color:var(--red)}

/* Panel inferior del flujo */
.flujo-panel{margin-top:48px;background:var(--bg2);border:1px solid var(--border2);border-radius:14px;overflow:hidden;min-height:180px}
.fpanel-inner{padding:32px 36px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;animation:panelIn .4s cubic-bezier(.4,0,.2,1)}
@keyframes panelIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start}
.form-card{background:var(--bg2);border:1px solid var(--border2);border-radius:16px;overflow:hidden}
.form-top{padding:28px 32px 22px;border-bottom:1px solid var(--border)}
.form-top-t{font-family:'Newsreader',serif;font-size:22px;font-weight:300;color:var(--ink);letter-spacing:-.5px;margin-bottom:6px}
.form-top-s{font-size:13px;color:var(--ink3)}
.form-body{padding:24px 32px 28px}
.field{margin-bottom:12px}
.field label{display:block;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin-bottom:6px}
.field input{width:100%;padding:10px 13px;background:rgba(246,241,231,.04);border:1px solid var(--border2);border-radius:7px;color:var(--ink);font-size:14px;font-family:'Inter Tight',sans-serif;outline:none;transition:border-color .2s}.field input:focus{border-color:rgba(217,68,43,.45)}.field input::placeholder{color:var(--ink3)}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.submit-btn{width:100%;padding:13px;background:var(--red);color:var(--ink);border:none;border-radius:7px;font-size:15px;font-weight:700;font-family:'Inter Tight',sans-serif;cursor:pointer;transition:background .2s}.submit-btn:hover{background:var(--red2)}.submit-btn:disabled{opacity:.5;cursor:not-allowed}
.form-foot{padding:13px 32px;border-top:1px solid var(--border);font-size:11px;color:var(--ink3);text-align:center}
.fpanel-col{}
.fpanel-col-label{font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--ink3);margin-bottom:12px}
.fpanel-col-val{font-family:'Newsreader',serif;font-size:28px;font-weight:200;letter-spacing:-1px;line-height:1;margin-bottom:6px}
.fpanel-col-val.g{color:var(--green)}
.fpanel-col-val.a{color:var(--amber)}
.fpanel-col-val.r{color:var(--red)}
.fpanel-col-sub{font-size:12px;color:var(--ink3);line-height:1.5}

/* Progress bar flujo */
.flujo-progress{height:2px;background:var(--border);margin:40px 0 0;overflow:hidden}
.flujo-progress-fill{height:100%;background:linear-gradient(to right,var(--red),rgba(217,68,43,.3));transition:width .5s cubic-bezier(.4,0,.2,1);width:0%}
.cap-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:var(--border);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-top:52px}
.cap-item{background:var(--bg2);padding:28px 22px;transition:background .2s}.cap-item:hover{background:var(--bg3)}
.cap-num{display:block;font-family:'Newsreader',serif;font-size:12px;color:var(--red);font-weight:300;letter-spacing:.05em;margin-bottom:12px}
.cap-title{font-size:14px;font-weight:600;color:var(--ink);letter-spacing:-.1px;margin-bottom:4px}
.cap-sub{font-size:12px;color:var(--ink3)}

/* Animaciones scroll */
.fi{opacity:0;transform:translateY(16px);transition:opacity .65s ease,transform .65s ease}
.fi.d1{transition-delay:.1s}.fi.d2{transition-delay:.2s}.fi.d3{transition-delay:.3s}
.fi.on{opacity:1;transform:none}

/* RESPONSIVE */
@media(max-width:900px){
  nav{padding:0 20px}.nav-links{display:none}
  .hero,.costes,.flujo{padding-left:20px;padding-right:20px}
  .hero-inner{grid-template-columns:1fr;gap:40px}
  .hero-copy{text-align:center}
  .hero-copy .eyebrow{justify-content:center}
  .hero-copy .hero-sub{margin-left:auto;margin-right:auto}
  .hero-copy .hero-cta{justify-content:center}
  .cost-cards{grid-template-columns:1fr}
  .cap-grid{grid-template-columns:1fr 1fr}
  .form-grid{grid-template-columns:1fr;gap:40px}
  .field-row{grid-template-columns:1fr}
  .form-top,.form-body,.form-foot{padding-left:20px;padding-right:20px}
  .flujo-header{grid-template-columns:1fr;gap:32px;margin-bottom:40px}
  .flujo-steps{flex-direction:column;gap:0}
  .flujo-steps::before{display:none}
  .fstep{padding:0;border-bottom:1px solid var(--border)}
  .fstep:last-child{border-bottom:none}
  .fstep-dot{width:32px;height:32px;font-size:11px;margin-bottom:0;margin-right:14px;flex-shrink:0}
  .flujo-steps .fstep{display:flex;align-items:center;padding:16px 0}
  .fstep-title{margin-bottom:0}
  .fstep-sub{display:none}
  .fpanel-inner{grid-template-columns:1fr;gap:20px}
  .strip{flex-wrap:wrap}.strip-item{min-width:50%}
}
@media(max-width:500px){
  h1{letter-spacing:-2px}
  .hero-cta{flex-direction:column}
  .btn-p,.btn-s{text-align:center}
}` }} />
      <div dangerouslySetInnerHTML={{ __html: `<nav>
  <a class="logo" href="/">ia<b>.</b>rest</a>
  <div class="nav-links">
    <a href="/hosteleria">Hostelería</a>
    <a href="/espacios">Espacios</a>
    <a href="#costes">Costes</a>
    <a href="#contacto" class="nav-cta">Demo gratuita →</a>
  </div>
  <button class="burger" id="burger" aria-label="Menú"><span></span><span></span><span></span></button>
</nav>

<div class="mob-menu" id="mobMenu">
  <a href="/hosteleria">Hostelería</a>
  <a href="/espacios">Espacios</a>
  <a href="#costes">Costes</a>
  <a href="#contacto" class="mob-cta">Demo gratuita →</a>
</div>

<!-- HERO -->
<section class="hero">
  <div class="hero-glow"></div>
  <div class="hero-inner">
    <div class="hero-copy">
      <div class="eyebrow fi">Software para catering profesional · España</div>
      <h1 class="fi d1">Sabes cuánto<br>ganas en<br>cada <i>evento.</i></h1>
      <p class="hero-sub fi d2">
        Coste real, margen y beneficio de cada evento. Del presupuesto a la caja, sin sorpresas.
      </p>
      <div class="hero-cta fi d2">
        <a href="#contacto" class="btn-p">Solicitar demo gratuita →</a>
        <a href="https://wa.me/34637349990?text=Hola%2C%20quiero%20una%20demo%20de%20ia.rest%20para%20mi%20catering" target="_blank" rel="noopener" class="btn-wa"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.045zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WhatsApp</a>
      </div>
    </div>
    <div class="hero-demo fi d2">
      <div class="demo-badge"><span class="ddot"></span> En vivo</div>
      <div class="cpanel">
        <div class="cp-bar"><span class="cvd cvdr"></span><span class="cvd cvdy"></span><span class="cvd cvdg"></span><span class="cp-title">presupuesto-evento · briefing</span></div>
        <div class="cp-body">
          <div class="cstep-label"><span>Briefing del cliente</span><span class="cln"></span></div>
          <div class="cbf" id="cbriefing">
            <div class="cbf-row"><span class="cbf-k">Tipo de evento</span><span class="cbf-v">Boda</span></div>
            <div class="cbf-row"><span class="cbf-k">Invitados</span><span class="cbf-v">120</span></div>
            <div class="cbf-row"><span class="cbf-k">Menú</span><span class="cbf-v">Degustación 6 pases</span></div>
            <div class="cbf-row"><span class="cbf-k">Barra libre</span><span class="cbf-v">Premium · 5h</span></div>
          </div>
          <div class="ccalc" id="ccalc"><span class="cspin"></span> Calculando con tus escandallos reales…</div>
          <div class="cstep-label" id="cquoteLabel" style="opacity:0;transition:opacity .4s"><span>Presupuesto generado</span><span class="cln"></span></div>
          <div class="cquote" id="cquote">
            <div class="cq-line"><span>Menú degustación · 120 pax</span><span class="cqc">5.760 €</span></div>
            <div class="cq-line"><span>Barra libre Premium · 5h</span><span class="cqc">2.040 €</span></div>
            <div class="cq-line"><span>Personal de sala · 8 pers.</span><span class="cqc">1.280 €</span></div>
            <div class="cq-total"><span class="ctl">Total presupuesto</span><span class="ctr">9.080 €</span></div>
          </div>
          <div class="cmargin" id="cmargin"><span class="cml">Margen neto estimado (escandallos reales)</span><span class="cmr">31%</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- STRIP — OCULTO -->
<div class="strip" style="display:none">
  <div class="strip-item"><span class="strip-num">59<b>€</b></span><span class="strip-lbl">Desde / mes</span></div>
  <div class="strip-item"><span class="strip-num">0<b>%</b></span><span class="strip-lbl">Comisión</span></div>
  <div class="strip-item"><span class="strip-num">0<b>€</b></span><span class="strip-lbl">Sorpresas en caja</span></div>
  <div class="strip-item"><span class="strip-num">14<b>d</b></span><span class="strip-lbl">Prueba gratis</span></div>
</div>

<!-- COSTES — lo más importante para el dueño -->
<section class="costes" id="costes">
  <div class="w">
    <div class="s-label fi">Control de costes</div>
    <h2 class="fi">Antes sabías cuánto<br>cobrabas. Ahora sabes<br>cuánto <i>ganas.</i></h2>
    <div class="cost-cards fi d1">

      <div class="cost-card">
        <div class="cost-card-label">Coste real por evento</div>
        <div class="cost-card-num a">3.534<span style="font-size:28px">€</span></div>
        <div class="cost-card-sub">Boda · 180 comensales</div>
      </div>

      <div class="cost-card">
        <div class="cost-card-label">Margen bruto</div>
        <div class="cost-card-num g">71<span style="font-size:28px">%</span></div>
        <div class="cost-card-sub">Calculado en tiempo real</div>
      </div>

      <div class="cost-card">
        <div class="cost-card-label">Beneficio neto</div>
        <div class="cost-card-num g">8.866<span style="font-size:28px">€</span></div>
        <div class="cost-card-sub">factura generada · verifactu ✓</div>
      </div>

    </div>
  </div>
</section>

<!-- FLUJO — de la solicitud a la caja -->
<section class="flujo" id="flujo">
  <div class="w">
    <div class="flujo-header fi">
      <div>
        <div class="s-label">De la solicitud a la caja</div>
        <h2>Todo el trabajo.<br><i>Automatizado.</i></h2>
      </div>
      <div>
        <p style="font-size:16px;color:var(--ink3);font-weight:300;line-height:1.75">Al cerrar el evento ya sabes cuánto has ganado.</p>
      </div>
    </div>

    <div class="flujo-steps fi d1" id="steps">
      <div class="fstep" data-i="0">
        <div class="fstep-dot">01</div>
        <div class="fstep-title">Solicitud y presupuesto</div>
        <div class="fstep-sub">En 5 min · Portal cliente</div>
      </div>
      <div class="fstep" data-i="1">
        <div class="fstep-dot">02</div>
        <div class="fstep-title">Menú y contrato</div>
        <div class="fstep-sub">Firmado desde el móvil</div>
      </div>
      <div class="fstep" data-i="2">
        <div class="fstep-dot">03</div>
        <div class="fstep-title">IA calcula y pide</div>
        <div class="fstep-sub">Escandallos + proveedor</div>
      </div>
      <div class="fstep" data-i="3">
        <div class="fstep-dot">04</div>
        <div class="fstep-title">Almacén listo</div>
        <div class="fstep-sub">OCR albarán · Stock OK</div>
      </div>
      <div class="fstep" data-i="4">
        <div class="fstep-dot">05</div>
        <div class="fstep-title">El evento</div>
        <div class="fstep-sub">Voz · KDS · Margen vivo</div>
      </div>
      <div class="fstep" data-i="5">
        <div class="fstep-dot">06</div>
        <div class="fstep-title">Cierre y factura</div>
        <div class="fstep-sub">VeriFactu · Beneficio real</div>
      </div>
    </div>

    <div class="flujo-progress fi d2"><div class="flujo-progress-fill" id="fpFill"></div></div>

    <div class="flujo-panel fi d2" id="fpanel">
      <div class="fpanel-inner" id="fpInner">
        <div class="fpanel-col">
          <div class="fpanel-col-label" id="fp-lbl1">—</div>
          <div class="fpanel-col-val" id="fp-val1">—</div>
          <div class="fpanel-col-sub" id="fp-sub1">—</div>
        </div>
        <div class="fpanel-col">
          <div class="fpanel-col-label" id="fp-lbl2">—</div>
          <div class="fpanel-col-val" id="fp-val2">—</div>
          <div class="fpanel-col-sub" id="fp-sub2">—</div>
        </div>
        <div class="fpanel-col">
          <div class="fpanel-col-label" id="fp-lbl3">—</div>
          <div class="fpanel-col-val" id="fp-val3">—</div>
          <div class="fpanel-col-sub" id="fp-sub3">—</div>
        </div>
      </div>
    </div>

  </div>
</section>

<!-- CAPACIDADES -->
<section style="background:var(--bg);padding:100px 48px">
  <div class="w">
    <div class="s-label fi">Todo lo que incluye</div>
    <h2 class="fi">Sin módulos de más.<br><i>Sin que te falte nada.</i></h2>
    <div class="cap-grid fi d1">
      <div class="cap-item"><span class="cap-num">01</span><div class="cap-title">Presupuesto en 5 min</div><div class="cap-sub">Portal cliente incluido</div></div>
      <div class="cap-item"><span class="cap-num">02</span><div class="cap-title">Contrato digital</div><div class="cap-sub">Firma desde el móvil</div></div>
      <div class="cap-item"><span class="cap-num">03</span><div class="cap-title">APPCC automático</div><div class="cap-sub">14 alérgenos · Sin papel</div></div>
      <div class="cap-item"><span class="cap-num">04</span><div class="cap-title">Escandallos + IA</div><div class="cap-sub">Coste real por evento</div></div>
      <div class="cap-item"><span class="cap-num">05</span><div class="cap-title">Pedido a proveedor</div><div class="cap-sub">Rappels aplicados auto</div></div>
      <div class="cap-item"><span class="cap-num">06</span><div class="cap-title">OCR albarán</div><div class="cap-sub">3-way match automático</div></div>
      <div class="cap-item"><span class="cap-num">07</span><div class="cap-title">Voz y KDS</div><div class="cap-sub">El día del evento</div></div>
      <div class="cap-item"><span class="cap-num">08</span><div class="cap-title">Fichaje de extras</div><div class="cap-sub">Check-in QR por evento</div></div>
      <div class="cap-item"><span class="cap-num">09</span><div class="cap-title">VeriFactu</div><div class="cap-sub">Factura legal automática</div></div>
      <div class="cap-item"><span class="cap-num">10</span><div class="cap-title">Contabilidad</div><div class="cap-sub">IVA 303 · Export A3/Sage</div></div>
      <div class="cap-item"><span class="cap-num">11</span><div class="cap-title">Analytics</div><div class="cap-sub">Margen por evento y temporada</div></div>
      <div class="cap-item"><span class="cap-num">12</span><div class="cap-title">Multi-local</div><div class="cap-sub">Varios espacios · Un panel</div></div>
    </div>
  </div>
</section>

<!-- CONTACTO -->
<section style="background:var(--bg);padding:100px 48px;border-top:1px solid var(--border)" id="contacto">
  <div class="w">
    <div class="form-grid fi">
      <div>
        <div class="s-label">Demo gratuita</div>
        <h2>Cuéntanos<br>tu catering.</h2>
        <p style="margin-top:20px;font-size:16px;color:var(--ink3);font-weight:300;line-height:1.75">Demo en directo adaptada a tu empresa. Sin compromiso. Sin tarjeta.</p>
        <ul style="list-style:none;margin-top:28px">
          <li style="padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;color:var(--ink2);display:flex;gap:10px"><span style="color:var(--red)">—</span>Respuesta en menos de 24 horas</li>
          <li style="padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;color:var(--ink2);display:flex;gap:10px"><span style="color:var(--red)">—</span>Demo adaptada a tu operativa</li>
          <li style="padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;color:var(--ink2);display:flex;gap:10px"><span style="color:var(--red)">—</span>14 días de prueba gratuita</li>
          <li style="padding:12px 0;font-size:14px;color:var(--ink2);display:flex;gap:10px"><span style="color:var(--red)">—</span>Onboarding incluido</li>
        </ul>
      </div>
      <div>
        <div class="form-card">
          <div class="form-top">
            <div class="form-top-t">Solicitar demo</div>
            <div class="form-top-s">Te contactamos en menos de 24h.</div>
          </div>
          <div class="form-body" id="cateringFormBody">
            <input type="text" id="cw" name="website" style="display:none" tabindex="-1" autocomplete="off"/>
            <div class="field"><label>Nombre *</label><input type="text" id="cnombre" placeholder="Tu nombre" autocomplete="given-name"/></div>
            <div class="field-row">
              <div class="field"><label>Email *</label><input type="email" id="cemail" placeholder="tu@email.com"/></div>
              <div class="field"><label>Teléfono</label><input type="tel" id="ctelefono" placeholder="+34 6xx xxx xxx"/></div>
            </div>
            <div class="field"><label>Empresa / Nombre del catering</label><input type="text" id="cempresa" placeholder="Mi Catering S.L."/></div>
            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;margin-top:4px">
              <input type="checkbox" id="crgpd" style="margin-top:3px;accent-color:var(--red);cursor:pointer;flex-shrink:0"/>
              <label for="crgpd" style="font-size:12px;color:var(--ink2);line-height:1.5;cursor:pointer">He leído y acepto la <a href="/privacidad" target="_blank" style="color:var(--red)">política de privacidad</a>. Consiento que <strong>Alberto Suárez Gutiérrez (NIF 28823484E)</strong> trate mis datos para gestionar mi solicitud. Derechos en <a href="mailto:hola@iarest.es" style="color:var(--red)">hola@iarest.es</a>.</label>
            </div>
            <button class="submit-btn" id="csubmit" onclick="enviarCatering()">Solicitar demo →</button>
          </div>
          <div style="display:none;padding:44px 34px;text-align:center" id="cateringOK">
            <div style="font-family:'Newsreader',serif;font-size:24px;font-weight:300;color:var(--ink);margin-bottom:8px">Recibido.</div>
            <div style="font-size:14px;color:var(--ink3)">Te contactamos antes de 24h.</div>
          </div>
          <div class="form-foot">Sin compromiso · Sin tarjeta · <a href="mailto:hola@iarest.es" style="color:var(--red)">hola@iarest.es</a> · <a href="tel:+34637349990" style="color:var(--red)">637 349 990</a></div>
        </div>
      </div>
    </div>
  </div>
</section>` }} />
    </>
  )
}
