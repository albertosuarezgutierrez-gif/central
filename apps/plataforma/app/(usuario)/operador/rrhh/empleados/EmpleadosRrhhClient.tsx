'use client'
import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/ui'
import type { EmpleadoRrhh } from '@/lib/rrhh-operador'

const ESTADOS: Record<string, { label: string; color: string }> = {
  activo: { label: 'Activo', color: 'var(--positive)' },
  baja:   { label: 'Baja',   color: '#9ca3af' },
}

// Filas montadas de inicio; el resto sale con «Ver más» (multi-tenant: crece con las empresas).
const PAGE = 50

export default function EmpleadosRrhhClient({ empleados }: { empleados: EmpleadoRrhh[] }) {
  const [q, setQ] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('_all')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activo' | 'baja'>('activo')
  const [nVisibles, setNVisibles] = useState(PAGE)

  const empresas = useMemo(() => {
    const set = new Set(empleados.map(e => e.empresa_nombre))
    return Array.from(set).sort()
  }, [empleados])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return empleados.filter(e => {
      if (filtroEmpresa !== '_all' && e.empresa_nombre !== filtroEmpresa) return false
      if (filtroEstado !== 'todos' && e.estado !== filtroEstado) return false
      if (!t) return true
      return e.nombre.toLowerCase().includes(t) || (e.email ?? '').toLowerCase().includes(t)
    })
  }, [empleados, q, filtroEmpresa, filtroEstado])

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <PageHeader
        titulo={
          <>
            RR.HH. · Empleados{' '}
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', background: 'var(--border)', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>{visibles.length} / {empleados.length}</span>
          </>
        }
      />

      <div className="emp-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="Buscar por nombre o email…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--surface)' }}
        />
        <select
          value={filtroEmpresa}
          onChange={e => setFiltroEmpresa(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--surface)' }}
        >
          <option value="_all">Todas las empresas</option>
          {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['activo', 'baja', 'todos'] as const).map(f => (
            <button key={f} onClick={() => setFiltroEstado(f)} style={{
              padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 13, cursor: 'pointer',
              background: filtroEstado === f ? 'var(--primary)' : 'var(--surface)',
              color: filtroEstado === f ? '#fff' : 'var(--muted)',
            }}>
              {f === 'activo' ? 'Activos' : f === 'baja' ? 'Baja' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      <div className="emp-table-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              {['Empresa', 'Nombre', 'Email', 'Puesto', 'Estado', 'Alta'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.slice(0, nVisibles).map((e, i) => (
              <tr key={e.id} style={{ borderBottom: i < visibles.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13 }}>{e.empresa_nombre}</td>
                <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>{e.nombre}</td>
                <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{e.email ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{e.puesto ?? '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                    color: ESTADOS[e.estado]?.color ?? 'var(--muted)',
                    background: e.estado === 'activo' ? 'var(--positive-bg)' : 'var(--border)',
                  }}>{ESTADOS[e.estado]?.label ?? e.estado}</span>
                </td>
                <td style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13 }}>
                  {e.fecha_alta ? new Date(e.fecha_alta).toLocaleDateString('es-ES') : '—'}
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--muted)' }}>
                {empleados.length === 0 ? 'Sin empleados en iarrhh' : 'Ningún empleado coincide'}
              </td></tr>
            )}
          </tbody>
        </table>
        {visibles.length > nVisibles && (
          <button onClick={() => setNVisibles(v => v + 100)}
            style={{ display: 'block', width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Ver más ({visibles.length - nVisibles} empleados restantes)
          </button>
        )}
      </div>

      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
        Solo lectura. Para gestionar empleados, usa <a href={process.env.NEXT_PUBLIC_RRHH_URL ?? 'https://central-rrhh.vercel.app'} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>central-rrhh.vercel.app</a>.
      </p>
    </div>
  )
}
