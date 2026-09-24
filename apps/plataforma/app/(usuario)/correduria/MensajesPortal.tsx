'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui'
import { fechaHoraEs } from '@/lib/ficha-asegura'
import Bloque from './Bloque'
import { leerPendiente, type PendienteMensaje } from '@/lib/mensajes-asegura'

/**
 * Mensajes que el CLIENTE ha escrito en su portal y nadie ha leído (ASegura OS §Q.7).
 *
 * Mismo contrato que el resto de «Hoy»: sin nada pendiente no ocupa sitio; un fallo de lectura
 * NO se calla (se lee como «no hay nadie escribiendo», que es la mentira cara) y el contador que
 * sube es `null`, nunca 0. Contestar se hace en la ficha (pestaña «Mensajes»): aquí solo se ve
 * quién espera y desde cuándo, la más antigua primero.
 */
type Lectura = { estado: 'ok'; pendientes: PendienteMensaje[] } | { estado: 'sin_datos'; causa: string }

export default function MensajesPortal({ onContador }: {
  /** Fichas con mensajes sin leer. `null` = no se ha podido saber; nunca 0. */
  onContador?: (n: number | null) => void
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  useEffect(() => {
    let vivo = true
    ;(async (): Promise<Lectura> => {
      try {
        const res = await fetch('/api/correduria/mensajes')
        const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
        if (j?.estado === 'ok' && Array.isArray(j.pendientes)) {
          const lista = j.pendientes.map(leerPendiente)
          if (lista.some(x => x === null)) return { estado: 'sin_datos', causa: 'fila incompleta' }
          return { estado: 'ok', pendientes: lista as PendienteMensaje[] }
        }
        return { estado: 'sin_datos', causa: typeof j?.causa === 'string' ? j.causa : `HTTP ${res.status}` }
      } catch {
        return { estado: 'sin_datos', causa: 'sin conexión' }
      }
    })().then((r) => {
      if (!vivo) return
      setLectura(r)
      // Con 51 filas asegura avisa de que hay más de 50: el contador no se queda corto en silencio.
      avisar.current?.(r.estado === 'ok' ? r.pendientes.length : null)
    })
    return () => { vivo = false }
  }, [])

  if (lectura === null) return null

  if (lectura.estado !== 'ok') {
    return (
      <Bloque tono="aviso" Icono={MessageSquare} titulo="Mensajes del portal" accion={<Badge tono="aviso">No se han podido leer</Badge>}
        sub={<>No se han podido leer ({lectura.causa}). <strong>No significa que nadie haya escrito.</strong></>}>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>Se vuelve a intentar al recargar la página.</p>
      </Bloque>
    )
  }

  if (lectura.pendientes.length === 0) return null

  const hayMas = lectura.pendientes.length > 50
  return (
    <Bloque destacado tono="aviso" Icono={MessageSquare}
      titulo={`${hayMas ? 'Más de 50' : lectura.pendientes.length} cliente(s) te han escrito en el portal`}
      sub="Esperan respuesta. Se contesta en su ficha → Mensajes (o se marca «no necesita respuesta»), y el cliente la ve en su portal.">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {lectura.pendientes.slice(0, 50).map((p) => (
          <li key={p.clienteId} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0, flex: '1 1 240px' }}>
              <strong>{p.nombre ?? 'Cliente sin nombre en la ficha'}</strong>{' '}
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>· {p.sinLeer} sin leer · último {fechaHoraEs(p.ultimoAt)}</span>
              <div style={{ color: 'var(--muted)', fontSize: 13, overflowWrap: 'anywhere' }}>«{p.ultimo}»</div>
            </div>
            <Link href={`/correduria/cliente/${p.clienteId}?tab=mensajes`} prefetch={false}
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontWeight: 600 }}>
              Contestar →
            </Link>
          </li>
        ))}
      </ul>
    </Bloque>
  )
}
