import { Cabecera } from '../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { configSif, VARIABLES_SIF } from '@/lib/sif-config'
import { declaracionResponsableSif } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

/** Declaración responsable del productor del SIF. Los datos salen de la configuración (`SIF_*`); lo que falte se dice, no se inventa. */
export default async function Sif() {
  const { empresa, variasEmpresas, avisos } = await datosPagina()
  const d = declaracionResponsableSif(configSif(), new Date())
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Declaración responsable del SIF</h1>
        <p className="aviso-legal" role="note">Esta declaración la <strong>firma y asume el productor del sistema</strong>. Esta pantalla solo rellena la plantilla con los datos configurados; <strong>no comprueba</strong> que el sistema cumpla lo que se declara (registro de facturación, huella, QR…). No la publiques hasta que el productor lo haya verificado y el texto se haya contrastado con el artículo 15 de la Orden HAC/1177/2024.</p>
        {d.completa
          ? <p className="ok">Configuración completa: todos los datos del productor están informados.</p>
          : (
            <div className="aviso-error" role="alert">
              <p style={{ margin: 0 }}><strong>Faltan datos del productor, no se han inventado.</strong> Configura estas variables de entorno (no secretas) en el proyecto y recarga:</p>
              <ul>{d.faltan.map((f) => <li key={f}>{f}</li>)}</ul>
              <p className="tenue" style={{ margin: 0 }}>Variables: {VARIABLES_SIF.join(', ')}</p>
            </div>
          )}
        <h2>{d.titulo}</h2>
        <pre className="datos" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit' }}>{d.texto}</pre>
      </main>
    </>
  )
}
