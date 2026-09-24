'use client'
import { useEffect, useState } from 'react'

// iPhone/iPad no ofrecen «Instalar» (Safari no implementa `beforeinstallprompt`): se explica a mano,
// solo en iOS, solo si la app no está ya instalada, y se puede cerrar para siempre.
const CLAVE = 'aviso-instalar-cerrado'

export default function AvisoInstalar() {
  const [ver, setVer] = useState(false)
  useEffect(() => {
    try {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
      setVer(ios && !instalada && localStorage.getItem(CLAVE) !== '1')
    } catch { /* sin localStorage: no se enseña */ }
  }, [])
  if (!ver) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 12, padding: '10px 14px', fontSize: 13 }}>
      <span>Para tenerla como app: pulsa <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>.</span>
      <button type="button" onClick={() => { try { localStorage.setItem(CLAVE, '1') } catch {} setVer(false) }}
        aria-label="Cerrar aviso" style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: 'inherit', fontSize: 18, cursor: 'pointer' }}>×</button>
    </div>
  )
}
