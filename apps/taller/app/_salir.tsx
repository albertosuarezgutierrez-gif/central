'use client'

export function SalirBoton() {
  return (
    <button
      type="button"
      className="btn btn-sec"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        window.location.href = '/login'
      }}
    >
      Salir
    </button>
  )
}
