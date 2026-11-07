import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { versionesDeCuenta } from '@/lib/db'
import { Cabecera } from '../_cabecera'
import { estadoEfectivo, fechaLegible, CATALOGO, esHerramienta, puede } from '@central/core-herramientas'

export const dynamic = 'force-dynamic'
const ESTADO: Record<string, string> = { enviado: 'Pendiente de firma', firmado: 'Firmado (vigente)', anulado: 'Anulado', caducado: 'Caducado', sustituido: 'Sustituido' }

/** Histórico de versiones del contrato de la empresa elegida, con descarga del documento y del certificado. */
export default async function Contratos() {
  const ctx = await exigirContexto()
  const c = ctx.cuenta
  // El empleado (y quien no tenga `ver_contrato`) no ve contratos ni certificados.
  if (c && !puede(c.rol, 'ver_contrato')) redirect('/')
  const vs = c ? await versionesDeCuenta(ctx.personaId, c.id) : []
  const ahora = new Date()
  return (
    <>
      <Cabecera cuentas={ctx.cuentas} actual={c} />
      <main className="contenido">
        <h1>Contratos</h1>
        {!c && <p className="tenue">Elige primero una empresa.</p>}
        {c && vs.length === 0 && <p className="tenue">Todavía no hay ningún contrato de encargo emitido para {c.razonSocial}.</p>}
        <ul className="lista-simple">
          {vs.map((v) => {
            const e = estadoEfectivo(v, ahora)
            return (
              <li key={v.id} style={{ padding: 12 }}>
                <strong>Versión {v.n}</strong> · {ESTADO[e]} · emitida el {fechaLegible(v.emitidaEn)}{v.firmadaEn ? ` · firmada el ${fechaLegible(v.firmadaEn)}` : ''}
                <div className="tenue">{v.herramientas.filter(esHerramienta).map((h) => CATALOGO[h].nombre).join(', ')}</div>
                <div className="fila">
                  <a className="btn btn-sec" href={`/contrato/${v.id}`}>Ver</a>
                  {v.firmadaEn && <a className="btn btn-sec" href={`/api/documento/${v.id}?tipo=certificado&descargar=1`}>Certificado</a>}
                </div>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
