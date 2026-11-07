import { Cabecera } from '../../_cabecera'
import { Revision } from './Revision'
import { datosPagina } from '@/lib/pagina'
import { conF6 } from '@/lib/f6-carga'
import { fechaEs, formatearCentimos } from '@/lib/importes'

export const dynamic = 'force-dynamic'
const LIMITE = 50

/** Pendientes de LA empresa elegida (RLS + contexto revalidado en BD): asientos sin revisar y facturas a confirmar, con revisión y comentarios. */
export default async function Pendientes() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const datos = await conF6(ctx.empresaId, async (_r, f6) => ({
    asientos: await f6.asientosSinRevisar(LIMITE), nAsientos: await f6.contarAsientosSinRevisar(),
    facturas: await f6.facturasAConfirmar(LIMITE), nFacturas: await f6.contarFacturasAConfirmar(),
  })).catch(() => null)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Pendientes de revisión</h1>
        <p className="tenue">{variasEmpresas ? <><a href="/gestoria">Volver al portal de la gestoría</a> · </> : null}Lo que {ctx.rol === 'gestor' ? 'la gestoría' : 'tu gestoría'} debe revisar o confirmar. Revisar no modifica el asiento (los asientos son inmutables): deja constancia de quién lo revisó y cuándo.</p>
        {datos === null && <p className="aviso-error">Los pendientes aún no están disponibles para esta empresa (falta aplicar el esquema de la fase 6, 0006_gestoria.sql).</p>}
        {datos && (
          <>
            <h2>Asientos sin revisar ({datos.nAsientos})</h2>
            {datos.asientos.length === 0 ? <p className="ok">No hay asientos pendientes en el ejercicio abierto.</p> : (
              <ul className="lista-simple">
                {datos.asientos.map((a) => (
                  <li key={a.id} className="ficha">
                    <p style={{ margin: '0 0 8px' }}><strong>Asiento {a.numero}/{a.ejercicio}</strong> · {fechaEs(a.fecha)}<br />{a.concepto}</p>
                    <Revision objeto={{ tipo: 'asiento', id: a.id }} comentarios={a.comentarios} />
                  </li>
                ))}
              </ul>
            )}
            {datos.nAsientos > LIMITE && <p className="tenue">Se muestran los {LIMITE} más recientes de {datos.nAsientos}; al revisarlos aparecen los siguientes.</p>}

            <h2>Facturas a confirmar ({datos.nFacturas})</h2>
            <p className="tenue">Facturas recibidas que entraron por correo, OCR o desde otra aplicación y todavía no ha confirmado una persona.</p>
            {datos.facturas.length === 0 ? <p className="ok">No hay facturas pendientes de confirmar.</p> : (
              <ul className="lista-simple">
                {datos.facturas.map((f) => (
                  <li key={f.id} className="ficha">
                    <p style={{ margin: '0 0 8px' }}><strong>{f.proveedor}</strong> · {f.numero} · {fechaEs(f.fecha)} · {formatearCentimos(f.total)} <span className="tenue">({f.origen})</span></p>
                    <Revision objeto={{ tipo: 'factura_recibida', id: f.id }} comentarios={f.comentarios} />
                  </li>
                ))}
              </ul>
            )}
            {datos.nFacturas > LIMITE && <p className="tenue">Se muestran las {LIMITE} más recientes de {datos.nFacturas}.</p>}
          </>
        )}
        <p className="tenue">Avisos: <a href="/avisos">ver avisos</a> · Declaraciones en borrador: <a href="/impuestos">ver impuestos</a>.</p>
      </main>
    </>
  )
}
