'use client'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Bar, XAxis, Line, ComposedChart, CartesianGrid } from 'recharts'
import {
  BarChart3, TrendingUp, Receipt, Scale, PieChart as PieIcon,
  Building2, Users, Shield, Hotel, Landmark, ArrowRight,
} from 'lucide-react'
import type { ResumenFinanciero } from '@/lib/finanzas'
import type { MesEvolucion } from '@/lib/banca'
import { eur } from '@/lib/dinero'
import { cardStyle, CardHeader, KpiCard, colorImporte } from '@/components/ui'

// Resumen INTERACTIVO del periodo (negocio + personal) para /banca. Reutiliza los mismos
// cálculos de cabecera que /finanzas/radiografia (misma fuente `getResumenFinanciero`, cuadra
// al céntimo) y añade dos gráficas comparativas con Recharts (tematizado por CSS en globals.css).
// Es presentación pura: los números vienen ya calculados del servidor.
//
// ─── Por qué ya no se pinta a mano (02/09/2026) ──────────────────────────────────────────────
// Este bloque es lo PRIMERO que se ve al abrir el panel, y era el que seguía escrito con su
// propia `card`, su propio `Kpi` y su propio `<style>` incrustado — copias de lo que
// `components/ui.tsx` ya ofrecía. Copiar el estilo en vez de importarlo es lo que hace que
// arreglar el tema oscuro (o el ancho en móvil) haya que hacerlo N veces y se olvide una.
// Ahora: `cardStyle`, `CardHeader` y `KpiCard`, y el responsive en `globals.css` (un estilo en
// línea no admite media queries, que era el motivo del `<style>`).

// Paleta CATEGÓRICA de la dona: son categorías de gasto, no estados. Teñir una de --negative
// diría «este gasto está mal», que es mentira. Exenta en `regression-tokens-color`.
const DONA_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6']

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function etiquetaMes(mes: string): string { return `${MES_CORTO[Number(mes.slice(5, 7)) - 1] || ''}` }

/** Título de sección con icono, para que los bloques del Inicio se lean como uno solo. */
function TituloSeccion({ icono, children, sub }: { icono: React.ReactNode; children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      <span aria-hidden style={{ display: 'inline-flex', color: 'var(--muted)' }}>{icono}</span>
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>{children}</h2>
      {sub && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>}
    </div>
  )
}

/** Fila «concepto → cifra» de las tarjetas Negocios/Personal. */
function Fila({ icono, label, nota, children }: {
  icono: React.ReactNode; label: string; nota?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '9px 0', fontSize: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span aria-hidden style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}>{icono}</span>
        {label}
        {nota && <span style={{ fontSize: 11, color: 'var(--muted)' }}>({nota})</span>}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</span>
    </div>
  )
}

/** Enlace de pie de tarjeta. */
function Salida({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none',
    }}>
      {children} <ArrowRight size={13} strokeWidth={2} aria-hidden />
    </Link>
  )
}

export default function ResumenPeriodo({ resumen, evolucion, periodoLabel }: {
  resumen: ResumenFinanciero
  evolucion: MesEvolucion[]
  periodoLabel: string
}) {
  // ── Cabecera: MISMAS fórmulas que RadiografiaClient (no recomputar de otra forma) ──
  const ingresosNeg = resumen.correduria.cobradoNeto + resumen.pisos.total.ingresos
  const gastoNeg = resumen.correduria.gastosDeducibles + resumen.pisos.total.gastos
  const gastoPersonal = resumen.personal.total
  const gastoTotal = gastoNeg + gastoPersonal
  const resultado = ingresosNeg - gastoTotal
  const pctPersonal = gastoTotal > 0 ? Math.round((gastoPersonal / gastoTotal) * 100) : 0
  const ant = resumen.anterior
  const deltaGasto = ant && ant.gastos > 0 ? Math.round(((gastoTotal - ant.gastos) / ant.gastos) * 100) : null

  // ── Dona: reparto del gasto del periodo por bucket/negocio ──
  const reparto = [
    { name: 'Correduría (deducible)', value: resumen.correduria.gastosDeducibles },
    { name: 'Pisos (renta)', value: resumen.pisos.total.gastos },
    { name: 'Personal (no deducible)', value: gastoPersonal },
  ].filter(r => r.value > 0)

  const evo = evolucion.map(m => ({ ...m, resultado: m.ingresos - m.gastos, label: etiquetaMes(m.mes) }))

  return (
    <section style={{ marginBottom: 32 }}>
      <TituloSeccion icono={<BarChart3 size={17} strokeWidth={1.75} />} sub={periodoLabel}>
        Resumen del periodo
      </TituloSeccion>

      {/* KPIs de cabecera */}
      <div className="bk-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiCard
          icono={<TrendingUp size={18} strokeWidth={1.75} />} tono="positivo"
          label="Ingresos" valor={eur(ingresosNeg)} sub="negocios" color="var(--positive)"
        />
        <KpiCard
          icono={<Receipt size={18} strokeWidth={1.75} />}
          label="Gasto total" valor={eur(gastoTotal)}
          // `bueno` colorea por SIGNIFICADO, no por signo: gastar MENOS que el año pasado es verde
          // aunque el número sea negativo. Al revés la pastilla premiaría subir el gasto.
          delta={deltaGasto} bueno={deltaGasto !== null && deltaGasto < 0}
          sub="vs año anterior"
        />
        <KpiCard
          icono={<Scale size={18} strokeWidth={1.75} />} tono={resultado >= 0 ? 'positivo' : 'negativo'}
          label="Resultado" valor={eur(resultado)} color={colorImporte(resultado)}
        />
        <KpiCard
          icono={<PieIcon size={18} strokeWidth={1.75} />} tono="info"
          label="Negocio / Personal" valor={`${100 - pctPersonal}/${pctPersonal}`}
          sub={`Personal: ${eur(gastoPersonal)}`}
        />
      </div>

      <div style={{ marginTop: 10, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
          <Receipt size={13} strokeWidth={1.75} aria-hidden />
          Base imponible IRPF est. (año): <strong style={{ color: 'var(--text)' }}>{eur(resumen.fiscal.baseImponibleEstimada)}</strong>
          {' '}· tramo {(resumen.fiscal.tramoActual.tipo * 100).toFixed(0)}%
        </span>
        <Salida href="/finanzas/fiscal">Mi declaración y tramos</Salida>
      </div>

      {/* Negocio (correduría + pisos) y Personal (BBVA/Kutxa) */}
      <div className="bk-neg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={cardStyle}>
          <CardHeader title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Building2 size={15} strokeWidth={1.75} aria-hidden /> Negocios
          </span>} />
          <Fila icono={<Shield size={15} strokeWidth={1.75} />} label="Correduría">
            cobrado <strong>{eur(resumen.correduria.cobradoNeto)}</strong> · result.{' '}
            <strong style={{ color: colorImporte(resumen.correduria.resultado) }}>{eur(resumen.correduria.resultado)}</strong>
          </Fila>
          <Fila icono={<Hotel size={15} strokeWidth={1.75} />} label="Pisos">
            ingresos <strong>{eur(resumen.pisos.total.ingresos)}</strong> · result.{' '}
            <strong style={{ color: colorImporte(resumen.pisos.total.resultado) }}>{eur(resumen.pisos.total.resultado)}</strong>
          </Fila>
          <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
            <Salida href="/correduria">Correduría</Salida>
            <Salida href="/apartamentos">Pisos</Salida>
          </div>
        </div>

        <div style={cardStyle}>
          <CardHeader title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Users size={15} strokeWidth={1.75} aria-hidden /> Personal
          </span>} />
          <Fila icono={<Landmark size={15} strokeWidth={1.75} />} label="BBVA" nota="100% tuya">
            <strong>{eur(resumen.personal.bbva.gastos)}</strong>
          </Fila>
          <Fila icono={<Users size={15} strokeWidth={1.75} />} label="Kutxabank" nota="familiar">
            <strong>{eur(resumen.personal.kutxa.gastos)}</strong>
          </Fila>
          <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
            <Salida href="/finanzas?tab=categorias&banco=bbva">BBVA</Salida>
            <Salida href="/finanzas?tab=categorias&banco=familiar">Kutxabank</Salida>
          </div>
        </div>
      </div>

      {/* Gráficas comparativas */}
      <div className="bk-graf" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={cardStyle}>
          <CardHeader title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <TrendingUp size={15} strokeWidth={1.75} aria-hidden /> Ingresos vs gastos
          </span>} sub={`Últimos ${evo.length} meses`} />
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={evo} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, n: string) => [eur(v), n === 'ingresos' ? 'Ingresos' : n === 'gastos' ? 'Gastos' : 'Resultado']} />
                {/* Ingreso y gasto SÍ son semánticos (no dos series cualesquiera): van por token,
                    así que en modo oscuro cambian con el tema igual que el resto del panel. */}
                <Bar dataKey="ingresos" fill="var(--positive)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="gastos" fill="var(--negative)" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="resultado" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardStyle}>
          <CardHeader title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <PieIcon size={15} strokeWidth={1.75} aria-hidden /> Reparto del gasto
          </span>} />
          {reparto.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin gasto en el periodo.</div>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reparto} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {reparto.map((_, i) => <Cell key={i} fill={DONA_COLORS[i % DONA_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [eur(v), n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
