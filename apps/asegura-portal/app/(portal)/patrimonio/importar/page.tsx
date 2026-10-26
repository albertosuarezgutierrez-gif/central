import Link from 'next/link'
import { redirect } from 'next/navigation'

import { patrimonioDeIdentidad } from '@/lib/patrimonio/inmuebles-bd'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { Importador } from './Importador'

export const dynamic = 'force-dynamic'

/**
 * «Importar desde Excel» (P18, 26/10/2026): el cliente sube un CSV de inmuebles, contratos o gastos, corrige el
 * mapeo de columnas, ve una vista previa fila a fila con sus errores y SOLO al confirmar se crea. 🚨 Solo los titulares con
 * nivel Total (alta y baja); el resto no ve esta pantalla (la API devuelve 404 igualmente).
 */
export default async function ImportarPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) redirect('/inicio')
  const titulares = (await patrimonioDeIdentidad(identidad.id)).filter((t) => t.puedeAlta)

  return (
    <>
      <p className="antetitulo"><Link href="/patrimonio">Patrimonio</Link></p>
      <h1>Importar desde Excel</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Sube una hoja con tus inmuebles, contratos de alquiler o gastos. Antes de crear nada te enseñamos fila a fila qué
        entraría y qué no, y tú lo confirmas.
      </p>
      {titulares.length === 0 ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio en el que puedas dar de alta inmuebles.</p></section>
      ) : (
        <Importador titulares={titulares.map((t) => ({ clienteId: t.clienteId, nombre: t.nombre }))} />
      )}
    </>
  )
}
