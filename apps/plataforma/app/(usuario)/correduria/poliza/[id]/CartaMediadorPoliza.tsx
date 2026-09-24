'use client'
import { useCallback, useEffect, useState } from 'react'

import { ROTULO_ESTADO_CARTA, accionesCarta, type CartaMediador } from '@/lib/carta-mediador-asegura'
import { btnStyle } from '@/components/ui'

const NOTA = { fontSize: 12, color: 'var(--muted, #666)' } as const

/**
 * Cartas de nombramiento de mediador de esta póliza (salida B del presupuesto, PR 6). La firma el
 * cliente en su portal; la MANDAS TÚ a la compañía y aquí lo marcas. Hasta «aceptada» la póliza no
 * es nuestra. Sin cartas no se pinta nada; si no se pudo leer, se dice.
 */
export default function CartaMediadorPoliza({ polizaId }: { polizaId: string }) {
  const [lista, setLista] = useState<CartaMediador[] | null | 'error'>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(() => {
    fetch(`/api/correduria/carta-mediador?polizaId=${encodeURIComponent(polizaId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { estado?: string; cartas?: CartaMediador[] } | null
        setLista(r.ok && j?.estado === 'ok' && Array.isArray(j.cartas) ? j.cartas : 'error')
      })
      .catch(() => setLista('error'))
  }, [polizaId])
  useEffect(cargar, [cargar])

  async function accion(c: CartaMediador, accion: 'enviada' | 'aceptada' | 'rechazada' | 'desistida', motivo?: string) {
    setOcupado(true)
    setAviso(null)
    const r = await fetch('/api/correduria/carta-mediador', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: c.id, accion, motivo }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; motivo?: string } | null
    setOcupado(false)
    setAviso(j?.ok ? { ok: true, texto: 'Anotado.' } : { ok: false, texto: `NO anotado: ${j?.motivo ?? 'no se sabe si se guardó, recarga'}.` })
    cargar()
  }

  if (lista === null) return null
  if (lista === 'error') return <p style={NOTA}>Cartas de nombramiento: no se han podido leer. No quiere decir que no haya ninguna.</p>
  if (lista.length === 0) return null

  return (
    <section style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
      <strong style={{ fontSize: 15 }}>Carta de nombramiento de mediador</strong>
      {lista.map((c) => {
        const a = accionesCarta(c.estado)
        return (
          <div key={c.id} style={{ display: 'grid', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14 }}>
              {ROTULO_ESTADO_CARTA[c.estado]}
              {c.firmadaAt ? ` · firmada el ${new Date(c.firmadaAt).toLocaleDateString('es-ES')}` : ''}
              {c.rechazoMotivo ? ` · ${c.rechazoMotivo}` : ''}
            </span>
            {c.cartaTexto && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, minHeight: 44, display: 'list-item' }}>Ver la carta firmada</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, overflowWrap: 'anywhere', margin: '6px 0 0' }}>{c.cartaTexto}</pre>
                <button type="button" style={btnStyle('sutil')} onClick={() => void navigator.clipboard?.writeText(c.cartaTexto ?? '')}>
                  Copiar el texto
                </button>
              </details>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {a.enviar && (
                <button type="button" disabled={ocupado} style={btnStyle('primario')}
                  onClick={() => { if (window.confirm('¿Ya la has mandado tú a la compañía por fuera? Esto solo lo anota, y retira el correo que espera tu OK en «Hoy».')) void accion(c, 'enviada') }}>
                  Ya la mandé por fuera
                </button>
              )}
              {a.resolver && (
                <>
                  <button type="button" disabled={ocupado} style={btnStyle('primario')}
                    onClick={() => { if (window.confirm('¿La compañía ha aceptado el cambio de mediador?')) void accion(c, 'aceptada') }}>
                    La ha aceptado
                  </button>
                  <button type="button" disabled={ocupado} style={btnStyle('sutil')}
                    onClick={() => { const m = window.prompt('¿Por qué la ha rechazado la compañía?'); if (m && m.trim()) void accion(c, 'rechazada', m.trim()) }}>
                    La ha rechazado
                  </button>
                </>
              )}
              {a.desistir && (
                <button type="button" disabled={ocupado} style={btnStyle('sutil')}
                  onClick={() => { if (window.confirm('¿Desistir de esta carta? No se podrá enviar.')) void accion(c, 'desistida') }}>
                  Desistir
                </button>
              )}
            </div>
          </div>
        )
      })}
      {aviso && <span role="status" style={{ fontSize: 13, color: aviso.ok ? 'var(--positive, #1e7e34)' : 'var(--negative, #c0392b)' }}>{aviso.texto}</span>}
      <span style={NOTA}>La carta no sale sola: mándala tú a la compañía (por su buzón de mediadores) y márcala aquí.</span>
    </section>
  )
}
