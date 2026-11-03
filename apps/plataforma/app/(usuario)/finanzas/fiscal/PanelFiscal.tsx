'use client'
// Panel fiscal (F2). Orden: 1 termómetro · 2 comparativa · 3 gráfica · 4 simulador (+compras) · 5 acciones ·
// 6 tramos · 7 calidad del dato. Todo se calcula aquí con el motor puro (`declarar`, `simularEscenario`), igual que
// en el servidor. Sociedad: no aparece. Sin IA en esta fase.
import { useMemo, useState } from 'react'
import { declarar } from '@/lib/simulador-irpf'
import { palancasPorDefecto, simularEscenario, SIN_PALANCAS, type ResultadoCompra } from '@/lib/simulador-irpf'
import {
  PALANCAS_SIMULABLES, ahorroPorPalanca, comparar, comprasParaMotor, construirAcciones, contribuyenteDe, modoDe, nivelUmbral, palancasActivas,
  rangoDe, serieAcumulada, tablaTramos, SELECCIONES, UMBRAL,
  type Activas, type CompraGuardada, type PalancaSimulable, type PanelDatos, type Seleccion,
} from '@/lib/fiscal-panel'
import { CATALOGO_PALANCAS } from '@/lib/simulador-irpf'
import UmbralTermometro from './UmbralTermometro'
import ComparativaModalidad, { type ResumenModalidad } from './ComparativaModalidad'
import GraficaAcumulada from './GraficaAcumulada'
import SimuladorEscenarios, { type FilaPalanca } from './SimuladorEscenarios'
import ComprasPrevistas from './ComprasPrevistas'
import ListaAcciones from './ListaAcciones'
import TablaTramos from './TablaTramos'
import AvisoCalidadDato from './AvisoCalidadDato'
import { hayAvisos } from '@/lib/fiscal-panel'

export default function PanelFiscal({ datos, compras }: { datos: PanelDatos; compras: CompraGuardada[] | null }) {
  const [sel, setSel] = useState<Seleccion>('conjunta')
  const [activas, setActivas] = useState<Activas>({})

  const m = useMemo(() => {
    const modo = modoDe(sel)
    const base = datos.cierres[0]
    const eBase = base.entrada
    const hoyDecl = declarar(datos.entradaHoy, SIN_PALANCAS, modo)
    const cierresDecl = datos.cierres.map(c => declarar(c.entrada, SIN_PALANCAS, modo))
    const cHoy = contribuyenteDe(hoyDecl, sel)
    const cCierre = contribuyenteDe(cierresDecl[0], sel)
    const rango = rangoDe(cierresDecl.map(d => contribuyenteDe(d, sel)?.baseLiquidable ?? null))
    const guardadas = compras ?? []
    const motor = comprasParaMotor(guardadas, datos.anio)
    const def = { ...palancasPorDefecto(eBase), compras: motor }
    const res = simularEscenario(eBase, def, base.etiqueta, base.id)
    const ahorros = ahorroPorPalanca(eBase, def, motor, sel)
    const todas = Object.fromEntries(PALANCAS_SIMULABLES.map(id => [id, true])) as Activas
    const cuotaSin = cCierre?.cuotaLiquida ?? null
    const cTodas = contribuyenteDe(declarar(eBase, palancasActivas(todas, def, motor), modo), sel)
    const ahorroMax = cuotaSin == null || cTodas?.cuotaLiquida == null ? null : cuotaSin - cTodas.cuotaLiquida
    const cCon = contribuyenteDe(declarar(eBase, palancasActivas(activas, def, motor), modo), sel)
    const resumen = (conj: ReturnType<typeof declarar>, ind: ReturnType<typeof declarar>): ResumenModalidad => {
      const c = comparar(conj, ind)
      const liq = (d: typeof conj, s: Seleccion) => contribuyenteDe(d, s)?.distanciaUmbral ?? null
      return { ...c, margenConjunta: liq(conj, 'conjunta'), margenAlberto: liq(ind, 'alberto'), margenPilar: liq(ind, 'pilar') }
    }
    const resHoy = resumen(declarar(datos.entradaHoy, SIN_PALANCAS, 'conjunta'), declarar(datos.entradaHoy, SIN_PALANCAS, 'individual'))
    const resCierre = resumen(declarar(eBase, SIN_PALANCAS, 'conjunta'), declarar(eBase, SIN_PALANCAS, 'individual'))
    const rangoGeneral = rangoDe(datos.cierres.map(c => c.entrada.periodo.baseGeneral))
    const serie = serieAcumulada(datos.porMes, eBase.periodo.baseGeneral, rangoGeneral, datos.anio)
    const hayPalancas = Object.values(activas).some(Boolean)
    const tramos = tablaTramos(hayPalancas ? [cHoy, cCierre, cCon] : [cHoy, cCierre])
    const filas: FilaPalanca[] = res.palancas
      .filter(p => (PALANCAS_SIMULABLES as string[]).includes(p.id) && (p.id !== 'compras' || motor.length > 0))
      .map(p => ({
        id: p.id as PalancaSimulable, nombre: CATALOGO_PALANCAS[p.id].nombre, importe: p.importe, ahorro: ahorros[p.id as PalancaSimulable],
        riesgo: CATALOGO_PALANCAS[p.id].riesgo, elegible: p.elegible, motivo: p.motivo,
      }))
    const resultadosCompra: Record<string, ResultadoCompra> = Object.fromEntries(res.compras.map(c => [c.id, c]))
    const baseCon = cCon?.baseLiquidable ?? null
    return {
      cHoy, cCierre, cCon, rango, ahorroMax, resHoy, resCierre, serie, tramos, filas, resultadosCompra, hayPalancas,
      acciones: construirAcciones(res, ahorros, datos.hoy, datos.anio),
      nivel: nivelUmbral(cCierre?.baseLiquidable ?? null, rango?.max ?? null),
      sim: { baseLiquidable: baseCon, margen: baseCon == null ? null : UMBRAL - baseCon, cuotaSin, cuotaCon: cCon?.cuotaLiquida ?? null,
        ahorro: cuotaSin == null || cCon?.cuotaLiquida == null ? null : cuotaSin - cCon.cuotaLiquida },
    }
  }, [datos, compras, sel, activas])

  const etiquetaSel = SELECCIONES.find(s => s.id === sel)!.etiqueta
  const estimacionProvisional = datos.cierres[0].provisional
  const provisional = estimacionProvisional || hayAvisos(datos.avisos)
  const alternar = (id: PalancaSimulable) => setActivas(a => ({ ...a, [id]: !a[id] }))

  return (
    <div>
      <UmbralTermometro sel={sel} onSel={setSel} hoy={m.cHoy?.baseLiquidable ?? null} cierre={m.cCierre?.baseLiquidable ?? null} rango={m.rango}
        conPalancas={m.hayPalancas ? m.sim.baseLiquidable : null} nivel={m.nivel} provisional={provisional} ahorroMax={m.ahorroMax} />
      <ComparativaModalidad hoy={m.resHoy} cierre={m.resCierre} />
      <GraficaAcumulada serie={m.serie} />
      <SimuladorEscenarios filas={m.filas} activas={activas} onToggle={alternar} onReset={() => setActivas({})} resultado={m.sim} etiquetaSel={etiquetaSel} />
      <ComprasPrevistas compras={compras} resultados={m.resultadosCompra} propiedades={datos.propiedades} />
      <ListaAcciones acciones={m.acciones} activas={activas} onAnadir={id => setActivas(a => ({ ...a, [id]: true }))} />
      <TablaTramos datos={m.tramos} columnas={m.hayPalancas ? ['Hoy', 'Cierre (est.)', 'Con palancas'] : ['Hoy', 'Cierre (est.)']} etiquetaSel={etiquetaSel} />
      <AvisoCalidadDato avisos={datos.avisos} provisionalPorEstimacion={estimacionProvisional} />
    </div>
  )
}
