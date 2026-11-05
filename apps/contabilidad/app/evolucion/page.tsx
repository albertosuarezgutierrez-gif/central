import { Cabecera } from '../_cabecera'
import { GraficaResultado, GraficaTesoreria, GraficaVentasGastos, TartaGastos } from '../graficas'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { datosEvolucion } from '@/lib/evolucion'
import { formatearCentimos, fechaEs } from '@/lib/importes'
import { esTipoPeriodo, type TipoPeriodo } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

const NOMBRE: Record<TipoPeriodo, string> = { mes: 'Mensual', trimestre: 'Trimestral', anio: 'Anual' }

export default async function Evolucion({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const sp = await searchParams
  const gran: TipoPeriodo = esTipoPeriodo(sp.g) ? sp.g : 'mes'
  const hoy = new Date()
  const d = await conRepo(ctx.empresaId, (repo) => datosEvolucion(repo, gran, hoy), { timeout: 20_000 })
  const hayDatos = d.serie.some((p) => p.ventas !== null || p.gastos !== null)
  // Tesorería: real (caja al final de cada cubo ya cerrado) + previsión (puntos semanales desde hoy).
  const tesoreria = [
    ...d.serie.filter((p) => p.hasta < hoy.toISOString().slice(0, 10) && p.caja !== null).map((p) => ({ etiqueta: p.etiqueta, real: p.caja as number })),
    ...(d.prevision ? d.prevision.puntos.map((p, i) => ({ etiqueta: fechaEs(p.fecha).slice(0, 5), prevision: p.saldo, ...(i === 0 ? { real: d.prevision!.saldoInicial } : {}) })) : []),
  ]
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Evolución</h1>
        <nav className="periodos" aria-label="Intervalo">
          {(['mes', 'trimestre', 'anio'] as const).map((t) => (
            <a key={t} href={`/evolucion?g=${t}`} className={t === gran ? 'activo' : undefined} aria-current={t === gran ? 'true' : undefined}>{NOMBRE[t]}</a>
          ))}
        </nav>
        {!hayDatos && <p className="tenue">Sin datos: todavía no hay ventas ni gastos en este intervalo. Los huecos de las gráficas son «sin datos», no ceros.</p>}
        <section className="graficas" aria-label="Gráficas de evolución">
          <GraficaVentasGastos datos={d.serie.map((p) => ({ etiqueta: p.etiqueta, ventas: p.ventas, gastos: p.gastos, ventasAnioAnterior: p.ventasAnioAnterior }))} />
          <GraficaResultado datos={d.serie.map((p) => ({ etiqueta: p.etiqueta, resultado: p.resultado, resultadoAcumulado: p.resultadoAcumulado }))} />
          {d.prevision
            ? <GraficaTesoreria datos={tesoreria} />
            : <p className="tenue">Tesorería: sin datos (ningún apunte en las cuentas de caja y bancos, 57x). No se inventa un saldo de 0.</p>}
          {d.gastos && d.gastos.categorias.length > 0
            ? <TartaGastos datos={d.gastos.categorias.map((c) => ({ nombre: `${c.cuenta} · ${c.nombre}`, importe: c.importe, pct: c.pct }))} />
            : <p className="tenue">Gastos por categoría: sin datos en el último periodo del intervalo.</p>}
        </section>
        {d.prevision && (
          <>
            <h2>Previsión a {d.prevision.horizonteDias} días</h2>
            <p className="tenue">
              Saldo actual {formatearCentimos(d.prevision.saldoInicial)}. Saldo mínimo previsto {formatearCentimos(d.prevision.saldoMinimo)}
              {d.prevision.primerNegativo ? ` (negativo a partir del ${fechaEs(d.prevision.primerNegativo)})` : ''}.
            </p>
            <p className="aviso-lectura">
              {d.prevision.conVencimientos
                ? 'Los vencimientos son una ESTIMACIÓN: cada factura pendiente (clientes 43x, proveedores 40x/41x) se supone a 30 días desde su fecha; lo ya vencido cuenta hoy. No hay recurrentes ni nóminas futuras.'
                : 'No hay facturas pendientes de cobro ni de pago: la línea es plana y solo refleja el saldo de hoy. No significa que no vaya a haber movimientos.'}
            </p>
          </>
        )}
      </main>
    </>
  )
}
