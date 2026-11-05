import { Cabecera } from './_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { calcularKpis, esTipoPeriodo, mismoPeriodoAnioAnterior, periodoAnterior, rangoPeriodo, variacion, type Kpis, type TipoPeriodo } from '@/lib/kpis'
import { formatearCentimos, fechaEs } from '@/lib/importes'

export const dynamic = 'force-dynamic'

const TARJETAS: { clave: keyof Kpis; titulo: string; ayuda: string; masEsMejor: boolean }[] = [
  { clave: 'ventas', titulo: 'Ventas', ayuda: 'Cuentas 70 del periodo', masEsMejor: true },
  { clave: 'gastos', titulo: 'Gastos', ayuda: 'Cuentas 6 del periodo', masEsMejor: false },
  { clave: 'resultado', titulo: 'Resultado', ayuda: 'Ingresos (7) menos gastos (6)', masEsMejor: true },
  { clave: 'caja', titulo: 'Caja y bancos', ayuda: 'Saldo de las cuentas 57 al cierre del periodo', masEsMejor: true },
  { clave: 'cobrosPendientes', titulo: 'Cobros pendientes', ayuda: 'Saldo de clientes (43)', masEsMejor: false },
  { clave: 'pagosPendientes', titulo: 'Pagos pendientes', ayuda: 'Saldo de proveedores y acreedores (40, 41)', masEsMejor: false },
  { clave: 'ivaEstimado', titulo: 'IVA a ingresar (estimado)', ayuda: 'Repercutido (477) menos soportado (472) del periodo', masEsMejor: false },
]
const NOMBRE: Record<TipoPeriodo, string> = { mes: 'Mes', trimestre: 'Trimestre', anio: 'Año' }

function Comparacion({ etiqueta, d, masEsMejor }: { etiqueta: string; d: number | null; masEsMejor: boolean }) {
  if (d === null) return <span className="kpi-comp">{etiqueta}: sin datos para comparar</span>
  const clase = d === 0 ? '' : (d > 0) === masEsMejor ? 'sube' : 'baja'
  return <span className="kpi-comp">{etiqueta}: <span className={clase}>{d > 0 ? '+' : ''}{formatearCentimos(d)}</span></span>
}

export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas } = await datosPagina()
  const sp = await searchParams
  const tipo: TipoPeriodo = esTipoPeriodo(sp.periodo) ? sp.periodo : 'mes'
  const hoy = new Date()
  const r = rangoPeriodo(tipo, hoy)
  const ant = periodoAnterior(tipo, r)
  const yoy = mismoPeriodoAnioAnterior(tipo, r)
  // Una transacción (una empresa) para las seis lecturas: nunca una consulta cruzada.
  const [actual, anterior, anioPasado] = await conRepo(ctx.empresaId, async (repo) => {
    const k = async (x: { desde: string; hasta: string }) =>
      calcularKpis(await repo.sumasPorCuenta(x), await repo.sumasPorCuenta({ hasta: x.hasta }))
    return [await k(r), await k(ant), await k(yoy)]
  })
  const vacio = Object.values(actual).every((v) => v === null)

  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} />
      <main className="contenido">
        <h1>Panel</h1>
        <nav className="periodos" aria-label="Periodo">
          {(['mes', 'trimestre', 'anio'] as const).map((t) => (
            <a key={t} href={`/?periodo=${t}`} className={t === tipo ? 'activo' : undefined} aria-current={t === tipo ? 'true' : undefined}>{NOMBRE[t]}</a>
          ))}
        </nav>
        <p className="tenue">Del {fechaEs(r.desde)} al {fechaEs(r.hasta)}. Se compara con el periodo anterior y con el mismo periodo del año pasado.</p>
        {vacio && <p className="tenue">Aún no hay asientos en este periodo: las tarjetas dicen «Sin datos» (no es lo mismo que 0).</p>}
        <section className="kpis" aria-label="Indicadores">
          {TARJETAS.map((t) => {
            const v = actual[t.clave]
            return (
              <article key={t.clave} className="kpi">
                <span className="kpi-titulo">{t.titulo}</span>
                <span className={v === null ? 'kpi-valor sin-datos' : 'kpi-valor'}>{v === null ? 'Sin datos' : formatearCentimos(v)}</span>
                <span className="kpi-comp">{t.ayuda}</span>
                <Comparacion etiqueta="vs periodo anterior" d={variacion(v, anterior[t.clave])} masEsMejor={t.masEsMejor} />
                <Comparacion etiqueta="vs año pasado" d={variacion(v, anioPasado[t.clave])} masEsMejor={t.masEsMejor} />
              </article>
            )
          })}
        </section>
      </main>
    </>
  )
}
