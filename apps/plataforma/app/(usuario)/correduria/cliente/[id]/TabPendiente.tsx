import Link from 'next/link'
import type { ResumenFicha, SiguienteAccion } from '@central/module-seguros'
import { type PolizaFicha } from '@/lib/ficha-asegura'
import { Tarjeta, etiquetaPoliza, fmt } from './piezas'

/**
 * El acceso «🔔 Pendiente» de la ficha: la acción que más vale hoy y la lista de
 * cosas concretas por hacer, cada una con su enlace.
 *
 * Es una LISTA, no un semáforo: un 🟢 se pone verde también cuando no se ha
 * podido mirar nada, y ese es el fallo más caro del repo. Cuando un dato no se
 * ha podido leer se dice —«no se han podido leer los siniestros»— en vez de
 * contarlo como cero.
 */
export default function TabPendiente({ accion, resumen, vivas, clienteId }: {
  accion: SiguienteAccion
  resumen: ResumenFicha
  vivas: PolizaFicha[]
  clienteId: string
}) {
  return (
    <Tarjeta titulo="🔔 Pendiente">
      <div style={{ display: 'grid', gap: 10 }}>
        <SiguienteAccionFicha accion={accion} />
        <PideAccion resumen={resumen} vivas={vivas} clienteId={clienteId} />
      </div>
    </Tarjeta>
  )
}

/** Una sola acción, la que más vale hoy. La decide `siguienteAccion()` (module-seguros), no la pantalla. */
function SiguienteAccionFicha({ accion }: { accion: SiguienteAccion }) {
  if (accion.estado === 'nada') {
    return <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nada pendiente en lo que se ha podido mirar.</div>
  }
  if (accion.estado === 'sin_comprobar') {
    return <div style={{ fontSize: 13, color: 'var(--muted)' }}>No se puede decir que no haya nada: sin comprobar {accion.falta.join(', ')}.</div>
  }
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: accion.urgente ? 'var(--negative)' : 'var(--text)' }}>
        {accion.titulo}
        {accion.polizaId && <>{' '}<Link href={`/correduria/poliza/${accion.polizaId}`} style={{ fontWeight: 400 }}>ver póliza →</Link></>}
      </div>
      <div style={{ color: 'var(--muted)' }}>{accion.porque}</div>
    </div>
  )
}

function PideAccion({ resumen, vivas, clienteId }: {
  resumen: ResumenFicha; vivas: PolizaFicha[]; clienteId: string
}) {
  const { recibos, siniestrosAbiertos, documentosPendientes, proximo } = resumen
  const items: React.ReactNode[] = []

  if (recibos.devueltos !== null && recibos.devueltos > 0) {
    items.push(
      <>
        🔴 <b>{recibos.devueltos} recibo(s) devuelto(s)</b>: hay dinero que reclamar.{' '}
        <Link href={`/correduria/cliente/${clienteId}?tab=polizas`}>ver en sus pólizas →</Link>
      </>,
    )
  }
  if (siniestrosAbiertos !== null && siniestrosAbiertos > 0) {
    items.push(
      <>
        🟠 <b>{siniestrosAbiertos} siniestro(s) abierto(s)</b> en tramitación.{' '}
        <Link href={`/correduria/cliente/${clienteId}?tab=polizas`}>ver siniestros →</Link>
      </>,
    )
  }
  // Solo mientras merece la pena saberlo: dentro de los dos meses de preaviso.
  if (proximo && proximo.enPlazo && proximo.diasHastaLimiteAviso <= 60) {
    const p = vivas.find(x => x.id === proximo.polizaId)
    items.push(
      <>
        🟠 <b>Quedan {proximo.diasHastaLimiteAviso} día(s)</b> para avisar y no renovar
        {p && <> {etiquetaPoliza(p)}</>} (hasta el {fmt(proximo.limiteAviso)}; vence el {fmt(proximo.vencimiento)}).{' '}
        {p && <Link href={`/correduria/poliza/${p.id}`}>ver póliza →</Link>}
      </>,
    )
  }
  if (documentosPendientes !== null && documentosPendientes > 0) {
    items.push(
      <>
        📎 <b>{documentosPendientes} documento(s) pedido(s)</b> y aún sin recibir.{' '}
        <Link href={`/correduria/cliente/${clienteId}?tab=documentos`}>ver documentos →</Link>
      </>,
    )
  }

  // Lo que NO se ha podido mirar se dice aparte: no cuenta ni como pendiente ni
  // como resuelto. Una lista vacía sin esta coletilla afirmaría «no hay nada»
  // sobre datos que nadie ha leído.
  const sinMirar: string[] = []
  if (recibos.devueltos === null) sinMirar.push('los recibos (asegura no los manda)')
  if (siniestrosAbiertos === null) sinMirar.push('los siniestros (no se han podido leer)')
  if (documentosPendientes === null) sinMirar.push('los documentos (no informados)')
  if (recibos.polizasSinRecibos > 0) sinMirar.push(`${recibos.polizasSinRecibos} póliza(s) de las que la compañía no ha mandado ningún recibo`)
  if (resumen.vivasSinFechaVencimiento > 0) sinMirar.push(`${resumen.vivasSinFechaVencimiento} viva(s) sin fecha de vencimiento informada`)

  return (
    <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
      {items.length > 0
        ? items.map((x, i) => <div key={i}>{x}</div>)
        : <div style={{ color: 'var(--muted)' }}>Nada que reclamar en lo que sí se ha podido mirar.</div>}
      {sinMirar.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          Sin comprobar: {sinMirar.join(' · ')}.
        </div>
      )}
    </div>
  )
}
