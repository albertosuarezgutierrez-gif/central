'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { btnStyle } from '@/components/ui'
import { fechaHoraEs, type NotasFicha } from '@/lib/ficha-asegura'

/**
 * Notas de la ficha como LISTA FECHADA (fase 2 del rediseño, 24/09/2026). Antes había un solo campo
 * «Notas» que se sustituía entero sin enseñar lo que había: escribir una nota borraba la anterior.
 * Ahora cada nota se añade con su fecha y quién la escribió, y la suelta del CRM anterior se enseña
 * aparte, sin tocarla. `null` = no se han podido leer: no es «sin notas».
 */
const POR_PAGINA = 10

export default function NotasCliente({ clienteId, notas }: { clienteId: string; notas: NotasFicha | null }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setOcupado(true)
    setError(null)
    try {
      const res = await fetch('/api/correduria/cliente/nota', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, texto }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (res.ok && j?.estado === 'ok') {
        setTexto('')
        router.refresh()
      } else {
        setError(`No se ha guardado: ${j?.motivo ?? `HTTP ${res.status}`}`)
      }
    } catch {
      setError('No se ha guardado (sin conexión). Reintenta.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="nota-nueva" style={{ fontSize: 12, color: 'var(--muted)' }}>Nueva nota (queda con la fecha y tu nombre)</label>
        <textarea
          id="nota-nueva"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          maxLength={2000}
          rows={2}
          style={{ minHeight: 64, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
        />
        <div>
          <button type="submit" disabled={ocupado || !texto.trim()} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
            {ocupado ? 'Guardando…' : 'Añadir nota'}
          </button>
        </div>
        {error && <div role="alert" style={{ color: 'var(--negative)' }}>{error}</div>}
      </form>

      {notas === null ? (
        <div style={{ color: 'var(--muted)' }}>No se han podido leer las notas: eso no quiere decir que no tenga.</div>
      ) : (
        <>
          {notas.lista.length === 0 && notas.antigua === null && <div style={{ color: 'var(--muted)' }}>Sin notas todavía.</div>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {notas.lista.slice(0, ver).map(n => (
              <li key={n.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{fechaHoraEs(n.fecha)}</span>
                <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{n.texto}</span>
              </li>
            ))}
          </ul>
          {notas.lista.length > ver && (
            <div>
              <button type="button" onClick={() => setVer(v => v + POR_PAGINA)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                Ver anteriores ({notas.lista.length - ver})
              </button>
            </div>
          )}
          {notas.antigua !== null && (
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 6 }}>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>Nota del CRM anterior (sin fecha)</span>
              <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{notas.antigua}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
