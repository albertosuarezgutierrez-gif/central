import { Suspense } from 'react'
import { NavPortal } from '../(portal)/NavPortal'
export default function P() {
  return (
    <div className="portal-shell">
      <Suspense><NavPortal llamar={{ tel: '+34600000000', numero: '600 00 00 00' }} whatsapp="https://wa.me/34600000000" /></Suspense>
      <main className="portal-contenido"><div><h1>Mis seguros</h1>
        {Array.from({ length: 12 }, (_, i) => <p key={i}>Póliza de prueba {i}</p>)}</div></main>
    </div>
  )
}
