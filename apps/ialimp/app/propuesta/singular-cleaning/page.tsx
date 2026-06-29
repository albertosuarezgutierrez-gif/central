import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Propuesta ialimp — Singular Cleaning',
}

export default function PropuestaSingularCleaning() {
  return (
    <div dangerouslySetInnerHTML={{ __html: String.raw`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Propuesta ialimp — Singular Cleaning</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --primary:   #1B5EBE;
    --brand:     #1B5EBE;
    --accent:    #3DB346;
    --light:     #EBF3FF;
    --bg:        #f1f5f9;
    --white:     #ffffff;
    --text:      #0f2a5e;
    --body:      #374151;
    --muted:     #6b7280;
    --border:    #e5e7eb;
    --green:     #16a34a;
    --green-bg:  #f0fdf4;
    --green-bd:  #bbf7d0;
  }

  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

  body {
    background: var(--bg);
    color: var(--body);
    font-family: 'Nunito', sans-serif;
    font-size: 15px;
    line-height: 1.6;
    -webkit-text-size-adjust: 100%;
  }

  /* ── HEADER ── */
  header {
    background: var(--white);
    border-bottom: 3px solid var(--primary);
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }

  .logo { display:flex; align-items:center; gap:10px; }

  .logo-svg {
    width: 48px; height: 48px; flex-shrink: 0;
  }

  .logo-text h1 { font-size:1.3rem; font-weight:700; color:var(--primary); }
  .logo-text p  { font-size:0.72rem; color:var(--muted); }

  .header-meta { font-size:0.78rem; color:var(--muted); line-height:1.7; }
  .header-meta strong { color:var(--text); font-weight:600; display:block; }

  /* ── PAGE ── */
  .page { max-width: 860px; margin:0 auto; padding:20px 16px 48px; }

  /* ── HERO ── */
  .hero {
    background: linear-gradient(135deg, var(--primary) 0%, #1a7a3e 100%);
    border-radius:14px;
    padding:40px 32px;
    margin-bottom:16px;
    color:white;
    overflow:hidden;
    position:relative;
  }

  .hero::after {
    content:'';
    position:absolute; top:-40px; right:-40px;
    width:220px; height:220px;
    background:rgba(255,255,255,0.07);
    border-radius:50%;
    pointer-events:none;
  }

  .hero::before {
    content:'';
    position:absolute; bottom:-60px; left:-60px;
    width:200px; height:200px;
    background:rgba(61,179,70,0.15);
    border-radius:50%;
    pointer-events:none;
  }

  .hero-pill {
    display:inline-block;
    background:rgba(255,255,255,0.2);
    font-size:0.68rem; font-weight:600;
    letter-spacing:0.1em; text-transform:uppercase;
    padding:3px 12px; border-radius:20px;
    margin-bottom:14px;
  }

  .hero h2 {
    font-size:clamp(1.6rem, 5vw, 2.4rem);
    font-weight:700; line-height:1.2;
    margin-bottom:12px; letter-spacing:-0.3px;
    position:relative;
  }

  .hero p {
    font-size:0.95rem;
    color:rgba(255,255,255,0.88);
    line-height:1.65;
    position:relative;
    max-width:520px;
  }

  /* ── CARD ── */
  .card {
    background:var(--white);
    border-radius:14px;
    padding:24px 20px;
    border:1px solid var(--border);
    margin-bottom:16px;
    overflow:hidden;
  }

  .section-label {
    font-size:0.68rem; font-weight:600;
    letter-spacing:0.16em; text-transform:uppercase;
    color:var(--accent); margin-bottom:4px;
  }

  .card h3 {
    font-size:1.15rem; font-weight:700;
    color:var(--text); margin-bottom:18px; line-height:1.3;
  }

  /* ── CALCULADORA ── */
  .calc-hero {
    background: linear-gradient(135deg, #EBF3FF 0%, #f0fdf4 100%);
    border-radius: 12px;
    padding: 24px;
    border: 1px solid rgba(27,94,190,0.15);
    margin-bottom: 16px;
  }

  .calc-inputs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 20px;
  }

  @media (max-width: 500px) { .calc-inputs { grid-template-columns: 1fr; } }

  .calc-input-group label {
    display: block;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 6px;
  }

  .calc-input-group input {
    width: 100%;
    padding: 10px 14px;
    border: 2px solid rgba(27,94,190,0.2);
    border-radius: 8px;
    font-family: 'Nunito', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--primary);
    background: white;
    outline: none;
    transition: border-color 0.2s;
  }

  .calc-input-group input:focus {
    border-color: var(--primary);
  }

  .calc-results {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  @media (max-width: 500px) { .calc-results { grid-template-columns: 1fr; } }

  .calc-result-card {
    background: white;
    border-radius: 10px;
    padding: 16px;
    text-align: center;
    border: 1px solid rgba(27,94,190,0.15);
    box-shadow: 0 2px 8px rgba(27,94,190,0.06);
  }

  .calc-result-card .result-val {
    font-size: 1.8rem;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 5px;
  }

  .calc-result-card .result-val.blue { color: var(--primary); }
  .calc-result-card .result-val.green { color: var(--accent); }
  .calc-result-card .result-val.orange { color: #f59e0b; }

  .calc-result-card .result-lbl {
    font-size: 0.74rem;
    color: var(--muted);
    line-height: 1.4;
  }

  /* ── MÓDULOS CON BOTÓN ── */
  .modules {
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap:8px;
  }

  .mod {
    background:var(--light);
    border-radius:10px; padding:14px;
    display:flex; align-items:flex-start; gap:10px;
    border:1px solid rgba(27,94,190,0.15);
  }

  .mod-icon {
    width:30px; height:30px; flex-shrink:0;
    background:var(--white); border-radius:7px;
    display:flex; align-items:center; justify-content:center;
    font-size:0.95rem;
    border:1px solid rgba(27,94,190,0.2);
  }

  .mod strong { font-size:0.82rem; font-weight:600; color:var(--text); display:block; margin-bottom:2px; }
  .mod span   { font-size:0.76rem; color:var(--muted); line-height:1.4; }

  /* ── MÓDULO CARD GRANDE ── */
  .module-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 24px 20px;
    margin-bottom: 16px;
    overflow: hidden;
  }

  .module-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .module-icon-big {
    width: 42px; height: 42px;
    border-radius: 10px;
    background: var(--light);
    border: 1px solid rgba(27,94,190,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem;
    flex-shrink: 0;
  }

  .module-header-text h3 {
    font-size: 1.05rem; font-weight: 700;
    color: var(--text); margin-bottom: 2px;
  }

  .module-header-text span {
    font-size: 0.75rem; color: var(--muted);
  }

  .module-features {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }

  .module-feature {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.82rem;
    color: var(--body);
    line-height: 1.4;
  }

  .module-feature::before {
    content: '✓';
    color: var(--accent);
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .btn-demo {
    display: inline-block;
    background: var(--primary);
    color: white;
    font-family: 'Nunito', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 10px 20px;
    border-radius: 8px;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-demo:hover { opacity: 0.88; }

  .btn-demo-outline {
    display: inline-block;
    background: transparent;
    color: var(--primary);
    border: 2px solid var(--primary);
    font-family: 'Nunito', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 9px 20px;
    border-radius: 8px;
    text-decoration: none;
    cursor: pointer;
    margin-left: 8px;
    transition: all 0.2s;
  }

  .btn-demo-outline:hover { background: var(--light); }

  .btn-accent {
    display: inline-block;
    background: var(--accent);
    color: white;
    font-family: 'Nunito', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    padding: 10px 20px;
    border-radius: 8px;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-accent:hover { opacity: 0.88; }

  /* ── QR BOX ── */
  .qr-box {
    background: var(--light);
    border: 1px solid rgba(27,94,190,0.2);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 14px;
    flex-wrap: wrap;
  }

  .qr-img {
    width: 90px; height: 90px;
    background: white;
    border-radius: 8px;
    border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .qr-img img { width: 88px; height: 88px; }

  .qr-text strong { font-size: 0.88rem; color: var(--text); display: block; margin-bottom: 4px; }
  .qr-text p { font-size: 0.78rem; color: var(--muted); line-height: 1.5; }
  .qr-text code {
    display: inline-block;
    background: white;
    border: 1px solid rgba(27,94,190,0.2);
    border-radius: 4px;
    padding: 2px 8px;
    font-family: 'Courier New', monospace;
    font-size: 0.82rem;
    color: var(--primary);
    margin-top: 4px;
  }

  /* ── WOW BOX ── */
  .wow-box {
    background: linear-gradient(135deg, #f0fdf4, #EBF3FF);
    border: 1px solid rgba(61,179,70,0.3);
    border-radius: 10px;
    padding: 14px 16px;
    margin-top: 12px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .wow-box .wow-emoji { font-size: 1.4rem; flex-shrink: 0; }
  .wow-box strong { font-size: 0.88rem; color: var(--text); display: block; margin-bottom: 3px; }
  .wow-box p { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }

  /* ── PRECIO ── */
  .price-seasonal {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  @media (max-width: 480px) { .price-seasonal { grid-template-columns: 1fr; } }

  .price-season-card {
    border-radius: 12px;
    padding: 22px 18px;
    position: relative;
    overflow: hidden;
  }

  .price-season-card.verano {
    background: var(--primary);
    color: white;
  }

  .price-season-card.invierno {
    background: var(--light);
    border: 2px solid rgba(27,94,190,0.2);
    color: var(--text);
  }

  .season-badge {
    display: inline-block;
    font-size: 0.62rem; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 3px 10px; border-radius: 20px; margin-bottom: 10px;
  }

  .price-season-card.verano .season-badge {
    background: rgba(255,255,255,0.2);
    color: white;
  }

  .price-season-card.invierno .season-badge {
    background: rgba(27,94,190,0.12);
    color: var(--primary);
  }

  .season-name { font-size: 0.92rem; font-weight: 600; margin-bottom: 6px; }
  .season-users { font-size: 0.76rem; opacity: 0.75; margin-bottom: 14px; }

  .season-price {
    font-size: 2.6rem; font-weight: 700; line-height: 1;
    margin-bottom: 4px; letter-spacing: -1px;
  }

  .season-price sup { font-size: 1rem; vertical-align: top; margin-top: 6px; }
  .season-price sub { font-size: 0.8rem; font-weight: 300; opacity: 0.7; }

  .price-season-card.verano .season-features { color: rgba(255,255,255,0.85); }
  .price-season-card.invierno .season-features { color: var(--muted); }

  .season-features { font-size: 0.78rem; margin-top: 12px; line-height: 1.8; }

  .price-formula {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px;
    margin-bottom: 12px;
  }

  .calc-line {
    display:flex; justify-content:space-between; align-items:center;
    font-size:0.83rem; color:var(--body);
    padding:6px 0; border-bottom:1px solid var(--border);
  }

  .calc-line:last-child { border-bottom:none; }

  .calc-line.total {
    font-weight:600; color:var(--primary); font-size:0.95rem;
    border-top:2px solid var(--primary); border-bottom:none;
    padding-top:9px; margin-top:2px;
  }

  .flex-tag {
    display:flex; align-items:flex-start; gap:8px;
    background:var(--green-bg);
    border:1px solid var(--green-bd);
    border-radius:8px; padding:12px 14px;
    font-size:0.82rem; color:var(--green);
    font-weight:500; line-height:1.5;
    margin-top: 10px;
  }

  /* ── PREGUNTAS FASE 3 ── */
  .questions-card {
    background: #fffbeb;
    border: 2px dashed #f59e0b;
    border-radius: 14px;
    padding: 22px 20px;
    margin-bottom: 16px;
  }

  .questions-card .q-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }

  .q-badge {
    display: inline-block;
    background: #f59e0b;
    color: white;
    font-size: 0.65rem; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 3px 10px; border-radius: 20px;
  }

  .q-title { font-size: 1rem; font-weight: 700; color: #92400e; }

  .questions-list { display: flex; flex-direction: column; gap: 8px; }

  .question-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: white;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 12px 14px;
  }

  .q-num {
    width: 22px; height: 22px;
    background: #f59e0b;
    color: white;
    border-radius: 50%;
    font-size: 0.7rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .question-item p { font-size: 0.83rem; color: #78350f; line-height: 1.5; }

  /* ── CTA FINAL ── */
  .cta-card {
    background: linear-gradient(135deg, var(--primary) 0%, #1a7a3e 100%);
    border-radius: 14px;
    padding: 32px 28px;
    margin-bottom: 16px;
    color: white;
    text-align: center;
  }

  .cta-card h3 { font-size: 1.6rem; font-weight: 700; margin-bottom: 8px; }
  .cta-card p { font-size: 0.9rem; color: rgba(255,255,255,0.85); margin-bottom: 24px; }

  .cta-form {
    background: white;
    border-radius: 12px;
    padding: 22px;
    text-align: left;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }

  @media (max-width: 500px) { .form-grid { grid-template-columns: 1fr; } }

  .form-field label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 5px;
  }

  .form-field input,
  .form-field select {
    width: 100%;
    padding: 10px 12px;
    border: 1.5px solid var(--border);
    border-radius: 7px;
    font-family: 'Nunito', sans-serif;
    font-size: 0.88rem;
    color: var(--text);
    background: white;
    outline: none;
    transition: border-color 0.2s;
  }

  .form-field input:focus,
  .form-field select:focus {
    border-color: var(--primary);
  }

  .form-full { grid-column: 1 / -1; }

  .btn-submit {
    width: 100%;
    background: var(--primary);
    color: white;
    font-family: 'Nunito', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    padding: 13px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    margin-top: 4px;
    transition: opacity 0.2s;
  }

  .btn-submit:hover { opacity: 0.88; }

  .form-success {
    display: none;
    text-align: center;
    padding: 20px;
  }

  .form-success .s-emoji { font-size: 2.5rem; display: block; margin-bottom: 10px; }
  .form-success strong { font-size: 1.1rem; color: var(--text); display: block; margin-bottom: 6px; }
  .form-success p { font-size: 0.85rem; color: var(--muted); }

  /* ── ACCESS BOX ── */
  .access-box {
    background:var(--white);
    border:1px solid rgba(27,94,190,0.2);
    border-radius:8px; padding:14px 16px;
    margin-top:12px;
    font-size:0.82rem; color:var(--body); line-height:2;
    overflow-x:auto;
    word-break:break-all;
  }

  .access-box code {
    background:var(--light);
    border:1px solid rgba(27,94,190,0.25);
    border-radius:4px; padding:2px 8px;
    font-family:'Courier New', monospace;
    font-size:0.8rem; color:var(--primary);
    word-break:break-all;
  }

  /* ── FOOTER ── */
  footer {
    background:var(--white);
    border-top:1px solid var(--border);
    border-radius:14px;
    padding:20px;
    display:flex; justify-content:space-between;
    align-items:center; flex-wrap:wrap; gap:12px;
    margin-top:16px;
  }

  .footer-logo {
    display: flex; align-items: center; gap: 8px;
    font-size:1.1rem; font-weight:700; color:var(--primary);
  }

  .footer-info { font-size:0.78rem; color:var(--muted); text-align:right; line-height:1.7; }
  .footer-info a { color:var(--brand); text-decoration:none; }

  @media (max-width:480px) {
    .footer-info { text-align:left; }
    header { flex-direction:column; }
  }
</style>
</head>
<body>

<header>
  <div class="logo">
    <!-- Logo Singular Cleaning (SC monograma azul/verde) -->
    <svg class="logo-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="10" fill="#1B5EBE"/>
      <text x="24" y="32" font-family="Georgia, serif" font-size="22" font-weight="700" fill="white" text-anchor="middle">SC</text>
      <rect x="0" y="38" width="48" height="10" rx="0" fill="#3DB346"/>
      <rect x="0" y="38" width="48" height="10" rx="10" fill="#3DB346"/>
    </svg>
    <div class="logo-text">
      <h1>Singular Cleaning</h1>
      <p>Gestión inteligente con ialimp</p>
    </div>
  </div>
  <div class="header-meta">
    <strong>Propuesta comercial</strong>
    Para: Singular Cleaning — Rafa<br>
    29 de junio de 2026 · Ref: IALI-SC01
  </div>
</header>

<div class="page">

  <!-- HERO -->
  <div class="hero">
    <div class="hero-pill">Demo activo — acceso inmediato</div>
    <h2>Lleva Singular Cleaning<br>al siguiente nivel.</h2>
    <p>Coordina tu equipo de limpiadoras, gestiona reservas, factura a gestoras y controla el stock — todo desde una sola plataforma. Sin WhatsApp. Sin Excel. En tiempo real desde el móvil.</p>
  </div>

  <!-- 01 CALCULADORA DE AHORRO -->
  <div class="card">
    <div class="section-label">01 — Calculadora de ahorro</div>
    <h3>¿Cuánto tiempo (y dinero) pierdes coordinando?</h3>
    <div class="calc-hero">
      <div class="calc-inputs">
        <div class="calc-input-group">
          <label>Limpiezas por semana</label>
          <input type="number" id="calc-limpiezas" value="50" min="1" max="500" oninput="calcAhorro()">
        </div>
        <div class="calc-input-group">
          <label>Minutos de coordinación por limpieza</label>
          <input type="number" id="calc-minutos" value="10" min="1" max="60" oninput="calcAhorro()">
        </div>
      </div>
      <div class="calc-results">
        <div class="calc-result-card">
          <div class="result-val blue" id="res-horas">33h</div>
          <div class="result-lbl">horas/mes en coordinación</div>
        </div>
        <div class="calc-result-card">
          <div class="result-val green" id="res-ahorro">500€</div>
          <div class="result-lbl">ahorro estimado/mes<br>(a 15€/hora)</div>
        </div>
        <div class="calc-result-card">
          <div class="result-val orange" id="res-semanas">8</div>
          <div class="result-lbl">semanas al año recuperadas</div>
        </div>
      </div>
    </div>
    <p style="font-size:0.8rem;color:var(--muted);margin-top:8px;">Con ialimp la coordinación pasa a ser automática: la limpiadora ve sus pisos del día en el móvil, sin que tú tengas que mandarle nada.</p>
  </div>

  <!-- 02 PLANIFICACIÓN AUTOMÁTICA -->
  <div class="module-card">
    <div class="section-label">02 — Módulo</div>
    <div class="module-header">
      <div class="module-icon-big">🗓️</div>
      <div class="module-header-text">
        <h3>Planificación automática</h3>
        <span>La IA asigna la limpiadora correcta al piso correcto</span>
      </div>
    </div>
    <div class="module-features">
      <div class="module-feature">Dashboard del día con todos los pisos</div>
      <div class="module-feature">Agenda semanal por limpiadora</div>
      <div class="module-feature">Asignación automática según disponibilidad</div>
      <div class="module-feature">Notificación push cuando se asigna una sesión</div>
      <div class="module-feature">Vista de mapa con los pisos del día</div>
      <div class="module-feature">Ventanas de tiempo entre reservas</div>
    </div>
    <a href="/admin" class="btn-demo">Ver panel admin →</a>
  </div>

  <!-- 03 APP LIMPIADORA -->
  <div class="module-card">
    <div class="section-label">03 — Módulo</div>
    <div class="module-header">
      <div class="module-icon-big">📱</div>
      <div class="module-header-text">
        <h3>App de limpiadora</h3>
        <span>Sin instalar nada — funciona desde el navegador del móvil</span>
      </div>
    </div>
    <div class="module-features">
      <div class="module-feature">Pisos del día con hora y dirección</div>
      <div class="module-feature">Checklist por habitación</div>
      <div class="module-feature">Fotos de evidencia (baño, cama, cocina)</div>
      <div class="module-feature">Acceso por PIN — sin usuario ni contraseña</div>
      <div class="module-feature">Chat con la coordinadora por sesión</div>
      <div class="module-feature">Firma al cerrar la limpieza</div>
    </div>
    <a href="/l/login" class="btn-demo">Entrar como limpiadora →</a>
    <a href="/l/login" class="btn-demo-outline">PIN demo: 1111</a>

    <div class="wow-box" style="margin-top:16px;">
      <span class="wow-emoji">📲</span>
      <div>
        <strong>Momento WOW: Enviar acceso por WhatsApp</strong>
        <p>En el panel de equipo, haz clic en "📲 Enviar acceso" junto a una limpiadora. Se genera un enlace mágico que puedes pegar en WhatsApp. La limpiadora entra directamente — sin PIN, sin contraseña, sin fricción.</p>
      </div>
    </div>

    <div class="qr-box">
      <div class="qr-img">
        <!-- QR que apunta a /l/login -->
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=https://app.ialimp.es/l/login" alt="QR acceso limpiadora" width="88" height="88">
      </div>
      <div class="qr-text">
        <strong>Escanea con tu móvil ahora</strong>
        <p>Prueba la app de limpiadora en tu teléfono.<br>Introduce el PIN de María:</p>
        <code>PIN: 1111</code>
      </div>
    </div>
  </div>

  <!-- 04 PORTAL PROPIETARIO/GESTORA -->
  <div class="module-card">
    <div class="section-label">04 — Módulo</div>
    <div class="module-header">
      <div class="module-icon-big">🏠</div>
      <div class="module-header-text">
        <h3>Portal del propietario / gestora</h3>
        <span>Cada gestora ve sus pisos en tiempo real</span>
      </div>
    </div>
    <div class="module-features">
      <div class="module-feature">Historial de limpiezas por propiedad</div>
      <div class="module-feature">Fotos de cada sesión</div>
      <div class="module-feature">Estado en tiempo real (en curso / completado)</div>
      <div class="module-feature">Incidencias y notas por piso</div>
      <div class="module-feature">Sincronización iCal automática</div>
      <div class="module-feature">Sin acceso al resto de datos — 100% privado</div>
    </div>
    <a href="/admin/clientes" class="btn-demo">Ver portal gestoras →</a>

    <div class="wow-box">
      <span class="wow-emoji">🔗</span>
      <div>
        <strong>Momento WOW: Sync iCal en vivo</strong>
        <p>En el panel de clientes, pega una URL iCal real de Airbnb o Booking. En segundos aparecen los checkouts como sesiones de limpieza asignadas automáticamente.</p>
      </div>
    </div>
  </div>

  <!-- 05 FACTURACIÓN -->
  <div class="module-card">
    <div class="section-label">05 — Módulo</div>
    <div class="module-header">
      <div class="module-icon-big">💰</div>
      <div class="module-header-text">
        <h3>Facturación integrada</h3>
        <span>El objetivo a medio plazo: adiós a Holded</span>
      </div>
    </div>
    <div class="module-features">
      <div class="module-feature">Facturas PDF con desglose por piso</div>
      <div class="module-feature">Envío automático por email a las gestoras</div>
      <div class="module-feature">Generación masiva el día 1 de cada mes</div>
      <div class="module-feature">Historial de facturas por cliente</div>
      <div class="module-feature">Numeración automática correlativa</div>
      <div class="module-feature">Control de cobros y estados</div>
    </div>
    <a href="/admin/facturacion" class="btn-demo">Ver facturación →</a>

    <div class="wow-box">
      <span class="wow-emoji">📄</span>
      <div>
        <strong>Ya existe una factura de demo</strong>
        <p>GestaPisos Sevilla SL · Junio 2026 · 3 pisos · 450€ + IVA. Generada automáticamente desde las sesiones del mes. Esto es lo que hoy haces a mano.</p>
      </div>
    </div>
  </div>

  <!-- 06 STOCK -->
  <div class="module-card">
    <div class="section-label">06 — Módulo</div>
    <div class="module-header">
      <div class="module-icon-big">🧴</div>
      <div class="module-header-text">
        <h3>Control de stock</h3>
        <span>Saber exactamente qué hay y qué hay que reponer</span>
      </div>
    </div>
    <div class="module-features">
      <div class="module-feature">Inventario de productos por empresa</div>
      <div class="module-feature">Consumo registrado por sesión</div>
      <div class="module-feature">Foto del producto (reconocimiento visual)</div>
      <div class="module-feature">Alertas de stock mínimo</div>
      <div class="module-feature">Estimación de coste por limpieza</div>
      <div class="module-feature">Histórico de consumo mensual</div>
    </div>
    <a href="/admin/materiales" class="btn-demo">Ver materiales →</a>

    <div class="wow-box" style="margin-top:16px">
      <span class="wow-emoji">📷</span>
      <div>
        <strong>Escaneo de bultos QR — cero errores de entrega</strong>
        <p>Cada caja o bolsa de ropa lleva un código QR único. El repartidor lo escanea desde su móvil antes de cargar: si el código no coincide con la parada, la app lo avisa al instante. Se acabaron las cajas cambiadas y las limpiadoras sin material.</p>
      </div>
    </div>
  </div>

  <!-- 07 RRHH -->
  <div class="module-card">
    <div class="section-label">07 — Módulo</div>
    <div class="module-header">
      <div class="module-icon-big">👥</div>
      <div class="module-header-text">
        <h3>RR.HH. y nóminas</h3>
        <span>El expediente digital de cada limpiadora</span>
      </div>
    </div>
    <div class="module-features">
      <div class="module-feature">Expediente digital por empleada</div>
      <div class="module-feature">Control de ausencias y vacaciones</div>
      <div class="module-feature">Nómina PDF automática mensual</div>
      <div class="module-feature">Firma OTP por SMS (sin papel)</div>
      <div class="module-feature">Contratos y documentos adjuntos</div>
      <div class="module-feature">Historial de sesiones por limpiadora</div>
    </div>
    <a href="/admin/rrhh" class="btn-demo">Ver RR.HH. →</a>
  </div>

  <!-- 08 PRECIO -->
  <div class="card">
    <div class="section-label">08 — Precio</div>
    <h3>Precio transparente. Adaptado a negocio estacional.</h3>
    <div class="price-seasonal">
      <div class="price-season-card verano">
        <div class="season-badge">☀️ Temporada alta</div>
        <div class="season-name">Pico de verano</div>
        <div class="season-users">50-60 usuarios activos</div>
        <div class="season-price"><sup>€</sup>850<sub>/mes</sub></div>
        <div class="season-features">
          100€ base + hasta 60 usuarios × 12,50€<br>
          Equipo completo activo
        </div>
      </div>
      <div class="price-season-card invierno">
        <div class="season-badge">❄️ Temporada baja</div>
        <div class="season-name">Invierno / valle</div>
        <div class="season-users">20-30 usuarios activos</div>
        <div class="season-price"><sup>€</sup>450<sub>/mes</sub></div>
        <div class="season-features" style="color:var(--muted);">
          100€ base + hasta 30 usuarios × 11,67€<br>
          Solo pagas por quienes trabajan
        </div>
      </div>
    </div>
    <div class="price-formula">
      <h4 style="font-size:0.68rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Cómo se calcula</h4>
      <div class="calc-line"><span>Panel base (acceso admin)</span><strong>100 €/mes</strong></div>
      <div class="calc-line"><span>Cada usuario activo ese mes</span><strong>12,50 €/mes</strong></div>
      <div class="calc-line"><span>Ejemplo verano: 60 usuarios</span><span>750 €</span></div>
      <div class="calc-line total"><span>Total verano</span><span>850 €/mes</span></div>
    </div>
    <div class="flex-tag">
      <span>🌴</span>
      <span>Si una limpiadora no trabaja ese mes, se desactiva y no se cobra. <strong>Sin permanencia.</strong> Sin coste de desarrollo. Sin sorpresas.</span>
    </div>
  </div>

  <!-- 09 ACCESO DEMO -->
  <div class="card">
    <div class="section-label">09 — Demo activo</div>
    <h3>Prueba ya — datos de Singular Cleaning cargados</h3>
    <div class="modules" style="margin-bottom:16px;">
      <div class="mod"><div class="mod-icon">🏢</div><div><strong>GestaPisos Sevilla SL</strong><span>3 pisos en Triana y Centro</span></div></div>
      <div class="mod"><div class="mod-icon">🏡</div><div><strong>Andalucía VFT Gestión SL</strong><span>3 aptos en Macarena, Nervión, Alameda</span></div></div>
      <div class="mod"><div class="mod-icon">👩</div><div><strong>María Sánchez</strong><span>PIN 1111 · lun-vie + sáb mañana</span></div></div>
      <div class="mod"><div class="mod-icon">👩</div><div><strong>Carmen Ruiz</strong><span>PIN 2222 · lun-vie turno completo</span></div></div>
      <div class="mod"><div class="mod-icon">👩</div><div><strong>Lucía Moreno</strong><span>PIN 3333 · mar-sáb turno mañana</span></div></div>
      <div class="mod"><div class="mod-icon">📅</div><div><strong>5 sesiones hoy</strong><span>3 pendientes · 2 completadas</span></div></div>
    </div>
    <div class="access-box">
      <strong>Acceso admin (Singular Cleaning):</strong><br>
      <code>app.ialimp.es/login</code><br>
      Usuario: <code>info@singularcleaning.es</code><br>
      Contraseña: <code>1234</code>
    </div>
    <div style="margin-top:10px;">
      <a href="/login" class="btn-demo" style="font-size:1rem;padding:12px 28px;">Entrar al demo →</a>
    </div>
  </div>

  <!-- 10 PREGUNTAS FASE 3 -->
  <div class="questions-card">
    <div class="q-header">
      <div class="q-badge">Solo Alberto</div>
      <div class="q-title">Guía fase 3 — Escucha activa</div>
    </div>
    <div class="questions-list">
      <div class="question-item"><div class="q-num">1</div><p>¿Qué hace vuestra herramienta actual que os parece <strong>imprescindible</strong>? ¿Qué no podéis perder?</p></div>
      <div class="question-item"><div class="q-num">2</div><p>¿Cuál es el mayor <strong>dolor del día a día</strong> operativo? ¿Qué es lo que más os cuesta?</p></div>
      <div class="question-item"><div class="q-num">3</div><p>¿<strong>Cuántos clientes/gestoras</strong> tenéis ahora mismo? ¿Cuántos pisos en total?</p></div>
      <div class="question-item"><div class="q-num">4</div><p>¿Las gestoras usan algún <strong>PMS</strong>? (Smoobu, Lodgify, Airbnb directo, Booking...)</p></div>
      <div class="question-item"><div class="q-num">5</div><p>¿<strong>Cuánto os cuesta</strong> mantener vuestra herramienta actual? (desarrollo + Holded + otras licencias)</p></div>
      <div class="question-item"><div class="q-num">6</div><p>Si pudierais cambiar <strong>una sola cosa</strong> de cómo trabajáis hoy, ¿qué sería?</p></div>
    </div>
  </div>

  <!-- 11 CTA FINAL -->
  <div class="cta-card">
    <h3>¿Cuándo empezamos?</h3>
    <p>Cuéntanos cuándo queréis arrancar el piloto y os lo tenemos listo en 24h.</p>
    <div class="cta-form">
      <div class="form-grid" id="cta-form-fields">
        <div class="form-field">
          <label>Nombre</label>
          <input type="text" id="f-nombre" placeholder="Rafa" autocomplete="off">
        </div>
        <div class="form-field">
          <label>Email</label>
          <input type="email" id="f-email" placeholder="rafa@singularcleaning.es" autocomplete="off">
        </div>
        <div class="form-field">
          <label>Teléfono</label>
          <input type="tel" id="f-tel" placeholder="600 000 000">
        </div>
        <div class="form-field">
          <label>¿Cuándo queréis empezar?</label>
          <select id="f-fecha">
            <option value="">Seleccionar...</option>
            <option value="esta_semana">Esta semana</option>
            <option value="proxima_semana">Próxima semana</option>
            <option value="julio">En julio</option>
            <option value="sin_prisa">Sin prisa, seguimos hablando</option>
          </select>
        </div>
      </div>
      <button class="btn-submit" onclick="enviarLead()">Reservar mi demo personalizado →</button>
      <div class="form-success" id="form-success">
        <span class="s-emoji">🎉</span>
        <strong>¡Perfecto, Rafa!</strong>
        <p>Alberto se pondrá en contacto contigo en menos de 24 horas para prepararlo todo.</p>
      </div>
    </div>
  </div>

  <footer>
    <div class="footer-logo">
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="10" fill="#1B5EBE"/>
        <text x="24" y="32" font-family="Georgia, serif" font-size="22" font-weight="700" fill="white" text-anchor="middle">SC</text>
        <rect x="0" y="38" width="48" height="10" rx="10" fill="#3DB346"/>
      </svg>
      ialimp para Singular Cleaning
    </div>
    <div class="footer-info">
      Alberto Suárez Gutiérrez<br>
      <a href="mailto:alberto.suarez.gutierrez@gmail.com">alberto.suarez.gutierrez@gmail.com</a> · app.ialimp.es
    </div>
  </footer>

</div>

<script>
function calcAhorro() {
  var limpiezas = parseFloat(document.getElementById('calc-limpiezas').value) || 0;
  var minutos = parseFloat(document.getElementById('calc-minutos').value) || 0;
  var horasMes = Math.round(limpiezas * 4.33 * minutos / 60);
  var ahorroEuros = Math.round(horasMes * 15);
  var semanas = Math.round(horasMes * 12 / 40);
  document.getElementById('res-horas').textContent = horasMes + 'h';
  document.getElementById('res-ahorro').textContent = ahorroEuros + '€';
  document.getElementById('res-semanas').textContent = semanas;
}

function enviarLead() {
  var nombre = document.getElementById('f-nombre').value.trim();
  var email = document.getElementById('f-email').value.trim();
  var tel = document.getElementById('f-tel').value.trim();
  var fecha = document.getElementById('f-fecha').value;
  if (!nombre || !email) {
    alert('Por favor indica al menos tu nombre y email.');
    return;
  }
  fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: nombre,
      email: email,
      telefono: tel,
      fecha_inicio: fecha,
      empresa: 'Singular Cleaning',
      fuente: 'propuesta-singular-cleaning'
    })
  }).then(function() {
    document.getElementById('cta-form-fields').style.display = 'none';
    document.querySelector('.btn-submit').style.display = 'none';
    document.getElementById('form-success').style.display = 'block';
  }).catch(function() {
    document.getElementById('cta-form-fields').style.display = 'none';
    document.querySelector('.btn-submit').style.display = 'none';
    document.getElementById('form-success').style.display = 'block';
  });
}

// Init calculator
calcAhorro();
</script>

</body>
</html>
` }} />
  )
}
