'use client'

import { useState } from 'react'

import type { TitularGastos } from '@/lib/patrimonio/gastos-api'
import { gruposDeInmueble } from '@/lib/patrimonio/gastos-vista'

import {
  FilaComunidad, FilaDerrama, FilaGasto, FilaPlantilla, NuevaDerrama, NuevaPlantilla, Plegable,
} from '../../gastos/GastosPiezas'
import { FacturasPendientes, RevisarFactura } from '../../gastos/RevisarFactura'

/**
 * «Gastos de este piso» (ficha del inmueble): lo mismo que `/patrimonio/gastos` pero filtrado por ESTE inmueble, con el
 * inmueble ya puesto en «Añadir gasto fijo», «Subir factura» y «Añadir derrama». Solo quien puede gestionar ve botones.
 * El titular llega ya filtrado por los accesos de la sesión (servidor); aquí solo se reparte.
 */
export function GastosDeEstePiso({ titular: t, inmuebleId, alias }: { titular: TitularGastos; inmuebleId: string; alias: string }) {
  const [abierto, setAbierto] = useState<null | 'plantilla' | 'derrama'>(null)
  const cerrar = () => setAbierto(null)
  const g = gruposDeInmueble(t, inmuebleId)
  const soloEste = [{ id: inmuebleId, alias }]
  return (
    <>
      <h3>Gastos fijos</h3>
      <Plegable filas={g.plantillas} vacio="Todavía no hay gastos fijos en este piso." pinta={(p) => <FilaPlantilla p={p} />} />
      <h3>Comunidad de propietarios</h3>
      <Plegable filas={g.comunidades} vacio="Sin comunidad dada de alta para este piso." pinta={(c) => <FilaComunidad c={c} />} />
      <h3>Derramas</h3>
      <Plegable filas={g.derramas} vacio="Sin derramas." pinta={(d) => <FilaDerrama d={d} />} />
      <h3>Gastos recientes</h3>
      <Plegable filas={g.gastos} vacio="Todavía no hay gastos generados para este piso." pinta={(x) => <FilaGasto g={x} clienteId={t.clienteId} puedeGestionar={t.puedeGestionar} />} />

      {t.puedeGestionar && abierto === null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} onClick={() => setAbierto('plantilla')}>Añadir gasto fijo</button>
          {g.comunidades.some((c) => c.inmuebles.length > 0) && (
            <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} onClick={() => setAbierto('derrama')}>Añadir derrama</button>
          )}
        </div>
      )}
      {t.puedeGestionar && <FacturasPendientes clienteId={t.clienteId} inmuebles={soloEste} pendientes={g.facturasPendientes} />}
      {t.puedeGestionar && <div style={{ marginTop: 8 }}><RevisarFactura clienteId={t.clienteId} inmuebles={soloEste} /></div>}
      {abierto === 'plantilla' && <NuevaPlantilla t={t} cerrar={cerrar} inmuebleFijo={inmuebleId} />}
      {abierto === 'derrama' && <NuevaDerrama t={t} cerrar={cerrar} inmuebleFijo={inmuebleId} />}
    </>
  )
}
