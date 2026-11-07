import { marcaCabecera, SELLO } from '@/lib/marca'
import { SelectorEmpresa } from './SelectorEmpresa'
import { SalirBoton } from './_salir'
import type { CuentaPanel } from '@/lib/db'
import { puede } from '@central/core-herramientas'

/** Cabecera: selector de empresa (logo/iniciales + nombre; chevron solo con varias) + «con Grupo ASegura» pequeño · Salir. */
export function Cabecera({ cuentas, actual }: { cuentas: CuentaPanel[]; actual: CuentaPanel | null }) {
  const opciones = cuentas.map((c) => ({ id: c.id, ...marcaCabecera({ razonSocial: c.razonSocial, logoUrl: c.logoUrl }) }))
  return (
    <header className="cabecera">
      <div className="cabecera-fila">
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
          <SelectorEmpresa opciones={opciones} actual={actual?.id ?? null} />
          <span className="sello" style={{ paddingLeft: 4 }}>{SELLO}</span>
        </div>
        <nav className="cabecera-acciones" aria-label="Menú">
          <a href="/" className="btn-fantasma">Inicio</a>
          {puede(actual?.rol, 'ver_contrato') && <a href="/contratos" className="btn-fantasma">Contratos</a>}
          {actual?.rol === 'dueno' && <a href="/accesos" className="btn-fantasma">Accesos</a>}
          <SalirBoton />
        </nav>
      </div>
    </header>
  )
}
