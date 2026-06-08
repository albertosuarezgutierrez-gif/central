'use client'

// /super/gate/page.tsx
// PÃ¡gina puente que recibe una sesiÃ³n serializada en el hash de la URL,
// la almacena en localStorage y redirige al panel del restaurante.
// Solo accesible desde el botÃ³n ABRIR del super admin.

import { useEffect, useState } from 'react'

export default function SuperGatePage() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    try {
      // La sesiÃ³n viene en el hash para que nunca llegue al servidor
      const hash = window.location.hash.slice(1) // quitar el #
      if (!hash) { setStatus('error'); setMsg('Sin datos de sesiÃ³n'); return }

      const decoded = atob(hash)
      const data = JSON.parse(decoded) as {
        session: Record<string, unknown>
        restaurante_codigo: string
        redirect_to: string
      }

      if (!data.session || !data.redirect_to) {
        setStatus('error'); setMsg('Datos de sesiÃ³n invÃ¡lidos'); return
      }

      // Guardar sesiÃ³n y cÃ³digo de restaurante
      localStorage.setItem('ia_rest_session', JSON.stringify(data.session))
      localStorage.setItem('ia_rest_restaurante', data.restaurante_codigo)

      setStatus('ok')
      setMsg(`Accediendo como ${String(data.session.nombre)} (${String(data.session.rol)})...`)

      // Redirigir al panel del restaurante
      setTimeout(() => {
        window.location.href = data.redirect_to
      }, 600)
    } catch {
      setStatus('error')
      setMsg('Error al procesar la sesiÃ³n')
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#14110E',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Inter Tight", system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        {status === 'loading' && (
          <div style={{ color: '#8D8270', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
            Preparando acceso...
          </div>
        )}
        {status === 'ok' && (
          <>
            <div style={{ color: '#D9442B', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '.12em', marginBottom: 8 }}>
              SUPER ADMIN Â· ACCESO DIRECTO
            </div>
            <div style={{ color: '#F6F1E7', fontFamily: '"Newsreader", Georgia, serif', fontSize: 24 }}>
              {msg}
            </div>
          </>
        )}
        {status === 'error' && (
          <div style={{ color: '#D9442B', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
            Error: {msg}
          </div>
        )}
      </div>
    </div>
  )
}
