'use client'
import { useState } from 'react'
import { tipoEtiqueta } from '@/lib/solicitudes-tipos'
import AdminShell from '@/components/AdminShell'

type S = { id: string; tipo: string; fecha_inicio: string | null; fecha_fin: string | null; motivo: string | null; estado: string; empleado_nombre: string; tiene_justificante?: boolean }

const COLOR: Record<string, string> = { solicitada: 'text-ink-3', aprobada: 'text-ok', rechazada: 'text-alert' }

export default function SolicitudesClient({ inicial, logoUrl, nombreEmpresa, colorPrimario, tieneFichaje }: { inicial: S[]; logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  const [lista, setLista] = useState<S[]>(inicial)
  const [aviso, setAviso] = useState<string | null>(null)
  async function recargar() { const r = await fetch('/api/admin/solicitudes'); if (r.ok) setLista((await r.json()).solicitudes) }
  async function resolver(id: string, aprobar: boolean) {
    const r = await fetch(`/api/admin/solicitudes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aprobar }) })
    if (r.ok) {
      const j = await r.json()
      if (j.aviso) setAviso(j.aviso)
      await recargar()
    }
  }
  const rango = (s: S) => [s.fecha_inicio, s.fecha_fin].filter(Boolean).map(f => f!.slice(0, 10)).join(' → ')
  return (
    <AdminShell activo="solicitudes" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario} tieneFichaje={tieneFichaje}>
      <h1 className="text-2xl">Solicitudes</h1>
      {aviso && (
        <div className="mt-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ {aviso}
          <button onClick={() => setAviso(null)} className="ml-3 text-xs underline bg-transparent p-0 text-amber-700 hover:text-amber-900">Cerrar</button>
        </div>
      )}
      <ul className="mt-3 grid list-none gap-2 p-0">
        {lista.map(s => (
          <li key={s.id} className="rounded-card border border-line bg-card p-3">
            <strong>{s.empleado_nombre}</strong> · {tipoEtiqueta(s.tipo)} {rango(s) && <span>· {rango(s)}</span>}
            <span className={`ml-2 ${COLOR[s.estado] ?? ''}`}>[{s.estado}]</span>
            {s.motivo && <div className="text-ink-3 text-sm">{s.motivo}</div>}
            {s.tiene_justificante && (
              <a href={`/api/admin/solicitudes/${s.id}/justificante`} target="_blank" rel="noreferrer"
                className="text-accent text-sm no-underline hover:underline">📎 Ver justificante</a>
            )}
            {s.estado === 'solicitada' && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => resolver(s.id, true)}>Aprobar</button>
                <button onClick={() => resolver(s.id, false)} className="bg-paper-2 text-ink-2 hover:bg-line">Rechazar</button>
              </div>
            )}
          </li>
        ))}
        {lista.length === 0 && <li className="text-ink-3">Sin solicitudes</li>}
      </ul>
    </AdminShell>
  )
}
