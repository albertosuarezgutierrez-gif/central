import { redirect } from 'next/navigation'
import { conTaller } from '@/lib/db'
import { getSession } from '@/lib/session'
import { usuarioDeSesion } from '@/lib/acceso'
import { Cabecera } from '../_marca'
import { CambiarPinCliente } from './CambiarPinCliente'

export const dynamic = 'force-dynamic'

export default async function Pagina() {
  const s = await getSession()
  if (!s) redirect('/login')
  // Sesión vigente (activo + misma versión): con PIN temporal basta; si no, el formulario pide el PIN ACTUAL.
  const u = await conTaller(s.tallerId, (tx) => usuarioDeSesion(tx as never, s))
  if (!u) redirect('/login')
  const obligatorio = u.debeCambiarPin === true
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
