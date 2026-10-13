'use client'

// «Precio por bot (gratis)» del cotizador de moto (13/10/2026). Junto al flujo de Avant2 (Codeoscopic, 0,50€), pide precio a
// los bots Playwright del tarificador RPA con los MISMOS datos del formulario: lista las compañías con bot ACTIVO en moto
// (`/api/correduria/tarificador/integraciones`) y pinta un botón por compañía; cada fila encola y sigue su trabajo. Una compañía
// nueva con bot de moto aparece sola, sin tocar esta pantalla. Solo PRECIO: no emite ni contrata. Sin cargo de Codeoscopic.
// Patrón de lista + seguimiento de `ProbarTarificacion.tsx` (mismas lecturas defensivas de `lib/tarificador-probar.ts`).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot } from 'lucide-react'
import { btnStyle, cardStyle, CardHeader } from '@/components/ui'
import {
  SONDEO_MS, SONDEO_TOPE_MS, leerIntegraciones, leerTrabajo, resumenTrabajo, rotuloCompania,
  type IntegracionVista, type TrabajoVista,
} from '@/lib/tarificador-probar'
import { formularioBotMoto, leerEncoladoBot, type EntradaBotMoto } from '@/lib/tarificador-moto-formulario'

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

export default function PrecioPorBot({ clienteId, oportunidadId, entrada, cilindradaInicial }: {
  clienteId: string
  oportunidadId: string | null
  /** Lo que el cotizador ya sabe, sin la cilindrada (que el cotizador de Avant2 no pide y se completa aquí). */
  entrada: Omit<EntradaBotMoto, 'cilindrada'>
  cilindradaInicial: number | null
}) {
  const [integ, setInteg] = useState<Integraciones>({ estado: 'cargando' })
  const [cilindrada, setCilindrada] = useState(cilindradaInicial !== null ? String(cilindradaInicial) : '')

  const cargar = useCallback(async () => {
    setInteg({ estado: 'cargando' })
    const r = await pedirJson('/api/correduria/tarificador/integraciones')
    const l = leerIntegraciones(r.status, r.json)
    setInteg(l.ok ? { estado: 'ok', lista: l.integraciones.filter((i) => i.ramo === 'moto') } : { estado: 'error', mensaje: l.mensaje })
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  const formulario = formularioBotMoto({ ...entrada, cilindrada })
  const lista = integ.estado === 'ok' ? integ.lista : []

  return (
    <div style={cardStyle}>
      <CardHeader title="Precio por bot (gratis)" sub="Pide precio al portal de la compañía con los datos de este formulario. No cuesta 0,50€, tarda un par de minutos y solo da precio: no emite." />
      <label style={{ display: 'grid', gap: 4, fontSize: 13, maxWidth: 260 }}>
        <span>Cilindrada (cc) <span style={{ color: 'var(--muted)' }}>— el bot separa Moto y Ciclomotor</span></span>
        <input inputMode="numeric" value={cilindrada} onChange={(e) => setCilindrada(e.target.value)} placeholder="p. ej. 125"
          style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%' }} />
      </label>
      {!formulario.ok && (
        <div role="status" style={{ fontSize: 13, color: 'var(--warning)', marginTop: 10 }}>
          <strong>Para pedir precio por bot falta:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{formulario.faltan.map((f) => <li key={f} style={{ overflowWrap: 'anywhere' }}>{f}</li>)}</ul>
        </div>
      )}
      {integ.estado === 'cargando' && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>Cargando las compañías con bot…</p>}
      {integ.estado === 'error' && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--negative)', margin: '10px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {integ.mensaje}
          <button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Reintentar</button>
        </p>
      )}
      {integ.estado === 'ok' && lista.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>Ninguna compañía tiene hoy el bot de moto activo (revisado).</p>
      )}
      <div style={{ display: 'grid', gap: 12, marginTop: lista.length ? 12 : 0 }}>
        {lista.map((i) => (
          <FilaBot key={i.clave} integracion={i} clienteId={clienteId} oportunidadId={oportunidadId} formulario={formulario} />
        ))}
      </div>
    </div>
  )
}

function FilaBot({ integracion, clienteId, oportunidadId, formulario }: {
  integracion: IntegracionVista
  clienteId: string
  oportunidadId: string | null
  formulario: ReturnType<typeof formularioBotMoto>
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
          clienteId, oportunidadId, ramo: 'moto', compania: integracion.compania, riesgo: formulario.riesgo,
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
        title={formulario.ok ? `Encola una tarificación de moto en el bot de ${nombre} (solo precio: no emite).` : 'Faltan datos: míralos arriba.'}
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
          {res?.pideVersion && <span style={{ fontSize: 13, color: 'var(--warning)' }}>El bot necesita que elijas la versión de la moto: hazlo desde «Probar tarificación» de la ficha o la bandeja del tarificador.</span>}
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
