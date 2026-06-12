// 🗺️ Mapa vivo de arquitectura — pestaña Estructura del panel de operador.
// Lee la radiografía auto-generada (lib/estructura.generated.json, vía lib/estructura)
// + la curaduría, y la hace navegable: resumen, buscador, diagrama, drill-down por
// nodo (app/módulo/agente/skill), salud, glosario, checklist, novedades, chat IA y
// el "conectar" operativo (módulos por cliente, reutilizando el endpoint existente).
'use client'
import { useEffect, useMemo, useState, Fragment } from 'react'
import {
  RADIOGRAFIA, VERTICALES, MODULOS, AGENTES, RESUMEN_EXPLICATIVO, GLOSARIO,
  CHECKLIST_NUEVA_VERTICAL, enlacesApp, enlacesModulo, enlacesSkill,
} from '@/lib/estructura'

const C = { bg: '#0b1020', card: '#151b2e', card2: '#1c2540', border: '#2a3457', text: '#e8ecf7', muted: '#8b97b8', accent: '#6366f1', ok: '#22c55e', okBg: '#0c2a18', warn: '#fbbf24', red: '#ef4444', redBg: '#2a0c0c' }
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"
const VLABEL: Record<string, string> = { 'ia-rest': 'ia.rest', ialimp: 'ialimp', sivra: 'SIVRA', plataforma: 'matriz' }
const vlabel = (v: string) => VLABEL[v] || v
// app (apps/*) → vertical del adaptador de clientes
const APP_VERT: Record<string, 'ialimp' | 'sivra' | 'iarest'> = { ialimp: 'ialimp', sivra: 'sivra', 'ia-rest': 'iarest' }

type Sel =
  | { tipo: 'app'; id: string }
  | { tipo: 'modulo'; id: string }
  | { tipo: 'agente'; id: string }
  | { tipo: 'skill'; id: string }
  | null

export default function MapaArquitectura() {
  const R = RADIOGRAFIA
  const [sel, setSel] = useState<Sel>(null)
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()

  const consumidores = (id: string) => R.verticales.filter(v => R.matrizModulos[id]?.[v]?.estado === 'usado')
  const usados = (app: string) => R.packages.filter(p => R.matrizModulos[p.id]?.[app]?.estado === 'usado').map(p => p.id)
  const caps = (app: string) => R.capacidades.filter(c => R.matrizCapacidades[c.id]?.[app]?.presente)

  // Buscador: lista de nodos que casan.
  const hits = useMemo(() => {
    if (!ql) return [] as Sel[]
    const out: Sel[] = []
    for (const v of R.verticales) if (v.toLowerCase().includes(ql)) out.push({ tipo: 'app', id: v })
    for (const p of R.packages) if (p.id.toLowerCase().includes(ql)) out.push({ tipo: 'modulo', id: p.id })
    for (const a of AGENTES) if (a.nombre.toLowerCase().includes(ql)) out.push({ tipo: 'agente', id: a.nombre })
    for (const s of R.skills) if (s.id.toLowerCase().includes(ql) || s.name.toLowerCase().includes(ql)) out.push({ tipo: 'skill', id: s.id })
    return out.slice(0, 12)
  }, [ql, R])

  const fecha = R.generadoEn ? new Date(R.generadoEn).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const cores = MODULOS.filter(m => m.tipo === 'core')
  const mods = MODULOS.filter(m => m.tipo === 'module')

  return (
    <div>
      {/* Resumen explicativo + KPIs */}
      <div style={{ ...card(), marginBottom: 16 }}>
        <P>{RESUMEN_EXPLICATIVO}</P>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Auto-generado del repo · última: {fecha} · regenerar: <code style={codeS}>npm run auditar</code></div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Kpi label="Apps" valor={String(R.resumen.verticales)} />
        <Kpi label="Packages" valor={String(R.resumen.packages)} />
        <Kpi label="Capacidades" valor={String(R.resumen.capacidades)} />
        <Kpi label="Skills" valor={String(R.resumen.skills)} />
        <Kpi label="Rutas API" valor={String(R.resumen.apis)} />
        <Kpi label="Reimplementaciones" valor={String(R.resumen.reimplementaciones)} />
      </div>

      {/* Buscador */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Buscar app, módulo, agente o skill (p.ej. materiales, JJ, concursos)…"
        style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card2, color: C.text, fontSize: 14, fontFamily: FONT, boxSizing: 'border-box', marginBottom: hits.length ? 8 : 20 }} />
      {hits.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {hits.map((h, i) => h && (
            <button key={i} onClick={() => { setSel(h); setQ('') }} style={chipBtn}>
              {h.tipo === 'app' ? '🏢' : h.tipo === 'modulo' ? '📦' : h.tipo === 'agente' ? '🤖' : '✨'} {h.id}
            </button>
          ))}
        </div>
      )}

      {/* Diagrama apps ↔ módulos */}
      <Diagrama R={R} onSel={setSel} />

      {/* Detalle del nodo seleccionado */}
      {sel && <Detalle sel={sel} R={R} usados={usados} caps={caps} consumidores={consumidores} onClose={() => setSel(null)} onSel={setSel} />}

      {/* Listas navegables */}
      <Sec titulo={`🏢 Apps · ${VERTICALES.length}`}>
        <Grid>{VERTICALES.map(v => (
          <Nodo key={v.app} onClick={() => setSel({ tipo: 'app', id: v.app })} activo={sel?.tipo === 'app' && sel.id === v.app}>
            <b>{v.nombre}</b> <span style={{ fontSize: 11, color: C.accent }}>{v.sector}</span>
            <div style={muteS}>{v.desc}</div>
          </Nodo>
        ))}</Grid>
      </Sec>
      <Sec titulo={`🧩 Núcleos · core-* (${cores.length})`}>
        <Grid>{cores.map(m => (
          <Nodo key={m.id} onClick={() => setSel({ tipo: 'modulo', id: m.id })} activo={sel?.tipo === 'modulo' && sel.id === m.id}>
            <code style={{ fontWeight: 800, fontSize: 13 }}>{m.id}</code>
            <div style={muteS}>{m.desc}</div>
          </Nodo>
        ))}</Grid>
      </Sec>
      <Sec titulo={`📦 Módulos de dominio · module-* (${mods.length})`}>
        <Grid>{mods.map(m => (
          <Nodo key={m.id} accent onClick={() => setSel({ tipo: 'modulo', id: m.id })} activo={sel?.tipo === 'modulo' && sel.id === m.id}>
            <code style={{ fontWeight: 800, fontSize: 13 }}>{m.id}</code>
            <div style={muteS}>{m.desc}</div>
          </Nodo>
        ))}</Grid>
      </Sec>
      <Sec titulo={`✨ Skills · ${R.skills.length}`}>
        <Grid>{R.skills.map(s => (
          <Nodo key={s.id} onClick={() => setSel({ tipo: 'skill', id: s.id })} activo={sel?.tipo === 'skill' && sel.id === s.id}>
            <b>{s.id}</b>
            <div style={muteS}>{(s.description || s.name).slice(0, 110)}{(s.description || '').length > 110 ? '…' : ''}</div>
          </Nodo>
        ))}</Grid>
      </Sec>
      <Sec titulo={`🤖 Agentes IA · ${AGENTES.length}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{AGENTES.map((a, i) => (
          <div key={i} onClick={() => setSel({ tipo: 'agente', id: a.nombre })} style={{ ...card(), cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px' }}>
            <div><b>{a.nombre}</b><div style={muteS}>{a.desc}</div></div>
            <span style={{ fontSize: 11, color: C.muted, background: C.card2, borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap' }}>{a.ambito}</span>
          </div>
        ))}</div>
      </Sec>

      {/* Chat IA sobre el mapa */}
      <ChatMapa />

      {/* Salud + glosario + checklist + novedades + radiografía */}
      <Salud R={R} />
      <Radiografia R={R} />
      <Glosario />
      <Novedades R={R} />
    </div>
  )
}

// ── Diagrama SVG (apps arriba, módulos abajo; líneas = "app usa módulo") ─────────
function Diagrama({ R, onSel }: { R: typeof RADIOGRAFIA; onSel: (s: Sel) => void }) {
  const apps = R.verticales.filter(v => v !== R.matriz)
  const pkgs = R.packages
  const W = 920, padX = 20, topY = 40, botY = 230
  const ax = (i: number) => padX + (i + 0.5) * ((W - 2 * padX) / apps.length)
  const px = (i: number) => padX + (i + 0.5) * ((W - 2 * padX) / pkgs.length)
  const lines: { x1: number; x2: number }[] = []
  apps.forEach((a, ai) => pkgs.forEach((p, pi) => { if (R.matrizModulos[p.id]?.[a]?.estado === 'usado') lines.push({ x1: ax(ai), x2: px(pi) }) }))
  return (
    <div style={{ ...card(), overflowX: 'auto', marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>🕸️ Mapa apps ↔ módulos <span style={{ color: C.muted, fontWeight: 500 }}>· cada línea = la app usa ese módulo</span></div>
      <svg viewBox={`0 0 ${W} 270`} style={{ width: '100%', minWidth: 680, height: 'auto' }}>
        {lines.map((l, i) => <line key={i} x1={l.x1} y1={topY + 16} x2={l.x2} y2={botY - 16} stroke={C.border} strokeWidth={1} />)}
        {apps.map((a, i) => (
          <g key={a} onClick={() => onSel({ tipo: 'app', id: a })} style={{ cursor: 'pointer' }}>
            <rect x={ax(i) - 58} y={topY - 14} width={116} height={30} rx={8} fill={C.card2} stroke={C.accent} />
            <text x={ax(i)} y={topY + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.text} fontFamily={FONT}>{vlabel(a)}</text>
          </g>
        ))}
        {pkgs.map((p, i) => (
          <g key={p.id} onClick={() => onSel({ tipo: 'modulo', id: p.id })} style={{ cursor: 'pointer' }}>
            <rect x={px(i) - 30} y={botY - 12} width={60} height={26} rx={6} fill={C.card2} stroke={p.tipo === 'core' ? C.border : C.accent} />
            <text x={px(i)} y={botY + 5} textAnchor="middle" fontSize={8.5} fill={C.muted} fontFamily="monospace">{p.id.replace(/^(core|module)-/, '')}</text>
          </g>
        ))}
        <text x={padX} y={topY - 22} fontSize={10} fill={C.muted} fontFamily={FONT}>APPS</text>
        <text x={padX} y={botY + 28} fontSize={10} fill={C.muted} fontFamily={FONT}>MÓDULOS (núcleos + dominio)</text>
      </svg>
    </div>
  )
}

// ── Panel de detalle por nodo ────────────────────────────────────────────────
function Detalle({ sel, R, usados, caps, consumidores, onClose, onSel }: {
  sel: NonNullable<Sel>; R: typeof RADIOGRAFIA
  usados: (a: string) => string[]; caps: (a: string) => typeof RADIOGRAFIA.capacidades
  consumidores: (id: string) => string[]; onClose: () => void; onSel: (s: Sel) => void
}) {
  return (
    <div style={{ ...card(C.accent), marginBottom: 24, position: 'relative' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 12, background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
      {sel.tipo === 'app' && <DetalleApp app={sel.id} R={R} usados={usados} caps={caps} onSel={onSel} />}
      {sel.tipo === 'modulo' && <DetalleModulo id={sel.id} R={R} consumidores={consumidores} onSel={onSel} />}
      {sel.tipo === 'agente' && <DetalleAgente nombre={sel.id} />}
      {sel.tipo === 'skill' && <DetalleSkill id={sel.id} R={R} />}
    </div>
  )
}

function DetalleApp({ app, R, usados, caps, onSel }: { app: string; R: typeof RADIOGRAFIA; usados: (a: string) => string[]; caps: (a: string) => typeof RADIOGRAFIA.capacidades; onSel: (s: Sel) => void }) {
  const info = VERTICALES.find(v => v.app === app)
  const tablas = R.tablasPorVertical[app] || []
  const apis = R.apisPorVertical[app] || []
  return (
    <div>
      <H>🏢 {info?.nombre || app} <small style={{ color: C.accent }}>{info?.sector}</small></H>
      {info?.desc && <P>{info.desc}</P>}
      <Enlaces items={enlacesApp(app)} />
      <Bloque titulo={`Módulos que usa (${usados(app).length})`}>
        <Chips items={usados(app)} onClick={id => onSel({ tipo: 'modulo', id })} />
      </Bloque>
      <Bloque titulo={`Capacidades (${caps(app).length})`}><Tags items={caps(app).map(c => c.label)} /></Bloque>
      <Bloque titulo={`Tablas (${tablas.length})`}><Tags items={tablas} mono /></Bloque>
      <Bloque titulo={`Rutas API (${apis.length})`}><Tags items={apis.slice(0, 40)} mono />{apis.length > 40 && <span style={muteS}>… y {apis.length - 40} más</span>}</Bloque>
      {APP_VERT[app] && <ClientesApp vertical={APP_VERT[app]} />}
    </div>
  )
}

function DetalleModulo({ id, R, consumidores, onSel }: { id: string; R: typeof RADIOGRAFIA; consumidores: (id: string) => string[]; onSel: (s: Sel) => void }) {
  const info = MODULOS.find(m => m.id === id)
  const pkg = R.packages.find(p => p.id === id)
  const deps = R.depsModulos[id] || []
  const capsQueRespalda = R.capacidades.filter(c => c.modulo === id).map(c => c.label)
  return (
    <div>
      <H>📦 <code>{id}</code> <small style={{ color: C.muted }}>{pkg?.tipo} · {pkg?.npm}</small></H>
      {info?.desc && <P>{info.desc}</P>}
      <Enlaces items={enlacesModulo(id)} />
      <Bloque titulo={`Lo usan (${consumidores(id).length})`}><Chips items={consumidores(id)} onClick={a => onSel({ tipo: 'app', id: a })} label={vlabel} /></Bloque>
      <Bloque titulo="Depende de"><Chips items={deps} onClick={d => onSel({ tipo: 'modulo', id: d })} empty="Ninguno — módulo independiente (puro)" /></Bloque>
      {capsQueRespalda.length > 0 && <Bloque titulo="Respalda capacidades"><Tags items={capsQueRespalda} /></Bloque>}
    </div>
  )
}

function DetalleAgente({ nombre }: { nombre: string }) {
  const a = AGENTES.find(x => x.nombre === nombre)
  return <div><H>🤖 {nombre}</H>{a && <><P>{a.desc}</P><div style={muteS}>Ámbito: {a.ambito}</div></>}</div>
}

function DetalleSkill({ id, R }: { id: string; R: typeof RADIOGRAFIA }) {
  const s = R.skills.find(x => x.id === id)
  return <div><H>✨ {id}</H>{s && <P>{s.description || s.name}</P>}<Enlaces items={enlacesSkill(id)} /></div>
}

// ── Clientes en vivo + conectar módulos (operativo, reutiliza endpoints) ─────────
function ClientesApp({ vertical }: { vertical: 'ialimp' | 'sivra' | 'iarest' }) {
  const [cs, setCs] = useState<{ id: string; nombre: string; activo: boolean }[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  useEffect(() => {
    setCs(null); setSel(null)
    fetch(`/api/admin/estructura/clientes?app=${vertical}`).then(r => r.ok ? r.json() : { clientes: [] }).then(d => setCs(d.clientes || [])).catch(() => setCs([]))
  }, [vertical])
  return (
    <Bloque titulo="Clientes (en vivo)">
      {!cs && <span style={muteS}>Cargando…</span>}
      {cs && cs.length === 0 && <span style={muteS}>Sin clientes.</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cs?.map(c => (
          <div key={c.id}>
            <button onClick={() => setSel(sel === c.id ? null : c.id)} style={{ ...chipBtn, width: '100%', textAlign: 'left', justifyContent: 'space-between', display: 'flex' }}>
              <span>{c.nombre} {!c.activo && <span style={{ color: '#fca5a5' }}>· bloqueado</span>}</span>
              <span style={{ color: C.muted }}>módulos {sel === c.id ? '▲' : '▼'}</span>
            </button>
            {sel === c.id && <ModulosCliente vertical={vertical} id={c.id} />}
          </div>
        ))}
      </div>
    </Bloque>
  )
}

function ModulosCliente({ vertical, id }: { vertical: string; id: string }) {
  const [mods, setMods] = useState<{ key: string; label: string; activo: boolean }[] | null>(null)
  const base = `/api/admin/clientes/${vertical}/${encodeURIComponent(id)}/modulos`
  useEffect(() => { setMods(null); fetch(base).then(r => r.ok ? r.json() : { modulos: [] }).then(d => setMods(d.modulos || [])).catch(() => setMods([])) }, [base])
  async function toggle(m: { key: string; activo: boolean }) {
    const r = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulo: m.key, activo: !m.activo }) })
    if (r.ok) setMods(ms => ms?.map(x => x.key === m.key ? { ...x, activo: !x.activo } : x) || null)
  }
  if (!mods) return <div style={{ ...muteS, padding: '6px 4px' }}>Cargando módulos…</div>
  if (mods.length === 0) return <div style={{ ...muteS, padding: '6px 4px' }}>Esta vertical no expone módulos por cliente.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0 2px 8px' }}>
      {mods.map(m => (
        <label key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: C.card2, borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
          <span style={{ fontSize: 13 }}>{m.label}</span>
          <input type="checkbox" checked={m.activo} onChange={() => toggle(m)} style={{ width: 16, height: 16, accentColor: C.accent, cursor: 'pointer' }} />
        </label>
      ))}
      <div style={{ ...muteS, marginTop: 2 }}>Conectar/desconectar aplica en el próximo inicio de sesión del cliente.</div>
    </div>
  )
}

// ── Chat IA sobre el mapa ────────────────────────────────────────────────────
function ChatMapa() {
  const [msgs, setMsgs] = useState<{ rol: 'tu' | 'ia'; texto: string }[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const pregunta = q.trim(); if (!pregunta || busy) return
    setMsgs(m => [...m, { rol: 'tu', texto: pregunta }]); setQ(''); setBusy(true)
    try {
      const r = await fetch('/api/admin/estructura/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta }) })
      const d = await r.json()
      setMsgs(m => [...m, { rol: 'ia', texto: d.respuesta || d.error || 'Sin respuesta.' }])
    } catch { setMsgs(m => [...m, { rol: 'ia', texto: 'No se pudo conectar con la IA.' }]) }
    setBusy(false)
  }
  return (
    <Sec titulo="💬 Pregúntale al mapa">
      <div style={card()}>
        {msgs.length === 0 && <P>Pregunta en lenguaje natural sobre la arquitectura. Ej.: <i>"¿qué módulos usa ia-rest?"</i> · <i>"¿qué hace module-concursos?"</i></P>}
        {msgs.map((m, i) => (
          <div key={i} style={{ margin: '8px 0', textAlign: m.rol === 'tu' ? 'right' : 'left' }}>
            <span style={{ display: 'inline-block', maxWidth: '85%', background: m.rol === 'tu' ? C.accent : C.card2, color: m.rol === 'tu' ? '#fff' : C.text, borderRadius: 10, padding: '8px 12px', fontSize: 13, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{m.texto}</span>
          </div>
        ))}
        {busy && <div style={muteS}>Pensando…</div>}
        <form onSubmit={enviar} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Escribe tu pregunta…" style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card2, color: C.text, fontSize: 14, fontFamily: FONT }} />
          <button type="submit" disabled={busy} style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 8, padding: '0 16px', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>→</button>
        </form>
      </div>
    </Sec>
  )
}

// ── Salud (señales del repo + nota runtime) ──────────────────────────────────
function Salud({ R }: { R: typeof RADIOGRAFIA }) {
  const sinDesc = R.saludRepo?.packagesSinDescripcion || []
  return (
    <Sec titulo="🩺 Salud de la arquitectura">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SaludItem ok={R.gaps.reimplementaciones.length === 0} txt={`${R.gaps.reimplementaciones.length} reimplementaciones (lógica duplicada sin módulo compartido)`} />
        <SaludItem ok={sinDesc.length === 0} txt={sinDesc.length ? `Packages sin describir: ${sinDesc.join(', ')}` : 'Todos los packages descritos'} />
        <SaludItem ok={(R.saludRepo?.appsSinClaudeMd || []).length === 0} txt={(R.saludRepo?.appsSinClaudeMd || []).length ? `Apps sin CLAUDE.md: ${R.saludRepo.appsSinClaudeMd.join(', ')}` : 'Todas las apps con CLAUDE.md'} />
        <div style={{ ...muteS, marginTop: 4 }}>La salud runtime (deploys de Vercel, advisores de Supabase, vulnerabilidades) se revisa en la auditoría (<code style={codeS}>docs/AUDITORIA-2026-06.md</code>).</div>
      </div>
    </Sec>
  )
}
function SaludItem({ ok, txt }: { ok: boolean; txt: string }) {
  return <div style={{ ...card(), padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', borderColor: ok ? C.border : '#7a2a2a' }}><span style={{ color: ok ? C.ok : C.warn }}>{ok ? '✓' : '⚠️'}</span><span style={{ fontSize: 13 }}>{txt}</span></div>
}

function Glosario() {
  return (
    <Sec titulo="📖 Glosario + ✅ Checklist nueva vertical">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        <div style={card()}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>📖 Glosario</div>
          {GLOSARIO.map(g => <div key={g.termino} style={{ marginBottom: 8 }}><b style={{ fontSize: 13 }}>{g.termino}</b><div style={muteS}>{g.def}</div></div>)}
        </div>
        <div style={card()}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>✅ Dar de alta una vertical nueva</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13, lineHeight: 1.7 }}>{CHECKLIST_NUEVA_VERTICAL.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      </div>
    </Sec>
  )
}

function Novedades({ R }: { R: typeof RADIOGRAFIA }) {
  if (!R.novedades?.length) return null
  return (
    <Sec titulo="🆕 Novedades recientes">
      <div style={card()}>
        {R.novedades.slice(0, 10).map((n, i) => (
          <div key={i} style={{ padding: '5px 0', borderTop: i ? `1px solid ${C.border}` : 'none', fontSize: 13 }}>
            {n.fecha && <span style={{ color: C.muted, fontFamily: 'monospace', marginRight: 8 }}>{n.fecha}</span>}{n.titulo}
          </div>
        ))}
      </div>
    </Sec>
  )
}

// ── Radiografía (matrices + gaps) — mantenida del panel anterior ──────────────
function Radiografia({ R }: { R: typeof RADIOGRAFIA }) {
  const cores = R.packages.filter(p => p.tipo === 'core')
  const mods = R.packages.filter(p => p.tipo === 'module')
  const grupos: { grupo: string; caps: typeof R.capacidades }[] = []
  for (const c of R.capacidades) { let g = grupos.find(x => x.grupo === c.grupo); if (!g) { g = { grupo: c.grupo, caps: [] }; grupos.push(g) } g.caps.push(c) }
  return (
    <Sec titulo="🩻 Radiografía del repo (matrices)">
      <div style={subS}>🧩 Módulos por vertical</div>
      <Matriz cols={R.verticales} secciones={[
        { titulo: 'Núcleos · core-*', filas: cores.map(p => ({ label: p.id, cells: R.verticales.map(v => moduloCell(R.matrizModulos[p.id]?.[v])) })) },
        { titulo: 'Módulos de dominio · module-*', filas: mods.map(p => ({ label: p.id, cells: R.verticales.map(v => moduloCell(R.matrizModulos[p.id]?.[v])) })) },
      ]} />
      <div style={{ fontSize: 11, color: C.muted, margin: '8px 0 20px' }}>
        <Chip c={C.ok} bg={C.okBg}>✓ usado</Chip> en código · <Chip c={C.warn} bg="#2a230c">◐ declarado</Chip> sin import · · no presente
      </div>
      <div style={subS}>🗂️ Capacidades por vertical <span style={{ color: C.muted, fontWeight: 500 }}>· detectado por rutas</span></div>
      <Matriz cols={R.verticales} secciones={grupos.map(g => ({ titulo: g.grupo, filas: g.caps.map(c => ({ label: c.label, cells: R.verticales.map(v => capCell(R.matrizCapacidades[c.id]?.[v])) })) }))} />
      {R.gaps.reimplementaciones.length > 0 && (
        <div style={{ marginTop: 20 }}><div style={subS}>♻️ Reimplementaciones</div>
          {R.gaps.reimplementaciones.map(r => <div key={r.capacidad} style={{ ...card('#7a2a2a'), padding: '10px 14px', marginBottom: 6, fontSize: 13 }}><b>{r.label}</b> <code style={codeS}>{r.modulo}</code> — a mano en <b style={{ color: '#fca5a5' }}>{r.duplicada.map(vlabel).join(', ')}</b></div>)}
        </div>
      )}
      {R.gaps.oportunidadesPortar.length > 0 && (
        <div style={{ marginTop: 20 }}><div style={subS}>↔️ Diferencias entre verticales · candidatas a portar</div>
          {R.gaps.oportunidadesPortar.map(o => <div key={o.capacidad} style={{ ...card(), padding: '8px 14px', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><b>{o.label}</b><span style={muteS}>tiene <b style={{ color: C.ok }}>{o.tiene.map(vlabel).join(', ')}</b> · falta <b style={{ color: '#fca5a5' }}>{o.falta.map(vlabel).join(', ')}</b></span></div>)}
        </div>
      )}
    </Sec>
  )
}

// ── átomos de UI ─────────────────────────────────────────────────────────────
const muteS: React.CSSProperties = { fontSize: 12, color: C.muted, marginTop: 4 }
const subS: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: '0 0 12px' }
const codeS: React.CSSProperties = { background: C.card2, padding: '1px 5px', borderRadius: 4, fontSize: 11 }
const chipBtn: React.CSSProperties = { background: C.card2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: FONT }
function card(accent?: string): React.CSSProperties { return { background: C.card, border: `1px solid ${accent || C.border}`, borderRadius: 12, padding: '14px 16px' } }
function Kpi({ label, valor }: { label: string; valor: string }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 20px', minWidth: 110 }}><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{valor}</div></div> }
function P({ children }: { children: React.ReactNode }) { return <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{children}</p> }
function H({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, paddingRight: 24 }}>{children}</div> }
function Sec({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <div style={{ marginBottom: 28 }}><div style={subS}>{titulo}</div>{children}</div> }
function Grid({ children }: { children: React.ReactNode }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>{children}</div> }
function Nodo({ children, onClick, activo, accent }: { children: React.ReactNode; onClick: () => void; activo?: boolean; accent?: boolean }) {
  return <div onClick={onClick} style={{ ...card(activo ? C.accent : accent ? C.accent : undefined), cursor: 'pointer', outline: activo ? `2px solid ${C.accent}` : 'none' }}>{children}</div>
}
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <div style={{ marginTop: 14 }}><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>{titulo}</div>{children}</div> }
function Tags({ items, mono }: { items: string[]; mono?: boolean }) { return items.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{items.map((t, i) => <span key={i} style={{ background: C.card2, borderRadius: 6, padding: '3px 9px', fontSize: 12, fontFamily: mono ? 'monospace' : FONT }}>{t}</span>)}</div> : <span style={muteS}>—</span> }
function Chips({ items, onClick, label, empty }: { items: string[]; onClick: (id: string) => void; label?: (s: string) => string; empty?: string }) {
  return items.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{items.map(it => <button key={it} onClick={() => onClick(it)} style={chipBtn}>{label ? label(it) : it}</button>)}</div> : <span style={muteS}>{empty || '—'}</span>
}
function Enlaces({ items }: { items: { label: string; url: string }[] }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{items.map(e => <a key={e.label} href={e.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.accent, textDecoration: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 10px' }}>{e.label} ↗</a>)}</div>
}
function Chip({ children, c, bg }: { children: React.ReactNode; c: string; bg: string }) { return <span style={{ color: c, background: bg, borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>{children}</span> }
function moduloCell(c?: { estado: 'usado' | 'declarado' | 'no'; evidencias: number }): React.ReactNode {
  if (!c || c.estado === 'no') return <span style={{ color: C.muted, opacity: .4 }}>·</span>
  if (c.estado === 'declarado') return <span title="declarado sin import" style={{ color: C.warn }}>◐</span>
  return <span title={`${c.evidencias} fichero(s)`} style={{ color: C.ok }}>✓</span>
}
function capCell(c?: { presente: boolean; evidencias: number }): React.ReactNode {
  return (!c || !c.presente) ? <span style={{ color: C.muted, opacity: .4 }}>·</span> : <span title={`${c.evidencias} ruta(s)`} style={{ color: C.ok }}>✓</span>
}
type Fila = { label: string; cells: React.ReactNode[] }
type Seccion = { titulo: string; filas: Fila[] }
function Matriz({ cols, secciones }: { cols: string[]; secciones: Seccion[] }) {
  const th: React.CSSProperties = { textAlign: 'center', padding: '7px 8px', fontSize: 11, color: C.muted, fontWeight: 700, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'center', padding: '6px 8px', fontSize: 14, borderTop: `1px solid ${C.border}` }
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12, background: C.card }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 }}>
        <thead><tr><th style={{ ...th, textAlign: 'left', paddingLeft: 14 }}></th>{cols.map(v => <th key={v} style={th}>{vlabel(v)}</th>)}</tr></thead>
        <tbody>{secciones.map(s => (
          <Fragment key={s.titulo}>
            <tr><td colSpan={cols.length + 1} style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 800, color: C.accent, textTransform: 'uppercase', letterSpacing: .4, borderTop: `1px solid ${C.border}` }}>{s.titulo}</td></tr>
            {s.filas.map(f => (
              <tr key={f.label}><td style={{ ...td, textAlign: 'left', paddingLeft: 14, fontSize: 12.5, fontFamily: /^(core|module)-/.test(f.label) ? 'monospace' : 'inherit' }}>{f.label}</td>{f.cells.map((cell, i) => <td key={i} style={td}>{cell}</td>)}</tr>
            ))}
          </Fragment>
        ))}</tbody>
      </table>
    </div>
  )
}
