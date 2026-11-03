// Resultado de la declaración IRPF (a pagar / a devolver) por modalidad. Presentacional: recibe el cálculo ya hecho
// (`calcularResultadoDeclaracion`). Cada partida estimada lleva «~» y «estimada»; lo que falta, «pendiente de dato».
import { Badge } from '@/components/ui'
import { eur } from '@/lib/dinero'
import type { ContribuyenteFinal, Partida, ResultadoFinal, ResultadoModalidad } from '@/lib/resultado-declaracion'
import { rejilla, subBloque, tarjeta, tituloBloque } from './estilosPanel'

/** «A pagar 1.234,00€» / «A devolver 1.234,00€» / «sin dato». */
export function textoResultado(n: number | null): string {
  if (n == null) return 'sin dato'
  if (Math.abs(n) < 0.005) return `Resultado ${eur(0)}`
  return n > 0 ? `A pagar ${eur(n)}` : `A devolver ${eur(-n)}`
}
const colorResultado = (n: number | null) => (n == null ? 'var(--muted)' : n > 0 ? 'var(--negative)' : 'var(--positive)')

function Fila({ p, signo }: { p: Partida; signo: '−' | '+' | '' }) {
  const pend = p.importe == null
  return (
    <li style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, padding: '3px 0', fontSize: 12, alignItems: 'baseline' }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        {p.etiqueta}
        {p.estimada && <> <Badge tono="aviso">estimada</Badge></>}
        {p.nota && <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{p.nota}</span>}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: pend ? 'var(--muted)' : undefined, border: pend ? '1px dashed var(--border)' : undefined, borderRadius: 6, padding: pend ? '0 6px' : undefined }}>
        {pend ? 'pendiente de dato' : `${signo}${p.estimada ? '~' : ''}${eur(p.importe)}`}
      </span>
    </li>
  )
}

function Bloque({ titulo, ps, signo }: { titulo: string; ps: Partida[]; signo: '−' | '+' | '' }) {
  if (!ps.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{titulo}</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{ps.map(p => <Fila key={p.id} p={p} signo={signo} />)}</ul>
    </div>
  )
}

export function DetalleContribuyente({ c, nombre }: { c: ContribuyenteFinal; nombre: string }) {
  const f = (n: number | null) => (n == null ? 'sin dato' : eur(n))
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{nombre}</span>
        <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colorResultado(c.resultado) }}>{textoResultado(c.resultado)}{c.estimada && c.resultado != null ? ' (est.)' : ''}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Base liquidable {f(c.baseLiquidable)} · cuota íntegra {f(c.cuotaIntegra)}{c.donativos ? ` · donativos −${eur(c.donativos)}` : ''} · cuota líquida {f(c.cuotaLiquida)}</div>
      <Bloque titulo="Deducciones de la cuota" ps={c.deducciones} signo="−" />
      <Bloque titulo="Retenciones y pagos a cuenta" ps={[...c.retenciones, ...c.pagosFraccionados]} signo="−" />
      <Bloque titulo="Abonos anticipados cobrados" ps={c.abonosAnticipados} signo="+" />
    </div>
  )
}

function Modalidad({ m, titulo, mejor }: { m: ResultadoModalidad; titulo: string; mejor: boolean }) {
  return (
    <div style={{ border: `1px solid ${mejor ? 'var(--primary)' : 'var(--border)'}`, background: mejor ? 'var(--primary-light)' : 'transparent', borderRadius: 8, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{titulo}</span>
        {mejor && <Badge tono="positivo">recomendada</Badge>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colorResultado(m.resultado) }}>
        {m.resultado != null && m.estimada ? '~' : ''}{textoResultado(m.resultado)}
      </div>
      {m.pendientes.length > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Provisional: faltan {m.pendientes.length} dato(s) (se cuentan como 0 hasta tenerlos).</div>}
      {m.contribuyentes.map(c => (
        <DetalleContribuyente key={c.titular} c={c} nombre={c.titular === 'alberto' ? 'Alberto' : c.titular === 'pilar' ? 'Pilar' : 'Unidad familiar'} />
      ))}
    </div>
  )
}

export default function ResultadoDeclaracion({ r, sinContexto }: { r: ResultadoFinal | null; sinContexto?: boolean }) {
  return (
    <section style={tarjeta} aria-labelledby="t-resultado">
      <h2 id="t-resultado" style={tituloBloque}>Resultado de la declaración IRPF</h2>
      <p style={subBloque}>
        Cierre 31/12 ESTIMADO: cuota tras mínimos − deducciones familiares y autonómicas − retenciones y pagos a cuenta. Orientativo: no sustituye a la asesoría.
      </p>
      {r == null ? (
        <p style={{ fontSize: 13, marginTop: 12 }}>{sinContexto ? 'Sin dato: no se pudo cargar el perfil fiscal, las retenciones o la base.' : 'Sin dato.'}</p>
      ) : (
        <>
          {r.avisoAbonos && (
            <p role="alert" style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 0', padding: '10px 12px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
              Provisional: puede ser menos favorable: faltan abonos anticipados 140/143.
            </p>
          )}
          {r.avisos.map(a => (
            <p key={a} role="note" style={{ fontSize: 12, margin: '10px 0 0', padding: '8px 10px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning)' }}>{a}</p>
          ))}
          <div style={{ ...rejilla(300), marginTop: 12 }}>
            <Modalidad m={r.conjunta} titulo="Conjunta con Pilar" mejor={r.recomendada === 'conjunta'} />
            <Modalidad m={r.individual} titulo="Individual (Alberto + Pilar)" mejor={r.recomendada === 'individual'} />
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>
            {r.recomendada == null || r.ventaja == null
              ? 'Recomendada: sin dato (falta la base de alguna modalidad).'
              : `Recomendada: ${r.recomendada} (${r.ventaja === 0 ? 'sin diferencia' : `${eur(r.ventaja)} menos`}).${r.firme ? '' : ' Provisional hasta cerrar los datos pendientes.'}`}
          </p>
        </>
      )}
    </section>
  )
}
