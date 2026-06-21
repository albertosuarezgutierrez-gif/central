// → app/admin/asistente/page.tsx
'use client';
import { useRef, useState } from 'react';

const C = { indigo: 'var(--brand-primary)', soft: 'var(--brand-light)', text:'#1e1b4b', bg:'#f1f5f9', card:'#fff', border:'#e2e8f0', muted:'#64748b' };
const FONT = 'Nunito, system-ui, sans-serif';
type Msg = { de:'tu'|'ia'; texto:string };

export default function Asistente() {
  const [msgs, setMsgs] = useState<Msg[]>([{ de:'ia', texto:'Hola Vanessa 👋 Pregúntame por el equipo o las limpiezas: quién trabaja mañana, carga de la semana, qué hay sin asignar, la agenda de Leidy…' }]);
  const [q, setQ] = useState(''); const [load, setLoad] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  const enviar = async () => {
    const pregunta = q.trim(); if (!pregunta || load) return;
    setMsgs(m=>[...m,{de:'tu',texto:pregunta}]); setQ(''); setLoad(true);
    try {
      const r = await fetch('/api/admin/asistente',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pregunta}) }).then(x=>x.json());
      setMsgs(m=>[...m,{de:'ia',texto:r.respuesta||'…'}]);
    } catch { setMsgs(m=>[...m,{de:'ia',texto:'Ups, no pude responder. Inténtalo otra vez.'}]); }
    setLoad(false);
    setTimeout(()=>fin.current?.scrollIntoView({behavior:'smooth'}),50);
  };

  const sugerencias = ['¿Quién trabaja mañana?','Carga de la semana','¿Qué hay sin asignar?','Facturas por cobrar'];

  return (
    <div style={{ fontFamily:FONT, color:C.text, background:C.bg, minHeight:'100vh', display:'flex', flexDirection:'column', padding:16 }}>
      <h1 style={{ fontWeight:900, fontSize:24, margin:'0 0 12px' }}>Asistente</h1>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10, overflowY:'auto', paddingBottom:12 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ alignSelf: m.de==='tu'?'flex-end':'flex-start', maxWidth:'85%',
            background: m.de==='tu'?C.indigo:C.card, color: m.de==='tu'?'#fff':C.text,
            border: m.de==='tu'?'none':('1px solid '+C.border), borderRadius:14, padding:'10px 14px', whiteSpace:'pre-wrap', fontSize:15 }}>
            {m.texto}
          </div>
        ))}
        {load && <div style={{ alignSelf:'flex-start', color:C.muted }}>escribiendo…</div>}
        <div ref={fin} />
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'8px 0' }}>
        {sugerencias.map(s=>(
          <button key={s} onClick={()=>setQ(s)} style={{ background:C.soft, color:C.indigo, border:'none', borderRadius:20, padding:'6px 12px', fontFamily:FONT, fontWeight:700, fontSize:13, cursor:'pointer' }}>{s}</button>
        ))}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') enviar(); }}
          placeholder="Escribe tu pregunta…" style={{ flex:1, padding:'12px', borderRadius:12, border:('1px solid '+C.border), fontFamily:FONT, fontSize:15 }} />
        <button onClick={enviar} disabled={load} style={{ background:C.indigo, color:'#fff', border:'none', borderRadius:12, padding:'0 20px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>Enviar</button>
      </div>
    </div>
  );
}
