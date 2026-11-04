import { redirect } from 'next/navigation'
import { conTaller } from '@/lib/db'
import { getSession } from '@/lib/session'
import { debeCambiarPin, usuarioConRol } from '@/lib/acceso'
import { leerConfig, type TxConfig } from '@/lib/config-repo'
import { leerMarcaGuardada } from '@/lib/marca-repo'
import { Cabecera } from '../_marca'
import { AjustesCliente, type DatosAjustes } from './AjustesCliente'

export const dynamic = 'force-dynamic'

export default async function Pagina() {
  const s = await getSession()
  if (!s) redirect('/login')

  // Todo con el taller de la SESIÓN y bajo RLS; el rol se re-comprueba en BD (no basta la cookie).
  const datos = await conTaller(s.tallerId, async (tx): Promise<DatosAjustes | 'sin_permiso' | 'sin_config' | 'cambiar_pin'> => {
    if (await debeCambiarPin(tx as never, s)) return 'cambiar_pin'
    if (!(await usuarioConRol(tx as never, s, ['dueno']))) return 'sin_permiso'
    const [config, taller, personas, proveedores, marca] = await Promise.all([
      leerConfig(tx as unknown as TxConfig, s.tallerId),
      tx.taller.findFirst({ where: { id: s.tallerId } }),
      tx.usuarioTaller.findMany({
        where: { tallerId: s.tallerId }, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        select: { id: true, nombre: true, rol: true, activo: true },
      }),
      tx.proveedor.findMany({
        where: { tallerId: s.tallerId }, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        select: { id: true, nombre: true, correoPedidos: true, activo: true },
      }),
      leerMarcaGuardada(tx as never, s.tallerId),
    ])
    if (!config || !taller) return 'sin_config'
    return {
      yoId: s.usuarioId,
      config,
      taller: {
        razonSocial: taller.razonSocial, nombreComercial: taller.nombreComercial, nif: taller.nif,
        direccion: { cp: taller.cp, provincia: taller.provincia, municipio: taller.municipio, via: taller.via, numero: taller.numero },
      },
      marca: { primario: marca.primario, secundario: marca.secundario, tieneLogo: marca.logoRuta !== null },
      personas,
      proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre, correo: p.correoPedidos, activo: p.activo })),
    }
  })

  if (datos === 'cambiar_pin') redirect('/cambiar-pin')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Ajustes</h1>
        {datos === 'sin_permiso' ? (
          <p className="tenue">Solo el dueño del taller puede ver y cambiar los ajustes.</p>
        ) : datos === 'sin_config' ? (
          <p className="tenue">Este taller aún no tiene configuración de alta. Avisa a Grupo ASegura.</p>
        ) : (
          <AjustesCliente datos={datos} />
        )}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}
