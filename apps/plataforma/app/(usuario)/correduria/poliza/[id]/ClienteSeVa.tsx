'use client'

// «El cliente se va» desde un recibo DEVUELTO (Alberto, 29/09/2026): el cliente ya avisó de que no
// renueva y el recibo vuelve sin pagar. Da la póliza por anulada YA (baja verificada, antes de que
// CIMA lo confirme), cierra la llamada del impago y deja una oportunidad de competencia para el año
// que viene, con la llamada 60 días antes. Pide motivo y confirmación: no tiene vuelta atrás desde aquí.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { btnStyle } from '@/components/ui'

const MOTIVOS: { valor: string; rotulo: string }[] = [
  { valor: 'competidor', rotulo: 'Se va a otra compañía' },
  { valor: 'precio', rotulo: 'Por precio' },
  { valor: 'cliente_desiste', rotulo: 'Ya no quiere el seguro (vende el bien…)' },
  { valor: 'otro', rotulo: 'Otro motivo' },
]

const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export default function ClienteSeVa({ reciboId }: { reciboId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('competidor')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  async function confirmar() {
    if (!window.confirm('¿Dar la póliza por ANULADA? Se cierra el seguimiento del impago y se abre una oportunidad para el año que viene.')) return
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/recibo-devolucion', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reciboId, accion: 'baja', motivo, nota }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; vence?: string | null; llamada?: string | null } | null
      if (j?.estado === 'ok') {
        setHecho(`Póliza anulada. Oportunidad para ${j.vence ? `el ${fmt(j.vence)}` : 'el año que viene'}${j.llamada ? `, llamada el ${fmt(j.llamada)}` : ''}.`)
        router.refresh()
      } else if (j?.estado === 'sin_configurar') {
        setError('No está configurado el enlace con la cartera: no se ha anulado nada.')
      } else if (j?.estado === 'sin_respuesta' || r.status >= 500) {
        setError(`${j?.motivo ?? `HTTP ${r.status}`}: no sé si se ha anulado. Recarga antes de repetir.`)
      } else {
        setError(j?.motivo ?? `No se ha podido (HTTP ${r.status}).`)
      }
    } catch {
      setError('No se ha podido llegar al servidor: no sé si se ha anulado. Recarga antes de repetir.')
    } finally {
      setEnviando(false)
    }
  }

  if (hecho) return <div role="status" style={{ marginTop: 6, fontSize: 12 }}>✅ {hecho}</div>
  if (!abierto) {
    return (
      <div style={{ marginTop: 4 }}>
        <button type="button" onClick={() => setAbierto(true)} style={btnStyle('secundario')}>✗ El cliente se va</button>
      </div>
    )
  }
  return (
    <div style={{ marginTop: 6, display: 'grid', gap: 6, maxWidth: 360 }}>
      <label style={{ fontSize: 12 }}>
        Motivo
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ display: 'block', width: '100%', minHeight: 44 }}>
          {MOTIVOS.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 12 }}>
        Nota (opcional)
        <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="p. ej. vendió la moto, se lo lleva su cuñado…" style={{ display: 'block', width: '100%', minHeight: 44 }} />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={confirmar} disabled={enviando} style={btnStyle('primario')}>{enviando ? 'Anulando…' : 'Dar por anulada'}</button>
        <button type="button" onClick={() => setAbierto(false)} disabled={enviando} style={btnStyle('secundario')}>Cancelar</button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--negative)', fontSize: 12 }}>{error}</div>}
    </div>
  )
}
