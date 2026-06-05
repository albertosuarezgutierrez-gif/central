'use client'
import { HelpChat } from '@/components/help/HelpChat'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Session } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import SugerenciasPanel from '@/components/SugerenciasPanel'
import SystemHealth from '@/components/SystemHealth'
import AutoCurasPanel from '@/components/AutoCurasPanel'
import AgentesIATab from '@/components/AgentesIATab'
import InstagramTab from '@/components/InstagramTab'
import ProveedoresTechTab from '@/components/ProveedoresTechTab'
import IaTrainingPanel from '@/components/super/IaTrainingPanel'
import CRMAgentTab from '@/components/super/CRMAgentTab'
import CRMEmpresaDetalle from '@/components/super/CRMEmpresaDetalle'
import QAAgentTab from '@/components/super/QAAgentTab'
import ProspeccionApifyTab from '@/components/super/ProspeccionApifyTab'
import StripeOperadorTab from '@/components/super/StripeOperadorTab'


interface Restaurante {
  id: string
  nombre: string
  slug: string
  codigo_acceso: string
  plan: string
  plan_status: string | null
  activo: boolean
  ciudad: string
  created_at: string
  trial_end: string | null
  max_camareros: number | null
  stripe_subscription_id: string | null
  camareros: [{ count: number }]
  mesas: [{ count: number }]
  comandas: [{ count: number }]
}

interface CuentaVista {
  cuenta_id: string
  cuenta_nombre: string
  email: string | null
  telefono: string | null
  estado: string
  plan: string | null
  plan_status: string | null
  num_restaurantes: number
  restaurantes: { id: string; nombre: string; plan: string; plan_status: string; activo: boolean; ciudad: string }[]
  created_at: string
}

const PLAN_COLOR: Record<string, string> = {
  starter: C.ink3,
  pro: C.red,
  enterprise: C.green,
}

export default function SuperPage() {
  const [session, setSession] = useState<Session | null>(null)
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  // Login email + contraseña
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [pinBlocked, setPinBlocked] = useState('')
  // Guardia de sesión: si la API rechaza la sesión (401/403) avisamos en vez
  // de pintar las pantallas vacías como si no hubiera datos.
  const [sessionExpired, setSessionExpired] = useState(false)

  // Inicializar: leer sesión guardada
  useEffect(() => {
    const raw = localStorage.getItem('ia_rest_session')
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s.rol === 'super_admin') { setSession(s); setChecking(false); return }
      } catch { /* ignore */ }
    }
    setChecking(false)
  }, [])

  // Sonda de sesión: al entrar, comprobamos contra un endpoint autenticado.
  // Si la firma de sesión ya no es válida (401/403), marcamos caducada y
  // mostramos un aviso claro en lugar de dejar todo el panel vacío.
  useEffect(() => {
    if (!session) return
    let cancel = false
    ;(async () => {
      try {
        const res = await fetch('/api/super/training-stats', { headers: { 'x-ia-session': JSON.stringify(session) } })
        if (!cancel && (res.status === 401 || res.status === 403)) setSessionExpired(true)
      } catch { /* red caída: no marcamos caducada, puede ser temporal */ }
    })()
    return () => { cancel = true }
  }, [session])

  const doSuperLogin = async () => {
    if (pinLoading) return
    setPinLoading(true); setPinError(''); setPinBlocked('')
    try {
      const r = await fetch('/api/auth/super-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (r.status === 429) { setPinBlocked(d.error); setPinLoading(false); return }
      if (!r.ok || !d.camarero) { setPinError(d.error ?? 'Email o contraseña incorrectos'); setPassword(''); setPinLoading(false); return }
      localStorage.setItem('ia_rest_session', JSON.stringify(d.camarero))
      setSession(d.camarero)
    } catch { setPinError('Error de red') }
    setPinLoading(false)
  }
  const [trainingStats, setTrainingStats] = useState<any>(null)
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', slug: '', codigo_acceso: '', ciudad: 'Madrid' })
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos'|'activo'|'inactivo'|'trial'>('todos')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [tabSuper, setTabSuper] = useState<'clientes'|'sugerencias'|'ia_training'|'sistema'|'autocuras'|'cobro'|'suscripciones'|'soporte'|'agentes'|'instagram'|'crm'|'blog'|'proveedores'|'qa_agent'|'prospeccion_apify'>('clientes')
  const [tabCRM, setTabCRM] = useState<'leads'|'agente'|'prospeccion'>('leads')
  // Menús desplegables por dominio (crecimiento · soporte · sistema). Solo uno abierto a la vez.
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [subTabClientes, setSubTabClientes] = useState<'locales'|'cuentas'>('locales')
  const [sugerencias, setSugerencias] = useState<any[]>([])
  const [loadingSug, setLoadingSug] = useState(false)
  const [filtroSug, setFiltroSug] = useState<string>('todas')
  const [badgeSug, setBadgeSug] = useState(0)
  const [badgeSoporte, setBadgeSoporte] = useState(0)
  const [badgeInstagram, setBadgeInstagram] = useState(0)
  const [cuentas, setCuentas] = useState<CuentaVista[]>([])
  const [loadingCuentas, setLoadingCuentas] = useState(false)
  const [showFormCuenta, setShowFormCuenta] = useState(false)
  const [formCuenta, setFormCuenta] = useState({ nombre:'', email:'', telefono:'', pin_cuenta:'', nif:'', razon_social:'', notas_super:'' })
  const [savingCuenta, setSavingCuenta] = useState(false)
  const [errCuenta, setErrCuenta] = useState('')

  const loadSugerencias = useCallback(async () => {
    if (!session) return
    setLoadingSug(true)
    const r = await fetch('/api/sugerencias', {
      headers: { 'x-ia-session': JSON.stringify(session) }
    })
    const d = await r.json()
    const lista = d.sugerencias ?? []
    setSugerencias(lista)
    setBadgeSug(lista.filter((s: any) => !s.leida).length)
    setLoadingSug(false)
  }, [session])

  const marcarLeida = async (id: string) => {
    setSugerencias(prev => prev.map(s => s.id === id ? { ...s, leida: true } : s))
    setBadgeSug(prev => Math.max(0, prev - 1))
    await fetch('/api/sugerencias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ id, leida: true }),
    })
  }

  const cambiarEstado = async (id: string, estado: string) => {
    setSugerencias(prev => prev.map(s => s.id === id ? { ...s, estado } : s))
    await fetch('/api/sugerencias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ id, estado }),
    })
  }

  // Leer ?tab=X de la URL al cargar
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    // 'prospeccion_apify' vivía como tab suelto; ahora es la sub-pestaña Prospección del CRM.
    if (tab === 'prospeccion_apify') { setTabSuper('crm'); setTabCRM('prospeccion') }
    else if (tab) setTabSuper(tab as any)
  }, [])

  useEffect(() => { if (session && tabSuper === 'sugerencias') loadSugerencias() }, [session, tabSuper, loadSugerencias])
  useEffect(() => { if (session && tabSuper === 'clientes') loadCuentas() }, [session, tabSuper])
  useEffect(() => { if (session && tabSuper === 'ia_training') {
    fetch('/api/super/training-stats', { headers: { 'x-ia-session': JSON.stringify(session) } })
      .then(r => r.json()).then(d => setTrainingStats(d))
  }}, [session, tabSuper])

    useEffect(() => { if (session) { 
    fetch('/api/sugerencias', { headers: { 'x-ia-session': JSON.stringify(session) } })
      .then(r => r.json()).then(d => setBadgeSug((d.sugerencias ?? []).filter((s: any) => !s.leida).length))
  }}, [session])

  useEffect(() => { if (session) {
    fetch('/api/super/soporte', { headers: { 'x-ia-session': JSON.stringify(session) } })
      .then(r => r.json()).then(d => setBadgeSoporte((d.tickets ?? []).filter((t: any) => t.estado === 'escalado').length))
  }}, [session])

  // Cerrar el dropdown abierto al click/touch fuera
  useEffect(() => {
    if (!openMenu) return
    const handleClose = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClose)
    document.addEventListener('touchstart', handleClose)
    return () => {
      document.removeEventListener('mousedown', handleClose)
      document.removeEventListener('touchstart', handleClose)
    }
  }, [openMenu])

  const loadCuentas = async () => {
    if (!session) return
    setLoadingCuentas(true)
    const r = await fetch('/api/super/cuentas', { headers: { 'x-ia-session': JSON.stringify(session) } })
    const d = await r.json()
    setCuentas(d.cuentas ?? [])
    setLoadingCuentas(false)
  }

  const crearCuenta = async () => {
    if (!formCuenta.nombre.trim() || !formCuenta.pin_cuenta.trim()) {
      setErrCuenta('Nombre y PIN son obligatorios')
      return
    }
    setSavingCuenta(true); setErrCuenta('')
    const r = await fetch('/api/super/cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify(formCuenta),
    })
    const d = await r.json()
    setSavingCuenta(false)
    if (!r.ok) { setErrCuenta(d.error || 'Error'); return }
    setShowFormCuenta(false)
    setFormCuenta({ nombre:'', email:'', telefono:'', pin_cuenta:'', nif:'', razon_social:'', notas_super:'' })
    await loadCuentas()
  }

  const load = useCallback(async () => {
    if (!session) return
    setLoading(true)
    const r = await fetch('/api/super/restaurantes', {
      headers: { 'x-ia-session': JSON.stringify(session) }
    })
    const d = await r.json()
    setRestaurantes(d.restaurantes ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => { if (session) load() }, [session, load])

  const crear = async () => {
    if (!form.nombre || !form.slug || !form.codigo_acceso) {
      setErr('Nombre, slug y código son obligatorios')
      return
    }
    setSaving(true)
    setErr('')
    const r = await fetch('/api/super/restaurantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify(form),
    })
    const d = await r.json()
    if (d.error) { setErr(d.error); setSaving(false); return }
    setShowForm(false)
    setForm({ nombre: '', slug: '', codigo_acceso: '', ciudad: 'Madrid' })
    setSaving(false)
    load()
  }

  const toggleActivo = async (r: Restaurante) => {
    await fetch('/api/super/restaurantes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ id: r.id, activo: !r.activo }),
    })
    load()
  }

  if (checking) return null

  // Login propio (email + contraseña) — nunca redirige a /login
  if (!session) {
    // Colores hardcoded oscuros — independiente del tema claro de C
    const D = { bg:'#14110E', fg:'#F6F1E7', fg3:'#8D8270', keyB:'rgba(255,255,255,0.09)', red:'#D9442B', amber:'#E8A33B' }
    const inputStyle: React.CSSProperties = {
      width:'100%', padding:'13px 14px', boxSizing:'border-box',
      background:D.keyB, border:'1px solid rgba(255,255,255,0.12)', borderRadius:10,
      color:D.fg, fontSize:15, fontFamily:SN, outline:'none', marginBottom:12,
    }
    const disabled = pinLoading || !!pinBlocked || !email || !password
    return (
      <div style={{ minHeight:'100vh', background:D.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:SN, padding:24 }}>
        <form onSubmit={(e) => { e.preventDefault(); doSuperLogin() }} style={{ textAlign:'center', width:300 }}>
          {/* Logo */}
          <div style={{ fontFamily:SM, fontSize:22, fontWeight:800, color:D.fg, letterSpacing:'-0.03em', marginBottom:4 }}>
            ia<span style={{ color:D.red }}>.</span>rest
          </div>
          <div style={{ fontSize:11, color:D.fg3, fontFamily:SE, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:28 }}>
            Acceso operador
          </div>

          <input
            type="email" inputMode="email" autoComplete="username" autoFocus
            placeholder="Email" value={email}
            onChange={e => { setEmail(e.target.value); setPinError(''); setPinBlocked('') }}
            disabled={pinLoading} style={inputStyle}
          />
          <input
            type="password" autoComplete="current-password"
            placeholder="Contraseña" value={password}
            onChange={e => { setPassword(e.target.value); setPinError(''); setPinBlocked('') }}
            disabled={pinLoading} style={inputStyle}
          />

          {/* Error / bloqueado */}
          {(pinError || pinBlocked) && (
            <div style={{ fontSize:12, color: pinBlocked ? D.amber : '#ff6b6b', marginBottom:14, minHeight:18 }}>
              {pinBlocked || pinError}
            </div>
          )}

          <button
            type="submit" disabled={disabled}
            style={{
              width:'100%', padding:'13px 0', borderRadius:10, border:'none',
              background: disabled ? 'rgba(217,68,43,0.5)' : D.red,
              color:D.fg, fontSize:15, fontWeight:600, fontFamily:SN,
              cursor: (pinLoading || !!pinBlocked) ? 'not-allowed' : 'pointer',
            }}
          >
            {pinLoading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    )
  }

  // Sesión caducada: la API rechaza la firma actual. Avisamos y ofrecemos
  // volver a entrar (regenera una sesión firmada válida → arregla todo /super).
  if (sessionExpired) {
    const D = { bg:'#14110E', fg:'#F6F1E7', fg3:'#8D8270', red:'#D9442B', amber:'#E8A33B' }
    return (
      <div style={{ minHeight:'100vh', background:D.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:SN, padding:24 }}>
        <div style={{ textAlign:'center', maxWidth:340 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
          <div style={{ fontFamily:SE, fontSize:22, color:D.fg, marginBottom:10 }}>Sesión caducada</div>
          <div style={{ fontSize:14, color:D.fg3, lineHeight:1.6, marginBottom:24 }}>
            Tu sesión ya no es válida, por eso las pantallas salían vacías. Vuelve a entrar con tu email y contraseña para restaurar el acceso.
          </div>
          <button
            onClick={() => { localStorage.removeItem('ia_rest_session'); setSessionExpired(false); setEmail(''); setPassword(''); setSession(null) }}
            style={{ background:D.red, color:D.fg, border:'none', borderRadius:10, padding:'13px 28px', fontSize:15, fontWeight:600, fontFamily:SN, cursor:'pointer' }}
          >
            Volver a entrar →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN }}>
      <style>{`
        .super-rest-row {
          display: grid;
          grid-template-columns: 1fr auto auto auto auto;
          align-items: center;
          gap: 24px;
        }
        .super-rest-actions { display: flex; align-items: center; gap: 8px; }
        .super-header-name { display: block; }
        /* Tabla restaurantes */
        .super-rest-table-hdr { display: grid; grid-template-columns: 1fr 110px 90px 90px 80px 90px; }
        .super-rest-table-row { display: grid; grid-template-columns: 1fr 110px 90px 90px 80px 90px; }
        /* Tabla historico */
        .super-hist-hdr { display: grid; grid-template-columns: 120px 1fr 100px 80px; }
        .super-hist-row { display: grid; grid-template-columns: 120px 1fr 100px 80px; }
        /* Layout ticket */
        .super-ticket-layout { display: grid; gap: 24px; align-items: start; }
        @media (max-width: 768px) {
          .super-rest-row { grid-template-columns: 1fr; gap: 12px; }
          .super-rest-actions { flex-wrap: wrap; gap: 6px; }
          .super-form-grid { grid-template-columns: 1fr !important; }
          .super-header { padding: 0 14px !important; }
          .super-content { padding: clamp(14px,3vw,28px) clamp(12px,3vw,20px) !important; }
          /* Tablas → scroll */
          .super-rest-table-hdr { display: none; }
          .super-rest-table-row { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px !important; }
          .super-rest-table-row .sr-col-hide { display: none; }
          .super-hist-hdr { display: none; }
          .super-hist-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 14px !important; }
          /* Ticket layout: sidebar encima en móvil */
          .super-ticket-layout { grid-template-columns: 1fr !important; }
          /* Nav tabs principal */
          .super-tab-btn { padding: 12px 10px !important; font-size: 10px !important; }
          /* Kanban: columnas más estrechas */
          .kanban-col { width: 160px !important; }
        }
        @media (max-width: 480px) {
          .super-header-name { display: none; }
          /* Nav: ocultar labels, mostrar solo activo */
          .super-tab-btn { padding: 10px 8px !important; font-size: 9px !important; letter-spacing: 0 !important; }
        }
      `}</style>
      {/* Header */}
      <header className="super-header" style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: C.dark, borderBottom: `1px solid #2F2820`,
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontFamily: SE, fontSize: 20, color: '#F6F1E7', fontWeight: 500 }}>
          ia<span style={{ color: C.red }}>.</span>rest
        </div>
        <div style={{ fontFamily: SM, fontSize: 10, color: '#8D8270', letterSpacing: '.1em' }}>
          SUPER ADMIN
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="super-header-name" style={{ fontFamily: SM, fontSize: 11, color: '#8D8270' }}>
            {session?.nombre}
          </div>
          <HelpChat />
          <button
            onClick={() => { localStorage.removeItem('ia_rest_session'); window.location.href = '/login' }}
            style={{
              background: 'none', border: `1px solid #2F2820`, borderRadius: 4,
              color: '#8D8270', fontFamily: SM, fontSize: 10, padding: '4px 10px',
              cursor: 'pointer', letterSpacing: '.08em',
            }}
          >
            SALIR
          </button>
        </div>
      </header>

      {/* TABS NAV */}
      <div style={{ borderBottom: `1px solid ${C.rule}`, background: C.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(12px, 4vw, 32px)', display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {/* NEGOCIO — barra principal (el día a día comercial) */}
          {([
            { id: 'clientes',       label: 'Clientes' },
            { id: 'crm',           label: 'CRM' },
            { id: 'cobro',         label: 'Cobro' },
            { id: 'suscripciones', label: '💳 Suscripciones' },
          ] as any[]).map((t: any) => (
            <button key={t.id} onClick={() => setTabSuper(t.id as any)}
              className="super-tab-btn"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '14px 20px',
                fontFamily: SM, fontSize: 11, letterSpacing: '.1em',
                color: tabSuper === t.id ? C.ink : C.ink3,
                borderBottom: `2px solid ${tabSuper === t.id ? C.red : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color .15s', whiteSpace: 'nowrap',
              }}
            >
              {t.label.toUpperCase()}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {/* Dropdowns por dominio: Crecimiento · Soporte · Sistema */}
          <div ref={menuRef} style={{ display: 'flex', alignSelf: 'stretch' }}>
            {([
              { id: 'crecimiento', label: 'Crecimiento', badge: badgeInstagram, tabs: [
                { id: 'instagram', label: 'Instagram', badge: badgeInstagram },
                { id: 'blog',      label: 'Blog' },
              ] },
              { id: 'soporte', label: 'Soporte', badge: badgeSoporte + badgeSug, tabs: [
                { id: 'soporte',     label: 'Soporte',     badge: badgeSoporte },
                { id: 'sugerencias', label: 'Sugerencias', badge: badgeSug },
                { id: 'proveedores', label: 'Proveedores' },
              ] },
              { id: 'sistema', label: 'Sistema', badge: 0, tabs: [
                { id: 'sistema',     label: 'Sistema' },
                { id: 'autocuras',   label: 'Autocuras' },
                { id: 'qa_agent',    label: 'QA Agent' },
                { id: 'agentes',     label: 'Agentes' },
                { id: 'ia_training', label: 'IA Training' },
              ] },
            ] as any[]).map((g: any) => {
              const activo = g.tabs.some((t: any) => t.id === tabSuper)
              return (
                <div key={g.id} style={{ position: 'relative', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={(e) => {
                      const isOpen = openMenu === g.id
                      if (!isOpen) {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setMenuPos({ top: rect.bottom, right: window.innerWidth - rect.right })
                      }
                      setOpenMenu(isOpen ? null : g.id)
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', height: '100%',
                      fontFamily: SM, fontSize: 11, letterSpacing: '.1em', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                      color: activo ? C.ink : C.ink3,
                      borderBottom: `2px solid ${activo ? C.red : 'transparent'}` }}>
                    {g.label.toUpperCase()}
                    {g.badge > 0
                      ? <span style={{ background: C.red, color: '#fff', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 5px', fontFamily: SM }}>{g.badge}</span>
                      : <span style={{ fontSize: 10, color: C.ink4 }}>▾</span>}
                  </button>
                  {openMenu === g.id && (
                    <div style={{ position: 'fixed', right: menuPos.right, top: menuPos.top, background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8, zIndex: 9999, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.5)', overflow: 'hidden' }}>
                      {g.tabs.map((t: any) => (
                        <button key={t.id} onClick={() => { setTabSuper(t.id as any); setOpenMenu(null) }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                            background: tabSuper === t.id ? C.bg3 : 'transparent', border: 'none', cursor: 'pointer',
                            padding: '10px 16px', fontFamily: SM, fontSize: 11, letterSpacing: '.08em',
                            color: tabSuper === t.id ? C.paper : C.ink3, textAlign: 'left' }}>
                          {t.label.toUpperCase()}
                          {(t.badge ?? 0) > 0 && <span style={{ background: C.red, color: '#fff', borderRadius: 8, padding: '1px 5px', fontSize: 9 }}>{t.badge}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: `clamp(24px, 5vw, 48px) clamp(12px, 4vw, 32px)` }}>
        {tabSuper === 'cobro' ? (
          <Cobro session={session} C={C} SE={SE} SN={SN} SM={SM} />
        ) : tabSuper === 'suscripciones' ? (
          <StripeOperadorTab />
        ) : tabSuper === 'crm' ? (
          <div style={{ padding: '0' }}>
            {/* Sub-nav CRM */}
            <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.rule}`, marginBottom: 32, paddingTop: 8 }}>
              {([
                { id: 'leads',       label: '📋 Leads' },
                { id: 'prospeccion', label: '🔍 Prospección' },
                { id: 'agente',      label: '🤖 Agente CRM' },
              ] as { id: 'leads'|'agente'|'prospeccion'; label: string }[]).map(t => (
                <button key={t.id} onClick={() => setTabCRM(t.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 18px', fontFamily: SM, fontSize: 12, letterSpacing: '.08em',
                    color: tabCRM === t.id ? C.ink : C.ink4,
                    borderBottom: `2px solid ${tabCRM === t.id ? C.red : 'transparent'}` }}>
                  {t.label.toUpperCase()}
                </button>
              ))}
            </div>
            {tabCRM === 'leads' ? <LeadsTab C={C} SE={SE} SN={SN} SM={SM} />
              : tabCRM === 'prospeccion' ? <ProspeccionApifyTab session={session} />
              : <CRMAgentTab />}
          </div>
        ) : tabSuper === 'sugerencias' ? (
          <SugerenciasPanel
            sugerencias={sugerencias}
            loading={loadingSug}
            filtro={filtroSug}
            setFiltro={setFiltroSug}
            onMarcarLeida={marcarLeida}
            onCambiarEstado={cambiarEstado}
            onRecargar={loadSugerencias}
          />
        ) : tabSuper === 'ia_training' ? (
          <div style={{ padding: '24px 0' }}><IaTrainingPanel /></div>
        ) : tabSuper === 'sistema' ? (
          <div style={{ padding: '24px 0' }}><SystemHealth session={session} /></div>
        ) : tabSuper === 'autocuras' ? (
          <div style={{ padding: '24px 0' }}><AutoCurasPanel /></div>
        ) : tabSuper === 'soporte' ? (
          <SoporteSuperTab session={session} C={C} SE={SE} SN={SN} SM={SM} onBadge={setBadgeSoporte} />
        ) : tabSuper === 'agentes' ? (
          <div style={{ padding: '24px 0' }}>
            <AgentesIATab session={session} C={C} SE={SE} SN={SN} SM={SM} />
          </div>
        ) : tabSuper === 'instagram' ? (
          <div style={{ padding: '24px 0' }}>
            <InstagramTab session={session} />
          </div>
        ) : tabSuper === 'blog' ? (
          <div style={{ padding: '24px 0' }}>
            <BlogSuperTab session={session} C={C} SE={SE} SN={SN} SM={SM} />
          </div>
        ) : tabSuper === 'proveedores' ? (
          <div style={{ padding: '24px 0' }}>
            <ProveedoresTechTab />
          </div>

        ) : tabSuper === 'qa_agent' ? (
          <div style={{ padding: '24px 0' }}>
            <QAAgentTab session={session} />
          </div>

        ) : tabSuper === 'clientes' ? (
          <div>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontFamily: SE, fontSize: 40, fontWeight: 500, margin: '0 0 8px', color: C.ink }}>Clientes</h1>
              <p style={{ fontFamily: SN, fontSize: 14, color: C.ink3, margin: 0 }}>
                Restaurantes activos y cuentas de acceso multi-local.
              </p>
            </div>
            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.rule}`, marginBottom: 28 }}>
              {([
                { id: 'locales', label: 'Restaurantes' },
                { id: 'cuentas', label: 'Cuentas' },
              ] as {id:'locales'|'cuentas'; label:string}[]).map(t => (
                <button key={t.id} onClick={() => setSubTabClientes(t.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 18px',
                    fontFamily: SM, fontSize: 11, letterSpacing: '.08em',
                    color: subTabClientes === t.id ? C.ink : C.ink3,
                    borderBottom: `2px solid ${subTabClientes === t.id ? C.red : 'transparent'}` }}>
                  {t.label.toUpperCase()}
                </button>
              ))}
            </div>
            {subTabClientes === 'cuentas' ? (<div>

            {/* Botón nueva cuenta */}
            {!showFormCuenta && (
              <button onClick={() => setShowFormCuenta(true)}
                style={{ marginBottom: 24, padding: '10px 20px', background: C.red, border: 'none', borderRadius: 4, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                + Nueva cuenta de cliente
              </button>
            )}

            {/* Formulario nueva cuenta */}
            {showFormCuenta && (
              <div style={{ background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, marginBottom: 24 }}>
                <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.1em', marginBottom: 16 }}>NUEVA CUENTA</div>
                <div className="super-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {[
                    { k: 'nombre',       l: 'Nombre *',         ph: 'Manuela García' },
                    { k: 'pin_cuenta',   l: 'PIN de cuenta *',  ph: '2026', type: 'text' },
                    { k: 'email',        l: 'Email',            ph: 'manuela@gmail.com' },
                    { k: 'telefono',     l: 'Teléfono',         ph: '+34 600 000 000' },
                    { k: 'nif',          l: 'NIF',              ph: 'B12345678' },
                    { k: 'razon_social', l: 'Razón social',     ph: 'Hostelería SL' },
                  ].map(f => (
                    <div key={f.k}>
                      <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4 }}>{f.l}</div>
                      <input
                        value={formCuenta[f.k as keyof typeof formCuenta]}
                        onChange={e => setFormCuenta(fc => ({ ...fc, [f.k]: e.target.value }))}
                        placeholder={f.ph}
                        style={{ width: '100%', padding: '8px 10px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4 }}>Notas internas</div>
                  <textarea
                    value={formCuenta.notas_super}
                    onChange={e => setFormCuenta(fc => ({ ...fc, notas_super: e.target.value }))}
                    placeholder="Solo visible para super admin"
                    rows={2}
                    style={{ width: '100%', padding: '8px 10px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
                {errCuenta && <div style={{ fontFamily: SM, fontSize: 11, color: C.red, marginBottom: 8 }}>{errCuenta}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={crearCuenta} disabled={savingCuenta}
                    style={{ padding: '8px 20px', background: C.red, border: 'none', borderRadius: 4, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {savingCuenta ? 'Guardando...' : 'Crear cuenta'}
                  </button>
                  <button onClick={() => { setShowFormCuenta(false); setErrCuenta('') }}
                    style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Lista cuentas */}
            {loadingCuentas ? (
              <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>Cargando...</div>
            ) : cuentas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', background: C.bg, borderRadius: 8, border: `1px dashed ${C.rule}` }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
                <div style={{ fontFamily: SE, fontSize: 20, color: C.ink, marginBottom: 6 }}>Sin cuentas todavía</div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Crea la primera cuenta de cliente</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cuentas.map(c => (
                  <div key={c.cuenta_id} style={{ background: '#fff', border: `1px solid ${C.rule}`, borderRadius: 8, padding: 20, display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{ fontFamily: SE, fontSize: 20, color: C.ink }}>{c.cuenta_nombre}</div>
                        <span style={{ fontFamily: SM, fontSize: 9, padding: '2px 7px', borderRadius: 3, background: c.estado === 'activo' ? C.greenS : C.redS, color: c.estado === 'activo' ? C.green : C.red, letterSpacing: '.08em' }}>
                          {c.estado.toUpperCase()}
                        </span>
                        <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>
                          {c.num_restaurantes} local{c.num_restaurantes !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      {c.email && <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginBottom: 4 }}>{c.email}</div>}
                      {/* Restaurantes de la cuenta */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {(c.restaurantes || []).map((r: any) => (
                          <span key={r.id} style={{ fontFamily: SM, fontSize: 10, padding: '3px 8px', borderRadius: 3, background: C.bg, border: `1px solid ${C.rule}`, color: C.ink2 }}>
                            {r.nombre} · {r.plan}
                          </span>
                        ))}
                        {c.num_restaurantes === 0 && (
                          <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, fontStyle: 'italic' }}>Sin restaurantes asignados</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                      {new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>) : (
          <div>
        {/* KPIs globales */}
        {!loading && restaurantes.length > 0 && (() => {
          const activos = restaurantes.filter(r => r.activo && r.plan_status !== 'trial').length
          const enTrial = restaurantes.filter(r => r.plan_status === 'trial').length
          const inactivos = restaurantes.filter(r => !r.activo).length
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 28 }}>
              {[
                { l: 'Total', v: restaurantes.length, c: C.ink, f: 'todos' },
                { l: 'Activos', v: activos, c: C.green, f: 'activo' },
                { l: 'En trial', v: enTrial, c: '#E8A33B', f: 'trial' },
                { l: 'Inactivos', v: inactivos, c: C.ink4, f: 'inactivo' },
              ].map(m => (
                <div key={m.l} onClick={() => setFiltroEstado(m.f as any)}
                  style={{ background: filtroEstado === m.f ? C.bg3 : C.bg2, border: `1px solid ${filtroEstado === m.f ? C.red : C.rule}`, borderRadius: 8, padding: '12px 16px', cursor: 'pointer', transition: 'border-color .15s' }}>
                  <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginBottom: 4 }}>{m.l.toUpperCase()}</div>
                  <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Title + acciones */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 4 }}>PANEL · SUPER ADMIN</div>
            <h1 style={{ fontFamily: SE, fontSize: 36, fontWeight: 500, margin: 0, letterSpacing: '-.02em', color: C.ink }}>Restaurantes</h1>
          </div>
          <button onClick={() => setShowForm(true)} style={{
            background: C.ink, color: C.bg, border: 'none', borderRadius: 4,
            fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '9px 18px', cursor: 'pointer',
          }}>+ Nuevo restaurante</button>
        </div>

        {/* Búsqueda + filtro estado */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o ciudad…"
            style={{ flex: 1, minWidth: 180, padding: '8px 12px', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 6, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none' }}
          />
          {(['todos','activo','trial','inactivo'] as const).map(f => (
            <button key={f} onClick={() => setFiltroEstado(f)} style={{
              padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: SM, fontSize: 10, letterSpacing: '.06em',
              background: filtroEstado === f ? C.ink : C.bg2,
              color: filtroEstado === f ? C.bg : C.ink3,
              border: `1px solid ${filtroEstado === f ? C.ink : C.rule}`,
            }}>{f.toUpperCase()}</button>
          ))}
        </div>

        {/* Form nueva alta */}
        {showForm && (
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '24px', marginBottom: 24 }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.1em', marginBottom: 16 }}>NUEVO RESTAURANTE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 12 }}>
              {[
                { key: 'nombre', label: 'Nombre', placeholder: 'Bodega La Plaza' },
                { key: 'slug', label: 'Slug', placeholder: 'bodega-laplaza' },
                { key: 'codigo_acceso', label: 'Código acceso', placeholder: 'BODEGA' },
                { key: 'ciudad', label: 'Ciudad', placeholder: 'Madrid' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em', marginBottom: 6 }}>{f.label.toUpperCase()}</div>
                  <input
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '9px 12px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginBottom: 12, padding: '8px 12px', background: C.bg3, borderRadius: 6 }}>
              💡 Arranca en <strong style={{ color: '#E8A33B' }}>trial 14 días</strong>. Pricing por usuarios+mesas configurado en Stripe.
            </div>
            {err && <div style={{ fontFamily: SN, fontSize: 13, color: C.red, marginBottom: 10 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={crear} disabled={saving} style={{ background: C.red, color: '#F6F1E7', border: 'none', borderRadius: 4, fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '9px 18px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Creando...' : 'Crear restaurante'}
              </button>
              <button onClick={() => { setShowForm(false); setErr('') }} style={{ background: 'none', border: `1px solid ${C.rule}`, borderRadius: 4, fontFamily: SN, fontSize: 13, color: C.ink3, padding: '9px 18px', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista restaurantes */}
        {loading ? (
          <div style={{ fontFamily: SM, fontSize: 12, color: C.ink4, letterSpacing: '.1em' }}>CARGANDO...</div>
        ) : (() => {
          const filtrados = restaurantes.filter(r => {
            const q = busqueda.toLowerCase()
            const matchQ = !q || r.nombre.toLowerCase().includes(q) || (r.ciudad || '').toLowerCase().includes(q)
            const matchE = filtroEstado === 'todos' ? true
              : filtroEstado === 'activo' ? (r.activo && r.plan_status !== 'trial')
              : filtroEstado === 'trial' ? r.plan_status === 'trial'
              : !r.activo
            return matchQ && matchE
          })
          return filtrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: C.ink4, fontFamily: SM, fontSize: 12 }}>Sin resultados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtrados.map(r => (
                <div key={r.id} className="super-rest-row" style={{
                  background: r.activo ? C.bg : C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8,
                  padding: '18px 22px', opacity: r.activo ? 1 : 0.6,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: SN, fontSize: 17, fontWeight: 600, color: C.ink }}>{r.nombre}</div>
                      <span style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: r.activo ? C.greenS : C.bg3, color: r.activo ? C.green : C.ink4, letterSpacing: '.08em' }}>
                        {r.activo ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                      {r.plan_status && (
                        <span style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3, letterSpacing: '.08em',
                          background: r.plan_status === 'active' ? 'rgba(63,125,68,.15)' : r.plan_status === 'trial' ? 'rgba(232,163,59,.15)' : 'rgba(217,68,43,.12)',
                          color: r.plan_status === 'active' ? '#3F7D44' : r.plan_status === 'trial' ? '#A8761A' : '#D9442B',
                        }}>
                          {r.plan_status === 'trial'
                            ? `TRIAL · ${r.trial_end ? Math.max(0, Math.ceil((new Date(r.trial_end).getTime() - Date.now()) / 86400000)) + 'd' : '?'}`
                            : r.plan_status.toUpperCase()}
                        </span>
                      )}
                      {r.max_camareros && r.max_camareros < 999 && (
                        <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4, padding: '2px 6px', background: C.bg3, borderRadius: 3 }}>{r.max_camareros}u</span>
                      )}
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, letterSpacing: '.06em' }}>
                      {r.slug} &nbsp;·&nbsp; {r.codigo_acceso} &nbsp;·&nbsp; {r.ciudad}
                    </div>
                  </div>
                  {[
                    { v: r.camareros?.[0]?.count ?? 0, l: 'personal' },
                    { v: r.mesas?.[0]?.count ?? 0, l: 'mesas' },
                    { v: r.comandas?.[0]?.count ?? 0, l: 'comandas' },
                  ].map(m => (
                    <div key={m.l} style={{ textAlign: 'center', minWidth: 56 }}>
                      <div style={{ fontFamily: SE, fontSize: 26, fontWeight: 500, color: C.ink, lineHeight: 1 }}>{m.v}</div>
                      <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.08em', marginTop: 2 }}>{m.l.toUpperCase()}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => router.push(`/super/${r.id}`)} style={{ background: C.red, border: 'none', borderRadius: 4, fontFamily: SM, fontSize: 10, color: '#fff', padding: '6px 12px', cursor: 'pointer', letterSpacing: '.06em' }}>
                      GESTIONAR →
                    </button>
                    <button onClick={() => toggleActivo(r)} style={{ background: 'none', border: `1px solid ${r.activo ? C.rule : C.ruleS}`, borderRadius: 4, fontFamily: SM, fontSize: 10, color: r.activo ? C.red : C.green, padding: '6px 10px', cursor: 'pointer', letterSpacing: '.06em' }}>
                      {r.activo ? 'PAUSAR' : 'ACTIVAR'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
          </div>)}
        </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Tab IA Training (extraído del bloque restaurantes) ──────────────────────
function TabIATraining({ trainingStats, C, SE, SN, SM }: { trainingStats: any; C: any; SE: string; SN: string; SM: string }) {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>IA TRAINING · FINE-TUNING PROPIO</div>
        <h1 style={{ fontFamily: SE, fontSize: 40, fontWeight: 500, margin: '0 0 8px', color: C.ink }}>IA Training</h1>
        <p style={{ fontFamily: SN, fontSize: 15, color: C.ink3, margin: 0 }}>
          Pares EAR→BRAIN acumulados para el futuro modelo propio. Activar fine-tuning a partir de ~50 clientes.
        </p>
      </div>
      {!trainingStats ? (
        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>Cargando estadísticas…</div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { l: 'Total pares', v: trainingStats.global?.total ?? 0, col: C.red },
              { l: 'Alta calidad (≥4)', v: trainingStats.global?.alta_calidad ?? 0, col: C.green },
              { l: 'Corregidos', v: trainingStats.global?.corregidos ?? 0, col: C.green },
              { l: 'Hoy', v: trainingStats.global?.hoy ?? 0, col: C.ink },
              { l: 'Esta semana', v: trainingStats.global?.semana ?? 0, col: C.ink },
              { l: 'Calidad media', v: trainingStats.global?.calidad_media_global ?? '—', col: '#E8A33B' },
            ].map(m => (
              <div key={m.l} style={{ background: C.bg2, borderRadius: 8, padding: '16px 18px', border: `1px solid ${C.rule}` }}>
                <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginBottom: 6 }}>{m.l.toUpperCase()}</div>
                <div style={{ fontFamily: SE, fontSize: 32, fontWeight: 500, color: m.col, lineHeight: 1 }}>{m.v}</div>
              </div>
            ))}
          </div>
          {trainingStats.porFuente?.length > 0 && (
            <div style={{ background: C.bg2, borderRadius: 8, padding: 20, border: `1px solid ${C.rule}`, marginBottom: 20 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 14 }}>PARES POR FUENTE</div>
              {trainingStats.porFuente.map((f: any) => {
                const colores: Record<string,string> = { patron: C.green, claude_api: '#E8A33B', sintetico: C.ink3, nim_conversacional: C.red, nim_analitico: '#7B5EA7' }
                const pct = trainingStats.global?.total ? Math.round((f.total / trainingStats.global.total) * 100) : 0
                return (
                  <div key={f.fuente} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: `1px solid ${C.rule}`, flexWrap: 'wrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: colores[f.fuente] ?? C.ink4, flexShrink: 0 }} />
                    <span style={{ fontFamily: SM, fontSize: 12, color: C.ink, flex: 1, minWidth: 120 }}>{f.fuente}</span>
                    <span style={{ fontFamily: SM, fontSize: 13, color: colores[f.fuente] ?? C.ink3, fontWeight: 600, width: 50 }}>{f.total}</span>
                    <div style={{ flex: 2, height: 4, background: C.rule, borderRadius: 2, minWidth: 60 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: colores[f.fuente] ?? C.ink4, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4, width: 35 }}>{pct}%</span>
                    <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>cal:{f.calidad_media}</span>
                  </div>
                )
              })}
            </div>
          )}
          {trainingStats.recientes?.length > 0 && (
            <div style={{ background: C.bg2, borderRadius: 8, padding: 20, border: `1px solid ${C.rule}`, marginBottom: 20, overflowX: 'auto' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 14 }}>ÚLTIMOS 20 REGISTROS</div>
              {trainingStats.recientes.map((r: any) => {
                const calCol = r.calidad >= 4 ? C.green : r.calidad >= 3 ? '#E8A33B' : C.red
                return (
                  <div key={r.id} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: `1px solid ${C.rule}`, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: SM, fontSize: 10, color: calCol, fontWeight: 700, width: 14 }}>{r.calidad}</span>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, width: 120, flexShrink: 0 }}>{r.fuente}</span>
                    <span style={{ fontFamily: SN, fontSize: 12, color: C.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 80 }}>{r.input_raw}</span>
                    {r.fue_corregido && <span style={{ fontFamily: SM, fontSize: 9, color: C.green }}>✓ human</span>}
                    <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4 }}>{new Date(r.created_at).toLocaleDateString('es-ES')}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ background: C.bg2, borderRadius: 8, padding: 24, border: `1px solid ${C.rule}` }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 16 }}>ESTADO DEL PIPELINE</div>
            {[
              ['Trigger activo', 'trg_transcripcion_to_training_log — copia cada par EAR/BRAIN automáticamente', true],
              ['Tabla', 'ia_training_log — índices + RLS + vista v_training_stats', true],
              ['Umbral fine-tuning', '~50 clientes / ~100.000 pares mínimo recomendado', false],
              ['Modelo objetivo', 'Claude fine-tuned o modelo propio vía API Anthropic', false],
            ].map(([k, v, ok]) => (
              <div key={k as string} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.rule}`, alignItems: 'flex-start' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? C.green : C.ink4, display: 'inline-block', marginTop: 5, flexShrink: 0 }} />
                <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3, width: 180, flexShrink: 0 }}>{k as string}</span>
                <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>{v as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panel financiero ia.rest cobro (super admin) ──────────────
function Cobro({ session, C, SE, SN, SM }: { session: any; C: any; SE: string; SN: string; SM: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    const token = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') : null
    fetch('/api/super/cobro-resumen', { headers: { 'x-ia-session': token || '' } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session])

  const fmt = (n: number) => (n || 0).toFixed(2).replace('.', ',') + ' €'
  const fmtK = (n: number) => n >= 1000 ? ((n/1000).toFixed(1) + 'k €') : fmt(n)

  if (loading) return <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, padding: 32 }}>CARGANDO...</div>
  if (!data) return <div style={{ fontFamily: SM, fontSize: 12, color: C.red, padding: 32 }}>Error al cargar datos</div>

  const { totales, restaurantes, historico } = data
  const mesActual = new Date().toLocaleString('es', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, fontStyle: 'italic', marginBottom: 4 }}>ia.rest cobro</div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Panel financiero · Comisiones QR de la plataforma</div>
      </div>

      {/* KPIs globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 36 }}>
        {[
          { label: 'Volumen mes', value: fmtK(totales.volumen_mes), sub: mesActual, color: C.dkFg },
          { label: 'Comisión mes', value: fmt(totales.comision_mes), sub: '0,5% de ' + fmtK(totales.volumen_mes), color: C.green },
          { label: 'Volumen año', value: fmtK(totales.volumen_anio), sub: new Date().getFullYear().toString(), color: C.dkFg },
          { label: 'Comisión año', value: fmt(totales.comision_anio), sub: 'acumulado ' + new Date().getFullYear(), color: C.green },
          { label: 'Transacciones', value: (totales.txn_mes || 0).toString(), sub: 'este mes', color: C.blue },
        ].map((kpi, i) => (
          <div key={i} style={{ background: C.dark2, borderRadius: 14, padding: '18px 20px', border: `1px solid ${C.dkRule}` }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.dkFg3, letterSpacing: '.08em', marginBottom: 8 }}>{kpi.label.toUpperCase()}</div>
            <div style={{ fontFamily: SE, fontSize: 26, fontWeight: 700, fontStyle: 'italic', color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.dkFg3, marginTop: 4 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabla por restaurante */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 14 }}>RESTAURANTES · MES ACTUAL</div>
        <div style={{ background: C.dark2, borderRadius: 14, border: `1px solid ${C.dkRule}`, overflow: 'hidden' }}>
          {/* Header tabla */}
          <div className="super-rest-table-hdr" style={{ gap: 0, padding: '10px 20px', borderBottom: `1px solid ${C.dkRule}` }}>
            {['Restaurante', 'Ciudad', 'Volumen', 'Comisión', 'Txn', 'Descuento'].map(h => (
              <div key={h} style={{ fontFamily: SM, fontSize: 9, color: C.dkFg3, letterSpacing: '.08em' }}>{h.toUpperCase()}</div>
            ))}
          </div>
          {(restaurantes || []).length === 0 && (
            <div style={{ padding: '24px 20px', fontFamily: SN, fontSize: 13, color: C.dkFg3 }}>Sin cobros QR registrados este mes</div>
          )}
          {(restaurantes || []).map((r: any, i: number) => (
            <div key={r.restaurante_id} className="super-rest-table-row" style={{ gap: 0, padding: '12px 20px', borderBottom: i < restaurantes.length - 1 ? `1px solid ${C.dkRule}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.03)' }}>
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.dkFg }}>{r.restaurante_nombre}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                  <span style={{ fontFamily: SM, fontSize: 9, color: C.dkFg3 }}>{r.codigo_acceso}</span>
                  {r.ia_cobro_activo && <span style={{ fontFamily: SM, fontSize: 9, color: C.green, background: 'rgba(63,125,68,0.15)', borderRadius: 10, padding: '1px 6px' }}>COBRO ON</span>}
                  <span style={{ fontFamily: SM, fontSize: 9, color: C.dkFg3, background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '1px 6px' }}>{r.modo_cobro}</span>
                </div>
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.dkFg2, paddingTop: 2 }}>{r.ciudad || '—'}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: r.volumen_mes_actual > 0 ? C.dkFg : C.dkFg3 }}>{fmtK(r.volumen_mes_actual)}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: r.comision_mes_actual > 0 ? C.green : C.dkFg3 }}>{fmt(r.comision_mes_actual)}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: C.dkFg2 }}>{r.txn_mes_actual || '—'}</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: r.descuento_mes_actual > 0 ? C.amber : C.dkFg3 }}>
                {r.descuento_mes_actual > 0 ? `-${r.descuento_mes_actual}€` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico global últimos 12 meses */}
      {historico && historico.length > 0 && (
        <div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 14 }}>HISTÓRICO · PLATAFORMA COMPLETA</div>
          <div style={{ background: C.dark2, borderRadius: 14, border: `1px solid ${C.dkRule}`, overflow: 'hidden' }}>
            <div className="super-hist-hdr" style={{ padding: '10px 20px', borderBottom: `1px solid ${C.dkRule}` }}>
              {['Mes', 'Volumen', 'Comisión', 'Txn'].map(h => (
                <div key={h} style={{ fontFamily: SM, fontSize: 9, color: C.dkFg3, letterSpacing: '.08em' }}>{h.toUpperCase()}</div>
              ))}
            </div>
            {historico.map((h: any, i: number) => {
              const d = new Date(h.mes + 'T12:00:00Z')
              const label = d.toLocaleString('es', { month: 'long', year: 'numeric' })
              return (
                <div key={h.mes} className="super-hist-row" style={{ padding: '11px 20px', borderBottom: i < historico.length - 1 ? `1px solid ${C.dkRule}` : 'none' }}>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.dkFg2, textTransform: 'capitalize' }}>{label}</div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ height: 6, borderRadius: 3, background: C.red, width: `${Math.min(100, (h.volumen / (historico[0]?.volumen || 1)) * 100)}%`, minWidth: 4, maxWidth: 160 }} />
                      <span style={{ fontFamily: SM, fontSize: 12, color: C.dkFg }}>{fmtK(h.volumen)}</span>
                    </div>
                  </div>
                  <div style={{ fontFamily: SM, fontSize: 12, color: C.green }}>{fmt(h.comision)}</div>
                  <div style={{ fontFamily: SM, fontSize: 12, color: C.dkFg3 }}>{h.txn || '—'}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Tab: Leads (super_admin) ─── */
const ESTADOS_LEAD = ['nuevo','contactado','demo','cliente','descartado'] as const
type EstadoLead = typeof ESTADOS_LEAD[number]
const ESTADO_COLOR: Record<EstadoLead, string> = {
  nuevo:       '#E8A33B',
  contactado:  '#3B8BE8',
  demo:        '#7B5EA7',
  cliente:     '#3F7D44',
  descartado:  '#6B5F52',
}
const EVENTO_EMOJIS = ['💬','✉️','📞','📅','🤝','💡','⚠️','✅','📋','🔍']
interface LeadEvento { tipo: string; texto: string; fecha: string }
interface Lead {
  id: string; nombre: string; restaurante: string; telefono: string; email?: string
  estado: EstadoLead; estado_pipeline?: string | null; notas: string | null; created_at: string
  tipo: 'online' | 'personal'; locales?: string; tpv?: string; contacto?: string
  eventos: LeadEvento[]
  propuesta_slug?: string; landing_slug?: string; landing_vista_at?: string; landing_vistas?: number
  propuesta_url?: string; propuesta_vista_at?: string
  ciudad?: string; empresa?: string; origen?: string | null
  puntuacion?: number | null
  ultima_actividad_at?: string | null
  siguiente_contacto_texto?: string | null; siguiente_contacto_at?: string | null
  leads_contactos?: { id: string; nombre: string; cargo: string | null; telefono: string | null; email: string | null; es_decisor: boolean; canal_preferido: string }[]
}

function LandingStatsCard({ C, SN, SM, sh }: { C: any; SN: string; SM: string; sh: () => Record<string, string> }) {
  const [s, setS] = useState<any>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    fetch('/api/super/leads-landing', { headers: sh() })
      .then(r => r.json())
      .then(d => { if (d && typeof d.hoy === 'number') setS(d); else setErr(true) })
      .catch(() => setErr(true))
  }, [])
  if (err) return null
  const Stat = ({ label, value, accent }: { label: string; value: any; accent?: boolean }) => (
    <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 110 }}>
      <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink4, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 30, fontWeight: 500, lineHeight: 1, color: accent ? C.red : C.ink }}>{value}</div>
    </div>
  )
  return (
    <div style={{ marginBottom: 24, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 18, background: C.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em' }}>FORMULARIOS DE LA LANDING</div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{s ? `${s.total} en total` : ''}</div>
      </div>
      {!s ? (
        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink4 }}>Cargando…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="Hoy" value={s.hoy} accent={s.hoy > 0} />
            <Stat label="Ayer" value={s.ayer} />
            <Stat label="Últimos 7 días" value={s.d7} />
            <Stat label="Últimos 30 días" value={s.d30} />
          </div>
          {Array.isArray(s.porFuente30) && s.porFuente30.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {s.porFuente30.map((f: any) => (
                <span key={f.fuente} style={{ fontFamily: SM, fontSize: 11, color: C.ink3, background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 20, padding: '4px 10px' }}>
                  {String(f.fuente).replace('landing-', '')} · {f.n}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 12 }}>
            Esto son formularios, no visitas de página. Las visitas viven en Google Analytics · G-EN2YQLRLEX
          </div>
        </>
      )}
    </div>
  )
}

function WebVisitsCard({ C, SN, SM, sh }: { C: any; SN: string; SM: string; sh: () => Record<string, string> }) {
  const [d, setD] = useState<any>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    fetch('/api/super/ga4-stats', { headers: sh() })
      .then(r => r.json())
      .then(setD)
      .catch(() => setD({ configured: false, error: 'No se pudo cargar' }))
      .finally(() => setLoaded(true))
  }, [])
  const Stat = ({ label, value, accent }: { label: string; value: any; accent?: boolean }) => (
    <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 110 }}>
      <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink4, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 30, fontWeight: 500, lineHeight: 1, color: accent ? C.red : C.ink }}>{value}</div>
    </div>
  )
  return (
    <div style={{ marginBottom: 24, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 18, background: C.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em' }}>VISITAS DE LA WEB</div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Google Analytics</div>
      </div>
      {!loaded ? (
        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink4 }}>Cargando…</div>
      ) : d?.configured ? (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="Hoy" value={d.sesiones?.hoy ?? 0} accent={(d.sesiones?.hoy ?? 0) > 0} />
            <Stat label="Ayer" value={d.sesiones?.ayer ?? 0} />
            <Stat label="Últimos 7 días" value={d.sesiones?.d7 ?? 0} />
            <Stat label="Últimos 30 días" value={d.sesiones?.d30 ?? 0} />
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 10 }}>
            Sesiones · 7d: {d.usuarios?.d7 ?? 0} usuarios · {d.vistas?.d7 ?? 0} páginas vistas
          </div>
          {Array.isArray(d.topFuentes) && d.topFuentes.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {d.topFuentes.map((f: any) => (
                <span key={f.fuente} style={{ fontFamily: SM, fontSize: 11, color: C.ink3, background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 20, padding: '4px 10px' }}>
                  {f.fuente} · {f.sesiones}
                </span>
              ))}
            </div>
          )}
          {Array.isArray(d.topPaginas) && d.topPaginas.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink4, marginBottom: 6 }}>Páginas top · 7d</div>
              {d.topPaginas.map((p: any) => (
                <div key={p.path} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 12, color: C.ink2 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '78%' }}>{p.path}</span>
                  <span style={{ fontFamily: SM, color: C.ink3 }}>{p.vistas}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, lineHeight: 1.6 }}>
          Visitas no disponibles todavía.
          {d?.error ? <span style={{ display: 'block', fontFamily: SM, fontSize: 11, color: C.ink4, marginTop: 4 }}>Detalle: {String(d.error)}</span> : null}
        </div>
      )}
    </div>
  )
}

function LeadsTab({ C, SN, SM }: { C: any; SE: string; SN: string; SM: string }) {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '', 'Content-Type': 'application/json' })
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<Lead | null>(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [showHunter, setShowHunter] = useState(false)
  const [eventoTexto, setEventoTexto] = useState<Record<string, string>>({})
  const [eventoTipo, setEventoTipo] = useState<Record<string, string>>({})
  const [vistaKanban, setVistaKanban] = useState(true)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroOrigen, setFiltroOrigen] = useState<'todos'|'web'|'apify'|'otros'>('todos')
  const [form, setForm] = useState({ nombre: '', restaurante: '', telefono: '', email: '', locales: '', tpv: '', contacto: '', notas: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/super/leads', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.leads) setLeads(d.leads)
        else console.error('Leads error:', d.error)
      })
      .catch(e => console.error('Leads fetch error:', e))
      .finally(() => setLoading(false))
  }, [])

  const cambiarEstado = async (lead: Lead) => {
    const idx = ESTADOS_LEAD.indexOf(lead.estado)
    const next = ESTADOS_LEAD[(idx + 1) % ESTADOS_LEAD.length]
    const r = await fetch(`/api/super/leads/${lead.id}`, { method: 'PATCH', headers: sh(), body: JSON.stringify({ estado: next }) })
    const d = await r.json()
    if (d.lead) setLeads(prev => prev.map(l => l.id === lead.id ? d.lead : l))
  }

  const addEvento = async (lead: Lead) => {
    const texto = (eventoTexto[lead.id] || '').trim()
    if (!texto) return
    const tipo = eventoTipo[lead.id] || '💬'
    const r = await fetch(`/api/super/leads/${lead.id}`, { method: 'PATCH', headers: sh(), body: JSON.stringify({ evento: { tipo, texto } }) })
    const d = await r.json()
    if (d.lead) {
      setLeads(prev => prev.map(l => l.id === lead.id ? d.lead : l))
      setEventoTexto(p => ({ ...p, [lead.id]: '' }))
    }
  }

  const crearLeadPersonal = async () => {
    if (!form.nombre || !form.restaurante) return
    setSaving(true)
    const r = await fetch('/api/super/leads', { method: 'POST', headers: sh(), body: JSON.stringify(form) })
    const d = await r.json()
    if (d.lead) {
      setLeads(prev => [d.lead, ...prev])
      setModalNuevo(false)
      setForm({ nombre: '', restaurante: '', telefono: '', email: '', locales: '', tpv: '', contacto: '', notas: '' })
      setExpandido(d.lead.id)
    }
    setSaving(false)
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const fmtFecha = (f: string) => f

  // ── Búsqueda + filtros + priorización (para navegar con muchos leads) ──────
  const _q = busqueda.trim().toLowerCase()
  const _norm = (s?: string | null) => (s || '').toLowerCase()
  const leadsVisibles = leads.filter(l => {
    if (filtroOrigen === 'web'   && l.origen !== 'inbound_web') return false
    if (filtroOrigen === 'apify' && l.origen !== 'apify_google_places') return false
    if (filtroOrigen === 'otros' && (l.origen === 'inbound_web' || l.origen === 'apify_google_places')) return false
    if (!_q) return true
    return [l.restaurante, l.nombre, l.empresa, l.ciudad, l.email, l.telefono].some(v => _norm(v).includes(_q))
  })
  // Calientes (web) primero, luego mayor puntuación, luego más recientes.
  const ordenar = (arr: Lead[]) => [...arr].sort((a, b) =>
    (a.origen === 'inbound_web' ? 0 : 1) - (b.origen === 'inbound_web' ? 0 : 1)
    || (b.puntuacion ?? -1) - (a.puntuacion ?? -1)
    || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  )
  const TOPE_COLUMNA = 60 // evita pintar cientos de cards en una columna
  const personales = ordenar(leadsVisibles.filter(l => l.tipo === 'personal'))
  const online = ordenar(leadsVisibles.filter(l => l.tipo !== 'personal'))

  const CardLead = ({ lead }: { lead: Lead }) => {
    const activo = seleccionado?.id === lead.id
    // Contacto principal: decisor si existe, o primero, o fallback a campos legacy
    const contactoPrincipal = lead.leads_contactos?.find(c => c.es_decisor)
      ?? lead.leads_contactos?.[0]
    const nombreContacto = contactoPrincipal?.nombre ?? lead.nombre ?? lead.contacto
    const telContacto = contactoPrincipal?.telefono ?? lead.telefono
    return (
      <div
        onClick={() => setSeleccionado(activo ? null : lead)}
        style={{
          background: activo ? C.bg3 : C.bg2,
          border: `1px solid ${activo ? C.red : C.rule}`,
          borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
          transition: 'all .15s', display: 'flex', gap: 12, alignItems: 'flex-start'
        }}
      >
        {/* Indicador estado */}
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLOR[lead.estado], flexShrink: 0, marginTop: 5 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Empresa */}
          <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
            {lead.restaurante || lead.nombre}
          </div>
          {/* Contacto principal */}
          {nombreContacto && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: C.ink3, fontFamily: SM }}>👤 {nombreContacto}{contactoPrincipal?.cargo ? ` · ${contactoPrincipal.cargo}` : ''}</span>
              {telContacto && (
                <a href={`https://wa.me/${telContacto.replace(/\D/g, '')}`} target="_blank" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: C.green, textDecoration: 'none' }}>💬</a>
              )}
            </div>
          )}
          {/* Subtítulo: ciudad / TPV */}
          <div style={{ fontSize: 11, color: C.ink3, marginBottom: 6 }}>
            {[lead.tpv, lead.locales].filter(Boolean).join(' · ') || lead.ciudad || '—'}
          </div>
          {/* Pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: ESTADO_COLOR[lead.estado], background: ESTADO_COLOR[lead.estado] + '22', borderRadius: 3, padding: '2px 6px', textTransform: 'uppercase' }}>
              {lead.estado}
            </span>
            {/* Sub-fase del bot (estado_pipeline) — solo las que aportan info */}
            {(() => {
              const PIPE: Record<string, string> = {
                prospecto_ia: '🤖 prospecto IA', estudiando: '🔍 investigando',
                esperando_ok: '⏳ esperando OK', propuesta_lista: '📄 propuesta lista',
                reunion_agendada: '📅 reunión',
              }
              const lbl = lead.estado_pipeline ? PIPE[lead.estado_pipeline] : null
              return lbl ? (
                <span style={{ fontSize: 9, color: C.amber, background: C.amber + '22', borderRadius: 3, padding: '2px 6px' }}>{lbl}</span>
              ) : null
            })()}
            {lead.origen === 'inbound_web' && (
              <span style={{ fontSize: 9, fontWeight: 700, color: C.green, background: C.green + '22', borderRadius: 3, padding: '2px 6px' }}>🔥 web</span>
            )}
            {lead.puntuacion != null && (
              <span style={{ fontSize: 10, color: C.ink3, background: C.bg3, borderRadius: 3, padding: '2px 5px' }}>
                ★ {lead.puntuacion}
              </span>
            )}
            {lead.propuesta_url && (
              <span style={{ fontSize: 9, color: C.green, background: C.green + '22', borderRadius: 3, padding: '2px 5px' }}>
                propuesta enviada
              </span>
            )}
          </div>
        </div>

        {/* Flecha si seleccionado */}
        {activo && <span style={{ color: C.red, fontSize: 16, flexShrink: 0 }}>›</span>}
      </div>
    )
  }

  // ── Mover etapa (drag & drop y click directo) ──────────────────────────
  const moverEtapa = async (leadId: string, nuevoEstado: EstadoLead) => {
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.estado === nuevoEstado) return
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, estado: nuevoEstado } as Lead : l))
    if (seleccionado?.id === leadId) setSeleccionado(prev => prev ? { ...prev, estado: nuevoEstado } as Lead : null)
    await fetch(`/api/super/leads/${leadId}`, {
      method: 'PATCH', headers: sh(),
      body: JSON.stringify({ estado: nuevoEstado })
    })
  }

  // ── Kanban ─────────────────────────────────────────────────────────────
  const COLUMNAS: { key: EstadoLead; label: string; emoji: string }[] = [
    { key: 'nuevo',      label: 'Nuevo',      emoji: '🌱' },
    { key: 'contactado', label: 'Contactado', emoji: '📞' },
    { key: 'demo',       label: 'Demo',       emoji: '🎯' },
    { key: 'cliente',    label: 'Ganado',     emoji: '✅' },
    { key: 'descartado', label: 'Descartado', emoji: '❌' },
  ]

  const KanbanView = () => (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start', WebkitOverflowScrolling: 'touch' as any, marginLeft: -4, marginRight: -4, paddingLeft: 4 }}>
      {COLUMNAS.map(col => {
        const colLeadsAll = ordenar(leadsVisibles.filter(l => l.estado === col.key))
        const colLeads = colLeadsAll.slice(0, TOPE_COLUMNA)
        const isOver = dragOver === col.key
        return (
          <div
            key={col.key}
            onDragOver={e => { e.preventDefault(); setDragOver(col.key) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null) }}
            onDrop={e => { e.preventDefault(); moverEtapa(e.dataTransfer.getData('leadId'), col.key); setDragOver(null) }}
            style={{
              flexShrink: 0, width: 210,
              background: isOver ? C.bg3 : C.bg2,
              border: `1px solid ${isOver ? C.red : C.rule}`,
              borderRadius: 8,
              transition: 'border-color .15s',
            }}
          >
            {/* Cabecera columna */}
            <div style={{ padding: '10px 12px 8px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {col.label}
              </span>
              <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3, background: C.bg3, borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
                {colLeadsAll.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', gap: 5, minHeight: 60 }}>
              {colLeads.length === 0 && (
                <div style={{ padding: '12px 8px', color: C.ink3, fontSize: 11, fontFamily: SM, textAlign: 'center' }}>
                  —
                </div>
              )}
              {colLeads.map(lead => {
                const activo = seleccionado?.id === lead.id
                const dias = lead.ultima_actividad_at
                  ? Math.floor((Date.now() - new Date(lead.ultima_actividad_at).getTime()) / 86400000)
                  : null
                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={e => e.dataTransfer.setData('leadId', lead.id)}
                    onClick={() => setSeleccionado(activo ? null : lead)}
                    style={{
                      background: C.bg3,
                      border: `1px solid ${activo ? C.red : C.rule}`,
                      borderRadius: 6,
                      padding: '9px 10px',
                      cursor: 'grab',
                      transition: 'border-color .12s',
                    }}
                  >
                    <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 3, lineHeight: 1.2 }}>
                      {lead.restaurante || lead.nombre}
                    </div>
                    {(() => {
                      const cp = lead.leads_contactos?.find(c => c.es_decisor) ?? lead.leads_contactos?.[0]
                      const nombre = cp?.nombre ?? lead.nombre ?? lead.contacto
                      const tel = cp?.telefono ?? lead.telefono
                      return nombre ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>👤 {nombre}</span>
                          {tel && <a href={`https://wa.me/${tel.replace(/\D/g,'')}`} target="_blank" onClick={e=>e.stopPropagation()} style={{ fontSize: 10, color: C.green, textDecoration: 'none' }}>💬</a>}
                        </div>
                      ) : null
                    })()}
                    {lead.tpv && (
                      <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4 }}>
                        {lead.tpv}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {lead.puntuacion != null && (
                        <span style={{ fontFamily: SM, fontSize: 10, color: lead.puntuacion >= 70 ? C.green : lead.puntuacion >= 45 ? C.amber : C.ink3 }}>
                          {lead.puntuacion}pts
                        </span>
                      )}
                      {dias != null && dias > 10 && (
                        <span style={{ fontFamily: SM, fontSize: 10, color: C.amber, marginLeft: 'auto' }}>
                          {dias}d
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {colLeadsAll.length > colLeads.length && (
                <div style={{ padding: '6px 8px', textAlign: 'center', fontFamily: SM, fontSize: 10, color: C.ink3 }}>
                  +{colLeadsAll.length - colLeads.length} más · usa el buscador
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )


  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 8 }}>COMERCIAL</div>
          <h1 style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 40, fontWeight: 500, margin: '0 0 6px', color: C.ink }}>Leads</h1>
          <p style={{ fontFamily: SN, fontSize: 14, color: C.ink3, margin: 0 }}>
            {leads.length} empresas &middot; {leads.filter(l => l.estado === 'cliente').length} clientes
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 3, gap: 2 }}>
            <button onClick={() => setVistaKanban(true)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: SM, fontSize: 12, fontWeight: 600, background: vistaKanban ? C.red : 'transparent', color: vistaKanban ? '#fff' : C.ink3 }}>
              Kanban
            </button>
            <button onClick={() => setVistaKanban(false)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: SM, fontSize: 12, fontWeight: 600, background: !vistaKanban ? C.red : 'transparent', color: !vistaKanban ? '#fff' : C.ink3 }}>
              Lista
            </button>
          </div>
          <button onClick={() => setShowHunter(v => !v)} style={{ background: showHunter ? C.amber : `${C.amber}20`, color: showHunter ? '#000' : C.amber, border: `1px solid ${C.amber}60`, borderRadius: 10, padding: '10px 18px', fontFamily: SM, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Lead Hunter IA
          </button>
          <button onClick={() => setModalNuevo(true)} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontFamily: SM, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            + Nueva empresa
          </button>
        </div>
      </div>

      {/* Buscador + filtros por origen (para navegar con muchos leads) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre, ciudad, email, teléfono…"
          style={{ flex: '1 1 240px', minWidth: 0, background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '9px 12px', color: C.ink, fontFamily: SN, fontSize: 13, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([
            { k: 'todos', label: 'Todos' },
            { k: 'web',   label: '🔥 Web' },
            { k: 'apify', label: '🤖 Apify' },
            { k: 'otros', label: 'Otros' },
          ] as { k: 'todos'|'web'|'apify'|'otros'; label: string }[]).map(f => (
            <button key={f.k} onClick={() => setFiltroOrigen(f.k)}
              style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: SM, fontSize: 12, fontWeight: 600,
                border: `1px solid ${filtroOrigen === f.k ? C.red : C.rule}`,
                background: filtroOrigen === f.k ? C.red : C.bg2,
                color: filtroOrigen === f.k ? '#fff' : C.ink3 }}>
              {f.label}
            </button>
          ))}
        </div>
        {(busqueda || filtroOrigen !== 'todos') && (
          <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>{leadsVisibles.length} resultado{leadsVisibles.length === 1 ? '' : 's'}</span>
        )}
      </div>

      <LandingStatsCard C={C} SN={SN} SM={SM} sh={sh} />

      <WebVisitsCard C={C} SN={SN} SM={SM} sh={sh} />

      {showHunter && <LeadHunterPanel C={C} SN={SN} SM={SM} onLeadCreado={(lead: Lead) => setLeads(prev => [lead, ...prev])} sh={sh} />}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: C.ink3, fontFamily: SM, fontSize: 13 }}>Cargando...</div>
      )}

      {!loading && vistaKanban && (
        <div style={{ marginBottom: 16 }}>
          <KanbanView />
        </div>
      )}

      {!loading && !vistaKanban && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.amber, fontWeight: 700, marginBottom: 8 }}>
              PERSONALES ({personales.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {personales.length === 0
                ? <div style={{ color: C.ink3, fontSize: 12, fontStyle: 'italic' }}>Sin leads personales</div>
                : personales.map(l => <CardLead key={l.id} lead={l} />)
              }
            </div>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink2, fontWeight: 700, marginBottom: 8 }}>
              ONLINE ({online.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {online.length === 0
                ? <div style={{ color: C.ink3, fontSize: 12, fontStyle: 'italic' }}>Sin leads online</div>
                : online.slice(0, 80).map(l => <CardLead key={l.id} lead={l} />)
              }
              {online.length > 80 && (
                <div style={{ color: C.ink3, fontSize: 11, fontFamily: SM, padding: '6px 2px' }}>+{online.length - 80} más · usa el buscador o los filtros</div>
              )}
            </div>
          </div>
        </div>
      )}

      {seleccionado && (
        <div style={{ marginTop: 12, background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, overflow: 'hidden' }}>
          <CRMEmpresaDetalle
            lead={seleccionado as Parameters<typeof CRMEmpresaDetalle>[0]['lead']}
            sh={sh}
            onUpdate={(updated) => {
              setLeads(prev => prev.map(l => l.id === seleccionado.id ? { ...l, ...updated } as Lead : l))
              setSeleccionado(prev => prev ? { ...prev, ...updated } as Lead : null)
            }}
            onDelete={async () => {
              if (!confirm('Eliminar este lead?')) return
              await fetch(`/api/super/leads/${seleccionado.id}`, { method: 'DELETE', headers: sh() })
              setLeads(prev => prev.filter(l => l.id !== seleccionado.id))
              setSeleccionado(null)
              setExpandido(null)
            }}
          />
        </div>
      )}

      {modalNuevo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setModalNuevo(false)}>
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontSize: 24, fontWeight: 500, color: C.ink, marginBottom: 20 }}>Nueva empresa</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                ['restaurante', 'Empresa / Grupo *'],
                ['nombre', 'Primer contacto (nombre)'],
                ['telefono', 'Telefono'],
                ['email', 'Email'],
                ['locales', 'N locales'],
                ['tpv', 'TPV actual'],
                ['notas', 'Notas'],
              ] as [keyof typeof form, string][]).map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginBottom: 4 }}>{label}</div>
                  <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} style={{ width: '100%', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '8px 12px', color: C.ink, fontFamily: SN, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalNuevo(false)} style={{ background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 18px', color: C.ink3, fontFamily: SM, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={crearLeadPersonal} disabled={saving || !form.nombre || !form.restaurante} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontFamily: SM, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (saving || !form.nombre || !form.restaurante) ? .5 : 1 }}>
                {saving ? 'Guardando...' : 'Crear empresa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panel de soporte para Alberto en /super ──────────────────────────────────
function SoporteSuperTab({ session, C, SE, SN, SM, onBadge }: { session: any; C: any; SE: string; SN: string; SM: string; onBadge: (n: number) => void }) {
  const [tickets, setTickets] = React.useState<any[]>([])
  const [ticketActivo, setTicketActivo] = React.useState<any>(null)
  const [mensajes, setMensajes] = React.useState<any[]>([])
  const [respuesta, setRespuesta] = React.useState('')
  const [enviando, setEnviando] = React.useState(false)
  const [filtro, setFiltro] = React.useState<'todos'|'escalado'|'abierto'|'resuelto'>('escalado')
  const finRef = React.useRef<HTMLDivElement>(null)

  const cargar = React.useCallback(async () => {
    const url = filtro === 'todos' ? '/api/super/soporte' : `/api/super/soporte?estado=${filtro}`
    const r = await fetch(url, { headers: { 'x-ia-session': JSON.stringify(session) } })
    const d = await r.json()
    setTickets(d.tickets ?? [])
    onBadge((d.tickets ?? []).filter((t: any) => t.estado === 'escalado').length)
  }, [session, filtro, onBadge])

  React.useEffect(() => { cargar() }, [cargar])

  async function abrirTicket(ticket: any) {
    setTicketActivo(ticket)
    const r = await fetch(`/api/owner/soporte?ticket_id=${ticket.id}`, {
      headers: { 'x-ia-restaurante-id': ticket.restaurante_id },
    })
    const d = await r.json()
    setMensajes(d.mensajes ?? [])
    setTimeout(() => finRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function responder() {
    if (!respuesta.trim() || !ticketActivo || enviando) return
    setEnviando(true)
    await fetch('/api/super/soporte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ ticket_id: ticketActivo.id, texto: respuesta.trim() }),
    })
    setMensajes(prev => [...prev, { rol: 'alberto', texto: respuesta.trim(), created_at: new Date().toISOString() }])
    setRespuesta('')
    setEnviando(false)
  }

  async function cerrar(ticketId: string) {
    await fetch('/api/super/soporte', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ ticket_id: ticketId, estado: 'resuelto' }),
    })
    setTicketActivo(null)
    cargar()
  }

  const ESTADO_COLOR: Record<string, string> = { escalado: C.red, abierto: C.amber, resuelto: C.green }

  return (
    <div className="super-ticket-layout" style={{ gridTemplateColumns: ticketActivo ? '320px 1fr' : '1fr', gap: 24, alignItems: 'start' }}>
      {/* Lista tickets */}
      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['escalado', 'abierto', 'resuelto', 'todos'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{
              fontFamily: SM, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
              padding: '5px 12px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${filtro === f ? C.red : C.rule}`,
              background: filtro === f ? C.red : C.bg2, color: filtro === f ? '#fff' : C.ink3,
            }}>{f}</button>
          ))}
        </div>

        {tickets.length === 0 ? (
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, padding: '32px 0', textAlign: 'center' }}>
            Sin tickets {filtro !== 'todos' ? `con estado "${filtro}"` : ''}
          </div>
        ) : tickets.map((t: any) => (
          <button key={t.id} onClick={() => abrirTicket(t)} style={{
            width: '100%', textAlign: 'left', background: ticketActivo?.id === t.id ? C.bg3 : C.bg2,
            border: `1px solid ${ticketActivo?.id === t.id ? C.red : C.rule}`,
            borderRadius: 8, padding: '12px 14px', marginBottom: 6, cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink2 }}>
                {(t.restaurantes as any)?.nombre ?? '—'}
              </span>
              <span style={{ fontFamily: SM, fontSize: 9, color: ESTADO_COLOR[t.estado] ?? C.ink4, textTransform: 'uppercase', fontWeight: 700 }}>
                {t.estado}
              </span>
            </div>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.asunto || 'Sin título'}
            </div>
          </button>
        ))}
      </div>

      {/* Chat activo */}
      {ticketActivo && (
        <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink }}>{(ticketActivo.restaurantes as any)?.nombre ?? '—'}</div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{ticketActivo.asunto}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => cerrar(ticketActivo.id)} style={{ fontFamily: SN, fontSize: 11, background: C.greenS, color: C.green, border: `1px solid ${C.green}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>✓ Cerrar</button>
              <button onClick={() => setTicketActivo(null)} style={{ fontFamily: SN, fontSize: 11, background: C.bg3, color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mensajes.map((m: any, i: number) => (
              <div key={i} style={{ alignSelf: m.rol === 'usuario' ? 'flex-start' : m.rol === 'alberto' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                {m.rol !== 'usuario' && (
                  <div style={{ fontFamily: SM, fontSize: 9, color: m.rol === 'alberto' ? C.red : C.ink4, marginBottom: 2, textAlign: m.rol === 'alberto' ? 'right' : 'left' }}>
                    {m.rol === 'alberto' ? 'ALBERTO' : 'IA'}
                  </div>
                )}
                <div style={{
                  background: m.rol === 'usuario' ? C.bg3 : m.rol === 'alberto' ? C.redS : C.bg2,
                  border: `1px solid ${m.rol === 'alberto' ? C.red : C.rule}`,
                  borderRadius: 8, padding: '8px 12px',
                  fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {m.texto}
                </div>
              </div>
            ))}
            <div ref={finRef} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={respuesta}
              onChange={e => setRespuesta(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder() } }}
              placeholder="Escribe tu respuesta… (Enter para enviar)"
              rows={2}
              style={{ flex: 1, fontFamily: SN, fontSize: 13, color: C.ink, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 12px', resize: 'none', outline: 'none' }}
            />
            <button onClick={responder} disabled={!respuesta.trim() || enviando} style={{
              fontFamily: SN, fontSize: 12, fontWeight: 600, background: respuesta.trim() ? C.red : C.bg3,
              color: respuesta.trim() ? '#fff' : C.ink4, border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
            }}>
              {enviando ? '…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Lead Hunter IA Panel ─── */
function LeadHunterPanel({ C, SN, SM, onLeadCreado, sh }: { C: any; SN: string; SM: string; onLeadCreado: (lead: any) => void; sh: () => Record<string,string> }) {
  const [modo, setModo] = useState<'caption'|'url'>('caption')
  const [caption, setCaption] = useState('')
  const [urlNegocio, setUrlNegocio] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null) // para modo URL
  const [copiedDM, setCopiedDM] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [propuestaUrl, setPropuestaUrl] = useState<string|null>(null)
  const [propuestaTrackUrl, setPropuestaTrackUrl] = useState<string|null>(null)
  const [landingUrl, setLandingUrl] = useState<string|null>(null)
  const [showEmail, setShowEmail] = useState(false)
  const [emailContent, setEmailContent] = useState('')
  const [copiedEmail, setCopiedEmail] = useState(false)

  // ── Modo caption: analizar post ──────────────────
  const analizarCaption = async () => {
    if (!caption.trim()) return
    setLoading(true); setResult(null); setAnalysis(null); setGuardado(false); setPropuestaUrl(null); setShowEmail(false)
    try {
      const r = await fetch('/api/super/lead-hunter', { method: 'POST', headers: sh(), body: JSON.stringify({ caption, ciudad }) })
      const data = await r.json()
      if (!data.ok) { setResult({ error: data.error || 'No disponible' }); setLoading(false); return }
      const parsed = data.result
      setResult(parsed)
      if (parsed.es_lead) generarPropuesta(parsed, null)
    } catch(e: any) { setResult({ error: e.message }) }
    setLoading(false)
  }

  // ── Modo URL: analizar negocio ────────────────────
  const analizarURL = async () => {
    if (!urlNegocio.trim()) return
    setLoading(true); setResult(null); setAnalysis(null); setGuardado(false); setPropuestaUrl(null); setShowEmail(false)
    try {
      const r = await fetch('/api/super/lead-hunter', { method: 'POST', headers: sh(), body: JSON.stringify({ url: urlNegocio }) })
      const d = await r.json()
      if (!d.ok) { setAnalysis({ error: d.error }); setLoading(false); return }
      setAnalysis(d.analysis)
      generarPropuesta(null, d.analysis)
    } catch(e: any) { setAnalysis({ error: e.message }) }
    setLoading(false)
  }

  // ── Generar URL propuesta ─────────────────────────
  const generarPropuesta = (post: any, biz: any) => {
    const nombre = biz?.nombre || post?.nombre_local || 'Restaurante'
    const ciudad_ = biz?.ciudad || post?.ciudad || ciudad || 'España'
    const mrr = biz?.precio_mrr_estimado || 99
    const modulos = biz?.modulos_recomendados || ['voz','kds']

    const config = {
      nombre,
      grupo: biz?.grupo || nombre,
      emailContacto: biz?.email_contacto || 'hola@iarest.es',
      contactoNombre: biz?.nombre_contacto || 'equipo directivo',
      tagsIntro: [
        biz?.headline_operativa || `${biz?.num_mesas_estimado || '?'} mesas`,
        `${biz?.num_locales || 1} local${biz?.num_locales > 1 ? 'es' : ''}`,
        ciudad_,
        biz?.tipo_cocina || post?.tipo_cocina || 'hostelería',
      ].filter(Boolean),
      citas: [{ quien: biz?.nombre_contacto || 'Gerencia', cargo: 'Dirección', texto: biz?.cita_inventada || 'En servicio no podemos pararnos a mirar pantallas.' }],
      headline: biz?.headline_operativa || `${nombre} · ${ciudad_}`,
      partidas: [{ nombre: 'Sala', color: '#D9442B' }, { nombre: 'Barra', color: '#E8A33B' }],
      pasosFlujo: [
        { paso: '1', label: 'Camarero habla', desc: 'Dicta la comanda por voz en 3 segundos', color: '#D9442B' },
        { paso: '2', label: 'IA procesa', desc: 'Whisper + NIM estructuran el pedido', color: '#E8A33B' },
        { paso: '3', label: 'Cocina recibe', desc: 'KDS muestra la comanda en tiempo real', color: '#3F7D44' },
      ],
      slideStockLabel: 'El coste oculto',
      mercaderiaAnual: `${Math.round(mrr * 12 * 8)}€`,
      desviacion1pct: `${Math.round(mrr * 12 * 0.08)}€`,
      citaStock: biz?.cita_inventada || 'Lo que no controlas, lo pierdes.',
      hoyVsIaRest: {
        hoy: ['Comandas en papel o de memoria', 'Errores en hora punta', 'Sin datos de ventas en tiempo real'],
        iaRest: ['Voz directa a cocina en <1s', 'Cero errores por malentendidos', 'Analytics en tiempo real'],
      },
      datosEstrategicos: [
        { titulo: 'Integración inmediata', desc: 'Sin cambiar el hardware existente. Funciona en cualquier móvil.' },
        { titulo: `${mrr}€/mes`, desc: 'Sin comisión por venta. Sin permanencia.' },
        { titulo: '14 días de prueba', desc: 'Gratuita, sin tarjeta de crédito.' },
      ],
      modulos: modulos.slice(0, 4).map((m: string) => ({
        emoji: { voz:'🎙', kds:'📺', almacen:'📦', vinos:'🍷', eventos:'🎉', delivery:'🛵' }[m] || '✦',
        titulo: { voz:'Comandas por voz', kds:'KDS cocina', almacen:'Control de almacén', vinos:'Carta de vinos', eventos:'Módulo eventos', delivery:'Delivery propio' }[m] || m,
        sub: 'Incluido en el plan base',
        desc: 'Optimizado para el ritmo real de un restaurante en servicio.',
        ejemplos: [],
        ruta: '/edge',
        color: '#D9442B',
        roi: 'Ahorro real desde el primer día',
      })),
      objecionPrincipal: biz?.objecion_principal || '¿Y si el sistema falla en servicio?',
      respuestaObjecion: biz?.respuesta_objecion || 'Funciona offline. Sin internet, sigue funcionando con cache local.',
      fasePiloto: [
        { fase: 'Semana 1', color: '#E8A33B', items: ['Setup en 2 horas', 'Formación del equipo', 'Primer turno en producción'] },
        { fase: 'Semana 2-4', color: '#D9442B', items: ['Ajuste de carta y zonas', 'Optimización de flujos', 'Métricas de adopción'] },
        { fase: 'Mes 2+', color: '#3F7D44', items: ['100% autónomo', 'Soporte incluido', 'Nuevas funcionalidades'] },
      ],
      precioMensaje: `Desde ${mrr}€/mes · Sin comisiones · Sin permanencia`,
    }

    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(config)))))
    setPropuestaUrl(`/propuesta/preview?d=${encoded}`)
  }

  // ── Generar borrador email ────────────────────────
  const generarEmail = async () => {
    setShowEmail(true)
    const biz = analysis
    const post = result
    const nombre = biz?.nombre || post?.nombre_local || 'vuestro restaurante'
    const contacto = biz?.nombre_contacto || 'equipo'
    const ciudad_ = biz?.ciudad || post?.ciudad || ciudad || ''
    const senial = post?.tipo || 'apertura'

    try {
      const r = await fetch('/api/super/lead-hunter', {
        method: 'POST', headers: sh(),
        body: JSON.stringify({ modo: 'email', lead: {
          nombre, ciudad: ciudad_, senial,
          tpv: biz?.tpv_actual || post?.tpv_mencionado || 'desconocido',
          descripcion: biz?.descripcion_negocio || post?.notas || '',
          contacto,
        } }),
      })
      const d = await r.json()
      setEmailContent(d.ok ? (d.email || '') : `No se pudo generar el email: ${d.error || 'no disponible'}`)
    } catch (e: any) {
      setEmailContent(`No se pudo generar el email: ${e.message}`)
    }
  }

  const copiarEmail = () => {
    navigator.clipboard.writeText(emailContent)
    setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000)
  }

  const copiarDM = () => {
    navigator.clipboard.writeText(result?.dm_sugerido ?? '')
    setCopiedDM(true); setTimeout(() => setCopiedDM(false), 2000)
  }

  const guardarLead = async () => {
    const biz = analysis; const post = result
    const nombre = biz?.nombre || post?.nombre_local || 'Desconocido'
    // Generar token único para tracking
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const propuestaConfig = propuestaUrl ? propuestaUrl.replace('/propuesta/preview?d=', '') : ''
    const trackUrl = `https://www.iarest.es/api/track/${token}`
    // Generar slug personalizado: nombre-del-restaurante
    const landingSlug = nombre.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim()
      .replace(/\s+/g, '-').substring(0, 40)
    const landingUrl = `https://www.iarest.es/p/${landingSlug}`

    const body = {
      nombre: biz?.nombre_contacto || nombre,
      restaurante: nombre,
      telefono: biz?.telefono || '',
      email: biz?.email_contacto || '',
      ciudad: biz?.ciudad || post?.ciudad || '',
      locales: biz ? `${biz.num_locales || 1} locales` : post?.tamaño_estimado || '',
      tpv: biz?.tpv_actual || post?.tpv_mencionado || '',
      contacto: biz?.nombre_contacto || '',
      notas: `[Lead Hunter IA · ${modo}]\n${biz?.descripcion_negocio || post?.notas || ''}\n\nPágina personalizada: ${landingUrl}`,
      propuesta_token: token,
      propuesta_url: propuestaUrl ? `https://www.iarest.es${propuestaUrl}` : null,
      landing_slug: landingSlug,
      tipo_negocio: biz?.tipo_cocina || post?.tipo_cocina || '',
    }
    const resp = await fetch('/api/super/leads', { method: 'POST', headers: sh(), body: JSON.stringify(body) })
    const d = await resp.json()
    if (d.lead) {
      onLeadCreado(d.lead)
      setGuardado(true)
      setLandingUrl(landingUrl)
      // Actualizar con datos extras
      await fetch(`/api/super/leads`, {
        method: 'PATCH',
        headers: sh(),
        body: JSON.stringify({ id: d.lead.id, propuesta_token: token, propuesta_url: propuestaUrl ? `https://www.iarest.es${propuestaUrl}` : null, landing_slug: landingSlug, tipo_negocio: biz?.tipo_cocina || post?.tipo_cocina || '' })
      })
      setPropuestaTrackUrl(trackUrl)
    }
  }

  const limpiar = () => { setResult(null); setAnalysis(null); setCaption(''); setUrlNegocio(''); setGuardado(false); setPropuestaUrl(null); setPropuestaTrackUrl(null); setLandingUrl(null); setShowEmail(false); setEmailContent('') }

  const TIPO_COLOR: Record<string, string> = { apertura: '#3F7D44', queja_tpv: '#D9442B', reforma: '#E8A33B', otro: '#6B5F52' }
  const TIPO_LABEL: Record<string, string> = { apertura: '🟢 Apertura', queja_tpv: '🔴 Queja TPV', reforma: '🟡 Reforma', otro: '⚪ Otro' }

  const hasResult = result?.es_lead || analysis?.nombre

  return (
    <div style={{ background: `${C.amber}08`, border: `1px solid ${C.amber}30`, borderRadius: 14, padding: 20, marginBottom: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: SM, fontSize: 11, color: C.amber, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 700 }}>🎯 Lead Hunter IA</span>
        </div>
        {/* Selector modo */}
        <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden' }}>
          {(['caption','url'] as const).map(m => (
            <button key={m} onClick={() => { setModo(m); limpiar() }}
              style={{ padding: '6px 14px', border: 'none', background: modo === m ? C.amber : 'transparent', color: modo === m ? '#000' : C.ink3, fontFamily: SM, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '.05em' }}>
              {m === 'caption' ? '📋 Caption' : '🌐 URL negocio'}
            </button>
          ))}
        </div>
      </div>

      {/* Input según modo */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {modo === 'caption' ? (
          <textarea value={caption} onChange={e => setCaption(e.target.value)}
            placeholder="Pega el caption del post de Instagram o TikTok..."
            rows={3}
            style={{ flex: 1, minWidth: 200, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 12px', color: C.ink, fontFamily: SN, fontSize: 13, resize: 'vertical', outline: 'none' }}
          />
        ) : (
          <input value={urlNegocio} onChange={e => setUrlNegocio(e.target.value)}
            placeholder="https://restaurante.com o https://instagram.com/restaurante"
            style={{ flex: 1, minWidth: 200, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 12px', color: C.ink, fontFamily: SN, fontSize: 13, outline: 'none' }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
          {modo === 'caption' && (
            <select value={ciudad} onChange={e => setCiudad(e.target.value)}
              style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '8px 10px', color: C.ink, fontFamily: SM, fontSize: 12, cursor: 'pointer' }}>
              <option value="">Ciudad (auto)</option>
              {['Sevilla','Madrid','Barcelona','Valencia','Málaga','Bilbao','Córdoba'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button onClick={modo === 'caption' ? analizarCaption : analizarURL}
            disabled={loading || (modo === 'caption' ? !caption.trim() : !urlNegocio.trim())}
            style={{ background: C.amber, color: '#000', border: 'none', borderRadius: 8, padding: '10px 14px', fontFamily: SM, fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: loading ? .5 : 1, letterSpacing: '.05em' }}>
            {loading ? 'Analizando…' : '▶ Analizar'}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {(result?.error || analysis?.error) && (
        <div style={{ color: C.red, fontFamily: SM, fontSize: 12, padding: '8px 12px', background: `${C.red}10`, borderRadius: 8, marginTop: 8 }}>
          Error: {result?.error || analysis?.error}
        </div>
      )}

      {result && !result.error && !result.es_lead && (
        <div style={{ textAlign: 'center', padding: 16, color: C.ink3, fontFamily: SM, fontSize: 13, background: C.bg, borderRadius: 8, marginTop: 8 }}>
          🔇 No es un lead — {result.notas || 'El post no corresponde a una señal de oportunidad'}
        </div>
      )}

      {hasResult && (
        <div style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>

          {/* Cabecera resultado */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {result?.tipo && <span style={{ background: `${TIPO_COLOR[result.tipo]}20`, color: TIPO_COLOR[result.tipo], border: `1px solid ${TIPO_COLOR[result.tipo]}40`, borderRadius: 6, padding: '3px 10px', fontFamily: SM, fontSize: 11, fontWeight: 700 }}>{TIPO_LABEL[result.tipo]}</span>}
            <span style={{ fontFamily: SM, fontSize: 13, color: C.ink, fontWeight: 700 }}>{analysis?.nombre || result?.nombre_local || '—'}</span>
            {(analysis?.ciudad || result?.ciudad) && <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>📍 {analysis?.ciudad || result?.ciudad}</span>}
            {(analysis?.tipo_cocina || result?.tipo_cocina) && <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>🍽 {analysis?.tipo_cocina || result?.tipo_cocina}</span>}
            {analysis?.num_locales > 1 && <span style={{ fontFamily: SM, fontSize: 11, color: C.amber }}>🏢 {analysis.num_locales} locales</span>}
            {(analysis?.tpv_actual || result?.tpv_mencionado) && <span style={{ fontFamily: SM, fontSize: 11, color: C.red, fontWeight: 700 }}>⚠️ TPV: {analysis?.tpv_actual || result?.tpv_mencionado}</span>}
            {result?.urgencia && <span style={{ fontFamily: SM, fontSize: 11, color: result.urgencia === 'alta' ? C.red : result.urgencia === 'media' ? C.amber : C.ink3, fontWeight: 600 }}>● {result.urgencia.toUpperCase()}</span>}
            {analysis?.precio_mrr_estimado && <span style={{ fontFamily: SM, fontSize: 11, color: C.green, fontWeight: 700 }}>💶 ~{analysis.precio_mrr_estimado}€/mes</span>}
          </div>

          {/* Descripción negocio */}
          {analysis?.descripcion_negocio && (
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{analysis.descripcion_negocio}</div>
          )}

          {/* Puntos de dolor */}
          {analysis?.puntos_dolor?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em' }}>Puntos de dolor detectados</div>
              {analysis.puntos_dolor.map((p: string, i: number) => (
                <div key={i} style={{ fontFamily: SN, fontSize: 12, color: C.ink2, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: C.red, flexShrink: 0 }}>→</span>{p}
                </div>
              ))}
            </div>
          )}

          {/* Nota caption */}
          {result?.notas && (
            <div style={{ fontFamily: SN, fontSize: 12, color: C.amber, background: `${C.amber}10`, border: `1px solid ${C.amber}25`, borderRadius: 6, padding: '8px 12px' }}>
              💡 {result.notas}
            </div>
          )}

          {/* DM */}
          {result?.dm_sugerido && (
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>DM Instagram — listo para copiar</div>
              <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '12px 52px 12px 14px', fontFamily: SN, fontSize: 14, color: C.ink, lineHeight: 1.6 }}>
                {result.dm_sugerido}
              </div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginTop: 4 }}>{result.dm_sugerido.length}/200 caracteres</div>
              <button onClick={copiarDM} style={{ position: 'absolute', top: 30, right: 8, background: copiedDM ? '#3F7D44' : C.rule, color: copiedDM ? '#fff' : C.ink2, border: 'none', borderRadius: 6, padding: '5px 10px', fontFamily: SM, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {copiedDM ? '✓' : 'Copiar'}
              </button>
            </div>
          )}

          {/* Acciones principales */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {propuestaUrl && (
              <a href={propuestaUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, minWidth: 120, background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontFamily: SM, fontWeight: 600, fontSize: 12, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                🔗 Ver propuesta
              </a>
            )}
            <button onClick={() => { if (!showEmail) generarEmail(); else setShowEmail(false) }}
              style={{ flex: 1, minWidth: 120, background: showEmail ? C.bg2 : `${C.ink2}15`, color: showEmail ? C.ink3 : C.ink2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 14px', fontFamily: SM, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              ✉️ {showEmail ? 'Ocultar email' : 'Borrador email'}
            </button>
            <button onClick={async () => {
              const biz = analysis; const post = result
              const nombre = biz?.nombre || post?.nombre_local || 'Restaurante'
              const trackUrl = landingUrl || propuestaTrackUrl || (propuestaUrl ? `https://www.iarest.es${propuestaUrl}` : null)
              const msg = `🎯 <b>Lead Hunter IA</b>\n\n<b>${nombre}</b>\n📍 ${biz?.ciudad || post?.ciudad || '—'} · ${biz?.tipo_cocina || post?.tipo_cocina || '—'}\n💶 ~${biz?.precio_mrr_estimado || '?'}€/mes${biz?.email_contacto ? `\n📧 ${biz.email_contacto}` : ''}${biz?.telefono ? `\n📞 ${biz.telefono}` : ''}\n\n${(biz?.puntos_dolor || []).map((p: string) => `→ ${p}`).join('\n') || post?.notas || ''}\n\n<b>DM:</b>\n"${result?.dm_sugerido || '—'}"${trackUrl ? `\n\n🔗 <a href="${trackUrl}">Ver propuesta</a>` : ''}\n\n✅ ¿Mandamos?`
              await fetch('https://efncqyvhniaxsirhdxaa.supabase.co/functions/v1/tg-send', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-secret': 'iarest-tg-2026' },
                body: JSON.stringify({ mensaje: msg })
              })
            }} style={{ background: `${C.amber}20`, color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: '9px 14px', fontFamily: SM, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              📱 Telegram
            </button>
            <button onClick={guardarLead} disabled={guardado}
              style={{ flex: 1, minWidth: 120, background: guardado ? `${C.green}20` : C.green, color: guardado ? C.green : '#fff', border: guardado ? `1px solid ${C.green}50` : 'none', borderRadius: 8, padding: '9px 14px', fontFamily: SM, fontWeight: 600, fontSize: 12, cursor: guardado ? 'default' : 'pointer' }}>
              {guardado ? '✓ Guardado' : '+ Guardar lead'}
            </button>
            <button onClick={limpiar}
              style={{ background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 14px', color: C.ink3, fontFamily: SM, fontSize: 12, cursor: 'pointer' }}>
              ✕
            </button>
          </div>

          {/* URL personalizada generada */}
          {guardado && landingUrl && (
            <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}30`, borderRadius: 8, padding: '12px 14px', marginTop: 4 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.green, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>🔗 URL personalizada generada</div>
              <div style={{ fontFamily: SM, fontSize: 13, color: C.ink, wordBreak: 'break-all' as const }}>{landingUrl}</div>
              <button onClick={() => navigator.clipboard.writeText(landingUrl)} style={{ marginTop: 8, background: 'transparent', border: `1px solid ${C.green}50`, borderRadius: 6, padding: '4px 10px', color: C.green, fontFamily: SM, fontSize: 11, cursor: 'pointer' }}>
                Copiar para el DM
              </button>
            </div>
          )}

          {/* Email borrador */}
          {showEmail && (
            <div style={{ position: 'relative', marginTop: 4 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Borrador de email</div>
              {!emailContent ? (
                <div style={{ textAlign: 'center', padding: 20, color: C.ink3, fontFamily: SM, fontSize: 12 }}>Generando email…</div>
              ) : (
                <>
                  <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '14px 52px 14px 14px', fontFamily: SN, fontSize: 13, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {emailContent}
                  </div>
                  <button onClick={copiarEmail} style={{ position: 'absolute', top: 30, right: 8, background: copiedEmail ? '#3F7D44' : C.rule, color: copiedEmail ? '#fff' : C.ink2, border: 'none', borderRadius: 6, padding: '5px 10px', fontFamily: SM, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {copiedEmail ? '✓' : 'Copiar'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── BlogSuperTab ─────────────────────────────────────────────────────────────
function BlogSuperTab({ session, C, SE, SN, SM }: { session: any; C: any; SE: string; SN: string; SM: string }) {
  const [articulos, setArticulos] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filtroEstado, setFiltroEstado] = React.useState<'todos'|'publicado'|'borrador'>('todos')
  const [buscar, setBuscar] = React.useState('')
  const [publicando, setPublicando] = React.useState<string | null>(null)
  const [editando, setEditando] = React.useState<any | null>(null)
  const [editForm, setEditForm] = React.useState({ titulo: '', keyword: '', meta_description: '' })
  const [saving, setSaving] = React.useState(false)
  const [expandido, setExpandido] = React.useState<string | null>(null)
  const [ideasProveedores, setIdeasProveedores] = React.useState<any[]>([])

  React.useEffect(() => {
    fetch('/api/super/proveedores-tech?blog=true')
      .then(r => r.json())
      .then(d => setIdeasProveedores(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const cargar = React.useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroEstado !== 'todos') params.set('estado', filtroEstado)
    if (buscar) params.set('q', buscar)
    const res = await fetch(`/api/super/blog?${params}`, { headers: { 'x-ia-session': JSON.stringify(session) } })
    const data = await res.json()
    setArticulos(data.borradores ?? [])
    setLoading(false)
  }, [session, filtroEstado, buscar])

  React.useEffect(() => { cargar() }, [cargar])

  // Debounce búsqueda
  React.useEffect(() => {
    const t = setTimeout(() => cargar(), 400)
    return () => clearTimeout(t)
  }, [buscar])

  const publicar = async (id: string) => {
    setPublicando(id)
    const res = await fetch('/api/super/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ accion: 'publicar', id }),
    })
    const data = await res.json()
    if (data.ok) await cargar()
    else alert(data.error || 'Error al publicar')
    setPublicando(null)
  }

  const abrirEditor = (articulo: any) => {
    setEditando(articulo)
    setEditForm({ titulo: articulo.titulo, keyword: articulo.keyword || '', meta_description: articulo.meta_description || '' })
  }

  const guardarMeta = async () => {
    setSaving(true)
    await fetch('/api/super/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ accion: 'editar_meta', id: editando.id, ...editForm }),
    })
    setSaving(false)
    setEditando(null)
    await cargar()
  }

  const cargarTSX = async (slug: string) => {
    setExpandido(slug)
    await fetch('/api/super/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) },
      body: JSON.stringify({ accion: 'cargar_tsx', slug }),
    })
    await cargar()
  }

  const publicados = articulos.filter(a => a.estado === 'publicado').length
  const borradores = articulos.filter(a => a.estado === 'borrador').length

  const sh: Record<string, React.CSSProperties> = {
    input: { background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink, fontSize: 12, padding: '7px 12px', fontFamily: SN, outline: 'none', width: '100%' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 6 }}>BLOG · SEO AUTOMÁTICO</div>
          <h1 style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, margin: '0 0 4px', color: C.ink }}>Blog</h1>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: 0 }}>Artículos generados automáticamente · Revisa, edita y publica</p>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[{ label: 'publicados', val: publicados, color: '#3F7D44' }, { label: 'borradores', val: borradores, color: C.red }].map(k => (
            <div key={k.label} style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: SE, fontSize: 22, color: k.color }}>{k.val}</div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em' }}>{k.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={buscar} onChange={e => setBuscar(e.target.value)}
          placeholder="Buscar por título, keyword o slug..."
          style={{ ...sh.input, maxWidth: 320 }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['todos', 'publicado', 'borrador'] as const).map(f => (
            <button key={f} onClick={() => setFiltroEstado(f)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontFamily: SM, fontSize: 11, letterSpacing: '.06em',
              background: filtroEstado === f ? C.red : C.bone,
              color: filtroEstado === f ? '#fff' : C.ink3,
            }}>
              {f === 'todos' ? 'TODOS' : f === 'publicado' ? '✅ PUBLICADOS' : '📝 BORRADORES'}
            </button>
          ))}
        </div>
        {buscar && (
          <button onClick={() => setBuscar('')} style={{ background: 'none', border: 'none', color: C.ink4, cursor: 'pointer', fontFamily: SM, fontSize: 11 }}>✕ Limpiar</button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.ink4, fontFamily: SM, fontSize: 12 }}>cargando...</div>
      ) : articulos.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: C.ink4, fontFamily: SN, fontSize: 13 }}>
          {buscar ? `Sin resultados para "${buscar}"` : 'No hay artículos aún.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {articulos.map(a => (
            <div key={a.id} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {/* Franja estado */}
                <div style={{ width: 4, flexShrink: 0, background: a.estado === 'publicado' ? '#3F7D44' : C.red }} />

                <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{a.titulo}</div>
                      <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.05em' }}>
                        /blog/{a.slug}
                        {a.keyword && <span style={{ marginLeft: 10, color: C.ink4 }}>· {a.keyword}</span>}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                      fontFamily: SM, fontSize: 10, letterSpacing: '.06em',
                      background: a.estado === 'publicado' ? 'rgba(63,125,68,0.1)' : 'rgba(217,68,43,0.1)',
                      color: a.estado === 'publicado' ? '#3F7D44' : C.red,
                    }}>{a.estado.toUpperCase()}</span>
                  </div>

                  {a.meta_description && (
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
                      {a.meta_description.slice(0, 140)}{a.meta_description.length > 140 ? '...' : ''}
                    </div>
                  )}

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    {a.estado === 'borrador' && (
                      <button onClick={() => publicar(a.id)} disabled={publicando === a.id} style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        background: publicando === a.id ? C.rule : C.red,
                        color: publicando === a.id ? C.ink4 : '#fff',
                        fontFamily: SM, fontSize: 11, cursor: publicando === a.id ? 'default' : 'pointer',
                      }}>
                        {publicando === a.id ? 'Publicando...' : '✅ Publicar'}
                      </button>
                    )}
                    <button onClick={() => abrirEditor(a)} style={{
                      padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.rule}`,
                      background: 'none', color: C.ink3, fontFamily: SM, fontSize: 11, cursor: 'pointer',
                    }}>✏️ Editar meta</button>
                    <button onClick={() => window.open(`/blog/${a.slug}`, '_blank')} style={{
                      padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.rule}`,
                      background: 'none', color: C.ink3, fontFamily: SM, fontSize: 11, cursor: 'pointer',
                    }}>👁 Ver artículo</button>
                    {!a.contenido_tsx && (
                      <button onClick={() => cargarTSX(a.slug)} style={{
                        padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.rule}`,
                        background: 'none', color: C.ink4, fontFamily: SM, fontSize: 11, cursor: 'pointer',
                      }}>⬇️ Cargar TSX</button>
                    )}
                    <div style={{ marginLeft: 'auto', fontFamily: SM, fontSize: 10, color: C.ink4, alignSelf: 'center' }}>
                      {new Date(a.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ideas desde proveedores */}
      {ideasProveedores.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.rule}` }}>
          <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, color: C.ink, marginBottom: 4 }}>💡 Ideas desde Proveedores</div>
          <p style={{ fontFamily: SN, fontSize: 12, color: C.ink3, margin: '0 0 14px' }}>Contenido marcado en Proveedores como útil para blog</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ideasProveedores.map((item: any) => (
              <div key={item.id} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: 4, flexShrink: 0, background: '#E8A33B' }} />
                <div style={{ flex: 1, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: '#E8A33B', letterSpacing: '.06em' }}>{item.proveedor_nombre}</span>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>{item.categoria?.toUpperCase()}</span>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginLeft: 'auto' }}>
                      {item.fecha ? new Date(item.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''}
                    </span>
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{item.asunto}</div>
                  {item.resumen && (
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
                      {item.resumen.slice(0, 180)}{item.resumen.length > 180 ? '...' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal editor meta */}
      {editando && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20,
        }} onClick={() => setEditando(null)}>
          <div style={{
            background: C.paper, borderRadius: 12, padding: 28, maxWidth: 560, width: '100%',
            display: 'flex', flexDirection: 'column', gap: 16,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: SE, fontSize: 20, color: C.ink, marginBottom: 4 }}>Editar artículo</div>
            <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>/blog/{editando.slug}</div>

            {[
              { label: 'TÍTULO', key: 'titulo', placeholder: 'Título del artículo (55-60 chars)' },
              { label: 'KEYWORD', key: 'keyword', placeholder: 'Keyword SEO principal' },
              { label: 'META DESCRIPTION', key: 'meta_description', placeholder: 'Descripción SEO (150-160 chars)' },
            ].map(field => (
              <div key={field.key}>
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.08em', marginBottom: 5 }}>{field.label}</div>
                {field.key === 'meta_description' ? (
                  <textarea
                    value={(editForm as any)[field.key]}
                    onChange={e => setEditForm(p => ({ ...p, [field.key]: e.target.value }))}
                    rows={3} placeholder={field.placeholder}
                    style={{ ...sh.input, resize: 'vertical' }}
                  />
                ) : (
                  <input
                    value={(editForm as any)[field.key]}
                    onChange={e => setEditForm(p => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={sh.input}
                  />
                )}
                <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 2, textAlign: 'right' }}>
                  {(editForm as any)[field.key]?.length || 0} chars
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditando(null)} style={{
                padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.rule}`,
                background: 'none', color: C.ink3, fontFamily: SM, fontSize: 12, cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={guardarMeta} disabled={saving} style={{
                padding: '8px 18px', borderRadius: 6, border: 'none',
                background: saving ? C.rule : C.red, color: saving ? C.ink4 : '#fff',
                fontFamily: SM, fontSize: 12, cursor: saving ? 'default' : 'pointer',
              }}>{saving ? 'Guardando...' : '✅ Guardar'}</button>
            </div>

            {editando.estado === 'borrador' && (
              <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>
                <button onClick={() => { setEditando(null); publicar(editando.id) }} style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: C.red, color: '#fff', fontFamily: SM, fontSize: 12, cursor: 'pointer', width: '100%',
                }}>✅ Guardar y publicar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
