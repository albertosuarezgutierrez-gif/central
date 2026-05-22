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
      const priv = document.getElementById("privacidad") as HTMLInputElement

      let ok = true
      ;([["nombre", n], ["restaurante", r], ["email", em], ["usuarios", u]] as [string,string][]).forEach(([id, v]) => {
        const el = document.getElementById(id) as HTMLInputElement
        if (!v) { el.style.borderColor = "rgba(217,68,43,.6)"; ok = false }
        else el.style.borderColor = ""
      })
      if (!priv.checked) { priv.style.outline = "2px solid rgba(217,68,43,.6)"; ok = false }
      else priv.style.outline = ""
      if (!ok) return

      const btn = document.getElementById("submitBtn") as HTMLButtonElement
      btn.disabled = true; btn.textContent = "Enviando…"

      try {
        await fetch("/api/leads/landing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: n, restaurante: r, email: em, telefono: tf, usuarios: u, fuente: "landing" }),
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
      <style dangerouslySetInnerHTML={{__html:CSS}}/>

      {/* MOBILE DRAWER */}
      <div className={`mob-drawer${menuOpen?" open":""}`}>
        <button className="ham open" onClick={()=>setMenuOpen(false)} style={{position:"absolute",top:16,right:20}}><span/><span/><span/></button>
        <a href="#como" onClick={()=>navTo("como")}>Cómo funciona</a>
        <a href="#modulos" onClick={()=>navTo("modulos")}>Módulos</a>
        <a href="#testimonios" onClick={()=>navTo("testimonios")}>Restaurantes</a>
        <a href="#precios" onClick={()=>navTo("precios")}>Precios</a>
        <a href="#contacto" onClick={()=>navTo("contacto")}>Contacto</a>
        <button className="mob-cta" onClick={()=>navTo("contacto")}>Solicitar 14 días gratis →</button>
      </div>

      {/* NAV */}
      <nav ref={navRef}>
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <ul className="nav-c">
          <li><a href="#como">Cómo funciona</a></li>
          <li><a href="#modulos">Módulos</a></li>
          <li><a href="#testimonios">Restaurantes</a></li>
          <li><a href="#precios">Precios</a></li>
          <li><a href="#contacto">Contacto</a></li>
        </ul>
        <div className="nav-r">
          <button className="nbr" onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Quiero probarlo</button>
        </div>
        <button className={`ham${menuOpen?" open":""}`} onClick={()=>setMenuOpen(m=>!m)} aria-label="Menú"><span/><span/><span/></button>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hglow"/><div className="hglow2"/>
        <div className="hi">
          <div className="ep">
            <span className="chip">Live</span>
            <span className="pt">TPV por voz para hostelería española — &ldquo;la cuatro de terraza&rdquo;</span>
          </div>
          <h1>
            Para de correr<br/>
            <em>al terminal.</em>
            <span className="sl">Simplemente habla.</span>
          </h1>
          <p className="hclaim">
            Dicta la comanda en voz natural. ia.rest la transcribe, la estructura y la manda a cocina{" "}
            <strong>en menos de medio segundo.</strong> Sin errores. Sin desplazamientos. Sin semanas de formación.
          </p>
          <div className="hctas">
            <button className="bth" onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Solicitar 14 días gratis →</button>
            <button className="bto" onClick={()=>document.getElementById("como")?.scrollIntoView({behavior:"smooth"})}>Ver cómo funciona →</button>
          </div>
          <p className="nc">Sin tarjeta · Sin hardware caro · En marcha en 10 minutos</p>
        </div>

        {/* DEMO */}
        <div className="demo-w">
          <div className="dshell">
            <div className="dchrome">
              <div className="cdots"><i/><i/><i/></div>
              <div className="cbar">ia.rest / sala / pedidos en vivo</div>
            </div>
            <div className="dstage">
              <div className="pcam">
                <div className="plabel">
                  <span className="pl">Camarero</span>
                  <div className="spill"><div className="sd" id="sd"/><span id="slbl" style={{fontSize:11,color:"var(--cream3)"}}>escuchando</span></div>
                </div>
                <div className="wbox">
                  <div className="wf silent" id="wf">
                    {[{s:.5,d:.00,h:32},{s:.6,d:.05,h:18},{s:.4,d:.10,h:38},{s:.7,d:.15,h:12},
                      {s:.5,d:.20,h:30},{s:.6,d:.08,h:22},{s:.4,d:.12,h:35},{s:.8,d:.16,h:16},
                      {s:.5,d:.02,h:28},{s:.6,d:.06,h:40},{s:.4,d:.11,h:20},{s:.7,d:.18,h:34}
                    ].map((b,i)=><div key={i} className="wb" style={{"--ws":`${b.s}s`,"--wd":`${b.d}s`,"--wh":b.h} as {[k:string]:string|number}}/>)}
                  </div>
                  <div className="tr"><span id="ttext"/><span className="tc" id="tc"/></div>
                </div>
                <div className="mtag" id="mtag">
                  <span id="mico">🍽️</span>
                  <span id="mtxt" style={{fontFamily:"var(--mono)",fontSize:13}}/>
                </div>
              </div>
              <div className="ddiv"/>
              <div className="pkds">
                <div className="ktopbar">
                  <span className="pl">Cocina — KDS</span>
                  <div className="stag" id="stag">⚡ 0.4s</div>
                </div>
                <div className="tkt" id="tkt">
                  <div className="tkth">
                    <span className="tktm" id="tktm">—</span>
                    <span className="tkth2" id="tkth2">—</span>
                  </div>
                  <div className="tktis" id="tktis"><div className="tempty">Esperando comanda...</div></div>
                  <div className="tktf">
                    <div className="stag" id="stag2" style={{opacity:0}}>⚡ 420ms</div>
                    <button className="bmarch" id="bmarch">✓ MARCHAR</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STATS */}
        <div className="stats">
          <div className="stat"><div className="snum">&lt;<span>0.5</span>s</div><div className="slbl">Voz → Cocina</div></div>
          <div className="stat"><div className="snum"><span>97</span>%</div><div className="slbl">Precisión</div></div>
          <div className="stat"><div className="snum"><span>−40</span>%</div><div className="slbl">Errores en sala</div></div>
          <div className="stat"><div className="snum"><span>5</span>min</div><div className="slbl">Para aprenderlo</div></div>
        </div>
      </section>

      {/* DOLOR */}
      <section className="pain">
        <div className="section-tag">El problema</div>
        <div className="pgrid">
          <div className="ptxt reveal">
            <h2>El terminal de siempre <strong>no está diseñado</strong> para el servicio</h2>
            <p>Un camarero hace 6 viajes al TPV por hora. Cada viaje son 30–45 segundos de atención perdida. Clientes sin mirar. Errores que solo se descubren al cerrar la cuenta.</p>
            <p>No es un problema de tu equipo. Es un problema de herramienta.</p>
          </div>
          <div className="pitems reveal rd1">
            {[["🚶","6 viajes al TPV por hora.","Cada viaje, atención perdida en sala."],
              ["❌","Comandas mal registradas.","La mesa 7 pide sin gluten. Llega con gluten."],
              ["🎓","Semanas formando personal nuevo","solo para que aprenda el TPV."],
              ["⏱️","Cocina trabaja a ciegas","durante los primeros minutos de cada pase."]
            ].map(([ico,bold,txt],i)=>(
              <div key={i} className="pitem">
                <div className="pii">{ico}</div>
                <div className="pit"><strong>{bold}</strong> {txt}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="how" id="como">
        <div className="section-tag">La solución</div>
        <h2 className="reveal">Tres pasos.<br/><em>Cero fricción.</em></h2>
        <p className="reveal rd1" style={{fontFamily:"var(--soft)",fontSize:17,color:"var(--cream3)",marginTop:-24,marginBottom:40,maxWidth:520}}>¿Tienes mesas con QR activado? El cliente pide desde su móvil y el ticket llega al mismo KDS, igual que si lo dictara el camarero.</p>
        <div className="steps">
          {[
            {n:"1",ico:"🎙️",t:"El camarero habla",p:'Sin abrir apps, sin buscar platos. Dice la comanda en voz natural: "dos de la casa", "sin sal ojo", "que llegue primero".',time:"Tiempo: 4 segundos"},
            {n:"2",ico:"🧠",t:"ia.rest entiende",p:"La IA transcribe el audio en menos de 0,3s y estructura la comanda: mesa, platos, cantidades, notas de alergias. En español real de hostelería.",time:"Tiempo: 0.4 segundos"},
            {n:"3",ico:"📺",t:"Cocina lo ve al momento",p:"El ticket aparece en el KDS con prioridades, alertas de alergia y orden de llegada. Venga del camarero o de un QR de mesa — la cocina marcha igual.",time:"Total: menos de 5 segundos"},
          ].map(s=>(
            <div key={s.n} className="step reveal" data-n={s.n}>
              <div className="sico">{s.ico}</div>
              <h3>{s.t}</h3>
              <p>{s.p}</p>
              <span className="sttime">{s.time}</span>
            </div>
          ))}
        </div>
      </section>

      {/* MÓDULOS */}
      <section className="mods" id="modulos">
        <div className="mods-head reveal">
          <div className="section-tag">Todo lo que incluye</div>
          <h2>Un sistema completo<br/>para <em>cada punto del servicio</em></h2>
          <p>Desde la primera comanda hasta el cierre de caja. Sala, cocina, barra, delivery, Hacienda y tu asesoría.</p>
        </div>
        <div className="mgrid">
          {[
            {ico:"🎙️",t:"Pedidos por voz",d:"El camarero habla. La comanda llega a cocina. Sin tocar pantalla.",badge:null,cls:"mc-red"},
            {ico:"📱",t:"QR en mesa",d:"El cliente pide desde su móvil. El ticket llega al KDS igual que el resto.",badge:{t:"Add-on · 12€/mesa/mes",cls:"b-addon"},cls:"mc-amber"},
            {ico:"🏪",t:"Pedidos online",d:"Web, recogida, teléfono y mostrador en un solo panel.",badge:null,cls:"mc-green"},
            {ico:"📺",t:"KDS en cocina",d:"Pantalla de cocina con prioridades, alertas y timers por pase.",badge:null,cls:""},
            {ico:"🖨️",t:"Impresoras térmicas",d:"Impresión automática sin drivers ni configuración.",badge:null,cls:""},
            {ico:"💳",t:"Cobro completo",d:"Tarjeta, Bizum, efectivo. División de cuenta y cierre de caja.",badge:null,cls:""},
            {ico:"📦",t:"Almacén e inventario",d:"Stock en tiempo real, escandallos por receta y alertas de reposición.",badge:null,cls:"mc-red"},
            {ico:"🍷",t:"Sumiller digital",d:"Tu carta de vinos siempre actualizada. El camarero sabe qué recomendar y cuánto queda en bodega.",badge:null,cls:""},
            {ico:"🚚",t:"Proveedores y albaranes",d:"Gestión de proveedores, pedidos y digitalización de albaranes.",badge:null,cls:""},
            {ico:"📸",t:"Escáner IA",d:"Fotografía un documento. La IA lo clasifica y extrae los datos.",badge:null,cls:""},
            {ico:"💬",t:"Chat entre roles",d:"Mensajería interna durante el turno entre sala, cocina y barra.",badge:null,cls:"mc-amber"},
            {ico:"👥",t:"Selección de personal IA",d:"Análisis automático de candidaturas con puntuación por rol.",badge:null,cls:""},
            {ico:"📡",t:"Eventos IA",d:"Anticipa la afluencia de los próximos 6 meses cruzando tu histórico con eventos reales: partidos, conciertos, ferias y festivos de tu ciudad.",badge:{t:"Nuevo",cls:"b-new"},cls:"mc-red"},
            {ico:"🔔",t:"Supervisor de tiempos",d:"Alertas automáticas cuando el servicio se desvía del estándar.",badge:null,cls:""},
            {ico:"⏱️",t:"Fichaje digital",d:"Control horario conforme al RD-ley 8/2019.",badge:{t:"Obligatorio por ley",cls:"b-legal"},cls:"mc-red"},
            {ico:"📋",t:"VeriFactu AEAT",d:"Facturas homologadas con firma encadenada y QR verificable.",badge:{t:"Legal · incluido",cls:"b-legal"},cls:""},
            {ico:"🏢",t:"Gestión multi-local",d:"Panel unificado para grupos con varios restaurantes. Un solo acceso, todos los locales en tiempo real.",badge:{t:"Grupos",cls:"b-new"},cls:"mc-red"},
            {ico:"🧪",t:"Elaboraciones y APPCC",d:"Fichas técnicas, alérgenos y trazabilidad de elaboraciones. Cumplimiento legal listo para una inspección.",badge:{t:"Obligatorio por ley",cls:"b-legal"},cls:""},
            {ico:"📊",t:"Análisis de carta",d:"Identifica tus platos estrella, los que no rinden y los que más margen te dejan. Decide con datos.",badge:null,cls:""},
            {ico:"🛵",t:"Delivery",d:"Pedidos a domicilio y recogida integrados directamente en el KDS.",badge:null,cls:""},
            {ico:"📊",t:"Contabilidad integrada",d:"Cierre diario automático, modelo 303 calculado y exportación A3/Sage/Holded para la asesoría. Sin pedir nada al contable.",badge:{t:"Nuevo",cls:"b-new"},cls:"mc-red"},
            {ico:"🧮",t:"Portal asesoría",d:"El contable accede a todos sus restaurantes cliente desde un panel. P&L, 303 y exportación con un clic. Se convierte en prescriptor.",badge:{t:"Nuevo",cls:"b-new"},cls:"mc-amber"},
            {ico:"🏪",t:"Central de almacén",d:"Grupos con varios locales ven el stock crítico de todos en tiempo real y crean pedidos grupales al proveedor — mejor precio por volumen.",badge:{t:"Grupos",cls:"b-new"},cls:"mc-green"},
          ].map((m,i)=>(
            <div key={i} className={`mcard reveal${m.cls?" "+m.cls:""}`} style={{animationDelay:`${i*0.05}s`}}>
              <div className="mico2">{m.ico}</div>
              <div className="mtit">{m.t}</div>
              <div className="mdesc">{m.d}</div>
              {m.badge&&<div className={`mbadge ${m.badge.cls}`}>{m.badge.t}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* BEFORE/AFTER */}
      <section className="ba">
        <div className="section-tag">Antes y después</div>
        <h2 className="reveal">El mismo servicio.<br/>Una herramienta distinta.</h2>
        <div className="bagrid">
          <div className="bac bef reveal">
            <div className="bach bh"><span className="bal b">✕ &nbsp;Sin ia.rest</span></div>
            <div className="bars2">
              {[["🚶","Anotar en libreta → ir al TPV → introducir plato a plato","~45s","slow"],
                ["😬","<strong>Error al teclear</strong> — el cliente recibe algo que no pidió","−€€","slow"],
                ["📚","Personal nuevo tarda <strong>1–2 semanas</strong> en aprender el sistema","+16h","slow"],
                ["🔥","Hora punta: cola en el TPV, cocina esperando, mesas esperando","caos","slow"],
                ["📁","El contable recibe un cajón de albaranes cada trimestre y tarda 40h en cuadrar","40h","slow"]
              ].map(([i,t,v,cls],idx)=>(
                <div key={idx} className="bar2">
                  <span className="bari">{i}</span>
                  <span className="bart" dangerouslySetInnerHTML={{__html:t as string}}/>
                  <span className={`bat ${cls}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bac aft reveal rd1">
            <div className="bach ah"><span className="bal a">✓ &nbsp;Con ia.rest</span></div>
            <div className="bars2">
              {[["🎙️","Dictar la comanda de pie en la mesa → en cocina ya","4s","fast"],
                ["✅","La IA estructura exactamente lo que pidieron, <strong>sin errores de tecleo</strong>","0 errores","fast"],
                ["🚀","Personal nuevo operativo en <strong>5 minutos</strong> — hablan, no aprenden menús","5min","fast"],
                ["😎","Hora punta fluida. Cada camarero es una línea directa a cocina","control","fast"],
                ["📊","El contable recibe el fichero A3 listo y el 303 calculado — sin llamar a nadie","4h","fast"]
              ].map(([i,t,v,cls],idx)=>(
                <div key={idx} className="bar2">
                  <span className="bari">{i}</span>
                  <span className="bart" dangerouslySetInnerHTML={{__html:t as string}}/>
                  <span className={`bat ${cls}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section className="testi" id="testimonios">
        <div className="testi-head reveal">
          <div className="section-tag">Restaurantes</div>
          <h2>Los que ya no vuelven<br/>al <em>terminal viejo</em></h2>
          <p>Resultados reales de dueños y jefes de sala en España.</p>
        </div>
        <div className="tgrid">
          {[
            {cls:"hl",ini:"M",av:"ta-red",q:'"Antes mis camareras tardaban <em>45 segundos por comanda</em> en el TPV. Ahora dictan y se quedan en sala. En la primera semana noté que las propinas subieron."',r:"↑ 18% en propinas — primera semana",n:"María José Paredes",l:"Propietaria · Casa Manuela, Sevilla",p:"3 perfiles · 99€/mes"},
            {cls:"",ini:"R",av:"ta-amber",q:'"El verano pasado era un caos en la terraza. Este año puse ia.rest y los sábados son otra cosa. <em>Cero errores de comanda</em> en dos meses."',r:"0 errores en 60 días de temporada",n:"Roberto Fuentes",l:"Gerente · El Rincón de la Bahía, Cádiz",p:"6 perfiles · 159€/mes"},
            {cls:"",ini:"C",av:"ta-green",q:'"Formé a dos camareros nuevos para agosto. <em>En 10 minutos ya estaban mandando comandas.</em> Antes era una semana mínimo."',r:"Formación de 1 semana → 10 minutos",n:"Carmen Vidal",l:"Jefa de sala · Taberna La Cava, Madrid",p:"4 perfiles · 119€/mes"},
          ].map((t,i)=>(
            <div key={i} className={`tcard ${t.cls} reveal rd${i}`}>
              <div className="tstars">⭐⭐⭐⭐⭐</div>
              <div className={`tquote${i>0?" sm":""}`} dangerouslySetInnerHTML={{__html:t.q}}/>
              <div className="tresult">{t.r}</div>
              <div className="tauthor">
                <div className={`tavatar ${t.av}`}>{t.ini}</div>
                <div className="tinfo"><h4>{t.n}</h4><p>{t.l}</p></div>
                <span className="tbadge">{t.p}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="tgrid-wide" style={{marginTop:16}}>
          {[
            {ini:"A",av:"ta-blue",q:'"Tengo un bar en el Mercado de San Miguel. Volumen brutal, espacio mínimo. <em>El camarero dicta y el cocinero lo ve al momento.</em> No sé cómo trabajábamos antes."',r:"Volumen ×3 · mismo equipo · cero cuellos de botella",n:"Alejandro Mora",l:"Propietario · Barra Madrid, Mercado San Miguel",p:"1 perfil · 59€/mes"},
            {ini:"P",av:"ta-brown",q:'"Tengo 3 locales en Valencia. Con ia.rest <em>veo los tres en tiempo real</em> y las alertas de alergia ya no se pierden entre papeles."',r:"3 locales · panel único · alertas centralizadas",n:"Pilar Escrivá",l:"Grupo hostelero · La Familia Escrivá, Valencia",p:"3 restaurantes · desde 59€/local"},
          ].map((t,i)=>(
            <div key={i} className={`tcard reveal rd${i}`}>
              <div className="tstars">⭐⭐⭐⭐⭐</div>
              <div className="tquote" dangerouslySetInnerHTML={{__html:t.q}}/>
              <div className="tresult">{t.r}</div>
              <div className="tauthor">
                <div className={`tavatar ${t.av}`}>{t.ini}</div>
                <div className="tinfo"><h4>{t.n}</h4><p>{t.l}</p></div>
                <span className="tbadge">{t.p}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="faqsec">
        <div className="section-tag">Preguntas</div>
        <h2 className="reveal">Lo que siempre<br/><em>preguntan primero</em></h2>
        <div className="faqlist">
          {[
            {q:"¿Funciona si hay ruido en sala?",a:"Sí. El motor de transcripción de ia.rest está optimizado para entornos de hostelería: ruido de fondo, música y conversaciones cercanas. Funciona bien en la práctica. Recomendamos hablar a 15–20 cm del micrófono, algo natural cuando ya llevas la comanda en mente."},
            {q:"¿Tiene integración con delivery?",a:"Sí. Los pedidos de delivery entran directamente al KDS igual que cualquier comanda de sala — sin tabletas extra, sin reescribir. Si tienes delivery activo, cuéntanos tu caso y lo configuramos juntos."},
            {q:"¿Qué pasa si se cae internet en mitad del servicio?",a:"Las comandas ya enviadas siguen visibles en cocina. Para nuevas comandas cae a modo manual: el camarero puede abrir cualquier comanda anterior y modificarla."},
            {q:"¿Necesito hardware nuevo? ¿Impresoras, tablets específicas?",a:"No. ia.rest funciona en cualquier móvil o tablet con navegador. Para el KDS en cocina, una tablet de 70€ es suficiente. Para impresoras de tickets, garantizamos compatibilidad 100% con modelos como la Star TSP143IIILAN y la TSP143IIIW. Si ya tienes otra impresora térmica habitual, probablemente funcione — consúltanos."},
            {q:"¿El sistema entiende la carta de mi restaurante?",a:'Sí. Durante el onboarding (10 minutos) introduces tus platos y el sistema los aprende. Si el camarero dice "una de la casa" y en tu carta se llama "Ensaladilla de la abuela", el ticket sale con el nombre correcto.'},
            {q:"¿Cómo funciona el fichaje digital?",a:"Cada trabajador ficha entrada y salida con su PIN desde cualquier dispositivo. Los registros cumplen el RD-ley 8/2019 (obligatorio para todos los empleados desde 2019). El panel de propietario muestra el historial completo y las horas totales por trabajador, listo para una inspección."},
            {q:"¿Cómo funciona lo de VeriFactu y Hacienda?",a:"VeriFactu es el sistema obligatorio de la AEAT para emitir facturas. Obligatorio para sociedades desde enero de 2026 y autónomos desde julio de 2026. Multa de hasta 50.000 €/ejercicio por software no homologado. ia.rest genera facturas con firma encadenada y QR verificable por la AEAT. Incluido en todos los perfiles."},
            {q:"¿Puedo cancelar en cualquier momento?",a:"Sí, siempre. Sin permanencia ni penalizaciones. El servicio sigue activo hasta final del período pagado. Datos exportables en CSV. No te vamos a llamar para retenerte."},
          ].map((f,i)=>(
            <div key={i} className={`faqitem${openFaq===i?" open":""}`}>
              <button className="faqq" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                <span>{f.q}</span>
                <span className="arrow">+</span>
              </button>
              <div className="faqa"><div className="faqa-inner">{f.a}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* TRUST */}
      <div className="trust">
        {[["🔒","Datos en Europa","· Servidores certificados UE"],["🇪🇸","Soporte en español","· Respuesta el mismo día"],["📋","VeriFactu AEAT 2026","· Incluido en todos los perfiles"],["🛵","Delivery","· Pedidos a domicilio y recogida incluidos"],["⏱️","Fichaje RD-ley 8/2019","· Control horario incluido"],["💳","Sin permanencia","· Cancela cuando quieras"]].map(([ico,b,t])=>(
          <div key={b} className="ti"><span className="ico">{ico}</span><span><strong>{b}</strong>{t}</span></div>
        ))}
      </div>

      {/* PORTALES EXTERNOS */}
      <section className="pain" style={{background:"#1E1A15"}}>
        <div className="section-tag">Para grupos y asesorías</div>
        <div className="pgrid">
          <div className="ptxt reveal">
            <h2>Portales externos<br/><strong>para quien lo necesita</strong></h2>
            <p>El contable de tu grupo recibe el 303 calculado y el fichero A3 con un clic — sin llamarte. El director de compras ve el stock crítico de todos tus locales y lanza un pedido grupal al proveedor. Todo desde portales propios, con su PIN.</p>
          </div>
          <div className="pitems reveal rd1">
            {[["🧮","Portal asesoría /asesoria","El contable ve todos sus clientes hosteleros. P\u0026L, IVA 303 calculado y exportación en su formato (A3, Sage, Holded)."],
              ["🏪","Central de almacén /almacen-central","Stock crítico de todos los locales en tiempo real. Pedido grupal a un proveedor: mejor precio por volumen."],
              ["📊","Contabilidad integrada","Cierre diario automático desde los tickets. Plan de cuentas PGC editable. Adaptable a IS, IRPF directa o módulos."],
              ["🔑","Un PIN, varios módulos","La misma persona puede gestionar contabilidad y almacén con el mismo acceso. El owner decide quién ve qué."]
            ].map(([ico,bold,txt],i)=>(
              <div key={i} className="pitem">
                <div className="pii">{ico}</div>
                <div className="pit"><strong>{bold}</strong> {" "}{txt}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pricing" id="precios">
        <div className="phead reveal">
          <div className="section-tag">Precios</div>
          <h2>Sin comisiones por comanda.<br/>Sin sorpresas al mes siguiente.</h2>
          <p>Solo pagas por los perfiles activos de cada restaurante. Sin planes fijos, sin letra pequeña.</p>
        </div>
        <div className="reveal rd1" style={{maxWidth:860,margin:"0 auto 32px",padding:"18px 24px",background:"rgba(232,163,59,.07)",border:"1px solid rgba(232,163,59,.25)",borderRadius:16,display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
          <div style={{fontSize:22}}>▣</div>
          <div style={{flex:1,minWidth:220}}>
            <div style={{fontFamily:"var(--head)",fontStyle:"italic",fontSize:17,color:"var(--cream)",marginBottom:4}}>Add-on: QR en mesa</div>
            <div style={{fontSize:14,color:"var(--cream2)",lineHeight:1.6,letterSpacing:"-.005em"}}>El cliente pide desde su móvil. El ticket llega al mismo KDS que el resto — como si lo dictara el camarero. <span style={{color:"var(--amber)",fontFamily:"var(--mono)",fontSize:12}}>+12€/mesa/mes</span></div>
          </div>
          <div style={{fontFamily:"var(--soft)",fontSize:14,color:"var(--cream3)",whiteSpace:"nowrap"}}>Mueve el slider abajo →</div>
        </div>
        {(()=>{
          const calcBase=(n:number,ann:boolean)=>{
            let p=59;
            if(n>1) p+=Math.min(n-1,5)*20;
            if(n>6) p+=(n-6)*15;
            return ann?Math.round(p*0.82):p;
          };
          const basePrice=calcBase(pUsers,pAnnual);
          const qrPrice=pQR>0?(pAnnual?Math.round(pQR*12*0.82):pQR*12):0;
          const total=basePrice+qrPrice;
          const examples:Array<[number,string]>=[[1,"1 perfil"],[3,"3 perfiles"],[6,"6 perfiles"]];
          const feats=["Voz + KDS en cocina","Cobro Stripe + Bizum","VeriFactu incluido","Impresoras térmicas","Fichaje RD-ley 8/2019","QR en mesa (add-on)","Pedidos online · 4 canales","Almacén e inventario","Escandallos por receta","Proveedores + OCR albaranes","Escáner IA de documentos","Chat interno entre roles","Selección de personal IA","Eventos IA · 6 meses","Supervisor de tiempos","14 días de prueba gratis"];
          return (
            <div className="pcalc reveal">
              <div className="pcalc-inner">
                {/* Precio */}
                <div>
                  <div className="pcalc-label">Precio mensual estimado · por restaurante</div>
                  <div className="plpw">
                    <div className="plp"><sup>€</sup>{total}</div>
                    <div className="plper">/mes · sin permanencia{pAnnual?" · pago anual":""}</div>
                  </div>
                  <div className="pcalc-note" style={{marginBottom:pQR>0?10:28}}>
                    {pUsers} perfil{pUsers>1?"es":""} activo{pUsers>1?"s":""}
                    {pAnnual&&<> · <em style={{color:"var(--green)"}}>18% descuento aplicado</em></>}
                  </div>
                  {pQR>0&&(
                    <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:20}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(246,241,231,.03)",border:"1px solid var(--b)",borderRadius:8}}>
                        <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--cream3)"}}>{pUsers} perfil{pUsers>1?"es":""} voz</span>
                        <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--cream2)",fontWeight:600}}>{basePrice}€</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"rgba(232,163,59,.05)",border:"1px solid rgba(232,163,59,.2)",borderRadius:8}}>
                        <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--cream3)"}}>{pQR} mesa{pQR>1?"s":""} QR</span>
                        <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--amber)",fontWeight:600}}>+{qrPrice}€</span>
                      </div>
                    </div>
                  )}
                  <button className="plbtn plbf" style={{maxWidth:320}} onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Solicitar 14 días gratis</button>
                  <p className="pltrial">Sin tarjeta · Te configuramos nosotros</p>
                </div>
                {/* Controles */}
                <div className="pcalc-ctrl">
                  <div>
                    <div className="pcalc-field-label">
                      Perfiles activos
                      <span>Camareros · cocina · jefe de sala. El owner no cuenta.</span>
                    </div>
                    <div className="pcalc-count">{pUsers}</div>
                    <input type="range" min={1} max={15} value={pUsers} onChange={e=>setPUsers(+e.target.value)} className="pcalc-slider"/>
                    <div className="pcalc-range-labels"><span>1</span><span>15 perfiles</span></div>
                  </div>
                  <div>
                    <div className="pcalc-field-label">
                      <span style={{display:"flex",alignItems:"center",gap:8}}>
                        Mesas QR
                        <em style={{fontStyle:"normal",fontFamily:"var(--mono)",fontSize:10,color:"var(--amber)",background:"rgba(232,163,59,.12)",border:"1px solid rgba(232,163,59,.25)",borderRadius:9999,padding:"2px 9px",letterSpacing:".05em",fontWeight:700}}>NUEVO</em>
                      </span>
                      <span>El cliente pide desde su móvil. 12€/mesa/mes.</span>
                    </div>
                    <div className="pcalc-count" style={{color:pQR>0?"var(--amber)":"var(--cream4)",transition:"color .2s"}}>{pQR}</div>
                    <input type="range" min={0} max={20} value={pQR} onChange={e=>setPQR(+e.target.value)} className="pcalc-slider qr"/>
                    <div className="pcalc-range-labels"><span>Sin QR</span><span>20 mesas</span></div>
                  </div>
                  <div className="pcalc-annual" onClick={()=>setPAnnual(!pAnnual)}>
                    <button className={`pcalc-toggle${pAnnual?" on":""}`} onClick={e=>{e.stopPropagation();setPAnnual(!pAnnual)}}>
                      <span className="pcalc-toggle-knob"/>
                    </button>
                    <span>Facturación anual <em className="pcsave">Ahorra 18%</em></span>
                  </div>
                  <div>
                    <div className="pcalc-field-label">Ejemplos rápidos</div>
                    <div className="pcalc-examples">
                      {examples.map(([n,label])=>(
                        <button key={n} className={`pcalc-ex${pUsers===n&&pQR===0?" active":""}`} onClick={()=>{setPUsers(n);setPQR(0);}}>
                          <strong>{label}</strong>
                          <span>{calcBase(n,pAnnual)}€/mes</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="pcalc-includes reveal rd1">
                <div className="pcalc-inc-title">Incluido en todos los perfiles</div>
                <div className="pcalc-inc-grid">
                  {feats.map(f=><div key={f} className="pcalc-inc-item"><span className="ckg">—</span>{f}</div>)}
                </div>
              </div>
              <div style={{marginTop:16,textAlign:"center"}}>
                <p style={{fontFamily:"var(--soft)",fontSize:15,color:"var(--cream3)",letterSpacing:"-.005em"}}>
                  ¿Tienes varios locales? Cada restaurante tiene su propia suscripción independiente al mismo precio.{" "}
                  <button style={{background:"none",border:"none",color:"var(--red)",fontFamily:"var(--soft)",fontSize:15,cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>document.getElementById("contacto")?.scrollIntoView({behavior:"smooth"})}>Cuéntanos tu caso →</button>
                </p>
              </div>
            </div>
          );
        })()}
      </section>

      {/* FORMULARIO DE CONTACTO */}
      <section className="contacto" id="contacto">
        <h2 className="reveal">Tu cocina te está<br/><em>esperando.</em></h2>
        <p className="csub reveal rd1">Déjanos tu teléfono y te llamamos. Sin presiones, sin tarjeta. Solo una demo de 10 minutos y ves si encaja.</p>

        {leadSent ? (
          <div className="csent reveal">
            <div className="ccheck">✓</div>
            <h3>Recibido. Te llamamos pronto.</h3>
            <p>En menos de 24h te contactamos para organizar la demo.<br/><strong>Gracias por confiar en ia.rest.</strong></p>
          </div>
        ) : (
          <div className="cform reveal rd2">
            <div className="cfield">
              <label htmlFor="cf-nombre">Tu nombre</label>
              <input id="cf-nombre" className="cinput" type="text" placeholder="María García" value={leadNombre} onChange={e=>setLeadNombre(e.target.value)} />
            </div>
            <div className="cfield">
              <label htmlFor="cf-email">Tu email</label>
              <input id="cf-email" className="cinput" type="email" placeholder="maria@restaurante.com" value={leadEmail} onChange={e=>setLeadEmail(e.target.value)} />
            </div>
            <div className="cfield">
              <label htmlFor="cf-rest">Nombre del restaurante</label>
              <input id="cf-rest" className="cinput" type="text" placeholder="Bodega La Plaza" value={leadRest} onChange={e=>setLeadRest(e.target.value)} />
            </div>
            <div className="cfield">
              <label htmlFor="cf-tel">Teléfono (te llamamos nosotros)</label>
              <input id="cf-tel" className="cinput" type="tel" placeholder="+34 600 000 000" value={leadTel} onChange={e=>setLeadTel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLead()} />
            </div>
            {leadError && <p className="cerr">{leadError}</p>}
            <div className="ccheck-row">
              <input
                id="cf-consent"
                type="checkbox"
                checked={leadConsent}
                onChange={e => setLeadConsent(e.target.checked)}
              />
              <label htmlFor="cf-consent">
                He leído y acepto la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a>. Consiento el tratamiento de mis datos para gestionar mi solicitud de demo y que ia.rest se ponga en contacto conmigo. Puedo retirar el consentimiento en cualquier momento.
              </label>
            </div>
            <button className="csubmit" onClick={handleLead} disabled={leadSending || !leadConsent}>
              {leadSending ? "Enviando…" : "Quiero la demo — me llamáis vosotros →"}
            </button>
            <p className="cnota">Sin tarjeta · Sin compromiso · Respuesta en menos de 24h</p>
          </div>
        )}
      </section>

      <footer>
        <div className="fbrand">
          <a href="/" className="logo">ia<b>.</b>rest</a>
          <p>Voice POS para hostelería española. El camarero habla. La cocina marcha.</p>
        </div>
        <div className="fcol">
          <h4>Producto</h4>
          <ul>{[["#como","Cómo funciona"],["#precios","Precios"],["#como","KDS en cocina"],["#contacto","VeriFactu"]].map(([h,l])=><li key={l}><a href={h}>{l}</a></li>)}</ul>
        </div>
        <div className="fcol">
          <h4>Legal</h4>
          <ul>{[["/aviso-legal","Aviso legal"],["/privacidad","Privacidad"],["/cookies","Cookies"],["/terminos","Términos de uso"],["/contrato-iarest-v1.pdf","Contrato SaaS"]].map(([h,l])=><li key={l}><a href={h}>{l}</a></li>)}</ul>
        </div>
      </footer>
      <div className="fbot">
        <p>© 2026 ia.rest · Hecho en España 🇪🇸</p>
        <div className="vbadge"><span className="vdot"/><span>VeriFactu AEAT 2026</span></div>
      </div>
    </>
  );
}
