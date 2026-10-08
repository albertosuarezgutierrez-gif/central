'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { hoyMadrid } from '@central/module-seguros'

import type { EstadoAutorizacion, ItvVehiculo, PapelFlota, VehiculoFlota, VencimientoFlota } from '@central/module-seguros-portal'

/**
 * La flota de una sociedad (05/10/2026). Todo lo que se pinta llega YA decidido
 * del servidor (`lib/flota.ts` → reglas puras de `flota.ts`): aquí no se decide
 * qué ve cada papel, solo se pinta y se envían las dos acciones (fecha de
 * matriculación; nombrar/retirar jefe de flota).
 *
 * 🚨 Tres estados que NO se colapsan:
 *  - ITV `desconocida` → «no lo sabemos», en ámbar; jamás en verde ni callada.
 *  - ITV `calculada` → «hacia el …» con de dónde sale la fecha: es un cálculo
 *    sobre una inspección que no hemos visto. No existe un «ITV al día».
 *  - Vencimiento `sin_fecha` → «no nos consta», nunca «vigente».
 *
 * Rendimiento: la lista pinta 50 y «Ver más» (regla de la casa), y tras guardar
 * se refresca con `router.refresh()` sin desmontar.
 */

const PASO = 50

type Jefe = { autorizacionId: string; nombre: string | null; estado: EstadoAutorizacion; otorgadoEn: string | null }
type Candidato = { clienteId: string; nombre: string; relacion: string }

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

async function enviar(url: string, cuerpo: unknown): Promise<string | null> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    if (r.ok) return null
    if (r.status === 401) return 'Se ha cerrado tu sesión. Vuelve a entrar.'
    const j = (await r.json().catch(() => null)) as { mensaje?: string } | null
    return j?.mensaje ?? 'No se ha podido guardar. Vuelve a intentarlo.'
  } catch {
    return 'No se ha podido guardar: comprueba tu conexión.'
  }
}

function ChipVencimiento({ v }: { v: VencimientoFlota }) {
  if (v.estado === 'sin_fecha') return <span className="chip aviso">Vencimiento: no nos consta</span>
  if (v.estado === 'renovacion_sin_confirmar') return <span className="chip aviso">Renovación sin confirmar</span>
  if (v.estado === 'pronto') return <span className="chip aviso">Vence el {fechaCorta(v.fecha)}</span>
  return <span className="chip">Vence el {fechaCorta(v.fecha)}</span>
}

const FUENTE: Record<'compania' | 'declarada' | 'estimada', string> = {
  compania: 'con la fecha de matriculación que da la compañía',
  declarada: 'con la fecha de matriculación que anotasteis',
  estimada: 'con una fecha de matriculación ESTIMADA por la matrícula',
}

function TextoItv({ itv }: { itv: ItvVehiculo }) {
  if (itv.estado === 'desconocida') {
    return (
      <p style={{ margin: '8px 0 0', fontSize: 14 }}>
        <span className="chip aviso">ITV: no lo sabemos</span>{' '}
        {itv.motivo === 'sin_matriculacion'
          ? 'No sabemos cuándo se matriculó. Anota la fecha (está en el permiso de circulación) y la calculamos.'
          : 'Este seguro no es de un vehículo con ITV que sepamos calcular.'}
      </p>
    )
  }
  return (
    <p style={{ margin: '8px 0 0', fontSize: 14 }}>
      <span className={itv.pronto ? 'chip aviso' : 'chip'}>
        {itv.fiabilidad === 'primera' ? 'Primera ITV' : 'Próxima ITV'} hacia el {fechaCorta(itv.fecha)}
      </span>{' '}
      <span className="suave">
        Calculada {FUENTE[itv.fuente]}
        {itv.fiabilidad === 'ciclo_estimado' ? ', suponiendo que pasó las anteriores en su fecha' : ''}
        {itv.calculadaComoTurismo ? '. Si es una furgoneta, su calendario es otro' : ''}. Comprueba la fecha en la tarjeta de la ITV.
      </span>
    </p>
  )
}

function EditarMatriculacion({ empresaId, v }: { empresaId: string; v: VehiculoFlota }) {
  const router = useRouter()
  const id = useId()
  const [valor, setValor] = useState(v.matriculacionDeclarada ?? '')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hoy = hoyMadrid()

  if (v.clave === null) {
    return <p className="suave" style={{ margin: '8px 0 0', fontSize: 14 }}>No conocemos su matrícula: escríbenos y la anotamos.</p>
  }
  const guardar = async (fecha: string | null) => {
    setEnCurso(true)
    setError(null)
    const e = await enviar('/api/flota/vehiculo', { empresaId, polizaId: v.polizaId, fechaMatriculacion: fecha })
    setEnCurso(false)
    if (e) setError(e)
    else router.refresh()
  }
  const companiaManda = v.itv.estado === 'calculada' && v.itv.fuente === 'compania'

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
        Fecha de matriculación{v.matriculacionDeclarada ? `: ${fechaCorta(v.matriculacionDeclarada)}` : ''}
      </summary>
      {companiaManda && (
        <p className="suave" style={{ margin: '4px 0 8px', fontSize: 13 }}>
          La compañía ya nos da esta fecha y es la que usamos para la ITV.
        </p>
      )}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <label htmlFor={id} className="suave" style={{ fontSize: 13 }}>
          Fecha de primera matriculación (permiso de circulación)
        </label>
        <input id={id} className="campo" type="date" min="1950-01-01" max={hoy} value={valor} onChange={(e) => setValor(e.target.value)} disabled={enCurso} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="boton" style={{ width: 'auto', flex: '1 1 140px' }} disabled={enCurso || valor === ''} onClick={() => void guardar(valor)}>
            {enCurso ? 'Guardando…' : 'Guardar'}
          </button>
          {v.matriculacionDeclarada && (
            <button type="button" className="boton-tenue" style={{ flex: '1 1 140px' }} disabled={enCurso} onClick={() => void guardar(null)}>
              Quitar la fecha
            </button>
          )}
        </div>
        {error && <p role="alert" className="aviso-linea" style={{ margin: 0 }}>{error}</p>}
      </div>
    </details>
  )
}

function ListaVehiculos({ empresaId, vehiculos, recortada }: { empresaId: string; vehiculos: VehiculoFlota[]; recortada: boolean }) {
  const [visibles, setVisibles] = useState(PASO)
  if (vehiculos.length === 0) {
    return (
      <p style={{ margin: 0 }}>
        No nos consta ningún vehículo de la sociedad con un seguro en vigor con nosotros. Si tenéis vehículos
        asegurados en otra correduría, podemos revisarlos: escríbenos.
      </p>
    )
  }
  return (
    <>
      {recortada && (
        <p className="aviso-linea" style={{ marginTop: 0 }}>
          La flota es más grande de lo que esta pantalla enseña: pídenos el listado completo.
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {vehiculos.slice(0, visibles).map((v) => (
          <li key={v.polizaId} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: 'var(--display, inherit)', fontWeight: 700, overflowWrap: 'anywhere' }}>{v.etiqueta}</p>
            <p className="suave" style={{ margin: '2px 0 0', fontSize: 14, overflowWrap: 'anywhere' }}>
              {v.compania} · {v.ramo === 'moto' ? 'Moto' : 'Auto'}
            </p>
            <div className="chips">
              <ChipVencimiento v={v.vencimiento} />
            </div>
            <TextoItv itv={v.itv} />
            <EditarMatriculacion empresaId={empresaId} v={v} />
          </li>
        ))}
      </ul>
      {visibles < vehiculos.length && (
        <button type="button" className="boton-tenue" style={{ width: '100%', marginTop: 12 }} onClick={() => setVisibles((n) => n + PASO)}>
          Ver más ({vehiculos.length - visibles})
        </button>
      )}
    </>
  )
}

function JefesDeFlota({ empresaId, jefes, candidatos, textoJefe }: { empresaId: string; jefes: Jefe[]; candidatos: Candidato[]; textoJefe: string }) {
  const router = useRouter()
  const idSel = useId()
  const idCheck = useId()
  const [candidato, setCandidato] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nombrar = async () => {
    setEnCurso(true)
    setError(null)
    const e = await enviar('/api/flota/jefe', { empresaId, candidatoId: candidato, aceptaTexto: acepta })
    setEnCurso(false)
    if (e) setError(e)
    else {
      setCandidato('')
      setAcepta(false)
      router.refresh()
    }
  }
  const retirar = async (autorizacionId: string) => {
    setEnCurso(true)
    setError(null)
    const e = await enviar(`/api/autorizaciones/${encodeURIComponent(autorizacionId)}`, { accion: 'revocar' })
    setEnCurso(false)
    if (e) setError(e)
    else router.refresh()
  }

  return (
    <section className="seccion" aria-labelledby="jefes-flota">
      <p className="antetitulo">Solo lo ves tú, como dueño</p>
      <h2 id="jefes-flota" style={{ marginTop: 0 }}>Jefe de flota</h2>
      <p className="suave" style={{ marginTop: 0, fontSize: 14 }}>{textoJefe}</p>

      {jefes.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {jefes.map((j) => (
            <li key={j.autorizacionId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: '1 1 160px', overflowWrap: 'anywhere' }}>
                {j.nombre ?? 'Una persona de la sociedad'}{' '}
                <span className={j.estado === 'pendiente' ? 'chip aviso' : 'chip'}>
                  {j.estado === 'pendiente' ? 'Pendiente de que acepte' : 'Jefe de flota'}
                </span>
              </span>
              <button type="button" className="boton-tenue" disabled={enCurso} onClick={() => void retirar(j.autorizacionId)}>
                Retirar
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidatos.length === 0 ? (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>
          Para nombrar a alguien tiene que constar en la ficha de la sociedad (empleado, administración…). Escríbenos
          y lo anotamos.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <label htmlFor={idSel} style={{ fontSize: 14 }}>Nombrar jefe de flota a</label>
          <select id={idSel} className="campo" value={candidato} onChange={(e) => setCandidato(e.target.value)} disabled={enCurso}>
            <option value="">Elige una persona…</option>
            {candidatos.map((c) => (
              <option key={c.clienteId} value={c.clienteId}>
                {c.nombre} ({c.relacion})
              </option>
            ))}
          </select>
          <label htmlFor={idCheck} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 14, cursor: 'pointer' }}>
            <input id={idCheck} type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} disabled={enCurso} style={{ width: 20, height: 20 }} />
            Entiendo lo que podrá ver y hacer
          </label>
          <button type="button" className="boton" disabled={enCurso || candidato === '' || !acepta} onClick={() => void nombrar()}>
            {enCurso ? 'Enviando…' : 'Nombrar jefe de flota'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="aviso-linea">{error}</p>}
    </section>
  )
}

export function FlotaEmpresa(props: {
  empresaId: string
  papel: PapelFlota
  recortada: boolean
  vehiculos: VehiculoFlota[]
  jefes: Jefe[] | null
  candidatos: Candidato[] | null
  textoJefe: string
}) {
  return (
    <>
      <section className="seccion" aria-labelledby="vehiculos-flota">
        <h2 id="vehiculos-flota" style={{ marginTop: 0 }}>
          Vehículos <span className="suave" style={{ fontSize: 14, fontWeight: 400 }}>({props.vehiculos.length})</span>
        </h2>
        <ListaVehiculos empresaId={props.empresaId} vehiculos={props.vehiculos} recortada={props.recortada} />
      </section>
      {props.papel === 'dueno' && props.jefes !== null && props.candidatos !== null && (
        <JefesDeFlota empresaId={props.empresaId} jefes={props.jefes} candidatos={props.candidatos} textoJefe={props.textoJefe} />
      )}
    </>
  )
}

/** Un nombramiento pendiente: aceptarlo o rechazarlo, por la ruta de siempre de las autorizaciones. */
export function NombramientoPendiente({ autorizacionId, empresa, otorgadoEn }: { autorizacionId: string; empresa: string | null; otorgadoEn: string | null }) {
  const router = useRouter()
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actuar = async (accion: 'aceptar' | 'revocar') => {
    setEnCurso(true)
    setError(null)
    const e = await enviar(`/api/autorizaciones/${encodeURIComponent(autorizacionId)}`, { accion })
    setEnCurso(false)
    if (e) setError(e)
    else router.refresh()
  }
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
      <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
        <strong>{empresa ?? 'Una sociedad'}</strong> te ha nombrado jefe de flota{otorgadoEn ? ` el ${otorgadoEn}` : ''}.
      </p>
      <p className="suave" style={{ margin: '6px 0 10px', fontSize: 14 }}>
        Verás sus vehículos con seguro en vigor, el vencimiento y la próxima ITV, y podrás anotar fechas de
        matriculación. No verás el resto de seguros de la sociedad. Al aceptar queda constancia de tu nombre.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="boton" style={{ width: 'auto', flex: '1 1 140px' }} disabled={enCurso} onClick={() => void actuar('aceptar')}>
          Aceptar
        </button>
        <button type="button" className="boton-tenue" style={{ flex: '1 1 140px' }} disabled={enCurso} onClick={() => void actuar('revocar')}>
          Rechazar
        </button>
      </div>
      {error && <p role="alert" className="aviso-linea">{error}</p>}
    </div>
  )
}
