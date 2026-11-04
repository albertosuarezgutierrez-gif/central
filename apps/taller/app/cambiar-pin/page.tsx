import { redirect } from 'next/navigation'
import { conTaller } from '@/lib/db'
import { getSession } from '@/lib/session'
import { debeCambiarPin } from '@/lib/acceso'
import { Cabecera } from '../_marca'
import { CambiarPinCliente } from './CambiarPinCliente'

export const dynamic = 'force-dynamic'

export default async function Pagina() {
  const s = await getSession()
  if (!s) redirect('/login')
  const obligatorio = await conTaller(s.tallerId, (tx) => debeCambiarPin(tx as never, s))
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Cambiar mi PIN</h1>
        <CambiarPinCliente obligatorio={obligatorio} />
        {!obligatorio && <p><a href="/" className="btn btn-sec">Volver</a></p>}
      </main>
    </>
  )
}
