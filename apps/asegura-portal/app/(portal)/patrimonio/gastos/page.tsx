import Link from 'next/link'
import { redirect } from 'next/navigation'

import { avisosCubreSeguro } from '@/lib/patrimonio/cubre-seguro-bd'
import { gastosDeIdentidad } from '@/lib/patrimonio/gastos-bd'
import { getIdentidad } from '@/lib/session'

import { CubreSeguro } from './CubreSeguro'
import { GastosTitular } from './GastosTitular'

export const dynamic = 'force-dynamic'

/**
 * «Gastos fijos» (paso 6, 22/10/2026): plantillas de gasto por inmueble/titular, comunidad y derramas. 🚨 Todo parte de
 * `accesosPatrimonio()` (dentro de `gastosDeIdentidad`): solo los titulares a los que esta sesión tiene acceso.
 */
export default async function GastosPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const titulares = await gastosDeIdentidad(identidad.id)
  // Un extra: si no se lee, se dice; nunca rompe la pantalla ni se toma por «no hay avisos».
  const cubre = await avisosCubreSeguro(identidad.id).catch((e: unknown) => {
    console.error('[patrimonio/gastos] cubre-seguro:', e instanceof Error ? e.message : e)
    return null
  })

  return (
    <>
      <p className="antetitulo"><Link href="/patrimonio">Patrimonio</Link></p>
      <h1>Gastos fijos</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Cuotas de comunidad, impuestos, seguros… que se repiten, y las derramas. Cada mes proponemos el gasto y tú lo confirmas.
      </p>
      {cubre === null && <p className="suave" role="status" style={{ fontSize: 13 }}>Ahora no hemos podido comprobar si alguna reparación la cubre tu seguro.</p>}
      {cubre && <CubreSeguro avisos={cubre} />}
      {titulares.length === 0 ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : (
        titulares.map((t) => <GastosTitular key={t.clienteId} titular={t} />)
      )}
    </>
  )
}
