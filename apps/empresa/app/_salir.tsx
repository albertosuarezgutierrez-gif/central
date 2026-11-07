'use client'

/** «Salir» del panel. NO cierra las sesiones abiertas en Contabilidad o RRHH: se dice en el propio botón. */
export function SalirBoton() {
  async function salir() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    window.location.href = '/login'
  }
  return <button type="button" className="btn-fantasma" onClick={salir} title="Sale de Mi empresa. Las herramientas que tengas abiertas siguen abiertas hasta que salgas de ellas.">Salir</button>
}
