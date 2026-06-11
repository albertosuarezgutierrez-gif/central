// → app/admin/concursos/page.tsx — Agente de concursos públicos (módulo @iarest/module-concursos)
'use client';
import { useEffect, useRef, useState } from 'react';
import { autocompletarChecklist, documentosFaltantes, evaluarOferta, precioMinimoRentable, estadoPresentacion, plazoSubsanacion } from '@iarest/module-concursos';
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
  const [memoria, setMemoria] = useState<any>(null);
  const [genMem, setGenMem] = useState(false);
  const generarMemoria = async () => {
    setGenMem(true);
    try {
      const r = await fetch(`/api/admin/concursos/${c.id}/memoria`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ contexto: '' }) }).then(x=>x.json());
      setMemoria(r);
    } catch {}
    setGenMem(false);
  };
  const [oferta, setOferta] = useState<any>({ directos:'', indirectos:'', margen_objetivo_pct:'', oferta:'' });
  const num = (v:any) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const coste = { directos:num(oferta.directos), indirectos:num(oferta.indirectos), margen_objetivo_pct:num(oferta.margen_objetivo_pct) };
  const evalOferta = num(oferta.oferta) > 0 ? evaluarOferta(num(oferta.oferta), coste, c.ficha || {}) : null;
  const minRent = precioMinimoRentable(coste);
  const setO = (k:string) => (e:any) => setOferta({ ...oferta, [k]: e.target.value });
  const guardarOferta = async () => {
    try { await fetch(`/api/admin/concursos/${c.id}/oferta`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(coste) }); } catch {}
  };
  const [sobresListos, setSobresListos] = useState({ administrativo:false, tecnico:false, economico:false });
  const hoyISO = new Date().toISOString().slice(0,10);
  const estadoPres = estadoPresentacion(c.ficha || {}, hoyISO, sobresListos);
  const subsanacion = plazoSubsanacion(hoyISO);
  const toggleSobre = (k:string) => (e:any) => setSobresListos({ ...sobresListos, [k]: e.target.checked });
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

      {/* Memoria técnica (F4) */}
      <button onClick={generarMemoria} disabled={genMem} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer', opacity:genMem?0.6:1 }}>
        {genMem ? '✍️ Redactando…' : '✍️ Generar memoria técnica'}
      </button>
      {memoria?.cobertura && (
        <div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
          <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>
            Cobertura técnica: {memoria.cobertura.puntos_cubiertos}/{memoria.cobertura.puntos_totales} puntos ({memoria.cobertura.pct}%)
          </div>
          <div style={{ height:8, background:C.soft, borderRadius:4, overflow:'hidden', marginBottom:10 }}>
            <div style={{ width:`${memoria.cobertura.pct}%`, height:'100%', background:C.indigo }} />
          </div>
          {(memoria.memoria?.secciones ?? []).map((s:any,i:number)=>(
            <details key={i} style={{ marginBottom:8 }}>
              <summary style={{ fontWeight:800, fontSize:14, cursor:'pointer' }}>{s.criterio} · {s.puntos_max} pts</summary>
              <p style={{ fontSize:13, whiteSpace:'pre-wrap', color:C.text, margin:'6px 0' }}>{s.contenido || '(vacío)'}</p>
            </details>
          ))}
        </div>
      )}

      {/* Oferta económica (F5) */}
      <div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
        <strong style={{ fontSize:14 }}>Oferta económica</strong>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, margin:'8px 0' }}>
          <input placeholder="Costes directos (€)" value={oferta.directos} onChange={setO('directos')} />
          <input placeholder="Costes indirectos (€)" value={oferta.indirectos} onChange={setO('indirectos')} />
          <input placeholder="Margen objetivo (%)" value={oferta.margen_objetivo_pct} onChange={setO('margen_objetivo_pct')} />
          <input placeholder="Tu oferta (€)" value={oferta.oferta} onChange={setO('oferta')} />
        </div>
        <div style={{ fontSize:13, color:C.muted }}>Precio mínimo rentable: <strong>{minRent.toLocaleString('es-ES')} €</strong></div>
        {evalOferta && (
          <div style={{ fontSize:13, marginTop:6 }}>
            Margen: <strong>{evalOferta.margen_euros.toLocaleString('es-ES')} € ({evalOferta.margen_pct}%)</strong> ·
            Puntos económicos: <strong>{evalOferta.puntos_economicos}</strong>
            {evalOferta.temeraria && <span style={{ color:'#b91c1c', fontWeight:800 }}> · ⚠️ Baja temeraria (umbral {evalOferta.umbral_temeraria?.toLocaleString('es-ES')} €)</span>}
            {' '}<span style={{ color: evalOferta.viable ? '#15803d' : '#b91c1c', fontWeight:800 }}>{evalOferta.viable ? '✅ Viable' : '❌ No viable'}</span>
          </div>
        )}
        <button onClick={guardarOferta} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer' }}>Guardar oferta</button>
      </div>

      {/* Presentación + plazos (F6) */}
      <div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
        <strong style={{ fontSize:14 }}>Presentación</strong>
        <div style={{ fontSize:13, marginTop:6 }}>
          {estadoPres.dias_para_fin === null
            ? <span style={{ color:C.muted }}>Sin fecha de fin de plazo en la ficha.</span>
            : estadoPres.plazo_abierto
              ? <span style={{ color: estadoPres.urgente ? '#b91c1c' : C.text, fontWeight:800 }}>
                  {estadoPres.urgente ? '🔴 ' : '🗓️ '}Quedan {estadoPres.dias_para_fin} día{estadoPres.dias_para_fin===1?'':'s'} para presentar
                </span>
              : <span style={{ color:'#b91c1c', fontWeight:800 }}>⛔ Plazo de presentación cerrado</span>}
        </div>
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', margin:'8px 0', fontSize:13 }}>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.administrativo} onChange={toggleSobre('administrativo')} /> Administrativo</label>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.tecnico} onChange={toggleSobre('tecnico')} /> Técnico</label>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.economico} onChange={toggleSobre('economico')} /> Económico</label>
        </div>
        {estadoPres.listo
          ? <div style={{ color:'#15803d', fontWeight:800, fontSize:13 }}>✅ Listo para presentar</div>
          : <ul style={{ margin:'4px 0', paddingLeft:18, fontSize:13, color:'#b45309' }}>{estadoPres.pendientes.map((p:string,i:number)=>(<li key={i}>{p}</li>))}</ul>}
        <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
          Si te requieren subsanar hoy, el plazo (3 días hábiles, art. 141 LCSP) vencería el <strong>{subsanacion.fecha_limite}</strong>.
        </div>
      </div>

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
