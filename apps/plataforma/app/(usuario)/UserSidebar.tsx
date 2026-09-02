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
import { activoPorRuta, activoEnLista } from '@/lib/nav-activo'

// Iconos de lucide, NO emojis: cada sistema operativo pinta el emoji a su manera (color,
// grosor y hasta dibujo distintos), así que el mismo lateral se veía de una forma en el móvil
// de Alberto y de otra en el escritorio. Se guarda el COMPONENTE del icono (no un string) y
// se pinta con `color: 'currentColor'` para que herede el color del enlace (activo/inactivo).

/** Una entrada del menú. `tab` solo lo llevan los segmentos de /banca, que comparten ruta. */
type NavItem = { href: string; icon: LucideIcon; label: string; tab?: string }

const NAV_NEGOCIO: NavItem[] = [
  // 🏠 Inicio = Resumen + Banca FUSIONADOS (Fase 2). Una sola entrada: /banca con control
  // 💶 Dinero (saldos+movimientos+IA) | 🏢 Negocios (holding, antiguo Resumen). Absorbe también la
  // «Radiografía» y las entradas fiscales sueltas (rutas vivas, alcanzables desde sus enlaces).
  // /dashboard sigue existiendo pero redirige aquí (segmento Negocios).
  { href: '/banca', icon: House, label: 'Inicio' },
  // Los CINCO segmentos de /banca (Dinero · Ingresos · Negocios · Fiscal · Personal) vivían solo en
  // la fila de pestañas de la propia página: desde el menú eran invisibles. Alberto fue a buscar
  // «Ingresos» al menú —que es donde uno lo busca— y no estaba (02/09/2026). Se sacan aquí como
  // sub-entradas de Inicio, igual que «Pisos · detalle» tiene las suyas.
  //
  // `tab` es la marca de cuál está activo: `usePathname()` devuelve `/banca` para todos, así que
  // sin esto se pintarían todos a la vez.
  //
  // El segmento «Dinero» NO tiene entrada propia a posta: es el que responde a /banca sin query,
  // o sea exactamente lo que ya hace «Inicio». Ponerlo sería una segunda entrada a la misma URL —
  // la duplicidad que este mismo panel lleva todo el día quitándose de encima.
  { href: '/banca?tab=ingresos', icon: Banknote, label: 'Ingresos', tab: 'ingresos' },
  { href: '/banca?tab=negocios', icon: Building2, label: 'Negocios', tab: 'negocios' },
  { href: '/banca?tab=fiscal', icon: Receipt, label: 'Fiscal', tab: 'fiscal' },
  { href: '/banca?tab=personal', icon: House, label: 'Personal', tab: 'personal' },
  // Bandeja del agente de facturas. Es el destino del aviso de Telegram, que hasta el 29/08/2026
  // enlazaba a una página inexistente; sin esta entrada, lo acumulado solo se ve al llegar una
  // factura nueva (el aviso cuenta las de ESA pasada, no la bandeja entera).
  { href: '/expenses/pendientes', icon: Receipt, label: 'Facturas por revisar' },
  // 🤖 Los dos chats (contable y precios) viven juntos en /asistentes desde el 02/09/2026;
  // /contable y /agente siguen respondiendo como redirect. Una entrada, no dos.
  { href: '/asistentes', icon: Bot, label: 'Asistentes' },
  { href: '/limpiezas', icon: Sparkles, label: 'Limpiezas' },
  // 🛡️ Correduría: la matriz de comisiones + la cartera en vivo de central-asegura. Vivía
  // SOLO como enlace desde las tarjetas de /banca (31/08/2026: «no me sale correduría»), así
  // que si no pasabas por Inicio la sección era invisible.
  { href: '/correduria', icon: Shield, label: 'Correduría' },
  { href: '/comunicacion', icon: MessageSquare, label: 'Comunicación' },
  // 🔔 Qué te manda el bot por su cuenta, y el interruptor de cada aviso (01/09/2026:
  // «revisa las notificaciones de Telegram, son muchas»).
  { href: '/telegram', icon: Bell, label: 'Avisos Telegram' },
]

// ─── 🔭 Oportunidades — separadas de «Mi negocio» el 02/09/2026 ───────────────────────────────
// Alberto, sobre el panel entero: «creo q tb están mal organizado». El inventario dio la forma
// del problema: 76 páginas y 51 entradas de menú para UNA persona. Y dentro de «Mi negocio»
// convivían dos modos mentales distintos: GESTIONAR lo que ya tienes (banca, facturas por
// revisar, correduría, limpiezas) y BUSCAR algo nuevo (concursos, subastas, analizar una compra,
// empresas en dificultad, bolsa, patrimonio). Mezclados, «Facturas por revisar» —que es trabajo
// pendiente de HOY— pesaba lo mismo que «Subastas», que se mira cuando se tiene un rato.
// Separarlas no quita ninguna página: cambia cuál te encuentras al abrir el panel a resolver
// algo. Es reversible en un PR (mover las 6 entradas de vuelta y borrar la sección).
const NAV_OPORTUNIDADES = [
  { href: '/concursos', icon: Landmark, label: 'Concursos' },
  { href: '/subastas', icon: Gavel, label: 'Subastas y chollos' },
  { href: '/inversion', icon: SearchCheck, label: 'Analizar compra' },
  { href: '/empresas', icon: Building2, label: 'Empresas' },
  { href: '/trading', icon: TrendingUp, label: 'Inversión' },
  { href: '/patrimonio', icon: Briefcase, label: 'Patrimonio' },
]

// Entrada única para una cuenta acotada a la sección Empresas (rol='empresas').
// 🚨 Se pinta en el hueco de «Mi negocio» aunque `/empresas` viva ahora en Oportunidades: esa
// sección NO se renderiza para estas cuentas, así que su única entrada tiene que estar donde sí
// se pinta. Por eso `seccionDeRuta` no puede decidir sola aquí — ver `seccionActiva()`.
const NAV_SOLO_EMPRESAS: NavItem[] = [{ href: '/empresas', icon: Building2, label: 'Empresas' }]

const NAV_PISOS = [
  // 🏨 Apartamentos vivía en «Mi negocio» y se quedó sin entrada al fusionar Resumen+Banca
  // (16/07/2026): la página nunca se borró, pero solo se llegaba por el Cmd+K o por un
  // «Detalle →» suelto, así que en la práctica era invisible. Restaurada aquí, que es donde
  // Alberto busca los pisos, y es la que lleva el resumen del ciclo de mensajes al huésped.
  { href: '/apartamentos', icon: BedDouble, label: 'Apartamentos' },
  { href: '/sivra/resultado-pisos', icon: ChartLine, label: 'Resultado pisos' },
  { href: '/sivra/calendario', icon: CalendarDays, label: 'Calendario' },
  { href: '/sivra/income', icon: Coins, label: 'Ingresos' },
  { href: '/sivra/expenses', icon: CreditCard, label: 'Gastos' },
  { href: '/sivra/gastos-fijos', icon: ClipboardList, label: 'Gastos fijos' },
  { href: '/sivra/facturas-control', icon: FileText, label: 'Facturas' },
  { href: '/sivra/fiscal', icon: ChartPie, label: 'Fiscal IRPF' },
  { href: '/sivra/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { href: '/sivra/mercado', icon: ChartColumn, label: 'Competencia' },
  { href: '/sivra/pricing', icon: FlaskConical, label: 'Pricing Lab' },
  { href: '/sivra/pricing-auto', icon: Cog, label: 'Pricing auto' },
  { href: '/sivra/pricing-rentabilidad', icon: Scale, label: 'Motor vs PL' },
  { href: '/sivra/seo', icon: Search, label: 'SEO' },
  { href: '/sivra/limpiadoras', icon: Wrench, label: 'Admin limpiezas' },
  { href: '/sivra/domotica', icon: Fan, label: 'Domótica' },
  // 🚨 Estaba INALCANZABLE pulsando (02/09/2026): ningún enlace del repo llevaba aquí y, sin
  // embargo, el cron `ses-latido` avisa por Telegram de que «no hay ningún establecimiento dado
  // de alta en /sivra/partes/establecimientos». Un aviso que señala una pantalla que no se puede
  // abrir es un aviso que no se puede atender — la regla de «¿en qué pantalla lo va a ver?».
  { href: '/sivra/partes/establecimientos', icon: BookUser, label: 'Partes de viajeros' },
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
type ClaveSeccion = 'negocio' | 'oportunidades' | 'pisos' | 'operador'
const LS_SECCION: Record<ClaveSeccion, string> = {
  negocio: 'nav-seccion-negocio',
  oportunidades: 'nav-seccion-oportunidades',
  pisos: 'nav-seccion-pisos',
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
  if (enLista(NAV_NEGOCIO, path)) return 'negocio'
  return null
}

// 🚨 La cuenta `rol='empresas'` solo ve `/empresas`, y se pinta en el hueco de «Mi negocio».
// Sin esta corrección `seccionDeRuta` devolvería 'oportunidades' —una sección que a esa cuenta
// NO se le renderiza— y «Mi negocio» se quedaría plegado con su única entrada dentro: el menú
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
        <CabeceraSeccion clave="negocio" titulo="Mi negocio" primera />
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

        {!soloEmpresas && <CabeceraSeccion clave="pisos" titulo="Pisos · detalle" />}
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
          <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', borderRadius: '8px', padding: '2px 8px', fontSize: '13px' }}>ia</span>
          <span className="nav-solo-abierto">plataforma</span>
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
      <NavLinks />
      <Footer />
    </nav>
  )
}
