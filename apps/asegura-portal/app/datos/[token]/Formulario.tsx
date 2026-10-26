'use client'
import { useEffect, useRef, useState } from 'react'
import { viaSigueVigente } from '@central/core-catastro'
import { CLAVE_NO_LO_SE, ayudaDocumentosSolicitud, claveDireccion, type CampoSolicitud, type RamoSolicitud } from '@central/module-seguros'
import { esencialesPendientes, opcionesVisibles, textoTarjetaVivienda, visibleSegunCatastro } from '@/lib/datos-vista'
import type { ViviendaCatastroPublica } from '@/lib/vivienda-catastro'
import { DIRECCION_VACIA, DireccionCp, type ValorDireccion } from '@/app/(portal)/patrimonio/DireccionCp'
import { encogerSiHaceFalta } from '@/lib/encoger-imagen'
import { interpretarDocSubido } from '@/lib/solicitud-datos'

/** Una dirección del formulario: CP → provincia → municipio → calle (con `DireccionCp`) + número, planta y puerta aparte. */
type ValorDireccionDatos = ValorDireccion & { numero: string; planta: string; puerta: string }
const DIRECCION_DATOS_VACIA: ValorDireccionDatos = { ...DIRECCION_VACIA, numero: '', planta: '', puerta: '' }

/** De lo que hay en pantalla a las subclaves escalares que valida asegura (`claveDireccion`). */
function aplanarDireccion(clave: string, d: ValorDireccionDatos): Record<string, string> {
  const via = viaSigueVigente(d.direccion, d.viaOficial) ? d.viaOficial : null
  return {
    [claveDireccion(clave, 'Cp')]: d.cp,
    [claveDireccion(clave, 'Provincia')]: d.provincia,
    [claveDireccion(clave, 'Municipio')]: d.municipio,
    [claveDireccion(clave, 'Calle')]: d.direccion,
    [claveDireccion(clave, 'Numero')]: d.numero,
    [claveDireccion(clave, 'Planta')]: d.planta,
    [claveDireccion(clave, 'Puerta')]: d.puerta,
    [claveDireccion(clave, 'ViaTipo')]: via?.tipo ?? '',
    [claveDireccion(clave, 'ViaNombre')]: via?.nombre ?? '',
  }
}

type Estado = { tipo: 'editando' } | { tipo: 'enviando' } | { tipo: 'hecho' } | { tipo: 'fallo'; texto: string }
type Subida = { id: number; nombre: string; estado: 'subiendo' | 'ok' | 'fallo'; texto: string }

/** El formulario del enlace de datos. Pinta los campos que manda asegura y nada más. */
export default function Formulario({ token, campos, ramo, tercero = false }: { token: string; campos: CampoSolicitud[]; ramo: RamoSolicitud; tercero?: boolean }) {
  const [direcciones, setDirecciones] = useState<Record<string, ValorDireccionDatos>>({})
  const [consiente, setConsiente] = useState(false)
  const consienteRef = useRef(consiente)
  consienteRef.current = consiente
  // DNI y nacimiento llegan rellenos con lo de su ficha (`actual`): los confirma o los corrige.
  const [valores, setValores] = useState<Record<string, string | boolean>>(
    () => Object.fromEntries(campos.flatMap((c) => (c.actual ? [[c.clave, c.actual]] : []))),
  )
  const valoresRef = useRef(valores)
  valoresRef.current = valores
  const [errores, setErrores] = useState<Record<string, string>>({})
  // «No lo sé» (26/10/2026): se guarda como null en el servidor (nunca false ni 0) y la correduría lo pregunta en la llamada.
  const [noLoSe, setNoLoSe] = useState<Set<string>>(new Set())
  // Lo que el Catastro dice de la vivienda (hogar): se ENSEÑA en la tarjeta en vez de preguntarlo.
  // Ligado a la dirección consultada: si cambia, lo leído y lo confirmado de la anterior dejan de valer solos.
  const [lectura, setLectura] = useState<{ clave: string; v: ViviendaCatastroPublica } | null>(null)
  const [confirmadoPara, setConfirmadoPara] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado>({ tipo: 'editando' })
  const [subidas, setSubidas] = useState<Subida[]>([])
  const [leidos, setLeidos] = useState<Set<string>>(new Set())
  const siguienteId = useRef(0)
  const subiendo = subidas.some((x) => x.estado === 'subiendo')
  // Un tercero sin permiso marcado no puede subir nada: el servidor lo rechazaría igual.
  const sinPermiso = tercero && !consiente

  // Hogar: con la calle OFICIAL y el número, se pregunta al Catastro (con pausa, para no consultar en cada tecla).
  // Cambiar la dirección invalida lo que se confirmó de la anterior.
  const campoDir = campos.find((c) => c.tipo === 'direccion')
  const conTarjeta = campos.some((c) => c.catastro === 'tarjeta')
  const dir = campoDir ? direcciones[campoDir.clave] : undefined
  const via = dir && viaSigueVigente(dir.direccion, dir.viaOficial) ? dir.viaOficial : null
  const claveCatastro = conTarjeta && dir && via && dir.numero.trim()
    ? new URLSearchParams({ token, provincia: dir.provincia, municipio: dir.municipio, sigla: via.tipo, calle: via.nombre, numero: dir.numero, planta: dir.planta, puerta: dir.puerta, cp: dir.cp }).toString()
    : null
  useEffect(() => {
    if (!claveCatastro) return
    let vivo = true
    const t = setTimeout(() => {
      fetch(`/api/datos/vivienda?${claveCatastro}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: ViviendaCatastroPublica | null) => { if (vivo && j && (j.estado === 'ok' || j.estado === 'sin_datos')) setLectura({ clave: claveCatastro, v: j }) })
        .catch(() => {})
    }, 700)
    return () => { vivo = false; clearTimeout(t) }
  }, [claveCatastro])
  const catastro = lectura && lectura.clave === claveCatastro ? lectura.v : null
  const confirmacionVigente = claveCatastro !== null && confirmadoPara === claveCatastro && typeof valores.confirmaCatastro === 'boolean'

  if (estado.tipo === 'hecho') {
    return <p><strong>¡Gracias!</strong> Ya tenemos tus datos. Te escribimos en cuanto tengamos el precio.</p>
  }

  const poner = (clave: string, v: string | boolean) => setValores((p) => ({ ...p, [clave]: v }))
  const planta = dir?.planta ?? ''
  const contexto = {
    catastro,
    confirmado: confirmacionVigente ? (valores.confirmaCatastro as boolean) : null,
    tipoElegido: typeof valores.tipoVivienda === 'string' && valores.tipoVivienda !== '' ? valores.tipoVivienda : null,
  }
  const visible = (c: CampoSolicitud) => (!c.siMarcado || valores[c.siMarcado] === true) && visibleSegunCatastro(c, contexto, planta)
  const visibles = campos.filter(visible)
  const marcarNoLoSe = (clave: string, si: boolean) => {
    setNoLoSe((p) => { const n = new Set(p); if (si) n.add(clave); else n.delete(clave); return n })
    if (si) setValores((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== clave)))
  }

  /** Sube de uno en uno: si uno falla, los demás ya están dentro y se dice cuál. */
  async function subir(ficheros: File[]) {
    for (const original of ficheros) {
      const id = siguienteId.current++
      setSubidas((p) => [...p, { id, nombre: original.name, estado: 'subiendo', texto: 'Subiendo y leyendo…' }])
      const fijar = (cambio: Pick<Subida, 'estado' | 'texto'>) => setSubidas((p) => p.map((y) => (y.id === id ? { ...y, ...cambio } : y)))
      let status = 0
      let json: unknown = null
      try {
        const fichero = await encogerSiHaceFalta(original)
        const form = new FormData()
        form.set('token', token)
        form.set('documento', fichero, fichero.name)
        form.set('consentimiento', consienteRef.current ? '1' : '0')
        const res = await fetch('/api/datos/documento', { method: 'POST', body: form })
        status = res.status
        json = await res.json().catch(() => null)
      } catch {
        /* sin conexión */
      }
      const r = interpretarDocSubido(status, json)
      if (r.estado === 'fallo') {
        fijar({ estado: 'fallo', texto: r.texto })
        continue
      }
      // Solo rellena lo que está vacío: lo que el cliente ya escribió (o traía su ficha) manda.
      const actuales = valoresRef.current
      const claves = Object.keys(r.valores).filter((k) => actuales[k] === undefined || actuales[k] === '')
      const nuevos = Object.fromEntries(claves.map((k) => [k, r.valores[k]]))
      valoresRef.current = { ...actuales, ...nuevos }
      setValores((p) => ({ ...p, ...nuevos }))
      setLeidos((p) => new Set([...p, ...claves]))
      fijar({
        estado: 'ok',
        texto: r.aviso ?? `${r.etiqueta}: ${claves.length} dato${claves.length === 1 ? '' : 's'} rellenado${claves.length === 1 ? '' : 's'}. Revísalo abajo.`,
      })
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const pendientes = esencialesPendientes(visibles, valores, noLoSe)
    if (pendientes.length > 0) {
      setErrores(Object.fromEntries(pendientes.map((k) => [k, 'Contesta esto o marca «No lo sé».'])))
      return setEstado({ tipo: 'fallo', texto: 'Revisa los campos marcados.' })
    }
    setEstado({ tipo: 'enviando' })
    setErrores({})
    // Solo viaja lo que está a la vista: una respuesta de una pregunta que se ha ocultado (p. ej. tras confirmar el
    // Catastro) no se manda.
    const aLaVista = new Set(visibles.map((c) => c.clave))
    const enviados = Object.fromEntries(Object.entries(valores).filter(([k]) => aLaVista.has(k) && !noLoSe.has(k) && (k !== 'confirmaCatastro' || confirmacionVigente)))
    let status = 0
    let json: Record<string, unknown> | null = null
    try {
      const res = await fetch('/api/datos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          respuestas: {
            ...enviados,
            [CLAVE_NO_LO_SE]: [...noLoSe].filter((k) => aLaVista.has(k)),
            ...Object.assign({}, ...campos.filter((c) => c.tipo === 'direccion').map((c) => aplanarDireccion(c.clave, direcciones[c.clave] ?? DIRECCION_DATOS_VACIA))),
          },
          consentimiento: consiente,
        }),
      })
      status = res.status
      json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    } catch {
      /* sin conexión */
    }
    if (status === 200) return setEstado({ tipo: 'hecho' })
    if (status === 422 && json?.errores && typeof json.errores === 'object') {
      setErrores(json.errores as Record<string, string>)
      return setEstado({ tipo: 'fallo', texto: 'Revisa los campos marcados.' })
    }
    if (status === 410) return setEstado({ tipo: 'fallo', texto: 'Este enlace ya no sirve (caducado o ya usado). Escríbenos y te mandamos uno nuevo.' })
    if (status === 403 && typeof json?.mensaje === 'string') return setEstado({ tipo: 'fallo', texto: json.mensaje })
    if (status === 429) return setEstado({ tipo: 'fallo', texto: 'Demasiados intentos. Espera unos minutos.' })
    setEstado({ tipo: 'fallo', texto: 'No se ha podido enviar. Vuelve a probar en un momento.' })
  }

  const pintarCampo = (c: CampoSolicitud) => {
    const id = `c-${c.clave}`
    const err = errores[c.clave]
    const sabeQueNo = noLoSe.has(c.clave)
    // Hogar: «¿Es esta tu vivienda?» con lo que dice el Catastro. «Sí» = no se pregunta; «Corregir» = se pregunta.
    if (c.catastro === 'tarjeta') {
      const texto = textoTarjetaVivienda(catastro, planta)
      return (
        <div key={c.clave} className="datos-tarjeta" role="group" aria-labelledby={id}>
          <span id={id} className="datos-tarjeta-titulo">{c.etiqueta}</span>
          <span className="datos-tarjeta-dato">{texto}</span>
          <span className="editor-ayuda">Según el Catastro, con la dirección que has puesto.</span>
          <div className="datos-tarjeta-botones">
            <button type="button" className={contexto.confirmado === true ? 'boton' : 'boton-tenue'} aria-pressed={contexto.confirmado === true} onClick={() => { setConfirmadoPara(claveCatastro); poner(c.clave, true) }}>Sí, es correcta</button>
            <button type="button" className={contexto.confirmado === false ? 'boton' : 'boton-tenue'} aria-pressed={contexto.confirmado === false} onClick={() => { setConfirmadoPara(claveCatastro); poner(c.clave, false) }}>Corregir</button>
          </div>
          {err && <span className="editor-error" role="alert">{err}</span>}
        </div>
      )
    }
    if (c.tipo === 'direccion') {
      const d = direcciones[c.clave] ?? DIRECCION_DATOS_VACIA
      const fijar = (cambio: Partial<ValorDireccionDatos>) => setDirecciones((p) => ({ ...p, [c.clave]: { ...(p[c.clave] ?? DIRECCION_DATOS_VACIA), ...cambio } }))
      const erroresDir = (['Cp', 'Provincia', 'Municipio', 'Calle', 'Numero'] as const).map((sub) => errores[claveDireccion(c.clave, sub)]).filter(Boolean)
      const tk = encodeURIComponent(token)
      return (
        <fieldset key={c.clave} className="editor-campo" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>{c.etiqueta}</legend>
          {c.ayuda && <span className="editor-ayuda">{c.ayuda}</span>}
          <DireccionCp
            valor={d}
            onCambio={(v) => fijar(v)}
            disabled={estado.tipo === 'enviando'}
            rutas={{ cp: (cp) => `/api/datos/codigo-postal?token=${tk}&cp=${cp}`, vias: (q) => `/api/datos/vias?token=${tk}&${q}` }}
            calle={{ etiqueta: 'Calle', ejemplo: 'Calle San Vicente' }}
          />
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 96px), 1fr))', marginTop: 10 }}>
            {([['numero', 'Número', true], ['planta', 'Planta', false], ['puerta', 'Puerta', false]] as const).map(([k, rotulo, oblig]) => (
              <label key={k} style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
                <span>{rotulo}{!oblig && <span className="suave"> (opcional)</span>}</span>
                <input className="campo" maxLength={10} value={d[k]} placeholder={k === 'planta' ? '0 si es bajo' : undefined} disabled={estado.tipo === 'enviando'} onChange={(e) => fijar({ [k]: e.target.value })} />
              </label>
            ))}
          </div>
          {erroresDir.map((x, i) => <span key={i} className="editor-error" role="alert">{x}</span>)}
        </fieldset>
      )
    }
    return (
      <div key={c.clave} className="editor-campo">
        <label htmlFor={id}>
          {c.etiqueta}
          {!c.obligatorio && <span className="suave"> (opcional)</span>}
        </label>
        {c.tipo === 'opcion' && (
          <select id={id} className="campo" value={String(valores[c.clave] ?? '')} disabled={sabeQueNo} onChange={(e) => poner(c.clave, e.target.value)}>
            <option value="">Elige…</option>
            {opcionesVisibles(c, contexto)?.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
          </select>
        )}
        {c.tipo === 'si_no' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                className={valores[c.clave] === v ? 'boton' : 'boton-tenue'}
                style={{ minHeight: 44, minWidth: 88, width: 'auto' }}
                aria-pressed={valores[c.clave] === v}
                onClick={() => { marcarNoLoSe(c.clave, false); poner(c.clave, v) }}
              >
                {v ? 'Sí' : 'No'}
              </button>
            ))}
            {c.admiteNoLoSe && (
              <button type="button" className={sabeQueNo ? 'boton' : 'boton-tenue'} style={{ minHeight: 44, width: 'auto' }} aria-pressed={sabeQueNo} onClick={() => marcarNoLoSe(c.clave, !sabeQueNo)}>
                No lo sé
              </button>
            )}
          </div>
        )}
        {c.tipo === 'texto_largo' && (
          <textarea id={id} className="campo" rows={3} maxLength={1000} value={String(valores[c.clave] ?? '')} onChange={(e) => poner(c.clave, e.target.value)} />
        )}
        {(c.tipo === 'texto' || c.tipo === 'fecha' || c.tipo === 'numero') && (
          <input
            id={id}
            className="campo"
            type={c.tipo === 'fecha' ? 'date' : 'text'}
            inputMode={c.tipo === 'numero' ? 'numeric' : undefined}
            autoCapitalize={c.clave === 'matricula' || c.clave === 'dni' ? 'characters' : undefined}
            value={String(valores[c.clave] ?? '')}
            disabled={sabeQueNo}
            onChange={(e) => poner(c.clave, e.target.value)}
          />
        )}
        {c.admiteNoLoSe && c.tipo !== 'si_no' && (
          <label className="datos-nolose">
            <input type="checkbox" checked={sabeQueNo} onChange={(e) => marcarNoLoSe(c.clave, e.target.checked)} />
            <span>No lo sé</span>
          </label>
        )}
        {leidos.has(c.clave) && <span className="editor-ayuda">📄 Leído de tu documento: compruébalo.</span>}
        {c.actual && !leidos.has(c.clave) && <span className="editor-ayuda">Es el que tenemos en tu ficha: si no es correcto, cámbialo.</span>}
        {c.ayuda && <span className="editor-ayuda">{c.ayuda}</span>}
        {err && <span className="editor-error" role="alert">{err}</span>}
      </div>
    )
  }

  return (
    <form onSubmit={enviar} noValidate className="datos-form">
      {/* Arriba: antes de subir un documento o escribir datos de otra persona, su permiso. */}
      {tercero && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, fontSize: 15 }}>
          <input type="checkbox" checked={consiente} onChange={(e) => setConsiente(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2 }} />
          <span>Soy esa persona, o tengo su permiso para dar sus datos a Grupo ASegura para este presupuesto.</span>
        </label>
      )}
      {tercero && errores.consentimiento && <span className="editor-error" role="alert">{errores.consentimiento}</span>}
      {/* minWidth 0 + overflowWrap: sin ellos el <input type=file> nativo (botón + «Ningún archivo seleccionado»)
          dimensiona la caja con su ancho mínimo y el texto se sale en un móvil de 360 px. */}
      <div className="editor-campo datos-subida">
        <span className="datos-subida-titulo">📎 Súbenos tus documentos y te rellenamos el formulario</span>
        <span className="editor-ayuda">
          {ayudaDocumentosSolicitud(ramo)} Foto o PDF, uno o varios. Los guardamos para tu contratación.
        </span>
        {/* El input nativo se oculta (su rótulo lo pone el navegador y no se adapta); se pulsa por la etiqueta. */}
        <label htmlFor="docs" className="boton-tenue" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'start', cursor: subiendo ? 'wait' : sinPermiso ? 'not-allowed' : 'pointer', opacity: sinPermiso ? 0.5 : 1 }} aria-disabled={sinPermiso}>
          {sinPermiso ? 'Marca antes el permiso de arriba' : subiendo ? 'Leyendo…' : subidas.length > 0 ? '➕ Subir más' : '📷 Elegir fotos o PDF'}
        </label>
        <input
          id="docs"
          type="file"
          accept="image/*,application/pdf"
          multiple
          disabled={subiendo || sinPermiso || estado.tipo === 'enviando'}
          onChange={(e) => {
            const ficheros = Array.from(e.target.files ?? [])
            e.target.value = ''
            void subir(ficheros)
          }}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
        />
        {subidas.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
            {subidas.map((x) => (
              <li key={x.id} className={x.estado === 'fallo' ? 'editor-error' : undefined} style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                {x.estado === 'ok' ? '✅' : x.estado === 'fallo' ? '⚠️' : '⏳'} {x.nombre}: {x.texto}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(['esencial', 'opcional'] as const).map((nivel) => {
        const grupo = visibles.filter((c) => (c.nivel ?? (c.obligatorio ? 'esencial' : 'opcional')) === nivel)
        if (grupo.length === 0) return null
        return (
          <div key={nivel} className="datos-nivel">
            {nivel === 'opcional' && (
              <p className="datos-aviso-opcional">
                <strong>Con esto ya podemos calcular tu precio.</strong> Si quieres afinar más, contesta también esto (opcional).
              </p>
            )}
            {grupo.map((c, i) => (
              <div key={c.clave} className="datos-bloque">
                {c.seccion && c.seccion !== grupo[i - 1]?.seccion && nivel === 'esencial' && <h2 className="datos-seccion">{c.seccion}</h2>}
                {pintarCampo(c)}
              </div>
            ))}
          </div>
        )
      })}
      {estado.tipo === 'fallo' && <p className="editor-error" role="alert">{estado.texto}</p>}
      <p className="suave" style={{ margin: 0, fontSize: 13 }}>
        Usamos estos datos solo para prepararte el presupuesto (Grupo ASegura, correduría de seguros).
      </p>
      <button type="submit" className="boton" style={{ minHeight: 48 }} disabled={estado.tipo === 'enviando' || subiendo || sinPermiso}>
        {estado.tipo === 'enviando' ? 'Enviando…' : subiendo ? 'Leyendo los documentos…' : tercero ? 'Enviar los datos' : 'Enviar mis datos'}
      </button>
    </form>
  )
}
