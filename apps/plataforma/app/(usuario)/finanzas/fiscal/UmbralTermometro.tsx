'use client'
// 1. ¿Paso de 60.000€? Base liquidable hoy y al cierre (rango de escenarios) frente al umbral del 45 %.
// Real = relleno sólido · estimado = rayado · estado = icono + texto + color (nunca solo color).
import { AlertTriangle, CircleHelp, ShieldCheck, TrendingUp } from 'lucide-react'
import { Badge, Stat } from '@/components/ui'
import { MARGEN_CERCA, SELECCIONES, UMBRAL, type NivelUmbral, type Seleccion } from '@/lib/fiscal-panel'
import { dinero, rejilla, soloLector, tarjeta, tituloBloque } from './estilosPanel'
import { eur } from '@/lib/dinero'

type Props = {
  sel: Seleccion
  onSel: (s: Seleccion) => void
  hoy: number | null
  cierre: number | null
  rango: { min: number; max: number; completo: boolean } | null
  conPalancas: number | null
  nivel: NivelUmbral
  provisional: boolean
  ahorroMax: number | null
}

const ESTADO: Record<NivelUmbral, { color: string; fondo: string; Icono: typeof ShieldCheck }> = {
  seguro: { color: 'var(--positive)', fondo: 'var(--positive-bg)', Icono: ShieldCheck },
  cerca: { color: 'var(--warning)', fondo: 'var(--warning-bg)', Icono: AlertTriangle },
  pasa: { color: 'var(--negative)', fondo: 'var(--negative-bg)', Icono: TrendingUp },
  sin_dato: { color: 'var(--muted)', fondo: 'transparent', Icono: CircleHelp },
}

export function titular(nivel: NivelUmbral, cierre: number | null, peor: number | null): string {
  if (cierre == null || nivel === 'sin_dato') return 'Sin dato: no se puede calcular la base liquidable'
  const margen = UMBRAL - cierre
  if (nivel === 'pasa') return `Pasas del umbral por ~${eur(-margen)} (tramo del 45 %)`
  if (nivel === 'cerca') {
    return peor != null && peor > UMBRAL && margen >= MARGEN_CERCA
      ? `Cerca del umbral: en el peor caso lo pasas por ~${eur(peor - UMBRAL)}`
      : `Cerca del umbral: te quedan ~${eur(margen)}`
  }
  return `Por debajo del umbral con margen de ~${eur(margen)}`
}

export default function UmbralTermometro({ sel, onSel, hoy, cierre, rango, conPalancas, nivel, provisional, ahorroMax }: Props) {
  const e = ESTADO[nivel]
  const Icono = e.Icono
  const peor = rango?.max ?? null
  const valores = [hoy, cierre, rango?.max ?? null, conPalancas].filter((x): x is number => x != null)
  const max = Math.max(80000, Math.max(0, ...valores) * 1.1)
  const p = (x: number) => `${Math.min(100, Math.max(0, (x / max) * 100))}%`
  const margen = cierre == null ? null : UMBRAL - cierre
  const frase = `${provisional ? 'Provisional: ' : ''}${titular(nivel, cierre, peor)}`
  const aria = `Base liquidable ${hoy == null ? 'hoy sin dato' : `hoy ${eur(hoy)}`}; cierre estimado ${cierre == null ? 'sin dato' : eur(cierre)}; umbral ${eur(UMBRAL)}. ${frase}`

  return (
    <section style={tarjeta} aria-labelledby="t-termometro">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <h2 id="t-termometro" style={tituloBloque}>¿Paso de 60.000€? Base liquidable 2026</h2>
        <div role="radiogroup" aria-label="Modalidad de declaración" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
          {SELECCIONES.map(s => (
            <button key={s.id} type="button" role="radio" aria-checked={sel === s.id} onClick={() => onSel(s.id)}
              style={{ minHeight: 44, minWidth: 44, padding: '0 14px', fontSize: 13, fontWeight: sel === s.id ? 700 : 500, border: 'none', cursor: 'pointer', background: sel === s.id ? 'var(--primary)' : 'var(--surface)', color: sel === s.id ? '#fff' : 'var(--text)' }}>
              {s.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, background: e.fondo, color: e.color, border: nivel === 'sin_dato' ? '1px dashed var(--muted)' : 'none' }}>
        <Icono size={22} strokeWidth={2} aria-hidden style={{ flex: '0 0 auto', marginTop: 1 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{frase}</div>
          {provisional && (
            <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
              <Badge tono="aviso" title="Hay datos sin actualizar o conceptos sin dato: la cifra puede estar mal">Dato parcial</Badge>
              <a href="#calidad-dato" style={{ color: 'inherit', textDecoration: 'underline', minHeight: 24 }}>Ver qué falta</a>
            </div>
          )}
        </div>
      </div>

      {/* Barra 0 → escala. Zonas con texto; marcadores con forma distinta; real sólido, estimado rayado. */}
      <div role="img" aria-label={aria} style={{ marginTop: 18 }}>
        <div style={{ position: 'relative', height: 30, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex' }}>
          <div style={{ width: p(UMBRAL), background: 'var(--info-bg)', color: 'var(--info)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6, whiteSpace: 'nowrap' }}>hasta 37 %</div>
          <div style={{ flex: 1, background: 'var(--negative-bg)', color: 'var(--negative)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', paddingLeft: 6, whiteSpace: 'nowrap' }}>45 %</div>
          {hoy != null && <div style={{ position: 'absolute', left: 0, top: 9, height: 12, width: p(hoy), background: 'var(--primary)', borderRadius: 3 }} />}
          {hoy != null && cierre != null && cierre > hoy && (
            <div style={{ position: 'absolute', left: p(hoy), top: 9, height: 12, width: `${Math.max(0, ((cierre - hoy) / max) * 100)}%`, backgroundImage: 'repeating-linear-gradient(135deg, var(--primary) 0 3px, transparent 3px 6px)', borderRadius: 3 }} />
          )}
          {rango && <div style={{ position: 'absolute', top: 4, height: 22, left: p(rango.min), width: `${Math.max(0.5, ((rango.max - rango.min) / max) * 100)}%`, border: '1px dashed var(--text)', borderRadius: 3 }} />}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: p(UMBRAL), width: 3, background: 'var(--text)' }} />
        </div>
        <div style={{ position: 'relative', height: 20, marginTop: 2, fontSize: 12, fontWeight: 700 }} aria-hidden>
          {hoy != null && <span style={{ position: 'absolute', left: p(hoy), transform: 'translateX(-50%)' }}>▲</span>}
          {cierre != null && <span style={{ position: 'absolute', left: p(cierre), transform: 'translateX(-50%)' }}>◆</span>}
          {conPalancas != null && <span style={{ position: 'absolute', left: p(conPalancas), transform: 'translateX(-50%)' }}>◇</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11, color: 'var(--muted)' }} aria-hidden>
          <span>| umbral 60.000€</span><span>▲ hoy (real)</span><span>◆ cierre (estimado)</span>{conPalancas != null && <span>◇ con palancas</span>}
          <span>▮ real ▨ estimado ┆┆ rango de escenarios</span>
        </div>
      </div>

      <div style={{ ...rejilla(140), marginTop: 16 }}>
        <Stat label="Hoy (real)" value={dinero(hoy)} />
        <Stat label="Cierre 31/12 (est.)" value={dinero(cierre, true)} sub={rango ? `rango ${dinero(rango.min)} – ${dinero(rango.max)}${rango.completo ? '' : ' (incompleto)'}` : 'rango sin dato'} />
        <Stat label="Margen al umbral" value={margen == null ? 'sin dato' : margen >= 0 ? `+${eur(margen)}` : `−${eur(-margen)}`} color={margen == null ? 'var(--muted)' : margen >= 0 ? 'var(--positive)' : 'var(--negative)'} sub="60.000€ − cierre" />
        <Stat label="Ahorro máx. con palancas" value={dinero(ahorroMax)} sub="cuota, todas las palancas del simulador" />
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>
        Base liquidable = base general − reducciones (conjunta: −3.400,00€). «Cerca» = margen menor de {eur(MARGEN_CERCA)} o el peor caso del rango pasa el umbral. El semáforo usa el peor caso.
      </p>
      <span style={soloLector}>{aria}</span>
    </section>
  )
}
