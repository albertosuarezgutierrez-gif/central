"use client";
import { useState, useEffect, useRef } from "react";

/* ─── TOKENS ─────────────────────────────────────────────── */
const T = {
  crema:"#F6F1E7",elev1:"#FBF8F1",elev2:"#EFE7D6",
  tinta:"#1A1714",tintaMed:"#3A332C",tintaGris:"#6B5F52",
  verm:"#D9442B",vermDeep:"#A8311E",
  ambar:"#E8A33B",marchar:"#3F7D44",
  reglas:"#D8CDB6",bisel:"#1F1A15",
};

function useIsMobile() {
  const [mob,setMob]=useState(false);
  useEffect(()=>{
    const fn=()=>setMob(window.innerWidth<640);
    fn(); window.addEventListener("resize",fn);
    return()=>window.removeEventListener("resize",fn);
  },[]);
  return mob;
}
function useIsTablet() {
  const [tab,setTab]=useState(false);
  useEffect(()=>{
    const fn=()=>setTab(window.innerWidth<900);
    fn(); window.addEventListener("resize",fn);
    return()=>window.removeEventListener("resize",fn);
  },[]);
  return tab;
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,700;1,400;1,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&family=Caveat:wght@500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{scroll-behavior:smooth;}
body{background:#F6F1E7;color:#1A1714;font-family:'Inter Tight',sans-serif;}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes halo{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.5);opacity:0}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
@keyframes wave{0%,100%{height:6px}50%{height:28px}}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes pulse{0%{box-shadow:0 0 0 0 #D9442B55}100%{box-shadow:0 0 0 18px #D9442B00}}
@keyframes spin{to{transform:rotate(360deg)}}
.fu{animation:fadeUp .65s cubic-bezier(.4,0,.2,1) both;}
.d1{animation-delay:.1s}.d2{animation-delay:.22s}.d3{animation-delay:.38s}.d4{animation-delay:.54s}.d5{animation-delay:.7s}
.cta{background:#D9442B;color:#F6F1E7;border:none;border-radius:8px;font-family:'Inter Tight',sans-serif;font-weight:700;cursor:pointer;transition:background .18s,transform .15s;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;}
.cta:hover{background:#A8311E;transform:translateY(-1px);}
.ghost{background:transparent;border:1.5px solid #D8CDB6;border-radius:8px;font-family:'Inter Tight',sans-serif;font-weight:600;cursor:pointer;transition:border-color .18s,color .18s;display:inline-flex;align-items:center;justify-content:center;}
.ghost:hover{border-color:#D9442B;color:#D9442B;}
.plan-card{transition:transform .2s,box-shadow .2s;}
.plan-card:hover{transform:translateY(-4px);}
.faq-q{cursor:pointer;padding:16px 0;display:flex;justify-content:space-between;align-items:center;font-family:'Inter Tight',sans-serif;font-size:15px;font-weight:600;color:#1A1714;border:none;background:none;width:100%;text-align:left;transition:color .18s;}
.faq-q:hover{color:#D9442B;}
.tab{cursor:pointer;padding:7px 14px;border-radius:20px;border:1.5px solid #3A332C;font-family:'Inter Tight',sans-serif;font-size:10px;font-weight:600;transition:all .18s;white-space:nowrap;background:transparent;}
.ticker-wrap{overflow:hidden;}
.ticker-track{display:flex;width:max-content;animation:ticker 28s linear infinite;}
input[type=email]{font-family:'Inter Tight',sans-serif;font-size:15px;padding:13px 16px;border:1.5px solid #2A2520;border-radius:8px;background:#0D0B09;color:#F6F1E7;outline:none;transition:border-color .18s;flex:1 1 0;}
input[type=email]:focus{border-color:#D9442B;}
@media(max-width:639px){.hide-mob{display:none!important;}}
@media(min-width:640px){.hide-desk{display:none!important;}}
`;

const SCENARIOS=[
  {cam:"Marta",mesa:"M04+M12",color:T.verm,label:"Hora punta",emoji:"🏃‍♀️",
   frase:"marchar segundos mesa cuatro y un manchado para la doce, vamos vamos",
   brain:"Entendido. El manchado sin azúcar, como siempre.",items:["×2 Segundos","×1 Manchado (sin azúcar)"]},
  {cam:"Iván",mesa:"M07",color:T.ambar,label:"86 croquetas",emoji:"😤",
   frase:"86 las croquetas, sustituye por gambas en la siete",
   brain:"Hecho. Quedan 3 raciones de gambas, conviene avisar.",items:["86 Croquetas","×1 Gambas (sustitución)"]},
  {cam:"Marta",mesa:"M05",color:T.marchar,label:"Cobro",emoji:"💸",
   frase:"cuenta para la cinco, pago con tarjeta, separada en dos",
   brain:"Dividida 50/50. Datáfono activado en T05. Mesa: 1h 12m.",items:["Cobro ×2 partes","Datáfono activado"]},
  {cam:"Iván",mesa:"M02",color:"#8B4FC9",label:"Alergia",emoji:"⚠️",
   frase:"la dos es alérgica al gluten, sin pan, sin rebozado, todo limpio",
   brain:"Marcado. Bloqueo automático en M02. Que David lo confirme.",items:["⚠ Alérgica gluten","Sin pan · Sin rebozado"]},
];

const PLANS=[
  {id:"barra",name:"BARRA",price:39,featured:false,desc:"Bares y cafeterías",
   features:["1 camarero con voz","Hasta 12 mesas","KDS en cocina","Impresoras ilimitadas","VeriFactu homologado","Alérgenos EU incluidos","Soporte email"]},
  {id:"servicio",name:"SERVICIO",price:79,featured:true,desc:"Restaurante con sala completa",
   features:["Hasta 4 camareros con voz","Mesas ilimitadas","KDS + Control Hub","Analytics ANALYST","Cobro Stripe + Bizum","VeriFactu homologado","Soporte WhatsApp · 24h"]},
  {id:"casa",name:"CASA",price:129,featured:false,desc:"Grupos y varios locales",
   features:["Camareros ilimitados","Hasta 3 locales","Secciones ilimitadas","API acceso","Hardware Bridge incluido","Onboarding personalizado","VeriFactu homologado"]},
];

const FAQS=[
  {q:"¿Qué hardware necesito exactamente?",a:"Un Android desde 180 € (validamos el Samsung Galaxy A15 5G), una impresora térmica de cocina y una tablet para el KDS. Sin terminales propietarios, sin contratos de hardware. Si tienes ya una impresora Epson o Star, conéctala directamente."},
  {q:"¿Funciona con acento andaluz, catalán o de cualquier región?",a:"Sí. BRAIN usa Whisper entrenado con vocabulario hostelero real: 'marchar', '86', 'sin', 'para llevar', 'pon una de gambas'... Funciona con todos los acentos del español y aprende con cada servicio."},
  {q:"¿Cuándo es obligatorio VeriFactu en España?",a:"Para sociedades desde el 1 de enero de 2027; para autónomos desde el 1 de julio de 2027. La multa por software no homologado es de hasta 50.000 € por ejercicio. ia.rest incluye VeriFactu con hash SHA-256 en todos los planes, ya activo."},
  {q:"¿Puedo financiar ia.rest con el Kit Digital?",a:"Sí. Las subvenciones Kit Digital del Gobierno de España cubren herramientas de digitalización para pymes y autónomos. Una suscripción anual de ia.rest puede cofinanciarse con estas ayudas. Consúltanos y te orientamos."},
  {q:"¿Hay comisión por cada cobro con tarjeta o Bizum?",a:"No. ia.rest cobra una cuota mensual fija y cero por transacción. Usas tu propio datáfono del banco o el lector Stripe Terminal. Bizum tampoco tiene comisión nuestra."},
  {q:"¿Cómo es el proceso de alta?",a:"Registro en 3 pasos (local, mesas, camareros) → verificación en minutos → empiezas. Sin llamadas, sin comerciales, sin instalador que venga a tu local."},
  {q:"¿Puedo cancelar cuando quiera?",a:"Sí. Sin permanencia ni penalización. Cancelas desde el panel y no se renueva. Datos exportables en formato estándar durante 30 días."},
];

const TICKER=["marchar segundos mesa cuatro","86 las croquetas","la dos sin gluten ojo","cuenta separada en dos","vamos vamos vamos","padrón con sal gorda","datáfono en la cinco","sin azúcar el manchado","verifactu homologado","sin comisiones","39€/mes completo","14 días gratis sin tarjeta","kit digital compatible","funciona en terraza"];

/* ─── DEMO ────────────────────────────────────────────────── */
function Demo({mob}:{mob:boolean}) {
  const [active,setActive]=useState(0);
  const [listening,setListening]=useState(false);
  const [typed,setTyped]=useState("");
  const [showBrain,setShowBrain]=useState(false);
  const [showTicket,setShowTicket]=useState(false);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null);
  const sc=SCENARIOS[active];

  const run=()=>{
    if(listening)return;
    setListening(true);setTyped("");setShowBrain(false);setShowTicket(false);
    let i=0;
    timer.current=setInterval(()=>{
      i++;setTyped(sc.frase.slice(0,i));
      if(i>=sc.frase.length){
        clearInterval(timer.current!);
        setTimeout(()=>{setListening(false);setShowBrain(true);setTimeout(()=>setShowTicket(true),550);},350);
      }
    },40);
  };

  useEffect(()=>{
    setTyped("");setShowBrain(false);setShowTicket(false);setListening(false);
    if(timer.current)clearInterval(timer.current);
  },[active]);

  return(
    <div style={{background:T.bisel,borderRadius:16,padding:mob?"18px 14px":"26px 22px",width:"100%",boxShadow:`0 20px 60px ${T.tinta}44`}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {SCENARIOS.map((s,i)=>(
          <button key={i} className="tab" onClick={()=>setActive(i)}
            style={{background:active===i?s.color:"transparent",color:active===i?T.crema:T.tintaGris,borderColor:active===i?s.color:"#3A332C",fontSize:10}}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:12}}>
        <div>
          <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,color:T.tintaGris,letterSpacing:".12em",textTransform:"uppercase",marginBottom:2}}>Camarero</div>
          <div style={{fontFamily:"Newsreader,serif",fontSize:17,fontStyle:"italic",color:T.crema,fontWeight:700}}>{sc.cam} · {sc.mesa}</div>
        </div>
        <div onClick={run} style={{width:72,height:72,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",position:"relative",
          background:listening?`radial-gradient(circle at 36% 30%,${T.verm},${T.vermDeep})`:T.elev2,
          boxShadow:listening?`0 0 0 4px ${T.verm}44,0 8px 28px ${T.vermDeep}55`:`0 2px 10px ${T.tinta}20`,
          animation:listening?"pulse 1.3s ease-out infinite":"none",transition:"all .25s"}}>
          {listening&&<><div style={{position:"absolute",width:72,height:72,borderRadius:"50%",background:T.verm,opacity:.18,animation:"halo 1.1s ease-out infinite"}}/><div style={{position:"absolute",width:72,height:72,borderRadius:"50%",background:T.verm,opacity:.12,animation:"halo 1.1s ease-out .4s infinite"}}/></>}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{position:"relative",zIndex:1}}>
            <rect x="9" y="2" width="6" height="12" rx="3" fill={listening?T.crema:T.tintaGris}/>
            <path d="M5 10a7 7 0 0014 0" stroke={listening?T.crema:T.tintaGris} strokeWidth="2" strokeLinecap="round" fill="none"/>
            <line x1="12" y1="17" x2="12" y2="22" stroke={listening?T.crema:T.tintaGris} strokeWidth="2" strokeLinecap="round"/>
            <line x1="9" y1="22" x2="15" y2="22" stroke={listening?T.crema:T.tintaGris} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
      <div style={{display:"flex",gap:3,alignItems:"center",height:36,marginBottom:14,padding:"0 2px"}}>
        {Array.from({length:18}).map((_,i)=>(
          <div key={i} style={{width:3,borderRadius:3,flexShrink:0,
            background:listening?T.verm:T.reglas,height:listening?undefined:6,
            animation:listening?`wave ${(0.35+i*0.12).toFixed(2)}s ease-in-out ${(i*0.06).toFixed(2)}s infinite alternate`:"none",transition:"background .3s"}}/>
        ))}
        {!listening&&!typed&&<span style={{fontFamily:"Caveat,cursive",color:T.tintaGris,fontSize:13,marginLeft:8,whiteSpace:"nowrap"}}>pulsa el micro</span>}
      </div>
      {(typed||listening)&&(
        <div style={{background:"#0D0B09",borderRadius:8,padding:"10px 12px",marginBottom:12,animation:"slideIn .2s ease both"}}>
          <span style={{fontFamily:"Inter Tight,sans-serif",fontSize:9,color:T.tintaGris,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:3}}>EAR · transcribiendo</span>
          <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:T.elev1,lineHeight:1.6}}>
            "{typed}{listening&&<span style={{display:"inline-block",width:2,height:12,background:T.verm,marginLeft:2,verticalAlign:"middle",animation:"blink .7s step-end infinite"}}/>}"
          </span>
        </div>
      )}
      {showBrain&&(
        <div style={{background:"#1C1509",borderRadius:8,padding:"10px 12px",marginBottom:12,animation:"slideIn .3s ease both"}}>
          <span style={{fontFamily:"Inter Tight,sans-serif",fontSize:9,color:T.ambar,letterSpacing:".14em",textTransform:"uppercase",display:"block",marginBottom:3}}>BRAIN · VOX</span>
          <span style={{fontFamily:"Newsreader,serif",fontSize:13,fontStyle:"italic",color:T.elev1}}>«{sc.brain}»</span>
        </div>
      )}
      {showTicket&&(
        <div style={{background:T.elev1,borderRadius:8,padding:12,animation:"slideIn .3s .1s ease both",border:`1.5px solid ${T.marchar}44`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontFamily:"Inter Tight,sans-serif",fontSize:9,color:T.marchar,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase"}}>✓ Ticket enviado</span>
            <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:10,color:T.tintaGris}}>0.42s</span>
          </div>
          {sc.items.map((item,i)=>(
            <div key={i} style={{fontFamily:"Inter Tight,sans-serif",fontSize:13,color:T.tinta,fontWeight:i===0?700:400,padding:"2px 0",borderBottom:i<sc.items.length-1?`1px dashed ${T.reglas}`:"none"}}>{item}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── MAIN ────────────────────────────────────────────────── */
export default function LandingPage() {
  const mob=useIsMobile();
  const tab=useIsTablet();
  const [annual,setAnnual]=useState(false);
  const [email,setEmail]=useState("");
  const [done,setDone]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [openFaq,setOpenFaq]=useState<number|null>(null);

  return(
    <>
      <style>{CSS}</style>

      {/* NAV */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:`${T.crema}EE`,backdropFilter:"blur(14px)",borderBottom:`1px solid ${T.reglas}`,padding:`0 ${mob?"16px":"24px"}`}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
          <a href="/" style={{fontFamily:"Newsreader,serif",fontSize:20,fontStyle:"italic",fontWeight:700,color:T.tinta,textDecoration:"none"}}>
            ia<span style={{color:T.verm}}>.</span>rest
          </a>
          <div className="hide-mob" style={{display:"flex",gap:24,alignItems:"center"}}>
            {["#como","#precios","#faq"].map((h,i)=>(
              <a key={h} href={h} style={{fontFamily:"Inter Tight,sans-serif",fontSize:13,color:T.tintaMed,textDecoration:"none",transition:"color .18s"}}
                onMouseEnter={e=>(e.currentTarget.style.color=T.verm)} onMouseLeave={e=>(e.currentTarget.style.color=T.tintaMed)}>
                {["Cómo funciona","Precios","FAQ"][i]}
              </a>
            ))}
            <a href="/registro" className="cta" style={{padding:"8px 18px",fontSize:13}}>Prueba gratis</a>
          </div>
          <button className="hide-desk" onClick={()=>setMenuOpen(!menuOpen)} style={{background:"none",border:"none",cursor:"pointer",color:T.tinta,padding:4}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              {menuOpen?<><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="20" y1="4" x2="4" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></>
              :<><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></>}
            </svg>
          </button>
        </div>
        {menuOpen&&(
          <div className="hide-desk" style={{padding:"12px 16px 20px",borderTop:`1px solid ${T.reglas}`,display:"flex",flexDirection:"column",gap:16}}>
            {[["#como","Cómo funciona"],["#precios","Precios"],["#faq","FAQ"]].map(([h,l])=>(
              <a key={h} href={h} onClick={()=>setMenuOpen(false)} style={{fontFamily:"Inter Tight,sans-serif",fontSize:15,color:T.tintaMed,textDecoration:"none"}}>{l}</a>
            ))}
            <a href="/registro" className="cta" style={{padding:"13px",textAlign:"center"}}>Prueba 14 días gratis</a>
          </div>
        )}
      </nav>

      {/* TICKER */}
      <div style={{background:T.bisel,padding:"8px 0",overflow:"hidden"}}>
        <div className="ticker-wrap"><div className="ticker-track">
          {[...TICKER,...TICKER].map((t,i)=>(
            <span key={i} style={{fontFamily:"JetBrains Mono,monospace",fontSize:11,color:i%3===0?T.verm:T.tintaGris,whiteSpace:"nowrap",padding:"0 28px"}}>
              {i%2===0?"▶ ":"· "}{t}
            </span>
          ))}
        </div></div>
      </div>

      {/* HERO */}
      <section style={{maxWidth:1100,margin:"0 auto",padding:mob?"40px 16px 48px":"72px 24px 64px"}}>
        <div style={{display:"flex",gap:mob?32:56,alignItems:"center",flexDirection:tab?"column":"row"}}>
          <div style={{flex:"1 1 0",minWidth:0,textAlign:mob?"center":"left"}}>
            <div className="fu d1" style={{display:"inline-flex",alignItems:"center",gap:7,background:T.elev2,border:`1px solid ${T.reglas}`,borderRadius:20,padding:"5px 14px",marginBottom:20}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:T.marchar,display:"inline-block",animation:"pulse 1.4s ease-out infinite"}}/>
              <span style={{fontFamily:"Inter Tight,sans-serif",fontSize:11,color:T.tintaMed,fontWeight:600}}>Bodega La Plaza · Sevilla · en directo</span>
            </div>
            <h1 className="fu d2" style={{fontFamily:"Newsreader,serif",fontSize:mob?"clamp(38px,11vw,52px)":"clamp(44px,5.5vw,68px)",fontStyle:"italic",fontWeight:700,color:T.tinta,lineHeight:1.06,marginBottom:16}}>
              Habla.<br/><span style={{color:T.verm}}>Cocina ya</span><br/>tiene el ticket.
            </h1>
            <p className="fu d3" style={{fontFamily:"Inter Tight,sans-serif",fontSize:mob?15:17,color:T.tintaMed,lineHeight:1.65,marginBottom:28,maxWidth:440,margin:mob?"0 auto 28px":"0 0 28px"}}>
              TPV con IA para restaurantes y bares en España. Sin pantallas en sala. Sin &ldquo;espera, que apunto.&rdquo; El camarero habla y el ticket llega a cocina en{" "}
              <strong style={{color:T.tinta}}>menos de medio segundo.</strong>
            </p>
            <div className="fu d4" style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:mob?"center":"flex-start"}}>
              <a href="/registro" className="cta" style={{fontSize:mob?15:16,padding:mob?"13px 24px":"14px 32px"}}>Prueba 14 días gratis</a>
              <a href="#como" className="ghost" style={{fontSize:14,color:T.tinta,padding:"12px 22px"}}>Ver cómo funciona →</a>
            </div>
            <div className="fu d5" style={{display:"grid",gridTemplateColumns:`repeat(${mob?2:4},1fr)`,gap:mob?12:20,marginTop:32}}>
              {[["< 0.5s","voz → ticket"],["0%","comisión"],["desde 39€","al mes"],["14 días","gratis sin tarjeta"]].map(([v,l])=>(
                <div key={l} style={{textAlign:mob?"center":"left"}}>
                  <div style={{fontFamily:"Newsreader,serif",fontSize:mob?22:26,fontStyle:"italic",fontWeight:700,color:T.tinta}}>{v}</div>
                  <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,color:T.tintaGris}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="fu d3" style={{width:"100%",maxWidth:tab?"100%":400,flex:tab?"1 1 auto":"0 0 400px"}}>
            <Demo mob={mob}/>
          </div>
        </div>
      </section>

      {/* AGENTES */}
      <section id="como" style={{background:T.bisel,padding:mob?"52px 16px":"72px 24px"}}>
        <div style={{maxWidth:1000,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:mob?36:52}}>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,letterSpacing:".2em",color:T.verm,textTransform:"uppercase",marginBottom:10}}>Pipeline · 5 agentes</div>
            <h2 style={{fontFamily:"Newsreader,serif",fontSize:mob?"clamp(24px,7vw,34px)":"clamp(28px,4vw,42px)",fontStyle:"italic",fontWeight:700,color:T.crema}}>
              De la boca del camarero<br/>a la impresora de cocina
            </h2>
          </div>
          <div style={{display:"flex",gap:mob?10:0,alignItems:"stretch",overflowX:mob?"auto":"visible",justifyContent:mob?"flex-start":"center",flexWrap:mob?"nowrap":"wrap",paddingBottom:mob?8:0}}>
            {[
              {id:"EAR",icon:"🎙",role:"Escucha y transcribe",color:"#2B6A6E",desc:"Capta voz en tiempo real. Whisper ~0.3s."},
              {id:"BRAIN",icon:"🧠",role:"Interpreta la jerga",color:T.ambar,desc:"'Marchar dos gambas' → JSON estructurado."},
              {id:"COURIER",icon:"📡",role:"Enruta al destino",color:T.verm,desc:"Manda el ticket a impresora, KDS y tablet."},
              {id:"VOX",icon:"🔊",role:"Confirma al camarero",color:T.marchar,desc:"Susurro: 'entendido, sin azúcar como siempre'."},
              {id:"ANALYST",icon:"📊",role:"Mide el servicio",color:T.tintaGris,desc:"Latencia, rotación, tickets/h."},
            ].map((a,i,arr)=>(
              <div key={a.id} style={{display:"flex",alignItems:"stretch",flexShrink:0}}>
                <div style={{background:"#0D0B09",border:"1px solid #2A2520",borderRadius:12,padding:mob?"16px 14px":"22px 18px",width:mob?148:166}}>
                  <div style={{fontSize:20,marginBottom:8}}>{a.icon}</div>
                  <div style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:a.color,fontWeight:700,marginBottom:5}}>{a.id}</div>
                  <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:11,color:T.crema,fontWeight:600,marginBottom:6}}>{a.role}</div>
                  <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,color:T.tintaGris,lineHeight:1.55}}>{a.desc}</div>
                </div>
                {!mob&&i<arr.length-1&&<div style={{display:"flex",alignItems:"center",padding:"0 4px",color:T.verm,fontSize:16}}>→</div>}
              </div>
            ))}
          </div>
          {mob&&<div style={{textAlign:"center",marginTop:8}}><span style={{fontFamily:"Caveat,cursive",fontSize:12,color:T.tintaGris}}>← desliza →</span></div>}
          <div style={{textAlign:"center",marginTop:36}}>
            <div style={{display:"inline-flex",flexWrap:"wrap",gap:12,alignItems:"center",justifyContent:"center",background:"#0D0B09",border:"1px solid #2A2520",borderRadius:10,padding:mob?"12px 18px":"12px 24px"}}>
              <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:12,color:T.tintaGris}}>latencia objetivo</span>
              <span style={{fontFamily:"Newsreader,serif",fontSize:mob?24:28,fontStyle:"italic",fontWeight:700,color:T.verm}}>&lt; 0.5s</span>
              <span style={{fontFamily:"JetBrains Mono,monospace",fontSize:11,color:T.tintaGris}}>sin contar el tiempo de habla</span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section style={{background:T.elev2,padding:mob?"48px 16px":"64px 24px"}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",gap:28,alignItems:"flex-start",flexDirection:mob?"column":"row",flexWrap:"wrap"}}>
          <div style={{flex:"1 1 240px"}}>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:9,letterSpacing:".18em",textTransform:"uppercase",color:T.verm,marginBottom:8}}>Caso real · viernes 21:14</div>
            <div style={{fontFamily:"Newsreader,serif",fontSize:22,fontStyle:"italic",fontWeight:700,color:T.tinta,marginBottom:4}}>Bodega La Plaza</div>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:13,color:T.tintaGris}}>14 mesas · lleno hasta arriba</div>
          </div>
          <div style={{flex:"2 1 320px",display:"grid",gridTemplateColumns:`repeat(${mob?2:4},1fr)`,gap:12}}>
            {[["38","tickets/h","hora pico 21:00"],["0.42s","latencia","VOX → ticket"],["+22%","rotación","vs semana anterior"],["0.7%","errores","2 de 284 comandas"]].map(([v,u,l])=>(
              <div key={l} style={{background:T.elev1,borderRadius:10,padding:"14px 12px",border:`1px solid ${T.reglas}`}}>
                <div style={{fontFamily:"Newsreader,serif",fontSize:24,fontStyle:"italic",fontWeight:700,color:T.tinta}}>{v}</div>
                <div style={{fontFamily:"JetBrains Mono,monospace",fontSize:9,color:T.verm,marginBottom:2}}>{u}</div>
                <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,color:T.tintaGris}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VERIFACTU URGENCY BANNER */}
      <section style={{background:`linear-gradient(135deg,#1C0F09,#2A1208)`,padding:mob?"24px 16px":"32px 24px",borderBottom:`1px solid ${T.verm}33`}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",gap:20,alignItems:"center",flexDirection:mob?"column":"row",textAlign:mob?"center":"left"}}>
          <div style={{fontSize:36,flexShrink:0}}>⚖️</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,letterSpacing:".2em",color:T.verm,textTransform:"uppercase",marginBottom:4}}>Obligatorio en España</div>
            <div style={{fontFamily:"Newsreader,serif",fontSize:mob?18:22,fontStyle:"italic",fontWeight:700,color:T.crema,marginBottom:4}}>
              VeriFactu homologado SHA-256 — incluido en todos los planes
            </div>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:13,color:T.tintaGris,lineHeight:1.6}}>
              Multa de hasta <strong style={{color:T.ambar}}>50.000 €/ejercicio</strong> por software no homologado.
              Obligatorio para sociedades el <strong style={{color:T.crema}}>1-ene-2027</strong> y autónomos el <strong style={{color:T.crema}}>1-jul-2027</strong>.
              ia.rest genera facturas con QR verificable por la AEAT desde el primer ticket.{" "}
              <span style={{fontFamily:"Caveat,cursive",color:T.marchar}}>Ya activo, no hay que configurar nada.</span>
            </div>
          </div>
        </div>
      </section>

      {/* TODO INCLUIDO */}
      <section style={{background:T.elev1,padding:mob?"36px 16px":"48px 24px",borderBottom:`1px solid ${T.reglas}`}}>
        <div style={{maxWidth:1000,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,letterSpacing:".2em",color:T.verm,textTransform:"uppercase",marginBottom:8}}>En todos los planes, sin asteriscos</div>
            <h2 style={{fontFamily:"Newsreader,serif",fontSize:mob?"clamp(20px,6vw,28px)":"clamp(22px,3vw,32px)",fontStyle:"italic",fontWeight:700,color:T.tinta}}>
              Todo lo que esperas. Y la voz que nadie más da.
            </h2>
          </div>
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":`repeat(4,1fr)`,gap:12}}>
            {[
              {icon:"🎤",label:"Comandas por voz",sub:"EAR + BRAIN nativos"},
              {icon:"⚖️",label:"VeriFactu SHA-256",sub:"Homologado AEAT"},
              {icon:"🌿",label:"Alérgenos EU",sub:"Reg. 1169/2011"},
              {icon:"📺",label:"KDS en cocina",sub:"Tiempo real"},
              {icon:"💳",label:"Stripe + Bizum",sub:"Sin comisión nuestra"},
              {icon:"📱",label:"Sin app de tienda",sub:"PWA en cualquier Android"},
              {icon:"🔁",label:"Sin permanencia",sub:"Cancelas cuando quieras"},
              {icon:"🏷",label:"Kit Digital",sub:"Subvención compatible"},
            ].map(({icon,label,sub})=>(
              <div key={label} style={{background:T.crema,border:`1px solid ${T.reglas}`,borderRadius:10,padding:"14px 12px",textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
                <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:12,fontWeight:700,color:T.tinta,lineHeight:1.3,marginBottom:3}}>{label}</div>
                <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,color:T.tintaGris}}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARATIVA */}
      <section style={{background:T.crema,padding:mob?"40px 16px":"56px 24px"}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:32}}>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,letterSpacing:".2em",color:T.verm,textTransform:"uppercase",marginBottom:8}}>Comparativa · mayo 2026</div>
            <h2 style={{fontFamily:"Newsreader,serif",fontSize:mob?"clamp(20px,6vw,28px)":"clamp(22px,3vw,32px)",fontStyle:"italic",fontWeight:700,color:T.tinta}}>
              Lo que dan los demás a 59 €/mes.<br/>Lo que da ia.rest a 39 €/mes.
            </h2>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"Inter Tight,sans-serif",fontSize:mob?11:13}}>
              <thead>
                <tr>
                  {["Característica","ia.rest 39 €","TPV básico ~34–59 €"].map((h,i)=>(
                    <th key={h} style={{padding:"10px 14px",textAlign:i===0?"left":"center",
                      borderBottom:`2px solid ${i===1?T.verm:T.reglas}`,
                      fontWeight:700,color:i===1?T.verm:T.tintaMed,
                      background:i===1?`${T.verm}08`:"transparent",
                      fontSize:10,letterSpacing:".1em",textTransform:"uppercase"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Comandas por voz con IA","✓","✗ (no existe en el mercado)"],
                  ["VeriFactu homologado AEAT","✓","Según producto"],
                  ["Sin comisión por transacción","✓","Depende — algunos cobran 1–1,5%"],
                  ["KDS cocina incluido en plan base","✓","Habitualmente módulo extra"],
                  ["Dispositivos ilimitados en el local","✓","A menudo cobran por terminal"],
                  ["Alérgenos EU Reg. 1169/2011","✓","✓ (estándar del sector)"],
                  ["PWA · sin descarga de app","✓","Variable"],
                  ["14 días gratis sin tarjeta","✓","Raro en el mercado español"],
                ].map(([feat,ours,theirs],i)=>(
                  <tr key={feat} style={{background:i%2===0?T.elev1:"transparent"}}>
                    <td style={{padding:"10px 14px",color:T.tintaMed,borderBottom:`1px solid ${T.reglas}`}}>{feat}</td>
                    <td style={{padding:"10px 14px",textAlign:"center",color:T.marchar,fontWeight:700,
                      background:`${T.verm}05`,borderBottom:`1px solid ${T.reglas}`,borderLeft:`2px solid ${T.verm}22`}}>{ours}</td>
                    <td style={{padding:"10px 14px",textAlign:"center",color:T.tintaGris,borderBottom:`1px solid ${T.reglas}`}}>{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{textAlign:"center",marginTop:16}}>
            <span style={{fontFamily:"Caveat,cursive",fontSize:13,color:T.tintaGris}}>
              Comparativa orientativa basada en información pública de mayo 2026
            </span>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="precios" style={{padding:mob?"52px 16px":"72px 24px"}}>
        <div style={{maxWidth:1000,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:40}}>
            <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:10,letterSpacing:".2em",color:T.verm,textTransform:"uppercase",marginBottom:10}}>Precios</div>
            <h2 style={{fontFamily:"Newsreader,serif",fontSize:mob?"clamp(24px,7vw,34px)":"clamp(28px,4vw,40px)",fontStyle:"italic",fontWeight:700,color:T.tinta,marginBottom:20}}>
              Sin comisiones.<br/>Sin sorpresas.
            </h2>
            <div style={{display:"inline-flex",background:T.elev2,borderRadius:30,padding:3,gap:2}}>
              {["Mensual","Anual (−18%)"].map((l,i)=>(
                <button key={l} onClick={()=>setAnnual(i===1)} style={{padding:"8px 16px",borderRadius:26,border:"none",cursor:"pointer",fontFamily:"Inter Tight,sans-serif",fontSize:12,fontWeight:600,background:(annual?i===1:i===0)?T.tinta:"transparent",color:(annual?i===1:i===0)?T.crema:T.tintaGris,transition:"all .2s"}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:16,flexDirection:tab?"column":"row",alignItems:"stretch"}}>
            {PLANS.map(p=>{
              const price=annual?Math.round(p.price*.82):p.price;
              return(
                <div key={p.id} className="plan-card" style={{background:p.featured?T.tinta:T.elev1,border:`1.5px solid ${p.featured?T.verm:T.reglas}`,borderRadius:14,padding:mob?"22px 18px":"28px 24px",flex:"1 1 0",position:"relative",boxShadow:p.featured?`0 8px 36px ${T.tinta}2A`:undefined}}>
                  {p.featured&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:T.verm,color:T.crema,fontSize:9,fontFamily:"Inter Tight,sans-serif",fontWeight:700,letterSpacing:".14em",padding:"4px 14px",borderRadius:20,textTransform:"uppercase",whiteSpace:"nowrap"}}>Más popular</div>}
                  <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:9,letterSpacing:".2em",textTransform:"uppercase",color:p.featured?T.verm:T.tintaGris,marginBottom:3}}>Plan</div>
                  <div style={{fontFamily:"Newsreader,serif",fontSize:mob?24:28,fontStyle:"italic",fontWeight:700,color:p.featured?T.crema:T.tinta,marginBottom:4}}>{p.name}</div>
                  <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:12,color:T.tintaGris,marginBottom:20}}>{p.desc}</div>
                  <div style={{marginBottom:22}}>
                    <span style={{fontFamily:"Newsreader,serif",fontSize:mob?36:42,fontWeight:700,fontStyle:"italic",color:p.featured?T.crema:T.tinta}}>{price}€</span>
                    <span style={{fontFamily:"Inter Tight,sans-serif",fontSize:12,color:T.tintaGris}}>/mes</span>
                    {annual&&<div style={{fontFamily:"Caveat,cursive",fontSize:12,color:T.marchar,marginTop:2}}>ahorras {p.price-price}€/mes</div>}
                  </div>
                  <a href="/registro" className="cta" style={{width:"100%",marginBottom:20,fontSize:13,padding:13,background:p.featured?T.verm:"transparent",color:p.featured?T.crema:T.tinta,border:`1.5px solid ${p.featured?T.verm:T.reglas}`}}>
                    Empezar gratis 14 días
                  </a>
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    {p.features.map(f=>(
                      <div key={f} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                        <span style={{color:T.marchar,fontSize:13,flexShrink:0,marginTop:1}}>✓</span>
                        <span style={{fontFamily:"Inter Tight,sans-serif",fontSize:12,color:p.featured?"#C4B9A8":T.tintaMed,lineHeight:1.5}}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{textAlign:"center",marginTop:24}}>
            <span style={{fontFamily:"Caveat,cursive",color:T.tintaGris,fontSize:15}}>14 días gratis · sin tarjeta · cancelas cuando quieras</span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{background:T.elev2,padding:mob?"48px 16px":"64px 24px"}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:40}}>
            <h2 style={{fontFamily:"Newsreader,serif",fontSize:mob?"clamp(22px,7vw,32px)":"clamp(24px,3.5vw,38px)",fontStyle:"italic",fontWeight:700,color:T.tinta}}>Preguntas frecuentes</h2>
          </div>
          <div style={{maxWidth:680,margin:"0 auto"}}>
            {FAQS.map((f,i)=>(
              <div key={i} style={{borderBottom:`1px solid ${T.reglas}`}}>
                <button className="faq-q" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                  <span style={{textAlign:"left",paddingRight:16,lineHeight:1.4}}>{f.q}</span>
                  <span style={{color:T.verm,fontSize:20,fontWeight:300,flexShrink:0}}>{openFaq===i?"−":"+"}</span>
                </button>
                {openFaq===i&&<div style={{fontFamily:"Inter Tight,sans-serif",fontSize:14,color:T.tintaMed,lineHeight:1.7,paddingBottom:16}}>{f.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{background:T.bisel,padding:mob?"60px 16px":"72px 24px"}}>
        <div style={{maxWidth:520,margin:"0 auto",textAlign:"center"}}>
          <h2 style={{fontFamily:"Newsreader,serif",fontSize:mob?"clamp(28px,8vw,44px)":"clamp(30px,5vw,52px)",fontStyle:"italic",fontWeight:700,color:T.crema,lineHeight:1.1,marginBottom:14}}>
            El próximo viernes<br/><span style={{color:T.verm}}>sin anotar nada.</span>
          </h2>
          <p style={{fontFamily:"Inter Tight,sans-serif",fontSize:mob?14:15,color:T.tintaGris,lineHeight:1.7,marginBottom:32}}>
            14 días gratis con el plan SERVICIO completo. Sin tarjeta. Sin llamadas.<br/>
            <span style={{fontFamily:"Caveat,cursive",fontSize:15,color:T.ambar}}>Luego desde 39 €/mes. Sin comisiones. Sin permanencia.</span>
          </p>
          {!done?(
            <div style={{display:"flex",gap:10,flexDirection:mob?"column":"row",maxWidth:420,margin:"0 auto"}}>
              <input type="email" placeholder="tu@restaurante.com" value={email} onChange={e=>setEmail(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&email&&setDone(true)}/>
              <a href={`/registro${email?`?email=${encodeURIComponent(email)}`:""}`} className="cta"
                onClick={()=>email&&setDone(true)} style={{whiteSpace:"nowrap",padding:"13px 22px",flexShrink:0}}>
                Empezar gratis →
              </a>
            </div>
          ):(
            <div style={{background:"#0D0B09",border:`1px solid ${T.marchar}44`,borderRadius:10,padding:"18px 24px",display:"inline-block"}}>
              <div style={{fontFamily:"Newsreader,serif",fontSize:18,fontStyle:"italic",color:T.marchar,marginBottom:4}}>✓ Perfecto</div>
              <div style={{fontFamily:"Inter Tight,sans-serif",fontSize:13,color:T.tintaGris}}>Revisa {email} para verificar y empezar el trial.</div>
            </div>
          )}
          <div style={{fontFamily:"Caveat,cursive",fontSize:14,color:T.tintaGris,marginTop:20}}>hecho con cariño en una cocina · 0 quejas</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{background:"#0D0B09",padding:`20px ${mob?"16px":"24px"}`}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div style={{fontFamily:"Newsreader,serif",fontSize:18,fontStyle:"italic",fontWeight:700,color:T.crema}}>ia<span style={{color:T.verm}}>.</span>rest</div>
          <div style={{display:"flex",gap:mob?16:24,flexWrap:"wrap"}}>
            {["Privacidad","Términos","Contacto"].map(l=>(<a key={l} href="#" style={{fontFamily:"Inter Tight,sans-serif",fontSize:11,color:T.tintaGris,textDecoration:"none"}}>{l}</a>))}
          </div>
          <div style={{fontFamily:"JetBrains Mono,monospace",fontSize:10,color:T.tintaGris}}>© 2026 ia.rest · España</div>
        </div>
      </footer>
    </>
  );
}
