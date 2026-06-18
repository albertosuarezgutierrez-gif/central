'use client'
import { useEffect, useState } from 'react'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      overflowY: 'auto',
      // En móvil: el sidebar es position:fixed (no empuja el contenido),
      // pero el botón hamburguesa ocupa ~52px en la parte superior.
      paddingTop: isMobile ? 52 : 0,
      // En móvil no hay margen lateral (el sidebar flota por encima).
      marginLeft: 0,
      width: isMobile ? '100%' : undefined,
    }}>
      {children}
    </div>
  )
}
