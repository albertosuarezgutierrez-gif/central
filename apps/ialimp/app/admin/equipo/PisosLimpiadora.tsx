// → app/admin/equipo/PisosLimpiadora.tsx
// Úsalo en la ficha de cada limpiadora: <PisosLimpiadora limpiadoraId={id} />
'use client';
import { useEffect, useMemo, useState } from 'react';

const C = { indigo: 'var(--brand-primary)', soft: 'var(--brand-light)', text:'#1e1b4b', card:'#fff', border:'#e2e8f0', muted:'#64748b', ok:'#16a34a' };
const FONT = 'Nunito, system-ui, sans-serif';

export default function PisosLimpiadora({ limpiadoraId }: { limpiadoraId: string }) {
  const [nombre, setNombre] = useState('');
  const [pisos, setPisos] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState(''); const [load, setLoad] = useState(true); const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/admin/limpiadoras/${limpiadoraId}/propiedades`).then(x=>x.json());
      if (r.error) { setMsg(r.error); setLoad(false); return; }
      setNombre(r.nombre); setPisos(r.pisos||[]); setSel(new Set((r.conoce||[]).map(String))); setLoad(false);
    })();
  }, [limpiadoraId]);

  const toggle = (id:string) => setSel(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pisos;
    return pisos.filter(p => (p.nombre||'').toLowerCase().includes(q) || (p.direccion||'').toLowerCase().includes(q));
  }, [pisos, busca]);

  const guardar = async () => {
    setSaving(true); setMsg('');
    const r = await fetch(`/api/admin/limpiadoras/${limpiadoraId}/propiedades`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ propiedades:[...sel] })
    }).then(x=>x.json());
    setSaving(false);
    setMsg(r.ok ? `Guardado ✓ (${r.guardados} pisos)` : (r.error||'Error al guardar'));
  };

  if (load) return <div style={{ fontFamily:FONT, color:C.muted, padding:16 }}>Cargando…</div>;

  return (
    <div style={{ fontFamily:FONT, color:C.text }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <h3 style={{ fontWeight:900, fontSize:18, margin:0 }}>Pisos que conoce {nombre} <span style={{ color:C.muted, fontWeight:700 }}>({sel.size})</span></h3>
        <button onClick={guardar} disabled={saving} style={{ background:C.indigo, color:'#fff', border:'none', borderRadius:10, padding:'10px 18px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>
          {saving?'Guardando…':'Guardar'}
        </button>
      </div>

      <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar piso por nombre o dirección…"
        style={{ width:'100%', padding:'10px', borderRadius:10, border:`1px solid ${C.border}`, fontFamily:FONT, fontSize:15, marginBottom:10 }} />

      {msg && <div style={{ color: msg.includes('✓')?C.ok:'#dc2626', fontWeight:700, marginBottom:8 }}>{msg}</div>}

      <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:'60vh', overflowY:'auto' }}>
        {filtrados.map(p => {
          const on = sel.has(String(p.id));
          return (
            <label key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10,
              background: on?C.soft:C.card, border:`1px solid ${on?C.indigo:C.border}`, cursor:'pointer' }}>
              <input type="checkbox" checked={on} onChange={()=>toggle(String(p.id))} />
              <span>
                <span style={{ fontWeight:700 }}>{p.nombre}</span>
                {p.direccion && <span style={{ color:C.muted, fontSize:13 }}> · {p.direccion}</span>}
              </span>
            </label>
          );
        })}
        {filtrados.length===0 && <div style={{ color:C.muted, padding:12 }}>Sin pisos que coincidan.</div>}
      </div>
    </div>
  );
}
