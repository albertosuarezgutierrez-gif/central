'use client'
// Calculadora de `/calculadora-coste-trabajador`. La cuenta es el motor de
// nóminas (`simularCosteContratacion` de `@central/module-nominas`, tablas de
// cotización del año y algoritmo de retenciones de la AEAT) y corre AQUÍ, en el
// navegador: no hay ruta ni BD, nada sale del equipo. `lib/coste-trabajador.ts`
// traduce el formulario y los avisos.
//
// Arranca con un ejemplo rellenado; el evento del embudo solo se emite cuando
// la persona toca un dato (como la calculadora de la hipoteca).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { simularCosteContratacion, type ResultadoSimulador } from '@central/module-nominas'
import { EJEMPLO_COSTE, GRUPOS, avisoTablasAñoAnterior, fechaHoyMadrid, leerDatosCoste, textosAvisos, type DatosCoste } from '@/lib/coste-trabajador'
import { eur } from '@/lib/panel-demo'
import { medir } from '@/lib/medir'

const e = (c: number) => eur(c / 100)
const pct = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`

const cifra: CSSProperties = { fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(22px, 4vw, 28px)', lineHeight: 1.1 }
const campo: CSSProperties = { minHeight: 48, fontSize: 17 }
const rejilla: CSSProperties = { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }

function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div>
      <label className="f-lab" htmlFor={id} style={{ fontSize: 15, fontWeight: 700 }}>
        {etiqueta}
      </label>
      {children}
      {ayuda && (
        <div className="tenue" style={{ fontSize: 13, marginTop: 6 }}>
          {ayuda}
        </div>
      )}
    </div>
  )
}

function Casilla({ marcada, onCambio, children }: { marcada: boolean; onCambio: (v: boolean) => void; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', fontWeight: 700 }}>
      <input type="checkbox" checked={marcada} onChange={(ev) => onCambio(ev.target.checked)} style={{ width: 22, height: 22 }} />
      <span>{children}</span>
    </label>
  )
}

function Fila({ texto, valor, fuerte }: { texto: string; valor: string; fuerte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontWeight: fuerte ? 700 : 400 }}>
      <span>{texto}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{valor}</span>
    </div>
  )
}

type Calculo = { ok: true; r: ResultadoSimulador } | { ok: false; motivo: string }

export default function CalculadoraCosteTrabajador() {
  const [d, setD] = useState<DatosCoste>(EJEMPLO_COSTE)
  const [tocado, setTocado] = useState(false)
  const cambiar = (p: Partial<DatosCoste>) => {
    setTocado(true)
    setD((x) => ({ ...x, ...p }))
  }

  const calc: Calculo = useMemo(() => {
    const l = leerDatosCoste(d, fechaHoyMadrid())
    if (!l.ok) return { ok: false, motivo: `Falta ${l.falta}.` }
    try {
      return { ok: true, r: simularCosteContratacion(l.entrada) }
    } catch (err) {
      // Nunca en silencio: se dice que no se ha podido calcular y por qué.
      return { ok: false, motivo: `No se puede calcular con estos datos: ${err instanceof Error ? err.message : 'revisa los datos'}.` }
    }
  }, [d])

  const medido = useRef(false)
  useEffect(() => {
    if (!tocado || medido.current || !calc.ok) return
    medido.current = true
    medir('coste_trabajador_calculo', { flexible: calc.r.flexible !== null, aproximado: calc.r.aproximado })
  }, [tocado, calc])

  const r = calc.ok ? calc.r : null
  const b = r?.base
  const avisos = r ? textosAvisos(r) : []
  const avisoTablas = r ? avisoTablasAñoAnterior(r) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(16px, 3vw, 32px)', alignItems: 'start' }}>
      <div className="panel" style={{ display: 'grid', gap: 18 }}>
        <Campo id="ct-bruto" etiqueta="Salario bruto anual (€)" ayuda="El que figura en el contrato, ya a la jornada pactada.">
          <input id="ct-bruto" className="f-in" inputMode="decimal" maxLength={14} value={d.bruto} onChange={(ev) => cambiar({ bruto: ev.target.value })} style={campo} />
        </Campo>
        <div style={rejilla}>
          <Campo id="ct-pagas" etiqueta="Pagas">
            <select id="ct-pagas" className="f-in" value={d.pagas} onChange={(ev) => cambiar({ pagas: ev.target.value as DatosCoste['pagas'] })} style={campo}>
              <option value="12">12 pagas</option>
              <option value="14">14 pagas (extras en junio y diciembre)</option>
              <option value="14p">14 pagas prorrateadas</option>
            </select>
          </Campo>
          <Campo id="ct-jornada" etiqueta="Jornada (%)" ayuda="100 = completa.">
            <input id="ct-jornada" className="f-in" inputMode="decimal" maxLength={5} value={d.jornada} onChange={(ev) => cambiar({ jornada: ev.target.value })} style={campo} />
          </Campo>
        </div>
        <Campo id="ct-grupo" etiqueta="Grupo de cotización">
          <select id="ct-grupo" className="f-in" value={d.grupo} onChange={(ev) => cambiar({ grupo: ev.target.value })} style={campo}>
            {GRUPOS.map((g) => (
              <option key={g.valor} value={String(g.valor)}>
                {g.texto}
              </option>
            ))}
          </select>
        </Campo>
        <div style={rejilla}>
          <Campo id="ct-contrato" etiqueta="Contrato">
            <select id="ct-contrato" className="f-in" value={d.contrato} onChange={(ev) => cambiar({ contrato: ev.target.value as DatosCoste['contrato'] })} style={campo}>
              <option value="indefinido">Indefinido</option>
              <option value="temporal">Temporal</option>
            </select>
          </Campo>
          {d.contrato === 'temporal' && (
            <Campo id="ct-duracion" etiqueta="¿Dura menos de un año?">
              <select
                id="ct-duracion"
                className="f-in"
                value={d.menosDeUnAño === null ? '' : d.menosDeUnAño ? 'si' : 'no'}
                onChange={(ev) => cambiar({ menosDeUnAño: ev.target.value === '' ? null : ev.target.value === 'si' })}
                style={campo}
              >
                <option value="">No lo sé</option>
                <option value="si">Sí, menos de un año</option>
                <option value="no">No, un año o más</option>
              </select>
            </Campo>
          )}
        </div>
        <Campo id="ct-cnae" etiqueta="Actividad de la empresa (CNAE, opcional)" ayuda="4 cifras, por ejemplo 5610 (restaurantes). Cambia la cuota de accidentes de trabajo.">
          <input id="ct-cnae" className="f-in" inputMode="numeric" maxLength={4} value={d.cnae} onChange={(ev) => cambiar({ cnae: ev.target.value })} style={campo} />
        </Campo>

        <div style={{ display: 'grid', gap: 12 }}>
          <Casilla marcada={d.familia.activa} onCambio={(v) => cambiar({ familia: { ...d.familia, activa: v } })}>
            Indicar la situación familiar (afina el IRPF)
          </Casilla>
          {d.familia.activa && (
            <div style={rejilla}>
              <Campo id="ct-situacion" etiqueta="Situación">
                <select id="ct-situacion" className="f-in" value={d.familia.situacion} onChange={(ev) => cambiar({ familia: { ...d.familia, situacion: ev.target.value as '1' | '2' | '3' } })} style={campo}>
                  <option value="3">Otras situaciones</option>
                  <option value="2">Casado, cónyuge sin rentas de más de 1.500 €</option>
                  <option value="1">Hijos solo a su cargo (monoparental)</option>
                </select>
              </Campo>
              <Campo id="ct-nac" etiqueta="Año de nacimiento">
                <input id="ct-nac" className="f-in" inputMode="numeric" maxLength={4} value={d.familia.añoNacimiento} onChange={(ev) => cambiar({ familia: { ...d.familia, añoNacimiento: ev.target.value } })} style={campo} />
              </Campo>
              <Campo id="ct-hijos" etiqueta="Hijos menores de 25">
                <input id="ct-hijos" className="f-in" inputMode="numeric" maxLength={2} value={d.familia.hijos} onChange={(ev) => cambiar({ familia: { ...d.familia, hijos: ev.target.value } })} style={campo} />
              </Campo>
              <Campo id="ct-hijos3" etiqueta="De ellos, menores de 3">
                <input id="ct-hijos3" className="f-in" inputMode="numeric" maxLength={2} value={d.familia.hijosMenores3} onChange={(ev) => cambiar({ familia: { ...d.familia, hijosMenores3: ev.target.value } })} style={campo} />
              </Campo>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <Casilla marcada={d.seguro.activo} onCambio={(v) => cambiar({ seguro: { ...d.seguro, activo: v } })}>
            Seguro de salud como retribución flexible
          </Casilla>
          {d.seguro.activo && (
            <div style={rejilla}>
              <Campo id="ct-prima" etiqueta="Prima anual (€)" ayuda="Lo que cuesta el seguro al año, para todos los asegurados.">
                <input id="ct-prima" className="f-in" inputMode="decimal" maxLength={10} value={d.seguro.prima} onChange={(ev) => cambiar({ seguro: { ...d.seguro, prima: ev.target.value } })} style={campo} />
              </Campo>
              <Campo id="ct-benef" etiqueta="Personas aseguradas" ayuda="Trabajador, cónyuge e hijos.">
                <input id="ct-benef" className="f-in" inputMode="numeric" maxLength={2} value={d.seguro.beneficiarios} onChange={(ev) => cambiar({ seguro: { ...d.seguro, beneficiarios: ev.target.value } })} style={campo} />
              </Campo>
              <Campo id="ct-disc" etiqueta="De ellas, con discapacidad">
                <input id="ct-disc" className="f-in" inputMode="numeric" maxLength={2} value={d.seguro.discapacidad} onChange={(ev) => cambiar({ seguro: { ...d.seguro, discapacidad: ev.target.value } })} style={campo} />
              </Campo>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }} aria-live="polite">
        {!calc.ok && (
          <div className="panel" role="status" style={{ fontSize: 16 }}>
            {calc.motivo}
          </div>
        )}
        {r && b && (
          <>
            <div style={{ background: 'var(--brand-ink)', color: 'var(--bg)', borderRadius: 'var(--r-xl)', padding: 'clamp(22px, 3.5vw, 32px)', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 15, opacity: 0.85 }}>Coste total para la empresa{r.aproximado ? ' (aproximado)' : ''}</div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(32px, 6vw, 48px)', lineHeight: 1 }}>
                {e(b.costeEmpresaAnual)} <span style={{ fontSize: 'clamp(16px, 2.4vw, 20px)' }}>al año</span>
              </div>
              <div style={{ fontSize: 17, opacity: 0.92 }}>{e(b.costeEmpresaMensual)} al mes de media</div>
            </div>

            <div
              style={{ background: 'var(--bg2)', borderRadius: 'var(--r-xl)', padding: 'clamp(18px, 3vw, 28px)', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}
            >
              <div>
                <div className="tenue" style={{ fontSize: 14 }}>Neto del trabajador</div>
                <div style={cifra}>{e(b.netoMensual)}</div>
                <div className="tenue" style={{ fontSize: 13 }}>por paga ({b.pagasCobradas} al año)</div>
              </div>
              <div>
                <div className="tenue" style={{ fontSize: 14 }}>Retención de IRPF</div>
                <div style={cifra}>{pct(b.irpfPct)}</div>
              </div>
            </div>

            <div className="panel" style={{ padding: '16px 18px' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>Seguridad Social a cargo de la empresa</h3>
              <Fila texto="Salario bruto" valor={e(b.brutoDinerario)} />
              <Fila texto="Contingencias comunes" valor={e(b.cuotaPatronal.contingenciasComunes)} />
              <Fila texto="Desempleo" valor={e(b.cuotaPatronal.desempleo)} />
              <Fila texto="FOGASA" valor={e(b.cuotaPatronal.fogasa)} />
              <Fila texto="Formación profesional" valor={e(b.cuotaPatronal.fp)} />
              <Fila texto="MEI (equidad intergeneracional)" valor={e(b.cuotaPatronal.mei)} />
              <Fila texto={`Accidentes de trabajo (${pct(r.atEpPpm / 10_000)}${r.atEpOrigen === 'explicito' ? '' : ', aproximado'})`} valor={e(b.cuotaPatronal.atEp)} />
              {b.cuotaPatronal.solidaridad > 0 && <Fila texto="Cotización de solidaridad" valor={e(b.cuotaPatronal.solidaridad)} />}
              <Fila texto="Total Seguridad Social empresa" valor={e(b.cuotaPatronal.total)} fuerte />
            </div>

            {r.flexible && r.ahorroAnualTrabajador !== null && (
              <div className="panel panel-tinta" style={{ padding: '16px 18px', display: 'grid', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>Con el seguro de salud como retribución flexible</h3>
                <div style={{ ...cifra, color: 'var(--brand-ink)' }}>
                  {r.ahorroAnualTrabajador >= 0 ? '+' : ''}
                  {e(r.ahorroAnualTrabajador)} <span style={{ fontSize: 16 }}>al año para el trabajador</span>
                </div>
                <p style={{ margin: 0, fontSize: 15 }}>
                  Frente a pagarse él el mismo seguro con su sueldo neto. El coste para la empresa queda en {e(r.flexible.costeEmpresaAnual)}: el
                  seguro cotiza igual que el salario.
                </p>
                <Fila texto="Parte del seguro exenta de IRPF" valor={e(r.flexible.especieExenta)} />
                {r.flexible.especieSujeta > 0 && <Fila texto="Parte que tributa como especie" valor={e(r.flexible.especieSujeta)} />}
                <Fila texto="Retención de IRPF" valor={`${pct(b.irpfPct)} → ${pct(r.flexible.irpfPct)}`} />
                <Fila texto="Neto por paga (en dinero)" valor={e(r.flexible.netoMensual)} />
              </div>
            )}

            {avisos.length > 0 && (
              <div className="tenue" style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong>{r.aproximado ? 'Resultado aproximado. ' : ''}Ten en cuenta:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                  {avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <div className="tenue" style={{ fontSize: 13, lineHeight: 1.5 }}>
          {avisoTablas && <p role="status" style={{ margin: '0 0 8px', fontWeight: 600 }}>{avisoTablas}</p>}
          Cálculo orientativo con las tablas de cotización y retención{r ? ` de ${r.año}` : ''}. No sustituye a la nómina ni al asesoramiento laboral o fiscal:
          el convenio, las bonificaciones o las horas reales pueden cambiar las cifras.
        </div>
      </div>
    </div>
  )
}
