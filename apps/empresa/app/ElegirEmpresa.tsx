'use client'

export function ElegirEmpresa({ opciones }: { opciones: { id: string; nombre: string }[] }) {
  async function elegir(id: string) {
    const r = await fetch('/api/auth/elegir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cuentaId: id }) })
    if (r.ok) window.location.href = '/'
  }
  return (
    <div className="lista">
      {opciones.map((o) => <button key={o.id} type="button" className="btn btn-sec" onClick={() => elegir(o.id)}>{o.nombre}</button>)}
    </div>
  )
}
