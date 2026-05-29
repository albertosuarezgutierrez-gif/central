"use client"
import { useEffect } from "react"

export default function EspaciosPage() {
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
    const form = document.getElementById('contactForm')
    if (form) {
      form.addEventListener('submit', async (e: any) => {
        e.preventDefault()
        const btn = document.getElementById('submitBtn') as HTMLButtonElement
        const nom = (document.getElementById('nombre') as HTMLInputElement)?.value.trim()
        const mail = (document.getElementById('email') as HTMLInputElement)?.value.trim()
        const tel = (document.getElementById('telefono') as HTMLInputElement)?.value.trim()
        const tipo = (document.getElementById('tipo') as HTMLSelectElement)?.value
        const rgpd = (document.getElementById('rgpd') as HTMLInputElement)?.checked
        if (!nom || !mail || !tel || !tipo) { alert('Rellena los campos obligatorios (*).'); return }
        if (!rgpd) { alert('Acepta la política de privacidad.'); return }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { alert('Email no válido.'); return }
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...' }
        const payload: any = { nombre: nom, email: mail, telefono: tel, restaurante: (document.getElementById('espacio') as HTMLInputElement)?.value?.trim() || tipo || 'Espacio de eventos', tipo_negocio: tipo, origen: 'landing-espacios', rgpd_aceptado: true, rgpd_fecha: new Date().toISOString() }
        if (document.getElementById('espacio')) payload['espacio'] = (document.getElementById('espacio') as HTMLInputElement)?.value.trim()
        try {
          const r = await fetch('/api/leads/landing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          if (r.ok) {
            const fc = document.getElementById('formContainer')
            const fok = document.getElementById('formSuccess')
            if (fc) fc.style.display = 'none'
            if (fok) fok.style.display = 'block'
          } else throw new Error()
        } catch(_) {
          const s = encodeURIComponent('Demo ia.rest Espacios - ' + nom)
          const b2 = encodeURIComponent('Nombre: ' + nom + '\nEmail: ' + mail + '\nTel: ' + tel + '\nTipo: ' + tipo + '\nRGPD: Si')
          window.location.href = 'mailto:hola@iarest.es?subject=' + s + '&body=' + b2
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'Solicitar demo gratuita →' }
        }
      })
    }
  }, [])

  return (
    <>
      <title>Software para Fincas y Espacios de Eventos | ia.rest</title>
      <meta name="description" content="ia.rest gestiona automáticamente las solicitudes de bodas.net. Respuestas automáticas, calendario, contratos digitales y VeriFactu. Desde 59€/mes." />
      <link rel="canonical" href="https://www.iarest.es/espacios" />
      <meta property="og:title" content="Software para Fincas y Espacios de Eventos | ia.rest" />
      <meta property="og:description" content="ia.rest gestiona automáticamente las solicitudes de bodas.net. Respuestas automáticas, calendario, contratos digitales y VeriFactu. Desde 59€/mes." />
      <meta property="og:url" content="https://www.iarest.es/espacios" />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="https://www.iarest.es/og-espacios.jpg" />
      <meta property="og:locale" content="es_ES" />
      <meta property="og:site_name" content="ia.rest" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Software para Fincas y Espacios de Eventos | ia.rest" />
      <meta name="twitter:description" content="ia.rest gestiona automáticamente las solicitudes de bodas.net. Respuestas automáticas, calendario, contratos digitales y VeriFactu. Desde 59€/mes." />
      <meta name="twitter:image" content="https://www.iarest.es/og-espacios.jpg" />
      <style dangerouslySetInnerHTML={{ __html: `/* ═══════════════════════════════════════
   DESIGN TOKENS — ia.rest corporativo
   Color único de marca: #D9442B (rojo)
   Sin ámbar, sin secundarios de marca
═══════════════════════════════════════ */
:root {
  --paper:  #F6F1E7;
  --dark:   #14110E;
  --bg2:    #1E1A15;
  --bg3:    #2A221A;
  --red:    #D9442B;
  --green:  #3F7D44;
  --ink:    #1A1714;
  --ink2:   #D8CDB6;
  --ink3:   #9C8E7E;
  --ink4:   #6B5F52;
  --rule:   #2E2720;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { background: var(--dark); color: var(--paper); font-family: 'Bricolage Grotesque', sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
.max-w { max-width: 1120px; margin: 0 auto; }

/* ── TOPBAR ── */
.topbar { position: sticky; top: 0; z-index: 100; background: rgba(20,17,14,.93); backdrop-filter: blur(12px); border-bottom: 1px solid var(--rule); padding: 0 48px; height: 60px; display: flex; align-items: center; justify-content: space-between; }
.logo { font-family: 'Newsreader', serif; font-size: 22px; font-weight: 300; }
.logo .dot { color: var(--red); }
.topbar-nav { display: flex; align-items: center; gap: 28px; }
.topbar-nav a { font-size: 13px; color: var(--ink3); transition: color .2s; }
.topbar-nav a:hover { color: var(--paper); }
.btn-nav { background: var(--red); color: #fff; padding: 8px 18px; border-radius: 7px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; font-family: 'Bricolage Grotesque', sans-serif; }

/* ── HERO ── */
.hero { padding: 112px 48px 88px; position: relative; overflow: hidden; border-bottom: 1px solid var(--rule); }
.hero::after { content: ''; position: absolute; top: -160px; right: -160px; width: 500px; height: 500px; border-radius: 50%; background: radial-gradient(circle, rgba(217,68,43,.07) 0%, transparent 70%); pointer-events: none; }
.hero-tag { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--rule); border-radius: 100px; padding: 6px 14px; font-family: 'DM Mono', monospace; font-size: 11px; color: var(--ink3); letter-spacing: .1em; margin-bottom: 28px; }
.pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--red); animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(.8); } }
h1 { font-family: 'Newsreader', serif; font-size: clamp(42px, 7vw, 86px); font-weight: 300; line-height: 1.0; color: var(--paper); letter-spacing: -.03em; margin-bottom: 22px; max-width: 880px; }
h1 em { font-style: italic; color: var(--red); }
.hero-desc { font-size: 17px; color: var(--ink3); font-weight: 300; max-width: 540px; line-height: 1.65; margin-bottom: 36px; }
.hero-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 52px; }
.btn-primary { background: var(--red); color: #fff; padding: 13px 26px; border-radius: 9px; font-weight: 700; font-size: 15px; transition: opacity .2s, transform .15s; display: inline-block; }
.btn-primary:hover { opacity: .88; transform: translateY(-1px); }
.btn-ghost { border: 1px solid var(--rule); color: var(--ink2); padding: 13px 26px; border-radius: 9px; font-size: 15px; transition: border-color .2s, color .2s; display: inline-block; }
.btn-ghost:hover { border-color: var(--ink3); color: var(--paper); }
.hero-stats { display: flex; gap: 44px; flex-wrap: wrap; padding-top: 28px; border-top: 1px solid var(--rule); }
.stat-num { font-family: 'Newsreader', serif; font-size: 34px; font-weight: 300; color: var(--paper); line-height: 1; }
.stat-num span { color: var(--red); }
.stat-label { font-size: 12px; color: var(--ink3); margin-top: 3px; font-family: 'DM Mono', monospace; letter-spacing: .06em; }

/* ── SECCIONES ── */
section { padding: 88px 48px; }
.sl { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: var(--red); margin-bottom: 14px; }
h2.st { font-family: 'Newsreader', serif; font-size: clamp(32px, 5vw, 58px); font-weight: 300; line-height: 1.1; color: var(--paper); letter-spacing: -.02em; }
.ssub { font-size: 16px; color: var(--ink3); font-weight: 300; line-height: 1.65; max-width: 580px; margin-top: 14px; }

/* ── BODAS.NET ── */
.bnet { background: var(--bg2); }
.bnet-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
.bnet-copy h2 { font-family: 'Newsreader', serif; font-size: clamp(28px,4vw,50px); font-weight: 300; line-height: 1.15; color: var(--paper); margin-bottom: 16px; }
.bnet-copy h2 em { font-style: italic; color: var(--red); }
.bnet-copy p { font-size: 15px; color: var(--ink3); line-height: 1.7; margin-bottom: 14px; }
.bnet-visual { background: var(--bg3); border-radius: 16px; padding: 32px; border: 1px solid var(--rule); position: relative; overflow: hidden; }
.bnet-visual::before { content: 'bodas.net'; position: absolute; top: 16px; right: 16px; font-family: 'DM Mono', monospace; font-size: 10px; color: var(--ink4); letter-spacing: .1em; text-transform: uppercase; }
.notif { background: var(--bg2); border: 1px solid var(--rule); border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; display: flex; gap: 12px; align-items: flex-start; transition: border-color .2s; }
.notif:hover { border-color: var(--red); }
.notif-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
.notif-dot.nueva { background: var(--red); }
.notif-dot.ok { background: var(--green); }
.notif-dot.pend { background: var(--ink4); }
.notif-title { font-size: 13px; font-weight: 700; color: var(--paper); margin-bottom: 2px; }
.notif-sub { font-size: 12px; color: var(--ink3); line-height: 1.4; }
.notif-badge { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 4px; font-family: 'DM Mono', monospace; font-size: 10px; }
.notif-badge.ok { background: rgba(63,125,68,.15); color: var(--green); }
.notif-badge.pend { background: rgba(217,68,43,.12); color: var(--red); }

/* ── DOLORES ── */
.dolores { background: var(--dark); }
.dolores-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 44px; }
.dolor-item { padding: 32px; position: relative; }
.dolor-item:nth-child(odd) { background: var(--bg2); }
.dolor-item:nth-child(even) { background: var(--bg3); }
.dolor-item::after { content: '→'; position: absolute; right: -1px; top: 50%; transform: translateY(-50%); font-size: 18px; color: var(--rule); z-index: 2; }
.di-label { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: .15em; text-transform: uppercase; margin-bottom: 10px; }
.di-label.prob { color: var(--ink4); }
.di-label.sol { color: var(--green); }
.di-title { font-size: 15px; font-weight: 700; color: var(--paper); margin-bottom: 6px; line-height: 1.3; }
.di-desc { font-size: 13px; color: var(--ink3); line-height: 1.55; }

/* ── CÓMO FUNCIONA ── */
.como { background: var(--bg2); }
.pasos { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0; margin-top: 48px; position: relative; }
.pasos::before { content: ''; position: absolute; top: 19px; left: 0; right: 0; height: 1px; background: var(--rule); }
.paso { padding: 0 20px 0 0; position: relative; z-index: 1; }
.paso-num { width: 38px; height: 38px; border-radius: 50%; background: var(--red); display: flex; align-items: center; justify-content: center; font-family: 'DM Mono', monospace; font-size: 12px; color: #fff; margin-bottom: 20px; flex-shrink: 0; }
.paso-title { font-weight: 700; font-size: 14px; color: var(--paper); margin-bottom: 6px; }
.paso-desc { font-size: 13px; color: var(--ink3); line-height: 1.55; }

/* ── PRICING ── */
.pricing { background: var(--dark); }
.pricing-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; margin-top: 16px; }
.price-card { background: var(--bg2); border-radius: 16px; padding: 40px; border: 1px solid var(--rule); text-align: center; transition: border-color .2s; }
.price-card:hover { border-color: var(--red); }
.price-desde { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--ink3); letter-spacing: .15em; text-transform: uppercase; margin-bottom: 12px; }
.price-num { font-family: 'Newsreader', serif; font-size: 72px; font-weight: 300; color: var(--paper); line-height: 1; letter-spacing: -.03em; }
.price-num sup { font-size: 28px; vertical-align: super; color: var(--red); }
.price-num sub { font-size: 18px; vertical-align: baseline; color: var(--ink3); }
.price-detail { font-size: 14px; color: var(--ink3); margin-top: 8px; line-height: 1.5; }
.price-items { list-style: none; margin-top: 24px; text-align: left; }
.price-items li { font-size: 13px; color: var(--ink2); padding: 8px 0; border-bottom: 1px solid var(--rule); display: flex; gap: 8px; align-items: flex-start; }
.price-items li:last-child { border-bottom: none; }
.price-items li .c { color: var(--green); flex-shrink: 0; }
.price-ejemplo { background: var(--bg3); border-radius: 10px; padding: 20px 24px; margin-top: 20px; }
.pe-label { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--ink4); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 10px; }
.pe-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink3); padding: 4px 0; }
.pe-row strong { color: var(--paper); }
.pe-total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: var(--paper); padding-top: 10px; margin-top: 6px; border-top: 1px solid var(--rule); }

/* ── FAQ ── */
.faq { background: var(--bg2); }
.faq-list { margin-top: 44px; max-width: 780px; }
.faq-item { border-bottom: 1px solid var(--rule); }
.faq-q { padding: 18px 0; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 14px; font-weight: 700; font-size: 15px; color: var(--paper); transition: color .2s; user-select: none; }
.faq-q:hover { color: var(--ink2); }
.faq-q .arr { color: var(--red); font-size: 16px; transition: transform .25s; flex-shrink: 0; }
.faq-a { font-size: 13px; color: var(--ink3); line-height: 1.65; max-height: 0; overflow: hidden; transition: max-height .35s ease, padding .25s; }
.faq-item.open .arr { transform: rotate(180deg); }
.faq-item.open .faq-a { max-height: 200px; padding-bottom: 18px; }

/* ── CONTACTO ── */
.contacto { background: var(--dark); border-top: 1px solid var(--rule); }
.contacto-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 72px; align-items: flex-start; }
.contacto-copy h2 { font-family: 'Newsreader', serif; font-size: clamp(28px,4vw,48px); font-weight: 300; line-height: 1.15; color: var(--paper); margin-bottom: 14px; }
.contacto-copy h2 em { font-style: italic; color: var(--red); }
.contacto-copy p { font-size: 15px; color: var(--ink3); line-height: 1.65; margin-bottom: 20px; }
.promise-list { display: flex; flex-direction: column; gap: 9px; margin-top: 20px; }
.pi { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink3); }
.chk { color: var(--green); }

/* ── FORM ── */
.form-card { background: var(--bg2); border-radius: 14px; padding: 36px; border: 1px solid var(--rule); }
.form-title { font-weight: 700; font-size: 17px; color: var(--paper); margin-bottom: 3px; }
.form-sub { font-size: 13px; color: var(--ink3); margin-bottom: 24px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fg { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.fg label { font-size: 11px; font-family: 'DM Mono', monospace; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); }
.fg input, .fg select, .fg textarea { background: var(--bg3); border: 1px solid var(--rule); border-radius: 7px; padding: 10px 13px; font-size: 14px; color: var(--paper); font-family: 'Bricolage Grotesque', sans-serif; transition: border-color .2s; outline: none; width: 100%; -webkit-appearance: none; appearance: none; }
.fg input::placeholder, .fg textarea::placeholder { color: var(--ink4); }
.fg input:focus, .fg select:focus, .fg textarea:focus { border-color: var(--red); }
.fg select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239C8E7E' stroke-width='1.5' fill='none'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 13px center; padding-right: 34px; cursor: pointer; }
.fg textarea { resize: vertical; min-height: 80px; }
.rgpd-box { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 16px; background: rgba(217,68,43,.06); border: 1px solid rgba(217,68,43,.2); border-radius: 8px; padding: 12px 14px; }
.rgpd-box input[type=checkbox] { flex-shrink: 0; width: 16px; height: 16px; margin-top: 2px; accent-color: var(--red); cursor: pointer; }
.rgpd-text { font-size: 12px; color: var(--ink3); line-height: 1.5; }
.rgpd-text a { color: var(--ink2); text-decoration: underline; }
.rgpd-text strong { color: var(--paper); }
.form-submit { width: 100%; background: var(--red); color: #fff; padding: 13px; border-radius: 9px; font-weight: 700; font-size: 15px; border: none; cursor: pointer; font-family: 'Bricolage Grotesque', sans-serif; transition: opacity .2s, transform .15s; }
.form-submit:hover { opacity: .88; transform: translateY(-1px); }
.form-submit:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.form-legal { font-size: 11px; color: var(--ink4); line-height: 1.5; margin-top: 10px; text-align: center; }
.form-legal a { color: var(--ink3); text-decoration: underline; }
.form-success { display: none; text-align: center; padding: 28px; }
.form-success .big { font-size: 44px; margin-bottom: 14px; }
.form-success h3 { font-family: 'Newsreader', serif; font-size: 22px; font-weight: 300; color: var(--paper); margin-bottom: 7px; }
.form-success p { font-size: 13px; color: var(--ink3); }

/* ── FOOTER ── */
footer { background: var(--dark); border-top: 1px solid var(--rule); padding: 36px 48px; }
.footer-inner { max-width: 1120px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; }
.footer-logo { font-family: 'Newsreader', serif; font-size: 19px; font-weight: 300; }
.footer-logo .dot { color: var(--red); }
.footer-links { display: flex; gap: 20px; flex-wrap: wrap; }
.footer-links a { font-size: 12px; color: var(--ink3); transition: color .2s; }
.footer-links a:hover { color: var(--paper); }
.footer-copy { font-size: 11px; color: var(--ink4); font-family: 'DM Mono', monospace; }

/* ── RESPONSIVE ── */
/* Ocultar burger y mob-menu por defecto (solo visibles en móvil) */
.burger { display: none; flex-direction: column; justify-content: center; gap: 5px; background: none; border: none; cursor: pointer; padding: 8px; z-index: 200; flex-shrink: 0; }
.burger span { display: block; width: 22px; height: 2px; background: #F6F1E7; border-radius: 2px; transition: transform .3s, opacity .3s; }
.mob-menu { display: none; position: fixed; inset: 60px 0 0; background: #14110E; z-index: 150; flex-direction: column; padding: 32px 24px; gap: 4px; }
.mob-menu.open { display: flex; }
.mob-menu a { font-size: 18px; font-weight: 500; color: #F6F1E7; text-decoration: none; padding: 14px 0; border-bottom: 1px solid rgba(246,241,231,0.07); }
.mob-cta { color: #D9442B !important; font-weight: 700 !important; }

@media (max-width: 900px) {
  section, footer { padding: 60px 24px; }
  .hero { padding: 72px 24px 60px; }
  .topbar { padding: 0 20px; }
  .burger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.burger.open span:nth-child(2){opacity:0}
.burger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
  .topbar-nav { display: none; }
  .burger { display: flex !important; }
  .bnet-inner, .dolores-grid, .pricing-inner, .contacto-inner { grid-template-columns: 1fr; gap: 36px; }
  .form-row { grid-template-columns: 1fr; }
  .pasos { grid-template-columns: 1fr 1fr; }
  .dolor-item::after { display: none; }
  .footer-inner { flex-direction: column; align-items: flex-start; }
}` }} />
      <div dangerouslySetInnerHTML={{ __html: `<header>
  <nav class="topbar">
  <a class="logo" href="/">ia<b>.</b>rest</a>
  <div class="topbar-nav">
    <a href="/hosteleria">Hostelería</a>
    <a href="/catering">Catering</a>
    <a href="#contacto" class="nav-cta">Demo gratuita →</a>
  </div>
  <button class="burger" id="burger" aria-label="Menú"><span></span><span></span><span></span></button>
</nav>

<div class="mob-menu" id="mobMenu">
  <a href="/hosteleria">Hostelería</a>
  <a href="/catering">Catering</a>
  <a href="#contacto" class="mob-cta">Demo gratuita →</a>
</div>
</header>

<main>

<!-- HERO -->
<section class="hero">
  <div class="max-w">
    <div class="hero-tag"><span class="pulse"></span>Para fincas · salones · haciendas · lofts</div>
    <h1>Tu espacio de eventos,<br><em>gestionado solo.</em></h1>
    <p class="hero-desc">Las solicitudes de bodas.net entran directamente, tienen respuesta automática y quedan en tu calendario. Sin copiar correos. Sin perder ninguna consulta.</p>
    <div class="hero-actions">
      <a href="#contacto" class="btn-primary">Solicitar demo gratuita</a>
      <a href="#como" class="btn-ghost">Ver cómo funciona →</a>
    </div>
    <div class="hero-stats">
      <div class="stat">
        <div class="stat-num">59<span>€</span></div>
        <div class="stat-label">Desde / mes</div>
      </div>
      <div class="stat">
        <div class="stat-num">0<span>%</span></div>
        <div class="stat-label">Comisión por evento</div>
      </div>
      <div class="stat">
        <div class="stat-num">14<span>d</span></div>
        <div class="stat-label">Prueba gratuita</div>
      </div>
    </div>
  </div>
</section>

<!-- BODAS.NET -->
<section class="bnet">
  <div class="max-w">
    <div class="bnet-inner">
      <div class="bnet-copy">
        <div class="sl">La consulta más importante</div>
        <h2>Una solicitud de<br><em>bodas.net.</em><br>Gestionada sola.</h2>
        <p>Cada solicitud que llega de bodas.net entra directamente en ia.rest, recibe una respuesta automática personalizada y aparece en tu calendario de disponibilidad.</p>
        <p>Nunca más una consulta sin responder porque estabas ocupado. Nunca más perder una boda porque tardaste tres días en contestar.</p>
        <a href="#contacto" class="btn-primary" style="display:inline-block;margin-top:8px">Quiero verlo en mi espacio</a>
      </div>
      <div class="bnet-visual">
        <div class="notif">
          <span class="notif-dot nueva"></span>
          <div>
            <div class="notif-title">Nueva solicitud — María y Carlos</div>
            <div class="notif-sub">Boda · 120 personas · 14 septiembre 2026</div>
            <span class="notif-badge ok">✓ Respuesta enviada automáticamente</span>
          </div>
        </div>
        <div class="notif">
          <span class="notif-dot ok"></span>
          <div>
            <div class="notif-title">Presupuesto aceptado — Ana y Roberto</div>
            <div class="notif-sub">Fecha bloqueada en tu calendario · 8 noviembre</div>
            <span class="notif-badge ok">✓ Contrato generado automáticamente</span>
          </div>
        </div>
        <div class="notif">
          <span class="notif-dot nueva"></span>
          <div>
            <div class="notif-title">Nueva solicitud — Empresa Acme</div>
            <div class="notif-sub">Evento corporativo · 80 personas · 22 octubre</div>
            <span class="notif-badge pend">⏳ Pendiente de presupuesto</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- DOLORES → SOLUCIONES -->
<section class="dolores">
  <div class="max-w">
    <div class="sl">Antes y después</div>
    <h2 class="st">Lo que cambia<br>desde el primer día.</h2>
    <div class="dolores-grid">

      <div class="dolor-item">
        <div class="di-label prob">Antes</div>
        <div class="di-title">Las solicitudes llegan por email, Instagram y teléfono y se pierden.</div>
        <p class="di-desc">Cada plataforma es un sitio diferente. A veces tardas días en responder y el cliente ya eligió otro espacio.</p>
      </div>
      <div class="dolor-item">
        <div class="di-label sol">Con ia.rest</div>
        <div class="di-title">Todas las consultas en un solo lugar. Respuesta automática inmediata.</div>
        <p class="di-desc">Cada solicitud entra en ia.rest y tiene respuesta en segundos. Tú decides cuándo profundizar.</p>
      </div>

      <div class="dolor-item">
        <div class="di-label prob">Antes</div>
        <div class="di-title">El calendario de disponibilidad está en tu cabeza o en papel.</div>
        <p class="di-desc">Dobles reservas, fechas confusas, tener que llamar para confirmar si una fecha está libre.</p>
      </div>
      <div class="dolor-item">
        <div class="di-label sol">Con ia.rest</div>
        <div class="di-title">Calendario en tiempo real. Al confirmar un evento la fecha se bloquea sola.</div>
        <p class="di-desc">Cualquiera de tu equipo ve en un segundo qué fechas están disponibles. Sin llamadas, sin cruces.</p>
      </div>

      <div class="dolor-item">
        <div class="di-label prob">Antes</div>
        <div class="di-title">El presupuesto tarda días y se hace en Word o Excel.</div>
        <p class="di-desc">Cada presupuesto es un archivo diferente que mandas por email y esperas que el cliente encuentre.</p>
      </div>
      <div class="dolor-item">
        <div class="di-label sol">Con ia.rest</div>
        <div class="di-title">Presupuesto en 5 minutos, desde el móvil. El cliente lo recibe en su portal.</div>
        <p class="di-desc">El cliente accede desde un enlace, lo revisa, hace preguntas y confirma. Todo en el mismo sitio.</p>
      </div>

      <div class="dolor-item">
        <div class="di-label prob">Antes</div>
        <div class="di-title">El contrato va por email y vuelve escaneado a medias.</div>
        <p class="di-desc">Imprimir, firmar, escanear, reenviar. A veces el cliente no lo devuelve y queda todo en el aire.</p>
      </div>
      <div class="dolor-item">
        <div class="di-label sol">Con ia.rest</div>
        <div class="di-title">El contrato se genera solo y el cliente lo firma desde el móvil.</div>
        <p class="di-desc">Al aceptar el presupuesto el contrato se crea automáticamente. El cliente firma con un clic.</p>
      </div>

    </div>
  </div>
</section>

<!-- CÓMO FUNCIONA -->
<section class="como" id="como">
  <div class="max-w">
    <div class="sl">Paso a paso</div>
    <h2 class="st">De la consulta<br>al contrato firmado.</h2>
    <div class="pasos">
      <div class="paso">
        <div class="paso-num">1</div>
        <div class="paso-title">Llega la solicitud</div>
        <p class="paso-desc">Desde bodas.net u otras plataformas. Entra sola en ia.rest y tiene respuesta automática al instante.</p>
      </div>
      <div class="paso">
        <div class="paso-num">2</div>
        <div class="paso-title">Envías el presupuesto</div>
        <p class="paso-desc">En minutos, desde el móvil o el ordenador. El cliente lo recibe en su portal personal.</p>
      </div>
      <div class="paso">
        <div class="paso-num">3</div>
        <div class="paso-title">El cliente confirma</div>
        <p class="paso-desc">Acepta el presupuesto, hace preguntas en el chat y firma el contrato digital. La fecha se bloquea automáticamente.</p>
      </div>
      <div class="paso">
        <div class="paso-num">4</div>
        <div class="paso-title">Factura legal</div>
        <p class="paso-desc">VeriFactu genera la factura electrónica con QR de la AEAT. Obligatorio desde 2026. Sin esfuerzo extra.</p>
      </div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="pricing" id="pricing" style="display:none">
  <div class="max-w">
    <div class="sl">Precio</div>
    <div class="pricing-inner">
      <div>
        <h2 class="st">Simple.<br>Por personas,<br>no por eventos.</h2>
        <p class="ssub">Pagas por las personas de tu equipo que usan ia.rest. Sin comisión por evento, sin sorpresas al final del mes.</p>
        <br>
        <p style="font-size:14px;color:var(--ink3);line-height:1.7">Si lo gestionas tú solo: <strong style="color:var(--paper)">59€/mes</strong>. Si tienes una persona de apoyo: <strong style="color:var(--paper)">79€/mes</strong>. Así de fácil.</p>
        <br>
        <a href="#contacto" class="btn-primary" style="display:inline-block">Empezar prueba gratuita</a>
      </div>
      <div>
        <div class="price-card">
          <div class="price-desde">Precio mensual</div>
          <div class="price-num"><sup>€</sup>59<sub>/mes</sub></div>
          <div class="price-detail">+ 20€ por cada persona adicional del equipo</div>
          <ul class="price-items">
            <li><span class="c">✓</span> Solicitudes y respuestas automáticas</li>
            <li><span class="c">✓</span> Calendario de disponibilidad</li>
            <li><span class="c">✓</span> Presupuestos y contratos digitales</li>
            <li><span class="c">✓</span> Portal cliente incluido</li>
            <li><span class="c">✓</span> VeriFactu — facturación legal</li>
            <li><span class="c">✓</span> Soporte y onboarding incluidos</li>
            <li><span class="c">✓</span> 14 días de prueba gratuita</li>
          </ul>
          <div class="price-ejemplo">
            <div class="pe-label">Ejemplo — Finca con 2 personas</div>
            <div class="pe-row"><span>Base</span><span>59€</span></div>
            <div class="pe-row"><span>1 persona adicional</span><span>+ 20€</span></div>
            <div class="pe-total"><span>Total</span><strong>79€/mes</strong></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="faq" id="faq">
  <div class="max-w">
    <div class="sl">Preguntas frecuentes</div>
    <h2 class="st">Lo que nos suelen preguntar.</h2>
    <div class="faq-list">
      <div class="faq-item">
        <div class="faq-q" role="button" tabindex="0">¿ia.rest gestiona las solicitudes de bodas.net automáticamente? <span class="arr">↓</span></div>
        <div class="faq-a">Sí. Las solicitudes que llegan de bodas.net entran directamente en ia.rest, reciben respuesta automática y quedan en tu calendario de disponibilidad. Sin copiar y pegar, sin perder ninguna consulta.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" role="button" tabindex="0">¿Qué pasa si solo gestiono el espacio yo solo? <span class="arr">↓</span></div>
        <div class="faq-a">Perfectamente. Si eres tú el único que usa ia.rest el precio es de 59€/mes, sin más. Sin usuarios adicionales que no necesitas.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" role="button" tabindex="0">¿El cliente tiene que instalar alguna app para firmar el contrato? <span class="arr">↓</span></div>
        <div class="faq-a">No. El cliente recibe un enlace, lo abre en su móvil y firma el contrato digital sin instalar nada. Todo queda guardado automáticamente en ia.rest.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" role="button" tabindex="0">¿VeriFactu es obligatorio para mi espacio de eventos? <span class="arr">↓</span></div>
        <div class="faq-a">Sí, si facturas como empresa o autónomo. La facturación electrónica con QR de la AEAT es obligatoria desde 2026. Con ia.rest cada factura cumple la normativa automáticamente desde el primer día.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" role="button" tabindex="0">¿Puedo añadir funcionalidades si en el futuro ofrezco catering? <span class="arr">↓</span></div>
        <div class="faq-a">Sí. ia.rest crece contigo. Si en el futuro ofreces catering propio o gestión de sala, puedes activarlo en cualquier momento sin cambiar de herramienta ni migrar datos.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" role="button" tabindex="0">¿Mis datos y los de mis clientes están protegidos? <span class="arr">↓</span></div>
        <div class="faq-a">Sí. Los datos se almacenan en servidores europeos (UE) con cifrado en tránsito y en reposo. El tratamiento cumple el RGPD y la LOPDGDD. Puedes ejercer tus derechos escribiendo a hola@iarest.es.</div>
      </div>
    </div>
  </div>
</section>

<!-- CAPACIDADES -->
<section style="background:var(--bg);padding:100px 48px">
  <div class="max-w">
    <div class="sl" style="font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#D9442B;margin-bottom:20px">Todo lo que incluye</div>
    <h2>Sin módulos de más.<br><em>Sin que te falte nada.</em></h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:2px;background:rgba(246,241,231,0.07);border:1px solid rgba(246,241,231,0.07);border-radius:14px;overflow:hidden;margin-top:52px">
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">01</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">Solicitudes bodas.net</div><div style="font-size:12px;color:#6B6054">Respuesta automática incluida</div></div>
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">02</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">Presupuesto al cliente</div><div style="font-size:12px;color:#6B6054">Portal online sin llamadas</div></div>
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">03</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">Contrato digital</div><div style="font-size:12px;color:#6B6054">Firma desde el móvil</div></div>
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">04</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">Calendario sin solapamientos</div><div style="font-size:12px;color:#6B6054">Disponibilidad en tiempo real</div></div>
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">05</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">VeriFactu</div><div style="font-size:12px;color:#6B6054">Factura legal · QR AEAT</div></div>
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">06</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">Contabilidad</div><div style="font-size:12px;color:#6B6054">IVA 303 · Export A3/Sage</div></div>
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">07</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">Analytics</div><div style="font-size:12px;color:#6B6054">Ingresos por espacio y temporada</div></div>
      <div style="background:#111009;padding:28px 22px;transition:background .2s" onmouseenter="this.style.background='#1C1814'" onmouseleave="this.style.background='#111009'"><span style="display:block;font-family:'Newsreader',serif;font-size:12px;color:#D9442B;font-weight:300;letter-spacing:.05em;margin-bottom:12px">08</span><div style="font-size:14px;font-weight:600;color:#F6F1E7;letter-spacing:-.1px;margin-bottom:4px">Multi-espacio</div><div style="font-size:12px;color:#6B6054">Varias fincas · Un solo panel</div></div>
    </div>
  </div>
</section>

<!-- CONTACTO -->
<section class="contacto" id="contacto">
  <div class="max-w">
    <div class="contacto-inner">
      <div class="contacto-copy">
        <div class="sl">Empieza hoy</div>
        <h2>Cuéntanos<br><em>tu espacio.</em></h2>
        <p>Te hacemos una demo en directo adaptada a tu espacio. Verás exactamente cómo entran las solicitudes de bodas.net y cómo se gestiona todo desde ia.rest.</p>
        <div class="promise-list">
          <div class="pi"><span class="chk">✓</span> Respuesta en menos de 24 horas</div>
          <div class="pi"><span class="chk">✓</span> Demo personalizada para tu espacio</div>
          <div class="pi"><span class="chk">✓</span> 14 días de prueba gratuita sin tarjeta</div>
          <div class="pi"><span class="chk">✓</span> Onboarding incluido en todos los planes</div>
        </div>
      </div>
      <div class="form-card">
        <div id="formContainer">
          <div class="form-title">Solicitar demo gratuita</div>
          <div class="form-sub">Para fincas, salones y espacios de eventos.</div>
          <form id="contactForm" novalidate>
            <div class="form-row">
              <div class="fg">
                <label for="nombre">Nombre *</label>
                <input type="text" id="nombre" name="nombre" placeholder="Tu nombre" required autocomplete="given-name">
              </div>
              <div class="fg">
                <label for="telefono">Teléfono *</label>
                <input type="tel" id="telefono" name="telefono" placeholder="600 000 000" required autocomplete="tel">
              </div>
            </div>
            <div class="fg">
              <label for="espacio">Nombre del espacio</label>
              <input type="text" id="espacio" name="espacio" placeholder="Finca El Ejemplo, Salón..." autocomplete="organization">
            </div>
            <div class="fg">
              <label for="email">Email *</label>
              <input type="email" id="email" name="email" placeholder="tu@email.com" required autocomplete="email">
            </div>
            <div class="fg">
              <label for="tipo">Tipo de espacio *</label>
              <select id="tipo" name="tipo" required>
                <option value="" disabled selected>Selecciona</option>
                <option value="finca_rural">Finca o hacienda rural</option>
                <option value="salon_urbano">Salón urbano de celebraciones</option>
                <option value="espacio_industrial">Espacio industrial o loft</option>
                <option value="hotel_eventos">Hotel con sala de eventos</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="fg">
              <label for="mensaje">¿Cómo gestionas las solicitudes ahora?</label>
              <textarea id="mensaje" name="mensaje" placeholder="Email, papel, bodas.net... cuéntanos."></textarea>
            </div>
            <div class="rgpd-box">
              <input type="checkbox" id="rgpd" name="rgpd" required>
              <div class="rgpd-text">
                <strong>Consentimiento informado *</strong><br>
                He leído y acepto la <a href="https://www.iarest.es/privacidad" target="_blank">política de privacidad</a>. Consiento que <strong>Alberto Suárez Gutiérrez (NIF 28823484E)</strong>, responsable de ia.rest, trate mis datos para gestionar mi solicitud y enviarme información del servicio. Puedo ejercer mis derechos de acceso, rectificación, supresión y oposición en <a href="mailto:hola@iarest.es">hola@iarest.es</a>.
              </div>
            </div>
            <button type="submit" class="form-submit" id="submitBtn">Solicitar demo gratuita →</button>
            <p class="form-legal">Datos en servidores UE. Cumplimiento RGPD y LOPDGDD. <a href="https://www.iarest.es/privacidad">Política de privacidad</a>.</p>
          </form>
        </div>
        <div class="form-success" id="formSuccess">
          <div class="big">✅</div>
          <h3>¡Recibido!</h3>
          <p>Te contactamos antes de 24 horas para mostrarte cómo funciona en tu espacio.</p>
        </div>
      </div>
    </div>
    <div style="text-align:center;margin-top:24px;font-size:13px;color:#6B5F52">
      O si prefieres contactar directamente —
      <a href="mailto:hola@iarest.es" style="color:#9C8E7E;text-decoration:underline">hola@iarest.es</a>
      · <a href="tel:+34637349990" style="color:#9C8E7E;text-decoration:underline">+34 637 349 990</a>
    </div>
  </div>
</section>

</main>

<footer>
  <div class="footer-inner">
    <div class="footer-logo">ia<span class="dot">.</span>rest</div>
    <nav class="footer-links">
      <a href="https://www.iarest.es">Inicio</a>
      <a href="https://www.iarest.es/catering">Para catering</a>
      <a href="https://www.iarest.es/blog">Blog</a>
      <a href="https://www.instagram.com/iarest.es?igsh=cDdjNDVja3lrcTlk" target="_blank" rel="noopener">Instagram</a>
      <a href="https://www.iarest.es/privacidad">Privacidad</a>
      <a href="https://www.iarest.es/contrato-iarest-v1.pdf">Condiciones</a>
    </nav>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
      <a href="mailto:hola@iarest.es" style="font-size:12px;color:var(--ink3);transition:color .2s" onmouseover="this.style.color='#F6F1E7'" onmouseout="this.style.color='#9C8E7E'">hola@iarest.es</a>
      <a href="tel:+34637349990" style="font-size:12px;color:var(--ink3);transition:color .2s" onmouseover="this.style.color='#F6F1E7'" onmouseout="this.style.color='#9C8E7E'">+34 637 349 990</a>
    </div>
    <span class="footer-copy">© 2026 ia.rest · NIF 28823484E · Sevilla</span>
  </div>
</footer>` }} />
    </>
  )
}
