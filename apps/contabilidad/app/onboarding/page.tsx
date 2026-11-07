import { Cabecera } from '../_cabecera'
import { FormPlan, FormSaldos, FormTerceros } from './Formularios'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { conF6 } from '@/lib/f6-carga'
import { opcionesPlantilla } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

/** Puesta en marcha guiada: plantilla por CNAE, plan de cuentas, saldos iniciales y terceros. Cada paso es independiente y se puede repetir sin duplicar. */
export default async function Onboarding() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const [cnae, nCuentas, nTerceros] = await Promise.all([
    conRepo(ctx.empresaId, (r) => r.cnaeEmpresa()).catch(() => undefined),
    conRepo(ctx.empresaId, (r) => r.contarCuentas()).catch(() => null),
    conF6(ctx.empresaId, (_r, f6) => f6.contarTerceros()).catch(() => null),
  ])
  const { sugerencia, opciones } = opcionesPlantilla(cnae ?? null)
  const actual = empresa?.sector ?? 'generico'
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Puesta en marcha</h1>
        <p className="tenue">Cuatro pasos para cargar los datos de la empresa. Si algo del fichero está mal no se importa nada: se te dice la línea.</p>

        <h2>0 · Plantilla de tu sector</h2>
        {cnae === undefined && <p className="aviso-error">El CNAE aún no está disponible (falta aplicar la fase 3).</p>}
        <p>{sugerencia.motivo === 'cnae_conocido' ? <>Por tu actividad ({sugerencia.cnae}: {sugerencia.actividad}) te sugerimos la plantilla <strong>{opciones.find((o) => o.sugerida)?.nombre}</strong>.</>
          : sugerencia.motivo === 'sin_cnae' ? <>Aún no has indicado tu actividad (CNAE): usamos la plantilla genérica hasta que lo hagas.</>
          : <>Tu actividad no tiene plantilla propia: usamos la genérica.</>} Plantilla actual: <strong>{opciones.find((o) => o.sector === actual)?.nombre ?? actual}</strong>.</p>
        <ul className="lista-simple">
          {opciones.map((o) => <li key={o.sector}><strong>{o.nombre}</strong>{o.sugerida ? ' · sugerida' : ''}{o.sector === actual ? ' · en uso' : ''} <span className="tenue">(+{o.cuentasExtra} cuentas sobre el PGC)</span></li>)}
        </ul>
        <p><a className="btn btn-sec" href="/ajustes/actividad">Elegir o cambiar la plantilla</a></p>

        <p className="tenue">Cuentas en el plan: {nCuentas ?? '—'} · Terceros importados: {nTerceros ?? '— (falta aplicar 0006_gestoria.sql)'}</p>
        <FormPlan />
        <FormSaldos />
        <FormTerceros />
      </main>
    </>
  )
}
