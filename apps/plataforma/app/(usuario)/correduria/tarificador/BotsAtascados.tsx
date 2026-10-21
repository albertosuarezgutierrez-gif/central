'use client'

// «Bots atascados» (F2 del plan de robustez, 14/10/2026). Dos cosas que esperan a Alberto:
//   · ATASCOS: el bot no encontró un campo o un botón y ni lo aprendido ni la IA lo resolvieron. Se ve qué buscaba, la
//     captura (se carga sola; tocar = ampliar) y, en llano, dónde se ha parado y qué puede elegir; elegir lo APRENDE y el
//     MISMO trabajo vuelve a la cola. Si el bot no pudo leer las opciones de la lista, se dice y se ofrece «Descartar y
//     relanzar» (21/10/2026: Allianz Hogar parado en la población del CP enseñaba etiquetas como «Tipo de documento»).
//   · PAUSAS: una compañía/ramo cortada tras 3 fallos seguidos del bot; «Reanudar» la vuelve a encender.
// El estado y las reglas son de asegura (puerto de operador); aquí solo se pintan. Solo precio: nada de esto contrata.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { enlacePedirPrecio, interpretarAtascos, vistaAtasco, type Atasco, type Pausa } from '@/lib/tarificador-atascos-asegura'

/** Captura cargada: `null` = cargando · `''` = no se pudo · objeto = la imagen (solo en memoria; nunca se guarda). */
type CapturaCargada = { b64: string; mime: string } | null | ''

const fecha = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
}

export default function BotsAtascados() {
  const [atascos, setAtascos] = useState<Atasco[]>([])
  const [pausas, setPausas] = useState<Pausa[]>([])
  const [cargado, setCargado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierta, setAbierta] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [capturas, setCapturas] = useState<Record<string, CapturaCargada>>({})
  const [ampliada, setAmpliada] = useState<{ src: string; alt: string } | null>(null)
  const [relanzar, setRelanzar] = useState<string | null>(null)
  const pedidas = useRef(new Set<string>())

  // El modal de la imagen se cierra con Escape.
  useEffect(() => {
    if (!ampliada) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliada(null) }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [ampliada])

  // Recarga SIN vaciar la lista (no desmonta).
  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/correduria/tarificador/atascos', { cache: 'no-store' })
      const r = interpretarAtascos(res.status, await res.json().catch(() => null))
      if (r.estado === 'ok') {
        setError(r.ilegibles > 0 ? `Hay ${r.ilegibles} elemento(s) que no se han podido leer.` : null)
        setAtascos(r.atascos)
        setPausas(r.pausas)
        setCargado(true)
      } else if (r.estado === 'sin_esquema') {
        setError('Asegura aún no tiene aplicado el SQL de bots atascados (2026-10-14e).')
      } else if (r.estado === 'sin_configurar') {
        setError('Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET) en plataforma.')
      } else {
        // Un fallo del puerto NO es «no hay atascos».
        setError(`No se ha podido leer (${r.causa}).`)
      }
    } catch {
      setError('No se ha podido leer (red).')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  // Las capturas se piden solas, una a una (pesan): por el proxy autenticado de plataforma → puerto del operador de asegura.
  useEffect(() => {
    let vivo = true
    void (async () => {
      for (const a of atascos) {
        if (!a.hayCaptura || pedidas.current.has(a.id)) continue
        pedidas.current.add(a.id)
        setCapturas((c) => ({ ...c, [a.id]: null }))
        if (!vivo) { pedidas.current.delete(a.id); break }
        try {
          const res = await fetch(`/api/correduria/tarificador/atascos/${encodeURIComponent(a.id)}`, { cache: 'no-store' })
          const j = (await res.json().catch(() => null)) as { atasco?: { capturaBase64?: unknown; capturaMime?: unknown } } | null
          const b64 = typeof j?.atasco?.capturaBase64 === 'string' && /^[A-Za-z0-9+/]+=*$/.test(j.atasco.capturaBase64) ? j.atasco.capturaBase64 : null
          const mime = j?.atasco?.capturaMime === 'image/jpeg' ? 'image/jpeg' : 'image/png'
          // El resultado es por id: vale aunque `atascos` haya cambiado (si no, el bucle nuevo, que ya vio el id como pedido, no lo repetiría).
          setCapturas((c) => ({ ...c, [a.id]: b64 ? { b64, mime } : '' }))
        } catch {
          setCapturas((c) => ({ ...c, [a.id]: '' }))
        }
      }
    })()
    return () => { vivo = false }
  }, [atascos])

  async function descartarYRelanzar(a: Atasco) {
    const estado = await responder(a, { accion: 'descartar' })
    if (estado === 'descartado' || estado === 'sin_cambios') setRelanzar(enlacePedirPrecio(a.oportunidadId))
  }

  async function responder(a: Atasco, cuerpo: { accion: 'elegir'; n: number } | { accion: 'descartar' }): Promise<string | null> {
    if (cuerpo.accion === 'descartar' && !window.confirm(`¿Descartar este atasco de ${a.compania} (${a.ramo})? El presupuesto se cancela.`)) return null
    setOcupado(a.id)
    setAviso(null)
    setRelanzar(null)
    let estado: string | null = null
    try {
      const res = await fetch(`/api/correduria/tarificador/atascos/${encodeURIComponent(a.id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string; pausada?: boolean; lanzado?: boolean } | null
      estado = res.ok ? (j?.estado ?? null) : null
      if (res.ok && j?.estado === 'respondido') {
        setAviso(`Elegido el ${cuerpo.accion === 'elegir' ? cuerpo.n : ''}: queda aprendido y el bot repite el presupuesto${j.pausada ? ' (ojo: la compañía está en pausa; reanúdala abajo)' : j.lanzado ? ' (ya está en marcha)' : ''}.`)
      } else if (res.ok) {
        setAviso(j?.estado === 'descartado' ? 'Atasco descartado: el presupuesto se cancela.' : 'Ya estaba hecho.')
      } else if (res.status === 409) {
        setAviso(`No se puede: ${j?.motivo ?? 'el atasco ya cambió de estado'}.`)
      } else {
        setAviso('No se ha podido hacer (asegura no respondió bien). Prueba en un rato.')
      }
      await cargar()
    } catch {
      setAviso('No se ha podido hacer (red).')
    } finally {
      setOcupado(null)
    }
    return estado
  }

  async function reanudar(p: Pausa) {
    setOcupado(p.id)
    setAviso(null)
    try {
      const res = await fetch(`/api/correduria/tarificador/pausas/${encodeURIComponent(p.id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'reanudar' }),
      })
      setAviso(res.ok ? `${p.compania} (${p.ramo}) reanudado: el bot vuelve a pedir precios.` : 'No se ha podido reanudar. Prueba en un rato.')
      await cargar()
    } catch {
      setAviso('No se ha podido reanudar (red).')
    } finally {
      setOcupado(null)
    }
  }

  const n = atascos.length + pausas.length
  return (
    <section aria-label="Bots atascados" style={{ border: `1px solid ${n > 0 ? 'var(--warning)' : 'var(--border)'}`, borderRadius: 12, background: n > 0 ? 'var(--warning-bg)' : 'transparent', padding: 14, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setAbierta((x) => !x)} aria-expanded={abierta} style={{ ...btnStyle('sutil'), minHeight: 44, flex: '1 1 220px', justifyContent: 'flex-start' }}>
          {abierta ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          <span>Bots atascados{cargado ? ` (${n})` : ''}</span>
        </button>
        <button type="button" onClick={() => void cargar()} disabled={cargando} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
          <RefreshCw size={15} strokeWidth={1.75} aria-hidden /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>
      {abierta && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Cuando el bot no encuentra algo en el portal te enseña lo que hay, numerado. Elige el bueno: queda aprendido para la
            próxima y el bot repite el presupuesto. Solo pide precio; nunca contrata.
          </p>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{error}</p>}
          {aviso && <p role="status" style={{ margin: 0, fontSize: 13 }}>{aviso}</p>}
          {relanzar && (
            <Link href={relanzar} style={{ ...btnStyle('primario'), minHeight: 44, textDecoration: 'none', justifySelf: 'start' }}>Pedir precio otra vez</Link>
          )}
          {cargado && n === 0 && !error && <p style={{ margin: 0, fontSize: 14 }}>Nada atascado ni en pausa.</p>}

          {pausas.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {pausas.map((p) => (
                <li key={p.id} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ textTransform: 'capitalize' }}>{p.compania}</strong>
                    <span>· {p.ramo}</span>
                    <Badge tono="negativo">En pausa</Badge>
                    <span className="muted" style={{ fontSize: 12 }}>desde {fecha(p.pausadaEn)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                    {p.motivo}{p.pendientes !== null && p.pendientes > 0 ? ` Hay ${p.pendientes} presupuesto(s) esperando.` : ''}
                  </p>
                  <div>
                    <button type="button" onClick={() => void reanudar(p)} disabled={ocupado !== null} style={{ ...btnStyle('primario'), minHeight: 44 }}>
                      {ocupado === p.id ? 'Un momento…' : 'Reanudar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {atascos.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              {atascos.map((a) => {
                const v = vistaAtasco(a)
                const cap = capturas[a.id]
                const oportunidad = a.oportunidadId ? `/correduria/oportunidad/${a.oportunidadId}` : null
                const botonOpcion = { ...btnStyle('secundario'), minHeight: 48, width: '100%', justifyContent: 'flex-start', textAlign: 'left' as const, fontSize: 16, whiteSpace: 'normal' as const, overflowWrap: 'anywhere' as const }
                return (
                  <li key={a.id} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 10, padding: 12, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 16 }}>{v.titulo}</strong>
                      <Badge tono="aviso">Atascado</Badge>
                      {a.ronda !== null && a.maxRondas !== null && <span className="muted" style={{ fontSize: 12 }}>intento {a.ronda} de {a.maxRondas}</span>}
                      <span className="muted" style={{ fontSize: 12 }}>caduca {fecha(a.caducaEn)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                      Cliente: <strong>{a.clienteNombre ?? 'sin nombre en la ficha'}</strong>
                      {oportunidad && <> · <Link href={oportunidad} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>ver oportunidad</Link></>}
                    </p>
                    <p style={{ margin: 0, fontSize: 16, overflowWrap: 'anywhere' }}>
                      El bot se ha parado en: <strong>{v.paradoEn}</strong>
                    </p>

                    {v.captura === 'sin_captura' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Sin captura de este atasco.</p>}
                    {v.captura === 'hay' && cap === null && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Cargando la captura…</p>}
                    {v.captura === 'hay' && cap === '' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No se ha podido cargar la captura.</p>}
                    {v.captura === 'hay' && cap && (
                      <button
                        type="button"
                        onClick={() => setAmpliada({ src: `data:${cap.mime};base64,${cap.b64}`, alt: `Pantalla de ${v.titulo} donde se ha parado el bot` })}
                        aria-label="Ampliar la captura"
                        style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'zoom-in', maxWidth: '100%', minWidth: 0, display: 'block' }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`data:${cap.mime};base64,${cap.b64}`} alt={`Pantalla de ${v.titulo} donde se ha parado el bot`} style={{ maxWidth: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
                      </button>
                    )}

                    {v.modo === 'opciones' && (
                      <>
                        <p style={{ margin: 0, fontSize: 14 }}>¿Cuál es la buena? Tócala: el bot la aprende y repite el presupuesto.</p>
                        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                          {v.botones.map((b) => (
                            <button key={b.n} type="button" onClick={() => void responder(a, { accion: 'elegir', n: b.n })} disabled={ocupado !== null} style={botonOpcion}>
                              {ocupado === a.id ? 'Un momento…' : b.texto}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {v.modo === 'elementos' && (
                      <>
                        <p style={{ margin: 0, fontSize: 14 }}>Esto es lo que ve en la pantalla. Toca el que sea:</p>
                        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                          {v.botones.map((b) => (
                            <button key={b.n} type="button" onClick={() => void responder(a, { accion: 'elegir', n: b.n })} disabled={ocupado !== null} style={botonOpcion}>
                              {ocupado === a.id ? 'Un momento…' : b.texto}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {v.modo === 'sin_opciones' && (
                      <div role="note" style={{ border: '1px solid var(--warning)', borderRadius: 8, padding: 10, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                        <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                          {v.opcionesLeidas === 'vacia'
                            ? 'El bot no ha podido leer las opciones de esa lista (no llegó a abrirse), así que desde aquí no se puede elegir.'
                            : v.opcionesLeidas === 'sin_leer'
                              ? 'No se pudieron leer las opciones de esa lista, así que desde aquí no se puede elegir.'
                              : 'Ninguna de las opciones que vio el bot se puede pulsar desde aquí.'}
                          {' '}Descártalo y vuelve a pedir el precio; si se repite, avisa para mapear esa pantalla.
                        </p>
                        {v.opcionesVistas && v.opcionesVistas.length > 0 && (
                          <p className="muted" style={{ margin: 0, fontSize: 13, overflowWrap: 'anywhere' }}>El portal enseñaba: {v.opcionesVistas.join(' · ')}</p>
                        )}
                        <button type="button" onClick={() => void descartarYRelanzar(a)} disabled={ocupado !== null} style={{ ...btnStyle('primario'), minHeight: 44, justifySelf: 'start' }}>
                          {ocupado === a.id ? 'Un momento…' : 'Descartar y relanzar'}
                        </button>
                      </div>
                    )}

                    {v.modo !== 'sin_opciones' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" onClick={() => void responder(a, { accion: 'descartar' })} disabled={ocupado !== null} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Descartar</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
      {ampliada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Captura ampliada"
          onClick={() => setAmpliada(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.85)', display: 'grid', placeItems: 'center', padding: 8, overflow: 'auto' }}
        >
          <button type="button" onClick={() => setAmpliada(null)} style={{ ...btnStyle('secundario'), position: 'fixed', top: 8, right: 8, minHeight: 44, minWidth: 44 }}>Cerrar</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada.src} alt={ampliada.alt} style={{ maxWidth: '95vw', maxHeight: '90vh', height: 'auto', borderRadius: 8 }} />
        </div>
      )}
    </section>
  )
}
