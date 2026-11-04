'use client'

async function cerrarYVolver() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}

/** «Cambiar de usuario» (pantallas compartidas): cierra la sesión y pide otro PIN sin esperar a que caduque. */
export function SalirBoton() {
  return (
    <span className="fila" style={{ flexWrap: 'nowrap' }}>
      <button type="button" className="btn" onClick={cerrarYVolver}>Cambiar de usuario</button>
      <button type="button" className="btn btn-sec" onClick={cerrarYVolver}>Salir</button>
    </span>
  )
}
