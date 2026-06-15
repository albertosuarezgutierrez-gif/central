'use client'
import { useState } from 'react'
import { tipoEtiqueta } from '@/lib/solicitudes'

type S = { id: string; tipo: string; fecha_inicio: string | null; fecha_fin: string | null; motivo: string | null; estado: string; empleado_nombre: string }

const COLOR: Record<string, string> = { solicitada: '#b58900', aprobada: 'green', rechazada: 'crimson' }

export default function SolicitudesClient({ inicial }: { inicial: S[] }) {
  const [lista, setLista] = useState<S[]>(inicial)
  async function recargar() { const r = await fetch('/api/admin/solicitudes'); if (r.ok) setLista((await r.json()).solicitudes) }
  async function resolver(id: string, aprobar: boolean) {
    const r = await fetch(`/api/admin/solicitudes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aprobar }) })
    if (r.ok) await recargar()
  }
  const rango = (s: S) => [s.fecha_inicio, s.fecha_fin].filter(Boolean).join(' → ')
  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: 16 }}>
      <a href="/admin/empleados">← Empleados</a>
      <h1>Solicitudes</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {lista.map(s => (
          <li key={s.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, margin: '8px 0' }}>
            <strong>{s.empleado_nombre}</strong> · {tipoEtiqueta(s.tipo)} {rango(s) && <span>· {rango(s)}</span>}
            <span style={{ color: COLOR[s.estado], marginLeft: 8 }}>[{s.estado}]</span>
            {s.motivo && <div style={{ color: '#666', fontSize: 13 }}>{s.motivo}</div>}
            {s.estado === 'solicitada' && (
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <button onClick={() => resolver(s.id, true)}>✅ Aprobar</button>
                <button onClick={() => resolver(s.id, false)}>❌ Rechazar</button>
              </div>
            )}
          </li>
        ))}
        {lista.length === 0 && <li style={{ color: '#aaa' }}>Sin solicitudes</li>}
      </ul>
    </main>
  )
}
