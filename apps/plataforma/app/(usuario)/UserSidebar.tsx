'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Banknote, BedDouble, Bell, Bot, Briefcase, Building2, CalendarDays,
  ChartColumn, ChartLine, ChartPie, ChevronDown, ClipboardList, Coins, Cog, Cpu,
  CreditCard, Euro, Eye, Fan, FileText, FlaskConical, Gavel, House, KeyRound,
  Landmark, Lightbulb, MessageCircle, MessageSquare, Network, Receipt, Satellite,
  Scale, Search, SearchCheck, Shield, Sparkles, Store, Target, Ticket,
  TrendingUp, User, UserCheck, Users, UtensilsCrossed, Wrench,
  type LucideIcon, BookUser } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import SubirFactura from './SubirFactura'
import { activoPorRuta, activoEnLista } from '@/lib/nav-activo'

// Iconos de lucide, NO emojis: cada sistema operativo pinta el emoji a su manera (color,
// grosor y hasta dibujo distintos), así que el mismo lateral se veía de una forma en el móvil
// de Alberto y de otra en el escritorio. Se guarda el COMPONENTE del icono (no un string) y
// se pinta con `color: 'currentColor'` para que herede el color del enlace (activo/inactivo).

/** Una entrada del menú. `tab` solo lo llevan los segmentos de /banca, que comparten ruta. */
type NavItem = { href: string; icon: LucideIcon; label: string; tab?: string }

// 🧭 Lateral reordenado el 24/09/2026 (Alberto: «limpieza no la uso, avisos de Telegram no es
// importante para estar de los primeros… hay cosas duplicadas»). Arriba, abierto, solo lo del DÍA
// A DÍA; lo demás plegado en Pisos · Oportunidades · Ajustes. No se borra ninguna página: todas
// siguen en su URL y en el Cmd+K. El historial de por qué existe cada entrada está en git.
const NAV_NEGOCIO: NavItem[] = [
  // 🏠 Inicio = resumen de los cuatro negocios (`/inicio`, 24/09/2026). Banca pasa a ser una
  // entrada más; sus segmentos (`?tab=`) cuelgan de ella. «Dinero» NO tiene entrada propia: es
  // `/banca` sin query, o sea la propia entrada «Banca» (ver lib/nav-activo.ts).
  { href: '/inicio', icon: House, label: 'Inicio' },
  { href: '/correduria', icon: Shield, label: 'Correduría' },
  { href: '/sivra/calendario', icon: CalendarDays, label: 'Calendario pisos' },
  { href: '/sivra/mensajes', icon: MessageCircle, label: 'Mensajes pisos' },
  { href: '/banca', icon: Banknote, label: 'Banca' },
  { href: '/banca?tab=ingresos', icon: Coins, label: 'Ingresos', tab: 'ingresos' },
  { href: '/banca?tab=negocios', icon: Building2, label: 'Negocios', tab: 'negocios' },
  { href: '/banca?tab=fiscal', icon: Receipt, label: 'Fiscal', tab: 'fiscal' },
  { href: '/banca?tab=personal', icon: User, label: 'Personal', tab: 'personal' },
  // Destino del aviso de Telegram del agente de facturas (29/08/2026).
  { href: '/expenses/pendientes', icon: Receipt, label: 'Facturas por revisar' },
  { href: '/trading', icon: TrendingUp, label: 'Bolsa' },
]

// ─── 🔭 Oportunidades (02/09/2026): BUSCAR algo nuevo, separado de GESTIONAR lo que ya tienes.
// La bolsa subió a «Día a día» el 24/09/2026; el patrimonio se queda aquí (cambia poco).
const NAV_OPORTUNIDADES = [
  { href: '/concursos', icon: Landmark, label: 'Concursos' },
  { href: '/subastas', icon: Gavel, label: 'Subastas y chollos' },
  { href: '/inversion', icon: SearchCheck, label: 'Analizar compra' },
  { href: '/empresas', icon: Building2, label: 'Empresas' },
  { href: '/patrimonio', icon: Briefcase, label: 'Patrimonio' },
]

// ⚙️ Ajustes y administración: lo que se configura de vez en cuando, al final y plegado.
// «Limpiezas» y «Avisos Telegram» estaban entre las primeras entradas y no se usan a diario.
const NAV_AJUSTES = [
  // 🔔 Qué te manda el bot por su cuenta, y el interruptor de cada aviso (01/09/2026).
  { href: '/telegram', icon: Bell, label: 'Avisos Telegram' },
  { href: '/asistentes', icon: Bot, label: 'Asistentes' },
  { href: '/comunicacion', icon: MessageSquare, label: 'Comunicación' },
  { href: '/limpiezas', icon: Sparkles, label: 'Limpiezas' },
  { href: '/sivra/limpiadoras', icon: Wrench, label: 'Admin limpiezas' },
  { href: '/sivra/domotica', icon: Fan, label: 'Domótica' },
  { href: '/sivra/seo', icon: Search, label: 'SEO' },
  // 🚨 Destino del aviso del cron `ses-latido` (02/09/2026): sin entrada era inalcanzable.
  { href: '/sivra/partes/establecimientos', icon: BookUser, label: 'Partes de viajeros' },
]

// Entrada única para una cuenta acotada a la sección Empresas (rol='empresas').
// 🚨 Se pinta en el hueco de «Día a día» aunque `/empresas` viva ahora en Oportunidades: esa
// sección NO se renderiza para estas cuentas, así que su única entrada tiene que estar donde sí
// se pinta. Por eso `seccionDeRuta` no puede decidir sola aquí — ver `seccionActiva()`.
const NAV_SOLO_EMPRESAS: NavItem[] = [{ href: '/empresas', icon: Building2, label: 'Empresas' }]

const NAV_PISOS = [
  // 🏨 Apartamentos lleva el resumen del ciclo de mensajes al huésped (restaurada 16/07/2026).
  { href: '/apartamentos', icon: BedDouble, label: 'Apartamentos' },
  { href: '/sivra/resultado-pisos', icon: ChartLine, label: 'Resultado pisos' },
  { href: '/sivra/income', icon: Coins, label: 'Ingresos' },
  { href: '/sivra/expenses', icon: CreditCard, label: 'Gastos' },
  { href: '/sivra/gastos-fijos', icon: ClipboardList, label: 'Gastos fijos' },
  { href: '/sivra/facturas-control', icon: FileText, label: 'Facturas' },
  { href: '/sivra/fiscal', icon: ChartPie, label: 'Fiscal IRPF' },
  { href: '/sivra/mercado', icon: ChartColumn, label: 'Competencia' },
  { href: '/sivra/pricing', icon: FlaskConical, label: 'Pricing Lab' },
  { href: '/sivra/pricing-auto', icon: Cog, label: 'Pricing auto' },
  { href: '/sivra/pricing-rentabilidad', icon: Scale, label: 'Motor vs PL' },
]

const NAV_OPERADOR = [
  { href: '/operador/clientes', icon: Building2, label: 'Clientes' },
  { href: '/operador/personas', icon: User, label: 'Personas' },
  { href: '/operador/flota-mapa', icon: Satellite, label: 'Flota (mapa)' },
  { href: '/operador/iarest', icon: UtensilsCrossed, label: 'ia-rest' },
  { href: '/operador/iarest/restaurantes', icon: Store, label: 'Restaurantes', sub: true },
  { href: '/operador/iarest/cobros', icon: Euro, label: 'Cobros', sub: true },
  { href: '/operador/iarest/suscripciones', icon: CreditCard, label: 'Suscripciones', sub: true },
  { href: '/operador/iarest/soporte', icon: Ticket, label: 'Soporte', sub: true },
  { href: '/operador/iarest/sugerencias', icon: Lightbulb, label: 'Sugerencias', sub: true },
  { href: '/operador/iarest/crecimiento', icon: TrendingUp, label: 'Crecimiento', sub: true },
  { href: '/operador/iarest/sistema', icon: Cpu, label: 'Sistema', sub: true },
  { href: '/operador/iarest/crm', icon: Target, label: 'CRM', sub: true },
  { href: '/operador/actividad', icon: Eye, label: 'Actividad ialimp' },
  { href: '/operador/agentes', icon: Bot, label: 'Agentes' },
  { href: '/operador/ia', icon: Banknote, label: 'IA · gasto' },
  { href: '/operador/rrhh', icon: Users, label: 'RR.HH.' },
  { href: '/operador/rrhh/empleados', icon: UserCheck, label: 'Empleados', sub: true },
  { href: '/operador/rrhh/solicitudes', icon: ClipboardList, label: 'Solicitudes', sub: true },
  { href: '/operador/estructura', icon: Network, label: 'Estructura' },
  { href: '/operador/secretos', icon: KeyRound, label: 'Secretos' },
]

const NAV_OPERADOR_RESTRINGIDO = new Set(['/operador/clientes', '/operador/rrhh', '/operador/rrhh/empleados', '/operador/rrhh/solicitudes'])

// Secciones PLEGABLES (01/09/2026). El lateral tenía 52 entradas planas y no lo navegaba
// nadie: al entrar se ve un menú corto (la sección donde estás) y el resto a un clic.
type ClaveSeccion = 'negocio' | 'oportunidades' | 'pisos' | 'ajustes' | 'operador'
const LS_SECCION: Record<ClaveSeccion, string> = {
  negocio: 'nav-seccion-negocio',
  oportunidades: 'nav-seccion-oportunidades',
  pisos: 'nav-seccion-pisos',
  ajustes: 'nav-seccion-ajustes',
  operador: 'nav-seccion-operador',
}

function enLista(lista: { href: string }[], path: string): boolean {
  return lista.some(n => activoPorRuta(n.href, path))
}

// Qué sección contiene la ruta activa. Determinista: se calcula igual en el servidor y en el
// cliente, así que el primer pintado ya trae la sección buena abierta (sin salto al hidratar).
function seccionDeRuta(path: string): ClaveSeccion | null {
  if (enLista(NAV_PISOS, path)) return 'pisos'
  if (enLista(NAV_OPERADOR, path)) return 'operador'
  if (enLista(NAV_OPORTUNIDADES, path)) return 'oportunidades'
  if (enLista(NAV_AJUSTES, path)) return 'ajustes'
  if (enLista(NAV_NEGOCIO, path)) return 'negocio'
  return null
}

// 🚨 La cuenta `rol='empresas'` solo ve `/empresas`, y se pinta en el hueco de «Día a día».
// Sin esta corrección `seccionDeRuta` devolvería 'oportunidades' —una sección que a esa cuenta
// NO se le renderiza— y «Día a día» se quedaría plegado con su única entrada dentro: el menú
// entero vacío, sin error y sin nada que pulsar.
function seccionActiva(path: string, soloEmpresas: boolean): ClaveSeccion | null {
  if (soloEmpresas) return 'negocio'
  return seccionDeRuta(path)
}

// 🚨 El lateral tiene DOS plegados distintos y no pueden pisarse:
//   · `html[data-nav-plegado='1']` = tira de solo iconos (globals.css). Ahí las cabeceras de
//     sección NO se ven (llevan `nav-solo-abierto`), así que una sección colapsada dejaría sus
//     entradas INALCANZABLES: sin cabecera no hay dónde pulsar para abrirla. Por eso, en modo
//     tira, se enseñan TODAS las entradas aunque su sección esté colapsada.
//   · las secciones plegables de aquí abajo, que solo mandan con el lateral abierto.
// Se resuelve en CSS (no con el estado de React) para que valga desde el primer pintado: el
// atributo lo pone el script anti-parpadeo del layout antes de que hidrate nada.
export default function UserSidebar({ email, nombre, isOperator, operadorRol, rol }: { email: string; nombre: string; isOperator: boolean; operadorRol?: string; rol?: string | null }) {
  const path = usePathname()
  const tabActual = useSearchParams().get('tab')
  const router = useRouter()
  const soloEmpresas = rol === 'empresas'
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)
  // Lateral plegado (solo escritorio). Arranca en false para que servidor y cliente pinten lo
  // mismo; lo VISUAL no depende de este estado sino de `html[data-nav-plegado]`, que pone el
  // script anti-parpadeo de layout.tsx antes del primer pintado (ver globals.css). Aquí solo se
  // lee para el rótulo/aria del botón y se alterna el atributo + localStorage.
  const [plegado, setPlegado] = useState(false)
  // Secciones abiertas. El valor inicial NO lee localStorage (rompería la hidratación): sale de
  // la ruta activa, que el servidor también conoce. Lo guardado se aplica en el efecto de abajo.
  const [abiertas, setAbiertas] = useState<Record<ClaveSeccion, boolean>>(() => {
    const activa = seccionActiva(path, soloEmpresas)
    return {
      negocio: activa === null || activa === 'negocio',
      oportunidades: activa === 'oportunidades',
      pisos: activa === 'pisos',
      ajustes: activa === 'ajustes',
      operador: activa === 'operador',
    }
  })

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    try {
      setPlegado(localStorage.getItem('nav-plegado') === '1')
    } catch { /* localStorage bloqueado: abierto */ }
  }, [])

  useEffect(() => {
    try {
      setAbiertas(prev => {
        const sig = { ...prev }
        for (const clave of Object.keys(LS_SECCION) as ClaveSeccion[]) {
          const guardado = localStorage.getItem(LS_SECCION[clave])
          if (guardado === '1') sig[clave] = true
          else if (guardado === '0') sig[clave] = false
        }
        return sig
      })
    } catch { /* sin persistencia: se queda el valor por ruta */ }
  }, [])

  // La sección que contiene la ruta activa se abre SIEMPRE. Si no, un plegado guardado dejaría
  // escondida justo la entrada en la que estás (y el enlace activo sin pintar en ningún sitio).
  useEffect(() => {
    const activa = seccionActiva(path, soloEmpresas)
    if (!activa) return
    setAbiertas(prev => (prev[activa] ? prev : { ...prev, [activa]: true }))
  }, [path, soloEmpresas])

  const alternarSeccion = useCallback((clave: ClaveSeccion) => {
    setAbiertas(prev => {
      const sig = !prev[clave]
      try {
        localStorage.setItem(LS_SECCION[clave], sig ? '1' : '0')
      } catch { /* sin persistencia */ }
      return { ...prev, [clave]: sig }
    })
  }, [])

  function alternarPlegado() {
    const sig = !plegado
    setPlegado(sig)
    if (sig) document.documentElement.dataset.navPlegado = '1'
    else delete document.documentElement.dataset.navPlegado
    try {
      localStorage.setItem('nav-plegado', sig ? '1' : '0')
    } catch { /* sin persistencia */ }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  function Icono({ de: De, sub }: { de: LucideIcon; sub?: boolean }) {
    return <De size={16} strokeWidth={1.75} color="currentColor" style={{ flexShrink: 0, opacity: sub ? 0.9 : 1 }} aria-hidden />
  }

  function CabeceraSeccion({ clave, titulo, primera }: { clave: ClaveSeccion; titulo: string; primera?: boolean }) {
    const abierta = abiertas[clave]
    return (
      <button
        type="button"
        onClick={() => alternarSeccion(clave)}
        className="nav-solo-abierto nav-seccion-btn"
        aria-expanded={abierta}
        aria-controls={`nav-grupo-${clave}`}
        style={{ padding: primera ? '4px 12px 6px' : '16px 12px 6px' }}
      >
        <span>{titulo}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          color="currentColor"
          aria-hidden
          style={{ flexShrink: 0, transform: abierta ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s ease' }}
        />
      </button>
    )
  }

  function NavLinks() {
    const listaNegocio = soloEmpresas ? NAV_SOLO_EMPRESAS : NAV_NEGOCIO
    return (
      <div style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
        <CabeceraSeccion clave="negocio" titulo="Día a día" primera />
        <div id="nav-grupo-negocio" className="nav-grupo" data-colapsado={abiertas.negocio ? undefined : '1'}>
          {listaNegocio.map(({ href, icon, label, tab }) => {
            // Las sub-entradas de /banca comparten `path`, así que el activo lo decide el ?tab=.
            // Y «Inicio» ES la ruta pelada de esos segmentos: sin `activoEnLista` se encendía a la
            // vez que el segmento (medido 02/09/2026 en /banca?tab=ingresos). Ver lib/nav-activo.ts.
            const esSegmento = tab !== undefined
            const active = activoEnLista({ href, tab }, listaNegocio, path, tabActual)
            return (
              <Link key={href + label} href={href} onClick={() => setOpen(false)} className="nav-link" title={label} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: esSegmento ? '7px 12px 7px 26px' : '9px 12px',
                borderRadius: '10px', marginBottom: '2px',
                fontWeight: active ? 600 : 400,
                background: active ? 'var(--primary-light)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text)',
                fontSize: esSegmento ? '13px' : '14px', textDecoration: 'none',
              }}>
                <Icono de={icon} /><span className="nav-solo-abierto">{label}</span>
              </Link>
            )
          })}
        </div>

        {!soloEmpresas && <CabeceraSeccion clave="pisos" titulo="Pisos" />}
        {!soloEmpresas && (
          <div id="nav-grupo-pisos" className="nav-grupo" data-colapsado={abiertas.pisos ? undefined : '1'}>
            {NAV_PISOS.map(({ href, icon, label }) => {
              // `path.startsWith(href)` a secas encendía «Pricing Lab» estando en «Pricing auto»
              // y en «Motor vs PL»: una ruta es prefijo de la otra. Ver lib/nav-activo.ts.
              const active = activoPorRuta(href, path)
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" title={label} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '10px', marginBottom: '2px',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'var(--primary-light)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text)',
                  fontSize: '14px', textDecoration: 'none',
                }}>
                  <Icono de={icon} /><span className="nav-solo-abierto">{label}</span>
                </Link>
              )
            })}
          </div>
        )}

        {!soloEmpresas && <CabeceraSeccion clave="oportunidades" titulo="Oportunidades" />}
        {!soloEmpresas && (
          <div id="nav-grupo-oportunidades" className="nav-grupo" data-colapsado={abiertas.oportunidades ? undefined : '1'}>
            {NAV_OPORTUNIDADES.map(({ href, icon, label }) => {
              const active = activoPorRuta(href, path)
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" title={label} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '10px', marginBottom: '2px',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'var(--primary-light)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text)',
                  fontSize: '14px', textDecoration: 'none',
                }}>
                  <Icono de={icon} /><span className="nav-solo-abierto">{label}</span>
                </Link>
              )
            })}
          </div>
        )}

        {!soloEmpresas && <CabeceraSeccion clave="ajustes" titulo="Ajustes y admin" />}
        {!soloEmpresas && (
          <div id="nav-grupo-ajustes" className="nav-grupo" data-colapsado={abiertas.ajustes ? undefined : '1'}>
            {NAV_AJUSTES.map(({ href, icon, label }) => {
              const active = activoPorRuta(href, path)
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" title={label} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '10px', marginBottom: '2px',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'var(--primary-light)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text)',
                  fontSize: '14px', textDecoration: 'none',
                }}>
                  <Icono de={icon} /><span className="nav-solo-abierto">{label}</span>
                </Link>
              )
            })}
          </div>
        )}

        {!soloEmpresas && isOperator && (
          <>
            <CabeceraSeccion clave="operador" titulo="Operador" />
            <div id="nav-grupo-operador" className="nav-grupo" data-colapsado={abiertas.operador ? undefined : '1'}>
              {NAV_OPERADOR.filter(n => operadorRol !== 'operador' || NAV_OPERADOR_RESTRINGIDO.has(n.href)).map(({ href, icon, label, sub }) => {
                const exactActive = sub
                  ? path === href || path.startsWith(href + '/')
                  : path === href || (path.startsWith(href + '/') && !NAV_OPERADOR.some(n => n.sub && (path === n.href || path.startsWith(n.href + '/'))))
                return (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className="nav-link" title={label} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: sub ? '6px 12px 6px 28px' : '9px 12px',
                    borderRadius: '10px', marginBottom: '2px',
                    fontWeight: exactActive ? 600 : 400,
                    background: exactActive ? 'var(--primary-light)' : 'transparent',
                    color: exactActive ? 'var(--primary)' : (sub ? 'var(--muted)' : 'var(--text)'),
                    fontSize: sub ? '13px' : '14px', textDecoration: 'none',
                  }}>
                    <Icono de={icon} sub={sub} /><span className="nav-solo-abierto">{label}</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  function Footer() {
    return (
      <div className="nav-pie" style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <div className="nav-solo-abierto" style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, marginBottom: '2px' }}>{nombre}</div>
        <div className="nav-solo-abierto" style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        <div className="nav-solo-abierto"><ThemeToggle /></div>
        {/* Plegado: queda solo el icono ⏻ (title = tooltip); nombre, email y tema vuelven al desplegar. */}
        <button onClick={logout} title="Salir" aria-label="Salir" style={{
          width: '100%', padding: '7px', fontSize: '13px',
          border: '1px solid var(--border)', borderRadius: '6px',
          color: 'var(--muted)', background: 'transparent', cursor: 'pointer',
        }}>{plegado ? '⏻' : 'Salir'}</button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '15px', minWidth: 0 }}>
            <img src="/icon.svg" alt="" width={22} height={22} style={{ borderRadius: 6, flexShrink: 0 }} />
            <span>Mi grupo</span>
          </div>
          {/* Subir una factura desde CUALQUIER pantalla, sin pasar por /asistentes: es la acción que
              Alberto hace con el móvil en la mano delante del papel. `marginLeft:auto` la pega a la
              derecha sin empujar la marca (la barra mide 52px y el botón 44: cabe sin desbordar). */}
          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <SubirFactura variante="barra" />
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
              <img src="/icon.svg" alt="" width={22} height={22} style={{ borderRadius: 6, flexShrink: 0 }} />
              <span>Mi grupo</span>
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

  // Escritorio. El ancho (220 ↔ 56px) lo decide `html[data-nav-plegado]` desde globals.css, no
  // un estilo inline: así el HTML servido es el mismo plegado o no, y el script anti-parpadeo
  // del layout raíz ya lo deja bien antes del primer pintado.
  return (
    <nav className="sidebar-desktop" style={{
      flexShrink: 0,
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', overflowX: 'hidden',
    }}>
      <div className="nav-cabecera" style={{ padding: '20px 12px 16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '16px', minWidth: 0 }}>
          <img src="/icon.svg" alt="" width={22} height={22} style={{ borderRadius: 6, flexShrink: 0 }} />
          <span className="nav-solo-abierto">Mi grupo</span>
        </div>
        <button
          onClick={alternarPlegado}
          className="nav-plegar-btn"
          title={plegado ? 'Desplegar menú' : 'Plegar menú'}
          aria-label={plegado ? 'Desplegar menú' : 'Plegar menú'}
          aria-expanded={!plegado}
          style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: '8px',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted)', cursor: 'pointer', fontSize: '14px', lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >{plegado ? '»' : '«'}</button>
      </div>
      {!plegado && (
        <div style={{ padding: '12px 12px 12px 20px', borderBottom: '1px solid var(--border)' }}>
          <SubirFactura variante="lateral" />
        </div>
      )}
      <NavLinks />
      <Footer />
    </nav>
  )
}
