import { Cabecera } from '../../_cabecera'
import { FormActividad } from './FormActividad'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { actividadesConocidas, PLANTILLAS, SECTORES_PLANTILLA } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

export default async function Actividad() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  // El CNAE vive en una columna de 0003: en su propia transacción y a prueba de fallos (sin 0003 la pantalla funciona sin CNAE).
  const cnae = await conRepo(ctx.empresaId, (r) => r.cnaeEmpresa()).catch(() => undefined)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Ajustes · Actividad</h1>
        <p className="tenue">Tu actividad (CNAE) decide qué plantilla te sugerimos: plan de cuentas, reglas de asiento y ejes de rentabilidad propios de tu sector. Es una <strong>sugerencia</strong>: tú la confirmas o eliges otra.</p>
        {cnae === undefined && <p className="aviso-error">El CNAE aún no se puede guardar para esta empresa (falta aplicar el esquema de la fase 3). La plantilla sí se puede ver.</p>}
        <FormActividad
          cnaeInicial={cnae ?? null} sectorInicial={empresa?.sector ?? 'generico'} puedeEditar={cnae !== undefined}
          plantillas={SECTORES_PLANTILLA.map((s) => ({ sector: s, nombre: PLANTILLAS[s].nombre, descripcion: PLANTILLAS[s].descripcion }))}
          actividades={actividadesConocidas()}
        />
        <p className="tenue">Rol actual: {ctx.rol === 'dueno' ? 'dueño' : 'gestor'}.</p>
      </main>
    </>
  )
}
