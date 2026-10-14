'use client'

// «Bots atascados» (F2 del plan de robustez, 14/10/2026). Dos cosas que esperan a Alberto:
//   · ATASCOS: el bot no encontró un campo o un botón y ni lo aprendido ni la IA lo resolvieron. Se ve qué buscaba, la
//     captura (bajo demanda: pesa) y los elementos numerados; «Es este» lo APRENDE y el MISMO trabajo vuelve a la cola.
//   · PAUSAS: una compañía/ramo cortada tras 3 fallos seguidos del bot; «Reanudar» la vuelve a encender.
// El estado y las reglas son de asegura (puerto de operador); aquí solo se pintan. Solo precio: nada de esto contrata.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { interpretarAtascos, lineaCandidato, type Atasco, type Pausa } from '@/lib/tarificador-atascos-asegura'

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
  const [capturas, setCapturas] = useState<Record<string, string | null>>({})

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

  async function verCaptura(a: Atasco) {
    if (capturas[a.id] !== undefined) {
      setCapturas((c) => { const n = { ...c }; delete n[a.id]; return n })
      return
    }
    setCapturas((c) => ({ ...c, [a.id]: null }))
    try {
      const res = await fetch(`/api/correduria/tarificador/atascos/${encodeURIComponent(a.id)}`, { cache: 'no-store' })
      const j = (await res.json().catch(() => null)) as { atasco?: { capturaBase64?: unknown } } | null
      const b64 = typeof j?.atasco?.capturaBase64 === 'string' ? j.atasco.capturaBase64 : null
      setCapturas((c) => ({ ...c, [a.id]: b64 ?? '' }))
    } catch {
      setCapturas((c) => ({ ...c, [a.id]: '' }))
    }
  }

  async function responder(a: Atasco, cuerpo: { accion: 'elegir'; n: number } | { accion: 'descartar' }) {
    if (cuerpo.accion === 'descartar' && !window.confirm(`¿Descartar este atasco de ${a.compania} (${a.ramo})? El presupuesto se cancela.`)) return
    setOcupado(a.id)
    setAviso(null)
    try {
      const res = await fetch(`/api/correduria/tarificador/atascos/${encodeURIComponent(a.id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string; pausada?: boolean; lanzado?: boolean } | null
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
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {atascos.map((a) => (
                <li key={a.id} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ textTransform: 'capitalize' }}>{a.compania}</strong>
                    <span>· {a.ramo}</span>
                    <Badge tono="aviso">Atascado</Badge>
                    {a.ronda !== null && a.maxRondas !== null && <span className="muted" style={{ fontSize: 12 }}>intento {a.ronda} de {a.maxRondas}</span>}
                    <span className="muted" style={{ fontSize: 12 }}>caduca {fecha(a.caducaEn)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                    No encuentra {a.tipo === 'campo' ? `el campo «${a.etiqueta ?? a.descripcion}»` : `el botón «${a.textoEsperado ?? a.descripcion}»`}. ¿Cuál es?
                  </p>
                  <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {a.candidatos.map((c) => (
                      <li key={c.n} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                        <button type="button" onClick={() => void responder(a, { accion: 'elegir', n: c.n })} disabled={ocupado !== null} style={{ ...btnStyle('secundario'), minHeight: 44, minWidth: 44 }}>
                          {ocupado === a.id ? '…' : 'Es este'}
                        </button>
                        <span style={{ fontSize: 14, overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 180px' }}>{lineaCandidato(c)}</span>
                      </li>
                    ))}
                  </ol>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {a.hayCaptura && (
                      <button type="button" onClick={() => void verCaptura(a)} aria-expanded={capturas[a.id] !== undefined} style={{ ...btnStyle('sutil'), minHeight: 44 }}>
                        {capturas[a.id] !== undefined ? 'Ocultar captura' : 'Ver captura'}
                      </button>
                    )}
                    <button type="button" onClick={() => void responder(a, { accion: 'descartar' })} disabled={ocupado !== null} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Descartar</button>
                    {a.oportunidadId && (
                      <Link href={`/correduria/oportunidad/${a.oportunidadId}`} style={{ ...btnStyle('sutil'), minHeight: 44, textDecoration: 'none' }}>Abrir oportunidad</Link>
                    )}
                  </div>
                  {capturas[a.id] === null && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Cargando la captura…</p>}
                  {capturas[a.id] === '' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>No se ha podido cargar la captura.</p>}
                  {capturas[a.id] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`data:image/png;base64,${capturas[a.id]}`} alt={`Pantalla de ${a.compania} donde se atascó el bot`} style={{ maxWidth: '100%', height: 'auto', border: '1px solid var(--border)', borderRadius: 8 }} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
