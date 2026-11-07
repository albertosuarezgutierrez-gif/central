'use client'
import { useState } from 'react'
import type { MiembroVista } from '@/lib/db'

const ROL: Record<string, string> = { dueno: 'Titular (firma)', admin: 'Administración', consulta: 'Consulta (ve todo)', empleado: 'Empleado' }
const MENSAJE: Record<string, string> = { datos_invalidos: 'Revisa el correo y el nombre.', herramienta_no_contratada: 'Esa herramienta no está contratada.', es_el_dueno: 'Esa persona es el titular.' }

export function AccesosCliente({ miembros, contratadas }: { miembros: MiembroVista[]; contratadas: { id: string; nombre: string }[] }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<'admin' | 'consulta' | 'empleado'>('admin')
  const [hs, setHs] = useState<string[]>([])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function pedir(metodo: 'POST' | 'DELETE', cuerpo: unknown) {
    setEnviando(true); setError('')
    const r = await fetch('/api/accesos', { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const j = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(MENSAJE[j.error] ?? 'No se pudo guardar.'); return }
    window.location.reload()
  }

  return (
    <>
      <ul className="lista-simple">
        {miembros.map((m) => (
          <li key={m.personaId} style={{ padding: 12 }}>
            <strong>{m.nombre}</strong> · {m.email} · {ROL[m.rol]}
            {(m.rol === 'admin' || m.rol === 'empleado') && <div className="tenue">{m.herramientas.length ? m.herramientas.map((h) => contratadas.find((c) => c.id === h)?.nombre ?? h).join(', ') : 'Sin herramientas'}</div>}
            {m.rol !== 'dueno' && <div className="fila"><button type="button" className="btn btn-sec" disabled={enviando} onClick={() => pedir('DELETE', { personaId: m.personaId, herramienta: null })}>Quitar acceso</button></div>}
          </li>
        ))}
      </ul>
      <form className="seccion" style={{ display: 'grid', gap: 12, padding: 16 }} onSubmit={(e) => { e.preventDefault(); pedir('POST', { email, nombre, rol, herramientas: rol === 'consulta' ? [] : hs }) }}>
        <h2 style={{ margin: 0 }}>Dar acceso</h2>
        <label className="campo">Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="campo">Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
        <label className="campo">Papel
          <select value={rol} onChange={(e) => setRol(e.target.value as 'admin' | 'consulta' | 'empleado')} style={{ minHeight: 44 }}>
            <option value="admin">Administración: opera las herramientas que marques</option>
            <option value="consulta">Consulta: ve todo, no firma ni da accesos</option>
            <option value="empleado">Empleado: entra en cada herramienta con su acceso de empleado</option>
          </select>
        </label>
        {rol !== 'consulta' && contratadas.map((c) => (
          <label key={c.id} className="casilla"><input type="checkbox" style={{ width: 22, height: 22 }} checked={hs.includes(c.id)} onChange={(e) => setHs((x) => e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id))} /><span>{c.nombre}</span></label>
        ))}
        <button type="submit" className="btn" disabled={enviando || (rol !== 'consulta' && hs.length === 0)}>Dar acceso</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </>
  )
}
