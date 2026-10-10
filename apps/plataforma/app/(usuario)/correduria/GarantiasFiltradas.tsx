'use client'
import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import Bloque from './Bloque'
import { Pendiente } from '@/components/ui'
import type { GarantiasFiltradas as Datos } from '@/lib/garantias-filtradas-asegura'

/**
 * Qué garantías marcan los clientes en el filtro de su presupuesto (portal), sumado sobre todos
 * los presupuestos de los últimos 90 días. Cuenta PRESUPUESTOS distintos, no clics.
 *
 * Es un informe que acumula: el 29/09/2026, el día que se montó, había 0 eventos (la telemetría del
 * portal acababa de salir). Sin actividad se dice «aún no hay», no se pinta una tabla a cero; y un
 * fallo de lectura se dice como fallo, no como «nadie filtra nada».
 */
export default function GarantiasFiltradas() {
  const [r, setR] = useState<Datos | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/garantias-filtradas')
      .then((res) => (res.ok ? res.json() : { estado: 'error', motivo: `HTTP ${res.status}` }))
      .then((d) => { if (vivo) setR(d) })
      .catch(() => { if (vivo) setR({ estado: 'error', motivo: 'red' }) })
    return () => { vivo = false }
  }, [])

  const titulo = 'Qué garantías filtran los clientes'

  if (r === null) {
    return (
      <Bloque titulo={titulo} Icono={SlidersHorizontal}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>
      </Bloque>
    )
  }
  if (r.estado === 'sin_configurar') {
    return (
      <Bloque titulo={titulo} Icono={SlidersHorizontal}>
        <Pendiente texto="Puerto de asegura sin configurar." donde="Falta ASEGURA_OPERADOR_SECRET en el proyecto Vercel de plataforma." />
      </Bloque>
    )
  }
  if (r.estado === 'error') {
    return (
      <Bloque titulo={titulo} Icono={SlidersHorizontal} tono="aviso">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          No se ha podido leer ({r.motivo}). No significa que nadie filtre: inténtalo de nuevo más tarde.
        </p>
      </Bloque>
    )
  }

  const n = r.presupuestosConActividad
  return (
    <Bloque
      titulo={titulo}
      Icono={SlidersHorizontal}
      sub={n === 0
        ? 'Últimos 90 días · aún no hay actividad de clientes en el filtro.'
        : `Últimos 90 días · ${n} presupuesto${n === 1 ? '' : 's'} con el filtro usado (cuenta presupuestos, no clics).`}
    >
      {n === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Se irá llenando a medida que los clientes abran sus presupuestos en el portal y marquen garantías.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {r.ramos.map((ramo) => (
            <div key={ramo.ramo} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <strong style={{ fontSize: 13, textTransform: 'capitalize' }}>
                {ramo.ramo} · {ramo.presupuestos} presupuesto{ramo.presupuestos === 1 ? '' : 's'}
              </strong>
              {ramo.garantias.map((g) => {
                const pct = ramo.presupuestos > 0 ? Math.round((g.presupuestos / ramo.presupuestos) * 100) : 0
                return (
                  <div key={g.clave} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '2px 10px', fontSize: 13 }}>
                    <span style={{ overflowWrap: 'anywhere' }}>{g.etiqueta}</span>
                    <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{g.presupuestos} · {pct}%</span>
                    <div style={{ gridColumn: '1 / -1', height: 6, borderRadius: 3, background: 'var(--border)' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--primary)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Bloque>
  )
}
