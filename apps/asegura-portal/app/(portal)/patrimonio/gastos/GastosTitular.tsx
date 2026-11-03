'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { TitularGastos } from '@/lib/patrimonio/gastos-api'
import { agruparPorInmueble, type GrupoGastos } from '@/lib/patrimonio/gastos-vista'

import {
  FilaComunidad, FilaDerrama, FilaGasto, FilaPlantilla, NuevaComunidad, NuevaDerrama, NuevaPlantilla, Plegable,
} from './GastosPiezas'
import { FacturasPendientes, RevisarFactura } from './RevisarFactura'

const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Resumen de una línea de lo que cuelga de un grupo: solo cuenta lo que hay (nunca «0 …»). */
function resumen(g: GrupoGastos): string {
  const porConfirmar = g.gastos.filter((x) => x.estado === 'propuesto').length + g.facturasPendientes.length
  return [
    g.plantillas.length > 0 && cuenta(g.plantillas.length, 'gasto fijo', 'gastos fijos'),
    g.comunidades.length > 0 && (g.comunidades.length === 1 ? 'comunidad' : `${g.comunidades.length} comunidades`),
    g.derramas.length > 0 && cuenta(g.derramas.length, 'derrama', 'derramas'),
    porConfirmar > 0 && `${porConfirmar} por confirmar`,
  ].filter(Boolean).join(' · ') || 'Sin gastos todavía'
}

/** Detalle de un grupo (inmueble o generales): se monta solo al abrirlo. */
export function DetalleGrupo({ g, clienteId, puedeGestionar }: { g: GrupoGastos; clienteId: string; puedeGestionar: boolean }) {
  return (
    <div style={{ marginTop: 8 }}>
      {g.plantillas.length > 0 && (<><h4>Gastos fijos</h4><Plegable filas={g.plantillas} vacio="" pinta={(p) => <FilaPlantilla p={p} />} /></>)}
      {g.comunidades.length > 0 && (<><h4>Comunidad de propietarios</h4><Plegable filas={g.comunidades} vacio="" pinta={(c) => <FilaComunidad c={c} />} /></>)}
      {g.derramas.length > 0 && (<><h4>Derramas</h4><Plegable filas={g.derramas} vacio="" pinta={(d) => <FilaDerrama d={d} />} /></>)}
      {g.gastos.length > 0 && (<><h4>Gastos recientes</h4><Plegable filas={g.gastos} vacio="" pinta={(x) => <FilaGasto g={x} clienteId={clienteId} puedeGestionar={puedeGestionar} />} /></>)}
      {g.facturasPendientes.length > 0 && <p className="suave" style={{ fontSize: 13 }}>{cuenta(g.facturasPendientes.length, 'factura pendiente de revisar', 'facturas pendientes de revisar')} (abajo, en «Facturas pendientes de revisar»).</p>}
    </div>
  )
}

function Grupo({ g, clienteId, puedeGestionar }: { g: GrupoGastos; clienteId: string; puedeGestionar: boolean }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <li style={{ minWidth: 0, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ minWidth: 0, flex: '1 1 200px', overflowWrap: 'anywhere' }}>
          <strong>{g.alias}</strong>
          <br />
          <span className="suave" style={{ fontSize: 13 }}>{resumen(g)}</span>
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {g.inmuebleId !== null && (
            <Link className="boton boton-secundario" style={{ minHeight: 44 }} href={`/patrimonio/inmueble/${g.inmuebleId}`}>Ver el piso</Link>
          )}
          <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
            {abierto ? 'Ocultar gastos' : 'Ver gastos'}
          </button>
        </span>
      </div>
      {abierto && <DetalleGrupo g={g} clienteId={clienteId} puedeGestionar={puedeGestionar} />}
    </li>
  )
}

export function GastosTitular({ titular: t }: { titular: TitularGastos }) {
  const [abierto, setAbierto] = useState<null | 'plantilla' | 'comunidad' | 'derrama'>(null)
  const cerrar = () => setAbierto(null)
  const boton = (k: NonNullable<typeof abierto>, texto: string) => (
    <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} onClick={() => setAbierto(k)}>{texto}</button>
  )
  const grupos = agruparPorInmueble(t)
  return (
    <section className="seccion" aria-labelledby={`gastos-${t.clienteId}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 id={`gastos-${t.clienteId}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{t.nombre}</h2>
        <span className="chip">{t.propio ? 'Tuyo' : t.nivel === 'total' ? 'Acceso total' : 'Acceso de gestión'}</span>
      </div>

      <h3>Por piso</h3>
      {grupos.length === 0 ? (
        <p className="suave" style={{ margin: 0 }}>Todavía no hay inmuebles ni gastos.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {grupos.map((g) => <Grupo key={g.inmuebleId ?? 'generales'} g={g} clienteId={t.clienteId} puedeGestionar={t.puedeGestionar} />)}
        </ul>
      )}

      {t.puedeGestionar && abierto === null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {boton('plantilla', 'Añadir gasto fijo')}
          {t.puedeEstructura && boton('comunidad', 'Añadir comunidad')}
          {t.comunidades.some((c) => c.inmuebles.length > 0) && boton('derrama', 'Añadir derrama')}
        </div>
      )}
      {t.puedeGestionar && <FacturasPendientes clienteId={t.clienteId} inmuebles={t.inmuebles} pendientes={t.facturasPendientes} />}
      {t.puedeGestionar && <div style={{ marginTop: 8 }}><RevisarFactura clienteId={t.clienteId} inmuebles={t.inmuebles} /></div>}
      {abierto === 'plantilla' && <NuevaPlantilla t={t} cerrar={cerrar} />}
      {abierto === 'comunidad' && <NuevaComunidad t={t} cerrar={cerrar} />}
      {abierto === 'derrama' && <NuevaDerrama t={t} cerrar={cerrar} />}
    </section>
  )
}
