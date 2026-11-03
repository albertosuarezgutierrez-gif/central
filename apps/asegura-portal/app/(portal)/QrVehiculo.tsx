'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import QRCode from 'qrcode'

import {
  CLAVES_INTERRUPTORES,
  TEXTO_INTERRUPTOR,
  type InterruptoresPublicos,
} from '@central/module-seguros-portal'
import { MEDIADOR, hoyMadrid } from '@central/module-seguros'

import { MarcaAsegura } from '@/app/MarcaAsegura'
import type { EstadoQrVista } from '@/lib/vehiculo-qr'

/**
 * El QR de UN vehículo (27/10/2026, F1), común al particular (ficha de su póliza en `/boveda`) y a la empresa
 * (`/flota`). Spec `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §6.
 *
 * Todo lo que se decide (quién puede, qué sale en público) lo decide el servidor: aquí se pinta y se envía.
 *
 * 🚨 Tres cosas que la pantalla tiene que DECIR y no se pueden quitar:
 *  1. **El enlace se ve UNA vez.** En la BD vive su hash: si se cierra sin imprimir, hay que reimprimir.
 *  2. **Reimprimir anula la etiqueta pegada.** El papel que ya está en la guantera deja de valer; si no tienes
 *     acceso a ella (el coche lo lleva otro), díselo antes.
 *  3. **Qué ve quien escanea**, junto a cada casilla, con una vista previa: los interruptores son lo único que
 *     cambia lo público, y lo público nunca lleva tu nombre.
 */

export type OrigenVehiculo = { tipo: 'poliza'; polizaId: string } | { tipo: 'flota'; empresaId: string; polizaId: string }
export type AmbitoDefecto = { ambito: 'persona' } | { ambito: 'empresa'; empresaId: string }

export type { EstadoQrVista }

async function pedir(url: string, metodo: 'POST' | 'PUT' | 'DELETE', cuerpo?: unknown): Promise<{ ok: true; datos: Record<string, unknown> } | { ok: false; mensaje: string }> {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    const j = ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown>
    if (r.ok) return { ok: true, datos: j }
    if (r.status === 401) return { ok: false, mensaje: 'Se ha cerrado tu sesión. Vuelve a entrar.' }
    return { ok: false, mensaje: typeof j.mensaje === 'string' ? j.mensaje : 'No se ha podido hacer. Vuelve a intentarlo.' }
  } catch {
    return { ok: false, mensaje: 'No se ha podido hacer: comprueba tu conexión.' }
  }
}

/** Las etiquetas listas para imprimir. El botón marca SOLO este bloque para el papel (allow-list de `@media print`). */
export function EtiquetasImprimibles({ etiquetas }: { etiquetas: { clave: string; matricula: string; enlace: string }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const imprimir = () => {
    const el = ref.current
    if (!el) return
    el.setAttribute('data-imprimir-etiquetas', 'si')
    const quitar = () => {
      el.removeAttribute('data-imprimir-etiquetas')
      window.removeEventListener('afterprint', quitar)
    }
    window.addEventListener('afterprint', quitar)
    window.print()
  }
  return (
    <div ref={ref}>
      <div className="etiquetas-vehiculo">
        {etiquetas.map((e) => (
          <EtiquetaVehiculo key={e.clave} enlace={e.enlace} matricula={e.matricula} />
        ))}
      </div>
      <div className="acciones solo-pantalla" style={{ marginTop: 12 }}>
        <button type="button" className="boton auto" onClick={imprimir}>
          {etiquetas.length === 1 ? 'Imprimir la etiqueta' : `Imprimir las ${etiquetas.length} etiquetas`}
        </button>
      </div>
    </div>
  )
}

/** La etiqueta: el QR (lleva un ENLACE, no datos), la matrícula y la marca. Nada más va al papel. */
export function EtiquetaVehiculo({ enlace, matricula }: { enlace: string; matricula: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    // `Q` = 25 % de corrección: aguanta el sol y el roce de una guantera. `margin: 2` = zona de silencio.
    QRCode.toString(enlace, { type: 'svg', margin: 2, errorCorrectionLevel: 'Q' }).then(
      (s) => vivo && setSvg(s),
      () => vivo && setSvg(null),
    )
    return () => {
      vivo = false
    }
  }, [enlace])
  return (
    <div className="etiqueta-vehiculo">
      <div className="etiqueta-vehiculo-qr" aria-hidden dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
      <span className="etiqueta-vehiculo-matricula">{matricula}</span>
      <span className="etiqueta-vehiculo-marca">
        <MarcaAsegura alto={16} /> {MEDIADOR.marca} · escanea si hay un percance
      </span>
    </div>
  )
}

/** Lo que vería quien escanee con estos interruptores. Es una afirmación sobre `vistaPublicaVehiculo()`. */
function VistaPrevia({ v, deEmpresa }: { v: InterruptoresPublicos; deEmpresa: boolean }) {
  const partes: string[] = []
  if (v.datosCarretera) partes.push(deEmpresa ? 'matrícula, razón social de la sociedad, compañía, nº de póliza y teléfonos' : 'matrícula, compañía, nº de póliza y teléfonos')
  if (v.estadoAlDia) partes.push('si la ITV y el seguro están al día (sin fechas)')
  if (v.recordatoriosPendientes) partes.push('qué tipo de recordatorios tiene pendientes')
  return (
    <p className="suave" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
      <strong>Así lo ve quien escanee:</strong> {partes.length === 0 ? 'solo qué hacer en un accidente.' : `${partes.join('; ')}, y qué hacer en un accidente.`}{' '}
      {deEmpresa ? 'Nunca el nombre de ninguna persona.' : 'Nunca tu nombre.'}
    </p>
  )
}

export function Interruptores(props: {
  inicial: InterruptoresPublicos
  deEmpresa: boolean
  /** Guardar solo para este vehículo (`null` = este bloque es el del defecto). */
  urlVehiculo: string | null
  ambitoDefecto: AmbitoDefecto
  textoDefecto: string
  /** `true` = este vehículo tiene su propia configuración: cambiar el defecto no le afecta. */
  excepcion?: boolean
}) {
  const router = useRouter()
  const base = useId()
  const [v, setV] = useState<InterruptoresPublicos>(props.inicial)
  const [enCurso, setEnCurso] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  const guardar = async (donde: 'vehiculo' | 'defecto') => {
    setEnCurso(true)
    setMensaje(null)
    const r =
      donde === 'vehiculo' && props.urlVehiculo
        ? await pedir(props.urlVehiculo, 'PUT', v)
        : await pedir('/api/vehiculos/publico-defecto', 'PUT', { ...props.ambitoDefecto, valores: v })
    setEnCurso(false)
    setMensaje(r.ok ? { ok: true, texto: 'Guardado.' } : { ok: false, texto: r.mensaje })
    if (r.ok) router.refresh()
  }

  return (
    <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {CLAVES_INTERRUPTORES.map((k) => (
        <label key={k} htmlFor={`${base}-${k}`} className="qr-vehiculo-interruptor">
          <input id={`${base}-${k}`} type="checkbox" checked={v[k]} disabled={enCurso} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
          <span>{TEXTO_INTERRUPTOR[k]}</span>
        </label>
      ))}
      <VistaPrevia v={v} deEmpresa={props.deEmpresa} />
      {props.excepcion && (
        <p className="suave" style={{ margin: '4px 0 0', fontSize: 13 }}>
          Este vehículo tiene su propia configuración: cambiar la de todos no le afecta.
        </p>
      )}
      <div className="acciones" style={{ marginTop: 8 }}>
        {props.urlVehiculo && (
          <button type="button" className="boton auto" disabled={enCurso} onClick={() => void guardar('vehiculo')}>
            Guardar para este vehículo
          </button>
        )}
        <button type="button" className={props.urlVehiculo ? 'boton-tenue' : 'boton auto'} disabled={enCurso} onClick={() => void guardar('defecto')}>
          {props.textoDefecto}
        </button>
      </div>
      {mensaje && (
        <p role={mensaje.ok ? 'status' : 'alert'} className={mensaje.ok ? 'suave' : 'aviso-linea'} style={{ margin: 0 }}>
          {mensaje.texto}
        </p>
      )}
    </div>
  )
}

export function QrVehiculo(props: {
  origen: OrigenVehiculo
  estado: EstadoQrVista
  /** `true` = la póliza no trae matrícula: se pide antes de generar (no se inventa). */
  pideMatricula: boolean
  ambitoDefecto: AmbitoDefecto
}) {
  const router = useRouter()
  const idMat = useId()
  const idFecha = useId()
  const { estado } = props
  const deEmpresa = props.origen.tipo === 'flota'
  const [matricula, setMatricula] = useState('')
  const [fecha, setFecha] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nueva, setNueva] = useState<{ enlace: string; matricula: string } | null>(null)
  const [confirmarReimpresion, setConfirmarReimpresion] = useState(false)

  const crear = async () => {
    setEnCurso(true)
    setError(null)
    let bienId = estado.bienId
    if (bienId === null) {
      const cuerpo =
        props.origen.tipo === 'flota'
          ? { empresaId: props.origen.empresaId, polizaId: props.origen.polizaId }
          : { polizaId: props.origen.polizaId, matricula: props.pideMatricula ? matricula : undefined, fechaMatriculacion: fecha || undefined }
      const f = await pedir('/api/vehiculos/ficha', 'POST', cuerpo)
      if (!f.ok || typeof f.datos.bienId !== 'string') {
        setEnCurso(false)
        setError(f.ok ? 'No se ha podido preparar el vehículo.' : f.mensaje)
        return
      }
      bienId = f.datos.bienId
    }
    const q = await pedir(`/api/vehiculos/${encodeURIComponent(bienId)}/qr`, 'POST')
    setEnCurso(false)
    setConfirmarReimpresion(false)
    if (!q.ok || typeof q.datos.enlace !== 'string') {
      setError(q.ok ? 'No se ha podido crear la etiqueta.' : q.mensaje)
      return
    }
    setNueva({ enlace: q.datos.enlace, matricula: estado.matricula ?? matricula.toUpperCase().replace(/[^A-Z0-9]/g, '') })
    // Se refresca sin desmontar: la etiqueta recién creada sigue en pantalla para imprimirla.
    router.refresh()
  }

  const anular = async () => {
    if (!estado.bienId || !estado.qr) return
    setEnCurso(true)
    setError(null)
    const r = await pedir(`/api/vehiculos/${encodeURIComponent(estado.bienId)}/qr/${encodeURIComponent(estado.qr.id)}`, 'DELETE')
    setEnCurso(false)
    if (!r.ok) setError(r.mensaje)
    else {
      setNueva(null)
      router.refresh()
    }
  }

  const hoy = hoyMadrid()
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        Una pegatina con un QR para la guantera{deEmpresa ? '' : ' (o bajo el asiento de la moto)'}. Quien la escanee ve los teléfonos de
        asistencia y qué hacer en un accidente, sin tu nombre ni tus datos. El QR lleva un enlace: se mantiene al día solo.
      </p>

      {nueva && (
        <div className="confirmacion" role="status">
          <p className="confirmacion-titulo">Tu etiqueta está lista</p>
          {/* 🚨 Punto 1 de la cabecera. */}
          <p>
            Imprímela ahora. <strong>Este QR solo se ve esta vez</strong>: nosotros guardamos la etiqueta, no el enlace. Si lo pierdes,
            reimprime (y la anterior dejará de valer).
          </p>
          <EtiquetasImprimibles etiquetas={[{ clave: nueva.enlace, matricula: nueva.matricula, enlace: nueva.enlace }]} />
        </div>
      )}

      {estado.qr ? (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <span className="chip ok">Etiqueta activa</span>{' '}
            <span className="suave">
              {estado.qr.creadoEn ? `creada el ${estado.qr.creadoEn}` : ''}
              {estado.qr.ultimoUsoEn ? ` · escaneada por última vez el ${estado.qr.ultimoUsoEn}` : ' · nadie la ha escaneado todavía'}
            </span>
          </p>
          {confirmarReimpresion ? (
            <div className="aviso-linea" role="alert" style={{ margin: 0 }}>
              {/* 🚨 Punto 2 de la cabecera. */}
              <p style={{ margin: '0 0 8px' }}>
                Al reimprimir, <strong>la etiqueta pegada deja de valer</strong>: quien la escanee verá que no existe. Hazlo solo si vas a
                poder cambiarla en el vehículo.
              </p>
              <div className="acciones">
                <button type="button" className="boton auto" disabled={enCurso} onClick={() => void crear()}>
                  {enCurso ? 'Creando…' : 'Sí, reimprimir'}
                </button>
                <button type="button" className="boton-tenue" disabled={enCurso} onClick={() => setConfirmarReimpresion(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="acciones">
              <button type="button" className="boton-tenue" disabled={enCurso} onClick={() => setConfirmarReimpresion(true)}>
                Reimprimir
              </button>
              <button type="button" className="boton-tenue" disabled={enCurso} onClick={() => void anular()}>
                Anular la etiqueta
              </button>
            </div>
          )}
          <p className="suave" style={{ margin: 0, fontSize: 13 }}>
            Anular corta el acceso al momento, pero la pegatina sigue en el vehículo: quítala, o quien la escanee pensará que le falla el móvil.
          </p>
        </div>
      ) : (
        !nueva && (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {props.pideMatricula && estado.bienId === null && (
              <>
                <label htmlFor={idMat} style={{ fontSize: 14 }}>
                  Matrícula (tal y como aparece en el permiso de circulación)
                </label>
                <input id={idMat} className="campo" value={matricula} maxLength={12} autoCapitalize="characters" onChange={(e) => setMatricula(e.target.value)} disabled={enCurso} />
                <label htmlFor={idFecha} style={{ fontSize: 14 }}>
                  Fecha de primera matriculación (opcional, para saber cuándo le toca la ITV)
                </label>
                <input id={idFecha} className="campo" type="date" min="1950-01-01" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={enCurso} />
              </>
            )}
            <button
              type="button"
              className="boton auto"
              disabled={enCurso || (props.pideMatricula && estado.bienId === null && matricula.trim().length < 4)}
              onClick={() => void crear()}
            >
              {enCurso ? 'Creando…' : 'Crear la etiqueta QR'}
            </button>
          </div>
        )
      )}

      {error && (
        <p role="alert" className="aviso-linea" style={{ margin: 0 }}>
          {error}
        </p>
      )}

      {estado.bienId !== null && (
        <details>
          <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
            Qué ve quien escanee{estado.publico.excepcion ? ' (propio de este vehículo)' : ''}
          </summary>
          <Interruptores
            inicial={estado.publico.valores}
            deEmpresa={deEmpresa}
            urlVehiculo={`/api/vehiculos/${encodeURIComponent(estado.bienId)}/publico`}
            ambitoDefecto={props.ambitoDefecto}
            textoDefecto={deEmpresa ? 'Usar para todos los vehículos de la sociedad' : 'Usar para todos mis vehículos'}
            excepcion={estado.publico.excepcion}
          />
        </details>
      )}
    </div>
  )
}
