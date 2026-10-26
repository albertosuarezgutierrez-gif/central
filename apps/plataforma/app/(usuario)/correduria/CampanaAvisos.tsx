'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { interpretarCampana, tonoGrupo, type LecturaCampana } from '@/lib/correduria/campana'
import type { GrupoCampana, ItemCampana } from '@/lib/correduria/avisos'
import { textoResultadoAccion, type SolicitudPortal } from '@/lib/correduria/solicitudes-portal'
import SolicitudesPortal from './SolicitudesPortal'
import OportunidadesPatrimonio from './OportunidadesPatrimonio'
import CartasMediador from './CartasMediador'

/**
 * 🔔 La campana de la correduría (26/10/2026). Alberto: «veo mucho lío en mi mesa; pon una campanita en mi panel para
 * notificaciones: leads nuevos, avisos de permisos…». Vive en `AccionesCabecera` (Mi mesa y Gestión). Sustituye a la
 * banda de avisos de Mi mesa y a los avisos puntuales de Gestión (lo que es TRABAJO sigue en Gestión).
 *
 * Datos: `GET /api/correduria/avisos` → `campana` (contrato en `lib/correduria/avisos.ts`, validado en
 * `lib/correduria/campana.ts`). Se lee al montar, al abrir el panel, cada ~2 min con la pestaña visible y al volver a ella.
 *
 * 🚨 Error ≠ 0: si la petición falla el icono lleva «!»; si una fuente no se pudo leer, «n+» y su grupo dice «No se ha
 * podido comprobar …». Sin «leído»: lo pendiente cuenta hasta que se atiende. ≤20 filas por tipo + «ver todo».
 * Nativo y sin librerías: popover en escritorio, hoja a pantalla completa en móvil (`.campana-panel` en globals.css).
 */
const CADA_MS = 120_000
/** Colas cuya lista completa (con sus acciones) se monta DENTRO del panel: ya no viven en Gestión. */
const COMPLETA: Partial<Record<GrupoCampana['tipo'], () => React.ReactNode>> = {
  solicitudes_portal: () => <SolicitudesPortal />,
  oportunidades_patrimonio: () => <OportunidadesPatrimonio />,
  cartas_mediador: () => <CartasMediador />,
}

export default function CampanaAvisos() {
  const [lectura, setLectura] = useState<LecturaCampana | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierta, setAbierta] = useState(false)
  const peticion = useRef(0)
  const caja = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true)
    try {
      const r = await fetch('/api/correduria/avisos', { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (mia === peticion.current) setLectura(interpretarCampana(r.status, j))
    } catch {
      if (mia === peticion.current) setLectura({ estado: 'error', motivo: 'no se ha podido conectar' })
    } finally {
      if (mia === peticion.current) setCargando(false)
    }
  }, [])

  // Al montar, cada 2 min con la pestaña visible, al volver a la pestaña y cuando otra pieza avisa de un cambio.
  useEffect(() => {
    void cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void cargar() }, CADA_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar() }
    const alCambiar = () => { void cargar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('correduria:avisos-cambiaron', alCambiar)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('correduria:avisos-cambiaron', alCambiar)
    }
  }, [cargar])

  // Cierra con Escape o tocando fuera (en escritorio; en móvil la hoja tapa todo y se cierra con la X).
  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false) }
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false) }
    document.addEventListener('keydown', tecla)
    document.addEventListener('mousedown', fuera)
    return () => { document.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', fuera) }
  }, [abierta])

  const contador = lectura === null ? '' : lectura.estado === 'error' ? '!' : lectura.campana.contador
  const alarma = lectura?.estado === 'error' || (lectura?.estado === 'ok' && lectura.campana.grupos.some((g) => g.plazoLegal && (g.n ?? 0) > 0))
  const etiqueta = lectura === null
    ? 'Notificaciones (comprobando)'
    : lectura.estado === 'error'
      ? 'Notificaciones: no se han podido comprobar'
      : `Notificaciones: ${lectura.campana.total}${lectura.campana.parcial ? ' o más (alguna fuente no se pudo leer)' : ''} pendientes`

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={etiqueta}
        title={etiqueta}
        aria-expanded={abierta}
        aria-haspopup="dialog"
        onClick={() => { setAbierta((a) => !a); if (!abierta) void cargar() }}
        style={{ ...btnStyle('secundario'), minWidth: 44, position: 'relative' }}
      >
        <Bell size={16} strokeWidth={1.75} aria-hidden />
        {contador !== '' && (
          <span aria-hidden style={{
            position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
            fontSize: 11, fontWeight: 800, lineHeight: '18px', textAlign: 'center',
            background: alarma ? 'var(--negative)' : contador === '!' ? 'var(--warning)' : 'var(--primary)', color: 'var(--surface)',
          }}>{contador}</span>
        )}
      </button>

      {abierta && (
        <div role="dialog" aria-label="Notificaciones de la correduría" className="campana-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>Notificaciones</strong>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {cargando && <span aria-live="polite" style={{ fontSize: 12, color: 'var(--muted)' }}>Actualizando…</span>}
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar notificaciones" style={{ ...btnStyle('sutil'), minWidth: 44, minHeight: 44 }}>
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </span>
          </div>
          <Contenido lectura={lectura} cargando={cargando} onRecargar={cargar} />
        </div>
      )}
    </div>
  )
}

function Contenido({ lectura, cargando, onRecargar }: { lectura: LecturaCampana | null; cargando: boolean; onRecargar: () => Promise<void> }) {
  if (lectura === null) return <p style={NOTA}>Comprobando…</p>
  if (lectura.estado === 'error') {
    return (
      <div role="alert" style={{ display: 'grid', gap: 8 }}>
        <p style={{ ...NOTA, color: 'var(--warning)', fontWeight: 600 }}>No se han podido comprobar las notificaciones ({lectura.motivo}). Esto no significa que no haya.</p>
        <div><button type="button" disabled={cargando} onClick={() => void onRecargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>{cargando ? 'Reintentando…' : 'Reintentar'}</button></div>
      </div>
    )
  }
  const { grupos } = lectura.campana
  return (
    <>
      {grupos.length === 0 && <p style={NOTA}>Todo comprobado: no hay nada pendiente.</p>}
      {lectura.descartados > 0 && (
        <p role="alert" style={{ ...NOTA, color: 'var(--warning)' }}>
          {lectura.descartados} notificaci{lectura.descartados === 1 ? 'ón no se ha podido leer y no aparece' : 'ones no se han podido leer y no aparecen'}.
        </p>
      )}
      {grupos.map((g) => <Grupo key={g.tipo} g={g} onCambio={onRecargar} />)}
    </>
  )
}

function Grupo({ g, onCambio }: { g: GrupoCampana; onCambio: () => Promise<void> }) {
  const [completa, setCompleta] = useState(false)
  const tono = tonoGrupo(g)
  const color = tono === 'malo' ? 'var(--negative)' : tono === 'aviso' ? 'var(--warning)' : 'var(--text)'
  const verCompleta = COMPLETA[g.tipo]
  return (
    <section aria-label={g.titulo} style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color }}>{g.titulo}</h3>
        {g.plazoLegal && (g.n ?? 0) > 0 && <Badge tono="negativo">PLAZO</Badge>}
        {g.estado !== 'ok' && <Badge tono="aviso">{g.estado === 'error' ? 'sin comprobar' : 'incompleto'}</Badge>}
        {g.n !== null && g.n > 0 && <span style={{ marginLeft: 'auto', fontWeight: 700, color }}>{g.n}{g.estado === 'parcial' ? '+' : ''}</span>}
      </div>
      <p style={{ ...NOTA, color: g.nivel === 'aviso' && !g.plazoLegal ? 'var(--muted)' : color, overflowWrap: 'anywhere' }}>{g.texto}</p>
      {g.items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {g.items.map((it) => <Fila key={it.id} it={it} onCambio={onCambio} />)}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {g.href && (
          <Link href={g.href} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, textDecoration: 'none' }}>
            {g.mas > 0 ? `Ver todo (${g.mas} más)` : g.items.length > 0 ? 'Ver todo' : 'Ir a atenderlo'} ›
          </Link>
        )}
        {verCompleta && (g.n ?? 0) > 0 && (
          <button type="button" onClick={() => setCompleta((c) => !c)} aria-expanded={completa} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
            {completa ? 'Ocultar la cola completa' : g.mas > 0 ? `Ver todo (${g.mas} más) y sus acciones` : 'Abrir la cola con sus acciones'}
          </button>
        )}
      </div>
      {completa && verCompleta && <div style={{ minWidth: 0 }}>{verCompleta()}</div>}
    </section>
  )
}

function Fila({ it, onCambio }: { it: ItemCampana; onCambio: () => Promise<void> }) {
  const cuerpo = (
    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{it.texto}</span>
      {it.detalle && <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{it.detalle}</span>}
    </span>
  )
  return (
    <li style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      {it.href
        ? <Link href={it.href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}>{cuerpo}<span aria-hidden style={{ color: 'var(--muted)' }}>›</span></Link>
        : <div style={{ minHeight: 44, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>{cuerpo}</div>}
      {it.solicitud && <AccionesSolicitud s={it.solicitud} onCambio={onCambio} />}
    </li>
  )
}

/** Activar/Rechazar: el MISMO POST que la cola (`/api/correduria/cliente/portal-modulos`: revalida, audita, historial). */
function AccionesSolicitud({ s, onCambio }: { s: SolicitudPortal; onCambio: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  async function actuar(accion: 'activar' | 'retirar') {
    if (!s.clienteId) return
    if (accion === 'retirar' && !window.confirm(`¿Rechazar «${s.moduloNombre}» para ${s.cliente}? La petición se retira.`)) return
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch('/api/correduria/cliente/portal-modulos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: s.clienteId, modulo: s.modulo, accion }),
      })
      setAviso(textoResultadoAccion(accion, r.status, await r.json().catch(() => null)).texto)
    } catch {
      setAviso('NO se sabe si se ha hecho: no se ha podido hablar con asegura. Mira la lista antes de repetir.')
    } finally {
      setOcupado(false)
      void onCambio()
    }
  }
  return (
    <div style={{ display: 'grid', gap: 4, paddingLeft: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={!s.puedeActivar || ocupado} title={s.puedeActivar ? undefined : (s.motivoNoActivar ?? undefined)}
          onClick={() => void actuar('activar')} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>Activar</button>
        <button type="button" disabled={!s.clienteId || ocupado} title={s.clienteId ? undefined : 'Sin ficha vinculada no se puede rechazar desde aquí.'}
          onClick={() => void actuar('retirar')} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Rechazar</button>
      </div>
      {aviso && <p aria-live="polite" style={{ ...NOTA, fontSize: 12 }}>{aviso}</p>}
    </div>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }
