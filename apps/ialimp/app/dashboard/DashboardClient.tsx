'use client'
import LogoIalimp from '@/components/LogoIalimp'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NuevaLimpiezaModal from '@/components/NuevaLimpiezaModal'
import AlertasBadge from '@/components/AlertasBadge'

interface Props {
  empresa: any
  sesionesIniciales: any[]
  conexiones: any[]
  clientes: any[]
  limpiadoras: any[]
  today: string
  modulosOff?: string[]
}

// Módulo gateable por entrada de menú (el operador puede apagarlos desde el god-panel).
const NAV_MODULO: Record<string, string> = {
  '/admin/equipo': 'rrhh',
  '/admin/negocio': 'clientes',
  '/admin/materiales': 'stock',
  '/admin/contabilidad': 'contabilidad',
  '/admin/concursos': 'concursos',
}

const TIPO_COLOR: Record<string,string> = {
  rotacion:'#4f46e5', profunda:'#0ea5e9', comunidad:'#10b981',
  obra:'#f59e0b', mantenimiento:'#64748b',
}
const TIPO_ICON: Record<string,string> = {
  rotacion:'🔄', profunda:'🧽', comunidad:'🏢', obra:'🏗️', mantenimiento:'🔧',
}

const NAV = [
  { href:'/dashboard',           icon:'🏠', label:'Inicio'        },
  { href:'/admin/operaciones',   icon:'🗃️', label:'Operaciones'   },
  { href:'/admin/equipo',        icon:'👥', label:'Equipo'        },
  { href:'/admin/chat',          icon:'💬', label:'Chat equipo'   },
  { href:'/admin/negocio',       icon:'💼', label:'Negocio'       },
  { href:'/admin/materiales',    icon:'📦', label:'Materiales'    },
  { href:'/admin/configuracion', icon:'⚙️', label:'Configuración' },
  { href:'/admin/contabilidad',  icon:'📊', label:'Contabilidad'  },
  { href:'/admin/concursos',     icon:'🏛️', label:'Concursos'     },
  { href:'/admin/asistente',    icon:'🤖', label:'Asistente IA'  },
]

export default function DashboardClient({
  empresa, sesionesIniciales, conexiones, clientes, limpiadoras, today, modulosOff = []
}: Props) {
  const router = useRouter()
  const nav = NAV.filter(i => { const m = NAV_MODULO[i.href]; return !m || !modulosOff.includes(m) })
  const [sesiones,    setSesiones]   = useState<any[]>(sesionesIniciales)
  const [tab,         setTab]        = useState<'hoy'|'pms'>('hoy')
  const [showNueva,   setShowNueva]  = useState(false)
  const [fecha,       setFecha]      = useState(today)
  const [sideOpen,    setSideOpen]   = useState(false)   // móvil: drawer lateral
  const [sideCollapsed, setSideCollapsed] = useState(false) // desktop: sidebar mini
  const [briefing, setBriefing]   = useState<string|null>(null)
  const [briefingKpis, setBriefingKpis] = useState<any>(null)
  const [loadingBriefing, setLoadingBriefing] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState<'all'|'pendiente'|'en_curso'|'hecha'>('all')
  const [asignando,    setAsignando]    = useState(false)
  const [resAsign,     setResAsign]     = useState<{asignadas:number;fallidas:number;detalle:any[]}|null>(null)
  const [verDetAsign,  setVerDetAsign]  = useState(false)
  const [sheet,        setSheet]        = useState<any|null>(null)   // sesión en reasignación
  const [busyId,       setBusyId]       = useState<string|null>(null)
  const [buscaLimp,    setBuscaLimp]    = useState('')               // filtro de limpiadora en el sheet
  const [toast,        setToast]        = useState<{msg:string;tipo:'ok'|'warn'|'error'}|null>(null)
  const [editSesion,   setEditSesion]   = useState<any|null>(null)
  const [soloSinAsignar, setSoloSinAsignar] = useState(false)

  function showToast(msg: string, tipo: 'ok'|'warn'|'error' = 'ok') {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  const pendientes  = sesiones.filter(s => !s.started_at)
  const enCurso     = sesiones.filter(s => s.started_at && !s.completed_at)
  const completadas = sesiones.filter(s => s.completed_at)

  // Prioridad: ventana ajustada arriba → con entrada de huésped → quien entra antes → por hora
  // hora_* puede llegar como Date (time de Postgres vía SSR), ISO string (API) o "HH:MM:SS" (text).
  const hhmm = (v: any): string => {
    if (!v) return ''
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(11, 16)
    const s = String(v)
    return (s.includes('T') ? s.split('T')[1] : s).slice(0, 5)
  }
  function prioridad(a: any, b: any) {
    const am = a.orden_manual ?? null, bm = b.orden_manual ?? null
    if (am !== null || bm !== null) {
      if (am === null) return 1
      if (bm === null) return -1
      if (am !== bm) return am - bm
    }
    const au = a.urgente_manual ? 0 : 1, bu = b.urgente_manual ? 0 : 1
    if (au !== bu) return au - bu
    const av = a.alerta_ventana ? 0 : 1, bv = b.alerta_ventana ? 0 : 1
    if (av !== bv) return av - bv
    const ae = a.hora_checkin_siguiente ? 0 : 1, be = b.hora_checkin_siguiente ? 0 : 1
    if (ae !== be) return ae - be
    const ac = hhmm(a.hora_checkin_siguiente) || '99:99', bc = hhmm(b.hora_checkin_siguiente) || '99:99'
    if (ac !== bc) return ac < bc ? -1 : 1
    return (hhmm(a.hora_inicio) || '99:99').localeCompare(hhmm(b.hora_inicio) || '99:99')
  }

  // minutos desde "HH:MM" (helper para detectar solapamientos)
  const minsDe = (v: any): number | null => {
    const t = hhmm(v)
    if (!t) return null
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }

  const sinAsignar = sesiones.filter(s => !s.limpiadora_id && !s.completed_at)

  const sesionesFiltradas = (filtroEstado === 'all'      ? sesiones
    : filtroEstado === 'pendiente' ? pendientes
    : filtroEstado === 'en_curso'  ? enCurso
    : completadas)
    .filter(s => !soloSinAsignar || (!s.limpiadora_id && !s.completed_at))
    .slice().sort(prioridad)

  async function cargarBriefing() {
    setLoadingBriefing(true)
    try {
      const r = await fetch('/api/admin/ia/briefing')
      const d = await r.json()
      if (d.ok) {
        setBriefing(d.resumen)
        setBriefingKpis(d.kpis)
      }
    } finally {
      setLoadingBriefing(false)
    }
  }

  async function asignarAhora() {
    setAsignando(true)
    try {
      const r = await fetch('/api/admin/auto-assign')
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Error al asignar')
      setResAsign({
        asignadas: d.asignadas ?? 0,
        fallidas:  d.fallidas ?? 0,
        detalle:   (d.detalle ?? []).filter((x: any) => x.asignada),
      })
      // Refrescar rejilla + KPIs (derivan de sesiones)
      const res  = await fetch('/api/admin/sesiones?date=' + fecha)
      const data = await res.json()
      setSesiones(data.sesiones || [])
    } catch (e: any) {
      alert(e.message || 'No se pudo asignar')
    } finally {
      setAsignando(false)
    }
  }

  async function cambiarFecha(f: string) {
    setFecha(f)
    const res  = await fetch('/api/admin/sesiones?date=' + f)
    const data = await res.json()
    setSesiones(data.sesiones || [])
  }

  function onSesionCreada(sesion: any) {
    if (sesion.session_date === fecha)
      setSesiones(s => [...s, { ...sesion, limpiadora_nombre: null, cliente_nombre: null }])
  }

  async function eliminarSesion(id: string) {
    if (!confirm('¿Eliminar esta limpieza?')) return
    const prev = sesiones
    setSesiones(s => s.filter(x => x.id !== id))   // optimista
    try {
      const res = await fetch('/api/admin/sesiones/' + id, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSesiones(prev)
        showToast(d.error || 'No se pudo eliminar', 'error')
        return
      }
      showToast('Limpieza eliminada', 'ok')
    } catch { setSesiones(prev); showToast('Error de red', 'error') }
  }

  // Reasignar limpiadora desde Inicio — update optimista, sin recarga
  async function reasignar(sessionId: string, limpiadoraId: string) {
    const prev = sesiones
    const limp = limpiadoras.find((l: any) => l.id === limpiadoraId)
    setSesiones(ss => ss.map(s => s.id === sessionId
      ? { ...s, limpiadora_id: limpiadoraId || null, limpiadora_nombre: limp ? limp.nombre : null }
      : s))
    setSheet(null)
    setBuscaLimp('')
    setBusyId(sessionId)
    try {
      const r = await fetch('/api/admin/sesiones/' + sessionId, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limpiadora_id: limpiadoraId || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setSesiones(prev); showToast(d.error || 'No se pudo reasignar', 'error'); return }
      if (limpiadoraId) {
        showToast('Reasignada a ' + (limp?.nombre || ''), 'ok')
        avisarSolapamiento(sessionId, limpiadoraId)
      }
      else showToast('Limpiadora quitada · el auto-asignador (16:00) podría reasignarla', 'warn')
    } catch { setSesiones(prev); showToast('Error de red', 'error') }
    finally { setBusyId(null) }
  }

  // Aviso (no bloqueante) de solapamiento: misma limpiadora con otra sesión no completada
  // a menos de 90 min de la sesión indicada.
  function avisarSolapamiento(sessionId: string, limpiadoraId: string) {
    const s = sesiones.find(x => x.id === sessionId)
    const min = s ? minsDe(s.hora_inicio) : null
    if (min == null) return
    const limp = limpiadoras.find((l: any) => l.id === limpiadoraId)
    const choca = sesiones.some(o => o.id !== sessionId && o.limpiadora_id === limpiadoraId
      && !o.completed_at && (() => { const m = minsDe(o.hora_inicio); return m != null && Math.abs(m - min) < 90 })())
    if (choca) showToast('⚠️ ' + (limp?.nombre || 'Limpiadora') + ' ya tiene otra limpieza cerca de esa hora', 'warn')
  }

  // ── Editar/reordenar/duplicar (update optimista + toast) ──
  function onSesionActualizada(s: any) {
    const limp = limpiadoras.find((l: any) => l.id === s.limpiadora_id)
    setSesiones(prev => {
      // Si se movió de día, quitarla de la lista actual
      if (s.session_date && s.session_date !== fecha) return prev.filter(x => x.id !== s.id)
      return prev.map(x => x.id === s.id
        ? { ...x, ...s,
            limpiadora_nombre: s.limpiadora_id ? (limp?.nombre ?? x.limpiadora_nombre ?? null) : null,
            cliente_nombre:    s.cliente_nombre ?? x.cliente_nombre ?? null }
        : x)
    })
    if (s.session_date && s.session_date !== fecha) showToast('Movida a ' + s.session_date, 'ok')
    else { showToast('Limpieza actualizada', 'ok'); if (s.limpiadora_id) avisarSolapamiento(s.id, s.limpiadora_id) }
  }

  function onSesionEliminada(id: string) {
    setSesiones(prev => prev.filter(x => x.id !== id))
    showToast('Limpieza eliminada', 'ok')
  }

  async function moverDia(s: any, dias: number) {
    const base = new Date((String(s.session_date).slice(0, 10) || fecha) + 'T12:00:00')
    base.setDate(base.getDate() + dias)
    const nueva = base.toISOString().slice(0, 10)
    const prev = sesiones
    if (nueva !== fecha) setSesiones(ss => ss.filter(x => x.id !== s.id))  // optimista
    try {
      const r = await fetch('/api/admin/sesiones/' + s.id, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: nueva }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setSesiones(prev); showToast(d.error || 'No se pudo mover', 'error'); return }
      showToast(dias > 0 ? 'Movida a mañana' : 'Movida a hoy', 'ok')
    } catch { setSesiones(prev); showToast('Error de red', 'error') }
  }

  async function toggleUrgente(s: any) {
    const nuevo = !s.urgente_manual
    const prev = sesiones
    setSesiones(ss => ss.map(x => x.id === s.id ? { ...x, urgente_manual: nuevo } : x))  // optimista
    try {
      const r = await fetch('/api/admin/sesiones/' + s.id, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urgente_manual: nuevo }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setSesiones(prev); showToast(d.error || 'No se pudo guardar', 'error'); return }
      showToast(nuevo ? '🔥 Marcada urgente' : 'Urgente quitado', 'ok')
    } catch { setSesiones(prev); showToast('Error de red', 'error') }
  }

  async function mover(s: any, dir: -1 | 1) {
    const lista = sesionesFiltradas
    const idx = lista.findIndex(x => x.id === s.id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= lista.length) return
    const reordenada = lista.slice()
    const tmp = reordenada[idx]; reordenada[idx] = reordenada[j]; reordenada[j] = tmp
    const ids = reordenada.map(x => x.id)
    const ordenById: Record<string, number> = {}
    ids.forEach((id, i) => { ordenById[id] = i })
    const prev = sesiones
    setSesiones(ss => ss.map(x => x.id in ordenById ? { ...x, orden_manual: ordenById[x.id] } : x))  // optimista
    try {
      const r = await fetch('/api/admin/sesiones/reordenar', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: fecha, orden: ids }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setSesiones(prev); showToast(d.error || 'No se pudo reordenar', 'error'); return }
    } catch { setSesiones(prev); showToast('Error de red', 'error') }
  }

  async function ordenAutomatico() {
    const prev = sesiones
    setSesiones(ss => ss.map(x => ({ ...x, orden_manual: null })))  // optimista
    try {
      const r = await fetch('/api/admin/sesiones/reordenar', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: fecha, reset: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setSesiones(prev); showToast(d.error || 'No se pudo restaurar', 'error'); return }
      showToast('Orden automático restaurado', 'ok')
    } catch { setSesiones(prev); showToast('Error de red', 'error') }
  }

  async function duplicar(s: any) {
    try {
      const r = await fetch('/api/admin/sesiones', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id:    s.cliente_id,
          propiedad_id:  s.propiedad_id,
          property_name: s.property_name,
          session_date:  fecha,
          tipo_servicio: s.tipo_servicio,
          notas:         s.notas || null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showToast(d.error || 'No se pudo duplicar', 'error'); return }
      setSesiones(ss => [...ss, { ...d.sesion,
        limpiadora_nombre: null, cliente_nombre: s.cliente_nombre ?? null }])
      showToast('Limpieza duplicada', 'ok')
      setEditSesion({ ...d.sesion, cliente_nombre: s.cliente_nombre, property_name: s.property_name })
    } catch { showToast('Error de red', 'error') }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  // Cerrar drawer al hacer resize a desktop
  useEffect(() => {
    const fn = () => { if (window.innerWidth >= 1024) setSideOpen(false) }
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  /* ───── helpers de estado ───── */
  const statusCls = (s: any) =>
    s.completed_at ? 'ia-pill ia-pill-green' :
    s.started_at   ? 'ia-pill ia-pill-indigo' :
                     'ia-pill ia-pill-gray'
  const statusLbl = (s: any) =>
    s.completed_at ? '✓ Hecha' : s.started_at ? '⟳ En curso' : '○ Pendiente'

  /* ───── sidebar content ───── */
  const SidebarContent = ({ collapsed }: { collapsed?: boolean }) => (
    <div style={{
      display:'flex', flexDirection:'column', height:'100%',
      fontFamily:"'Nunito',sans-serif",
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px 20px 18px',
        borderBottom:'1px solid #e2e8f0',
        marginBottom:12, textAlign: collapsed ? 'center' : 'left',
      }}>
        <div style={{
          fontFamily:"'Nunito',sans-serif", fontSize: collapsed ? 18 : 20,
          fontWeight:800, color:'var(--brand-primary)', letterSpacing:'-.01em',
        }}>
          {collapsed ? 'ia' : 'ialimp'}
        </div>
        {!collapsed && (
          <>
            <div style={{fontSize:10,color:'#94a3b8',letterSpacing:'.1em',textTransform:'uppercase',marginTop:2}}>
              Gestión limpieza
            </div>
            <div style={{fontSize:11,color:'var(--brand-secondary)',fontWeight:600,marginTop:6}}>
              {empresa.nombre}
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav style={{flex:1,overflowY:'auto',padding:'0 8px'}}>
        {!collapsed && (
          <div style={{fontSize:9,color:'#94a3b8',letterSpacing:'.12em',textTransform:'uppercase',padding:'0 10px',marginBottom:4}}>
            Módulos
          </div>
        )}
        {nav.map(item => (
          <a key={item.href} href={item.href} style={{
            display:'flex', alignItems:'center',
            gap: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px 0' : '9px 10px',
            borderRadius:10, color:'#475569',
            fontSize:13, fontWeight:500, textDecoration:'none',
            marginBottom:1, transition:'all .15s',
          }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='var(--brand-light)';(e.currentTarget as HTMLElement).style.color='var(--brand-primary)'}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';(e.currentTarget as HTMLElement).style.color='#475569'}}>
            <div style={{
              width:28,height:28,borderRadius:8,
              background:'var(--brand-light)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:14,flexShrink:0,
            }}>
              {item.icon}
            </div>
            {!collapsed && <span>{item.label}</span>}
          </a>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: collapsed ? '14px 0' : '14px 16px',
        borderTop:'1px solid #e2e8f0',
        display:'flex', alignItems:'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap:8,
      }}>
        {!collapsed && (
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{
              width:30,height:30,borderRadius:9,background:'var(--brand-primary)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:13,fontWeight:800,color:'white',flexShrink:0,
            }}>
              {empresa.nombre?.[0] || 'E'}
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:'#1e1b4b'}}>
                {empresa.nombre}
              </div>
              <div style={{fontSize:9,color:'#94a3b8'}}>
                {empresa.plan || 'starter'}
              </div>
            </div>
          </div>
        )}
        <button onClick={logout} title="Cerrar sesión" style={{
          background:'#f1f5f9',border:'none',borderRadius:8,
          width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',
          cursor:'pointer',fontSize:14,color:'#64748b',flexShrink:0,
          transition:'background .15s',
        }}
        onMouseEnter={e=>(e.currentTarget.style.background='rgba(239,68,68,.15)')}
        onMouseLeave={e=>(e.currentTarget.style.background='#f1f5f9')}>
          🚪
        </button>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        .dash-root {
          min-height: 100dvh;
          background: #f1f5f9;
          font-family: 'Nunito', -apple-system, sans-serif;
          display: flex;
        }

        /* ── Sidebar desktop ── */
        .dash-sidebar {
          width: 220px;
          background: #ffffff;
          border-right: 1px solid #e2e8f0;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          height: 100dvh;
          overflow: hidden;
          transition: width .2s ease;
          z-index: 20;
        }
        .dash-sidebar.collapsed { width: 56px; }

        /* tablet: ocultar sidebar, usar drawer */
        @media (max-width: 1023px) {
          .dash-sidebar { display: none; }
          .dash-sidebar.mobile-open {
            display: flex;
            position: fixed;
            left: 0; top: 0;
            width: 240px;
            height: 100dvh;
            z-index: 100;
            box-shadow: 4px 0 32px rgba(15,23,42,.15);
          }
        }

        /* ── Overlay móvil ── */
        .dash-overlay {
          display: none;
          position: fixed; inset: 0;
          background: rgba(0,0,0,.5);
          z-index: 99;
          backdrop-filter: blur(2px);
        }
        @media (max-width: 1023px) {
          .dash-overlay.active { display: block; }
        }

        /* ── Main ── */
        .dash-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }

        /* ── Topbar ── */
        .dash-topbar {
          background: white;
          border-bottom: 1px solid #e2e8f0;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .dash-topbar-left { display: flex; align-items: center; gap: 10px; min-width: 0; }

        .dash-hamburger {
          width: 36px; height: 36px; border-radius: 10px;
          border: 1px solid #e2e8f0; background: white;
          display: none; align-items: center; justify-content: center;
          font-size: 18px; cursor: pointer; flex-shrink: 0;
        }
        @media (max-width: 1023px) { .dash-hamburger { display: flex; } }

        .dash-collapse-btn {
          width: 28px; height: 28px; border-radius: 8px;
          color: #64748b; font-size: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s;
          position: absolute; bottom: 60px; right: -14px;
          box-shadow: 0 2px 8px rgba(15,23,42,.15);
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 50%;
          width: 26px; height: 26px;
        }
        @media (max-width: 1023px) { .dash-collapse-btn { display: none; } }

        .topbar-title {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(15px, 3vw, 18px);
          font-weight: 800;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .topbar-date { font-size: 12px; color: #64748b; display: none; }
        @media (min-width: 640px) { .topbar-date { display: block; } }

        .topbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        .bell-btn {
          width: 36px; height: 36px; border-radius: 10px;
          border: 1px solid #e2e8f0; background: white;
          font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          position: relative;
        }

        .add-btn {
          background: var(--brand-primary); color: white; border: none;
          border-radius: 10px; padding: 8px 14px;
          font-family: inherit; font-size: 13px; font-weight: 700;
          cursor: pointer; white-space: nowrap;
          box-shadow: 0 3px 10px rgba(79,70,229,.3);
          display: flex; align-items: center; gap: 6px;
          transition: all .15s;
        }
        .add-btn:hover { background: var(--brand-primary); transform: translateY(-1px); }
        .add-btn-label { display: none; }
        @media (min-width: 480px) { .add-btn-label { display: inline; } }

        /* ── Content ── */
        .dash-content { padding: clamp(14px, 3vw, 24px); flex: 1; }

        /* ── KPI grid ── */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: clamp(8px, 2vw, 14px);
          margin-bottom: clamp(14px, 3vw, 20px);
        }
        .kpi-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: clamp(12px, 2.5vw, 18px) clamp(14px, 3vw, 20px);
          box-shadow: 0 1px 3px rgba(15,23,42,.06);
          text-align: center;
        }
        .kpi-num {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(26px, 5vw, 34px);
          font-weight: 800;
          line-height: 1;
        }
        .kpi-lbl { font-size: clamp(10px, 1.5vw, 12px); color: #64748b; margin-top: 4px; font-weight: 600; }

        /* ── Date picker + button row ── */
        .date-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }
        .date-input {
          flex: 1;
          min-width: 140px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 9px 12px;
          font-family: inherit;
          font-size: 13px;
          background: white;
          outline: none;
          color: #0f172a;
          transition: border-color .15s;
        }
        .date-input:focus { border-color: #818cf8; }

        /* ── Tabs ── */
        .tabs { display: flex; gap: 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 16px; }
        .tab-btn {
          padding: 10px 16px; border: none; background: transparent;
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          font-family: inherit; font-size: 13px; font-weight: 600;
          color: #94a3b8; cursor: pointer; transition: all .15s;
          display: flex; align-items: center; gap: 6px;
        }
        .tab-btn.active { border-bottom-color: var(--brand-primary); color: var(--brand-primary); font-weight: 700; }
        .tab-count {
          background: var(--brand-light); color: var(--brand-primary);
          font-size: 10px; font-weight: 800;
          padding: 1px 6px; border-radius: 20px;
        }

        /* ── Session card ── */
        .ses-card {
          background: white;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          border-left: 4px solid transparent;
          box-shadow: 0 1px 3px rgba(15,23,42,.06);
          padding: clamp(12px, 3vw, 16px);
          margin-bottom: 10px;
          transition: box-shadow .15s, transform .15s;
          cursor: default;
        }
        .ses-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,.1); transform: translateY(-1px); }

        .ses-row { display: flex; align-items: flex-start; gap: 10px; }
        .ses-icon {
          width: 42px; height: 42px; border-radius: 11px;
          flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px;
          background: var(--brand-light);
        }
        .ses-title { font-size: clamp(13px, 2.5vw, 15px); font-weight: 700; color: #0f172a; margin-bottom: 2px; }
        .ses-sub   { font-size: 11px; color: #64748b; margin-bottom: 6px; }
        .ses-chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .ses-chip  {
          display: inline-flex; align-items: center; gap: 3px;
          padding: 3px 8px; border-radius: 20px;
          font-size: 11px; font-weight: 600;
        }
        .ses-chip-btn {
          border: 1px solid transparent; cursor: pointer; font-family: inherit;
          transition: filter .12s ease;
        }
        .ses-chip-btn:hover { filter: brightness(.96); }
        .ses-chip-btn:disabled { opacity: .6; cursor: default; }

        /* ── Botones de acción de la tarjeta ── */
        .ses-act {
          display: inline-flex; align-items: center; gap: 3px;
          padding: 4px 9px; border-radius: 8px;
          border: 1px solid #e2e8f0; background: #f8fafc; color: #475569;
          font-family: inherit; font-size: 11px; font-weight: 700;
          cursor: pointer; white-space: nowrap; transition: filter .12s ease, background .12s;
        }
        .ses-act:hover { background: var(--brand-light); color: var(--brand-primary); }

        /* ── Bottom-sheet de asignación ── */
        .sheet-backdrop {
          position: fixed; inset: 0; background: rgba(15,23,42,.45);
          z-index: 100; display: flex; align-items: flex-end; justify-content: center;
        }
        .sheet {
          background: #fff; width: 100%; max-width: 480px;
          border-radius: 18px 18px 0 0; padding: 14px 16px calc(16px + env(safe-area-inset-bottom, 0px));
          box-shadow: 0 -8px 30px rgba(0,0,0,.22); max-height: 72vh; overflow: auto;
          animation: sheetUp .18s ease;
        }
        @keyframes sheetUp { from { transform: translateY(24px); opacity: .5 } to { transform: none; opacity: 1 } }
        .sheet-handle { width: 40px; height: 4px; border-radius: 4px; background: #cbd5e1; margin: 0 auto 12px; }
        .sheet-list { display: flex; flex-direction: column; gap: 4px; }
        .sheet-item {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          width: 100%; text-align: left; background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 10px; padding: 11px 12px; font-size: 14px; font-weight: 600;
          color: #1e293b; cursor: pointer; font-family: inherit;
        }
        .sheet-item:hover { background: var(--brand-light); }
        .sheet-item:disabled { opacity: .6; cursor: default; }
        .sheet-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
        .sheet-check { color: #16a34a; font-weight: 800; }

        /* ── Toast ── */
        .toast {
          position: fixed; bottom: 78px; left: 50%; transform: translateX(-50%);
          z-index: 120; padding: 11px 16px; border-radius: 10px;
          font-size: 13px; font-weight: 700; color: #fff; text-align: center;
          max-width: 88%; box-shadow: 0 8px 24px rgba(0,0,0,.2);
        }
        .toast-ok { background: #16a34a; }
        .toast-warn { background: #d97706; }
        .toast-error { background: #dc2626; }

        /* ── PMS card ── */
        .pms-card {
          background: white; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 14px 16px; margin-bottom: 8px;
          display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 1px 3px rgba(15,23,42,.06);
        }

        /* ── Bottom nav móvil ── */
        .bottom-nav {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: white;
          border-top: 1px solid #e2e8f0;
          padding: 8px 0 env(safe-area-inset-bottom, 8px);
          z-index: 50;
          box-shadow: 0 -4px 20px rgba(15,23,42,.1);
        }
        .bottom-nav-inner {
          display: flex;
          justify-content: space-around;
          align-items: center;
          max-width: 480px;
          margin: 0 auto;
        }
        .bottom-nav-item {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          padding: 4px 8px; border-radius: 10px; border: none; background: transparent;
          cursor: pointer; color: #94a3b8; font-family: inherit; transition: color .15s;
          min-width: 48px;
        }
        .bottom-nav-item.active { color: var(--brand-primary); }
        .bottom-nav-item span:first-child { font-size: 20px; }
        .bottom-nav-item span:last-child  { font-size: 9px; font-weight: 700; letter-spacing: .02em; }

        @media (max-width: 767px) {
          .bottom-nav { display: block; }
          .dash-content { padding-bottom: 80px; }
        }
      `}</style>

      <div className="dash-root">

        {/* ── Overlay móvil ── */}
        <div
          className={`dash-overlay ${sideOpen ? 'active' : ''}`}
          onClick={() => setSideOpen(false)}
        />

        {/* ── Sidebar ── */}
        <div className={`dash-sidebar ${sideCollapsed ? 'collapsed' : ''} ${sideOpen ? 'mobile-open' : ''}`}
          style={{ position: 'relative' }}>
          <SidebarContent collapsed={sideCollapsed} />
          {/* Botón collapse desktop */}
          <button
            className="dash-collapse-btn"
            onClick={() => setSideCollapsed(v => !v)}
            title={sideCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {sideCollapsed ? '›' : '‹'}
          </button>
        </div>

        {/* ── Main ── */}
        <div className="dash-main">

          {/* Topbar */}
          <div className="dash-topbar">
            <div className="dash-topbar-left">
              <button className="dash-hamburger" onClick={() => setSideOpen(v => !v)}>☰</button>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {/* Logo ialimp */}
                <div style={{
                  fontFamily:"'Nunito', 'Nunito', sans-serif",
                  fontSize:22, fontWeight:800, letterSpacing:'-.02em',
                  color:'#1e1b4b', lineHeight:1,
                }}>
                  ia<span style={{ color:'var(--brand-primary)' }}>limp</span>
                </div>
                <div style={{ width:1, height:16, background:'#e2e8f0' }} />
                <div style={{ fontSize:11, color:'#94a3b8', fontWeight:500 }}>{empresa.nombre}</div>
              </div>
            </div>
            <div className="topbar-actions">
              <AlertasBadge />
              <button className="add-btn" onClick={() => setShowNueva(true)}>
                ＋<span className="add-btn-label">Nueva limpieza</span>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="dash-content">

            {/* Widget Briefing IA */}
            <div style={{
              background: briefing ? 'var(--brand-light)' : 'white',
              border: '1px solid #c7d2fe',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              boxShadow: '0 1px 3px rgba(79,70,229,0.08)'
            }}>
              <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>🤖</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {briefing ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Briefing del día ✨
                    </div>
                    <p style={{ fontSize: 13, color: '#1e1b4b', lineHeight: 1.6, margin: 0 }}>{briefing}</p>
                    {briefingKpis && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        {briefingKpis.alertas_pendientes > 0 && (
                          <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>⚠️ {briefingKpis.alertas_pendientes} alertas</span>
                        )}
                        {briefingKpis.quejas_pendientes > 0 && (
                          <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>🔴 {briefingKpis.quejas_pendientes} quejas</span>
                        )}
                        {briefingKpis.productos_bajo_stock > 0 && (
                          <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 600 }}>📦 {briefingKpis.productos_bajo_stock} stock bajo</span>
                        )}
                        {briefingKpis.sesiones_hoy_sin > 0 && (
                          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>⚡ {briefingKpis.sesiones_hoy_sin} sin asignar</span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e1b4b' }}>Briefing diario con IA</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Resumen del estado del equipo y operaciones</div>
                    </div>
                    <button
                      onClick={cargarBriefing}
                      disabled={loadingBriefing}
                      style={{
                        marginLeft: 'auto', flexShrink: 0,
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        background: loadingBriefing ? '#e2e8f0' : 'var(--brand-primary)',
                        color: loadingBriefing ? '#94a3b8' : 'white',
                        fontSize: 12, fontWeight: 700,
                        cursor: loadingBriefing ? 'not-allowed' : 'pointer'
                      }}>
                      {loadingBriefing ? '⏳ Generando...' : '✨ Generar'}
                    </button>
                  </div>
                )}
                {briefing && (
                  <button
                    onClick={cargarBriefing}
                    disabled={loadingBriefing}
                    style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--brand-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    {loadingBriefing ? '⏳ Actualizando...' : '🔄 Actualizar'}
                  </button>
                )}
              </div>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
              {[
                { key:'pendiente' as const, count:pendientes.length,  color:'#f59e0b', label:'Pendientes' },
                { key:'en_curso'  as const, count:enCurso.length,     color:'var(--brand-primary)', label:'En curso'   },
                { key:'hecha'     as const, count:completadas.length, color:'#10b981', label:'Hechas'     },
              ].map(({ key, count, color, label }) => {
                const active = filtroEstado === key
                return (
                  <div
                    key={key}
                    className="kpi-card"
                    onClick={() => {
                      setFiltroEstado(active ? 'all' : key)
                      setTab('hoy')
                    }}
                    style={{
                      cursor:'pointer',
                      outline: active ? `2px solid ${color}` : '2px solid transparent',
                      transform: active ? 'scale(1.04)' : 'scale(1)',
                      transition:'all .15s',
                    }}
                  >
                    <div className="kpi-num" style={{ color }}>{count}</div>
                    <div className="kpi-lbl">{label}</div>
                    {active && (
                      <div style={{ fontSize:9, color, fontWeight:700, marginTop:2, letterSpacing:'.05em' }}>
                        FILTRANDO ✕
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Asignación automática */}
            <div style={{
              background:'linear-gradient(135deg,var(--brand-primary) 0%,var(--brand-secondary) 100%)',
              borderRadius:16, padding:'15px 16px', marginBottom:14,
              boxShadow:'0 8px 22px -6px rgba(79,70,229,.5)', position:'relative', overflow:'hidden',
            }}>
              <div style={{ position:'absolute', right:-6, bottom:-14, fontSize:78, opacity:.13, lineHeight:1 }}>🧹</div>
              <div style={{ fontSize:13.5, fontWeight:800, color:'#fff', display:'flex', alignItems:'center', gap:6, position:'relative', zIndex:1 }}>
                🧹 Asignación automática
              </div>
              <div style={{ fontSize:11, color:'#dbeafe', fontWeight:600, marginTop:2, maxWidth:230, lineHeight:1.35, position:'relative', zIndex:1 }}>
                Reparte las sesiones de hoy y mañana que están sin limpiadora.
              </div>
              <button
                onClick={asignarAhora}
                disabled={asignando}
                style={{
                  marginTop:11, width:'100%', background: asignando ? '#e0e7ff' : '#fff',
                  color:'var(--brand-primary)', fontFamily:"'Nunito',sans-serif", fontSize:14, fontWeight:800,
                  border:'none', borderRadius:11, padding:'11px 0',
                  cursor: asignando ? 'default' : 'pointer',
                  boxShadow:'0 2px 6px rgba(0,0,0,.12)', position:'relative', zIndex:1,
                }}>
                {asignando ? '⏳ Asignando…' : 'Asignar limpiezas ahora'}
              </button>

              {resAsign && (
                <div style={{ marginTop:11, background:'rgba(255,255,255,.96)', borderRadius:11, padding:'10px 12px', position:'relative', zIndex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <span style={{ fontSize:14, fontWeight:900, color:'#16a34a' }}>
                      ✓ {resAsign.asignadas} asignada{resAsign.asignadas === 1 ? '' : 's'}
                    </span>
                    {resAsign.fallidas > 0 && (
                      <span style={{ fontSize:12, fontWeight:700, color:'#d97706' }}>⚠ {resAsign.fallidas} sin asignar</span>
                    )}
                    {resAsign.detalle.length > 0 && (
                      <button onClick={() => setVerDetAsign(v => !v)}
                        style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--brand-primary)', fontFamily:"'Nunito',sans-serif", fontSize:12, fontWeight:700, textDecoration:'underline', cursor:'pointer' }}>
                        {verDetAsign ? 'Ocultar' : 'Ver detalle'}
                      </button>
                    )}
                  </div>
                  {verDetAsign && (
                    <ul style={{ listStyle:'none', margin:'9px 0 0', padding:0, display:'grid', gap:6 }}>
                      {resAsign.detalle.map((d: any) => (
                        <li key={d.sesion_id} style={{ background:'#f8fafc', borderRadius:8, padding:'7px 9px', fontSize:12 }}>
                          <span style={{ fontWeight:800, color:'#1e1b4b' }}>{d.limpiadora}</span>
                          <span style={{ color:'#1e1b4b' }}> → {d.propiedad} </span>
                          <span style={{ color:'var(--brand-secondary)' }}>· {d.fecha}</span>
                          {d.justificacion && <div style={{ color:'#94a3b8', fontSize:11 }}>{d.justificacion}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Fecha + filtro sin asignar */}
            <div className="date-row">
              <input
                type="date"
                value={fecha}
                onChange={e => cambiarFecha(e.target.value)}
                className="date-input"
              />
              <button
                onClick={() => setSoloSinAsignar(v => !v)}
                title="Mostrar solo las limpiezas sin limpiadora asignada"
                style={{
                  flexShrink: 0, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  border: '1px solid ' + (soloSinAsignar ? '#fdba74' : '#e2e8f0'),
                  background: soloSinAsignar ? '#fff7ed' : 'white',
                  color: soloSinAsignar ? '#c2410c' : '#64748b',
                }}>
                ⚠️ Sin asignar ({sinAsignar.length}){soloSinAsignar ? ' ✕' : ''}
              </button>
            </div>

            {/* Tabs */}
            <div className="tabs">
              {(['hoy','pms'] as const).map(t => (
                <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                  {t === 'hoy' ? 'Limpiezas' : 'PMS'}
                  {t === 'hoy' && sesiones.length > 0 && (
                    <span className="tab-count">{sesionesFiltradas.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── TAB LIMPIEZAS ── */}
            {tab === 'hoy' && (
              <>
                {filtroEstado !== 'all' && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    background:'var(--brand-light)', borderRadius:10, padding:'8px 12px', marginBottom:8 }}>
                    <span style={{ fontSize:12, color:'var(--brand-primary)', fontWeight:600 }}>
                      Mostrando: {filtroEstado === 'pendiente' ? '⏳ Pendientes' : filtroEstado === 'en_curso' ? '⟳ En curso' : '✓ Hechas'}
                      {' '}({sesionesFiltradas.length})
                    </span>
                    <button onClick={() => setFiltroEstado('all')}
                      style={{ fontSize:11, color:'var(--brand-secondary)', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>
                      Ver todas ✕
                    </button>
                  </div>
                )}
                {sesionesFiltradas.length === 0 && sesiones.length === 0 && (
                  <div style={{ textAlign:'center', padding:'48px 16px', color:'#94a3b8' }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>🧹</div>
                    <div style={{ fontWeight:700, color:'#334155', marginBottom:4 }}>Sin limpiezas para este día</div>
                    <button onClick={() => setShowNueva(true)}
                      style={{ marginTop:8, color:'var(--brand-primary)', background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                      + Añadir limpieza manualmente
                    </button>
                  </div>
                )}
                {sesionesFiltradas.length === 0 && sesiones.length > 0 && (
                  <div style={{ textAlign:'center', padding:'32px 16px', color:'#94a3b8' }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                    <div style={{ fontSize:13, color:'#64748b' }}>No hay limpiezas con este estado</div>
                  </div>
                )}
                {sesionesFiltradas.map(s => {
                  const color  = TIPO_COLOR[s.tipo_servicio] || 'var(--brand-primary)'
                  const icon   = TIPO_ICON[s.tipo_servicio]  || '🧹'
                  const manual = s.origen === 'manual'
                  return (
                    <div key={s.id} className="ses-card" style={{ borderLeftColor: color }}>
                      <div className="ses-row">
                        <div className="ses-icon" style={{ background: color + '18' }}>{icon}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div className="ses-title">{s.property_name || '— Sin piso —'}</div>
                          {s.cliente_nombre && (
                            <div className="ses-sub">👥 {s.cliente_nombre}</div>
                          )}
                          <div className="ses-chips">
                            {!s.completed_at ? (
                              <button
                                className="ses-chip ses-chip-btn"
                                onClick={() => setSheet(s)}
                                disabled={busyId === s.id}
                                title="Tocar para cambiar la limpiadora"
                                style={s.limpiadora_nombre
                                  ? { background:'var(--brand-light)', color:'var(--brand-primary)', borderColor:'#c7d2fe' }
                                  : { background:'#fff7ed', color:'#c2410c', borderColor:'#fdba74', borderStyle:'dashed' }}>
                                {s.limpiadora_nombre ? `👤 ${s.limpiadora_nombre}` : '➕ Asignar'}
                                <span style={{ marginLeft:3, opacity:.7, fontSize:9 }}>▾</span>
                              </button>
                            ) : s.limpiadora_nombre ? (
                              <span className="ses-chip" style={{ background:'#f1f5f9', color:'#334155' }}>
                                👤 {s.limpiadora_nombre}
                              </span>
                            ) : null}
                            {s.hora_inicio && (
                              <span className="ses-chip" style={{ background:'var(--brand-light)', color:'var(--brand-primary)' }}>
                                🕐 {typeof s.hora_inicio === 'string' ? s.hora_inicio.slice(0,5) : s.hora_inicio}
                              </span>
                            )}
                            {s.hora_checkin_siguiente && (
                              <span className="ses-chip" style={{ background:'#fee2e2', color:'#dc2626', borderColor:'#fca5a5', fontWeight:700 }}>
                                🔴 Entra {hhmm(s.hora_checkin_siguiente)}
                              </span>
                            )}
                            {s.alerta_ventana && (
                              <span className="ses-chip" style={{ background:'#fef2f2', color:'#b91c1c', borderColor:'#fca5a5' }}>
                                ⚠️ Ventana ajustada
                              </span>
                            )}
                            {s.urgente_manual && (
                              <span className="ses-chip" style={{ background:'#fef2f2', color:'#dc2626', borderColor:'#fca5a5', fontWeight:800 }}>🔥 Urgente</span>
                            )}
                            {s.notas && (
                              <span className="ses-chip" style={{ background:'#fffbeb', color:'#b45309' }} title={s.notas}>📝 con notas</span>
                            )}
                            {manual && (
                              <span className="ses-chip" style={{ background:'#f5f3ff', color:'#7c3aed' }}>manual</span>
                            )}
                          </div>

                          {/* Fila de acciones */}
                          {!s.completed_at && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:9 }}>
                              <button className="ses-act" onClick={() => setEditSesion(s)} title="Editar fecha, hora o detalles">✏️ Editar</button>
                              <button className="ses-act" onClick={() => mover(s, -1)} title="Subir en el orden">↑</button>
                              <button className="ses-act" onClick={() => mover(s, 1)} title="Bajar en el orden">↓</button>
                              {String(s.session_date).slice(0,10) === today && (
                                <button className="ses-act" onClick={() => moverDia(s, 1)} title="Mover a mañana">⏰→Mañana</button>
                              )}
                              {String(s.session_date).slice(0,10) > today && (
                                <button className="ses-act" onClick={() => moverDia(s, -1)} title="Traer a hoy">←Hoy</button>
                              )}
                              <button className="ses-act" onClick={() => toggleUrgente(s)} title="Marcar/quitar urgente"
                                style={s.urgente_manual ? { background:'#fef2f2', color:'#dc2626', borderColor:'#fca5a5' } : undefined}>
                                🔥 Urgente
                              </button>
                              <button className="ses-act" onClick={() => duplicar(s)} title="Duplicar limpieza">⧉ Duplicar</button>
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                          <span className={statusCls(s)}>{statusLbl(s)}</span>
                          {manual && !s.started_at && (
                            <button onClick={() => eliminarSesion(s.id)}
                              style={{ fontSize:11, color:'#ef4444', background:'none', border:'none', cursor:'pointer' }}>
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* ── TAB PMS ── */}
            {tab === 'pms' && (
              <>
                <a href="/pms/nuevo"
                  style={{ display:'block', background:'var(--brand-primary)', color:'white', textAlign:'center',
                    fontWeight:700, padding:'12px', borderRadius:12, textDecoration:'none',
                    marginBottom:12, fontSize:14, boxShadow:'0 3px 10px rgba(79,70,229,.3)' }}>
                  + Conectar nuevo PMS
                </a>
                {conexiones.length === 0 && (
                  <p style={{ textAlign:'center', color:'#94a3b8', padding:'32px 0', fontSize:13 }}>
                    Sin conexiones PMS configuradas.
                  </p>
                )}
                {conexiones.map((c: any) => (
                  <div key={c.id} className="pms-card">
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:'#0f172a' }}>{c.cliente_nombre}</div>
                      <div style={{ fontSize:11, color:'#94a3b8', textTransform:'uppercase', marginTop:2 }}>{c.pms_tipo}</div>
                      {c.ultimo_sync && (
                        <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>
                          Sync: {new Date(c.ultimo_sync).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'})}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20,
                      background: c.sync_error ? '#fee2e2' : c.activa ? '#d1fae5' : '#f1f5f9',
                      color:      c.sync_error ? '#dc2626' : c.activa ? '#059669' : '#94a3b8',
                    }}>
                      {c.sync_error ? '⚠ Error' : c.activa ? '● Activo' : '○ Inactivo'}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>{/* dash-content */}

        </div>{/* dash-main */}

        {/* ── Bottom nav móvil ── */}
        <nav className="bottom-nav">
          <div className="bottom-nav-inner">
            <button className="bottom-nav-item active">
              <span>🏠</span><span>Inicio</span>
            </button>
            <button className="bottom-nav-item" onClick={() => router.push('/admin/chat')}>
              <span>💬</span><span>Chat</span>
            </button>
            <button className="bottom-nav-item" onClick={() => router.push('/admin/materiales?tab=documentos')}>
              <span style={{ background:'var(--brand-primary)', borderRadius:12, width:42, height:42, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, color:'white', boxShadow:'0 3px 10px rgba(79,70,229,.4)' }}>📸</span>
              <span>Escanear</span>
            </button>
            <button className="bottom-nav-item" onClick={() => router.push('/admin/negocio')}>
              <span>👥</span><span>Clientes</span>
            </button>
            <button className="bottom-nav-item" onClick={() => router.push('/admin/equipo')}>
              <span>👤</span><span>Equipo</span>
            </button>
          </div>
        </nav>

      </div>{/* dash-root */}

      {showNueva && (
        <NuevaLimpiezaModal
          clientes={clientes}
          limpiadoras={limpiadoras}
          onCreada={onSesionCreada}
          onClose={() => setShowNueva(false)}
        />
      )}

      {/* Modal de edición de una limpieza existente (PATCH) */}
      {editSesion && (
        <NuevaLimpiezaModal
          clientes={clientes}
          limpiadoras={limpiadoras}
          sesion={editSesion}
          onCreada={() => {}}
          onActualizada={(s) => { onSesionActualizada(s); setEditSesion(null) }}
          onEliminada={(id) => { onSesionEliminada(id); setEditSesion(null) }}
          onClose={() => setEditSesion(null)}
        />
      )}

      {/* Bottom-sheet: elegir limpiadora */}
      {sheet && (
        <div className="sheet-backdrop" onClick={() => { setSheet(null); setBuscaLimp('') }}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ fontWeight:800, fontSize:15, color:'#0f172a' }}>Asignar limpiadora</div>
            <div style={{ fontSize:12, color:'#64748b', marginBottom:12 }}>{sheet.property_name || '— Sin piso —'}</div>
            {limpiadoras.filter((l: any) => l.activa !== false).length > 6 && (
              <input
                value={buscaLimp}
                onChange={e => setBuscaLimp(e.target.value)}
                placeholder="🔍 Buscar limpiadora…"
                style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:10, padding:'8px 12px', fontSize:13, marginBottom:10, outline:'none' }}
              />
            )}
            <div className="sheet-list">
              <button className="sheet-item" disabled={busyId === sheet.id}
                onClick={() => reasignar(sheet.id, '')} style={{ color:'#c2410c' }}>
                <span>✕ Sin asignar</span>
                {!sheet.limpiadora_id && <span className="sheet-check">✓</span>}
              </button>
              {limpiadoras
                .filter((l: any) => l.activa !== false)
                .filter((l: any) => !buscaLimp || l.nombre?.toLowerCase().includes(buscaLimp.toLowerCase()))
                .map((l: any) => (
                <button key={l.id} className="sheet-item" disabled={busyId === sheet.id}
                  onClick={() => reasignar(sheet.id, l.id)}>
                  <span><span className="sheet-dot" style={{ background: l.color || 'var(--brand-secondary)' }} />{l.nombre}</span>
                  {sheet.limpiadora_id === l.id && <span className="sheet-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'toast toast-' + toast.tipo}>{toast.msg}</div>}
    </>
  )
}
