'use client'

// «Necesita tu atención» (08/10/2026): trabajos del bot que se han parado y esperan a una persona. Plegable; carga de 50
// en 50 («Ver más»); recarga sin desmontar. La regla de qué se puede reintentar/cancelar la decide asegura: aquí solo
// se pintan los botones que ella habilita. Reintentar = vuelve a la cola (solo pide precio: nunca emite).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { BANDEJA_PAGINA, ROTULO_ESTADO_BANDEJA, leerRespuestaBandeja, type ItemBandeja } from '@/lib/tarificador-bandeja'
import TrazaTrabajo from './TrazaTrabajo'

const fecha = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
}

export default function BandejaAtencion() {
  const [items, setItems] = useState<ItemBandeja[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState(true)
  const [trazaAbierta, setTrazaAbierta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // `desde = 0` recarga la primera página SIN vaciar la lista (no desmonta); otro valor añade la siguiente.
  const cargar = useCallback(async (desde: number) => {
    setCargando(true)
    try {
      const res = await fetch(`/api/correduria/tarificador/bandeja?limite=${BANDEJA_PAGINA}&desde=${desde}`, { cache: 'no-store' })
      const r = leerRespuestaBandeja(res.status, await res.json().catch(() => null))
      if (!r.ok) { setError(r.mensaje); return }
      setError(null)
      setTotal(r.bandeja.total)
      setHayMas(r.bandeja.hayMas)
      setItems((prev) => {
        if (desde === 0) return r.bandeja.items
        const vistos = new Set(prev.map((i) => i.id))
        return [...prev, ...r.bandeja.items.filter((i) => !vistos.has(i.id))]
      })
    } catch {
      setError('No se ha podido cargar la bandeja (red).')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar(0) }, [cargar])

  async function resolver(it: ItemBandeja, accion: 'reintentar' | 'cancelar') {
    if (accion === 'cancelar' && !window.confirm(`¿Cancelar este trabajo de ${it.compania} (${it.ramo})? Dejará de aparecer aquí.`)) return
    setOcupado(it.id)
    setAviso(null)
    try {
      const res = await fetch(`/api/correduria/tarificador/bandeja/${encodeURIComponent(it.id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string; mensaje?: string } | null
      if (res.ok) {
        setAviso(accion === 'reintentar' ? 'Vuelve a la cola: el bot lo intentará de nuevo.' : 'Trabajo cancelado.')
      } else if (res.status === 409) {
        setAviso(`No se puede: ${j?.motivo ?? 'el trabajo ya cambió de estado'}.`)
      } else if (res.status === 503 && j?.estado === 'apagado') {
        setAviso('El bot está apagado (interruptor del tarificador): no se puede reintentar ahora.')
      } else {
        setAviso('No se ha podido hacer (asegura no respondió bien). Prueba en un rato.')
      }
      await cargar(0)
    } catch {
      setAviso('No se ha podido hacer (red).')
    } finally {
      setOcupado(null)
    }
  }

  const n = total ?? items.length
  return (
    <section aria-label="Necesita tu atención" style={{ border: `1px solid ${n > 0 ? 'var(--warning)' : 'var(--border)'}`, borderRadius: 12, background: n > 0 ? 'var(--warning-bg)' : 'transparent', padding: 14, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} style={{ ...btnStyle('sutil'), minHeight: 44, flex: '1 1 220px', justifyContent: 'flex-start' }}>
          {abierta ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          <span>Necesita tu atención{total !== null ? ` (${total})` : ''}</span>
        </button>
        <button type="button" onClick={() => void cargar(0)} disabled={cargando} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
          <RefreshCw size={15} strokeWidth={1.75} aria-hidden /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>
      {abierta && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Cotizaciones del bot que se han parado y no avanzan solas. Reintentar solo vuelve a pedir el precio; nunca contrata.
          </p>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{error}</p>}
          {aviso && <p role="status" style={{ margin: 0, fontSize: 13 }}>{aviso}</p>}
          {total === 0 && !error && <p style={{ margin: 0, fontSize: 14 }}>Nada pendiente: el bot no tiene trabajos parados.</p>}
          {items.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {items.map((it) => (
                <li key={it.id} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ textTransform: 'capitalize' }}>{it.compania}</strong>
                    <span>· {it.ramo}</span>
                    <Badge tono={it.estado === 'requiere_humano' ? 'aviso' : 'negativo'}>{ROTULO_ESTADO_BANDEJA[it.estado] ?? it.estado}</Badge>
                    <span className="muted" style={{ fontSize: 12 }}>{fecha(it.fecha)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>{it.motivo}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {it.puedeReintentar && (
                      <button type="button" onClick={() => void resolver(it, 'reintentar')} disabled={ocupado !== null} style={{ ...btnStyle('primario'), minHeight: 44 }}>
                        {ocupado === it.id ? 'Un momento…' : 'Reintentar'}
                      </button>
                    )}
                    {it.puedeCancelar && (
                      <button type="button" onClick={() => void resolver(it, 'cancelar')} disabled={ocupado !== null} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Cancelar</button>
                    )}
                    <button type="button" onClick={() => setTrazaAbierta((a) => (a === it.id ? null : it.id))} aria-expanded={trazaAbierta === it.id} style={{ ...btnStyle('sutil'), minHeight: 44 }}>
                      {trazaAbierta === it.id ? 'Ocultar traza' : 'Ver traza'}
                    </button>
                    {it.oportunidadId && (
                      <Link href={`/correduria/oportunidad/${it.oportunidadId}`} style={{ ...btnStyle('sutil'), minHeight: 44, textDecoration: 'none' }}>Abrir oportunidad</Link>
                    )}
                  </div>
                  {trazaAbierta === it.id && <TrazaTrabajo trabajoId={it.id} />}
                </li>
              ))}
            </ul>
          )}
          {hayMas && (
            <button type="button" onClick={() => void cargar(items.length)} disabled={cargando} style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
              Ver más ({Math.max(0, (total ?? 0) - items.length)} restantes)
            </button>
          )}
        </>
      )}
    </section>
  )
}
