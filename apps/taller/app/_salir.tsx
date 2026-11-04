'use client'

async function cerrarYVolver() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}

/** «Cambiar de usuario» (pantallas compartidas): cierra la sesión y pide otro PIN sin esperar a que caduque. */
export function SalirBoton() {
  return (
    <span className="cabecera-acciones">
      <a href="/cambiar-pin" className="btn-fantasma solo-ancho">Mi PIN</a>
      <button type="button" className="btn-fantasma solo-ancho" onClick={cerrarYVolver}>Cambiar de usuario</button>
      <button type="button" className="btn-fantasma" onClick={cerrarYVolver} aria-label="Salir">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        <span>Salir</span>
      </button>
    </span>
  )
}
