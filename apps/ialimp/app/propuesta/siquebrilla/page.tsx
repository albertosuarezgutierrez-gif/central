import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Propuesta ialimp — Sique Brilla SL',
}

export default function PropuestaSiqueBrilla() {
  return (
    <div dangerouslySetInnerHTML={{ __html: String.raw`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Propuesta ialimp — Sique Brilla SL</title>
<style>
  :root {
    --primary:   #4f46e5;
    --brand:     #6366f1;
    --light:     #eef2ff;
    --bg:        #f1f5f9;
    --white:     #ffffff;
    --text:      #1e1b4b;
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
    padding: 20px 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }

  .logo { display:flex; align-items:center; gap:10px; }

  .logo-icon {
    width:40px; height:40px;
    background: var(--primary);
    border-radius:10px;
    display:flex; align-items:center; justify-content:center;
    font-size:1.2rem; font-weight:700; color:white;
    flex-shrink:0;
  }

  .logo-text h1 { font-size:1.3rem; font-weight:600; color:var(--text); }
  .logo-text p  { font-size:0.72rem; color:var(--muted); }

  .header-meta { font-size:0.78rem; color:var(--muted); line-height:1.7; }
  .header-meta strong { color:var(--text); font-weight:600; display:block; }

  /* ── PAGE ── */
  .page { max-width: 860px; margin:0 auto; padding:20px 16px 48px; }

  /* ── HERO ── */
  .hero {
    background: linear-gradient(135deg, var(--primary) 0%, var(--brand) 100%);
    border-radius:14px;
    padding:36px 28px;
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

  .hero-pill {
    display:inline-block;
    background:rgba(255,255,255,0.2);
    font-size:0.68rem; font-weight:500;
    letter-spacing:0.1em; text-transform:uppercase;
    padding:3px 12px; border-radius:20px;
    margin-bottom:14px;
  }

  .hero h2 {
    font-size:clamp(1.6rem, 5vw, 2.2rem);
    font-weight:600; line-height:1.2;
    margin-bottom:12px; letter-spacing:-0.3px;
    position:relative;
  }

  .hero p {
    font-size:0.92rem;
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
    color:var(--brand); margin-bottom:4px;
  }

  .card h3 {
    font-size:1.15rem; font-weight:600;
    color:var(--text); margin-bottom:18px; line-height:1.3;
  }

  /* ── PROBLEMAS ── */
  .problems {
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap:10px;
  }

  .problem {
    background:var(--bg);
    border-radius:10px; padding:14px;
    border:1px solid var(--border);
  }

  .problem .emoji { font-size:1.2rem; margin-bottom:6px; display:block; }
  .problem p { font-size:0.8rem; color:var(--muted); line-height:1.5; }

  /* ── MÓDULOS ── */
  .modules {
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap:8px;
  }

  .mod {
    background:var(--light);
    border-radius:10px; padding:14px 14px;
    display:flex; align-items:flex-start; gap:10px;
    border:1px solid rgba(99,102,241,0.15);
  }

  .mod-icon {
    width:30px; height:30px; flex-shrink:0;
    background:var(--white); border-radius:7px;
    display:flex; align-items:center; justify-content:center;
    font-size:0.95rem;
    border:1px solid rgba(99,102,241,0.2);
  }

  .mod strong { font-size:0.82rem; font-weight:600; color:var(--text); display:block; margin-bottom:2px; }
  .mod span   { font-size:0.76rem; color:var(--muted); line-height:1.4; }

  /* ── FLUJO ── */
  .flow {
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(130px,1fr));
    gap:8px;
  }

  .flow-step {
    background:var(--bg);
    border:1px solid var(--border);
    border-radius:10px;
    padding:16px 12px;
    text-align:center;
  }

  .flow-step .step-n {
    font-size:0.6rem; font-weight:600;
    letter-spacing:0.1em; text-transform:uppercase;
    color:var(--brand); margin-bottom:5px;
  }

  .flow-step .step-e { font-size:1.3rem; margin-bottom:5px; display:block; }
  .flow-step p { font-size:0.76rem; color:var(--muted); line-height:1.4; }

  /* ── PRECIO ── */
  .price-main {
    background:var(--primary);
    border-radius:12px; padding:26px 22px;
    color:white; margin-bottom:12px;
    position:relative; overflow:hidden;
  }

  .price-main::before {
    content:''; position:absolute;
    bottom:-30px; right:-30px;
    width:160px; height:160px;
    background:rgba(255,255,255,0.07);
    border-radius:50%;
  }

  .price-badge {
    display:inline-block;
    background:rgba(255,255,255,0.2);
    font-size:0.62rem; font-weight:600;
    letter-spacing:0.1em; text-transform:uppercase;
    padding:3px 10px; border-radius:20px; margin-bottom:12px;
  }

  .price-name { font-size:1.05rem; font-weight:600; margin-bottom:3px; }
  .price-sub  { font-size:0.78rem; color:rgba(255,255,255,0.72); margin-bottom:16px; }

  .price-amount {
    font-size:3rem; font-weight:600; line-height:1;
    margin-bottom:3px; letter-spacing:-1px;
  }

  .price-amount sup { font-size:1.1rem; vertical-align:top; margin-top:8px; }
  .price-amount sub { font-size:0.8rem; font-weight:300; color:rgba(255,255,255,0.7); }

  .price-detail { font-size:0.76rem; color:rgba(255,255,255,0.62); margin-bottom:18px; }

  .price-features { list-style:none; display:flex; flex-direction:column; gap:7px; }

  .price-features li {
    font-size:0.82rem; color:rgba(255,255,255,0.9);
    display:flex; align-items:flex-start; gap:8px; line-height:1.4;
  }

  .price-features li::before { content:'✓'; color:#a5f3fc; font-weight:700; flex-shrink:0; }

  .price-detail-card {
    background:var(--bg);
    border-radius:12px; padding:22px 18px;
    border:1px solid var(--border);
    display:flex; flex-direction:column; gap:18px;
  }

  .detail-block h4 {
    font-size:0.68rem; font-weight:600;
    letter-spacing:0.12em; text-transform:uppercase;
    color:var(--muted); margin-bottom:8px;
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
  }

  /* ── ROI ── */
  .roi-grid {
    display:grid;
    grid-template-columns: repeat(3,1fr);
    gap:10px; margin-bottom:16px;
  }

  @media (max-width:500px) { .roi-grid { grid-template-columns:1fr; } }

  .roi-stat {
    background:var(--light);
    border-radius:10px; padding:16px;
    text-align:center;
    border:1px solid rgba(99,102,241,0.15);
  }

  .roi-stat .val {
    font-size:1.7rem; font-weight:600;
    color:var(--primary); line-height:1; margin-bottom:5px;
  }

  .roi-stat .lbl { font-size:0.76rem; color:var(--muted); line-height:1.4; }

  .roi-note {
    background:var(--light);
    border-left:4px solid var(--primary);
    border-radius:0 10px 10px 0;
    padding:14px 16px;
    font-size:0.83rem; color:var(--body); line-height:1.6;
  }

  .roi-note strong { color:var(--primary); }

  /* ── PASOS ── */
  .steps-list { display:flex; flex-direction:column; gap:10px; }

  .step-item {
    display:flex; align-items:flex-start; gap:14px;
    background:var(--bg);
    border:1px solid var(--border);
    border-radius:10px; padding:16px 16px;
  }

  .step-circle {
    width:28px; height:28px; border-radius:50%;
    background:var(--primary); color:white;
    font-size:0.8rem; font-weight:600;
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0; margin-top:1px;
  }

  .step-item strong {
    font-size:0.88rem; font-weight:600;
    color:var(--text); display:block; margin-bottom:3px;
  }

  .step-item p { font-size:0.8rem; color:var(--muted); line-height:1.5; }

  .access-box {
    background:var(--white);
    border:1px solid rgba(99,102,241,0.2);
    border-radius:8px; padding:12px 14px;
    margin-top:10px;
    font-size:0.8rem; color:var(--body); line-height:1.9;
    overflow-x:auto;
    word-break:break-all;
  }

  .access-box code {
    background:var(--light);
    border:1px solid rgba(99,102,241,0.25);
    border-radius:4px; padding:1px 6px;
    font-family:'Courier New', monospace;
    font-size:0.78rem; color:var(--primary);
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

  .footer-logo { font-size:1.1rem; font-weight:600; color:var(--primary); }
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
    <div class="logo-icon">i</div>
    <div class="logo-text">
      <h1>ialimp</h1>
      <p>Gestión inteligente de limpieza</p>
    </div>
  </div>
  <div class="header-meta">
    <strong>Propuesta comercial</strong>
    Para: Sique Brilla SL — Vanessa Cruz<br>
    29 de mayo de 2026 · Ref: IALI-SB01
  </div>
</header>

<div class="page">

  <!-- HERO -->
  <div class="hero">
    <div class="hero-pill">Acceso piloto activo</div>
    <h2>Tu empresa de limpieza,<br>automatizada de verdad.</h2>
    <p>ialimp conecta reservas, limpiadoras y clientes en una sola plataforma. Cero WhatsApp. Cero Excel. Todo en tiempo real desde el móvil.</p>
  </div>

  <!-- 01 PROBLEMA -->
  <div class="card">
    <div class="section-label">01 — El problema actual</div>
    <h3>¿Cuánto tiempo pierdes en esto cada día?</h3>
    <div class="problems">
      <div class="problem"><span class="emoji">📱</span><p>Coordinar limpiadoras por WhatsApp. Mensajes que se pierden, confirmaciones que no llegan.</p></div>
      <div class="problem"><span class="emoji">🗓️</span><p>Revisar iCals de cada cliente cada mañana para saber cuándo hay checkout.</p></div>
      <div class="problem"><span class="emoji">📸</span><p>Sin evidencia fotográfica. Si el huésped reclama, no hay forma de responder.</p></div>
      <div class="problem"><span class="emoji">📊</span><p>Calcular nóminas y facturas manualmente cada mes. Horas perdidas en Excel.</p></div>
      <div class="problem"><span class="emoji">🧺</span><p>Sin sistema de lencería ni stock. No saber qué hay en cada piso ni qué reponer.</p></div>
      <div class="problem"><span class="emoji">📈</span><p>Sin datos de rentabilidad. Imposible saber el margen real por cliente o limpiadora.</p></div>
    </div>
  </div>

  <!-- 02 MÓDULOS -->
  <div class="card">
    <div class="section-label">02 — Lo que incluye ialimp</div>
    <h3>Todo lo que necesitas. Ya desarrollado.</h3>
    <div class="modules">
      <div class="mod"><div class="mod-icon">🔄</div><div><strong>Sync automático reservas</strong><span>Checkout en Booking o Smoobu → limpieza generada sola.</span></div></div>
      <div class="mod"><div class="mod-icon">📱</div><div><strong>App móvil limpiadoras</strong><span>Pisos del día, checklist, fotos. Sin instalar nada.</span></div></div>
      <div class="mod"><div class="mod-icon">📋</div><div><strong>Checklist + fotos</strong><span>Cada limpieza cierra con evidencia fotográfica en puntos críticos.</span></div></div>
      <div class="mod"><div class="mod-icon">💬</div><div><strong>Chat por sesión</strong><span>Comunicación ligada a cada limpieza. Sin WhatsApp.</span></div></div>
      <div class="mod"><div class="mod-icon">🧺</div><div><strong>Lencería y stock</strong><span>Rotaciones, lavandería e inventario por propiedad.</span></div></div>
      <div class="mod"><div class="mod-icon">👥</div><div><strong>RRHH completo</strong><span>Ausencias, vacaciones, expedientes y fichaje por QR.</span></div></div>
      <div class="mod"><div class="mod-icon">💰</div><div><strong>Facturación automática</strong><span>PDF con desglose por piso y horas. Día 1 listo.</span></div></div>
      <div class="mod"><div class="mod-icon">🏠</div><div><strong>Portal propietario</strong><span>Cada cliente ve sus limpiezas, fotos e incidencias.</span></div></div>
      <div class="mod"><div class="mod-icon">⚠️</div><div><strong>Gestión de quejas</strong><span>Propietario registra queja con foto. Notificación inmediata.</span></div></div>
      <div class="mod"><div class="mod-icon">📊</div><div><strong>Informes mensuales</strong><span>PDF automático el día 1 con sesiones, horas y facturación.</span></div></div>
      <div class="mod"><div class="mod-icon">🔔</div><div><strong>Alertas push</strong><span>Nueva sesión, ventana ajustada, queja. Tiempo real.</span></div></div>
      <div class="mod"><div class="mod-icon">🤖</div><div><strong>IA integrada</strong><span>Informes, análisis de calidad, optimización de rutas.</span></div></div>
    </div>
  </div>

  <!-- 03 FLUJO -->
  <div class="card">
    <div class="section-label">03 — Cómo funciona</div>
    <h3>De la reserva a la limpieza completada. Automático.</h3>
    <div class="flow">
      <div class="flow-step"><div class="step-n">Paso 1</div><span class="step-e">🏨</span><p>Checkout en Booking o Smoobu</p></div>
      <div class="flow-step"><div class="step-n">Paso 2</div><span class="step-e">🔔</span><p>ialimp crea la sesión y avisa a la limpiadora</p></div>
      <div class="flow-step"><div class="step-n">Paso 3</div><span class="step-e">📱</span><p>Checklist, instrucciones y fotos desde el móvil</p></div>
      <div class="flow-step"><div class="step-n">Paso 4</div><span class="step-e">✅</span><p>Piso listo → propietario notificado</p></div>
      <div class="flow-step"><div class="step-n">Paso 5</div><span class="step-e">📄</span><p>Día 1: factura y nómina generadas solas</p></div>
    </div>
  </div>

  <!-- 04 PRECIO -->
  <div class="card">
    <div class="section-label">04 — Tu plan</div>
    <h3>Precio adaptable a tu equipo real</h3>
    <div class="price-main">
      <div class="price-badge">Plan Sique Brilla — Piloto</div>
      <div class="price-name">1 admin + 11 usuarios activos</div>
      <div class="price-sub">Vanessa + supervisora + 9 limpiadoras</div>
      <div class="price-amount"><sup>€</sup>320<sub>/mes</sub></div>
      <div class="price-detail">Con el equipo actual</div>
      <ul class="price-features">
        <li>Panel administración completo</li>
        <li>App móvil para todas las limpiadoras</li>
        <li>Sync automático reservas (Smoobu + iCal)</li>
        <li>Checklist, fotos y chat por sesión</li>
        <li>Lencería, stock y RRHH</li>
        <li>Portal propietario por cliente</li>
        <li>Facturación e informes automáticos</li>
        <li>Soporte + actualizaciones incluidas</li>
      </ul>
    </div>
    <div class="price-detail-card">
      <div class="detail-block">
        <h4>Cómo se calcula</h4>
        <div class="calc-line"><span>Panel base (acceso admin)</span><strong>100 €/mes</strong></div>
        <div class="calc-line"><span>Cada usuario activo</span><strong>20 €/mes</strong></div>
        <div class="calc-line"><span>Sique Brilla: 11 usuarios activos</span><span>220 €</span></div>
        <div class="calc-line total"><span>Total este mes</span><span>320 €/mes</span></div>
      </div>
      <div class="detail-block">
        <h4>Totalmente adaptable</h4>
        <div class="flex-tag">
          <span>🌴</span>
          <span>Si una limpiadora está de <strong>vacaciones o es temporada baja</strong>, se desactiva su usuario y ese mes no se factura. Solo pagas por quienes trabajan.</span>
        </div>
      </div>
      <div class="detail-block">
        <h4>Ejemplos de escala</h4>
        <div class="calc-line"><span>5 usuarios activos</span><strong>200 €/mes</strong></div>
        <div class="calc-line"><span>11 usuarios activos</span><strong>320 €/mes</strong></div>
        <div class="calc-line"><span>20 usuarios activos</span><strong>500 €/mes</strong></div>
      </div>
    </div>
  </div>

  <!-- 05 ROI -->
  <div class="card">
    <div class="section-label">05 — Retorno de inversión</div>
    <h3>Lo que vale tu tiempo</h3>
    <div class="roi-grid">
      <div class="roi-stat"><div class="val">~40h</div><div class="lbl">horas admin ahorradas al mes</div></div>
      <div class="roi-stat"><div class="val">~600€</div><div class="lbl">ahorro estimado a 15 €/hora</div></div>
      <div class="roi-stat"><div class="val">×2</div><div class="lbl">propiedades gestionables sin ampliar equipo</div></div>
    </div>
    <div class="roi-note">
      <strong>El argumento real:</strong> con ialimp puedes gestionar el doble de propiedades con el mismo equipo. Si hoy gestionas 40 pisos y pasas a 80, el coste de ialimp crece mucho menos que tus ingresos. La plataforma es tu ventaja competitiva para escalar sin caos.
    </div>
  </div>

  <!-- 06 PRÓXIMOS PASOS -->
  <div class="card">
    <div class="section-label">06 — Próximos pasos</div>
    <h3>Cómo empezamos</h3>
    <div class="steps-list">
      <div class="step-item">
        <div class="step-circle">1</div>
        <div>
          <strong>Acceso ya activo — prueba desde hoy</strong>
          <p>Tu cuenta y la de Vanessa están creadas y funcionando con datos reales.</p>
          <div class="access-box">
            <strong>Admin:</strong><br>
            <code>ialimp.vercel.app/login</code><br>
            <code>limpiezascruzz@gmail.com</code><br>
            <code>SiqueBrilla2026</code><br><br>
            <strong>Vanessa (móvil):</strong><br>
            <code>ialimp.vercel.app/l/login</code> · PIN <code>5678</code>
          </div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-circle">2</div>
        <div>
          <strong>Periodo de prueba gratuito hasta el 15 de junio</strong>
          <p>Acceso completo sin coste hasta el 15 de junio para que el equipo lo use en condiciones reales. Sin tarjeta. Sin compromiso.</p>
          <div class="access-box" style="margin-top:10px;">
            📅 <strong>16 junio:</strong> primer cargo al <strong>50% — 160 €</strong><br>
            📅 <strong>1 julio:</strong> precio completo <strong>100% — 320 €/mes</strong>
          </div>
        </div>
      </div>
      <div class="step-item">
        <div class="step-circle">3</div>
        <div>
          <strong>Añadimos el resto del equipo</strong>
          <p>Configuramos propiedades, clientes y limpiadoras. Una sesión de 1 hora, remoto o presencial en Sevilla.</p>
        </div>
      </div>
      <div class="step-item">
        <div class="step-circle">4</div>
        <div>
          <strong>Plan mensual sin permanencia</strong>
          <p>100 € base + 20 €/usuario activo ese mes. Factura mensual con IVA. Añade, pausa o reduce usuarios en cualquier momento.</p>
        </div>
      </div>
    </div>
  </div>

  <footer>
    <div class="footer-logo">ialimp</div>
    <div class="footer-info">
      Alberto Suárez Gutiérrez<br>
      <a href="mailto:alberto.suarez.gutierrez@gmail.com">alberto.suarez.gutierrez@gmail.com</a> · ialimp.vercel.app
    </div>
  </footer>

</div>
</body>
</html>
` }} />
  )
}
