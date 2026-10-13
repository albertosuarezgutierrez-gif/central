'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { estiloAviso, interpretarBanda, type BandaAvisos as Banda } from '@/lib/correduria/avisos-banda'

/**
 * La banda de avisos de «Mi mesa» (13/10/2026): UNA línea por cola que tiene plazo encima o es urgente, con su
 * enlace a «Gestión» (donde se trabajan). Datos: `GET /api/correduria/avisos` (contrato en `lib/correduria/avisos.ts`).
 *
 * 🚨 Tres estados, y el que importa es el segundo: lista vacía comprobada → no ocupa NI UN píxel; «no se pudo
 * comprobar X» → SE PINTA (ámbar), nunca se oculta; la propia petición fallida → una línea que lo dice. Un
 * plazo legal que corre en silencio porque la banda no pudo leer su cola es exactamente el fallo que esta
 * banda existe para evitar.
 */
export default function BandaAvisos() {
  const [banda, setBanda] = useState<Banda | null>(null)
  const [cargando, setCargando] = useState(true)
  const peticion = useRef(0)

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true)
    try {
      const r = await fetch('/api/correduria/avisos', { cache: 'no-store' })
      const j = await r.json().catch(() => null)
      if (mia === peticion.current) setBanda(interpretarBanda(r.status, j))
    } catch {
      if (mia === peticion.current) setBanda({ estado: 'error', motivo: 'no se ha podido conectar' })
    } finally {
      if (mia === peticion.current) setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  if (banda === null) {
    return cargando ? <p aria-live="polite" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Comprobando avisos…</p> : null
  }

  if (banda.estado === 'error') {
    return (
      <div role="alert" style={{ ...linea, borderColor: 'var(--warning)', background: 'var(--warning-bg)', color: 'var(--warning)' }}>
        <span style={{ fontWeight: 700 }}>No se han podido comprobar los avisos ({banda.motivo}). Esto no significa que no haya.</span>
        <button type="button" disabled={cargando} onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
          {cargando ? 'Reintentando…' : 'Reintentar'}
        </button>
      </div>
    )
  }

  if (banda.avisos.length === 0 && banda.descartados === 0) return null // comprobado y nada pendiente

  return (
    <section aria-label="Avisos con plazo" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
      {banda.avisos.map(a => {
        const e = estiloAviso(a.nivel)
        return (
          <Link key={`${a.tipo}`} href={a.href}
            style={{ ...linea, borderColor: e.borde, background: e.fondo, color: 'var(--text)', textDecoration: 'none' }}>
            <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
              <span aria-hidden style={{ fontWeight: 800, color: e.color, minWidth: 12, textAlign: 'center' }}>{e.marca}</span>
              <span style={{ overflowWrap: 'anywhere', fontWeight: a.nivel === 'aviso' ? 500 : 700, color: a.nivel === 'aviso' ? 'var(--text)' : e.color }}>{a.texto}</span>
            </span>
            <span aria-hidden style={{ color: 'var(--muted)' }}>›</span>
          </Link>
        )
      })}
      {banda.descartados > 0 && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          {banda.descartados} aviso{banda.descartados === 1 ? '' : 's'} no se ha podido leer y no aparece{banda.descartados === 1 ? '' : 'n'}.
        </p>
      )}
    </section>
  )
}

const linea: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
  minHeight: 44, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14,
}
