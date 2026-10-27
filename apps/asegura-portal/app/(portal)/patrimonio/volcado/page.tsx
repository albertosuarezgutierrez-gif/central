import Link from 'next/link'
import { redirect } from 'next/navigation'

import { patrimonioDeIdentidad } from '@/lib/patrimonio/inmuebles-bd'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { Volcado } from './Volcado'

export const dynamic = 'force-dynamic'

/**
 * «Cargar mi patrimonio de una vez» (volcado inicial, 27/10/2026): el cliente sube su Excel, un PDF o una foto; la lectura
 * automática PROPONE edificio y pisos (o inmuebles sueltos), contratos con su inquilino y los gastos fijos; el cliente lo
 * corrige aquí y SOLO al confirmar se crea. 🚨 Solo titulares con nivel Total (la API devuelve 404 igualmente).
 */
export default async function VolcadoPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) redirect('/inicio')
  const titulares = (await patrimonioDeIdentidad(identidad.id)).filter((t) => t.puedeAlta)

  return (
    <>
      <p className="antetitulo"><Link href="/patrimonio">Patrimonio</Link></p>
      <h1>Cargar mi patrimonio de una vez</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Sube tu Excel, un PDF o una foto de tus contratos o de tu listado de pisos. Te proponemos los inmuebles, los contratos y
        los gastos fijos; tú lo corriges y nada se crea hasta que lo confirmas.
      </p>
      {titulares.length === 0 ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio en el que puedas dar de alta inmuebles.</p></section>
      ) : (
        <Volcado titulares={titulares.map((t) => ({ clienteId: t.clienteId, nombre: t.nombre }))} />
      )}
      <p className="suave" style={{ fontSize: 13 }}>
        ¿Prefieres una hoja por tipo de dato, sin lectura automática? <Link href="/patrimonio/importar">Importar desde Excel</Link>.
      </p>
    </>
  )
}
