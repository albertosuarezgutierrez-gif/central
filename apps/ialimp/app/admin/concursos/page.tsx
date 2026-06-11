// → app/admin/concursos/page.tsx — Agente de concursos públicos (módulo @iarest/module-concursos)
'use client';
import { useEffect, useRef, useState } from 'react';
import { autocompletarChecklist, documentosFaltantes } from '@iarest/module-concursos';
import type { Biblioteca } from '@iarest/module-concursos';

const C = { indigo:'var(--brand-primary)', soft:'var(--brand-light)', text:'#1e1b4b', bg:'#f1f5f9', card:'#fff', border:'#e2e8f0', muted:'#64748b' };
const FONT = 'Nunito, system-ui, sans-serif';

const SOBRE_LABEL: Record<string,string> = { administrativo:'📋 Sobre administrativo', tecnico:'📐 Sobre técnico', economico:'💶 Sobre económico' };
const SEMAFORO: Record<string,{bg:string;txt:string;label:string}> = {
  verde: { bg:'#dcfce7', txt:'#166534', label:'🟢 Adelante' },
  ambar: { bg:'#fef9c3', txt:'#854d0e', label:'🟡 Revisar' },
  rojo:  { bg:'#fee2e2', txt:'#991b1b', label:'🔴 No apto' },
};

const eur = (n:number|undefined) => n==null ? '—' : n.toLocaleString('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0});

export default function Concursos() {
  const [texto, setTexto] = useState('');
  const [load, setLoad] = useState(false);
  const [error, setError] = useState('');
  const [actual, setActual] = useState<any>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [biblioteca, setBiblioteca] = useState<Biblioteca>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    try { const r = await fetch('/api/admin/concursos/analizar').then(x=>x.json()); setLista(r.concursos||[]); } catch {}
  };
  // Carga la biblioteca de empresa para autocompletar el checklist y avisar de lo que falta.
  const cargarBiblioteca = async () => {
    try {
      const r = await fetch('/api/admin/concursos/biblioteca').then(x=>x.json());
      const docs = (r.documentos||[]).map((d:any)=>({ tipo:d.tipo, nombre:d.nombre, vigencia_hasta:d.vigencia_hasta ?? undefined }));
      setBiblioteca(docs);
    } catch {}
  };
  useEffect(()=>{ cargar(); cargarBiblioteca(); }, []);

  const analizar = async (form: FormData | null, body?: any) => {
    setLoad(true); setError(''); setActual(null);
    try {
      const opt:any = form ? { method:'POST', body:form } : { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) };
      const r = await fetch('/api/admin/concursos/analizar', opt).then(x=>x.json());
      if (r.error) { setError(r.error); } else { setActual(r.concurso); cargar(); }
    } catch { setError('No se pudo analizar el pliego.'); }
    setLoad(false);
  };

  const onPdf = (f: File|undefined) => { if (!f) return; const fd = new FormData(); fd.append('file', f); analizar(fd); };
  const onTexto = () => { if (!texto.trim()) { setError('Pega el texto del pliego o sube el PDF.'); return; } analizar(null, { texto }); };

  return (
    <div style={{ fontFamily:FONT, color:C.text, background:C.bg, minHeight:'100vh', padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', maxWidth:760 }}>
        <h1 style={{ fontWeight:900, fontSize:24, margin:'0 0 4px' }}>Concursos públicos</h1>
        <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
          <a href="/admin/concursos/perfil" style={{ color:C.indigo, fontWeight:800, fontSize:14, textDecoration:'none' }}>🏢 Perfil de empresa →</a>
          <a href="/admin/concursos/biblioteca" style={{ color:C.indigo, fontWeight:800, fontSize:14, textDecoration:'none' }}>📚 Mi biblioteca →</a>
        </div>
      </div>
      <p style={{ color:C.muted, margin:'0 0 16px', fontSize:14 }}>Sube el pliego (PDF) o pega su texto: el agente extrae la ficha, decide si te conviene presentarte y monta el checklist de documentos.</p>

      {/* Entrada */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, maxWidth:760, width:'100%', marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
          <button onClick={()=>fileRef.current?.click()} disabled={load}
            style={{ background:C.indigo, color:'#fff', border:'none', borderRadius:12, padding:'10px 18px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>
            📄 Subir pliego (PDF)
          </button>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={e=>onPdf(e.target.files?.[0]||undefined)} />
        </div>
        <textarea value={texto} onChange={e=>setTexto(e.target.value)} placeholder="…o pega aquí el texto del pliego (PCAP/PPT)"
          style={{ width:'100%', minHeight:120, padding:12, borderRadius:12, border:`1px solid ${C.border}`, fontFamily:FONT, fontSize:14, resize:'vertical', boxSizing:'border-box' }} />
        <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={onTexto} disabled={load}
            style={{ background:C.soft, color:C.indigo, border:'none', borderRadius:12, padding:'10px 18px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>
            🤖 Analizar texto
          </button>
          {load && <span style={{ color:C.muted }}>Analizando el pliego…</span>}
          {error && <span style={{ color:'#991b1b' }}>{error}</span>}
        </div>
      </div>

      {/* Resultado */}
      {actual && <FichaView c={actual} biblioteca={biblioteca} />}

      {/* Histórico */}
      {lista.length>0 && (
        <div style={{ maxWidth:760, width:'100%', marginTop:24 }}>
          <h2 style={{ fontWeight:800, fontSize:18, margin:'0 0 8px' }}>Analizados</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {lista.map(c=>(
              <button key={c.id} onClick={()=>setActual(c)} style={{ textAlign:'left', background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'10px 14px', fontFamily:FONT, cursor:'pointer', display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontWeight:700 }}>{c.titulo}</span>
                <span style={{ fontSize:12, color:C.muted }}>{new Date(c.created_at).toLocaleDateString('es-ES')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FichaView({ c, biblioteca }:{ c:any; biblioteca:Biblioteca }) {
  const [sobre, setSobre] = useState<any>(null);
  const cargarSobre = async () => {
    try { const r = await fetch(`/api/admin/concursos/${c.id}/sobre-administrativo`).then(x=>x.json()); setSobre(r); } catch {}
  };
  const f = c.ficha || {}; const gng = c.go_no_go; const gar = c.garantias || {};
  // Autocompleta el checklist con lo que ya hay en la biblioteca de empresa.
  const checklist:any[] = autocompletarChecklist(c.checklist || [], biblioteca);
  // Documentos del concurso que la biblioteca todavía no cubre.
  const faltan = f.documentos ? documentosFaltantes(f, biblioteca) : [];
  const sem = gng ? SEMAFORO[gng.semaforo] : null;
  const porSobre = (s:string) => checklist.filter(i=>i.sobre===s);

  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16, maxWidth:760, width:'100%', boxSizing:'border-box' }}>
      <h2 style={{ fontWeight:900, fontSize:20, margin:'0 0 4px' }}>{f.objeto}</h2>
      <div style={{ color:C.muted, fontSize:13, marginBottom:12 }}>
        {f.organo_contratacion && <>{f.organo_contratacion} · </>}
        {f.expediente && <>Exp. {f.expediente} · </>}
        {f.tipo_contrato} · {f.procedimiento}
      </div>

      {/* Semáforo Go/No-Go */}
      {sem && (
        <div style={{ background:sem.bg, color:sem.txt, borderRadius:12, padding:'10px 14px', marginBottom:12 }}>
          <div style={{ fontWeight:900, fontSize:15 }}>{sem.label} — {gng.recomendacion}</div>
          {gng.banderas?.length>0 && (
            <ul style={{ margin:'6px 0 0', paddingLeft:18, fontSize:13 }}>
              {gng.banderas.map((b:any,i:number)=>(<li key={i}>{b.severidad==='bloqueante'?'⛔ ':'⚠️ '}{b.motivo}</li>))}
            </ul>
          )}
        </div>
      )}

      {/* Datos clave */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:14 }}>
        <Dato k="Presupuesto base" v={eur(f.presupuesto_base)} />
        <Dato k="Valor estimado" v={eur(f.valor_estimado)} />
        <Dato k="Fin presentación" v={f.plazos?.fin_presentacion || '—'} />
        <Dato k="Ejecución" v={f.plazos?.ejecucion_meses ? `${f.plazos.ejecucion_meses} meses` : '—'} />
        <Dato k="Garantía definitiva" v={eur(gar.definitiva)} />
        <Dato k="Lotes" v={f.lotes ? String(f.lotes) : 'Sin lotes'} />
      </div>

      {/* Criterios de valoración */}
      {f.criterios?.length>0 && (
        <div style={{ marginBottom:14 }}>
          <h3 style={{ fontWeight:800, fontSize:15, margin:'0 0 6px' }}>Criterios de valoración</h3>
          {f.criterios.map((cr:any,i:number)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'4px 0', borderBottom:`1px solid ${C.border}`, fontSize:14 }}>
              <span>{cr.tipo==='automatico'?'🔢':'✍️'} {cr.nombre}</span>
              <strong>{cr.puntos} pts</strong>
            </div>
          ))}
        </div>
      )}

      {/* Checklist por sobre */}
      {['administrativo','tecnico','economico'].map(s=> porSobre(s).length>0 && (
        <div key={s} style={{ marginBottom:12 }}>
          <h3 style={{ fontWeight:800, fontSize:15, margin:'0 0 6px' }}>{SOBRE_LABEL[s]}</h3>
          <ul style={{ margin:0, paddingLeft:18, fontSize:14 }}>
            {porSobre(s).map((it:any,i:number)=>(
              <li key={i} style={{ marginBottom:3 }}>
                {it.hecho ? '✅ ' : '⬜ '}{it.documento}{it.modelo && <span style={{ color:C.muted }}> ({it.modelo})</span>}
                {!it.obligatorio && <span style={{ color:C.muted }}> · opcional</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Aviso: documentos que faltan en la biblioteca de empresa */}
      {faltan.length>0 && (
        <div style={{ background:C.soft, color:C.indigo, borderRadius:10, padding:'8px 12px', fontSize:13, marginBottom:10 }}>
          Te faltan <strong>{faltan.length}</strong> documento{faltan.length>1?'s':''} en tu biblioteca: {faltan.map((d:any)=>d.nombre).join(' · ')}.{' '}
          <a href="/admin/concursos/biblioteca" style={{ color:C.indigo, fontWeight:800, textDecoration:'underline' }}>Subirlos a Mi biblioteca</a>
        </div>
      )}

      {/* Sobre administrativo + DEUC (F3) */}
      <button onClick={cargarSobre} style={{ background:C.soft, color:C.indigo, border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer' }}>
        📋 Generar sobre administrativo (DEUC)
      </button>
      {sobre && (
        <div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
          {sobre.perfil_completo===false && (
            <div style={{ background:'#fef9c3', color:'#854d0e', borderRadius:8, padding:'6px 10px', fontSize:13, marginBottom:8 }}>
              Completa el <a href="/admin/concursos/perfil" style={{ color:C.indigo, fontWeight:800 }}>perfil de empresa</a> para rellenar el DEUC.
            </div>
          )}
          <strong style={{ fontSize:14 }}>Sobre administrativo</strong>
          <ul style={{ margin:'6px 0', paddingLeft:18, fontSize:14 }}>
            {sobre.sobre.map((it:any,i:number)=>(
              <li key={i}>{it.cubiertoPor ? '✅ ' : '⬜ '}{it.documento}{!it.obligatorio && <span style={{ color:C.muted }}> · opcional</span>}</li>
            ))}
          </ul>
          <div style={{ fontSize:13, color:C.muted }}>
            DEUC: {sobre.deuc?.operador?.razon_social || '(sin empresa)'} · objeto «{sobre.deuc?.procedimiento?.objeto||'—'}». Declaración responsable: {sobre.declaracion?.declara?.length||0} afirmaciones.
          </div>
        </div>
      )}

      {f.avisos?.length>0 && (
        <div style={{ background:'#fef9c3', color:'#854d0e', borderRadius:10, padding:'8px 12px', fontSize:13 }}>
          <strong>Revisar:</strong> {f.avisos.join(' · ')}
        </div>
      )}
    </div>
  );
}

function Dato({ k, v }:{ k:string; v:string }) {
  return (
    <div style={{ background:C.bg, borderRadius:10, padding:'8px 12px' }}>
      <div style={{ fontSize:11, color:C.muted, textTransform:'uppercase', letterSpacing:.3 }}>{k}</div>
      <div style={{ fontWeight:800, fontSize:15 }}>{v}</div>
    </div>
  );
}
