// → app/admin/concursos/perfil/page.tsx — Perfil de identificación de la empresa
// (F3 del módulo @iarest/module-concursos). Estos datos rellenan el DEUC y la
// declaración responsable de cada concurso. Imita layout/paleta del v1 y F2.
'use client';
import { useEffect, useState } from 'react';

const C = { indigo:'var(--brand-primary)', soft:'var(--brand-light)', text:'#1e1b4b', bg:'#f1f5f9', card:'#fff', border:'#e2e8f0', muted:'#64748b' };
const FONT = 'Nunito, system-ui, sans-serif';

const INPUT: React.CSSProperties = { padding:'10px 12px', borderRadius:12, border:`1px solid ${C.border}`, fontFamily:FONT, fontSize:14, boxSizing:'border-box', width:'100%' };

export default function PerfilConcursos() {
  const [p, setP] = useState<any>({ razon_social:'', nif:'', domicilio:'', representante:'', representante_dni:'', email:'', telefono:'', es_pyme:true });
  const [msg, setMsg] = useState('');

  useEffect(() => { (async () => {
    try { const r = await fetch('/api/admin/concursos/perfil').then(x=>x.json()); if (r.perfil) setP((prev:any)=>({ ...prev, ...r.perfil })); } catch {}
  })(); }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg('Guardando…');
    const r = await fetch('/api/admin/concursos/perfil', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(p) });
    setMsg(r.ok ? 'Guardado ✔' : 'Error al guardar');
  }
  const set = (k:string) => (e:any) => setP({ ...p, [k]: e.target.type==='checkbox' ? e.target.checked : e.target.value });

  return (
    <div style={{ fontFamily:FONT, color:C.text, background:C.bg, minHeight:'100vh', padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', maxWidth:560, marginBottom:4 }}>
        <h1 style={{ fontWeight:900, fontSize:24, margin:0 }}>Perfil de empresa (concursos)</h1>
        <a href="/admin/concursos" style={{ color:C.indigo, fontWeight:800, fontSize:14, textDecoration:'none' }}>← Concursos</a>
      </div>
      <p style={{ color:C.muted, fontSize:14, margin:'0 0 16px' }}>Estos datos rellenan el DEUC y la declaración responsable de cada concurso.</p>
      <form onSubmit={guardar} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, display:'grid', gap:10, maxWidth:560, width:'100%', boxSizing:'border-box' }}>
        <input placeholder="Razón social" value={p.razon_social} onChange={set('razon_social')} required style={INPUT} />
        <input placeholder="NIF / CIF" value={p.nif} onChange={set('nif')} required style={INPUT} />
        <input placeholder="Domicilio" value={p.domicilio||''} onChange={set('domicilio')} style={INPUT} />
        <input placeholder="Representante (apoderado)" value={p.representante||''} onChange={set('representante')} style={INPUT} />
        <input placeholder="DNI del representante" value={p.representante_dni||''} onChange={set('representante_dni')} style={INPUT} />
        <input placeholder="Email" value={p.email||''} onChange={set('email')} style={INPUT} />
        <input placeholder="Teléfono" value={p.telefono||''} onChange={set('telefono')} style={INPUT} />
        <label style={{ display:'flex', gap:8, alignItems:'center', fontSize:14 }}>
          <input type="checkbox" checked={p.es_pyme} onChange={set('es_pyme')} /> Es PYME
        </label>
        <button type="submit" style={{ background:C.indigo, color:'#fff', border:0, borderRadius:12, padding:'10px 18px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>Guardar</button>
        {msg && <span style={{ color:C.muted, fontSize:13 }}>{msg}</span>}
      </form>
    </div>
  );
}
