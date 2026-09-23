import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { diasHastaVencimientoPortal, enVentanaVencimientos } from '@central/module-seguros-portal'
import { carteraDeIdentidad, type PolizaPortal } from '@/lib/cartera-lectura'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'
import { peticionesPrecio } from '@/lib/mejorar-precio'
import { getIdentidad } from '@/lib/session'

import { tituloDePoliza } from '../../PolizaVista'
import { FormMejorar } from './FormMejorar'

export const dynamic = 'force-dynamic'

/**
 * «Mejorar el precio» de UNA póliza (pieza 1-5, maqueta aprobada 23/09/2026).
 *
 * 🚨 Como la ficha de póliza: el id de la URL NO consulta nada. Se lee lo que
 * esta sesión puede ver y se busca el id dentro — y SOLO entre sus fichas
 * (`propias`): una póliza que un tercero te deja ver no la puedes renegociar
 * tú. Fuera de eso, 404.
 */
export default async function MejorarPrecio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  const cartera = await carteraDeIdentidad(identidad.id)
  let p: PolizaPortal | null = null
  for (const t of cartera.propias) p = p ?? t.polizas.find((x) => x.id === id) ?? null
  if (!p || p.vigencia !== 'vigente' || !p.fechaVencimiento) notFound()

  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const dias = diasHastaVencimientoPortal(p.fechaVencimiento.toISOString().slice(0, 10), hoy)
  // Un 0 guardado no es una prima: se calla, igual que asegura (`nullif(…, 0)`).
  const primaLeida = p.prima?.bruta ?? p.prima?.anual ?? null
  const prima = primaLeida !== null && primaLeida > 0 ? primaLeida : null
  const pedido = (await peticionesPrecio(identidad.id))?.find((x) => x.polizaId === p.id)?.pedidoEl ?? null

  return (
    <>
      <p className="volver">
        <Link href="/boveda">‹ Mis seguros</Link>
      </p>
      <h1 className="ficha-titulo">Mejorar el precio</h1>

      <section className="vencimiento-tarjeta" style={{ marginBottom: 20 }}>
        <strong style={{ fontSize: 15 }}>{tituloDePoliza(p)} · {p.compania}</strong>
        <span className="suave" style={{ fontSize: 13 }}>
          Renueva el {fechaEs(p.fechaVencimiento)}{prima !== null ? ` · pagas ahora ${eur(prima)} al año` : ''}
        </span>
      </section>

      {pedido ? (
        <p>Ya nos lo pediste el {fechaEs(new Date(`${pedido}T12:00:00Z`))}. Te contactamos antes de que renueve; no hace falta que lo vuelvas a pedir.</p>
      ) : !enVentanaVencimientos(dias) ? (
        // No renueva en los próximos 60 días: aún no hay precio de renovación
        // con el que comparar. Se dice cuándo, en vez de aceptar algo que no se va a atender.
        <p>Esta póliza renueva el {fechaEs(p.fechaVencimiento)}. Podrás pedirnos que te la miremos en los dos meses anteriores; te lo recordaremos aquí.</p>
      ) : (
        <FormMejorar polizaId={p.id} lectura={Boolean(identidad.corredor)} />
      )}
    </>
  )
}
