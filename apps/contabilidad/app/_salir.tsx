'use client'

async function salir() {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}

/** «Cambiar de empresa» (quien tiene varias, p. ej. un gestor) y «Salir» (cierra TODAS las sesiones de este usuario). */
export function SalirBoton({ variasEmpresas = false }: { variasEmpresas?: boolean }) {
  return (
    <span className="cabecera-acciones">
      {variasEmpresas && <a href="/empresas" className="btn-fantasma">Cambiar de empresa</a>}
      <button type="button" className="btn-fantasma" onClick={salir} aria-label="Salir">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
        <span>Salir</span>
      </button>
    </span>
  )
}
