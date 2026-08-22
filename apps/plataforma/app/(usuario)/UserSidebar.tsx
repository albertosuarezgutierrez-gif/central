'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ThemeToggle from './ThemeToggle'

const NAV_NEGOCIO = [
  // 🏠 Inicio = Resumen + Banca FUSIONADOS (Fase 2). Una sola entrada: /banca con control
  // 💶 Dinero (saldos+movimientos+IA) | 🏢 Negocios (holding, antiguo Resumen). Absorbe también la
  // «Radiografía» y las entradas fiscales sueltas (rutas vivas, alcanzables desde sus enlaces).
  // /dashboard sigue existiendo pero redirige aquí (segmento Negocios).
  { href: '/banca', icon: '🏠', label: 'Inicio' },
  { href: '/banca/transferencia', icon: '💸', label: 'Transferencia' },
  { href: '/agente', icon: '🤖', label: 'Agente precios' },
  { href: '/contable', icon: '🧮', label: 'Contable' },
  { href: '/limpiezas', icon: '🧹', label: 'Limpiezas' },
  { href: '/comunicacion', icon: '💬', label: 'Comunicación' },
  { href: '/concursos', icon: '🏛️', label: 'Concursos' },
  { href: '/subastas', icon: '⚖️', label: 'Subastas y chollos' },
  { href: '/empresas', icon: '🏢', label: 'Empresas' },
  { href: '/trading', icon: '📈', label: 'Inversión' },
  { href: '/patrimonio', icon: '💼', label: 'Patrimonio' },
]

// Entrada única para una cuenta acotada a la sección Empresas (rol='empresas').
const NAV_SOLO_EMPRESAS = [{ href: '/empresas', icon: '🏢', label: 'Empresas' }]

const NAV_PISOS = [
  { href: '/sivra/resultado-pisos', icon: '📈', label: 'Resultado pisos' },
  { href: '/sivra/calendario', icon: '📅', label: 'Calendario' },
  { href: '/sivra/income', icon: '💰', label: 'Ingresos' },
  { href: '/sivra/expenses', icon: '🧾', label: 'Gastos' },
  { href: '/sivra/gastos-fijos', icon: '📋', label: 'Gastos fijos' },
  { href: '/sivra/facturas-control', icon: '🗂️', label: 'Facturas' },
  { href: '/sivra/fiscal', icon: '📊', label: 'Fiscal IRPF' },
  { href: '/sivra/mensajes', icon: '📨', label: 'Mensajes' },
  { href: '/sivra/mercado', icon: '📊', label: 'Competencia' },
  { href: '/sivra/pricing', icon: '🔬', label: 'Pricing Lab' },
  { href: '/sivra/pricing-auto', icon: '⚙️', label: 'Pricing auto' },
  { href: '/sivra/seo', icon: '🔍', label: 'SEO' },
  { href: '/sivra/limpiadoras', icon: '🛠️', label: 'Admin limpiezas' },
  { href: '/sivra/domotica', icon: '🌀', label: 'Domótica' },
]

const NAV_OPERADOR = [
  { href: '/operador/clientes', icon: '🏢', label: 'Clientes' },
  { href: '/operador/personas', icon: '👤', label: 'Personas' },
  { href: '/operador/flota-mapa', icon: '🛰️', label: 'Flota (mapa)' },
  { href: '/operador/iarest', icon: '🍽️', label: 'ia-rest' },
  { href: '/operador/iarest/restaurantes', icon: '🏪', label: 'Restaurantes', sub: true },
  { href: '/operador/iarest/cobros', icon: '💶', label: 'Cobros', sub: true },
  { href: '/operador/iarest/suscripciones', icon: '💳', label: 'Suscripciones', sub: true },
  { href: '/operador/iarest/soporte', icon: '🎫', label: 'Soporte', sub: true },
  { href: '/operador/iarest/sugerencias', icon: '💡', label: 'Sugerencias', sub: true },
  { href: '/operador/iarest/crecimiento', icon: '📈', label: 'Crecimiento', sub: true },
  { href: '/operador/iarest/sistema', icon: '🔬', label: 'Sistema', sub: true },
  { href: '/operador/iarest/crm', icon: '🎯', label: 'CRM', sub: true },
  { href: '/operador/actividad', icon: '👁️', label: 'Actividad ialimp' },
  { href: '/operador/agentes', icon: '🤖', label: 'Agentes' },
  { href: '/operador/ia', icon: '💸', label: 'IA · gasto' },
  { href: '/operador/rrhh', icon: '👥', label: 'RR.HH.' },
  { href: '/operador/rrhh/empleados', icon: '🧑‍💼', label: 'Empleados', sub: true },
  { href: '/operador/rrhh/solicitudes', icon: '📋', label: 'Solicitudes', sub: true },
  { href: '/operador/estructura', icon: '🗺️', label: 'Estructura' },
  { href: '/operador/secretos', icon: '🔑', label: 'Secretos' },
]

const NAV_OPERADOR_RESTRINGIDO = new Set(['/operador/clientes', '/operador/rrhh', '/operador/rrhh/empleados', '/operador/rrhh/solicitudes'])

export default function UserSidebar({ email, nombre, isOperator, operadorRol, rol }: { email: string; nombre: string; isOperator: boolean; operadorRol?: string; rol?: string | null }) {
  const path = usePathname()
  const router = useRouter()
  const soloEmpresas = rol === 'empresas'
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  function NavLinks() {
    return (
      <div style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', padding: '4px 12px 6px', textTransform: 'uppercase' }}>Mi negocio</div>
        {(soloEmpresas ? NAV_SOLO_EMPRESAS : NAV_NEGOCIO).map(({ href, icon, label }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px',
              borderRadius: '10px', marginBottom: '2px',
              fontWeight: active ? 600 : 400,
              background: active ? 'var(--primary-light)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--text)',
              fontSize: '14px', textDecoration: 'none',
            }}>
              <span>{icon}</span><span>{label}</span>
            </Link>
          )
        })}

        {!soloEmpresas && <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', padding: '16px 12px 6px', textTransform: 'uppercase' }}>Pisos · detalle</div>}
        {!soloEmpresas && NAV_PISOS.map(({ href, icon, label }) => {
          const active = path.startsWith(href)
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '10px', marginBottom: '2px',
              fontWeight: active ? 600 : 400,
              background: active ? 'var(--primary-light)' : 'transparent',
              color: active ? 'var(--primary)' : 'var(--text)',
              fontSize: '14px', textDecoration: 'none',
            }}>
              <span>{icon}</span><span>{label}</span>
            </Link>
          )
        })}

        {!soloEmpresas && isOperator && (
          <>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', padding: '16px 12px 6px', textTransform: 'uppercase' }}>Operador</div>
            {NAV_OPERADOR.filter(n => operadorRol !== 'operador' || NAV_OPERADOR_RESTRINGIDO.has(n.href)).map(({ href, icon, label, sub }) => {
              const exactActive = sub
                ? path === href || path.startsWith(href + '/')
                : path === href || (path.startsWith(href + '/') && !NAV_OPERADOR.some(n => n.sub && (path === n.href || path.startsWith(n.href + '/'))))
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: sub ? '6px 12px 6px 28px' : '9px 12px',
                  borderRadius: '10px', marginBottom: '2px',
                  fontWeight: exactActive ? 600 : 400,
                  background: exactActive ? 'var(--primary-light)' : 'transparent',
                  color: exactActive ? 'var(--primary)' : (sub ? 'var(--muted)' : 'var(--text)'),
                  fontSize: sub ? '13px' : '14px', textDecoration: 'none',
                }}>
                  <span>{icon}</span><span>{label}</span>
                </Link>
              )
            })}
          </>
        )}
      </div>
    )
  }

  function Footer() {
    return (
      <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, marginBottom: '2px' }}>{nombre}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        <ThemeToggle />
        <button onClick={logout} style={{
          width: '100%', padding: '7px', fontSize: '13px',
          border: '1px solid var(--border)', borderRadius: '6px',
          color: 'var(--muted)', background: 'transparent', cursor: 'pointer',
        }}>Salir</button>
      </div>
    )
  }

  if (isMobile) {
    return (
      <>
        {/* Barra superior de ancho completo: el contenido desplazado pasa limpio por debajo
            (antes el ☰ era un chip flotante que tapaba a medias los títulos al scrollear).
            z-index por debajo del backdrop (40) y el drawer (50) → el menú abierto la cubre. */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 30,
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '10px', padding: '0 12px',
        }}>
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '6px 10px', fontSize: '18px',
              lineHeight: 1, cursor: 'pointer', color: 'var(--text)',
            }}
          >☰</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '15px' }}>
            <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', borderRadius: '6px', padding: '1px 7px', fontSize: '12px' }}>ia</span>
            <span>plataforma</span>
          </div>
        </div>

        {/* Backdrop */}
        {open && (
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 40 }}
          />
        )}

        {/* Drawer */}
        <nav style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, maxWidth: '82vw',
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', zIndex: 50,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .25s ease',
          boxShadow: open ? '2px 0 24px rgba(0,0,0,.15)' : 'none',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '16px' }}>
              <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', borderRadius: '8px', padding: '2px 8px', fontSize: '13px' }}>ia</span>
              <span>plataforma</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar menú"
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '22px', lineHeight: 1, cursor: 'pointer' }}>×</button>
          </div>
          <NavLinks />
          <Footer />
        </nav>
      </>
    )
  }

  return (
    <nav style={{
      width: 220, flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
    }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '16px' }}>
          <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', borderRadius: '8px', padding: '2px 8px', fontSize: '13px' }}>ia</span>
          <span>plataforma</span>
        </div>
      </div>
      <NavLinks />
      <Footer />
    </nav>
  )
}
