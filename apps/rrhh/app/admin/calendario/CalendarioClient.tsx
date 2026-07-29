'use client'
import { useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { tipoEtiqueta } from '@/lib/solicitudes-tipos'

type Ausencia = { id: string; tipo: string; fecha_inicio: string; fecha_fin: string; estado: string; empleado_nombre: string }

const COLOR_ESTADO: Record<string, string> = { aprobada: 'bg-ok/20 text-ok border-ok/40', solicitada: 'bg-paper-2 text-ink-3 border-line' }

function mesLabel(mes: string) {
  const [anio, m] = mes.split('-').map(Number)
  return new Date(anio, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

export default function CalendarioClient({ logoUrl, nombreEmpresa, colorPrimario, tieneFichaje }: { logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  const hoy = new Date()
  const mesInicial = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const [mes, setMes] = useState(mesInicial)
  const [ausencias, setAusencias] = useState<Ausencia[]>([])

  useEffect(() => {
    fetch(`/api/admin/calendario?mes=${mes}`)
      .then(r => r.json())
      .then(j => setAusencias(j.ausencias ?? []))
  }, [mes])

  function navMes(delta: number) {
    const [a, m] = mes.split('-').map(Number)
    const d = new Date(a, m - 1 + delta, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Agrupar por empleado
  const porEmpleado = ausencias.reduce<Record<string, Ausencia[]>>((acc, a) => {
    if (!acc[a.empleado_nombre]) acc[a.empleado_nombre] = []
    acc[a.empleado_nombre].push(a)
    return acc
  }, {})

  return (
    <AdminShell activo="calendario" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario} tieneFichaje={tieneFichaje}>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => navMes(-1)} className="bg-paper-2 text-ink-2 hover:bg-line px-2 py-1 text-sm">‹</button>
        <h1 className="flex-1 text-center text-xl capitalize">{mesLabel(mes)}</h1>
        <button onClick={() => navMes(1)} className="bg-paper-2 text-ink-2 hover:bg-line px-2 py-1 text-sm">›</button>
      </div>

      {Object.keys(porEmpleado).length === 0 ? (
        <p className="text-ink-3 text-sm">No hay ausencias registradas para este mes.</p>
      ) : (
        <ul className="grid gap-2">
          {Object.entries(porEmpleado).sort(([a], [b]) => a.localeCompare(b)).map(([nombre, items]) => (
            <li key={nombre} className="rounded-[12px] border border-line bg-card p-3">
              <strong className="text-sm">{nombre}</strong>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {items.map(a => (
                  <span key={a.id}
                    className={`rounded-full border px-2 py-0.5 text-xs ${COLOR_ESTADO[a.estado] ?? 'bg-paper-2 text-ink-2 border-line'}`}
                    title={a.estado}>
                    {tipoEtiqueta(a.tipo)} · {a.fecha_inicio.slice(0, 10)}{a.fecha_fin !== a.fecha_inicio ? ` → ${a.fecha_fin.slice(0, 10)}` : ''}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  )
}
