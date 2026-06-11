// → app/admin/concursos/biblioteca/page.tsx — Mi biblioteca de empresa (F2 del
// módulo @central/module-concursos). El licitador sube sus documentos una vez y
// cada concurso autocompleta su checklist. Imita layout/paleta del v1 de concursos.
'use client';
import { useEffect, useState } from 'react';

const C = { indigo:'var(--brand-primary)', soft:'var(--brand-light)', text:'#1e1b4b', bg:'#f1f5f9', card:'#fff', border:'#e2e8f0', muted:'#64748b' };
const FONT = 'Nunito, system-ui, sans-serif';

// Valores de TipoDocumentoBiblioteca del módulo (mantener en sync).
const TIPOS = [
  'escritura_constitucion', 'poderes', 'cif', 'certificado_aeat', 'certificado_ss',
  'cuentas_anuales', 'seguro_rc', 'clasificacion_empresarial', 'certificado_iso',
  'declaracion_responsable', 'deuc', 'otro',
] as const;

const TIPO_LABEL: Record<string,string> = {
  escritura_constitucion:'Escritura de constitución', poderes:'Poderes / apoderamiento', cif:'CIF / NIF',
  certificado_aeat:'Certificado AEAT (al corriente)', certificado_ss:'Certificado Seguridad Social',
  cuentas_anuales:'Cuentas anuales', seguro_rc:'Seguro de responsabilidad civil',
  clasificacion_empresarial:'Clasificación empresarial', certificado_iso:'Certificado ISO',
  declaracion_responsable:'Declaración responsable', deuc:'DEUC', otro:'Otro',
};

type Doc = { id:string; tipo:string; nombre:string; vigencia_hasta:string|null };

export default function Biblioteca() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tipo, setTipo] = useState<string>('certificado_aeat');
  const [nombre, setNombre] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [load, setLoad] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try { const r = await fetch('/api/admin/concursos/biblioteca').then(x=>x.json()); setDocs(r.documentos||[]); } catch {}
  };
  useEffect(()=>{ cargar(); }, []);

  const alta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) { setError('Pon un nombre al documento.'); return; }
    setLoad(true); setError('');
    try {
      const r = await fetch('/api/admin/concursos/biblioteca', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ tipo, nombre, vigencia_hasta: vigencia || undefined }),
      }).then(x=>x.json());
      if (r.error) { setError(r.error); } else { setNombre(''); setVigencia(''); cargar(); }
    } catch { setError('No se pudo guardar el documento.'); }
    setLoad(false);
  };

  return (
    <div style={{ fontFamily:FONT, color:C.text, background:C.bg, minHeight:'100vh', padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', maxWidth:760, marginBottom:4 }}>
        <h1 style={{ fontWeight:900, fontSize:24, margin:0 }}>Mi biblioteca</h1>
        <a href="/admin/concursos" style={{ color:C.indigo, fontWeight:800, fontSize:14, textDecoration:'none' }}>← Concursos</a>
      </div>
      <p style={{ color:C.muted, margin:'0 0 16px', fontSize:14 }}>Sube tus documentos una vez: cada concurso autocompletará su checklist con lo que ya tienes y te avisará de lo que falta o caduca.</p>

      {/* Alta */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, maxWidth:760, width:'100%', marginBottom:16, boxSizing:'border-box' }}>
        <form onSubmit={alta} style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={tipo} onChange={e=>setTipo(e.target.value)}
            style={{ padding:'10px 12px', borderRadius:12, border:`1px solid ${C.border}`, fontFamily:FONT, fontSize:14, background:'#fff' }}>
            {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]||t}</option>)}
          </select>
          <input placeholder="Nombre del documento" value={nombre} onChange={e=>setNombre(e.target.value)} required
            style={{ flex:'1 1 200px', minWidth:160, padding:'10px 12px', borderRadius:12, border:`1px solid ${C.border}`, fontFamily:FONT, fontSize:14, boxSizing:'border-box' }} />
          <input type="date" value={vigencia} onChange={e=>setVigencia(e.target.value)} title="Vigente hasta (opcional)"
            style={{ padding:'10px 12px', borderRadius:12, border:`1px solid ${C.border}`, fontFamily:FONT, fontSize:14 }} />
          <button type="submit" disabled={load}
            style={{ background:C.indigo, color:'#fff', border:'none', borderRadius:12, padding:'10px 18px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>
            {load ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
        {error && <div style={{ color:'#991b1b', fontSize:13, marginTop:8 }}>{error}</div>}
      </div>

      {/* Listado */}
      <div style={{ maxWidth:760, width:'100%' }}>
        <h2 style={{ fontWeight:800, fontSize:18, margin:'0 0 8px' }}>Documentos guardados</h2>
        {docs.length === 0 ? (
          <p style={{ color:C.muted, fontSize:14 }}>Aún no has guardado ningún documento.</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {docs.map(d=>(
              <div key={d.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'10px 14px', display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <span><strong>{TIPO_LABEL[d.tipo]||d.tipo}</strong> — {d.nombre}</span>
                {d.vigencia_hasta && <span style={{ fontSize:12, color:C.muted }}>vigente hasta {d.vigencia_hasta}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
