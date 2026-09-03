import Link from 'next/link'
import type { ResumenFicha } from '@central/module-seguros'
import type { IntervinienteFicha, PolizaFicha } from '@/lib/ficha-asegura'
import { Polizas, Tarjeta, etiquetaPoliza, fmt } from './piezas'

/**
 * La pestaña que se abre al pinchar un nombre: lo que está en vigor y lo que
 * hay que hacer con ello.
 *
 * «Pide acción» es una LISTA de cosas concretas con su enlace, no un semáforo:
 * un 🟢 se pone verde también cuando no se ha podido mirar nada, y ese es el
 * fallo más caro del repo. Aquí, cuando un dato no se ha podido leer se dice
 * —«no se han podido leer los siniestros»— en vez de contarlo como cero.
 */
export default function TabResumen({ resumen, porClase, intervinientes, clienteId }: {
  resumen: ResumenFicha
  porClase: Record<'viva' | 'pendiente_cima' | 'cancelada' | 'historica', PolizaFicha[]>
  intervinientes: IntervinienteFicha[] | null
  clienteId: string
}) {
  return (
    <>
      <Tarjeta titulo="🔔 Pide acción">
        <PideAccion resumen={resumen} vivas={porClase.viva} clienteId={clienteId} />
      </Tarjeta>

      <Polizas titulo="Pólizas vivas" polizas={porClase.viva} vacio="Ninguna póliza activa entra hoy por CIMA." intervinientes={intervinientes} />

      {porClase.pendiente_cima.length > 0 && (
        <Polizas
          titulo={`📝 Emitidas, pendientes de confirmación por CIMA (${porClase.pendiente_cima.length})`}
          nota="CIMA aún no la ha traído: no cuenta como viva ni genera avisos. Cuando la compañía la mande por CIMA se casará con esta y pasará a «Pólizas vivas»."
          polizas={porClase.pendiente_cima}
          vacio=""
          intervinientes={intervinientes}
        />
      )}

      {(porClase.cancelada.length > 0 || porClase.historica.length > 0) && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          {porClase.cancelada.length > 0 && `${porClase.cancelada.length} cancelada(s) en CIMA`}
          {porClase.cancelada.length > 0 && porClase.historica.length > 0 && ' · '}
          {porClase.historica.length > 0 && `${porClase.historica.length} del volcado histórico`}
          {' → '}
          <Link href={`/correduria/cliente/${clienteId}?tab=polizas`}>ver en Pólizas</Link>
        </p>
      )}
    </>
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
        <Link href={`/correduria/cliente/${clienteId}?tab=recibos`}>ver recibos →</Link>
      </>,
    )
  }
  if (siniestrosAbiertos !== null && siniestrosAbiertos > 0) {
    items.push(
      <>
        🟠 <b>{siniestrosAbiertos} siniestro(s) abierto(s)</b> en tramitación.{' '}
        <Link href={`/correduria/cliente/${clienteId}?tab=siniestros`}>ver siniestros →</Link>
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
