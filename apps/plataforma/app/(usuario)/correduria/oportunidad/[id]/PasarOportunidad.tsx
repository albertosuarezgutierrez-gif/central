'use client'

// «Pasar la oportunidad a…» (29/09/2026, diseño §2): probar otra persona como tomador es una VARIANTE
// y no cambia quién lleva la oportunidad. Esto es lo otro — cuando de verdad pasa a llevarla otro.
// Candidatos: las personas del riesgo y los vínculos de quien la lleva hoy (misma ficha = mismo id;
// se agrupa por clienteId, nunca por nombre). Pide confirmación explícita y, hecho, lleva a la ficha
// del nuevo, que es donde la oportunidad vive a partir de ahora. Solo en oportunidades abiertas.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { btnStyle, cardStyle } from '@/components/ui'
import { ROTULO_ROL, type Riesgo } from '@/lib/riesgo-asegura'
import { ESTADOS_ABIERTOS } from '@/lib/correduria/seguros-cliente'
import { motivoDe, type Respuesta } from './piezas-riesgo'

type Candidato = { clienteId: string; nombre: string; como: string[] }

export function candidatosTraspaso(riesgo: Riesgo): Candidato[] {
  const actual = riesgo.oportunidad.clienteId
  const porId = new Map<string, Candidato>()
  const anota = (clienteId: string, nombre: string, como: string) => {
    if (clienteId === actual) return
    const c = porId.get(clienteId) ?? { clienteId, nombre, como: [] }
    if (!c.como.includes(como)) c.como.push(como)
    porId.set(clienteId, c)
  }
  for (const f of riesgo.figuras) anota(f.clienteId, f.nombre, ROTULO_ROL[f.rol])
  for (const v of riesgo.vinculos) anota(v.clienteId, v.nombre, v.tipo)
  return [...porId.values()]
}

export default function PasarOportunidad({ riesgo }: { riesgo: Riesgo }) {
  const router = useRouter()
  const op = riesgo.oportunidad
  const candidatos = useMemo(() => candidatosTraspaso(riesgo), [riesgo])
  const [abierto, setAbierto] = useState(false)
  const [elegido, setElegido] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!(ESTADOS_ABIERTOS as readonly string[]).includes(op.estado)) return null

  const destino = candidatos.find((c) => c.clienteId === elegido) ?? null

  function cerrar() {
    setAbierto(false)
    setElegido('')
    setConfirmando(false)
    setError(null)
  }

  async function pasar() {
    if (!destino || enviando) return
    setEnviando(true)
    setError(null)
    let r: Respuesta
    try {
      const res = await fetch('/api/correduria/oportunidad/traspasar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oportunidadId: op.id, nuevoClienteId: destino.clienteId }),
      })
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
      r = { ok: res.ok && json?.estado === 'ok', status: res.status, json }
    } catch {
      r = { ok: false, status: 0, json: null }
    }
    if (!r.ok) {
      setEnviando(false)
      setConfirmando(false)
      setError(`No se ha pasado: ${motivoDe(r)}.`)
      return
    }
    router.push(`/correduria/cliente/${encodeURIComponent(destino.clienteId)}?tab=oportunidades`)
    router.refresh()
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
        Pasar la oportunidad a…
      </button>
    )
  }

  return (
    <section style={{ ...cardStyle, border: '1px solid var(--border)', display: 'grid', gap: 10, minWidth: 0, marginTop: 8 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Pasar la oportunidad a otra persona</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Solo si pasa a llevarla otro. Para probar otro tomador no hace falta: eso es una variante nueva.
          Los presupuestos ya pedidos se quedan como están.
        </div>
      </div>

      {candidatos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          No hay a quién pasarla: añade antes a esa persona al riesgo o vincúlala a {op.clienteNombre} desde su ficha.
        </p>
      ) : (
        <div role="radiogroup" aria-label="A quién se pasa" style={{ display: 'grid', gap: 6 }}>
          {candidatos.map((c) => (
            <label
              key={c.clienteId}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${elegido === c.clienteId ? 'var(--primary)' : 'var(--border)'}`, minWidth: 0,
              }}
            >
              <input
                type="radio"
                name="pasar-a"
                value={c.clienteId}
                checked={elegido === c.clienteId}
                onChange={() => { setElegido(c.clienteId); setConfirmando(false); setError(null) }}
                disabled={enviando}
              />
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{c.nombre}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}> · {c.como.join(' · ')}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}

      {confirmando && destino ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            La oportunidad dejará de estar en la ficha de <strong>{op.clienteNombre}</strong> y pasará a la de{' '}
            <strong>{destino.nombre}</strong>. ¿Seguro?
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void pasar()} disabled={enviando} style={{ ...btnStyle('primario'), minHeight: 44, whiteSpace: 'normal', maxWidth: '100%' }}>
              {enviando ? 'Pasando…' : `Sí, pasarla a ${destino.nombre}`}
            </button>
            <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
              No
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setConfirmando(true)} disabled={!destino} style={{ ...btnStyle('primario'), minHeight: 44 }}>
            Pasar
          </button>
          <button type="button" onClick={cerrar} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Cancelar</button>
        </div>
      )}
    </section>
  )
}
