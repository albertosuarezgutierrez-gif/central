'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ChatSesion from '@/components/ChatSesion'
import ConsumoProductos from '@/components/ConsumoProductos'
import AccesoPropiedad from '@/components/AccesoPropiedad'
import { photoSrc } from '@/lib/photo'

// ── Colores corporativos ialimp ─────────────────────────────────────────
const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

// ── Checklist por tipo de servicio ─────────────────────────────────────
const CHECKLIST_TPL: Record<string, any[]> = {"rotacion": [{"id": "r1", "label": "Cambiar sábanas y fundas", "critico": true}, {"id": "r2", "label": "Limpiar y desinfectar baños", "critico": true}, {"id": "r3", "label": "Limpiar cocina y electrodomésticos", "critico": true}, {"id": "r4", "label": "Barrer y fregar suelos", "critico": true}, {"id": "r5", "label": "Limpiar espejos y superficies", "critico": false}, {"id": "r6", "label": "Vaciar papeleras", "critico": false}, {"id": "r7", "label": "Reponer papel, jabón y gel", "critico": true}, {"id": "r8", "label": "Foto baño principal", "critico": true, "foto": true}, {"id": "r9", "label": "Foto dormitorio principal", "critico": true, "foto": true}, {"id": "r10", "label": "Foto cocina", "critico": false, "foto": true}], "particular": [{"id": "p1", "label": "Habitaciones: cambiar ropa de cama", "critico": false}, {"id": "p2", "label": "Baños: limpiar y desinfectar", "critico": true}, {"id": "p3", "label": "Salón: polvo y aspirar", "critico": false}, {"id": "p4", "label": "Cocina: limpiar superficies", "critico": true}, {"id": "p5", "label": "Barrer y fregar todos los suelos", "critico": true}, {"id": "p6", "label": "Vaciar papeleras", "critico": false}], "comunidad": [{"id": "c1", "label": "Portal: barrer y fregar", "critico": true}, {"id": "c2", "label": "Escaleras: barrer y fregar", "critico": true}, {"id": "c3", "label": "Limpiar buzones y pasamanos", "critico": false}, {"id": "c4", "label": "Limpiar cristales portal", "critico": false}, {"id": "c5", "label": "Papeleras y ceniceros", "critico": false}, {"id": "c6", "label": "Foto portal terminado", "critico": true, "foto": true}], "default": [{"id": "d1", "label": "Limpieza general", "critico": true}, {"id": "d2", "label": "Suelos", "critico": true}, {"id": "d3", "label": "Superficies", "critico": false}, {"id": "d4", "label": "Baños", "critico": true}, {"id": "d5", "label": "Foto final", "critico": false, "foto": true}]}

function getChecklist(tipo: string, existente: any[]|null) {
  if (existente?.length) return existente
  const tpl = CHECKLIST_TPL[tipo] || CHECKLIST_TPL.default
  return tpl.map(item => ({ ...item, hecho: false, foto_url: null }))
}

function fmtTime(t: string|null): string|null {
  if (!t) return null
  if (typeof t === 'string') return t.slice(0, 5)
  return null
}

// ── CSS global de la app ─────────────────────────────────────────────────
const APP_CSS = `
.l-app * { box-sizing: border-box; }
.l-app {
  min-height: 100dvh;
  background: #f1f5f9;
  font-family: 'Nunito', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Header ── */
.l-header {
  background: linear-gradient(160deg, var(--brand-primary) 0%, var(--brand-secondary) 100%);
  padding: 0;
  position: relative; overflow: hidden;
}
.l-header::before {
  content: ''; position: absolute; pointer-events: none;
  right: -20px; top: -30px; width: 160px; height: 160px;
  border-radius: 50%; background: rgba(255,255,255,.07);
}
.l-header-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: clamp(16px, 4vw, 22px) clamp(16px, 4vw, 22px) 14px;
}
.l-header-title {
  font-size: clamp(18px, 4.5vw, 22px);
  font-weight: 800; color: white; letter-spacing: -.02em;
}
.l-header-sub {
  font-size: 12px; color: rgba(255,255,255,.6);
  margin-top: 2px; text-transform: capitalize;
}
.l-avatar {
  width: clamp(38px, 9vw, 46px); height: clamp(38px, 9vw, 46px);
  border-radius: 13px; flex-shrink: 0;
  background: rgba(255,255,255,.18);
  border: 2px solid rgba(255,255,255,.28);
  display: flex; align-items: center; justify-content: center;
  font-size: clamp(16px, 4vw, 20px); font-weight: 800; color: white;
}
.l-kpis {
  display: grid; grid-template-columns: repeat(3,1fr);
  gap: 1px; background: rgba(255,255,255,.1);
}
.l-kpi { padding: clamp(10px, 3vw, 14px) 10px; text-align: center; background: rgba(0,0,0,.1); }
.l-kpi-n { font-size: clamp(20px, 5vw, 26px); font-weight: 800; color: white; line-height: 1; }
.l-kpi-l { font-size: 9px; color: rgba(255,255,255,.55); margin-top: 3px; text-transform: uppercase; letter-spacing: .05em; }

/* ── Fecha chips ── */
.l-dates {
  display: flex; gap: 7px;
  padding: clamp(10px, 3vw, 14px) clamp(14px, 4vw, 18px);
  overflow-x: auto; scrollbar-width: none;
}
.l-dates::-webkit-scrollbar { display: none; }
.l-date {
  flex-shrink: 0; padding: 7px clamp(12px, 3vw, 18px);
  border-radius: 20px; font-family: inherit;
  font-size: 13px; font-weight: 600; border: none; cursor: pointer;
  transition: all .18s;
}
.l-date.sel {
  background: var(--brand-primary); color: white;
  box-shadow: 0 3px 10px rgba(79,70,229,.35);
}
.l-date:not(.sel) {
  background: white; color: #64748b;
  box-shadow: 0 1px 3px rgba(0,0,0,.07);
}

/* ── Manual btn ── */
.l-manual-row {
  display: flex; justify-content: flex-end;
  padding: 6px clamp(14px, 4vw, 18px) 0;
}
.l-manual-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: white; color: var(--brand-primary);
  border: 1px solid #c7d2fe; border-radius: 20px;
  padding: 6px 14px; font-size: 11px; font-weight: 700;
  text-decoration: none; font-family: inherit;
  box-shadow: 0 1px 4px rgba(79,70,229,.1);
  transition: all .15s;
}
.l-manual-btn:hover { background: var(--brand-light); }

/* ── Lista sesiones ── */
.l-list { padding: clamp(10px, 3vw, 14px) clamp(14px, 4vw, 18px) 32px; display: flex; flex-direction: column; gap: 10px; }

/* ── Card sesión ── */
.l-card {
  background: white; border-radius: 16px;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(15,23,42,.06);
  padding: clamp(12px, 3vw, 16px);
  display: flex; align-items: flex-start; gap: 12px;
  cursor: pointer; transition: all .15s; width: 100%;
  text-align: left; font-family: inherit;
}
.l-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,.1); transform: translateY(-1px); }
.l-card.ok   { border-left-color: #10b981; }
.l-card.go   { border-left-color: var(--brand-primary); }
.l-card.pend { border-left-color: #e2e8f0; }
.l-card.prio { border-left-color: #dc2626; border-left-width: 5px; }

.l-card-icon {
  width: clamp(40px, 10vw, 48px); height: clamp(40px, 10vw, 48px);
  border-radius: 12px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: clamp(18px, 4.5vw, 22px);
}
.l-card.ok   .l-card-icon { background: #d1fae5; }
.l-card.go   .l-card-icon { background: var(--brand-light); }
.l-card.pend .l-card-icon { background: #f1f5f9; }

.l-card-title { font-size: clamp(13px, 3.5vw, 15px); font-weight: 700; color: #1e293b; margin-bottom: 2px; }
.l-card-client { font-size: 11px; color: #64748b; margin-bottom: 7px; }
.l-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.l-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 8px; border-radius: 20px;
  font-size: 11px; font-weight: 700;
}
.l-chip.time  { background: var(--brand-light); color: var(--brand-primary); }
.l-chip.warn  { background: #fffbeb; color: #b45309; }
.l-chip.pax   { background: #f1f5f9; color: #64748b; }
.l-chip.entra { background: #fee2e2; color: #dc2626; }

/* progreso inline */
.l-prog { margin-top: 9px; }
.l-prog-row { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 4px; }
.l-prog-row span:last-child { font-weight: 800; color: var(--brand-primary); }
.l-prog-bar { height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.l-prog-fill { height: 100%; background: var(--brand-primary); border-radius: 3px; transition: width .3s; }

.l-card-right { flex-shrink: 0; text-align: right; }
.l-status-done { font-size: clamp(22px, 6vw, 28px); }
.l-status-go {
  background: var(--brand-light); color: var(--brand-primary);
  font-size: 10px; font-weight: 800;
  padding: 5px 10px; border-radius: 8px;
  white-space: nowrap; letter-spacing: .03em;
}
.l-status-arr { font-size: 22px; color: #e2e8f0; }
.l-unread {
  background: #dc2626; color: white; border-radius: 50%;
  width: 20px; height: 20px; font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  margin-top: 5px; margin-left: auto;
}

/* ── Empty state ── */
.l-empty { text-align: center; padding: 56px 16px; color: #94a3b8; }
.l-empty-icon { font-size: 44px; margin-bottom: 12px; }
.l-empty-title { font-size: 16px; font-weight: 700; color: #334155; margin-bottom: 4px; }
`

// ── SesionCard — lista ────────────────────────────────────────────────────
function SesionCard({ s, onTap }: { s: any; onTap: () => void }) {
  const inicio  = fmtTime(s.hora_checkout) || fmtTime(s.hora_inicio) || fmtTime(s.hora_pactada)
  const limite  = fmtTime(s.hora_checkin_siguiente)
  const hecho   = s.completada !== undefined ? s.completada : !!s.completed_at
  const enCurso = !hecho && !!s.started_at

  // progreso checklist si está en curso
  const pct = s.checklist_data?.length
    ? Math.round(s.checklist_data.filter((i: any) => i.hecho).length / s.checklist_data.length * 100)
    : null

  const prioridad = !hecho && !!s.hora_checkin_siguiente
  const cls = hecho ? 'ok' : prioridad ? `${enCurso ? 'go' : 'pend'} prio` : enCurso ? 'go' : 'pend'
  const icon = ({ rotacion:'🏠', particular:'🏡', comunidad:'🏢', oficina:'💼' } as any)[s.tipo_servicio] || '🏠'

  return (
    <button className={`l-card ${cls}`} onClick={onTap}>
      <div className="l-card-icon">{icon}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div className="l-card-title">{s.property_name}</div>
        {s.cliente_nombre && <div className="l-card-client">{s.cliente_nombre}</div>}
        <div className="l-chips">
          {inicio && (
            <span className="l-chip time">
              🚪 {inicio}{limite ? ` → ${limite}` : ''}
            </span>
          )}
          {limite && !hecho && <span className="l-chip entra">🔴 Entra {limite}</span>}
          {s.alerta_ventana && <span className="l-chip warn">⚠️ Ventana ajustada</span>}
          {s.num_huespedes && <span className="l-chip pax">👥 {s.num_huespedes}</span>}
        </div>
        {enCurso && pct !== null && (
          <div className="l-prog">
            <div className="l-prog-row">
              <span>Progreso</span><span>{pct}%</span>
            </div>
            <div className="l-prog-bar">
              <div className="l-prog-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="l-card-right">
        {hecho   && <div className="l-status-done">✅</div>}
        {enCurso && <div className="l-status-go">EN CURSO</div>}
        {!hecho && !enCurso && <div className="l-status-arr">›</div>}
        {(s.unread_msgs > 0) && <div className="l-unread">{s.unread_msgs}</div>}
      </div>
    </button>
  )
}

// ── SesionDetalle (sin cambios en lógica, actualizados estilos) ──────────────
function SesionDetalle({ s, onBack, onUpdate, limpiadora }: { s: any; onBack: () => void; onUpdate: (s: any) => void; limpiadora: any }) {
  const [checklist, setChecklist] = useState<any[]>(() => getChecklist(s.tipo_servicio, s.checklist_data))
  const [incidencias, setIncidencias] = useState<any[]>(s.incidencias || [])
  const [showIncid, setShowIncid]     = useState(false)
  const [showChatGlobal, setShowChatGlobal] = useState(false)
  const [activeTab, setActiveTab]     = useState<'checklist'|'chat'>('checklist')
  const [unreadSesion, setUnreadSesion] = useState(0)
  const [fotoRef, setFotoRef]         = useState<string|null>(null)
  const [incDesc, setIncDesc]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [sesion, setSesion]           = useState(s)
  const [showConsumo, setShowConsumo] = useState(false)
  const [botesOk, setBotesOk]         = useState(false)
  const [analizandoBotes, setAnalizandoBotes] = useState(false)
  const fotoBotesRef                  = useRef<HTMLInputElement>(null)

  const hecho    = !!sesion.completed_at
  const enCurso  = !hecho && !!sesion.started_at
  const criticos = checklist.filter(i => i.critico)
  const todosCriticos = criticos.every(i => i.hecho && (!i.foto || i.foto_url))
  const pct = checklist.length > 0 ? Math.round((checklist.filter(i => i.hecho).length / checklist.length) * 100) : 0

  async function ficharEntrada() {
    setSaving(true)
    const r = await fetch(`/api/l/sesiones/${sesion.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'fichar_entrada' })
    })
    const d = await r.json()
    if (d.ok) { setSesion(d.sesion); onUpdate(d.sesion) }
    setSaving(false)
  }

  async function toggleItem(idx: number) {
    const nv = checklist.map((it, i) => i === idx ? { ...it, hecho: !it.hecho } : it)
    setChecklist(nv)
    await fetch(`/api/l/sesiones/${sesion.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'checklist', checklist_data: nv })
    })
  }

  async function completar() {
    if (!todosCriticos) { alert('Hay tareas críticas sin marcar'); return }
    setShowConsumo(true)
  }

  async function finalizarDefinitivo() {
    setSaving(true)
    const r = await fetch(`/api/l/sesiones/${sesion.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'completar', checklist_data: checklist })
    })
    const d = await r.json()
    if (d.ok) { setSesion(d.sesion); onUpdate(d.sesion) }
    setSaving(false); setShowConsumo(false)
  }

  async function añadirIncidencia() {
    if (!incDesc.trim()) return
    const nv = [...incidencias, { id: Date.now().toString(), desc: incDesc.trim(), creada_at: new Date().toISOString(), resuelta: false }]
    setIncidencias(nv); setIncDesc(''); setShowIncid(false)
    await fetch(`/api/l/sesiones/${sesion.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'incidencia', incidencias: nv })
    })
  }

  const inicio = fmtTime(sesion.hora_checkout) || fmtTime(sesion.hora_inicio) || fmtTime(sesion.hora_pactada)
  const limite = fmtTime(sesion.hora_checkin_siguiente)

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: "'Nunito', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.primary, padding: '0 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 14px' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>{sesion.property_name}</div>
            {sesion.cliente_nombre && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{sesion.cliente_nombre}</div>}
          </div>
          {hecho && <span style={{ fontSize: 28 }}>✅</span>}
        </div>
        {inicio && (
          <div style={{ background: 'rgba(255,255,255,0.12)', margin: '0 16px 16px', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>🚪 Checkout: {inicio}</span>
            {limite && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>🔑 Checkin: {limite}</span>}
          </div>
        )}
      </div>

      {(sesion.instrucciones_acceso || sesion.codigo_acceso || (sesion.archivos_acceso?.length > 0)) && (
        <div style={{ padding: '0 16px 4px' }}>
          <AccesoPropiedad propiedadId={sesion.propiedad_id} propiedadNombre={sesion.property_name} token="" instruccionesIniciales={sesion.instrucciones_acceso || ''} tipoAccesoInicial={sesion.tipo_acceso || 'llave'} codigoAccesoInicial={sesion.codigo_acceso || ''} archivosIniciales={sesion.archivos_acceso || []} soloLectura={true} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
        {sesion.direccion && (
          <a href={`https://maps.google.com/maps?q=${encodeURIComponent(sesion.direccion + ', Sevilla')}`} target="_blank" rel="noreferrer"
            style={{ flex: 1, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '9px 12px', borderRadius: 10, textDecoration: 'none', fontSize: 12, fontWeight: 700, textAlign: 'center' as const, display: 'block' }}>
            📍 Cómo llegar
          </a>
        )}
        <button onClick={() => setShowChatGlobal(v => !v)}
          style={{ flex: 1, background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '9px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          💬 Chat equipo
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {!enCurso && !hecho && (
          <button onClick={ficharEntrada} disabled={saving}
            style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: C.primary, color: 'white', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 16, boxShadow: '0 4px 12px rgba(79,70,229,0.3)', fontFamily: 'inherit' }}>
            {saving ? 'Fichando...' : '▶ Fichar entrada'}
          </button>
        )}

        {enCurso && (
          <div style={{ background: 'white', borderRadius: 12, padding: '12px 16px', marginBottom: 14, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Progreso</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.brand }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: C.bg, borderRadius: 4 }}>
              <div style={{ height: '100%', borderRadius: 4, background: pct === 100 ? C.ok : C.brand, width: `${pct}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {(enCurso || hecho) && (
          <div style={{ display: 'flex', background: 'white', borderRadius: 12, padding: 4, marginBottom: 14, border: `1px solid ${C.border}` }}>
            <button onClick={() => setActiveTab('checklist')}
              style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: activeTab === 'checklist' ? C.primary : 'transparent', color: activeTab === 'checklist' ? 'white' : C.muted, fontSize: 13, fontWeight: 700, transition: 'all 0.15s' }}>
              ✓ Checklist
            </button>
            <button onClick={() => { setActiveTab('chat'); setUnreadSesion(0) }}
              style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: activeTab === 'chat' ? C.primary : 'transparent', color: activeTab === 'chat' ? 'white' : C.muted, fontSize: 13, fontWeight: 700, transition: 'all 0.15s', position: 'relative' as const }}>
              💬 Chat{unreadSesion > 0 && <span style={{ position: 'absolute' as const, top: 4, right: 8, background: '#dc2626', color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadSesion}</span>}
            </button>
          </div>
        )}

        {activeTab === 'checklist' && (enCurso || hecho) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Checklist</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checklist.map((item, idx) => (
                <div key={item.id} style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', borderLeft: `3px solid ${item.hecho && (!item.foto || item.foto_url) ? C.ok : item.critico ? C.brand : C.border}` }}>
                  <button onClick={() => !hecho && toggleItem(idx)}
                    style={{ width: '100%', textAlign: 'left', border: 'none', cursor: hecho ? 'default' : 'pointer', background: 'transparent', padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'inherit' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: '2px solid', borderColor: item.hecho ? C.ok : item.critico ? C.brand : C.border, background: item.hecho ? C.okBg : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                      {item.hecho && (!item.foto || item.foto_url) ? '✓' : item.hecho ? '📷' : ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: item.critico ? 600 : 400, color: item.hecho ? C.muted : C.text, textDecoration: item.hecho && (!item.foto || item.foto_url) ? 'line-through' : 'none' }}>
                        {item.foto && '📷 '}{item.label}
                      </div>
                      {item.critico && !item.hecho && <span style={{ fontSize: 10, color: C.brand, fontWeight: 700 }}>CRÍTICO</span>}
                      {item.foto && item.hecho && !item.foto_url && <span style={{ fontSize: 10, color: C.warn, fontWeight: 700 }}>⚠ Falta foto obligatoria</span>}
                    </div>
                    {item.foto_referencia_url && (
                      <button onClick={e => { e.stopPropagation(); setFotoRef(item.foto_referencia_url) }}
                        style={{ background: C.light, border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: 11, color: C.brand, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                        Ver ✨
                      </button>
                    )}
                  </button>
                  {!hecho && item.foto && item.hecho && !item.foto_url && (
                    <div style={{ padding: '0 14px 12px' }}>
                      <label style={{ flex: 1, background: C.warnBg, border: `1px dashed ${C.warn}`, borderRadius: 8, padding: '8px', textAlign: 'center' as const, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.warn, display: 'block' }}>
                        📷 Subir foto
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                          onChange={async e => {
                            const file = e.target.files?.[0]; if (!file) return
                            const fd = new FormData(); fd.append('file', file); fd.append('sesion_id', sesion.id); fd.append('tipo', item.id)
                            const r = await fetch('/api/l/upload-photo', { method: 'POST', body: fd })
                            const d = await r.json()
                            if (d.url) {
                              const nv = checklist.map((it, i) => i === idx ? { ...it, foto_url: d.url } : it)
                              setChecklist(nv)
                              await fetch(`/api/l/sesiones/${sesion.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'checklist', checklist_data: nv }) })
                            }
                          }} />
                      </label>
                    </div>
                  )}
                  {item.foto_url && (
                    <div style={{ padding: '0 14px 12px' }}>
                      <img src={photoSrc(item.foto_url)} alt="foto" onClick={() => setFotoRef(item.foto_url)}
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: `2px solid ${C.ok}` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(enCurso || hecho) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Incidencias {incidencias.length > 0 ? `(${incidencias.length})` : ''}
              </div>
              {!hecho && (
                <button onClick={() => setShowIncid(true)}
                  style={{ background: C.light, border: 'none', color: C.brand, fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, cursor: 'pointer' }}>
                  + Añadir
                </button>
              )}
            </div>
            {incidencias.map((inc: any) => (
              <div key={inc.id} style={{ background: C.warnBg, border: `1px solid ${C.warn}33`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>⚠️ {inc.desc}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{new Date(inc.creada_at).toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            ))}
            {incidencias.length === 0 && !showIncid && (
              <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '12px 0' }}>Sin incidencias</div>
            )}
            {showIncid && (
              <div style={{ background: 'white', borderRadius: 12, padding: '14px', border: `1px solid ${C.border}` }}>
                <textarea value={incDesc} onChange={e => setIncDesc(e.target.value)} placeholder="Describe la incidencia..." rows={3}
                  style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px', fontSize: 14, resize: 'none', fontFamily: 'inherit', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setShowIncid(false)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'white', color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={añadirIncidencia} style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: C.warn, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Guardar incidencia</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (enCurso || hecho) && (
          <div style={{ height: '55vh', borderRadius: 12, overflow: 'hidden', marginBottom: 16, border: `1px solid ${C.border}` }}>
            <ChatSesion sesionId={s.id} apiBase="/api/l/chat" miNombre={limpiadora?.nombre || 'Yo'} miTipo="limpiadora" titulo={s.property_name} height="100%" compact />
          </div>
        )}

        {enCurso && (
          <button onClick={completar} disabled={saving || !todosCriticos}
            style={{ width: '100%', padding: '18px', borderRadius: 14, border: 'none', background: todosCriticos ? C.ok : C.border, color: 'white', fontSize: 16, fontWeight: 800, cursor: todosCriticos ? 'pointer' : 'not-allowed', boxShadow: todosCriticos ? '0 4px 12px rgba(22,163,74,0.3)' : 'none', fontFamily: 'inherit', marginTop: 8 }}>
            {saving ? 'Finalizando...' : todosCriticos ? '✅ Marcar como terminado' : `Faltan tareas críticas (${criticos.filter(i=>!i.hecho).length})`}
          </button>
        )}

        {hecho && !botesOk && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '16px', marginTop: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#92400e', marginBottom: 6 }}>📷 Foto de tus productos</div>
            <div style={{ fontSize: 13, color: '#78350f', marginBottom: 12, lineHeight: 1.5 }}>
              Pon tus botes juntos en el suelo y haz una foto. La IA registra cuánto queda de cada producto.
            </div>
            {analizandoBotes ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#92400e', fontSize: 13 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: '3px solid #fde68a', borderTop: '3px solid #d97706', animation: 'giro .8s linear infinite' }} />
                Analizando niveles…
                <style>{'.giro-anim{animation:giro .8s linear infinite}@keyframes giro{to{transform:rotate(360deg)}}'}</style>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => fotoBotesRef.current?.click()}
                  style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: '#d97706', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  📷 Hacer foto
                </button>
                <button onClick={() => setBotesOk(true)}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #fde68a', background: 'transparent', color: '#92400e', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Saltar
                </button>
              </div>
            )}
            <input ref={fotoBotesRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0]
                if (!file || !limpiadora?.id) return
                setAnalizandoBotes(true)
                try {
                  const reader = new FileReader()
                  reader.onload = async ev => {
                    const b64 = (ev.target?.result as string).split(',')[1]
                    const res = await fetch('/api/admin/ia/analizar-botes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        imagen_base64: b64,
                        media_type: file.type || 'image/jpeg',
                        limpiadora_id: limpiadora.id,
                        session_id: sesion.id,
                      })
                    })
                    const d = await res.json()
                    setAnalizandoBotes(false)
                    setBotesOk(true)
                    if (d.ok && d.productos_actualizados > 0) {
                      // Show brief confirmation
                      const niveles = (d.niveles || []).map((n: any) => `${n.nombre}: ${n.nivel_estimado}%`).join(', ')
                      alert(`✅ Niveles registrados: ${niveles}`)
                    } else {
                      setBotesOk(true) // skip silently if no match
                    }
                  }
                  reader.readAsDataURL(file)
                } catch { setAnalizandoBotes(false); setBotesOk(true) }
              }}
            />
          </div>
        )}

        {hecho && botesOk && (
          <div style={{ background: C.okBg, border: `1px solid ${C.ok}33`, borderRadius: 14, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
            <div style={{ fontWeight: 800, color: C.ok, fontSize: 16 }}>Limpieza completada</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>El propietario ha sido notificado</div>
          </div>
        )}
      </div>

      {showChatGlobal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', fontFamily: "'Nunito',sans-serif" }}>
          <div style={{ background: 'var(--brand-primary)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setShowChatGlobal(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 34, height: 34, borderRadius: 9, fontSize: 16, cursor: 'pointer' }}>←</button>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>💬 Chat del equipo</div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ChatSesion sesionId={null} apiBase="/api/l/chat" miNombre={limpiadora?.nombre || 'Yo'} miTipo="limpiadora" />
          </div>
        </div>
      )}

      {fotoRef && (
        <div onClick={() => setFotoRef(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 12 }}>Toca para cerrar</div>
          <img src={photoSrc(fotoRef)} alt="Referencia" style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 12 }} />
        </div>
      )}

      {showConsumo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', fontFamily: "'Nunito',sans-serif" }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '85vh', overflow: 'auto' }}>
            <div style={{ background: 'var(--brand-primary)', borderRadius: '20px 20px 0 0', padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'white', fontWeight: 800, fontSize: 16 }}>Productos usados</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>Anota lo que has utilizado</div>
              </div>
              <button onClick={() => setShowConsumo(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 34, height: 34, borderRadius: 9, fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ paddingTop: 16 }}>
              <ConsumoProductos sessionId={sesion.id} limpadoraId={limpiadora?.id} onGuardado={() => { setTimeout(finalizarDefinitivo, 800) }} onSaltar={finalizarDefinitivo} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PÁGINA PRINCIPAL ───────────────────────────────────────────────────────
function LimpiadoarasApp() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const sesionId     = searchParams.get('sesion')

  const [sesiones,   setSesiones]  = useState<any[]>([])
  const [sesionMap,  setSesionMap] = useState<Record<string, any>>({})
  const [loading,    setLoading]   = useState(true)
  const [fecha,      setFecha]     = useState(new Date().toISOString().split('T')[0])
  const [limpiadora, setLimpiadora] = useState<any>(null)

  useEffect(() => { cargarDia(fecha) }, [fecha])
  // Carga la limpiadora (avatar) y la marca de su empresa (white-label).
  useEffect(() => {
    fetch('/api/l/auth').then(r => r.json()).then(d => { if (d?.limpiadora) setLimpiadora(d.limpiadora) }).catch(() => {})
  }, [])

  // Sync back button: when sesionId disappears from URL, clear active detail
  const sesionActiva = sesionId ? sesionMap[sesionId] ?? null : null

  async function cargarDia(d: string) {
    setLoading(true)
    try {
      const r = await fetch(`/api/l/sesiones?date=${d}`)
      if (r.status === 401) { router.replace('/l/login'); return }
      const data = await r.json()
      const lista = data.sesiones || []
      setSesiones(lista)
      setSesionMap(prev => {
        const m = { ...prev }
        lista.forEach((s: any) => { m[s.id] = s })
        return m
      })
    } catch {}
    setLoading(false)
  }

  function abrirSesion(s: any) {
    setSesionMap(prev => ({ ...prev, [s.id]: s }))
    router.push(`/l?sesion=${s.id}`)
  }

  function onUpdate(sesionActualizada: any) {
    setSesiones(prev => prev.map(s => s.id === sesionActualizada.id ? sesionActualizada : s))
    setSesionMap(prev => ({ ...prev, [sesionActualizada.id]: sesionActualizada }))
  }

  if (sesionActiva) {
    return (
      <div style={limpiadora ? ({ display:'contents', ['--brand-primary' as any]: limpiadora.color_primario, ['--brand-secondary' as any]: limpiadora.color_secundario, ['--brand-light' as any]: limpiadora.color_light }) : { display:'contents' }}>
        <SesionDetalle s={sesionActiva} onBack={() => router.push('/l')} onUpdate={onUpdate} limpiadora={limpiadora} />
      </div>
    )
  }

  const completadas = sesiones.filter(s => !!s.completed_at).length
  const enCurso     = sesiones.filter(s => !s.completed_at && !!s.started_at).length
  const hoyLabel    = new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })
  const inicial     = limpiadora?.nombre?.[0] || '?'

  // Chips de fecha (ayer, hoy, mañana, +2, +3)
  const dateChips = [-1,0,1,2,3].map(offset => {
    const d = new Date(); d.setDate(d.getDate() + offset)
    const iso = d.toISOString().split('T')[0]
    const lbl = offset === -1 ? 'Ayer' : offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana'
              : d.toLocaleDateString('es-ES', { weekday:'short', day:'numeric' })
    return { iso, lbl }
  })

  return (
    <>
      <style>{APP_CSS}</style>
      <div className="l-app" style={limpiadora ? ({ ['--brand-primary' as any]: limpiadora.color_primario, ['--brand-secondary' as any]: limpiadora.color_secundario, ['--brand-light' as any]: limpiadora.color_light }) : undefined}>

        {/* Header */}
        <div className="l-header">
          <div className="l-header-top">
            <div>
              <LogoIalimp size={17} style={{ marginBottom:2, display:'inline-block' }} nombre={limpiadora?.marca_nombre} logoUrl={limpiadora?.logo_url} />
              <div className="l-header-title">Mis limpiezas</div>
              <div className="l-header-sub">{hoyLabel}</div>
            </div>
            <div className="l-avatar">{inicial}</div>
          </div>
          <div className="l-kpis">
            <div className="l-kpi">
              <div className="l-kpi-n">{sesiones.length}</div>
              <div className="l-kpi-l">Total</div>
            </div>
            <div className="l-kpi">
              <div className="l-kpi-n" style={{ color:'#86efac' }}>{completadas}</div>
              <div className="l-kpi-l">Hechas</div>
            </div>
            <div className="l-kpi">
              <div className="l-kpi-n" style={{ color:'#fcd34d' }}>{sesiones.length - completadas}</div>
              <div className="l-kpi-l">Pendientes</div>
            </div>
          </div>
        </div>

        {/* Selector de fecha */}
        <div className="l-dates">
          {dateChips.map(c => (
            <button key={c.iso} className={`l-date ${c.iso === fecha ? 'sel' : ''}`}
              onClick={() => setFecha(c.iso)}>
              {c.lbl}
            </button>
          ))}
        </div>

        {/* Manual btn */}
        <div className="l-manual-row">
          <a className="l-manual-btn"
            href="https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/property-access-files/publico/manual_limpiadora_v1.pdf"
            target="_blank" rel="noreferrer" download="Manual_IALIMP.pdf">
            📖 Manual
          </a>
        </div>

        {/* Lista */}
        <div className="l-list">
          {loading && (
            <div style={{ textAlign:'center', padding:'48px 0', color:'#94a3b8' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>⏳</div>
              Cargando...
            </div>
          )}
          {!loading && sesiones.length === 0 && (
            <div className="l-empty">
              <div className="l-empty-icon">☀️</div>
              <div className="l-empty-title">Sin limpiezas este día</div>
              <div>¡Descansa!</div>
            </div>
          )}
          {sesiones.map(s => (
            <SesionCard key={s.id} s={s} onTap={() => abrirSesion(s)} />
          ))}
        </div>

      </div>
    </>
  )
}

export default function LimpiadoarasAppWrapper() {
  return (
    <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#f1f5f9',color:'var(--brand-primary)',fontSize:32}}>⏳</div>}>
      <LimpiadoarasApp />
    </Suspense>
  )
}
