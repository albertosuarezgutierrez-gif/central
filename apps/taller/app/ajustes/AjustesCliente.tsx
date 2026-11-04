'use client'
// Pantalla de Ajustes (rol dueño). Cada sección guarda por su cuenta vía server action; el servidor
// vuelve a validar TODO (validarConfig) y audita. Aquí solo se convierte lo tecleado a unidades.
import { useState, useTransition, type ReactNode } from 'react'
import {
  formatearEur, importeManoObraCent, TIPOS_LINEA,
  type Aceite, type ConfigTaller, type FranjaHorario, type IntervalosAvisos, type SeguridadLogin, type MedioCobro, type SerieFactura, type TipoIva,
  type TipoLinea, type TipoVehiculo,
} from '@central/module-taller'
import {
  codigoDesdeNombre, eurosACent, horasAMinutos, minutosAHoras, pbAPorcentaje, porcentajeAPb, type PaqueteEditable,
} from '@/lib/ajustes'
import { contraste, evaluarMarca, normalizarHex, textoSobre } from '@/lib/contraste'
import { DIRECCION_VACIA, type Direccion } from '@/lib/direccion'
import { coloresPorDefecto, fondosMarca } from '@/lib/marca'
import { DireccionCp } from '../_direccion/DireccionCp'
import {
  altaPersona, bajaPersona, guardarAjuste, guardarDatosTaller, guardarMarcaColores, guardarProveedorAccion, quitarLogo, resetPinPersona,
  subirLogo, type Respuesta,
} from './acciones'

export type DatosAjustes = {
  yoId: string
  config: ConfigTaller
  taller: {
    razonSocial: string
    nombreComercial: string
    nif: string | null
    direccion: { cp: string | null; provincia: string | null; municipio: string | null; via: string | null; numero: string | null }
  }
  marca: { primario: string | null; secundario: string | null; tieneLogo: boolean }
  personas: { id: string; nombre: string; rol: string; activo: boolean }[]
  proveedores: { id: string; nombre: string; correo: string | null; activo: boolean }[]
}

const TAM_PAGINA = 50
const NOMBRE_LINEA: Record<TipoLinea, string> = { mano_obra: 'Mano de obra', pieza: 'Piezas', granel: 'Aceite a granel', otro: 'Otros' }
const NOMBRE_ROL: Record<string, string> = { recepcion: 'Recepción', mecanico: 'Mecánico', dueno: 'Dueño', admin: 'Administración' }
const centAEuros = (c: number) => formatearEur(c).replace('€', '')

/** Pinta ~50 y «Ver más» (nunca cientos de filas de golpe). */
function ListaPerezosa<T>({ items, render, vacia }: { items: T[]; render: (x: T, i: number) => ReactNode; vacia: string }) {
  const [n, setN] = useState(TAM_PAGINA)
  if (items.length === 0) return <p className="tenue">{vacia}</p>
  return (
    <>
      <div className="lista">{items.slice(0, n).map(render)}</div>
      {items.length > n && (
        <button type="button" className="btn btn-sec" onClick={() => setN(n + TAM_PAGINA)}>
          Ver más ({items.length - n})
        </button>
      )}
    </>
  )
}

function useGuardar() {
  const [pendiente, arrancar] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const guardar = <T extends object>(fn: () => Promise<Respuesta<T>>, alOk?: (r: T) => void) =>
    arrancar(async () => {
      const r = await fn()
      if (r.ok) {
        setMsg({ ok: true, texto: 'Guardado' })
        alOk?.(r)
      } else setMsg({ ok: false, texto: r.errores.join(' · ') })
    })
  const aviso = msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.texto}</p>
  return { pendiente, guardar, aviso, setMsg }
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="seccion">
      <summary>{titulo}</summary>
      <div className="seccion-cuerpo">{children}</div>
    </details>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}

// ── Datos del taller ─────────────────────────────────────────────────────────
function DatosTaller({ t }: { t: DatosAjustes['taller'] }) {
  const [d, setD] = useState({ razonSocial: t.razonSocial, nombreComercial: t.nombreComercial, nif: t.nif ?? '' })
  const dir = t.direccion
  const [direccion, setDireccion] = useState<Direccion>({
    ...DIRECCION_VACIA, cp: dir.cp ?? '', provincia: dir.provincia ?? '', municipio: dir.municipio ?? '', via: dir.via ?? '', numero: dir.numero ?? '',
  })
  const g = useGuardar()
  return (
    <Seccion titulo="Datos del taller">
      <Campo etiqueta="Razón social"><input value={d.razonSocial} onChange={(e) => setD({ ...d, razonSocial: e.target.value })} /></Campo>
      <Campo etiqueta="Nombre comercial"><input value={d.nombreComercial} onChange={(e) => setD({ ...d, nombreComercial: e.target.value })} /></Campo>
      <Campo etiqueta="NIF"><input value={d.nif} placeholder="Sin NIF todavía" onChange={(e) => setD({ ...d, nif: e.target.value })} /></Campo>
      <DireccionCp valor={direccion} onChange={setDireccion} />
      <button type="button" className="btn" disabled={g.pendiente} onClick={() => g.guardar(() => guardarDatosTaller({ ...d, direccion }))}>Guardar datos</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Marca: logo y colores (el sello «con Grupo ASegura» es fijo y no aparece aquí) ──
function Marca({ m }: { m: DatosAjustes['marca'] }) {
  const def = coloresPorDefecto()
  const [prim, setPrim] = useState(m.primario ?? '')
  const [sec, setSec] = useState(m.secundario ?? '')
  const [avisos, setAvisos] = useState<string[]>([])
  const g = useGuardar()
  const pOk = prim.trim() === '' || normalizarHex(prim) !== null
  const sOk = sec.trim() === '' || normalizarHex(sec) !== null
  const p = normalizarHex(prim) ?? def.primario
  const s2 = normalizarHex(sec) ?? def.secundario
  // Vista previa en vivo del contraste (el servidor vuelve a calcularlo al guardar).
  const previo = evaluarMarca({ primario: p, secundario: s2 }, fondosMarca())
  return (
    <Seccion titulo="Marca: logo y colores">
      <p className="tenue">El texto «con Grupo ASegura» aparece siempre, pequeño, junto al logo: no se puede cambiar.</p>
      <form onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        g.guardar(() => subirLogo(fd))
      }}>
        <Campo etiqueta="Logo (PNG, JPG o WebP, máx. 1 MB)"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required /></Campo>
        <div className="fila">
          <button type="submit" className="btn" disabled={g.pendiente}>Subir logo</button>
          {m.tieneLogo && <button type="button" className="btn btn-sec" disabled={g.pendiente} onClick={() => g.guardar(() => quitarLogo())}>Volver al logo por defecto</button>}
        </div>
      </form>
      <Campo etiqueta={`Color principal (por defecto ${def.primario})`}>
        <input value={prim} placeholder={def.primario} onChange={(e) => setPrim(e.target.value)} aria-invalid={!pOk} />
      </Campo>
      <Campo etiqueta={`Color secundario (por defecto ${def.secundario})`}>
        <input value={sec} placeholder={def.secundario} onChange={(e) => setSec(e.target.value)} aria-invalid={!sOk} />
      </Campo>
      {(!pOk || !sOk) && <p className="error" role="alert">Usa 6 cifras hexadecimales, por ejemplo #3364ee.</p>}
      <div className="fila" aria-label="Vista previa">
        <span className="btn" style={{ background: p, borderColor: p, color: textoSobre(p) }}>Botón ({contraste(textoSobre(p), p).toFixed(1).replace('.', ',')}:1)</span>
        <span className="btn btn-sec" style={{ borderColor: s2, color: 'inherit' }}>Detalle secundario</span>
      </div>
      {[...previo.avisos, ...avisos.filter((a) => !previo.avisos.includes(a))].map((a) => <p key={a} className="aviso-error" role="status">Contraste: {a}</p>)}
      <div className="fila">
        <button type="button" className="btn" disabled={g.pendiente || !pOk || !sOk}
          onClick={() => g.guardar(() => guardarMarcaColores({ primario: prim.trim() || null, secundario: sec.trim() || null }), (r) => setAvisos(r.avisos))}>Guardar colores</button>
        <button type="button" className="btn btn-sec" disabled={g.pendiente}
          onClick={() => { setPrim(''); setSec(''); g.guardar(() => guardarMarcaColores({ primario: null, secundario: null }), (r) => setAvisos(r.avisos)) }}>Restablecer los de la marca</button>
      </div>
      {g.aviso}
    </Seccion>
  )
}

// ── Acceso: tope de login, duración de la sesión y cierre por inactividad ──
const CAMPOS_ACCESO: [keyof SeguridadLogin, string][] = [
  ['maxFallosTaller', 'Fallos de PIN que bloquean el taller (N)'],
  ['ventanaMinutos', 'Ventana donde se cuentan los fallos (minutos)'],
  ['bloqueoMinutos', 'Duración del bloqueo (minutos)'],
  ['sesionMinutos', 'Duración máxima de la sesión (minutos)'],
  ['inactividadMinutos', 'Cierre por inactividad (minutos)'],
]

function Acceso({ c }: { c: ConfigTaller }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(CAMPOS_ACCESO.map(([k]) => [k, String(c.seguridadLogin[k])])))
  const g = useGuardar()
  const guardar = () => {
    const seguridad = {} as SeguridadLogin
    for (const [k, et] of CAMPOS_ACCESO) {
      if (!/^[1-9]\d*$/.test(v[k].trim())) return g.setMsg({ ok: false, texto: `Valor no válido (entero mayor que 0): ${et}` })
      seguridad[k] = Number(v[k].trim())
    }
    g.guardar(() => guardarAjuste({ seccion: 'seguridad_login', seguridad }))
  }
  return (
    <Seccion titulo="Acceso: PIN, sesión e inactividad">
      {CAMPOS_ACCESO.map(([k, et]) => (
        <Campo key={k} etiqueta={et}><input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Campo>
      ))}
      <p className="tenue">Sesión de {minutosAHoras(Number(v.sesionMinutos) || 0)} h como máximo; se cierra sola tras {v.inactividadMinutos || 0} min sin usarla.
        Los cambios valen para las sesiones que se abran desde ahora.</p>
      <button type="button" className="btn" disabled={g.pendiente} onClick={guardar}>Guardar acceso</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Mano de obra e IVA ───────────────────────────────────────────────────────
function ManoObra({ c }: { c: ConfigTaller }) {
  const [texto, setTexto] = useState(centAEuros(c.precioHoraCent))
  const g = useGuardar()
  const cent = eurosACent(texto)
  return (
    <Seccion titulo={`Mano de obra · ${formatearEur(c.precioHoraCent)}/h`}>
      <Campo etiqueta="Precio hora (€, sin IVA)"><input inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
      <p className="tenue">{cent === null ? 'Importe no válido (ej.: 50,00)' : `Quedará en ${formatearEur(cent)}/h`}</p>
      <button type="button" className="btn" disabled={g.pendiente || cent === null}
        onClick={() => cent !== null && g.guardar(() => guardarAjuste({ seccion: 'mano_obra', precioHoraCent: cent }))}>
        Guardar precio hora
      </button>
      {g.aviso}
    </Seccion>
  )
}

function IvaDefecto({ c }: { c: ConfigTaller }) {
  const [m, setM] = useState<Record<TipoLinea, string>>({ ...c.ivaPorDefecto })
  const g = useGuardar()
  return (
    <Seccion titulo="IVA por defecto">
      {TIPOS_LINEA.map((t) => (
        <Campo key={t} etiqueta={NOMBRE_LINEA[t]}>
          <select value={m[t]} onChange={(e) => setM({ ...m, [t]: e.target.value })}>
            {c.ivas.map((i) => <option key={i.codigo} value={i.codigo}>{i.nombre} ({pbAPorcentaje(i.puntosBasicos)} %)</option>)}
          </select>
        </Campo>
      ))}
      <button type="button" className="btn" disabled={g.pendiente} onClick={() => g.guardar(() => guardarAjuste({ seccion: 'iva_defecto', ivaPorDefecto: m }))}>Guardar IVA</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Tipos de vehículo ────────────────────────────────────────────────────────
function TiposVehiculo({ c }: { c: ConfigTaller }) {
  const [tipos, setTipos] = useState(c.tiposVehiculo.map((t) => ({ ...t, recargo: pbAPorcentaje(t.recargoPuntosBasicos) })))
  const [nuevo, setNuevo] = useState('')
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<(typeof tipos)[number]>) => setTipos(tipos.map((t, j) => (j === i ? { ...t, ...p } : t)))
  const guardar = () => {
    const lista: TipoVehiculo[] = []
    for (const t of tipos) {
      const pb = porcentajeAPb(t.recargo)
      if (pb === null) return g.setMsg({ ok: false, texto: `Recargo no válido en «${t.nombre}»` })
      lista.push({ codigo: t.codigo, nombre: t.nombre, recargoPuntosBasicos: pb, activo: t.activo })
    }
    g.guardar(() => guardarAjuste({ seccion: 'tipos_vehiculo', tipos: lista }))
  }
  return (
    <Seccion titulo="Tipos de vehículo y recargos">
      <ListaPerezosa items={tipos} vacia="Sin tipos" render={(t, i) => (
        <div key={t.codigo} className="ficha">
          <Campo etiqueta="Nombre"><input value={t.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Recargo sobre mano de obra (%)"><input inputMode="decimal" value={t.recargo} onChange={(e) => cambiar(i, { recargo: e.target.value })} /></Campo>
          <label className="check"><input type="checkbox" checked={t.activo} onChange={(e) => cambiar(i, { activo: e.target.checked })} /> Activo</label>
        </div>
      )} />
      <div className="fila">
        <input placeholder="Nuevo tipo (ej.: Moto)" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <button type="button" className="btn btn-sec" disabled={!codigoDesdeNombre(nuevo)} onClick={() => {
          setTipos([...tipos, { codigo: codigoDesdeNombre(nuevo), nombre: nuevo.trim(), recargoPuntosBasicos: 0, recargo: '0', activo: true }])
          setNuevo('')
        }}>Añadir</button>
      </div>
      <button type="button" className="btn" disabled={g.pendiente} onClick={guardar}>Guardar tipos</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Paquetes ─────────────────────────────────────────────────────────────────
type PaqueteForm = { codigo: string; nombre: string; horas: string; requiereAceite: boolean; activo: boolean; precios: Record<string, string> }

function Paquetes({ c }: { c: ConfigTaller }) {
  const tiposActivos = c.tiposVehiculo.filter((t) => t.activo)
  const [ps, setPs] = useState<PaqueteForm[]>(c.paquetes.map((p) => ({
    codigo: p.codigo, nombre: p.nombre, horas: minutosAHoras(p.baremoMinutos), requiereAceite: p.requiereAceite, activo: p.activo,
    precios: Object.fromEntries(Object.entries(p.precioCerradoPorTipo).map(([k, v]) => [k, centAEuros(v)])),
  })))
  const [nuevo, setNuevo] = useState('')
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<PaqueteForm>) => setPs(ps.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const guardar = () => {
    const lista: PaqueteEditable[] = []
    for (const p of ps) {
      const min = horasAMinutos(p.horas)
      if (min === null) return g.setMsg({ ok: false, texto: `Horas no válidas en «${p.nombre}»` })
      const precioCerradoPorTipo: Record<string, number> = {}
      for (const [tipo, txt] of Object.entries(p.precios)) {
        if (!txt.trim()) continue // vacío = sin precio cerrado: baremo × precio hora × recargo
        const cent = eurosACent(txt)
        if (cent === null) return g.setMsg({ ok: false, texto: `Precio no válido en «${p.nombre}»` })
        precioCerradoPorTipo[tipo] = cent
      }
      lista.push({ codigo: p.codigo, nombre: p.nombre, baremoMinutos: min, requiereAceite: p.requiereAceite, activo: p.activo, precioCerradoPorTipo })
    }
    g.guardar(() => guardarAjuste({ seccion: 'paquetes', paquetes: lista }))
  }
  return (
    <Seccion titulo={`Paquetes (${ps.length})`}>
      <ListaPerezosa items={ps} vacia="Sin paquetes. Añade el primero (ej.: Cambio de aceite)." render={(p, i) => {
        const min = horasAMinutos(p.horas)
        return (
          <div key={p.codigo} className="ficha">
            <Campo etiqueta="Nombre"><input value={p.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Baremo (horas)"><input inputMode="decimal" value={p.horas} onChange={(e) => cambiar(i, { horas: e.target.value })} /></Campo>
            {tiposActivos.map((t) => (
              <Campo key={t.codigo} etiqueta={`Precio cerrado ${t.nombre} (€, vacío = ${min === null ? 'baremo' : formatearEur(importeManoObraCent(min, c.precioHoraCent, t.recargoPuntosBasicos))})`}>
                <input inputMode="decimal" value={p.precios[t.codigo] ?? ''} onChange={(e) => cambiar(i, { precios: { ...p.precios, [t.codigo]: e.target.value } })} />
              </Campo>
            ))}
            <label className="check"><input type="checkbox" checked={p.requiereAceite} onChange={(e) => cambiar(i, { requiereAceite: e.target.checked })} /> Lleva aceite</label>
            <label className="check"><input type="checkbox" checked={p.activo} onChange={(e) => cambiar(i, { activo: e.target.checked })} /> Activo</label>
          </div>
        )
      }} />
      <div className="fila">
        <input placeholder="Nuevo paquete" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <button type="button" className="btn btn-sec" disabled={!codigoDesdeNombre(nuevo) || ps.some((p) => p.codigo === codigoDesdeNombre(nuevo))} onClick={() => {
          setPs([...ps, { codigo: codigoDesdeNombre(nuevo), nombre: nuevo.trim(), horas: '', requiereAceite: false, activo: true, precios: {} }])
          setNuevo('')
        }}>Añadir</button>
      </div>
      <button type="button" className="btn" disabled={g.pendiente} onClick={guardar}>Guardar paquetes</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Aceites ──────────────────────────────────────────────────────────────────
function Aceites({ c }: { c: ConfigTaller }) {
  const [as, setAs] = useState(c.aceites.map((a) => ({ ...a, precio: centAEuros(a.precioLitroCent) })))
  const [nuevo, setNuevo] = useState('')
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<(typeof as)[number]>) => setAs(as.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const guardar = () => {
    const lista: Aceite[] = []
    for (const a of as) {
      const cent = eurosACent(a.precio)
      if (cent === null || cent === 0) return g.setMsg({ ok: false, texto: `Precio por litro no válido en «${a.nombre}»` })
      lista.push({ codigo: a.codigo, nombre: a.nombre, familia: a.familia, precioLitroCent: cent, activo: a.activo, ...(a.ivaCodigo ? { ivaCodigo: a.ivaCodigo } : {}) })
    }
    g.guardar(() => guardarAjuste({ seccion: 'aceites', aceites: lista }))
  }
  return (
    <Seccion titulo={`Aceites a granel (${as.length})`}>
      <ListaPerezosa items={as} vacia="Sin aceites. Añade el genérico y el específico." render={(a, i) => (
        <div key={a.codigo} className="ficha">
          <Campo etiqueta="Nombre"><input value={a.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Familia">
            <select value={a.familia} onChange={(e) => cambiar(i, { familia: e.target.value })}>
              <option value="generico">Genérico (gama amplia)</option>
              <option value="especifico">Específico</option>
            </select>
          </Campo>
          <Campo etiqueta="Precio por litro (€, sin IVA)"><input inputMode="decimal" value={a.precio} onChange={(e) => cambiar(i, { precio: e.target.value })} /></Campo>
          <label className="check"><input type="checkbox" checked={a.activo} onChange={(e) => cambiar(i, { activo: e.target.checked })} /> Activo</label>
        </div>
      )} />
      <div className="fila">
        <input placeholder="Nuevo aceite (ej.: 5W30 genérico)" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <button type="button" className="btn btn-sec" disabled={!codigoDesdeNombre(nuevo) || as.some((a) => a.codigo === codigoDesdeNombre(nuevo))} onClick={() => {
          setAs([...as, { codigo: codigoDesdeNombre(nuevo), nombre: nuevo.trim(), familia: 'generico', precioLitroCent: 0, precio: '', activo: true }])
          setNuevo('')
        }}>Añadir</button>
      </div>
      <button type="button" className="btn" disabled={g.pendiente} onClick={guardar}>Guardar aceites</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Medios de cobro ──────────────────────────────────────────────────────────
function MediosCobro({ c }: { c: ConfigTaller }) {
  const [ms, setMs] = useState<MedioCobro[]>(c.mediosCobro.map((m) => ({ ...m })))
  const [nuevo, setNuevo] = useState('')
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<MedioCobro>) => setMs(ms.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <Seccion titulo="Medios de cobro">
      <ListaPerezosa items={ms} vacia="Sin medios de cobro" render={(m, i) => (
        <div key={m.codigo} className="ficha">
          <Campo etiqueta="Nombre"><input value={m.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} /></Campo>
          <label className="check"><input type="checkbox" checked={m.esEfectivo} onChange={(e) => cambiar(i, { esEfectivo: e.target.checked })} /> Es efectivo (límite legal)</label>
          <label className="check"><input type="checkbox" checked={m.activo} onChange={(e) => cambiar(i, { activo: e.target.checked })} /> Activo</label>
        </div>
      )} />
      <div className="fila">
        <input placeholder="Nuevo medio" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <button type="button" className="btn btn-sec" disabled={!codigoDesdeNombre(nuevo) || ms.some((m) => m.codigo === codigoDesdeNombre(nuevo))} onClick={() => {
          setMs([...ms, { codigo: codigoDesdeNombre(nuevo), nombre: nuevo.trim(), esEfectivo: false, activo: true }])
          setNuevo('')
        }}>Añadir</button>
      </div>
      <button type="button" className="btn" disabled={g.pendiente} onClick={() => g.guardar(() => guardarAjuste({ seccion: 'medios_cobro', medios: ms }))}>Guardar medios</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Tipos de IVA ─────────────────────────────────────────────────────────────
function Ivas({ c }: { c: ConfigTaller }) {
  const [is, setIs] = useState(c.ivas.map((i) => ({ ...i, pct: pbAPorcentaje(i.puntosBasicos) })))
  const [nuevo, setNuevo] = useState('')
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<(typeof is)[number]>) => setIs(is.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const guardar = () => {
    const lista: TipoIva[] = []
    for (const i of is) {
      const pb = porcentajeAPb(i.pct)
      if (pb === null) return g.setMsg({ ok: false, texto: `Porcentaje no válido en «${i.nombre}»` })
      lista.push({ codigo: i.codigo, nombre: i.nombre, puntosBasicos: pb })
    }
    g.guardar(() => guardarAjuste({ seccion: 'ivas', ivas: lista }))
  }
  return (
    <Seccion titulo="Tipos de IVA">
      <ListaPerezosa items={is} vacia="Sin tipos de IVA" render={(x, i) => (
        <div key={x.codigo} className="ficha">
          <Campo etiqueta="Nombre"><input value={x.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Porcentaje (%)"><input inputMode="decimal" value={x.pct} onChange={(e) => cambiar(i, { pct: e.target.value })} /></Campo>
          <button type="button" className="btn btn-sec" onClick={() => setIs(is.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      )} />
      <div className="fila">
        <input placeholder="Nuevo tipo de IVA" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <button type="button" className="btn btn-sec" disabled={!codigoDesdeNombre(nuevo) || is.some((x) => x.codigo === codigoDesdeNombre(nuevo))} onClick={() => {
          setIs([...is, { codigo: codigoDesdeNombre(nuevo), nombre: nuevo.trim(), puntosBasicos: 0, pct: '' }])
          setNuevo('')
        }}>Añadir</button>
      </div>
      <p className="tenue">Un tipo en uso (IVA por defecto, aceites, piezas) no se puede quitar: cámbialo antes allí.</p>
      <button type="button" className="btn" disabled={g.pendiente} onClick={guardar}>Guardar tipos de IVA</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Series de factura ────────────────────────────────────────────────────────
function Series({ c }: { c: ConfigTaller }) {
  const [ss, setSs] = useState<SerieFactura[]>(c.series.map((x) => ({ ...x })))
  const [nuevo, setNuevo] = useState('')
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<SerieFactura>) => setSs(ss.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const cod = nuevo.trim().toUpperCase()
  return (
    <Seccion titulo="Series de factura">
      <p className="tenue">La numeración es correlativa y sin huecos dentro de cada serie; una serie con facturas no se borra.</p>
      <ListaPerezosa items={ss} vacia="Sin series" render={(x, i) => (
        <div key={x.codigo} className="ficha">
          <strong>Serie {x.codigo}</strong>
          <Campo etiqueta="Prefijo"><input value={x.prefijo} onChange={(e) => cambiar(i, { prefijo: e.target.value })} /></Campo>
          <Campo etiqueta="Descripción"><input value={x.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} /></Campo>
          <label className="check"><input type="checkbox" checked={x.rectificativa} onChange={(e) => cambiar(i, { rectificativa: e.target.checked })} /> Rectificativa</label>
          <label className="check"><input type="radio" name="serie-defecto" checked={x.porDefecto && !x.rectificativa}
            onChange={() => setSs(ss.map((y, j) => ({ ...y, porDefecto: j === i })))} /> Por defecto</label>
        </div>
      )} />
      <div className="fila">
        <input placeholder="Código de serie nueva (ej.: B)" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
        <button type="button" className="btn btn-sec" disabled={!cod || ss.some((x) => x.codigo === cod)} onClick={() => {
          setSs([...ss, { codigo: cod, prefijo: cod, descripcion: '', rectificativa: false, porDefecto: false }])
          setNuevo('')
        }}>Añadir</button>
      </div>
      <button type="button" className="btn" disabled={g.pendiente} onClick={() => g.guardar(() => guardarAjuste({ seccion: 'series', series: ss }))}>Guardar series</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Horario y huecos de cita ─────────────────────────────────────────────────
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function Horario({ c }: { c: ConfigTaller }) {
  const [fs, setFs] = useState<FranjaHorario[]>(c.horarioCitas.franjas.map((f) => ({ ...f })))
  const [hueco, setHueco] = useState(String(c.horarioCitas.duracionHuecoMinutos))
  const [puestos, setPuestos] = useState(String(c.horarioCitas.puestos))
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<FranjaHorario>) => setFs(fs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const guardar = () => {
    if (!/^\d+$/.test(hueco.trim()) || !/^\d+$/.test(puestos.trim())) return g.setMsg({ ok: false, texto: 'Hueco y puestos: números enteros' })
    g.guardar(() => guardarAjuste({ seccion: 'horario', franjas: fs, duracionHuecoMinutos: Number(hueco), puestos: Number(puestos) }))
  }
  return (
    <Seccion titulo={`Horario de citas (${fs.length} franjas)`}>
      {fs.length === 0 && <p className="tenue">Sin horario: no se ofrecen citas hasta que añadas franjas.</p>}
      <div className="lista">
        {fs.map((f, i) => (
          <div key={i} className="ficha">
            <Campo etiqueta="Día">
              <select value={f.diaSemana} onChange={(e) => cambiar(i, { diaSemana: Number(e.target.value) })}>
                {DIAS.map((d, n) => <option key={n} value={n}>{d}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Desde"><input type="time" value={f.desde} onChange={(e) => cambiar(i, { desde: e.target.value })} /></Campo>
            <Campo etiqueta="Hasta"><input type="time" value={f.hasta} onChange={(e) => cambiar(i, { hasta: e.target.value })} /></Campo>
            <button type="button" className="btn btn-sec" onClick={() => setFs(fs.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
      </div>
      {/* Sin valores inventados: la franja nueva copia la última (o queda vacía para que el dueño la rellene). */}
      <button type="button" className="btn btn-sec" onClick={() => setFs([...fs, fs.length ? { ...fs[fs.length - 1] } : { diaSemana: 1, desde: '', hasta: '' }])}>Añadir franja</button>
      <Campo etiqueta="Duración del hueco de cita (minutos)"><input inputMode="numeric" value={hueco} onChange={(e) => setHueco(e.target.value)} /></Campo>
      <Campo etiqueta="Puestos (coches a la vez)"><input inputMode="numeric" value={puestos} onChange={(e) => setPuestos(e.target.value)} /></Campo>
      <button type="button" className="btn" disabled={g.pendiente} onClick={guardar}>Guardar horario</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Textos y plantilla de presupuesto ────────────────────────────────────────
function Textos({ c }: { c: ConfigTaller }) {
  const [t, setT] = useState({
    pieResguardo: c.textos.pieResguardo, pieFactura: c.textos.pieFactura,
    condicionesPresupuesto: c.textos.condicionesPresupuesto, firmaCorreo: c.textos.firmaCorreo,
  })
  const [validez, setValidez] = useState(String(c.validezPresupuestoDias))
  const g = useGuardar()
  const area = (k: keyof typeof t, et: string) => (
    <Campo etiqueta={et}><textarea rows={4} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} /></Campo>
  )
  return (
    <Seccion titulo="Textos, correos y presupuestos">
      {area('firmaCorreo', 'Firma de los correos a clientes')}
      {area('pieResguardo', 'Pie del resguardo de depósito')}
      {area('condicionesPresupuesto', 'Condiciones del presupuesto (plantilla)')}
      {area('pieFactura', 'Pie de factura')}
      <Campo etiqueta="Validez del presupuesto (días)"><input inputMode="numeric" value={validez} onChange={(e) => setValidez(e.target.value)} /></Campo>
      <button type="button" className="btn" disabled={g.pendiente} onClick={() => {
        if (!/^\d+$/.test(validez.trim())) return g.setMsg({ ok: false, texto: 'Validez: número de días' })
        g.guardar(() => guardarAjuste({ seccion: 'textos', textos: t, validezPresupuestoDias: Number(validez) }))
      }}>Guardar textos</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Avisos ───────────────────────────────────────────────────────────────────
const CAMPOS_AVISO: [keyof IntervalosAvisos, string][] = [
  ['itvAntelacionDias', 'ITV: avisar con (días)'],
  ['revisionFechaAntelacionDias', 'Revisión por fecha: avisar con (días)'],
  ['revisionKmAntelacion', 'Revisión por km: avisar con (km)'],
  ['seguroAntelacionDias', 'Seguro: avisar con (días)'],
  ['recordatorioCitaHoras', 'Recordatorio de cita (horas antes)'],
]

function Avisos({ c }: { c: ConfigTaller }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(CAMPOS_AVISO.map(([k]) => [k, String(c.intervalosAvisos[k])])))
  const g = useGuardar()
  const guardar = () => {
    const intervalos = {} as IntervalosAvisos
    for (const [k, et] of CAMPOS_AVISO) {
      if (!/^\d+$/.test(v[k].trim())) return g.setMsg({ ok: false, texto: `Valor no válido: ${et}` })
      intervalos[k] = Number(v[k].trim())
    }
    g.guardar(() => guardarAjuste({ seccion: 'intervalos', intervalos }))
  }
  return (
    <Seccion titulo="Avisos">
      {CAMPOS_AVISO.map(([k, et]) => (
        <Campo key={k} etiqueta={et}><input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Campo>
      ))}
      <button type="button" className="btn" disabled={g.pendiente} onClick={guardar}>Guardar avisos</button>
      {g.aviso}
    </Seccion>
  )
}

// ── Personal ─────────────────────────────────────────────────────────────────
function Personal({ personas, yoId }: { personas: DatosAjustes['personas']; yoId: string }) {
  const [alta, setAlta] = useState({ nombre: '', rol: 'mecanico' })
  const [pinNuevo, setPinNuevo] = useState<{ nombre: string; pin: string } | null>(null)
  const g = useGuardar()
  return (
    <Seccion titulo={`Personal (${personas.filter((p) => p.activo).length} activos)`}>
      {pinNuevo && (
        <p className="ok" role="alert">PIN de {pinNuevo.nombre}: <strong className="pin-grande">{pinNuevo.pin}</strong> · apúntalo: no se vuelve a mostrar.</p>
      )}
      <ListaPerezosa items={personas} vacia="Sin personal" render={(p) => (
        <div key={p.id} className={`ficha${p.activo ? '' : ' inactiva'}`}>
          <strong>{p.nombre}{p.id === yoId ? ' (tú)' : ''}</strong>
          <span className="tenue">{NOMBRE_ROL[p.rol] ?? p.rol}{p.activo ? '' : ' · de baja'}</span>
          {p.activo && (
            <div className="fila">
              <button type="button" className="btn btn-sec" disabled={g.pendiente}
                onClick={() => g.guardar(() => resetPinPersona(p.id), (r) => setPinNuevo({ nombre: p.nombre, pin: r.pin }))}>Nuevo PIN</button>
              <button type="button" className="btn btn-sec" disabled={g.pendiente}
                onClick={() => confirm(`¿Dar de baja a ${p.nombre}?`) && g.guardar(() => bajaPersona(p.id))}>Dar de baja</button>
            </div>
          )}
        </div>
      )} />
      <div className="ficha">
        <Campo etiqueta="Nombre"><input value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Rol">
          <select value={alta.rol} onChange={(e) => setAlta({ ...alta, rol: e.target.value })}>
            {Object.entries(NOMBRE_ROL).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </Campo>
        <button type="button" className="btn" disabled={g.pendiente || !alta.nombre.trim()}
          onClick={() => g.guardar(() => altaPersona(alta), (r) => { setPinNuevo({ nombre: alta.nombre.trim(), pin: r.pin }); setAlta({ nombre: '', rol: 'mecanico' }) })}>
          Dar de alta (genera PIN)
        </button>
      </div>
      {g.aviso}
    </Seccion>
  )
}

// ── Proveedores ──────────────────────────────────────────────────────────────
function Proveedores({ proveedores }: { proveedores: DatosAjustes['proveedores'] }) {
  const [ps, setPs] = useState(proveedores.map((p) => ({ ...p, correo: p.correo ?? '' })))
  const [nuevo, setNuevo] = useState({ nombre: '', correo: '' })
  const g = useGuardar()
  const cambiar = (i: number, p: Partial<(typeof ps)[number]>) => setPs(ps.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <Seccion titulo={`Proveedores (${proveedores.filter((p) => p.activo).length})`}>
      <ListaPerezosa items={ps} vacia="Sin proveedores" render={(p, i) => (
        <div key={p.id} className={`ficha${p.activo ? '' : ' inactiva'}`}>
          <Campo etiqueta="Nombre"><input value={p.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Correo de pedidos"><input type="email" value={p.correo} placeholder="Sin correo todavía" onChange={(e) => cambiar(i, { correo: e.target.value })} /></Campo>
          <label className="check"><input type="checkbox" checked={p.activo} onChange={(e) => cambiar(i, { activo: e.target.checked })} /> Activo</label>
          <button type="button" className="btn btn-sec" disabled={g.pendiente}
            onClick={() => g.guardar(() => guardarProveedorAccion({ id: p.id, nombre: p.nombre, correo: p.correo, activo: p.activo }))}>Guardar</button>
        </div>
      )} />
      <div className="ficha">
        <Campo etiqueta="Nuevo proveedor"><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></Campo>
        <Campo etiqueta="Correo de pedidos"><input type="email" value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} /></Campo>
        <button type="button" className="btn" disabled={g.pendiente || !nuevo.nombre.trim()}
          onClick={() => g.guardar(() => guardarProveedorAccion(nuevo), () => setNuevo({ nombre: '', correo: '' }))}>Añadir proveedor</button>
      </div>
      {g.aviso}
    </Seccion>
  )
}

export function AjustesCliente({ datos }: { datos: DatosAjustes }) {
  const c = datos.config
  return (
    <div className="ajustes">
      <DatosTaller t={datos.taller} />
      <ManoObra c={c} />
      <TiposVehiculo c={c} />
      <Paquetes c={c} />
      <Aceites c={c} />
      <Ivas c={c} />
      <IvaDefecto c={c} />
      <Series c={c} />
      <MediosCobro c={c} />
      <Horario c={c} />
      <Avisos c={c} />
      <Textos c={c} />
      <Marca m={datos.marca} />
      <Acceso c={c} />
      <Personal personas={datos.personas} yoId={datos.yoId} />
      {/* key: remonta solo si cambia el conjunto (alta nueva), sin perder la edición en curso de los demás */}
      <Proveedores key={datos.proveedores.map((p) => p.id).join()} proveedores={datos.proveedores} />
    </div>
  )
}
