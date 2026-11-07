'use client'
import { useRef, useState, useTransition } from 'react'
import { DIRECCION_VACIA, type Direccion } from '@/lib/direccion'
import { DireccionCp } from '../_direccion/DireccionCp'
import { buscarMatriculaAccion, guardarRecepcion, type FichaMatricula } from './acciones'

// Posiciones guiadas de las fotos (spec 4.1). Son etiquetas de pantalla, no datos del taller.
const POSICIONES = ['Frontal', 'Trasera', 'Lateral izquierdo', 'Lateral derecho', 'Cuadro', 'Daños previos']
const NIVELES: [string, string][] = [['', 'Sin anotar'], ['vacio', 'Reserva'], ['1/4', '1/4'], ['1/2', '1/2'], ['3/4', '3/4'], ['lleno', 'Lleno']]

type Foto = { posicion: string; blob: Blob; url: string }

async function comprimir(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala)
  c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('foto'))), 'image/jpeg', 0.8))
}

export type InicialCita = { citaId: string; matricula: string; clienteId: string | null; nombre: string; movil: string; correo: string; motivo: string }

export function RecepcionCliente({ textoAsegura, textoTaller, inicial }: { textoAsegura: string; textoTaller: string; inicial?: InicialCita | null }) {
  const [matricula, setMatricula] = useState(inicial?.matricula ?? '')
  const [ficha, setFicha] = useState<FichaMatricula | null>(null)
  const [buscada, setBuscada] = useState(false)
  const [clienteId, setClienteId] = useState<string | null>(inicial?.clienteId ?? null)
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [movil, setMovil] = useState(inicial?.movil ?? '')
  const [correo, setCorreo] = useState(inicial?.correo ?? '')
  const [direccion, setDireccion] = useState<Direccion>({ ...DIRECCION_VACIA })
  const [km, setKm] = useState('')
  const [combustible, setCombustible] = useState('')
  const [objetos, setObjetos] = useState('')
  const [motivo, setMotivo] = useState(inicial?.motivo ?? '')
  const [danos, setDanos] = useState('')
  const [segVigente, setSegVigente] = useState<'' | 'si' | 'no'>('')
  const [segAseg, setSegAseg] = useState('')
  const [segVence, setSegVence] = useState('')
  // Las dos casillas nacen SIN MARCAR y el botón de guardar no depende de ellas.
  const [cAsegura, setCAsegura] = useState(false)
  const [cTaller, setCTaller] = useState(false)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [posNueva, setPosNueva] = useState(POSICIONES[0])
  const [errores, setErrores] = useState<string[]>([])
  const [hecho, setHecho] = useState<{ id: string; ot: number; firmada: boolean } | null>(null)
  const [pend, iniciar] = useTransition()
  const lienzo = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [firmado, setFirmado] = useState(false)

  function buscar() {
    setBuscada(false)
    iniciar(async () => {
      const r = await buscarMatriculaAccion(matricula)
      if (!r.ok) return setErrores(r.errores)
      setErrores([])
      setFicha(r.ficha)
      setBuscada(true)
      if (r.ficha?.cliente) {
        setClienteId(r.ficha.cliente.id)
        setNombre(r.ficha.cliente.nombre)
        setMovil(r.ficha.cliente.movil ?? '')
        setCorreo(r.ficha.cliente.correo ?? '')
        setDireccion(r.ficha.cliente.direccion)
      } else setClienteId(null)
      // El vencimiento del seguro que ya constaba se muestra y se puede corregir; si no consta, el campo queda vacío.
      setSegVence(r.ficha?.vehiculo.seguroHasta ?? '')
    })
  }

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height }
  }
  function trazo(e: React.PointerEvent<HTMLCanvasElement>, empieza: boolean) {
    const ctx = e.currentTarget.getContext('2d')!
    const p = punto(e)
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'
    if (empieza) { ctx.beginPath(); ctx.moveTo(p.x, p.y) } else { ctx.lineTo(p.x, p.y); ctx.stroke() }
  }
  function limpiarFirma() {
    const c = lienzo.current
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setFirmado(false)
  }

  async function anadirFotos(files: FileList | null) {
    if (!files) return
    const nuevas: Foto[] = []
    for (const f of Array.from(files)) {
      const blob = await comprimir(f)
      nuevas.push({ posicion: posNueva, blob, url: URL.createObjectURL(blob) })
    }
    setFotos((x) => [...x, ...nuevas].slice(0, 12))
  }

  function guardar() {
    setErrores([])
    iniciar(async () => {
      const fd = new FormData()
      fd.set('datos', JSON.stringify({
        matricula, clienteId, citaId: inicial?.citaId ?? null, nombre, movil, correo, direccion, km, combustible, objetos, motivo, danos,
        seguro: { vigente: segVigente, aseguradora: segAseg, vence: segVence },
        casillas: { asegura: cAsegura, taller: cTaller },
        fotoPosiciones: fotos.map((f) => f.posicion),
      }))
      fotos.forEach((f, i) => fd.set(`foto_${i}`, new File([f.blob], `foto-${i}.jpg`, { type: 'image/jpeg' })))
      if (firmado && lienzo.current) {
        const b = await new Promise<Blob | null>((ok) => lienzo.current!.toBlob(ok, 'image/png'))
        if (b) fd.set('firma', new File([b], 'firma.png', { type: 'image/png' }))
      }
      const r = await guardarRecepcion(fd)
      if (!r.ok) return setErrores(r.errores)
      setHecho({ id: r.recepcionId, ot: r.otNumero, firmada: r.firmada })
    })
  }

  if (hecho) {
    return (
      <section className="seccion"><div className="seccion-cuerpo" style={{ paddingTop: 16 }}>
        <p className="ok">Recepción guardada. Orden de trabajo nº {hecho.ot}.</p>
        {!hecho.firmada && <p className="aviso-error">Falta la firma del cliente: sin ella no se podrá presupuestar ni facturar.</p>}
        <a className="btn" href={`/recepcion/${hecho.id}/resguardo`}>Ver e imprimir el resguardo</a>
        <a className="btn btn-sec" href="/recepcion">Nueva recepción</a>
      </div></section>
    )
  }

  return (
    <form className="formulario" onSubmit={(e) => { e.preventDefault(); guardar() }}>
      <fieldset>
        <legend>Vehículo</legend>
        <div className="fila">
          <input aria-label="Matrícula" placeholder="Matrícula" value={matricula} autoCapitalize="characters"
            onChange={(e) => { setMatricula(e.target.value); setBuscada(false) }} maxLength={20} required />
          <button type="button" className="btn btn-sec" onClick={buscar} disabled={pend || !matricula.trim()}>Buscar</button>
        </div>
        {buscada && !ficha && <p className="tenue">Matrícula nueva: se dará de alta con esta recepción.</p>}
        {ficha && (
          <>
            <p className="ok">{[ficha.vehiculo.marca, ficha.vehiculo.modelo].filter(Boolean).join(' ') || 'Vehículo conocido'}
              {ficha.vehiculo.kmActuales != null ? ` · ${new Intl.NumberFormat('es-ES').format(ficha.vehiculo.kmActuales)} km` : ''}</p>
            {ficha.historial.length > 0 && (
              <ul className="lista-simple">
                {ficha.historial.map((h) => (
                  <li key={h.fecha}>{new Date(h.fecha).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}
                    <span className="tenue">{h.km != null ? ` · ${new Intl.NumberFormat('es-ES').format(h.km)} km` : ''}{h.motivo ? ` · ${h.motivo}` : ''}</span></li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="dos-col">
          <label className="campo">Kilómetros<input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} maxLength={9} /></label>
          <label className="campo">Combustible
            <select value={combustible} onChange={(e) => setCombustible(e.target.value)}>
              {NIVELES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Cliente</legend>
        <label className="campo">Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} required /></label>
        <div className="dos-col">
          <label className="campo">Móvil (obligatorio)<input type="tel" inputMode="tel" autoComplete="tel" value={movil} onChange={(e) => setMovil(e.target.value)} maxLength={30} required /></label>
          <label className="campo">Correo<input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={200} /></label>
        </div>
        {clienteId && !movil.trim() && <p className="aviso-error" role="alert">Este cliente no tiene móvil: pídeselo. El móvil es obligatorio para poder localizar al propietario.</p>}
        <p className="tenue">Dirección (opcional; si la rellenas, completa los cinco campos):</p>
        <DireccionCp valor={direccion} onChange={setDireccion} />
      </fieldset>

      <fieldset>
        <legend>Estado de entrada</legend>
        <label className="campo">Motivo de la visita<textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={2000} /></label>
        <label className="campo">Daños previos<textarea value={danos} onChange={(e) => setDanos(e.target.value)} maxLength={2000} /></label>
        <label className="campo">Objetos dejados en el vehículo<input value={objetos} onChange={(e) => setObjetos(e.target.value)} maxLength={1000} /></label>
        <div className="fila">
          <select aria-label="Posición de la foto" value={posNueva} onChange={(e) => setPosNueva(e.target.value)} style={{ minHeight: 44 }}>
            {POSICIONES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <label className="btn btn-sec">Hacer foto
            <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { void anadirFotos(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        {fotos.length > 0 && (
          <div className="fotos-mini">
            {fotos.map((f, i) => (
              <figure key={f.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.posicion} />
                {f.posicion}
                <button type="button" className="btn btn-sec" onClick={() => setFotos((x) => x.filter((_, j) => j !== i))}>Quitar</button>
              </figure>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Seguro del vehículo (opcional)</legend>
        <p className="tenue">El vencimiento queda en la ficha del vehículo para los avisos del taller. Solo llega a Grupo ASegura si el cliente marca su casilla.</p>
        <div className="dos-col">
          <label className="campo">¿Tiene seguro vigente?
            <select value={segVigente} onChange={(e) => setSegVigente(e.target.value as '' | 'si' | 'no')}>
              <option value="">Sin preguntar</option><option value="si">Sí</option><option value="no">No</option>
            </select>
          </label>
          <label className="campo">Aseguradora<input value={segAseg} onChange={(e) => setSegAseg(e.target.value)} maxLength={100} /></label>
          <label className="campo">Vencimiento del seguro<input type="date" value={segVence} onChange={(e) => setSegVence(e.target.value)} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Firma del cliente</legend>
        <canvas ref={lienzo} className="firma-lienzo" width={800} height={360} aria-label="Firma del cliente"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dibujando.current = true; trazo(e, true) }}
          onPointerMove={(e) => { if (dibujando.current) { trazo(e, false); setFirmado(true) } }}
          onPointerUp={() => { dibujando.current = false }} />
        <button type="button" className="btn btn-sec" onClick={limpiarFirma}>Borrar firma</button>
      </fieldset>

      <fieldset>
        <legend>Comunicaciones (opcional; el servicio no depende de marcarlas)</legend>
        <label className="casilla"><input type="checkbox" checked={cAsegura} onChange={(e) => setCAsegura(e.target.checked)} /><span>{textoAsegura}</span></label>
        <label className="casilla"><input type="checkbox" checked={cTaller} onChange={(e) => setCTaller(e.target.checked)} /><span>{textoTaller}</span></label>
      </fieldset>

      {errores.map((m) => <p key={m} className="aviso-error" role="alert">{m}</p>)}
      <button type="submit" className="btn" disabled={pend || !matricula.trim() || !nombre.trim() || !movil.trim()}>{pend ? 'Guardando…' : 'Guardar recepción'}</button>
    </form>
  )
}
