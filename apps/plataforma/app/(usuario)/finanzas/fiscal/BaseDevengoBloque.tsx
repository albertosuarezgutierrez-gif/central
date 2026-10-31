// «Hasta hoy» y «Estimación cierre de año» por criterio de DEVENGO (lib/base-fiscal-devengo.ts).
// Presentacional: sin estado ni fetch. `null` se pinta «sin dato», nunca 0,00€.
import { eur } from '@/lib/dinero'
import { TablaScroll, Badge } from '@/components/ui'
import type { BaseDevengo } from '@/lib/base-fiscal-devengo-db'
import { esProvisional, type Bloque, type Comparativa, type ConceptoSinDato, type Periodo } from '@/lib/base-fiscal-devengo'

const NOMBRE_BLOQUE: Record<Bloque, string> = {
  capital_inmobiliario: 'Capital inmobiliario (Socorro, Dúplex)',
  capital_mobiliario: 'Capital mobiliario (Bustos, subarriendo)',
  actividad_correduria: 'Actividad correduría',
  actividad_pilar: 'Actividad de Pilar',
}
const BLOQUES: Bloque[] = ['capital_inmobiliario', 'capital_mobiliario', 'actividad_correduria', 'actividad_pilar']

const money = (n: number | null | undefined) => (n == null ? 'sin dato' : eur(n))
/** Cifra que cuenta conceptos «sin dato» como 0: «~» delante y título que lo explica (no es firme). */
const PROV_TITLE = 'Provisional: hay conceptos sin dato contados como 0 (ver la lista de abajo).'
const estimada = (n: number, provisional: boolean) => (provisional ? `~${eur(n)}` : eur(n))
const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' } as const
const h = { fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' } as const
const sub = { fontSize: '11px', color: 'var(--muted)', marginTop: '2px' } as const
const th = { textAlign: 'right', padding: '6px 8px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' } as const
const td = { textAlign: 'right', padding: '6px 8px', fontSize: '12px', whiteSpace: 'nowrap' } as const
const fecha = (iso: string) => iso.split('-').reverse().join('/')
const mesCorto = (m: string) => ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m.slice(5, 7)) - 1]

function etiquetaSinDato(d: ConceptoSinDato): string {
  const nombre = { comision: 'comisión', limpieza: 'limpieza', lavanderia: 'lavandería', luz: 'luz', agua: 'agua', fijos: 'gastos fijos' }[d.concepto]
  return d.concepto === 'comision'
    ? `${nombre} de ${d.reservas?.toLocaleString('es-ES', { maximumFractionDigits: 1 })} reservas de ${d.nombre} (${eur(d.bruto ?? 0)} brutos)`
    : `${nombre} de ${d.nombre}`
}

function Comparativa({ c, titulo }: { c: Comparativa | null; titulo: string }) {
  if (!c) return <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Comparativa sin dato (falta el perfil fiscal).</div>
  const filas = [
    { k: 'conjunta', label: '🤝 Conjunta con Pilar', cuota: c.conjunta.cuota, base: c.conjunta.baseLiquidable, nota: 'base liquidable general (tras reducir 3.400,00€)', dist: c.distanciaUmbralConjunta },
    { k: 'individual', label: '👤 Individual (Alberto + Pilar)', cuota: c.individual.total, base: c.individual.alberto.base, nota: `Alberto ${eur(c.individual.alberto.base)} · Pilar ${eur(c.individual.pilar.base)}`, dist: Math.min(c.distanciaUmbralAlberto, c.distanciaUmbralPilar) },
  ] as const
  return (
    <div style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{titulo}</div>
      {filas.map(f => {
        const mejor = c.masBarata === f.k
        return (
          <div key={f.k} style={{ padding: '8px', borderRadius: '6px', marginBottom: '6px', border: `1px solid ${mejor ? 'var(--primary)' : 'var(--border)'}`, background: mejor ? 'var(--primary-light)' : 'transparent' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{f.label} {mejor && <Badge tono="positivo">más barata</Badge>}</span>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>cuota íntegra {eur(f.cuota)}</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{f.nota}</div>
            <div style={{ fontSize: '10px', color: f.dist < 0 ? 'var(--negative)' : 'var(--muted)' }}>
              {f.dist < 0 ? `Pasa ${eur(-f.dist)} del umbral de 60.000,00€ (tramo del 45 %)` : `Margen de ${eur(f.dist)} hasta el umbral de 60.000,00€`}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: '12px', fontWeight: 600 }}>Ahorra {eur(c.ahorro)} con la {c.masBarata}.</div>
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>Cuota íntegra tras mínimos, sin deducciones familiares ni autonómicas. Individual: mínimos repartidos 50/50.</div>
    </div>
  )
}

function Tabla({ p }: { p: Periodo }) {
  return (
    <TablaScroll>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ ...th, textAlign: 'left' }}>Mes</th>
            {BLOQUES.map(b => <th key={b} style={th}>{NOMBRE_BLOQUE[b].split(' (')[0]}</th>)}
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {p.porMes.map(m => (
            <tr key={m.mes} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ ...td, textAlign: 'left' }}>{mesCorto(m.mes)}</td>
              {BLOQUES.map(b => <td key={b} style={{ ...td, color: m.porBloque[b] == null ? 'var(--muted)' : undefined }}>{money(m.porBloque[b])}</td>)}
              <td style={{ ...td, fontWeight: 700, color: m.total == null ? 'var(--muted)' : undefined }}>{money(m.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablaScroll>
  )
}

export default function BaseDevengoBloque({ data }: { data: BaseDevengo | null }) {
  if (!data) {
    return (
      <div style={card}>
        <div style={h}>📆 Base por devengo</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>Sin dato: no se pudo calcular la base por devengo.</div>
      </div>
    )
  }
  const { hastaHoy: p, estimacion: est, avisos } = data
  const hayAvisos = avisos.cuentasSinActualizar.length > 0 || avisos.mesesSinLimpieza.length > 0 || avisos.mesesSinSuministros.length > 0
  return (
    <>
      {hayAvisos && (
        <div style={{ ...card, background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong>⚠️ Datos incompletos: la base puede estar mal hasta que se completen</strong>
          {avisos.cuentasSinActualizar.map(c => (
            <div key={c.nombre}>• {c.nombre}: {c.ultimoMovimiento ? `último movimiento ${fecha(c.ultimoMovimiento)} (hace ${c.dias} días)` : 'sin movimientos'}.</div>
          ))}
          {avisos.mesesSinLimpieza.length > 0 && <div>• Sin factura de limpieza: {avisos.mesesSinLimpieza.map(mesCorto).join(', ')}.</div>}
          {avisos.mesesSinSuministros.length > 0 && <div>• Sin factura de suministros (Socorro): {avisos.mesesSinSuministros.map(mesCorto).join(', ')}.</div>}
        </div>
      )}

      <div style={card}>
        <div style={{ marginBottom: '12px' }}>
          <div style={h}>📆 Hasta hoy (1 ene – {fecha(data.hoy)}) · por devengo</div>
          <div style={sub}>Ingresos brutos del portal por check-in, comisión y mobiliario como gasto, amortización por noches alquiladas, Pilar incluida.</div>
        </div>
        <div className="fiscal-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div>
            {BLOQUES.map(b => (
              <div key={b} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                <span>{NOMBRE_BLOQUE[b]}</span><strong style={{ color: p.bloques[b] == null ? 'var(--muted)' : undefined }}>{money(p.bloques[b])}</strong>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px' }}>
              <strong>Base general (antes de reducción)</strong><strong>{money(p.baseGeneral)}</strong>
            </div>
            {p.correduria.retencion != null && <div style={sub}>Correduría: bruto {money(p.correduria.bruto)}, retención 15 % {money(p.correduria.retencion)}.</div>}
            {p.compartidosSinRepartir > 0 && <div style={{ ...sub, color: 'var(--warning)' }}>Gastos compartidos sin repartir (sin ingresos): {eur(p.compartidosSinRepartir)}.</div>}
          </div>
          <Comparativa c={data.comparativaHoy} titulo="Conjunta vs individual hoy" />
        </div>
        <TablaScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px', marginBottom: '16px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Piso</th><th style={th}>Bruto</th><th style={th}>Comisión</th><th style={th}>Gastos</th>
                <th style={th}>Compartidos</th><th style={th}>Amortización</th><th style={th}>Días</th><th style={th}>Neto</th>
              </tr>
            </thead>
            <tbody>
              {p.lineas.map(l => (
                <tr key={l.propertyId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, textAlign: 'left' }}>{l.nombre}</td><td style={td}>{eur(l.bruto)}</td><td style={td}>{eur(l.comision)}</td>
                  <td style={td} title={l.mobiliario > 0 ? `incluye mobiliario íntegro ${eur(l.mobiliario)}` : undefined}>{eur(l.gastosDirectos)}</td>
                  <td style={td}>{eur(l.compartidos)}</td><td style={td}>{l.amortizacion == null ? 'n/a' : eur(l.amortizacion)}</td>
                  <td style={td}>{l.dias}</td><td style={{ ...td, fontWeight: 700 }}>{eur(l.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
        <div style={{ ...h, marginBottom: '6px' }}>Por mes</div>
        <Tabla p={p} />
      </div>

      <div style={{ ...card, borderStyle: 'dashed' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={h}>🔮 Estimación cierre de año (31/12) <Badge tono="aviso">estimado</Badge></div>
          <div style={sub}>
            Hasta hoy + {est.mesesRestantes.toLocaleString('es-ES', { maximumFractionDigits: 1 })} meses estimados. Coste variable por reserva
            (comisión, limpieza y lavandería por estancia), luz, agua y gastos fijos al mes, y amortización por días ocupados.
            Lo que no tiene dato se dice «sin dato» y no se cuenta como 0.
          </div>
        </div>
        <TablaScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px', marginBottom: '16px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...th, textAlign: 'left' }}>A 31/12 (estimado)</th>
                {est.escenarios.map(x => <th key={x.id} style={th} title={x.descripcion}>{x.etiqueta}</th>)}
              </tr>
            </thead>
            <tbody>
              {BLOQUES.map(b => (
                <tr key={b} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, textAlign: 'left' }}>{NOMBRE_BLOQUE[b].split(' (')[0]}</td>
                  {est.escenarios.map(x => <td key={x.id} style={{ ...td, color: x.bloques[b].total == null ? 'var(--muted)' : undefined }}>{money(x.bloques[b].total)}</td>)}
                </tr>
              ))}
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>Base general estimada</td>
                {est.escenarios.map(x => (
                  <td key={x.id} style={{ ...td, fontWeight: 700, fontStyle: 'italic' }} title={esProvisional(x) ? PROV_TITLE : undefined}>
                    {estimada(x.baseGeneral, esProvisional(x))}{esProvisional(x) && <> <Badge tono="aviso" title={PROV_TITLE}>provisional</Badge></>}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...td, textAlign: 'left', color: 'var(--muted)' }}>…de la que es estimación</td>
                {est.escenarios.map(x => <td key={x.id} style={{ ...td, color: 'var(--muted)' }} title={esProvisional(x) ? PROV_TITLE : undefined}>{estimada(x.baseEstimada, esProvisional(x))}</td>)}
              </tr>
            </tbody>
          </table>
        </TablaScroll>
        <div className="fiscal-cols" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', marginBottom: '16px' }}>
          {est.escenarios.map(x => {
            const c = data.cierres.find(k => k.id === x.id)?.comparativa ?? null
            return <Comparativa key={x.id} c={c} titulo={`Conjunta vs individual · ${x.etiqueta}`} />
          })}
        </div>
        <div style={{ ...h, marginBottom: '6px' }}>Futuro por piso (escenario base) · coste variable</div>
        <TablaScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px', marginBottom: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Piso</th><th style={th}>Reservas</th><th style={th}>Bruto</th><th style={th}>Comisión</th>
                <th style={th}>Limpieza</th><th style={th}>Lavandería</th><th style={th}>Luz</th><th style={th}>Agua</th><th style={th}>Fijos</th>
                <th style={th}>Compartidos</th><th style={th}>Amortización</th><th style={th}>Neto</th>
              </tr>
            </thead>
            <tbody>
              {est.escenarios[0].desglose.map(l => (
                <tr key={l.propertyId} style={{ borderBottom: '1px solid var(--border)', fontStyle: 'italic' }}>
                  <td style={{ ...td, textAlign: 'left', fontStyle: 'normal' }}>{l.nombre}</td>
                  <td style={td}>{l.reservas.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</td><td style={td}>{eur(l.bruto)}</td>
                  {([l.comision, l.limpieza, l.lavanderia, l.luz, l.agua, l.fijos] as (number | null)[]).map((v, i) => (
                    <td key={i} style={{ ...td, color: v == null ? 'var(--muted)' : undefined }}>{money(v)}</td>
                  ))}
                  <td style={td}>{eur(l.compartidos)}</td><td style={td}>{l.amortizacion == null ? 'n/a' : eur(l.amortizacion)}</td>
                  <td style={{ ...td, fontWeight: 700 }} title={esProvisional(est.escenarios[0], l.propertyId) ? PROV_TITLE : undefined}>
                    {estimada(l.neto, esProvisional(est.escenarios[0], l.propertyId))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
        {est.escenarios.map(x => x.sinDato.length > 0 && (
          <div key={x.id} style={{ ...sub, color: 'var(--warning)', marginBottom: '4px' }}>
            {x.etiqueta}, sin dato (no cuenta como 0): {x.sinDato.map(d => etiquetaSinDato(d)).join(' · ')}.
          </div>
        ))}
        <div style={sub}>No incluye averías ni mantenimientos puntuales. El neto por piso cuenta los conceptos «sin dato» como 0: es una cota optimista; las cifras con «~» son provisionales.</div>
      </div>
    </>
  )
}
