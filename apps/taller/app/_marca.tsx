import { SalirBoton } from './_salir'
import { marcaActual, marcaDelTaller } from '@/lib/marca-servidor'

/** Logo del taller (el suyo si lo subió) + sello fijo «con Grupo ASegura» (no editable). */
export async function Cabecera({ conSalir = false, tallerId }: { conSalir?: boolean; tallerId?: string }) {
  // Páginas públicas por token (sin sesión ni dispositivo): la marca es la del taller del token.
  const m = tallerId ? await marcaDelTaller(tallerId) : await marcaActual()
  return (
    <header className="cabecera">
      <a href="/" className="marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.logoUrl} alt={m.nombre} className="marca-logo" />
        {m.sello && <span className="sello">{m.sello.texto}</span>}
      </a>
      {conSalir && <SalirBoton />}
    </header>
  )
}
