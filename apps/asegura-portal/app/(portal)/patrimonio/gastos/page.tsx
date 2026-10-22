import Link from 'next/link'
import { redirect } from 'next/navigation'

import { gastosDeIdentidad } from '@/lib/patrimonio/gastos-bd'
import { getIdentidad } from '@/lib/session'

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

  return (
    <>
      <p className="antetitulo"><Link href="/patrimonio">Patrimonio</Link></p>
      <h1>Gastos fijos</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Cuotas de comunidad, impuestos, seguros… que se repiten, y las derramas. Cada mes proponemos el gasto y tú lo confirmas.
      </p>
      {titulares.length === 0 ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : (
        titulares.map((t) => <GastosTitular key={t.clienteId} titular={t} />)
      )}
    </>
  )
}
