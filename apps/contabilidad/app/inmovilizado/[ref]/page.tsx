import { cuadroAmortizacion } from '@central/module-contabilidad'
import { Cabecera } from '../../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conF5 } from '@/lib/cierre-carga'
import { fichasDe } from '@/lib/cierre'
import { formatearCentimos, fechaEs } from '@/lib/importes'

export const dynamic = 'force-dynamic'

/** Cuadro de amortización de un bien: resumen por ejercicio y detalle mensual del ejercicio elegido (nunca cientos de filas de golpe). */
export default async function Cuadro({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const ref = decodeURIComponent((await params).ref)
  const a = await conF5(ctx.empresaId, (_r, f5) => f5.activoPorRef(ref)).catch(() => null)
  if (!a) {
    return (<><Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} /><main className="contenido"><h1>Bien no encontrado</h1><p><a href="/inmovilizado">Volver al inmovilizado</a></p></main></>)
  }
  const filas = cuadroAmortizacion(fichasDe([a])[0])
  const porAnio = new Map<number, { cuota: number; acumulada: number; neto: number }>()
  for (const f of filas) {
    const y = Number(f.mes.slice(0, 4))
    const x = porAnio.get(y) ?? { cuota: 0, acumulada: 0, neto: 0 }
    x.cuota += f.cuota; x.acumulada = f.acumulada; x.neto = f.neto
    porAnio.set(y, x)
  }
  const q = Number((await searchParams).anio)
  const anio = porAnio.has(q) ? q : (porAnio.keys().next().value as number | undefined)
  const meses = filas.filter((f) => anio !== undefined && f.mes.startsWith(`${anio}-`))
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <p><a href="/inmovilizado">← Inmovilizado</a></p>
        <h1>{a.descripcion}</h1>
        <p className="tenue">{a.ref} · alta {fechaEs(a.fechaAlta)} · valor {formatearCentimos(a.valorAdquisicion)}{a.valorResidual > 0 ? ` · residual ${formatearCentimos(a.valorResidual)}` : ''} · {a.porcentajePb / 100} % anual lineal{a.fechaBaja ? ` · baja ${fechaEs(a.fechaBaja)}` : ''}</p>
        <h2>Por ejercicio</h2>
        <div className="tabla-scroll">
          <table className="tabla-cards">
            <thead><tr><th>Ejercicio</th><th className="num">Cuota</th><th className="num">Acumulada</th><th className="num">Neto</th></tr></thead>
            <tbody>
              {[...porAnio.entries()].map(([y, x]) => (
                <tr key={y}><td><a href={`/inmovilizado/${encodeURIComponent(a.ref)}?anio=${y}`}>{y}</a></td><td className="num" data-label="Cuota">{formatearCentimos(x.cuota)}</td><td className="num" data-label="Acumulada">{formatearCentimos(x.acumulada)}</td><td className="num" data-label="Neto">{formatearCentimos(x.neto)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {anio !== undefined && (
          <>
            <h2>Detalle mensual {anio}</h2>
            <div className="tabla-scroll">
              <table className="tabla-cards">
                <thead><tr><th>Mes</th><th className="num">Cuota</th><th className="num">Acumulada</th><th className="num">Neto</th></tr></thead>
                <tbody>
                  {meses.map((f) => (<tr key={f.mes}><td>{f.mes}</td><td className="num" data-label="Cuota">{formatearCentimos(f.cuota)}</td><td className="num" data-label="Acumulada">{formatearCentimos(f.acumulada)}</td><td className="num" data-label="Neto">{formatearCentimos(f.neto)}</td></tr>))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  )
}
