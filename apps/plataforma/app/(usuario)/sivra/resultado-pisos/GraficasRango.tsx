'use client'
// Gráficas del rango (Recharts, mismo patrón que banca/ResumenPeriodo.tsx).
// Formas elegidas por el trabajo del dato (método dataviz): evolución temporal → barras+línea;
// comparación entre pisos → barras horizontales con color de identidad (paleta validada);
// gastos por categoría → barras de UN tono (es magnitud, no identidad). La tabla de la página
// es la vista alternativa que cubre el aviso de contraste del validador.
import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid, Cell, LabelList,
} from 'recharts'
import { eur, eurSinDecimales } from '@/lib/dinero'
import type { PLMensual, PLPiso } from '@/lib/sivra/pl-mensual'
import { card, colorPiso, etiquetaMes } from './compartido'

const C_INGRESOS = '#6366f1'
const C_GASTOS = '#f59e0b'
const C_RESULTADO = '#10b981'
const C_ANTERIOR = '#94a3b8' // referencia deliberadamente recesiva: discontinua + leyenda

const fmtTooltip = (v: number | string | Array<number | string>) => eur(Number(v))
const fmtEje = (v: number) => eurSinDecimales(v)

export default function GraficasRango({ meses, mesesAnterior, agregado, pisoFiltrado }: {
  meses: PLMensual[]
  mesesAnterior: PLMensual[] | null
  agregado: PLPiso[]
  pisoFiltrado: boolean
}) {
  const evolucion = useMemo(() => meses.map((m, i) => {
    const suma = (pisos: PLPiso[]) => pisos.reduce(
      (a, p) => ({ ingresos: a.ingresos + p.ingresos, gastos: a.gastos + p.gastos.total, resultado: a.resultado + p.resultado }),
      { ingresos: 0, gastos: 0, resultado: 0 },
    )
    const s = suma(m.pisos)
    const ant = mesesAnterior?.[i] ? suma(mesesAnterior[i].pisos) : null
    return {
      label: etiquetaMes(m.mes),
      ingresos: Math.round(s.ingresos), gastos: Math.round(s.gastos), resultado: Math.round(s.resultado),
      resultadoAnterior: ant ? Math.round(ant.resultado) : null,
    }
  }), [meses, mesesAnterior])

  const porPiso = useMemo(() => agregado.map((p, i) => ({
    nombre: p.nombre, resultado: Math.round(p.resultado), margen: p.margen,
    ingresos: p.ingresos, color: colorPiso(i),
  })), [agregado])

  const gastosCat = useMemo(() => {
    const t = agregado.reduce((a, p) => ({
      Lavandería: a['Lavandería'] + p.gastos.lavanderia,
      Limpieza: a['Limpieza'] + p.gastos.limpieza,
      Alquiler: a['Alquiler'] + p.gastos.alquiler,
      Suministros: a['Suministros'] + p.gastos.suministros,
      Comunidad: a['Comunidad'] + p.gastos.comunidad,
      Otros: a['Otros'] + p.gastos.otros,
    }), { 'Lavandería': 0, 'Limpieza': 0, 'Alquiler': 0, 'Suministros': 0, 'Comunidad': 0, 'Otros': 0 })
    return Object.entries(t)
      .map(([categoria, total]) => ({ categoria, total: Math.round(total) }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [agregado])

  const hayEvolucion = evolucion.length >= 2
  const hayPisos = !pisoFiltrado && porPiso.length > 1

  if (!hayEvolucion && !hayPisos && gastosCat.length === 0) return null

  return (
    <section style={{ marginBottom: 20 }}>

      {hayEvolucion && (
        <div style={{ ...card, marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>📈 Evolución mensual</h2>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={evolucion} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={fmtEje} tickLine={false} axisLine={false} width={70} />
              <Tooltip formatter={fmtTooltip} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ingresos" name="Ingresos" fill={C_INGRESOS} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar dataKey="gastos" name="Gastos" fill={C_GASTOS} radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Line dataKey="resultado" name="Resultado" stroke={C_RESULTADO} strokeWidth={2} dot={{ r: 3 }} />
              {mesesAnterior && (
                <Line dataKey="resultadoAnterior" name="Resultado año anterior" stroke={C_ANTERIOR}
                  strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rp-graf" style={{ display: 'grid', gridTemplateColumns: hayPisos && gastosCat.length > 0 ? '1fr 1fr' : '1fr', gap: 12 }}>
        {hayPisos && (
          <div style={card}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>🏠 Resultado por piso</h2>
            <ResponsiveContainer width="100%" height={Math.max(140, porPiso.length * 44)}>
              <BarChart data={porPiso} layout="vertical" margin={{ top: 0, right: 70, bottom: 0, left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 12, fill: 'var(--text)' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={fmtTooltip} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="resultado" name="Resultado" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {porPiso.map((p, i) => <Cell key={i} fill={p.color} />)}
                  <LabelList dataKey="resultado" position="right" formatter={(v: unknown) => eurSinDecimales(Number(v))} style={{ fontSize: 11, fill: 'var(--text)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
              {porPiso.map(p => `${p.nombre}: margen ${p.ingresos > 0 ? `${p.margen}%` : '—'}`).join(' · ')}
            </p>
          </div>
        )}

        {gastosCat.length > 0 && (
          <div style={card}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>🧾 Gastos por categoría</h2>
            <ResponsiveContainer width="100%" height={Math.max(140, gastosCat.length * 38)}>
              <BarChart data={gastosCat} layout="vertical" margin={{ top: 0, right: 70, bottom: 0, left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="categoria" width={100} tick={{ fontSize: 12, fill: 'var(--text)' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={fmtTooltip} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" name="Gasto" fill={C_GASTOS} radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <LabelList dataKey="total" position="right" formatter={(v: unknown) => eurSinDecimales(Number(v))} style={{ fontSize: 11, fill: 'var(--text)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  )
}
