import { Fragment } from 'react'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { LEYENDA_VERIFACTU } from '@central/core-fiscal'
import { formatearEur } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { tienePermiso } from '@/lib/permisos'
import { cargarFacturaVista } from '@/lib/facturas-vista'
import { Cabecera } from '../../_marca'
import { abonoTotalAccion, anularAccion, cobrarAccion } from '../acciones'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fechaEs = (iso: string) => iso.split('-').reverse().join('/')
const pct = (pb: number) => `${(pb / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
const TITULO: Record<string, string> = { F1: 'Factura', F2: 'Factura simplificada' }

export default async function Pagina({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params
  const { aviso } = await searchParams
  if (!UUID.test(id)) notFound()
  const datos = await paraPagina('facturar', async (tx, c) => {
    const f = await cargarFacturaVista(tx as never, c.tallerId, id)
    if (!f) return null
    const medios = (await tx.medioCobro.findMany({ where: { tallerId: c.tallerId, activo: true }, orderBy: { nombre: 'asc' } }))
      .map((m) => ({ codigo: m.codigo, nombre: m.nombre }))
    return { f, medios, puedeRectificar: tienePermiso(c.rol, 'facturas_rectificar') }
  })
  if (datos === 'sin_sesion') redirect('/login')
  if (datos === 'sin_permiso') return <main className="contenido"><p className="tenue">Tu perfil no incluye la facturación.</p></main>
  if (!datos) notFound()
  const { f, medios } = datos
  const qr = await QRCode.toDataURL(f.qrUrl, { errorCorrectionLevel: 'M', margin: 2, width: 264 })
  const esRect = f.tipo.startsWith('R')
  const viva = f.estado === 'emitida'
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>{TITULO[f.tipo] ?? `Rectificativa ${f.tipo}`} {f.numSerie}</h1>
        {aviso && <p className="aviso-error" role="alert">{aviso}</p>}
        <p>
          <span className={viva ? 'estado estado-ok' : 'estado estado-alerta'}>{f.estado}</span>{' '}
          <span className={f.estadoEnvio === 'enviado' ? 'estado estado-ok' : 'estado estado-aviso'}>AEAT: {f.estadoEnvio.replace('_', ' ')}</span>
        </p>
        <dl className="datos">
          <dt>Fecha</dt><dd>{fechaEs(f.fechaExpedicion)}</dd>
          <dt>Cliente</dt><dd>{f.cliente.nif ? `${f.cliente.nombre ?? ''} · NIF ${f.cliente.nif}` : f.cliente.nombre ?? 'No identificado (simplificada)'}</dd>
          {f.rectifica && <><dt>Rectifica</dt><dd>{f.rectifica.numSerie}{f.rectifica.motivo ? ` · ${f.rectifica.motivo}` : ''}</dd></>}
          {f.rectificativas.length > 0 && <><dt>Rectificada por</dt><dd>{f.rectificativas.map((r) => <a key={r.id} href={`/facturas/${r.id}`}>{r.numSerie} </a>)}</dd></>}
          <dt>Orden</dt><dd><a href={`/ordenes/${f.otId}`}>Ver la orden de trabajo</a></dd>
        </dl>

        <h2>Líneas</h2>
        <div className="tabla-scroll"><table className="tabla-cards">
          <thead><tr><th>Concepto</th><th className="num">IVA</th><th className="num">Base</th></tr></thead>
          <tbody>{f.lineas.map((l, i) => (
            <tr key={i}><td>{l.descripcion}</td><td className="num" data-label="IVA">{pct(l.ivaPuntosBasicos)}</td><td className="num" data-label="Base">{formatearEur(l.baseCent)}</td></tr>
          ))}</tbody>
        </table></div>
        <dl className="datos">
          {f.desglose.map((g) => <Fragment key={g.ivaPuntosBasicos}><dt>IVA {pct(g.ivaPuntosBasicos)}</dt><dd>{formatearEur(g.baseCent)} de base · {formatearEur(g.cuotaCent)} de cuota</dd></Fragment>)}
          <dt>Total</dt><dd><strong>{formatearEur(f.totalCent)}</strong></dd>
          {f.pendienteCent !== null && <><dt>Pendiente de cobro</dt><dd>{formatearEur(f.pendienteCent)}</dd></>}
        </dl>

        <h2>Cobros</h2>
        {f.cobros.length === 0 ? <p className="tenue">Sin cobros registrados.</p> : (
          <ul className="lista-simple">{f.cobros.map((c, i) => <li key={i}><span>{formatearEur(c.importeCent)} · {c.medio}</span><span className="tenue">{fechaEs(c.fecha)}</span></li>)}</ul>
        )}
        {viva && f.pendienteCent !== null && f.pendienteCent > 0 && (
          <form action={cobrarAccion} className="formulario">
            <input type="hidden" name="facturaId" value={f.id} />
            <div className="dos-col">
              <label className="campo">Medio
                <select name="medio1" defaultValue="" required>
                  <option value="" disabled>Elige</option>
                  {medios.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
                </select>
              </label>
              <label className="campo">Importe
                <input name="importe1" inputMode="decimal" required placeholder={formatearEur(f.pendienteCent)} />
              </label>
            </div>
            <button className="btn">Registrar cobro</button>
          </form>
        )}

        <h2>VeriFactu</h2>
        <div className="fila">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código QR tributario" width={132} height={132} />
          <div>
            {f.verifactu && <p><strong>VERI*FACTU</strong> · {LEYENDA_VERIFACTU}</p>}
            <p className="tenue">Registros: {f.registros.map((r) => `${r.tipo} n.º ${r.secuencia} (${r.estadoEnvio.replace('_', ' ')})`).join(' · ')}</p>
            {f.estadoEnvio !== 'enviado' && <p className="tenue">El registro aún no se ha remitido a la AEAT.</p>}
          </div>
        </div>
        <p><a className="btn" href={`/facturas/${f.id}/imprimir`} target="_blank" rel="noopener">Factura imprimible (PDF)</a></p>

        {datos.puedeRectificar && viva && !esRect && (
          <>
            <h2>Corregir</h2>
            <p className="tenue">Una factura emitida no se modifica: se rectifica (abono) o, si nunca debió emitirse y no tiene cobros, se anula.</p>
            <form action={abonoTotalAccion} className="formulario">
              <input type="hidden" name="facturaId" value={f.id} />
              <label className="campo">Motivo del abono total<input name="motivo" required minLength={5} maxLength={300} /></label>
              <button className="btn btn-sec">Rectificativa: abono total</button>
            </form>
            {f.cobros.length === 0 && (
              <form action={anularAccion} className="formulario">
                <input type="hidden" name="facturaId" value={f.id} />
                <label className="campo">Motivo de la anulación<input name="motivo" required minLength={5} maxLength={300} /></label>
                <button className="btn btn-sec">Anular la factura</button>
              </form>
            )}
          </>
        )}
        <p><a href="/facturas" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}
