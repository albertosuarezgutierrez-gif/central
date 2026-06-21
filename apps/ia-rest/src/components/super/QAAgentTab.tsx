'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { C, SM, SN, SE } from '@/lib/colors'

interface Check {
  categoria: string; nombre: string
  estado: 'ok'|'fallo'|'warning'|'skip'
  severidad: 'critico'|'degradado'|'info'
  detalle?: string; fix_sugerido?: string; ms_respuesta?: number
  es_regresion?: boolean; fue_auto_fixed?: boolean
}
interface Run {
  id: string; trigger: string; total: number; ok: number; warnings: number
  fallidos: number; criticos: number; regresiones: number; auto_fixes: number
  score: number; duracion_ms: number; informe_ia?: string
  telegram_enviado: boolean; created_at: string
}
interface Tendencia { metrica: string; valor: number; created_at: string }

const EICO: Record<string,string> = { ok:'✅', fallo:'🔴', warning:'⚠️', skip:'⏭' }
const ECOL: Record<string,string> = { ok:'#3F7D44', fallo:'#D9442B', warning:'#E8A33B', skip:'#6B5F52' }
const CICO: Record<string,string> = { ENV:'🔑', BD:'🗄️', NEGOCIO:'🏪', APIs:'🌐', CRONS:'⏰', PERF:'⚡', 'DEMO 🗓️':'🗓️' }

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 90 ? '#3F7D44' : score >= 70 ? '#E8A33B' : '#D9442B'
  const r = 28, c = 36, stroke = 6
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={c} cy={c} r={r} fill="none" stroke={C.rule} strokeWidth={stroke} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray .6s ease' }} />
        <text x={c} y={c+1} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontFamily="Inter Tight, sans-serif" fontWeight={700} fontSize={16}>
          {score}
        </text>
      </svg>
      <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing:'.08em' }}>SCORE</span>
    </div>
  )
}

function TrendMini({ runs }: { runs: Run[] }) {
  if (runs.length < 2) return null
  const last7 = [...runs].reverse().slice(-7)
  const max = 100, min = 0, W = 120, H = 32
  const pts = last7.map((r, i) => {
    const x = (i / (last7.length - 1)) * W
    const y = H - ((r.score - min) / (max - min)) * H
    return `${x},${y}`
  }).join(' ')
  const lastScore = last7[last7.length - 1].score
  const color = lastScore >= 90 ? '#3F7D44' : lastScore >= 70 ? '#E8A33B' : '#D9442B'
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <svg width={W} height={H} style={{ overflow:'visible' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {last7.map((r, i) => {
          const x = (i / (last7.length - 1)) * W
          const y = H - ((r.score - min) / (max - min)) * H
          return <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
        })}
      </svg>
      <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing:'.06em' }}>ÚLTIMOS {last7.length} RUNS</span>
    </div>
  )
}

export default function QAAgentTab({ session }: { session: any }) {
  const [running, setRunning]     = useState(false)
  const [checks, setChecks]       = useState<Check[]>([])
  const [categoria, setCategoria] = useState<string|null>(null)
  const [totales, setTotales]     = useState<any>(null)
  const [runs, setRuns]           = useState<Run[]>([])
  const [tendencias, setTendencias] = useState<Tendencia[]>([])
  const [runSelec, setRunSelec]   = useState<string|null>(null)
  const [checksHist, setChecksHist] = useState<Check[]>([])
  const [loadHist, setLoadHist]   = useState(false)
  const [trigger, setTrigger]     = useState<string>('manual')
  const [filtro, setFiltro]       = useState<'todos'|'fallos'|'regresiones'>('todos')
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadHistory = useCallback(async () => {
    const r = await fetch('/api/super/qa-agent', { headers: { 'x-ia-session': JSON.stringify(session) } })
    const d = await r.json()
    setRuns(d.runs ?? [])
    setTendencias(d.tendencias ?? [])
  }, [session])

  useEffect(() => { loadHistory() }, [loadHistory])

  const ejecutar = async () => {
    setRunning(true); setChecks([]); setTotales(null); setCategoria(null); setRunSelec(null)
    try {
      const res = await fetch('/api/super/qa-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
        body: JSON.stringify({ trigger }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.tipo === 'categoria') setCategoria(ev.nombre)
            if (ev.tipo === 'check')     setChecks(p => [...p, ev as Check])
            if (ev.tipo === 'totales')   setTotales(ev)
            if (ev.tipo === 'fin')       { loadHistory(); setRunning(false) }
          } catch {}
        }
      }
    } catch { setRunning(false) }
  }

  const verRun = async (id: string) => {
    if (runSelec === id) { setRunSelec(null); return }
    setRunSelec(id); setLoadHist(true)
    const r = await fetch(`/api/super/qa-agent?run_id=${id}`, { headers: { 'x-ia-session': JSON.stringify(session) } })
    const d = await r.json()
    setChecksHist(d.checks ?? []); setLoadHist(false)
  }

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [checks])

  const checksMostrados = runSelec ? checksHist : checks
  const checksFiltrados = filtro === 'fallos'     ? checksMostrados.filter(c=>c.estado!=='ok'&&c.estado!=='skip')
                        : filtro === 'regresiones' ? checksMostrados.filter(c=>c.es_regresion)
                        : checksMostrados

  const grupos: Record<string, Check[]> = {}
  checksFiltrados.forEach(c => { if (!grupos[c.categoria]) grupos[c.categoria]=[]; grupos[c.categoria].push(c) })

  const scoreActual = totales?.score ?? (checks.length>0 ? Math.max(0,100-checks.filter(c=>c.estado==='fallo'&&c.severidad==='critico').length*20-checks.filter(c=>c.estado==='warning').length*3) : null)
  const lastRun = runs[0]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          {(scoreActual !== null) && <ScoreCircle score={scoreActual} />}
          <div>
            <div style={{ fontFamily: SE, fontSize:22, color: C.paper, fontStyle:'italic' }}>QA Agent</div>
            <div style={{ fontFamily: SN, fontSize:11, color: C.ink3, marginTop:2 }}>
              {runs.length>0 ? `Último: ${new Date(runs[0].created_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · Score ${runs[0].score}/100` : 'Sin ejecuciones aún'}
            </div>
            {runs.length > 1 && <TrendMini runs={runs} />}
          </div>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <select value={trigger} onChange={e=>setTrigger(e.target.value)}
            style={{ background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, color:C.ink2, fontFamily:SM, fontSize:11, padding:'8px 12px', cursor:'pointer' }}>
            <option value="manual">Manual</option>
            <option value="post_deploy">Post-deploy</option>
            <option value="diario">Diario</option>
            <option value="semanal">Semanal + Informe NIM</option>
          </select>
          <button onClick={ejecutar} disabled={running}
            style={{ background:running?C.bg3:C.red, color:running?C.ink3:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontFamily:SM, fontWeight:700, fontSize:12, letterSpacing:'.06em', cursor:running?'default':'pointer', display:'flex', alignItems:'center', gap:8 }}>
            {running ? <><span style={{ display:'inline-block', width:12, height:12, border:'2px solid #666', borderTop:'2px solid #ccc', borderRadius:'50%', animation:'spin 1s linear infinite' }}/>Ejecutando…</> : '🤖 Ejecutar QA'}
          </button>
        </div>
      </div>

      {/* KPIs en tiempo real */}
      {(totales || running) && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))', gap:8 }}>
          {[
            { l:'TOTAL',      v: totales?.total     ?? checks.length,                                                  c: C.ink2 },
            { l:'OK',         v: totales?.ok        ?? checks.filter(c=>c.estado==='ok').length,                       c:'#3F7D44' },
            { l:'WARNINGS',   v: totales?.warnings  ?? checks.filter(c=>c.estado==='warning').length,                  c:'#E8A33B' },
            { l:'CRÍTICOS',   v: totales?.criticos  ?? checks.filter(c=>c.estado==='fallo'&&c.severidad==='critico').length, c: C.red },
            { l:'REGRESIONES',v: totales?.regresiones ?? checks.filter(c=>c.es_regresion).length,                     c:'#A855F7' },
            { l:'AUTO-FIX',   v: totales?.auto_fixes ?? checks.filter(c=>c.fue_auto_fixed).length,                    c:'#2EA5D0' },
          ].map(item => (
            <div key={item.l} style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontFamily:SE, fontSize:20, color:item.c, fontStyle:'italic' }}>{item.v}</div>
              <div style={{ fontFamily:SM, fontSize:8, color:C.ink4, letterSpacing:'.08em', marginTop:2 }}>{item.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Informe NIM (semanal) */}
      {totales?.informe_ia && (
        <div style={{ background:`${C.bg2}`, border:`1px solid ${C.rule}`, borderRadius:10, padding:'14px 16px' }}>
          <div style={{ fontFamily:SM, fontSize:9, color:C.ink4, letterSpacing:'.1em', marginBottom:8 }}>🤖 ANÁLISIS NIM</div>
          <div style={{ fontFamily:SN, fontSize:12, color:C.ink2, lineHeight:1.6 }}>{totales.informe_ia}</div>
        </div>
      )}

      {/* Categoría activa */}
      {running && categoria && (
        <div style={{ fontFamily:SM, fontSize:11, color:C.amber, letterSpacing:'.06em' }}>⏳ {categoria}</div>
      )}

      {/* Filtros */}
      {checksMostrados.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {(['todos','fallos','regresiones'] as const).map(f => (
            <button key={f} onClick={()=>setFiltro(f)}
              style={{ background:filtro===f?C.red:'transparent', color:filtro===f?'#fff':C.ink3, border:`1px solid ${filtro===f?C.red:C.rule}`, borderRadius:20, padding:'4px 12px', fontFamily:SM, fontSize:10, cursor:'pointer', letterSpacing:'.06em' }}>
              {f.toUpperCase()}
              {f==='fallos' && checksMostrados.filter(c=>c.estado!=='ok'&&c.estado!=='skip').length > 0 &&
                <span style={{ marginLeft:4 }}>{checksMostrados.filter(c=>c.estado!=='ok'&&c.estado!=='skip').length}</span>}
              {f==='regresiones' && checksMostrados.filter(c=>c.es_regresion).length > 0 &&
                <span style={{ marginLeft:4 }}>{checksMostrados.filter(c=>c.es_regresion).length}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Lista de checks */}
      {Object.keys(grupos).length > 0 && (
        <div ref={scrollRef} style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:500, overflowY:'auto', paddingRight:4 }}>
          {Object.entries(grupos).map(([cat, catChecks]) => (
            <div key={cat}>
              <div style={{ fontFamily:SM, fontSize:10, color:C.ink4, letterSpacing:'.1em', padding:'8px 0 4px', borderBottom:`1px solid ${C.rule}` }}>
                {CICO[cat.split(' ')[0]] ?? '•'} {cat}
              </div>
              {catChecks.map((c, i) => (
                <div key={i} style={{ display:'flex', flexWrap:'wrap', alignItems:'flex-start', gap:8, padding:'7px 0', borderBottom:`1px solid ${C.rule}20` }}>
                  <span style={{ fontSize:13, flexShrink:0, width:20 }}>{EICO[c.estado]}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SM, fontSize:11, color:ECOL[c.estado], letterSpacing:'.04em', display:'flex', flexWrap:'wrap', alignItems:'center', gap:6 }}>
                      {c.nombre}
                      {c.es_regresion   && <span style={{ background:'#A855F720', color:'#A855F7', borderRadius:4, padding:'1px 5px', fontSize:8 }}>🆕 REGRESIÓN</span>}
                      {c.fue_auto_fixed && <span style={{ background:'#2EA5D020', color:'#2EA5D0', borderRadius:4, padding:'1px 5px', fontSize:8 }}>🔧 AUTO-FIX</span>}
                      {c.ms_respuesta !== undefined && <span style={{ fontFamily:SN, fontSize:10, color:C.ink4 }}>{c.ms_respuesta}ms</span>}
                    </div>
                    {c.detalle      && <div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginTop:2 }}>{c.detalle}</div>}
                    {c.fix_sugerido && c.estado!=='ok' && <div style={{ fontFamily:SN, fontSize:10, color:C.amber, marginTop:3 }}>💡 {c.fix_sugerido}</div>}
                  </div>
                  <span style={{ fontFamily:SM, fontSize:9, color:C.ink4, flexShrink:0, letterSpacing:'.06em', paddingTop:2 }}>{c.severidad.toUpperCase()}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Historial */}
      {runs.length > 0 && (
        <div>
          <div style={{ fontFamily:SM, fontSize:10, color:C.ink4, letterSpacing:'.1em', marginBottom:10 }}>HISTORIAL ({runs.length} runs)</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {runs.map(run => {
              const emoji = run.criticos>0?'🔴':run.regresiones>0?'🆕':run.warnings>0?'🟡':'✅'
              const fecha = new Date(run.created_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
              const activo = runSelec === run.id
              return (
                <div key={run.id}>
                  <button onClick={()=>verRun(run.id)}
                    style={{ width:'100%', background:activo?C.bg3:C.bg2, border:`1px solid ${activo?C.red:C.rule}`, borderRadius:10, padding:'10px 14px', cursor:'pointer', display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, textAlign:'left' }}>
                    <span style={{ fontSize:15 }}>{emoji}</span>
                    <div style={{ flex:1, minWidth:120 }}>
                      <div style={{ fontFamily:SM, fontSize:11, color:C.paper, letterSpacing:'.04em' }}>
                        {fecha} · <span style={{ color:C.ink3 }}>{run.trigger}</span>
                      </div>
                      <div style={{ fontFamily:SN, fontSize:11, color:C.ink3, marginTop:2 }}>
                        {run.total} checks · {(run.duracion_ms/1000).toFixed(1)}s
                        {run.telegram_enviado && <span style={{ marginLeft:6, color:'#2EA5D0' }}>📱</span>}
                        {run.auto_fixes>0     && <span style={{ marginLeft:6, color:'#2EA5D0' }}>🔧{run.auto_fixes}</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                      <span style={{ background:`${run.score>=90?'#3F7D44':run.score>=70?'#E8A33B':'#D9442B'}20`, color:run.score>=90?'#3F7D44':run.score>=70?'#E8A33B':'#D9442B', borderRadius:6, padding:'2px 8px', fontFamily:SM, fontWeight:700, fontSize:11 }}>{run.score}</span>
                      {run.criticos>0    && <span style={{ background:`${C.red}20`, color:C.red, borderRadius:6, padding:'2px 7px', fontFamily:SM, fontSize:10 }}>🔴{run.criticos}</span>}
                      {run.regresiones>0 && <span style={{ background:'#A855F720', color:'#A855F7', borderRadius:6, padding:'2px 7px', fontFamily:SM, fontSize:10 }}>🆕{run.regresiones}</span>}
                      {run.warnings>0    && <span style={{ background:'#E8A33B20', color:'#E8A33B', borderRadius:6, padding:'2px 7px', fontFamily:SM, fontSize:10 }}>⚠️{run.warnings}</span>}
                    </div>
                  </button>
                  {activo && (
                    <div style={{ background:C.bg, border:`1px solid ${C.rule}`, borderTop:'none', borderRadius:'0 0 10px 10px', padding:12 }}>
                      {run.informe_ia && <div style={{ fontFamily:SN, fontSize:11, color:C.ink2, marginBottom:10, lineHeight:1.6, fontStyle:'italic' }}>"{run.informe_ia}"</div>}
                      {loadHist ? <div style={{ fontFamily:SM, fontSize:11, color:C.ink4 }}>Cargando…</div> : (
                        <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:280, overflowY:'auto' }}>
                          {checksHist.filter(c=>c.estado!=='ok').length === 0
                            ? <div style={{ fontFamily:SN, fontSize:11, color:'#3F7D44' }}>✅ Todo OK en este run</div>
                            : checksHist.filter(c=>c.estado!=='ok').map((c,i) => (
                              <div key={i} style={{ display:'flex', gap:8, padding:'4px 0', borderBottom:`1px solid ${C.rule}20` }}>
                                <span style={{ fontSize:12 }}>{EICO[c.estado]}</span>
                                <div>
                                  <span style={{ fontFamily:SM, fontSize:10, color:C.ink3 }}>[{c.categoria}]</span>
                                  <span style={{ fontFamily:SM, fontSize:11, color:ECOL[c.estado], marginLeft:4 }}>{c.nombre}</span>
                                  {c.es_regresion && <span style={{ marginLeft:4, background:'#A855F720', color:'#A855F7', borderRadius:4, padding:'1px 4px', fontSize:8 }}>REGRESIÓN</span>}
                                  {c.detalle && <div style={{ fontFamily:SN, fontSize:10, color:C.ink4 }}>{c.detalle}</div>}
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
