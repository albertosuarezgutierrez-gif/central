'use client'
import { useState } from 'react'

const C = { bg:'#14110E', bg2:'#1E1A15', cream:'#F6F1E7', creamDim:'#8C7B69', green:'#3F7D44', amber:'#E8A33B', rule:'#2E2720', vermilion:'#D9442B' }

export default function QrSuccess() {
  const [stars, setStars] = useState(0)
  const [sent, setSent] = useState(false)
  return (
    <div style={{ fontFamily:'sans-serif', background:C.bg, color:C.cream, minHeight:'100vh', maxWidth:480, margin:'0 auto', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', gap:22, textAlign:'center' }}>
      <style>{`@keyframes gp{0%{transform:scale(0);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ width:80, height:80, borderRadius:'50%', background:`${C.green}20`, border:`2px solid ${C.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, animation:'gp 0.5s ease' }}>✓</div>
      <div>
        <div style={{ fontSize:27, fontStyle:'italic', marginBottom:5 }}>¡Pagado!</div>
        <div style={{ fontSize:13, color:C.creamDim }}>Recibo enviado a tu móvil</div>
      </div>
      {!sent ? (
        <div style={{ width:'100%', background:C.bg2, borderRadius:14, padding:'18px', border:`1px solid ${C.rule}` }}>
          <div style={{ fontFamily:'cursive', fontSize:15, color:C.amber, marginBottom:12 }}>¿Cómo fue la experiencia?</div>
          <div style={{ display:'flex', justifyContent:'center', gap:5, marginBottom:14 }}>
            {[1,2,3,4,5].map(s => <button key={s} onClick={()=>setStars(s)} style={{ fontSize:28, background:'none', border:'none', cursor:'pointer', opacity:stars>=s?1:0.2 }}>★</button>)}
          </div>
          {stars > 0 && <button onClick={()=>setSent(true)} style={{ width:'100%', padding:'10px', background:'transparent', border:`1px solid ${C.rule}`, borderRadius:10, color:C.cream, fontSize:12, cursor:'pointer' }}>Enviar valoración</button>}
        </div>
      ) : (
        <div style={{ background:`${C.green}15`, borderRadius:11, padding:'13px 18px', border:`1px solid ${C.green}33` }}>✓ ¡Gracias! Nos alegra saberlo</div>
      )}
      <div style={{ fontFamily:'cursive', fontSize:14, color:C.creamDim }}>¡Hasta la próxima! 🍷</div>
    </div>
  )
}
