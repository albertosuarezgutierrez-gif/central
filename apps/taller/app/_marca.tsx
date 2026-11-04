import { SalirBoton } from './_salir'
import { marcaActual } from '@/lib/marca-servidor'

/** Logo del taller (el suyo si lo subió) + sello fijo «con Grupo ASegura» (no editable). */
export async function Cabecera({ conSalir = false }: { conSalir?: boolean }) {
  const m = await marcaActual()
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
