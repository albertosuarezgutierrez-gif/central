import Link from 'next/link'

import { empresasDeFlota, nombramientosPendientes } from '@/lib/flota'

/**
 * La puerta a «Tu flota» desde «Mis seguros» (05/10/2026). Componente de
 * SERVIDOR con su propia lectura, y solo aparece si esta identidad lleva la
 * flota de alguna sociedad (dueño o jefe de flota) o tiene un nombramiento
 * pendiente: para casi todo el mundo no pinta nada, y por eso no va en la barra
 * de secciones. Si la lectura falla, calla: esto es un atajo, no un dato, y la
 * pantalla `/flota` dice lo suyo por su cuenta.
 */
export async function EnlaceFlota({ identidadId }: { identidadId: string }) {
  let empresas: Awaited<ReturnType<typeof empresasDeFlota>> = []
  let pendientes = 0
  try {
    const [e, p] = await Promise.all([empresasDeFlota(identidadId), nombramientosPendientes(identidadId)])
    empresas = e
    pendientes = p.length
  } catch {
    return null
  }
  if (empresas.length === 0 && pendientes === 0) return null
  const destino = empresas.length === 1 && pendientes === 0 ? `/flota?empresa=${encodeURIComponent(empresas[0]!.id)}` : '/flota'
  return (
    <p style={{ margin: '0 0 16px' }}>
      <Link className="boton-tenue" style={{ width: '100%' }} href={destino}>
        {pendientes > 0
          ? 'Te han nombrado jefe de flota: revísalo'
          : empresas.length === 1
            ? `Ver la flota de ${empresas[0]!.nombre}`
            : 'Ver la flota de tus sociedades'}
      </Link>
    </p>
  )
}
