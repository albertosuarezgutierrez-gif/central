import { SalirBoton } from './_salir'
import { NavTaller } from './_nav'
import { Sello } from './_sello'
import { marcaActual, marcaDelTaller } from '@/lib/marca-servidor'

/**
 * Cabecera común (misma estructura que la del Portal del Empleado): logo del taller + «con Grupo ASegura» pequeño · Salir,
 * y debajo el menú de secciones. Sin sesión (páginas públicas por token y login) solo lleva la marca.
 */
export async function Cabecera({ conSalir = false, tallerId }: { conSalir?: boolean; tallerId?: string }) {
  // Páginas públicas por token (sin sesión ni dispositivo): la marca es la del taller del token.
  const m = tallerId ? await marcaDelTaller(tallerId) : await marcaActual()
  return (
    <header className="cabecera">
      <div className="cabecera-fila">
        <a href="/" className="marca" aria-label={`${m.nombre}: inicio`}>
          {/* El logo del taller nace sobre negro: va en su caja oscura. */}
          <span className="marca-caja">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.logoUrl} alt={m.nombre} className="marca-logo" />
          </span>
          <span className="marca-texto">
            <strong>Gestión del taller</strong>
            {m.sello && <Sello />}
          </span>
        </a>
        {conSalir && <SalirBoton />}
      </div>
      {conSalir && <NavTaller />}
    </header>
  )
}
