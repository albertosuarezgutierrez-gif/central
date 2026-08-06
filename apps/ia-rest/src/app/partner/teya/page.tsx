"use client"

import { C, SE, SN } from "@/lib/colors"

export default function TeyaPartnerPage() {
  const amb = C.amber
  const dark = C.dark
  const dark1 = C.dark1
  const dark2 = C.dark2
  const fg = C.darkFg
  const fg2 = C.darkFg2
  const fg3 = C.darkFg3
  const rule = C.darkRule

  return (
    <>
      <meta name="robots" content="noindex,nofollow" />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: ${dark}; color: ${fg}; font-family: ${SN}; -webkit-font-smoothing: antialiased; }
        a { color: inherit; text-decoration: none; }

        .page { max-width: 860px; margin: 0 auto; padding: 0 24px 80px; }

        /* ── Hero ── */
        .hero { padding: 64px 0 48px; text-align: center; border-bottom: 1px solid ${rule}; }
        .hero-logos { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 32px; }
        .logo-ia { font-family: ${SE}; font-size: 28px; font-weight: 700; color: ${fg}; letter-spacing: -0.5px; }
        .logo-sep { font-size: 28px; color: ${fg3}; font-weight: 300; }
        .logo-teya { font-size: 22px; font-weight: 700; color: ${amb}; letter-spacing: 1px; text-transform: uppercase; }
        .hero h1 { font-family: ${SE}; font-size: clamp(26px, 4vw, 38px); font-weight: 600; line-height: 1.25; color: ${fg}; margin-bottom: 16px; }
        .hero p { font-size: 17px; color: ${fg2}; max-width: 560px; margin: 0 auto; line-height: 1.6; }
        .badge { display: inline-block; background: rgba(232,163,59,0.12); color: ${amb}; border: 1px solid rgba(232,163,59,0.3); border-radius: 20px; font-size: 13px; font-weight: 600; padding: 4px 14px; margin-bottom: 20px; letter-spacing: 0.5px; text-transform: uppercase; }

        /* ── Sección ── */
        .section { padding: 48px 0; border-bottom: 1px solid ${rule}; }
        .section:last-child { border-bottom: none; }
        .section-label { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${amb}; margin-bottom: 12px; }
        .section h2 { font-family: ${SE}; font-size: clamp(20px, 3vw, 26px); font-weight: 600; color: ${fg}; margin-bottom: 24px; line-height: 1.3; }

        /* ── Cards verticales ── */
        .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 580px) { .cards { grid-template-columns: 1fr; } }
        .card { background: ${dark1}; border: 1px solid ${rule}; border-radius: 12px; padding: 24px; }
        .card h3 { font-family: ${SE}; font-size: 18px; font-weight: 600; color: ${fg}; margin-bottom: 6px; }
        .card .card-sub { font-size: 12px; color: ${amb}; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 16px; }
        .card ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .card ul li { font-size: 14px; color: ${fg2}; padding-left: 18px; position: relative; line-height: 1.45; }
        .card ul li::before { content: "—"; position: absolute; left: 0; color: ${fg3}; }

        /* ── Integraciones ── */
        .integrations { display: flex; flex-direction: column; gap: 20px; }
        .int-card { background: ${dark1}; border: 1px solid ${rule}; border-radius: 12px; padding: 24px 28px; display: flex; gap: 20px; align-items: flex-start; }
        .int-num { font-family: ${SE}; font-size: 36px; font-weight: 700; color: ${amb}; line-height: 1; flex-shrink: 0; width: 40px; }
        .int-body h3 { font-size: 17px; font-weight: 700; color: ${fg}; margin-bottom: 6px; }
        .int-body p { font-size: 14px; color: ${fg2}; line-height: 1.6; margin-bottom: 12px; }
        .int-body .tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag { background: rgba(255,255,255,0.05); border: 1px solid ${rule}; border-radius: 6px; font-size: 12px; color: ${fg3}; padding: 3px 10px; font-weight: 500; }
        .tag.hi { background: rgba(232,163,59,0.1); border-color: rgba(232,163,59,0.25); color: ${amb}; }

        /* ── Por qué ── */
        .whys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 580px) { .whys { grid-template-columns: 1fr; } }
        .why-card { background: ${dark1}; border: 1px solid ${rule}; border-radius: 12px; padding: 20px; text-align: center; }
        .why-card .why-icon { font-size: 28px; margin-bottom: 10px; }
        .why-card strong { display: block; font-size: 15px; font-weight: 700; color: ${fg}; margin-bottom: 6px; }
        .why-card p { font-size: 13px; color: ${fg2}; line-height: 1.5; }

        /* ── Módulos ── */
        .modules { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        @media (max-width: 580px) { .modules { grid-template-columns: 1fr; } }
        .mod { background: ${dark1}; border: 1px solid ${rule}; border-radius: 8px; padding: 12px 16px; display: flex; align-items: flex-start; gap: 12px; }
        .mod-dot { width: 8px; height: 8px; background: ${C.green}; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
        .mod div strong { display: block; font-size: 14px; font-weight: 600; color: ${fg}; margin-bottom: 2px; }
        .mod div span { font-size: 12px; color: ${fg3}; line-height: 1.4; }

        /* ── CTA ── */
        .cta-box { background: ${dark1}; border: 1px solid rgba(232,163,59,0.25); border-radius: 16px; padding: 40px; text-align: center; }
        .cta-box h2 { font-family: ${SE}; font-size: 26px; font-weight: 600; color: ${fg}; margin-bottom: 10px; }
        .cta-box p { font-size: 15px; color: ${fg2}; margin-bottom: 28px; }
        .cta-contacts { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; }
        .cta-contact { font-size: 15px; color: ${fg2}; }
        .cta-contact strong { color: ${fg}; display: block; font-size: 14px; font-weight: 600; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; }
        .cta-contact a { color: ${amb}; }
      `}</style>

      <div className="page">

        {/* ── Hero ── */}
        <div className="hero">
          <div className="badge">Propuesta de colaboración</div>
          <div className="hero-logos">
            <span className="logo-ia">iaRest</span>
            <span className="logo-sep">×</span>
            <span className="logo-teya">Teya</span>
          </div>
          <h1>La solución completa para hostelería y retail<br/>en el ecosistema Teya</h1>
          <p>Software POS con IA de voz + terminales Teya integrados nativamente.
            Una sola plataforma para tomar pedidos, cobrar, cumplir con Hacienda y
            gestionar el negocio.</p>
        </div>

        {/* ── Verticales ── */}
        <div className="section">
          <div className="section-label">Cobertura de producto</div>
          <h2>Dos verticales, un solo partner</h2>
          <div className="cards">
            <div className="card">
              <div className="card-sub">Hostelería</div>
              <h3>Restaurantes & Bares</h3>
              <ul>
                <li>Voice POS — comandas por voz en sala y barra</li>
                <li>KDS en cocina con tiempos de preparación</li>
                <li>QR de mesa (pedido y pago sin camarero)</li>
                <li>VeriFactu nativo (obligatorio España 2027)</li>
                <li>Gestión de eventos y catering con escandallo</li>
                <li>Fidelización y reservas integradas</li>
              </ul>
            </div>
            <div className="card">
              <div className="card-sub">Retail</div>
              <h3>Tiendas & Comercio</h3>
              <ul>
                <li>TPV con escáner EAN y venta por peso</li>
                <li>Control de stock en tiempo real</li>
                <li>Storefront online (delivery / recogida)</li>
                <li>Pago Stripe integrado en la web de la tienda</li>
                <li>VeriFactu y fiscalidad española</li>
                <li>Compatible con lectores USB y Bluetooth</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── Integraciones ── */}
        <div className="section">
          <div className="section-label">Integración técnica</div>
          <h2>Dos vías de conexión con terminales Teya</h2>
          <div className="integrations">
            <div className="int-card">
              <div className="int-num">1</div>
              <div className="int-body">
                <h3>PosLink — integración en la nube</h3>
                <p>iaRest (Vercel) crea el cobro vía Teya API → el terminal lo recibe
                  automáticamente → el cliente paga → webhook cierra la comanda en iaRest.
                  Sin cables, sin red local. Dispositivos separados, flujo unificado.</p>
                <div className="tags">
                  <span className="tag hi">Prioritario</span>
                  <span className="tag">2–3 días de integración</span>
                  <span className="tag">OAuth 2.0</span>
                  <span className="tag">Android / Windows</span>
                  <span className="tag">UI de pago preconstruida</span>
                </div>
              </div>
            </div>
            <div className="int-card">
              <div className="int-num">2</div>
              <div className="int-body">
                <h3>All-In-One — POS dentro del terminal</h3>
                <p>iaRest corre directamente sobre el terminal Android SUNMI P2 PRO
                  de Teya. Un solo dispositivo: comandero + datáfono. El camarero toma
                  el pedido y cobra desde la misma pantalla, sin pasos extra.</p>
                <div className="tags">
                  <span className="tag">Hoja de ruta Q3–Q4</span>
                  <span className="tag">SUNMI P2 PRO / PAX A77</span>
                  <span className="tag">Impresión recibos nativa</span>
                  <span className="tag">Sin hardware adicional</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Por qué ── */}
        <div className="section">
          <div className="section-label">Ventajas diferenciales</div>
          <h2>Por qué iaRest como partner tecnológico</h2>
          <div className="whys">
            <div className="why-card">
              <div className="why-icon">🧾</div>
              <strong>VeriFactu nativo</strong>
              <p>Obligatorio en España a partir de 2027. Ya integrado en producción, sin depender de módulos externos.</p>
            </div>
            <div className="why-card">
              <div className="why-icon">🎙️</div>
              <strong>IA de voz integrada</strong>
              <p>Pedidos por voz en mesa y barra. Diferencial único en el mercado de hostelería europeo.</p>
            </div>
            <div className="why-card">
              <div className="why-icon">🏪</div>
              <strong>Hostelería + Retail</strong>
              <p>Un único software cubre restaurantes, bares, tiendas y comercio mixto. Un solo partner para toda la cartera Teya.</p>
            </div>
          </div>
        </div>

        {/* ── Módulos ── */}
        <div className="section">
          <div className="section-label">En producción hoy</div>
          <h2>Módulos activos</h2>
          <div className="modules">
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>Voice POS</strong><span>Comandas por voz, mesas, barras y delivery</span></div>
            </div>
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>KDS Cocina</strong><span>Pantalla de producción con tiempos y prioridades</span></div>
            </div>
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>QR de Mesa</strong><span>Pedido y pago sin camarero desde el móvil</span></div>
            </div>
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>VeriFactu</strong><span>Facturación verificable integrada en el TPV</span></div>
            </div>
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>TPV Retail</strong><span>EAN scanner, venta por peso, devoluciones</span></div>
            </div>
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>Storefront Online</strong><span>Tienda web con delivery/recogida y Stripe</span></div>
            </div>
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>Eventos & Catering</strong><span>Presupuestos, escandallo, gestión de aforo</span></div>
            </div>
            <div className="mod">
              <div className="mod-dot"></div>
              <div><strong>Analítica</strong><span>Dashboard de ventas, stock y rendimiento</span></div>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="section">
          <div className="cta-box">
            <h2>Hablamos el lunes</h2>
            <p>Listos para definir el modelo comercial, los primeros pilotos y el acceso al developer portal.</p>
            <div className="cta-contacts">
              <div className="cta-contact">
                <strong>iaRest</strong>
                Alberto Suárez<br/>
                <a href="mailto:alberto.suarez.gutierrez@gmail.com">alberto.suarez.gutierrez@gmail.com</a>
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
