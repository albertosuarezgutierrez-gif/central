'use client'

// «Probar tarificación» (13/10/2026). Elige compañía+ramo entre las integraciones ACTIVAS del tarificador RPA, encola un
// trabajo y enseña ahí mismo estado y resultado (sondeo cada pocos segundos hasta un estado final). Solo PRECIO: no
// emite ni contrata. El riesgo lo reencola asegura en servidor (el último tarificado de este cliente); aquí no viaja.
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import {
  SONDEO_MS, SONDEO_TOPE_MS, leerEncolado, leerIntegraciones, leerTrabajo, resumenTrabajo, rotuloIntegracion,
  type IntegracionVista, type TrabajoVista,
} from '@/lib/tarificador-probar'

type Integraciones = { estado: 'cargando' } | { estado: 'error'; mensaje: string } | { estado: 'ok'; lista: IntegracionVista[] }
type Seguimiento = { trabajoId: string; duplicado: boolean; trabajo: TrabajoVista | null; aviso: string | null; agotado: boolean }

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

export default function ProbarTarificacion({ clienteId }: { clienteId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [integ, setInteg] = useState<Integraciones>({ estado: 'cargando' })
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seg, setSeg] = useState<Seguimiento | null>(null)
  const [version, setVersion] = useState('')
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generacion = useRef(0) // invalida sondeos viejos al cerrar, desmontar o cambiar de trabajo

  const parar = useCallback(() => {
    generacion.current += 1
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }, [])
  useEffect(() => parar, [parar])

  const cargarIntegraciones = useCallback(async () => {
    setInteg({ estado: 'cargando' })
    const r = await pedirJson('/api/correduria/tarificador/integraciones')
    const l = leerIntegraciones(r.status, r.json)
    if (!l.ok) { setInteg({ estado: 'error', mensaje: l.mensaje }); return }
    setInteg({ estado: 'ok', lista: l.integraciones })
    setClave((c) => (l.integraciones.some((i) => i.clave === c) ? c : (l.integraciones[0]?.clave ?? '')))
  }, [])

  function alternar() {
    if (abierto) { parar(); setSeg(null); setAbierto(false); return }
    setAbierto(true)
    if (integ.estado !== 'ok') void cargarIntegraciones()
  }

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
        const final = resumenTrabajo(l.trabajo).final
        setSeg((s) => (s && s.trabajoId === trabajoId ? { ...s, trabajo: l.trabajo, aviso: null } : s))
        if (final) return
      } else {
        // «No se pudo comprobar» ≠ vacío: se conserva lo último visto y se avisa; se sigue intentando.
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

  async function probar() {
    const i = integ.estado === 'ok' ? integ.lista.find((x) => x.clave === clave) : undefined
    if (!i || ocupado) return
    setOcupado(true); setError(null); parar(); setSeg(null)
    const r = await pedirJson('/api/correduria/tarificador/probar', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clienteId, compania: i.compania, ramo: i.ramo }),
    })
    setOcupado(false)
    const e = leerEncolado(r.status, r.json)
    if (!e.ok) { setError(e.mensaje); return }
    sondear(e.trabajoId, e.duplicado)
  }

  async function reintentarConVersion() {
    if (!seg?.trabajo?.opcionesVersion || !version || ocupado) return
    // El valor del desplegable es el ÍNDICE de la opción: hay portales sin código (Mapfre) y se elige por etiqueta.
    const v = seg.trabajo.opcionesVersion[Number(version)]
    if (!v) return
    setOcupado(true); setError(null)
    const r = await pedirJson(`/api/correduria/tarificador/bandeja/${encodeURIComponent(seg.trabajoId)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'reintentar', eleccionVersion: { codigo: v.codigo, etiqueta: v.etiqueta } }),
    })
    setOcupado(false)
    if (r.status !== 200 && r.status !== 202) { setError(`No se pudo reintentar con esa versión (HTTP ${r.status}).`); return }
    setVersion('')
    sondear(seg.trabajoId, seg.duplicado)
  }

  const res = seg?.trabajo ? resumenTrabajo(seg.trabajo) : null
  const sinIntegraciones = integ.estado === 'ok' && integ.lista.length === 0

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, minWidth: 0, maxWidth: '100%' }}>
      <button type="button" onClick={alternar} aria-expanded={abierto} style={btnStyle('secundario')}
        title="Encola una tarificación de prueba en el bot de la compañía elegida (solo precio: no emite).">
        <FlaskConical size={16} aria-hidden /> Probar tarificación
      </button>
      {abierto && (
        <div role="region" aria-label="Probar tarificación"
          style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, maxWidth: 'min(560px, 95vw)' }}>
          {integ.estado === 'cargando' && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando integraciones activas…</span>}
          {integ.estado === 'error' && (
            <span role="alert" style={{ fontSize: 13, color: 'var(--negative)', display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {integ.mensaje}
              <button type="button" onClick={() => void cargarIntegraciones()} style={btnStyle('secundario')}>Reintentar</button>
            </span>
          )}
          {sinIntegraciones && <span style={{ fontSize: 13, color: 'var(--muted)' }}>No hay ninguna integración del bot activa (revisado).</span>}
          {integ.estado === 'ok' && !sinIntegraciones && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select aria-label="Compañía y ramo" value={clave} onChange={(e) => setClave(e.target.value)} disabled={ocupado}
                style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 8px', minWidth: 0, maxWidth: '100%' }}>
                {integ.lista.map((i) => <option key={i.clave} value={i.clave}>{rotuloIntegracion(i)}</option>)}
              </select>
              <button type="button" onClick={() => void probar()} disabled={ocupado || !clave} style={{ ...btnStyle('primario'), opacity: ocupado ? 0.6 : 1 }}>
                {ocupado ? 'Encolando…' : 'Tarificar'}
              </button>
            </div>
          )}
          {error && <span role="alert" style={{ fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{error}</span>}
          {seg && (
            <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              {seg.duplicado && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ya había un trabajo para esta combinación: se muestra ese.</span>}
              {!res && !seg.aviso && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Comprobando el estado…</span>}
              {res && <strong style={{ fontSize: 14, color: TONO[res.tono] }}>{res.titulo}</strong>}
              {res?.motivo && <span style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{res.motivo}</span>}
              {res && res.ofertas.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {res.ofertas.map((o, n) => <li key={n} style={{ overflowWrap: 'anywhere' }}>{o}</li>)}
                </ul>
              )}
              {seg.trabajo && seg.trabajo.ofertas.some((o) => o.pdfIndice !== null) && (
                <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                  {seg.trabajo.ofertas.filter((o) => o.pdfIndice !== null).map((o) => (
                    <a key={o.pdfIndice} href={`/api/correduria/tarificador/trabajo/${encodeURIComponent(seg.trabajoId)}/pdf/${o.pdfIndice}`}
                      target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('secundario'), textDecoration: 'none' }}>PDF de la oferta</a>
                  ))}
                </span>
              )}
              {res?.pideVersion && seg.trabajo?.opcionesVersion && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select aria-label="Versión del vehículo" value={version} onChange={(e) => setVersion(e.target.value)} disabled={ocupado}
                    style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 8px', minWidth: 0, maxWidth: '100%' }}>
                    <option value="">Elige la versión…</option>
                    {seg.trabajo.opcionesVersion.map((o, i) => <option key={`${i}-${o.codigo ?? ''}`} value={String(i)}>{o.etiqueta}</option>)}
                  </select>
                  <button type="button" onClick={() => void reintentarConVersion()} disabled={ocupado || !version} style={{ ...btnStyle('secundario'), opacity: ocupado || !version ? 0.6 : 1 }}>
                    Reintentar con esta versión
                  </button>
                </div>
              )}
              {seg.aviso && <span role="alert" style={{ fontSize: 12, color: 'var(--warning)' }}>{seg.aviso} Sigo intentándolo…</span>}
              {seg.agotado && !res?.final && (
                <span role="alert" style={{ fontSize: 12, color: 'var(--warning)' }}>
                  Sigue sin terminar tras varios minutos: el bot puede estar ocupado. Revisa la bandeja del tarificador más tarde.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
