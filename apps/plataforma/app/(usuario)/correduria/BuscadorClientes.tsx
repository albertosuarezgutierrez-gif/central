'use client'
import { useState } from 'react'
import Link from 'next/link'

/**
 * Buscar a un cliente por nombre y entrar en su ficha de un clic.
 *
 * Es la otra mitad del acceso directo: por Renovaciones se llega a quien vence,
 * y por aquí a cualquiera. Busca por nombre y apellidos —que van en claro en la
 * base— y NO por DNI: el DNI se busca por índice ciego, y si esa clave se
 * desincroniza la búsqueda no falla, devuelve vacío. O sea, diría «no existe»
 * sobre un cliente que está ahí.
 */
type Cliente = { id: string; nombre: string; tipo: string; polizas: number }

type Estado =
  | { fase: 'quieto' }
  | { fase: 'buscando' }
  | { fase: 'corto' }
  | { fase: 'hecho'; clientes: Cliente[]; termino: string }
  | { fase: 'fallo'; mensaje: string }

const MOTIVOS: Record<string, string> = {
  secreto_rechazado: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide).',
  asegura_error: 'asegura no pudo leer su base de datos.',
  respuesta_ilegible: 'la respuesta no tenía la forma esperada.',
  red: 'no se pudo llegar a asegura.',
}

export default function BuscadorClientes() {
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState<Estado>({ fase: 'quieto' })

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const termino = q.trim()
    if (termino.length < 3) return setEstado({ fase: 'corto' })
    setEstado({ fase: 'buscando' })
    try {
      const r = await fetch(`/api/correduria/clientes?q=${encodeURIComponent(termino)}`)
      const j = await r.json()
      if (j.estado === 'sin_configurar') {
        return setEstado({ fase: 'fallo', mensaje: 'El puerto con asegura no está conectado en este proyecto.' })
      }
      if (j.estado !== 'ok') {
        return setEstado({ fase: 'fallo', mensaje: MOTIVOS[j.motivo] ?? 'no se ha podido buscar.' })
      }
      setEstado({ fase: 'hecho', clientes: j.clientes ?? [], termino })
    } catch {
      setEstado({ fase: 'fallo', mensaje: 'no se pudo llegar al servidor.' })
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🔎 Buscar un cliente</div>
      <form onSubmit={buscar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Nombre o apellidos (mínimo 3 letras)"
          aria-label="Buscar cliente por nombre o apellidos"
          style={{ flex: '1 1 220px', minWidth: 0, padding: '10px 12px', minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button type="submit" style={{ minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600 }}>
          Buscar
        </button>
      </form>

      <div style={{ marginTop: 10, fontSize: 13 }}>
        {estado.fase === 'corto' && <span style={{ color: 'var(--muted)' }}>Escribe al menos 3 letras.</span>}
        {estado.fase === 'buscando' && <span style={{ color: 'var(--muted)' }}>Buscando…</span>}
        {estado.fase === 'fallo' && (
          <span style={{ color: '#d66' }}>
            No se ha podido buscar: {estado.mensaje} No lo leas como «ese cliente no existe».
          </span>
        )}
        {estado.fase === 'hecho' && estado.clientes.length === 0 && (
          <span style={{ color: 'var(--muted)' }}>
            Nadie coincide con <strong>{estado.termino}</strong> por nombre o apellidos. La búsqueda no
            es por DNI ni email; prueba solo con el primer apellido.
          </span>
        )}
        {estado.fase === 'hecho' && estado.clientes.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
            {estado.clientes.map(c => (
              <li key={c.id} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
                <Link href={`/correduria/cliente/${c.id}`} style={{ fontWeight: 600 }}>{c.nombre}</Link>
                <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 12 }}>
                  {c.tipo === 'cliente' ? '✅ cliente' : '🕐 lead'} · {c.polizas} póliza(s)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
