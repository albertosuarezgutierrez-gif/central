import { notFound } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { conRepoFirma, personaPropia } from '@/lib/db'
import { esUuid } from '@/lib/rls'
import { Cabecera } from '../../_cabecera'
import { FirmarCliente } from './FirmarCliente'
import { CATALOGO, TITULOS, estadoEfectivo, puede, esHerramienta } from '@central/core-herramientas'
import { TEXTO_CONSENTIMIENTO } from '@central/core-firma'

export const dynamic = 'force-dynamic'

const ESTADO: Record<string, string> = { enviado: 'Pendiente de firma', firmado: 'Firmado', anulado: 'Anulado', caducado: 'Caducado', sustituido: 'Sustituido por una versión posterior' }

export default async function Contrato({ params }: { params: Promise<{ version: string }> }) {
  const ctx = await exigirContexto()
  const { version } = await params
  if (!esUuid(version)) notFound()
  const yo = await personaPropia(ctx.personaId)
  const d = await conRepoFirma(ctx.personaId, async (repo) => {
    const v = await repo.version(version.toLowerCase())
    return v ? { v, rol: await repo.rol(v.cuentaId) } : null
  })
  if (!d || !yo) notFound()
  const { v, rol } = d
  const estado = estadoEfectivo(v, new Date())
  const puedoFirmar = estado === 'enviado' && puede(rol, 'firmar') && v.destinatarioPersonaId === yo.id
  const cuenta = ctx.cuentas.find((c) => c.id === v.cuentaId) ?? ctx.cuenta
  return (
    <>
      <Cabecera cuentas={ctx.cuentas} actual={cuenta} />
      <main className="contenido">
        <h1>Contrato de encargo del tratamiento</h1>
        <p className="tenue">{v.variables.empresa.razon_social} · nº {v.variables.contrato.numero} · versión {v.n} · <strong>{ESTADO[estado]}</strong></p>
        <p>Herramientas del anexo: {v.variables.herramientas.filter(esHerramienta).map((h) => CATALOGO[h].nombre).join(', ')}.</p>
        <iframe className="visor-contrato" title="Contrato" src={`/api/documento/${v.id}`} sandbox="" />
        <p className="fila" style={{ marginTop: 8 }}>
          <a className="btn btn-sec" href={`/api/documento/${v.id}?descargar=1`}>Descargar</a>
          {estado === 'firmado' || estado === 'sustituido' ? <a className="btn btn-sec" href={`/api/documento/${v.id}?tipo=certificado&descargar=1`}>Certificado de firma</a> : null}
        </p>
        <p className="huella">Huella SHA-256: {v.documentoSha256}</p>
        {puedoFirmar
          ? <FirmarCliente versionId={v.id} sha256={v.documentoSha256} firmante={v.variables.firmante.nombre} titulo={v.variables.firmante.titulo} tituloTexto={TITULOS[v.variables.firmante.titulo]} consentimiento={TEXTO_CONSENTIMIENTO} />
          : estado === 'enviado' && <p className="tenue">Lo firma {v.variables.firmante.nombre} ({TITULOS[v.variables.firmante.titulo]}). Tú puedes leerlo y descargarlo.</p>}
      </main>
    </>
  )
}
