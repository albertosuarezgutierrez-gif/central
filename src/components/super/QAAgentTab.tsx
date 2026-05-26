'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { C, SM, SN, SE } from '@/lib/colors'

interface Check {
  categoria: string
  nombre: string
  estado: 'ok' | 'fallo' | 'warning' | 'skip'
  severidad: 'critico' | 'degradado' | 'info'
  detalle?: string
  fix_sugerido?: string
  ms_respuesta?: number
}

interface Run {
  id: string
  trigger: string
  modo: string
  total: number
  ok: number
  warnings: number
  fallidos: number
  criticos: number
  duracion_ms: number
  telegram_enviado: boolean
  created_at: string
}

interface Totales { total: number; ok: number; warnings: number; fallidos: number; criticos: number; duracion_ms: number }

interface Props { session: any }

const CATEGORIA_ICONS: Record<string, string> = {
  ENV: '🔑', BD: '🗄️', NEGOCIO: '🏪', APIs: '🌐', CRONS: '⏰', PERF: '⚡',
}

const ESTADO_COLOR: Record<string, string> = {
  ok: '#3F7D44', fallo: '#D9442B', warning: '#E8A33B', skip: '#6B5F52',
}
const ESTADO_ICON: Record<string, string> = {
  ok: '✅', fallo: '🔴', warning: '⚠️', skip: '⏭',
}

export default function QAAgentTab({ session }: Props) {
  const [running, setRunning]     = useState(false)
  const [checks, setChecks]       = useState<Check[]>([])
  const [categoria, setCategoria] = useState<string | null>(null)
  const [totales, setTotales]     = useState<Totales | null>(null)
  const [runs, setRuns]           = useState<Run[]>([])
  const [runSelec, setRunSelec]   = useState<string | null>(null)
  const [checksHist, setChecksHist] = useState<Check[]>([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [trigger, setTrigger]     = useState<'manual'|'post_deploy'|'diario'|'semanal'>('manual')
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadHistory = useCallback(async () => {
    const r = await fetch('/api/super/qa-agent', { headers: { 'x-ia-session': JSON.stringify(session) } })
    const d = await r.json()
    setRuns(d.runs ?? [])
  }, [session])

  useEffect(() => { loadHistory() }, [loadHistory])

  const ejecutar = async () => {
    setRunning(true)
    setChecks([])
    setTotales(null)
    setCategoria(null)
    setRunSelec(null)

    try {
      const res = await fetch('/api/super/qa-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
        body: JSON.stringify({ trigger }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.tipo === 'categoria') setCategoria(ev.nombre)
            if (ev.tipo === 'check') setChecks(prev => [...prev, ev as Check])
            if (ev.tipo === 'totales') setTotales(ev as Totales)
            if (ev.tipo === 'fin') { loadHistory(); setRunning(false) }
          } catch {}
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRunning(false)
    }
  }

  const verRun = async (id: string) => {
    if (runSelec === id) { setRunSelec(null); return }
    setRunSelec(id)
    setLoadingHist(true)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    // Carga checks del run seleccionado via API
    const r = await fetch(`/api/super/qa-agent?run_id=${id}`, { headers: { 'x-ia-session': JSON.stringify(session) } })
    const d = await r.json()
    setChecksHist(d.checks ?? [])
    setLoadingHist(false)
  }

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [checks])

  const checksMostrados = runSelec ? checksHist : checks
  const grupos: Record<string, Check[]> = {}
  checksMostrados.forEach(c => {
    if (!grupos[c.categoria]) grupos[c.categoria] = []
    grupos[c.categoria].push(c)
  })

  const resumenRun = (run: Run) => {
    const emoji = run.criticos > 0 ? '🔴' : run.warnings > 0 ? '🟡' : '✅'
    const fecha = new Date(run.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return { emoji, fecha }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 22, color: C.paper, fontStyle: 'italic' }}>QA Agent</div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 2 }}>
            Verificación completa del stack · BD + ENV + Negocio + APIs + Crons + Perf
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {/* Selector trigger */}
          <select value={trigger} onChange={e => setTrigger(e.target.value as any)}
            style={{ background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink2, fontFamily: SM, fontSize: 11, padding: '8px 12px', cursor: 'pointer' }}>
            <option value="manual">Manual</option>
            <option value="post_deploy">Post-deploy</option>
            <option value="diario">Diario</option>
            <option value="semanal">Semanal</option>
          </select>

          <button onClick={ejecutar} disabled={running}
            style={{ background: running ? C.bg3 : C.red, color: running ? C.ink3 : '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontFamily: SM, fontWeight: 700, fontSize: 12, letterSpacing: '.06em', cursor: running ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'background .2s' }}>
            {running ? (
              <>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #666', borderTop: '2px solid #ccc', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                Ejecutando…
              </>
            ) : '🤖 Ejecutar QA Completo'}
          </button>
        </div>
      </div>

      {/* Totales en tiempo real */}
      {(totales || running) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
          {[
            { label: 'TOTAL', val: totales?.total ?? checks.length, color: C.ink2 },
            { label: 'OK', val: totales?.ok ?? checks.filter(c => c.estado === 'ok').length, color: '#3F7D44' },
            { label: 'WARNINGS', val: totales?.warnings ?? checks.filter(c => c.estado === 'warning').length, color: '#E8A33B' },
            { label: 'CRÍTICOS', val: totales?.criticos ?? checks.filter(c => c.estado === 'fallo' && c.severidad === 'critico').length, color: C.red },
            { label: 'TIEMPO', val: totales ? `${(totales.duracion_ms / 1000).toFixed(1)}s` : '…', color: C.ink3 },
          ].map(item => (
            <div key={item.label} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: SE, fontSize: 22, color: item.color, fontStyle: 'italic' }}>{item.val}</div>
              <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.08em', marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Categoría activa */}
      {running && categoria && (
        <div style={{ fontFamily: SM, fontSize: 11, color: C.amber, letterSpacing: '.06em' }}>
          ⏳ {categoria}
        </div>
      )}

      {/* Checks en tiempo real */}
      {checksMostrados.length > 0 && (
        <div ref={scrollRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
          {Object.entries(grupos).map(([cat, catChecks]) => (
            <div key={cat}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', padding: '8px 0 4px', borderBottom: `1px solid ${C.rule}` }}>
                {CATEGORIA_ICONS[cat] ?? '•'} {cat}
              </div>
              {catChecks.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: `1px solid ${C.rule}20` }}>
                  <span style={{ fontSize: 13, flexShrink: 0, width: 20 }}>{ESTADO_ICON[c.estado]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SM, fontSize: 11, color: ESTADO_COLOR[c.estado], letterSpacing: '.04em' }}>
                      {c.nombre}
                      {c.ms_respuesta !== undefined && (
                        <span style={{ marginLeft: 6, fontFamily: SN, fontSize: 10, color: C.ink4 }}>{c.ms_respuesta}ms</span>
                      )}
                    </div>
                    {c.detalle && (
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>{c.detalle}</div>
                    )}
                    {c.fix_sugerido && c.estado !== 'ok' && (
                      <div style={{ fontFamily: SN, fontSize: 10, color: C.amber, marginTop: 3 }}>
                        💡 {c.fix_sugerido}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4, flexShrink: 0, letterSpacing: '.06em', paddingTop: 2 }}>
                    {c.severidad.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Historial de runs */}
      {runs.length > 0 && (
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 10 }}>
            HISTORIAL DE EJECUCIONES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {runs.map(run => {
              const { emoji, fecha } = resumenRun(run)
              const activo = runSelec === run.id
              return (
                <div key={run.id}>
                  <button onClick={() => verRun(run.id)}
                    style={{ width: '100%', background: activo ? C.bg3 : C.bg2, border: `1px solid ${activo ? C.red : C.rule}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                    <span style={{ fontSize: 16 }}>{emoji}</span>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontFamily: SM, fontSize: 11, color: C.paper, letterSpacing: '.04em' }}>
                        {fecha} · <span style={{ color: C.ink3 }}>{run.trigger}</span>
                      </div>
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                        {run.total} checks · {(run.duracion_ms / 1000).toFixed(1)}s
                        {run.telegram_enviado && <span style={{ marginLeft: 6, color: '#2EA5D0' }}>📱 TG</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {run.criticos > 0 && <span style={{ background: `${C.red}20`, color: C.red, borderRadius: 6, padding: '2px 8px', fontFamily: SM, fontSize: 10 }}>🔴 {run.criticos}</span>}
                      {run.warnings > 0 && <span style={{ background: '#E8A33B20', color: '#E8A33B', borderRadius: 6, padding: '2px 8px', fontFamily: SM, fontSize: 10 }}>⚠️ {run.warnings}</span>}
                      <span style={{ background: '#3F7D4420', color: '#3F7D44', borderRadius: 6, padding: '2px 8px', fontFamily: SM, fontSize: 10 }}>✅ {run.ok}</span>
                    </div>
                  </button>

                  {activo && (
                    <div style={{ background: C.bg, border: `1px solid ${C.rule}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 12 }}>
                      {loadingHist ? (
                        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>Cargando…</div>
                      ) : checksHist.length === 0 ? (
                        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>Sin detalle guardado</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                          {checksHist.filter(c => c.estado !== 'ok').map((c, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: `1px solid ${C.rule}20` }}>
                              <span style={{ fontSize: 12 }}>{ESTADO_ICON[c.estado]}</span>
                              <div>
                                <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>[{c.categoria}]</span>
                                <span style={{ fontFamily: SM, fontSize: 11, color: ESTADO_COLOR[c.estado], marginLeft: 4 }}>{c.nombre}</span>
                                {c.detalle && <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4 }}>{c.detalle}</div>}
                              </div>
                            </div>
                          ))}
                          {checksHist.filter(c => c.estado !== 'ok').length === 0 && (
                            <div style={{ fontFamily: SN, fontSize: 11, color: '#3F7D44' }}>✅ Todo OK en este run</div>
                          )}
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
