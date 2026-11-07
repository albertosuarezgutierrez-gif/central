'use client'
import { useEffect, useState, useTransition } from 'react'
import { huecosAccion, reservarAccion, type HuecoVista } from './acciones'

type Props = {
  token: string
  inicial: { nombre: string; correo: string; matricula: string }
  servicios: Array<{ codigo: string; nombre: string }>
  textoAsegura: string
  textoTaller: string
}

const fmtDia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export function ReservaCliente({ token, inicial, servicios, textoAsegura, textoTaller }: Props) {
  const [matricula, setMatricula] = useState(inicial.matricula)
  const [nombre, setNombre] = useState(inicial.nombre)
  const [movil, setMovil] = useState('')
  const [correo, setCorreo] = useState(inicial.correo)
  const [servicio, setServicio] = useState('')
  const [semana, setSemana] = useState(0)
  const [huecos, setHuecos] = useState<HuecoVista[] | null>(null)
  const [elegido, setElegido] = useState<HuecoVista | null>(null)
  // Casillas SIEMPRE sin marcar: reservar no depende de ellas.
  const [cAsegura, setCAsegura] = useState(false)
  const [cTaller, setCTaller] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ estado: string; inicio: string } | null>(null)
  const [cargando, iniciarCarga] = useTransition()
  const [enviando, iniciarEnvio] = useTransition()

  useEffect(() => {
    if (!servicio) return
    iniciarCarga(async () => {
      setError(null)
      const r = await huecosAccion(token, servicio, semana)
      if (r.ok) setHuecos(r.huecos)
      else setError(r.mensaje)
    })
  }, [token, servicio, semana])

  if (hecho) {
    return (
      <div className="ficha" role="status">
        <strong>{hecho.estado === 'confirmada' ? 'Cita confirmada' : 'Petición recibida'}</strong>
        <span>{new Date(hecho.inicio).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Madrid' })}</span>
        <span className="tenue">{hecho.estado === 'confirmada' ? 'Te esperamos.' : 'El taller te la confirmará en cuanto la revise.'} Este enlace ya no se puede volver a usar.</span>
      </div>
    )
  }

  const porDia = new Map<string, HuecoVista[]>()
  for (const h of huecos ?? []) porDia.set(h.fecha, [...(porDia.get(h.fecha) ?? []), h])

  const reservar = () => iniciarEnvio(async () => {
    if (!elegido) return
    setError(null)
    const r = await reservarAccion(token, { servicio, inicio: elegido.inicio, matricula, nombre, movil, correo, casillas: { asegura: cAsegura, taller: cTaller } })
    if (r.ok) {
      setHecho({ estado: r.estado, inicio: r.inicio })
    } else {
      setError(r.mensaje)
      if (r.status === 409) {
        setElegido(null)
        const x = await huecosAccion(token, servicio, semana)
        if (x.ok) setHuecos(x.huecos)
      }
    }
  })

  return (
    <form className="ficha" onSubmit={(e) => { e.preventDefault(); reservar() }}>
      <label>Matrícula
        <input value={matricula} autoCapitalize="characters" autoComplete="off" maxLength={20} onChange={(e) => setMatricula(e.target.value)} required />
      </label>
      <label>Tu nombre<input value={nombre} maxLength={200} onChange={(e) => setNombre(e.target.value)} required /></label>
      <label>Móvil (obligatorio)<input type="tel" inputMode="tel" autoComplete="tel" required value={movil} maxLength={30} onChange={(e) => setMovil(e.target.value)} /></label>
      <label>Correo<input type="email" value={correo} maxLength={200} onChange={(e) => setCorreo(e.target.value)} /></label>
      <label>¿Qué necesitas?
        <select value={servicio} onChange={(e) => { setServicio(e.target.value); setSemana(0); setElegido(null); setHuecos(null) }} required>
          <option value="">Elige un servicio…</option>
          {servicios.map((s) => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
        </select>
      </label>

      {servicio && (
        <section aria-live="polite">
          <h2>Elige un hueco</h2>
          {cargando && !huecos && <p className="tenue">Buscando huecos…</p>}
          {huecos && porDia.size === 0 && <p className="tenue">No hay huecos esta semana.</p>}
          {[...porDia.entries()].map(([fecha, hs]) => (
            <div key={fecha}>
              <strong>{fmtDia(fecha)}</strong>
              <div className="fila">
                {hs.map((h) => (
                  <button key={h.inicio} type="button" className={h.inicio === elegido?.inicio ? 'btn' : 'btn btn-sec'} aria-pressed={h.inicio === elegido?.inicio}
                    onClick={() => setElegido(h)}>{h.hora}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="fila">
            <button type="button" className="btn btn-sec" disabled={semana === 0 || cargando} onClick={() => setSemana(semana - 1)}>Semana anterior</button>
            <button type="button" className="btn btn-sec" disabled={cargando} onClick={() => setSemana(semana + 1)}>Semana siguiente</button>
          </div>
        </section>
      )}

      <fieldset>
        <legend>Opcional (no condiciona tu cita)</legend>
        <label className="check"><input type="checkbox" checked={cAsegura} onChange={(e) => setCAsegura(e.target.checked)} /> {textoAsegura}</label>
        <label className="check"><input type="checkbox" checked={cTaller} onChange={(e) => setCTaller(e.target.checked)} /> {textoTaller}</label>
      </fieldset>

      {error && <p className="aviso-error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={enviando || !elegido || !matricula.trim() || !nombre.trim() || !movil.trim()}>{enviando ? 'Reservando…' : 'Confirmar cita'}</button>
    </form>
  )
}
