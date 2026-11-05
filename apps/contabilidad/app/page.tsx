import { Cabecera } from './_cabecera'
import { BarrasHorizontales } from './graficas'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { calcularKpis, esTipoPeriodo, rangosComparativa, tarjetasKpi, type ClaveKpi, type Comparacion, type TipoPeriodo } from '@/lib/kpis'
import { formatearCentimos, fechaEs } from '@/lib/importes'
import { aFechaISO, cobrosPorMedio, ETIQUETA_MEDIO, LIMITE_EFECTIVO_CENT, sumarDias } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

type Tarjeta = { clave: ClaveKpi; titulo: string; ayuda: string; masEsMejor: boolean; formato?: 'pct' }
const TARJETAS: Tarjeta[] = [
  { clave: 'ventas', titulo: 'Ventas', ayuda: 'Cuentas 70 del periodo', masEsMejor: true },
  { clave: 'gastos', titulo: 'Gastos', ayuda: 'Cuentas 6 del periodo', masEsMejor: false },
  { clave: 'margenPct', titulo: 'Margen', ayuda: 'Resultado sobre ingresos del periodo', masEsMejor: true, formato: 'pct' },
  { clave: 'resultado', titulo: 'Resultado', ayuda: 'Ingresos (7) menos gastos (6)', masEsMejor: true },
  { clave: 'caja', titulo: 'Caja y bancos', ayuda: 'Saldo de las cuentas 57 al cierre del periodo', masEsMejor: true },
  { clave: 'cobrosPendientes', titulo: 'Cobros pendientes', ayuda: 'Saldo de clientes (43)', masEsMejor: false },
  { clave: 'pagosPendientes', titulo: 'Pagos pendientes', ayuda: 'Saldo de proveedores y acreedores (40, 41)', masEsMejor: false },
  { clave: 'ivaEstimado', titulo: 'IVA a ingresar (estimado)', ayuda: 'Repercutido (477) menos soportado (472) del periodo', masEsMejor: false },
]
const NOMBRE: Record<TipoPeriodo, string> = { mes: 'Mes', trimestre: 'Trimestre', anio: 'Año' }
const pctEs = (n: number) => `${String(n).replace('.', ',')} %`

/** Flecha ↑/↓ + diferencia + %, coloreada según si subir es bueno o malo. Sin comparativa: «sin datos para comparar», nunca 0. */
function Comparacion({ etiqueta, c, masEsMejor, pct }: { etiqueta: string; c: Comparacion | null; masEsMejor: boolean; pct: boolean }) {
  if (c === null) return <span className="kpi-comp">{etiqueta}: sin datos para comparar</span>
  const clase = c.sentido === 'igual' ? 'igual' : (c.sentido === 'sube') === masEsMejor ? 'sube' : 'baja'
  const flecha = c.sentido === 'sube' ? '↑' : c.sentido === 'baja' ? '↓' : '→'
  const dif = pct ? `${c.abs > 0 ? '+' : ''}${String(c.abs).replace('.', ',')} pts` : `${c.abs > 0 ? '+' : ''}${formatearCentimos(c.abs)}`
  return (
    <span className="kpi-comp">{etiqueta}: <span className={`kpi-flecha ${clase}`}>{flecha} {dif}{!pct && c.pct !== null ? ` (${c.pct > 0 ? '+' : ''}${pctEs(c.pct)})` : ''}</span></span>
  )
}

export default async function Inicio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const sp = await searchParams
  const tipo: TipoPeriodo = esTipoPeriodo(sp.periodo) ? sp.periodo : 'mes'
  const hoy = new Date()
  const { actual: r, anterior: ant, anioPasado: yoy } = rangosComparativa(tipo, hoy)
  // Una transacción (una empresa) para todas las lecturas: nunca una consulta cruzada.
  const { kpis, medios, efectivo } = await conRepo(ctx.empresaId, async (repo) => {
    const k = async (x: { desde: string; hasta: string }) => calcularKpis(await repo.sumasPorCuenta(x), await repo.sumasPorCuenta({ hasta: x.hasta }))
    return {
      kpis: [await k(r), await k(ant), await k(yoy)] as const,
      medios: cobrosPorMedio(await repo.cobrosPorMedio(r)),
      efectivo: await repo.cobrosEfectivoAltos({ desde: sumarDias(aFechaISO(hoy), -30), umbral: LIMITE_EFECTIVO_CENT }),
    }
  })
  const [actual, anterior, anioPasado] = kpis
  const vacio = Object.values(actual).every((v) => v === null)
  const tarjetas = new Map(tarjetasKpi(actual, anterior, anioPasado).map((t) => [t.clave, t]))

  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Panel</h1>
        <nav className="periodos" aria-label="Periodo">
          {(['mes', 'trimestre', 'anio'] as const).map((t) => (
            <a key={t} href={`/?periodo=${t}`} className={t === tipo ? 'activo' : undefined} aria-current={t === tipo ? 'true' : undefined}>{NOMBRE[t]}</a>
          ))}
        </nav>
        <p className="tenue">Del {fechaEs(r.desde)} al {fechaEs(r.hasta)}. Se compara con el periodo anterior y con el mismo periodo del año pasado.</p>
        {vacio && <p className="tenue">Aún no hay asientos en este periodo: las tarjetas dicen «Sin datos» (no es lo mismo que 0).</p>}
        {efectivo.length > 0 && (
          <p className="aviso-lectura" role="status">
            Hay {efectivo.length === 1 ? 'un cobro' : `${efectivo.length} cobros`} en efectivo de 1.000 € o más en los últimos 30 días ({efectivo.slice(0, 3).map((e) => `${e.ref}: ${formatearCentimos(e.importe)}`).join('; ')}). Hay un límite legal para los pagos en efectivo entre empresarios: confírmalo con tu gestor.
          </p>
        )}
        <section className="kpis" aria-label="Indicadores">
          {TARJETAS.map((t) => {
            const d = tarjetas.get(t.clave)!
            const pct = t.formato === 'pct'
            return (
              <article key={t.clave} className="kpi">
                <span className="kpi-titulo">{t.titulo}</span>
                <span className={d.valor === null ? 'kpi-valor sin-datos' : 'kpi-valor'}>{d.valor === null ? 'Sin datos' : pct ? pctEs(d.valor) : formatearCentimos(d.valor)}</span>
                <span className="kpi-comp">{t.ayuda}</span>
                <Comparacion etiqueta="vs periodo anterior" c={d.vsAnterior} masEsMejor={t.masEsMejor} pct={pct} />
                <Comparacion etiqueta="vs año pasado" c={d.vsAnioPasado} masEsMejor={t.masEsMejor} pct={pct} />
              </article>
            )
          })}
        </section>
        <h2>Cobros por medio</h2>
        {medios === null
          ? <p className="tenue">Sin datos: no hay cobros recibidos de tus aplicaciones en este periodo.</p>
          : (
            <div className="graficas">
              <BarrasHorizontales
                titulo={`Cobros del periodo: ${formatearCentimos(medios.total)}`} etiqueta="Barras de cobros por medio de pago"
                datos={medios.filas.map((f) => ({ nombre: f.medio ? ETIQUETA_MEDIO[f.medio] : 'Sin indicar', valor: f.importe }))}
              />
            </div>
          )}
      </main>
    </>
  )
}
