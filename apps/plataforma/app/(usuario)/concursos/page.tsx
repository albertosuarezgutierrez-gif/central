// → app/concursos/page.tsx — Agente de concursos públicos (módulo @central/module-concursos)
'use client';
import { useEffect, useRef, useState } from 'react';
import { autocompletarChecklist, documentosFaltantes, evaluarOferta, precioMinimoRentable, estadoPresentacion, plazoSubsanacion, SECTORES, cpvDeSectores, COMUNIDADES, provinciasDeComunidad, encajeConcurso } from '@central/module-concursos';
import type { Biblioteca } from '@central/module-concursos';
import { eur as fmtEur } from '@/lib/dinero';

const C = { indigo:'var(--primary)', soft:'var(--primary-light)', text:'#1e1b4b', bg:'#f1f5f9', card:'#fff', border:'var(--border)', muted:'var(--muted)' };
const FONT = 'Nunito, system-ui, sans-serif';

// Sincroniza "Seguir" (buscador) con el panel "Mis concursos" sin prop drilling.
const SEGUIDOS_EVT = 'concursos-seguidos-changed';
const emitSeguidos = () => { try { window.dispatchEvent(new Event(SEGUIDOS_EVT)); } catch {} };
const ESTADOS_SEGUIMIENTO = ['interesado','preparando','presentado','adjudicado','perdido'];
const ESTADO_LABEL: Record<string,string> = { interesado:'⭐ Interesado', preparando:'✍️ Preparando', presentado:'📤 Presentado', adjudicado:'🏆 Adjudicado', perdido:'❌ Perdido' };

const SOBRE_LABEL: Record<string,string> = { administrativo:'📋 Sobre administrativo', tecnico:'📐 Sobre técnico', economico:'💶 Sobre económico' };
const SEMAFORO: Record<string,{bg:string;txt:string;label:string}> = {
  verde: { bg:'var(--positive-bg)', txt:'var(--positive)', label:'🟢 Adelante' },
  ambar: { bg:'var(--warning-bg)', txt:'var(--warning)', label:'🟡 Revisar' },
  rojo:  { bg:'var(--negative-bg)', txt:'var(--negative)', label:'🔴 No apto' },
};

const eur = (n:number|undefined) => n==null ? '—' : fmtEur(n);

export default function Concursos() {
  const [texto, setTexto] = useState('');
  const [load, setLoad] = useState(false);
  const [error, setError] = useState('');
  const [actual, setActual] = useState<any>(null);
  const [ocrAplicado, setOcrAplicado] = useState(false);
  const [lista, setLista] = useState<any[]>([]);
  const [histVisibles, setHistVisibles] = useState(20);
  const [biblioteca, setBiblioteca] = useState<Biblioteca>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    try { const r = await fetch('/api/concursos/analizar').then(x=>x.json()); setLista(r.concursos||[]); } catch {}
  };
  // Carga la biblioteca de empresa para autocompletar el checklist y avisar de lo que falta.
  const cargarBiblioteca = async () => {
    try {
      const r = await fetch('/api/concursos/biblioteca').then(x=>x.json());
      const docs = (r.documentos||[]).map((d:any)=>({ tipo:d.tipo, nombre:d.nombre, vigencia_hasta:d.vigencia_hasta ?? undefined }));
      setBiblioteca(docs);
    } catch {}
  };
  useEffect(()=>{ cargar(); cargarBiblioteca(); }, []);
  // "Preparar candidatura" (H) crea el concurso en el buscador y lo abre aquí.
  useEffect(()=>{
    const abrir = (e:any) => { setActual(e.detail); setError(''); setOcrAplicado(false); cargar(); window.scrollTo({ top:0, behavior:'smooth' }); };
    window.addEventListener('concurso-preparado', abrir);
    return ()=>window.removeEventListener('concurso-preparado', abrir);
  }, []);

  const analizar = async (form: FormData | null, body?: any) => {
    setLoad(true); setError(''); setActual(null); setOcrAplicado(false);
    try {
      const opt:any = form ? { method:'POST', body:form } : { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) };
      const r = await fetch('/api/concursos/analizar', opt).then(x=>x.json());
      if (r.error) { setError(r.error); } else { setActual(r.concurso); setOcrAplicado(r.ocr_aplicado === true); cargar(); }
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
          <a href="/concursos/perfil" style={{ color:C.indigo, fontWeight:800, fontSize:14, textDecoration:'none' }}>🏢 Perfil de empresa →</a>
          <a href="/concursos/biblioteca" style={{ color:C.indigo, fontWeight:800, fontSize:14, textDecoration:'none' }}>📚 Mi biblioteca →</a>
        </div>
      </div>
      <p style={{ color:C.muted, margin:'0 0 16px', fontSize:14 }}>Sube el pliego (PDF) o pega su texto: el agente extrae la ficha, decide si te conviene presentarte y monta el checklist de documentos.</p>

      {/* Radar de oportunidades (F7) */}
      <div style={{ maxWidth:760, width:'100%' }}><RadarPanel /></div>

      {/* Buscador de pliegos */}
      <div style={{ maxWidth:760, width:'100%' }}><BuscadorPanel /></div>

      {/* Mis concursos (seguimiento) */}
      <div style={{ maxWidth:760, width:'100%' }}><MisConcursosPanel /></div>

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
          {error && <span style={{ color:'var(--negative)' }}>{error}</span>}
        </div>
      </div>

      {/* Resultado */}
      {actual && <FichaView c={actual} biblioteca={biblioteca} ocrAplicado={ocrAplicado} />}

      {/* Histórico — solo los 20 primeros de inicio; el resto con «Ver más» (rendimiento). */}
      {lista.length>0 && (
        <div style={{ maxWidth:760, width:'100%', marginTop:24 }}>
          <h2 style={{ fontWeight:800, fontSize:18, margin:'0 0 8px' }}>Analizados</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {lista.slice(0, histVisibles).map(c=>(
              <button key={c.id} onClick={()=>{ setActual(c); setOcrAplicado(false); }} style={{ textAlign:'left', background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:'10px 14px', fontFamily:FONT, cursor:'pointer', display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontWeight:700 }}>{c.titulo}</span>
                <span style={{ fontSize:12, color:C.muted }}>{new Date(c.created_at).toLocaleDateString('es-ES')}</span>
              </button>
            ))}
            {lista.length > histVisibles && (
              <button onClick={()=>setHistVisibles(v=>v+50)} style={{ background:C.soft, color:C.indigo, border:'none', borderRadius:12, padding:'10px 14px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>
                Ver más ({lista.length - histVisibles} restantes)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FichaView({ c, biblioteca, ocrAplicado }:{ c:any; biblioteca:Biblioteca; ocrAplicado?:boolean }) {
  const [sobre, setSobre] = useState<any>(null);
  const cargarSobre = async () => {
    try { const r = await fetch(`/api/concursos/${c.id}/sobre-administrativo`).then(x=>x.json()); setSobre(r); } catch {}
  };
  const [memoria, setMemoria] = useState<any>(null);
  const [genMem, setGenMem] = useState(false);
  const generarMemoria = async () => {
    setGenMem(true);
    try {
      const r = await fetch(`/api/concursos/${c.id}/memoria`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ contexto: '' }) }).then(x=>x.json());
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
    try { await fetch(`/api/concursos/${c.id}/oferta`, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(coste) }); } catch {}
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
      {ocrAplicado && (
        <div style={{ background:'var(--info-bg)', color:'var(--info)', borderRadius:8, padding:'6px 10px', fontSize:12, marginBottom:8 }}>
          📄 Documento escaneado — texto extraído con OCR (visión IA).
        </div>
      )}
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
          <a href="/concursos/biblioteca" style={{ color:C.indigo, fontWeight:800, textDecoration:'underline' }}>Subirlos a Mi biblioteca</a>
        </div>
      )}

      {/* Sobre administrativo + DEUC (F3) */}
      <button onClick={cargarSobre} style={{ background:C.soft, color:C.indigo, border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer' }}>
        📋 Generar sobre administrativo (DEUC)
      </button>
      {sobre && (
        <div style={{ marginTop:10, border:`1px solid ${C.border}`, borderRadius:10, padding:12 }}>
          {sobre.perfil_completo===false && (
            <div style={{ background:'var(--warning-bg)', color:'var(--warning)', borderRadius:8, padding:'6px 10px', fontSize:13, marginBottom:8 }}>
              Completa el <a href="/concursos/perfil" style={{ color:C.indigo, fontWeight:800 }}>perfil de empresa</a> para rellenar el DEUC.
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
          <input placeholder="Costes directos (€)" value={oferta.directos} onChange={setO('directos')} style={{ minWidth:0 }} />
          <input placeholder="Costes indirectos (€)" value={oferta.indirectos} onChange={setO('indirectos')} style={{ minWidth:0 }} />
          <input placeholder="Margen objetivo (%)" value={oferta.margen_objetivo_pct} onChange={setO('margen_objetivo_pct')} style={{ minWidth:0 }} />
          <input placeholder="Tu oferta (€)" value={oferta.oferta} onChange={setO('oferta')} style={{ minWidth:0 }} />
        </div>
        <div style={{ fontSize:13, color:C.muted }}>Precio mínimo rentable: <strong>{fmtEur(minRent)}</strong></div>
        {evalOferta && (
          <div style={{ fontSize:13, marginTop:6 }}>
            Margen: <strong>{fmtEur(evalOferta.margen_euros)} ({evalOferta.margen_pct}%)</strong> ·
            Puntos económicos: <strong>{evalOferta.puntos_economicos}</strong>
            {evalOferta.temeraria && <span style={{ color:'var(--negative)', fontWeight:800 }}> · ⚠️ Baja temeraria (umbral {eur(evalOferta.umbral_temeraria ?? undefined)})</span>}
            {' '}<span style={{ color: evalOferta.viable ? 'var(--positive)' : 'var(--negative)', fontWeight:800 }}>{evalOferta.viable ? '✅ Viable' : '❌ No viable'}</span>
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
              ? <span style={{ color: estadoPres.urgente ? 'var(--negative)' : C.text, fontWeight:800 }}>
                  {estadoPres.urgente ? '🔴 ' : '🗓️ '}Quedan {estadoPres.dias_para_fin} día{estadoPres.dias_para_fin===1?'':'s'} para presentar
                </span>
              : <span style={{ color:'var(--negative)', fontWeight:800 }}>⛔ Plazo de presentación cerrado</span>}
        </div>
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', margin:'8px 0', fontSize:13 }}>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.administrativo} onChange={toggleSobre('administrativo')} /> Administrativo</label>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.tecnico} onChange={toggleSobre('tecnico')} /> Técnico</label>
          <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={sobresListos.economico} onChange={toggleSobre('economico')} /> Económico</label>
        </div>
        {estadoPres.listo
          ? <div style={{ color:'var(--positive)', fontWeight:800, fontSize:13 }}>✅ Listo para presentar</div>
          : <ul style={{ margin:'4px 0', paddingLeft:18, fontSize:13, color:'var(--warning)' }}>{estadoPres.pendientes.map((p:string,i:number)=>(<li key={i}>{p}</li>))}</ul>}
        <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
          Si te requieren subsanar hoy, el plazo (3 días hábiles, art. 141 LCSP) vencería el <strong>{subsanacion.fecha_limite}</strong>.
        </div>
      </div>

      {f.avisos?.length>0 && (
        <div style={{ background:'var(--warning-bg)', color:'var(--warning)', borderRadius:10, padding:'8px 12px', fontSize:13 }}>
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

// Radar de oportunidades (F7): criterios PLACSP + lista de matches con contador de no vistos.
function RadarPanel() {
  const [crit, setCrit] = useState<any>({ activo:false, cpv:[], palabras_clave:[], presupuesto_min:'', presupuesto_max:'' });
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [noVistos, setNoVistos] = useState(0);
  const [cargando, setCargando] = useState(false);
  // El API devuelve hasta 200 matches; solo se montan 30 de inicio («Ver más» para el resto).
  const [visibles, setVisibles] = useState(30);

  const cargar = async () => {
    const [c, a] = await Promise.all([
      fetch('/api/concursos/radar/criterios').then(r=>r.json()).catch(()=>null),
      fetch('/api/concursos/radar').then(r=>r.json()).catch(()=>null),
    ]);
    if (c?.criterios) setCrit({
      activo: c.criterios.activo,
      cpv: c.criterios.cpv ?? [],
      palabras_clave: c.criterios.palabras_clave ?? [],
      presupuesto_min: c.criterios.presupuesto_min ?? '',
      presupuesto_max: c.criterios.presupuesto_max ?? '',
    });
    if (a) { setAnuncios(a.anuncios ?? []); setNoVistos(a.no_vistos ?? 0); }
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async () => {
    setCargando(true);
    await fetch('/api/concursos/radar/criterios', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        activo: crit.activo,
        cpv: typeof crit.cpv === 'string' ? crit.cpv.split(',').map((s:string)=>s.trim()).filter(Boolean) : crit.cpv,
        palabras_clave: typeof crit.palabras_clave === 'string' ? crit.palabras_clave.split(',').map((s:string)=>s.trim()).filter(Boolean) : crit.palabras_clave,
        presupuesto_min: crit.presupuesto_min, presupuesto_max: crit.presupuesto_max,
      }),
    });
    setCargando(false); cargar();
  };

  const marcarVisto = async (id:string) => {
    await fetch('/api/concursos/radar/visto', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    cargar();
  };

  const cpvStr = Array.isArray(crit.cpv) ? crit.cpv.join(', ') : crit.cpv;
  const kwStr = Array.isArray(crit.palabras_clave) ? crit.palabras_clave.join(', ') : crit.palabras_clave;

  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:14 }}>
      <strong style={{ fontSize:15 }}>📡 Radar de oportunidades{noVistos>0 && <span style={{ marginLeft:8, background:'var(--negative)', color:'#fff', borderRadius:999, padding:'1px 8px', fontSize:12 }}>{noVistos} nuevas</span>}</strong>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, margin:'10px 0' }}>
        <input placeholder="CPV de interés (coma)" value={cpvStr} onChange={e=>setCrit({...crit, cpv:e.target.value})} style={{ minWidth:0 }} />
        <input placeholder="Palabras clave (coma)" value={kwStr} onChange={e=>setCrit({...crit, palabras_clave:e.target.value})} style={{ minWidth:0 }} />
        <input placeholder="Presupuesto mín (€)" value={crit.presupuesto_min} onChange={e=>setCrit({...crit, presupuesto_min:e.target.value})} style={{ minWidth:0 }} />
        <input placeholder="Presupuesto máx (€)" value={crit.presupuesto_max} onChange={e=>setCrit({...crit, presupuesto_max:e.target.value})} style={{ minWidth:0 }} />
      </div>
      <label style={{ display:'flex', gap:6, alignItems:'center', fontSize:13 }}>
        <input type="checkbox" checked={!!crit.activo} onChange={e=>setCrit({...crit, activo:e.target.checked})} /> Radar activo (revisa PLACSP cada 6 h)
      </label>
      <button onClick={guardar} disabled={cargando} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, marginTop:8, cursor:'pointer' }}>{cargando?'Guardando…':'Guardar criterios'}</button>

      <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
        {anuncios.length===0 && <span style={{ color:C.muted, fontSize:13 }}>Aún no hay licitaciones captadas.</span>}
        {anuncios.slice(0, visibles).map(a => (
          <div key={a.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:10, opacity: a.visto?0.6:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <strong style={{ fontSize:14 }}>{a.anuncio?.titulo}</strong>
              <span style={{ fontSize:12, color:C.muted }}>{a.puntuacion} pts</span>
            </div>
            <div style={{ fontSize:12, color:C.muted }}>{a.anuncio?.organo}{a.anuncio?.presupuesto?` · ${fmtEur(Number(a.anuncio.presupuesto))}`:''}</div>
            <div style={{ fontSize:12, marginTop:4 }}>{(a.motivos||[]).join(' · ')}</div>
            <div style={{ display:'flex', gap:10, marginTop:6 }}>
              {a.anuncio?.url && <a href={a.anuncio.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:C.indigo }}>Ver anuncio ↗</a>}
              {!a.visto && <button onClick={()=>marcarVisto(a.id)} style={{ fontSize:12, background:'transparent', border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 8px', cursor:'pointer' }}>Marcar visto</button>}
            </div>
          </div>
        ))}
        {anuncios.length > visibles && (
          <button onClick={()=>setVisibles(v=>v+50)} style={{ background:C.soft, color:C.indigo, border:'none', borderRadius:10, padding:'10px 14px', fontFamily:FONT, fontWeight:800, cursor:'pointer' }}>
            Ver más ({anuncios.length - visibles} restantes)
          </button>
        )}
      </div>
    </div>
  );
}

function BuscadorPanel() {
  const [f, setF] = useState<any>({ q:'', cpv:'', provincia:'', ccaa:'', presupuesto_min:'', presupuesto_max:'', en_plazo:true, orden:'relevancia', sectores:[] as string[] });
  const [res, setRes] = useState<any[]>([]);

  // Selector de sector → rellena el filtro CPV con los prefijos del catálogo.
  const toggleSector = (id:string) => {
    const sel: string[] = f.sectores.includes(id) ? f.sectores.filter((x:string)=>x!==id) : [...f.sectores, id];
    setF({ ...f, sectores: sel, cpv: cpvDeSectores(sel).join(', ') });
  };
  // Zona (CCAA) persistente entre sesiones.
  const setZona = (z:string) => { setF({ ...f, ccaa: z, provincia: '' }); try { localStorage.setItem('ialimp_concursos_zona', z); } catch {} };
  useEffect(() => { try { const z = localStorage.getItem('ialimp_concursos_zona'); if (z) setF((p:any)=>({ ...p, ccaa: z })); } catch {} }, []);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [hecha, setHecha] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [msgIngesta, setMsgIngesta] = useState('');
  const [seguidas, setSeguidas] = useState<Set<string>>(new Set());
  const [criterios, setCriterios] = useState<any>(null);          // criterios del radar → encaje "¿me conviene?"
  const [resumenes, setResumenes] = useState<Record<string,string>>({});
  const [cargandoResumen, setCargandoResumen] = useState('');
  const [nl, setNl] = useState('');                                // búsqueda en lenguaje natural (K)
  const [interpretando, setInterpretando] = useState(false);

  // Carga los criterios del radar una vez (para el semáforo de encaje por resultado).
  useEffect(()=>{ fetch('/api/concursos/radar/criterios').then(r=>r.json()).then(r=>setCriterios(r.criterios)).catch(()=>{}); }, []);

  // Conjunto de anuncios ya seguidos (para alternar el botón). Se recarga al cambiar.
  const cargarSeguidas = async () => {
    try {
      const r = await fetch('/api/concursos/seguidos').then(r=>r.json());
      setSeguidas(new Set((r.seguidos||[]).map((s:any)=>s.dedupe_key)));
    } catch {}
  };
  useEffect(()=>{ cargarSeguidas(); window.addEventListener(SEGUIDOS_EVT, cargarSeguidas); return ()=>window.removeEventListener(SEGUIDOS_EVT, cargarSeguidas); }, []);

  const seguir = async (a:any) => {
    const licitacion = { titulo:a.titulo, organo:a.organo, provincia:a.provincia, cpv:a.cpv, presupuesto:a.presupuesto, fin_presentacion:a.fin_presentacion, url:a.url };
    setSeguidas(prev => new Set(prev).add(a.dedupe_key)); // optimista
    try { await fetch('/api/concursos/seguidos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ dedupe_key:a.dedupe_key, licitacion }) }); } catch {}
    emitSeguidos();
  };

  const buscar = async (override?:any) => {
    setCargando(true);
    const ff = override ? { ...f, ...override } : f;
    const p = new URLSearchParams();
    if (ff.q) p.set('q', ff.q);
    if (ff.cpv) p.set('cpv', ff.cpv);
    if (ff.provincia) p.set('provincia', ff.provincia);
    if (ff.ccaa) p.set('ccaa', ff.ccaa);
    if (ff.presupuesto_min) p.set('presupuesto_min', ff.presupuesto_min);
    if (ff.presupuesto_max) p.set('presupuesto_max', ff.presupuesto_max);
    p.set('en_plazo', ff.en_plazo ? '1' : '0');
    p.set('orden', ff.orden);
    const r = await fetch('/api/concursos/radar/buscar?' + p.toString()).then(r=>r.json()).catch(()=>null);
    setRes(r?.resultados ?? []); setTotal(r?.total ?? 0); setHecha(true); setCargando(false);
  };

  // K — búsqueda en lenguaje natural: la IA traduce la frase a filtros y busca.
  const buscarNL = async () => {
    const t = nl.trim(); if (!t) return;
    setInterpretando(true);
    let fl:any = { q: t };
    try {
      const r = await fetch('/api/concursos/radar/interpretar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ texto: t }) }).then(x=>x.json());
      if (r?.filtros) fl = r.filtros;
    } catch {}
    const nf = { q: fl.q ?? '', cpv: (fl.cpv||[]).join(', '), ccaa: fl.ccaa ?? '', provincia: fl.provincia ?? '', presupuesto_min: fl.presupuesto_min ?? '', presupuesto_max: fl.presupuesto_max ?? '', sectores: [] as string[] };
    setF((prev:any)=>({ ...prev, ...nf }));
    setInterpretando(false);
    await buscar(nf);
  };

  // D — resumen IA bajo demanda (cacheado en el corpus).
  const pedirResumen = async (a:any) => {
    if (resumenes[a.id]) return;
    setCargandoResumen(a.id);
    try {
      const r = await fetch('/api/concursos/radar/resumen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:a.id, titulo:a.titulo, objeto:a.objeto, cpv:a.cpv, presupuesto:a.presupuesto }) }).then(x=>x.json());
      setResumenes(prev=>({ ...prev, [a.id]: r?.resumen || '(no disponible ahora)' }));
    } catch { setResumenes(prev=>({ ...prev, [a.id]: '(no disponible ahora)' })); }
    setCargandoResumen('');
  };

  // H — preparar candidatura: crea el concurso y lo abre en el workspace.
  const preparar = async (a:any) => {
    const licitacion = { titulo:a.titulo, objeto:a.objeto, expediente:a.expediente, organo:a.organo, provincia:a.provincia, cpv:a.cpv, presupuesto:a.presupuesto, fin_presentacion:a.fin_presentacion, url:a.url };
    try {
      const r = await fetch('/api/concursos/preparar', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ licitacion }) }).then(x=>x.json());
      if (r?.concurso) window.dispatchEvent(new CustomEvent('concurso-preparado', { detail: r.concurso }));
    } catch {}
  };

  // Dispara la ingesta del corpus a demanda (PLACSP responde desde Vercel, no en local).
  const actualizarAhora = async () => {
    setActualizando(true); setMsgIngesta('');
    try {
      const r = await fetch('/api/concursos/ingesta', { method:'POST' }).then(r=>r.json()).catch(()=>null);
      if (r?.ok) { setMsgIngesta(`✅ ${r.ingeridos} anuncios actualizados`); await buscar(); }
      else setMsgIngesta(r?.error || 'No se pudo actualizar.');
    } finally { setActualizando(false); }
  };

  const guardarComoAlerta = async () => {
    await fetch('/api/concursos/radar/criterios', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        activo: true,
        cpv: f.cpv ? f.cpv.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
        palabras_clave: f.q ? f.q.split(/\s+/).filter(Boolean) : [],
        presupuesto_min: f.presupuesto_min || null, presupuesto_max: f.presupuesto_max || null,
      }),
    });
    alert('Búsqueda guardada como alerta del radar ✅');
  };

  const dias = (iso:string) => { if(!iso) return null; const d=Math.ceil((new Date(iso).getTime()-Date.now())/86400000); return d; };

  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:14 }}>
      <strong style={{ fontSize:15 }}>🔎 Buscar concursos</strong>
      <div style={{ display:'flex', gap:6, margin:'8px 0 4px' }}>
        <input placeholder="✨ Describe lo que buscas (ej: fontanería en Sevilla hasta 50.000€)" value={nl}
          onChange={e=>setNl(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') buscarNL(); }}
          style={{ flex:1, minWidth:0 }} />
        <button onClick={buscarNL} disabled={interpretando} style={{ background:C.soft, color:C.indigo, border:`1px solid ${C.indigo}`, borderRadius:8, padding:'8px 12px', fontFamily:FONT, fontWeight:800, fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>{interpretando?'Interpretando…':'✨ Buscar'}</button>
      </div>
      <div style={{ fontSize:12, color:C.muted, margin:'8px 0 4px' }}>…o por sector (rellena el CPV):</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
        {SECTORES.map(s => { const on = f.sectores.includes(s.id); return (
          <button key={s.id} onClick={()=>toggleSector(s.id)} type="button"
            style={{ fontSize:12, cursor:'pointer', borderRadius:999, padding:'3px 10px',
              border:`1px solid ${on?C.indigo:C.border}`, background:on?C.indigo:'transparent', color:on?'#fff':C.text, fontFamily:FONT }}>
            {s.nombre}
          </button>
        ); })}
      </div>
      <div style={{ fontSize:12, color:C.muted, margin:'10px 0 4px' }}>Tu zona:</div>
      <select value={f.ccaa} onChange={e=>setZona(e.target.value)} style={{ fontFamily:FONT, fontSize:13, padding:'6px 8px', borderRadius:8, border:`1px solid ${C.border}` }}>
        <option value="">Toda España</option>
        {COMUNIDADES.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8, margin:'10px 0' }}>
        <input placeholder="Buscar por texto (objeto)…" value={f.q} onChange={e=>setF({...f,q:e.target.value})} onKeyDown={e=>{ if(e.key==='Enter') buscar(); }} style={{ minWidth:0 }} />
        <input placeholder="CPV (coma, por prefijo)" value={f.cpv} onChange={e=>setF({...f,cpv:e.target.value})} style={{ minWidth:0 }} />
        <select value={f.provincia} onChange={e=>setF({...f,provincia:e.target.value})} style={{ fontFamily:FONT, fontSize:13, padding:'6px 8px', borderRadius:8, border:`1px solid ${C.border}`, background:'#fff', minWidth:0 }}>
          <option value="">{f.ccaa ? 'Toda la comunidad' : 'Todas las provincias'}</option>
          {(f.ccaa ? provinciasDeComunidad(f.ccaa) : COMUNIDADES.flatMap((c:any)=>c.provincias)).map((p:string) => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display:'flex', gap:6, minWidth:0 }}>
          <input placeholder="€ mín" value={f.presupuesto_min} onChange={e=>setF({...f,presupuesto_min:e.target.value})} style={{ width:'50%', minWidth:0 }} />
          <input placeholder="€ máx" value={f.presupuesto_max} onChange={e=>setF({...f,presupuesto_max:e.target.value})} style={{ width:'50%', minWidth:0 }} />
        </div>
      </div>
      <div style={{ display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', fontSize:13 }}>
        <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={f.en_plazo} onChange={e=>setF({...f,en_plazo:e.target.checked})} /> Solo en plazo</label>
        <label style={{ display:'flex', gap:6, alignItems:'center' }}>Orden:
          <select value={f.orden} onChange={e=>setF({...f,orden:e.target.value})}>
            <option value="relevancia">Relevancia</option>
            <option value="cierre">Cierran antes</option>
            <option value="presupuesto">Mayor presupuesto</option>
          </select>
        </label>
        <button onClick={buscar} disabled={cargando} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, cursor:'pointer' }}>{cargando?'Buscando…':'Buscar'}</button>
        {hecha && <button onClick={guardarComoAlerta} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer' }}>🔔 Guardar como alerta</button>}
        <button onClick={actualizarAhora} disabled={actualizando} title="Trae los últimos concursos de PLACSP" style={{ background:'transparent', color:C.indigo, border:`1px solid ${C.indigo}`, borderRadius:8, padding:'8px 12px', fontFamily:FONT, fontWeight:800, fontSize:13, cursor:'pointer' }}>{actualizando?'⟳ Actualizando…':'⟳ Actualizar ahora'}</button>
        {msgIngesta && <span style={{ fontSize:12, color:C.muted }}>{msgIngesta}</span>}
      </div>

      {hecha && <div style={{ fontSize:12, color:C.muted, marginTop:10 }}>{total} resultado{total===1?'':'s'}</div>}
      <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
        {res.map(a => { const d = dias(a.fin_presentacion);
          const enc = criterios ? encajeConcurso({ titulo:a.titulo, objeto:a.objeto, cpv:a.cpv, presupuesto:a.presupuesto!=null?Number(a.presupuesto):undefined }, criterios) : null;
          return (
          <div key={a.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <strong style={{ fontSize:14 }}>{a.titulo}</strong>
              <div style={{ display:'flex', gap:6, alignItems:'center', whiteSpace:'nowrap' }}>
                {enc==='verde' && <span title="Encaja con tu radar" style={{ fontSize:11, fontWeight:700, background:'var(--positive-bg)', color:'var(--positive)', borderRadius:999, padding:'2px 7px' }}>🟢 Encaja</span>}
                {enc==='ambar' && <span title="Encaje parcial" style={{ fontSize:11, fontWeight:700, background:'var(--warning-bg)', color:'var(--warning)', borderRadius:999, padding:'2px 7px' }}>🟡 Posible</span>}
                {d!==null && <span style={{ fontSize:12, color: d<=3?'var(--negative)':C.muted, fontWeight:700 }}>{d<0?'cerrado':`${d} d`}</span>}
              </div>
            </div>
            <div style={{ fontSize:12, color:C.muted }}>{a.organo}{a.provincia?` · ${a.provincia}`:''}{a.presupuesto?` · ${fmtEur(Number(a.presupuesto))}`:''}</div>
            <div style={{ fontSize:12, marginTop:4 }}>{(a.cpv||[]).slice(0,4).join(' · ')}</div>
            {resumenes[a.id] && <div style={{ fontSize:12, color:C.text, marginTop:6, background:C.soft, borderRadius:8, padding:'6px 8px' }}>✨ {resumenes[a.id]}</div>}
            <div style={{ display:'flex', gap:12, alignItems:'center', marginTop:6, flexWrap:'wrap' }}>
              {a.url && <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:C.indigo }}>Ver anuncio ↗</a>}
              {!resumenes[a.id] && <button onClick={()=>pedirResumen(a)} disabled={cargandoResumen===a.id} style={{ fontSize:12, background:'transparent', color:C.indigo, border:0, padding:0, fontFamily:FONT, fontWeight:700, cursor:'pointer' }}>{cargandoResumen===a.id?'✨ resumiendo…':'✨ ¿Me conviene?'}</button>}
              <button onClick={()=>preparar(a)} title="Crea el expediente y ábrelo para preparar la oferta" style={{ fontSize:12, background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'3px 10px', fontFamily:FONT, fontWeight:700, cursor:'pointer' }}>📝 Preparar candidatura</button>
              {seguidas.has(a.dedupe_key)
                ? <span style={{ fontSize:12, color:'var(--positive)', fontWeight:700 }}>📌 Siguiendo</span>
                : <button onClick={()=>seguir(a)} style={{ fontSize:12, background:'transparent', color:C.indigo, border:`1px solid ${C.indigo}`, borderRadius:8, padding:'3px 10px', fontFamily:FONT, fontWeight:700, cursor:'pointer' }}>📌 Seguir</button>}
            </div>
          </div>
        ); })}
      </div>
    </div>
  );
}

// "Mis concursos" (feature G): licitaciones que sigues, con su estado y plazo.
function MisConcursosPanel() {
  const [seguidos, setSeguidos] = useState<any[]>([]);
  const cargar = async () => {
    try { const r = await fetch('/api/concursos/seguidos').then(r=>r.json()); setSeguidos(r.seguidos||[]); } catch {}
  };
  useEffect(()=>{ cargar(); window.addEventListener(SEGUIDOS_EVT, cargar); return ()=>window.removeEventListener(SEGUIDOS_EVT, cargar); }, []);

  const cambiarEstado = async (dedupe_key:string, estado:string) => {
    setSeguidos(prev => prev.map(s => s.dedupe_key===dedupe_key ? { ...s, estado } : s)); // optimista
    try { await fetch('/api/concursos/seguidos', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ dedupe_key, estado }) }); } catch {}
  };
  const quitar = async (dedupe_key:string) => {
    setSeguidos(prev => prev.filter(s => s.dedupe_key!==dedupe_key)); // optimista
    try { await fetch('/api/concursos/seguidos?dedupe_key=' + encodeURIComponent(dedupe_key), { method:'DELETE' }); } catch {}
    emitSeguidos();
  };
  const dias = (iso:string) => { if(!iso) return null; return Math.ceil((new Date(iso).getTime()-Date.now())/86400000); };

  if (!seguidos.length) return null;
  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:14 }}>
      <strong style={{ fontSize:15 }}>📌 Mis concursos <span style={{ color:C.muted, fontWeight:400 }}>({seguidos.length})</span></strong>
      <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
        {seguidos.map(s => { const l = s.licitacion||{}; const d = dias(s.fin_presentacion); return (
          <div key={s.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'flex-start' }}>
              <strong style={{ fontSize:14 }}>{l.titulo || 'Licitación'}</strong>
              {d!==null && <span style={{ fontSize:12, color: d<=3?'var(--negative)':C.muted, fontWeight:700, whiteSpace:'nowrap' }}>{d<0?'cerrado':`${d} d`}</span>}
            </div>
            <div style={{ fontSize:12, color:C.muted }}>{l.organo}{l.provincia?` · ${l.provincia}`:''}{l.presupuesto?` · ${fmtEur(Number(l.presupuesto))}`:''}</div>
            <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:6, flexWrap:'wrap' }}>
              <select value={s.estado} onChange={e=>cambiarEstado(s.dedupe_key, e.target.value)} style={{ fontFamily:FONT, fontSize:12, padding:'3px 6px', borderRadius:8, border:`1px solid ${C.border}` }}>
                {ESTADOS_SEGUIMIENTO.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </select>
              {l.url && <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:C.indigo }}>Ver anuncio ↗</a>}
              <button onClick={()=>quitar(s.dedupe_key)} style={{ fontSize:12, background:'transparent', color:C.muted, border:`1px solid ${C.border}`, borderRadius:8, padding:'3px 10px', fontFamily:FONT, cursor:'pointer' }}>Quitar</button>
            </div>
          </div>
        ); })}
      </div>
    </div>
  );
}
