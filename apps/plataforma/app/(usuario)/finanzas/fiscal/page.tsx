import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import { calcularEstadoDeclaracion, type EstadoDeclaracion } from '@/lib/comparativa-declaracion'
import { getBaseDevengo, type BaseDevengo } from '@/lib/base-fiscal-devengo-db'
import { importesDe, minimoPersonalYFamiliar } from '@/lib/fiscal-deducciones'
import { armarPanel, type PanelDatos } from '@/lib/fiscal-panel'
import { listarComprasPrevistas } from '@/lib/fiscal-compras-db'
import FiscalPageClient from './FiscalPageClient'

export const dynamic = 'force-dynamic'

export default async function FiscalPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const year = parseInt(params.year || '') || new Date().getFullYear()
  const quarter = parseInt(params.quarter || '0') || 0

  let data = null
  try {
    data = await getResumenFinanciero(session.id, year, quarter)
  } catch (e) {
    console.error('[fiscal/page]', e)
  }

  // «🧾 Mi declaración» calculada en el servidor (reutilizando `data`) → aparece con
  // la página, sin estado cliente "Calculando…". Si falla, el cliente cae al fetch.
  let comparativa: EstadoDeclaracion | null = null
  if (data) {
    try {
      comparativa = await calcularEstadoDeclaracion(session.id, year, data)
    } catch (e) {
      console.error('[fiscal/page] comparativa', e)
    }
  }

  // Base por devengo («Hasta hoy» + «Estimación cierre de año»). Si falla, el bloque dice «sin dato».
  let baseDevengo: BaseDevengo | null = null
  try {
    const imp = importesDe(year)
    const cuota = data
      ? {
          tramos: imp.tramos,
          minimoContribuyente: imp.minimoContribuyente,
          minimoConjunta: minimoPersonalYFamiliar(data.deducciones.perfil, data.deducciones.descendientes, year, imp),
        }
      : null
    baseDevengo = await getBaseDevengo(session.id, year, cuota)
  } catch (e) {
    console.error('[fiscal/page] base devengo', e)
  }

  // Panel fiscal (F2): datos serializables para el motor en cliente. Sin `data` (perfil/hijos) no se puede fijar el mínimo familiar → sin panel.
  let panel: PanelDatos | null = null
  let compras = null
  if (baseDevengo && data) {
    try {
      panel = armarPanel(baseDevengo, {
        descendientes: data.deducciones.descendientes.map(h => ({ nombre: h.nombre, fechaNacimiento: h.fechaNacimiento, gradoDiscapacidad: h.gradoDiscapacidad, computoCompleto: h.computoCompleto })),
        conyugeTrabaja: data.deducciones.perfil.conyugeTrabaja,
      })
      compras = await listarComprasPrevistas(session.id)
    } catch (e) {
      console.error('[fiscal/page] panel', e)
    }
  }

  return <FiscalPageClient initialData={data} initialComparativa={comparativa} baseDevengo={baseDevengo} panel={panel} compras={compras} year={year} quarter={quarter} />
}
