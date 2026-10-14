'use client'

// «Bots (gratis)» (14/10/2026; nació en `moto-nuevo/PrecioPorBot.tsx` el 13/10/2026): bloque ÚNICO, igual para todos los ramos,
// que pide precio a los bots Playwright del tarificador RPA con los MISMOS datos del formulario del ramo. Lista las compañías
// con bot ACTIVO en ese ramo (`/api/correduria/tarificador/integraciones`) y pinta un botón por compañía; cada fila encola y
// sigue su trabajo. Una compañía nueva con bot aparece sola. Qué datos valen para cada ramo lo decide su ADAPTADOR
// (`lib/tarificador-bots-ramos.ts`); sin adaptador o sin integraciones, una línea discreta y ningún botón muerto.
// Solo PRECIO: no emite ni contrata. Sin cargo de Codeoscopic (el flujo de pago es «Avant2 — 0,50€»).
// Patrón de lista + seguimiento de `ProbarTarificacion.tsx` (mismas lecturas defensivas de `lib/tarificador-probar.ts`).
//
// Anfitrión: la carcasa `PedirPrecioEmbebido` publica un hueco (`HuecoBotsContext`) ENCIMA de la sección Avant2 y el bloque se
// pinta ahí con un portal aunque lo monte el cotizador del ramo (que es quien tiene el formulario). Sin hueco (pantalla
// completa del cotizador) se pinta en línea. Un solo bloque por pantalla.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot } from 'lucide-react'
import { btnStyle, cardStyle, CardHeader } from '@/components/ui'
import {
  SONDEO_MS, SONDEO_TOPE_MS, leerIntegraciones, leerTrabajo, resumenTrabajo, rotuloCompania,
  type IntegracionVista, type TrabajoVista,
} from '@/lib/tarificador-probar'
import { leerEncoladoBot } from '@/lib/tarificador-moto-formulario'
import { adaptadorDeRamo, type ResultadoAdaptadorBot } from '@/lib/tarificador-bots-ramos'

/** Elemento donde la carcasa quiere el bloque (encima de Avant2). `null` = pintar en línea. */
export const HuecoBotsContext = createContext<HTMLElement | null>(null)

const TONO: Record<'curso' | 'ok' | 'aviso' | 'error', string> = {
  curso: 'var(--muted)', ok: 'var(--positive)', aviso: 'var(--warning)', error: 'var(--negative)',
}

async function pedirJson(url: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init })
    return { status: r.status, json: await r.json().catch(() => null) }
  } catch {
    return { status: 502, json: null }
  }
}

type Integraciones = { estado: 'cargando' } | { estado: 'error'; mensaje: string } | { estado: 'ok'; lista: IntegracionVista[] }
type Seguimiento = { trabajoId: string; duplicado: boolean; trabajo: TrabajoVista | null; aviso: string | null; agotado: boolean }

const sinBots = (texto: string) => (
  <div style={cardStyle}>
    <CardHeader title="Bots (gratis)" />
    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{texto}</p>
  </div>
)

export default function PrecioBots({ ramo, clienteId, oportunidadId, formulario, inicialesExtra }: {
  ramo: string
  clienteId: string
  oportunidadId: string | null
  /** Lo que el cotizador del ramo ya sabe (lo entiende el adaptador del ramo). */
  formulario: unknown
  /** Valores iniciales de los campos extra del adaptador (p. ej. `{ cilindrada: '125' }`). */
  inicialesExtra?: Record<string, string>
}) {
  const hueco = useContext(HuecoBotsContext)
  const adaptador = adaptadorDeRamo(ramo)
  const bloque = adaptador
    ? <BloqueBots ramo={ramo} adaptador={adaptador} clienteId={clienteId} oportunidadId={oportunidadId} formulario={formulario} inicialesExtra={inicialesExtra} />
    : sinBots('Sin bots para este ramo todavía.')
  return hueco ? createPortal(bloque, hueco) : bloque
}

function BloqueBots({ ramo, adaptador, clienteId, oportunidadId, formulario, inicialesExtra }: {
  ramo: string
  adaptador: NonNullable<ReturnType<typeof adaptadorDeRamo>>
  clienteId: string
  oportunidadId: string | null
  formulario: unknown
  inicialesExtra?: Record<string, string>
}) {
  const [integ, setInteg] = useState<Integraciones>({ estado: 'cargando' })
  const [extra, setExtra] = useState<Record<string, string>>(() => ({ ...inicialesExtra }))

  // Solo la última petición escribe: una respuesta tardía de otro ramo no pisa la lista.
  const peticion = useRef(0)
  const cargar = useCallback(async () => {
    const yo = ++peticion.current
    setInteg({ estado: 'cargando' })
    const r = await pedirJson('/api/correduria/tarificador/integraciones')
    const l = leerIntegraciones(r.status, r.json)
    if (yo !== peticion.current) return
    setInteg(l.ok ? { estado: 'ok', lista: l.integraciones.filter((i) => i.ramo === ramo) } : { estado: 'error', mensaje: l.mensaje })
  }, [ramo])
  useEffect(() => { void cargar() }, [cargar])

  const lista = integ.estado === 'ok' ? integ.lista : []
  // Revisado y sin ninguna compañía: línea discreta, ni campos ni botones.
  if (integ.estado === 'ok' && lista.length === 0) return sinBots('Sin bots para este ramo todavía.')

  const resultado = adaptador.construir(formulario, extra)
  return (
    <div style={cardStyle}>
      <CardHeader title="Bots (gratis)" sub="Pide precio al portal de la compañía con los datos de este formulario. No cuesta 0,50€, tarda un par de minutos y solo da precio: no emite." />
      {adaptador.campos.map((c) => (
        <label key={c.clave} style={{ display: 'grid', gap: 4, fontSize: 13, maxWidth: 260 }}>
          <span>{c.etiqueta}{c.ayuda && <span style={{ color: 'var(--muted)' }}> — {c.ayuda}</span>}</span>
          <input inputMode="numeric" value={extra[c.clave] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [c.clave]: e.target.value }))} placeholder={c.placeholder}
            style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%' }} />
        </label>
      ))}
      {!resultado.ok && (
        <div role="status" style={{ fontSize: 13, color: 'var(--warning)', marginTop: 10 }}>
          <strong>Para pedir precio por bot falta:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{resultado.faltan.map((f) => <li key={f} style={{ overflowWrap: 'anywhere' }}>{f}</li>)}</ul>
        </div>
      )}
      {integ.estado === 'cargando' && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>Cargando las compañías con bot…</p>}
      {integ.estado === 'error' && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--negative)', margin: '10px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {integ.mensaje}
          <button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Reintentar</button>
        </p>
      )}
      <div style={{ display: 'grid', gap: 12, marginTop: lista.length ? 12 : 0 }}>
        {lista.map((i) => (
          <FilaBot key={i.clave} integracion={i} ramo={ramo} clienteId={clienteId} oportunidadId={oportunidadId} formulario={resultado} />
        ))}
      </div>
    </div>
  )
}

function FilaBot({ integracion, clienteId, oportunidadId, formulario, ramo }: {
  integracion: IntegracionVista
  clienteId: string
  oportunidadId: string | null
  formulario: ResultadoAdaptadorBot
  ramo: string
}) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seg, setSeg] = useState<Seguimiento | null>(null)
  const enVuelo = useRef(false) // guarda SÍNCRONA contra el doble clic (el estado de React llega tarde)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generacion = useRef(0)

  const parar = useCallback(() => {
    generacion.current += 1
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }, [])
  useEffect(() => parar, [parar])

  const sondear = useCallback((trabajoId: string, duplicado: boolean) => {
    parar()
    const mia = generacion.current
    const inicio = Date.now()
    setSeg({ trabajoId, duplicado, trabajo: null, aviso: null, agotado: false })
    const vuelta = async () => {
      const r = await pedirJson(`/api/correduria/tarificador/trabajo/${encodeURIComponent(trabajoId)}`)
      if (mia !== generacion.current) return
      const l = leerTrabajo(r.status, r.json)
      if (l.ok) {
        setSeg((s) => (s && s.trabajoId === trabajoId ? { ...s, trabajo: l.trabajo, aviso: null } : s))
        if (resumenTrabajo(l.trabajo).final) return
      } else {
        // «No se pudo comprobar» ≠ vacío: se conserva lo último visto y se sigue intentando.
        setSeg((s) => (s && s.trabajoId === trabajoId ? { ...s, aviso: l.mensaje } : s))
      }
      if (Date.now() - inicio > SONDEO_TOPE_MS) {
        setSeg((s) => (s && s.trabajoId === trabajoId ? { ...s, agotado: true } : s))
        return
      }
      temporizador.current = setTimeout(() => void vuelta(), SONDEO_MS)
    }
    void vuelta()
  }, [parar])

  async function pedir() {
    if (!formulario.ok || enVuelo.current) return
    enVuelo.current = true
    setOcupado(true); setError(null); parar(); setSeg(null)
    try {
      const r = await pedirJson('/api/correduria/tarificador/encolar', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clienteId, oportunidadId, ramo, compania: integracion.compania, riesgo: formulario.riesgo,
          ...(formulario.completarDesdeFicha.length ? { completarDesdeFicha: formulario.completarDesdeFicha } : {}),
        }),
      })
      const e = leerEncoladoBot(r.status, r.json)
      if (!e.ok) { setError(e.mensaje); return }
      sondear(e.trabajoId, e.duplicado)
    } finally {
      enVuelo.current = false
      setOcupado(false)
    }
  }

  const res = seg?.trabajo ? resumenTrabajo(seg.trabajo) : null
  const nombre = rotuloCompania(integracion.compania)
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <button type="button" onClick={() => void pedir()} disabled={!formulario.ok || ocupado}
        title={formulario.ok ? `Encola una tarificación de ${ramo} en el bot de ${nombre} (solo precio: no emite).` : 'Faltan datos: míralos arriba.'}
        style={{ ...btnStyle('secundario'), minHeight: 44, width: '100%', maxWidth: 420, opacity: !formulario.ok || ocupado ? 0.6 : 1 }}>
        <Bot size={16} aria-hidden /> {ocupado ? 'Encolando…' : `Precio ${nombre} (bot) — gratis`}
      </button>
      {error && <span role="alert" style={{ fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{error}</span>}
      {seg && (
        <div aria-live="polite" style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          {seg.duplicado && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ya había un trabajo en marcha con estos datos: se muestra ese.</span>}
          {!res && !seg.aviso && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Comprobando el estado…</span>}
          {res && <strong style={{ fontSize: 14, color: TONO[res.tono] }}>{nombre}: {res.titulo}</strong>}
          {res?.motivo && <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{res.motivo}</span>}
          {res && res.ofertas.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
              {res.ofertas.map((o, n) => <li key={n} style={{ overflowWrap: 'anywhere' }}>{o}</li>)}
            </ul>
          )}
          {seg.trabajo && seg.trabajo.ofertas.some((o) => o.pdfIndice !== null) && (
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              {seg.trabajo.ofertas.filter((o) => o.pdfIndice !== null).map((o) => (
                <a key={o.pdfIndice} href={`/api/correduria/tarificador/trabajo/${encodeURIComponent(seg.trabajoId)}/pdf/${o.pdfIndice}`}
                  target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('secundario'), textDecoration: 'none', minHeight: 44 }}>PDF de la oferta</a>
              ))}
            </span>
          )}
          {res?.pideVersion && <span style={{ fontSize: 13, color: 'var(--warning)' }}>El bot necesita que elijas la versión del vehículo: hazlo en la bandeja «Necesita tu atención» del <a href="/correduria/tarificador" style={{ color: 'inherit', textDecoration: 'underline', display: 'inline-block', minHeight: 24 }}>tarificador</a>.</span>}
          {seg.aviso && <span role="alert" style={{ fontSize: 12, color: 'var(--warning)' }}>{seg.aviso} Sigo intentándolo…</span>}
          {seg.agotado && !res?.final && (
            <span role="alert" style={{ fontSize: 12, color: 'var(--warning)' }}>
              Sigue sin terminar tras varios minutos: el bot puede estar ocupado. Revisa la bandeja del tarificador más tarde.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
