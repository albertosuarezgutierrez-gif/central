'use client'

// «Datos de la vivienda» / «Capital» / «Datos del riesgo» de la oportunidad (30/09/2026): VER, EDITAR y CONFIRMAR lo
// que se sabe del riesgo sin salir de la pantalla, en los ramos que NO son de vehículo (ese es `DatosVehiculo`).
// Mismo patrón: se guarda en `info_riesgo.<clave>` de asegura (PATCH del riesgo) y la pantalla de pedir precio lo
// PRECARGA desde ahí; lo que se use al pedir precio se anota de vuelta.
//
//   hogar                     → datosVivienda    (los selectores usan los MISMOS catálogos de Codeoscopic que
//                                                 hogar-nuevo: `CATALOGO_HOGAR_DE_CAMPO`, sin listas propias)
//   vida · salud · decesos    → datosCapital
//   comercio                  → datosComercio    (los campos de CIMA + régimen del local; capitales y medidas en listas)
//   RC · comunidades · otros  → datosRiesgoLibre (se cotiza fuera: los datos son para el expediente)
//
// 🚨 Un campo sin dato se pinta «sin dato» (nunca «0» ni vacío); lo que falta para pedir precio se dice.

import { useEffect, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import {
  AVISO_COMERCIO, AVISO_RIESGO_LIBRE, BIENES_COMERCIO, CATALOGO_HOGAR_DE_CAMPO, COMPANIAS_COMERCIO, ESPEC_POR_COMPANIA, ETIQUETA_COMPANIA_COMERCIO, ESPEC_CAPITAL, ESPEC_COMERCIO, ESPEC_LIBRE, ESPEC_VIVIENDA,
  ETIQUETA_BIEN_COMERCIO, ETIQUETA_CAMPO_CAPITAL, ETIQUETA_CAMPO_COMERCIO, ETIQUETA_CAMPO_LIBRE, ETIQUETA_CAMPO_VIVIENDA, ETIQUETA_REGIMEN_LOCAL,
  MAX_CAPITALES_COMERCIO, MAX_MEDIDAS_COMERCIO, REGIMENES_LOCAL, camposCapitalDelRamo, soloLoQueCambia, textoFaltanCapital, textoFaltanComercio,
  textoFaltanVivienda,
  type AseguradoAdicional, type CampoCapital, type CompaniaComercio, type PorCompaniaComercio, type CampoFaltaComercio, type CampoVivienda, type CapitalComercio, type EspecCampo, type MedidaComercio, type RamoCapital,
} from '@central/module-seguros'
import type { Opcion } from '@/lib/auto-nuevo-asegura'
import { eur } from '@/lib/dinero'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'
import AseguradosAdicionales, { aseguradosDeRiesgo, aseguradosParaEnviar, type AseguradoForm } from '../../cliente/[id]/AseguradosAdicionales'
import { SelectorBuscable } from '../../SelectorBuscable'
import { avisoRamoSinTarifa, companiasDisponibles } from '@/lib/presupuestos-companias'
import BotonPedirPrecio from './BotonPedirPrecio'
import { motivoSinPrecioRamo, ramoVariante, rutaVariante, tomadorDelRiesgo } from './variante'
import { fechaEs, llamarDatosRiesgo, motivoDe } from './piezas-riesgo'
import {
  capitalesDeFilas, filaCapitalVacia, filaMedidaVacia, filasDeCapitales, filasDeMedidas, formDeCompanias, listaAMandar, medidasDeFilas, porCompaniaAMandar,
  type FilaCapital, type FilaMedida, type FormCompanias,
} from './piezas-comercio'
import type { Riesgo } from '@/lib/riesgo-asegura'

const campoCss: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44,
  background: 'var(--surface)', color: 'var(--text)', width: '100%',
}
const etiquetaCss: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const REJILLA: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }
const sinDato = <span style={{ color: 'var(--muted)', fontStyle: 'normal' }}>sin dato</span>

type Props = { riesgo: Riesgo; ocupado: boolean; onCambio: (texto: string) => void; onError: (texto: string) => void }
type Form = Record<string, string>

/** Los datos del bloque como texto de formulario: `null` → '' (nunca «null» ni «0»); sí/no → 'si' | 'no'. */
function aForm(spec: readonly EspecCampo[], datos: Record<string, unknown>): Form {
  const f: Form = {}
  for (const c of spec) {
    const v = datos[c.clave]
    f[c.clave] = typeof v === 'boolean' ? (v ? 'si' : 'no') : v === null || v === undefined ? '' : String(v)
  }
  return f
}

/** El formulario de vuelta a valores tipados, para compararlo con lo guardado y mandar SOLO lo que cambió. */
function deForm(spec: readonly EspecCampo[], form: Form): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const c of spec) {
    const v = form[c.clave] ?? ''
    o[c.clave] = c.tipo.t === 'bool' ? (v === 'si' ? true : v === 'no' ? false : null) : v
  }
  return o
}

/** El marco común: cabecera con el sello, aviso de lo que falta, botones. */
function Marco({ titulo, ayuda, confirmadoAt, dePoliza, aviso, nota, precio, editando, bloqueado, enviando, errorForm, onEditar, onConfirmar, onGuardar, onCancelar, lectura, formulario }: {
  titulo: string
  ayuda: string
  confirmadoAt: string | null
  dePoliza: boolean
  aviso: string | null
  nota?: string | null
  /** «Pedir precio →» del ramo (solo en lectura: mientras se edita no hay a dónde ir). */
  precio?: React.ReactNode
  editando: boolean
  bloqueado: boolean
  enviando: boolean
  errorForm: string | null
  onEditar: () => void
  onConfirmar: () => void
  onGuardar: (e: React.FormEvent) => void
  onCancelar: () => void
  lectura: React.ReactNode
  formulario: React.ReactNode
}) {
  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{ayuda}</div>
        </div>
        <Badge tono={confirmadoAt ? 'positivo' : 'aviso'}>
          {confirmadoAt ? `Confirmados el ${fechaEs(confirmadoAt)}` : dePoliza ? 'Precargados de la póliza · sin confirmar' : 'Sin confirmar'}
        </Badge>
      </div>
      {nota && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{nota}</div>}
      {aviso && <div style={{ fontSize: 13, color: 'var(--warning)' }} role="status">{aviso}</div>}
      {!editando ? (
        <>
          {lectura}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={bloqueado} onClick={onEditar} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Editar</button>
            {!confirmadoAt && (
              <button type="button" disabled={bloqueado} onClick={onConfirmar} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
                {enviando ? 'Confirmando…' : 'Confirmar datos'}
              </button>
            )}
          </div>
          {precio}
        </>
      ) : (
        <form onSubmit={onGuardar} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          {formulario}
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Un campo vacío se guarda como «sin dato».</div>
          {errorForm && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{errorForm}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" disabled={bloqueado} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>{enviando ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" disabled={bloqueado} onClick={onCancelar} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  )
}

/** Estado y acciones comunes: editar, guardar solo lo que cambió, confirmar. */
function useEdicion(clave: 'datosVivienda' | 'datosCapital' | 'datosComercio' | 'datosRiesgoLibre', { riesgo, ocupado, onCambio, onError }: Props, spec: readonly EspecCampo[], datos: Record<string, unknown>, nombre: string) {
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Form>(() => aForm(spec, datos))
  const [enviando, setEnviando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const bloqueado = enviando || ocupado

  async function guardar(cambios: Record<string, unknown>, confirmar: boolean) {
    setEnviando(true)
    setErrorForm(null)
    const r = await llamarDatosRiesgo({ oportunidadId: riesgo.oportunidad.id, [clave]: cambios, ...(confirmar ? { confirmar: true } : {}) })
    setEnviando(false)
    if (!r.ok) {
      const m = motivoDe(r)
      if (editando) setErrorForm(m)
      onError(`No se han guardado ${nombre}: ${m}`)
      return
    }
    setEditando(false)
    onCambio(confirmar ? `${nombre[0].toUpperCase()}${nombre.slice(1)} confirmados.` : `${nombre[0].toUpperCase()}${nombre.slice(1)} guardados. Quedan sin confirmar hasta que los confirmes.`)
  }
  const abrir = () => { setForm(aForm(spec, datos)); setErrorForm(null); setEditando(true) }
  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    // Solo lo que DIFIERE del estado inicial: no se copia una precarga sin tocar ni se pisan escrituras
    // concurrentes de campos que aquí no se editaron. Vacío = borrar ese dato.
    const cambios = soloLoQueCambia(datos, deForm(spec, form))
    if (Object.keys(cambios).length === 0) { setEditando(false); return }
    void guardar(cambios, false)
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return { editando, setEditando, form, setForm, enviando, errorForm, bloqueado, guardar, abrir, enviar, set }
}

const euros = (v: unknown) => (typeof v === 'number' ? eur(v) : null)

/** «Pedir precio →» de hogar/vida/salud/decesos: enlace a la pantalla de precio del ramo con la oportunidad (nunca cotiza). */
function PrecioDelBloque({ riesgo, ocupado }: { riesgo: Riesgo; ocupado: boolean }) {
  const op = riesgo.oportunidad
  const ramo = ramoVariante(op.ramo)
  const href = ramo ? rutaVariante(ramo, tomadorDelRiesgo(riesgo), op.id) : null
  return <BotonPedirPrecio href={href} motivo={motivoSinPrecioRamo({ ramoCotizable: ramo !== null, editando: false, ocupado })} />
}

// ─── Vivienda (hogar) ────────────────────────────────────────────────────────

const GRUPOS_VIVIENDA: Array<{ titulo: string; campos: CampoVivienda[] }> = [
  { titulo: 'Dónde está', campos: ['referenciaCatastral', 'direccion', 'tipoViaId', 'nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'cp', 'municipio', 'provincia'] },
  { titulo: 'Cómo es', campos: ['metrosCuadrados', 'anioConstruccion', 'anioUltimaReforma', 'habitaciones', 'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad'] },
  { titulo: 'Protecciones', campos: ['alarma', 'puertasSecundarias', 'puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada', 'vigilante'] },
  { titulo: 'Qué se asegura', campos: ['propietarioEsTomador', 'capitalContinente', 'capitalContenido', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos', 'asentamiento'] },
]
const CAMPOS_EUROS = new Set<string>(['capitalContinente', 'capitalContenido', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor'])

function DatosVivienda(props: Props & { d: Record<string, unknown>; faltan: string[]; dePoliza: boolean }) {
  const { d, faltan, dePoliza } = props
  const [catalogos, setCatalogos] = useState<Record<string, Opcion[] | 'error'>>({})
  const [municipios, setMunicipios] = useState<Opcion[] | null>(null)
  const [notaMunicipio, setNotaMunicipio] = useState<string | null>(null)
  const E = useEdicion('datosVivienda', props, ESPEC_VIVIENDA, d, 'los datos de la vivienda')

  // Los MISMOS catálogos de Codeoscopic que hogar-nuevo (gratis), una vez: sirven para el selector y para enseñar
  // el nombre en lugar del id. Uno que no se puede leer NO se degrada a lista vacía: se dice.
  useEffect(() => {
    let vivo = true
    const pedir = async (clave: string, params: Record<string, string>) => {
      try {
        const r = await pedirCatalogo(params)
        if (vivo) setCatalogos((c) => ({ ...c, [clave]: r.estado === 'ok' ? r.opciones : 'error' }))
      } catch {
        if (vivo) setCatalogos((c) => ({ ...c, [clave]: 'error' }))
      }
    }
    for (const [campo, nombre] of Object.entries(CATALOGO_HOGAR_DE_CAMPO)) void pedir(campo, { tipo: 'hogar', nombre })
    void pedir('tipoViaId', { tipo: 'vias' })
    return () => { vivo = false }
  }, [])

  const lista = (campo: string): Opcion[] | null => { const c = catalogos[campo]; return Array.isArray(c) ? c : null }
  const nombreOpcion = (campo: string, id: unknown) => (typeof id === 'string' ? lista(campo)?.find((o) => o.id === id)?.nombre ?? id : null)

  function valorLegible(k: CampoVivienda): React.ReactNode {
    const v = d[k]
    if (v === null || v === undefined) return sinDato
    if (typeof v === 'boolean') return v ? 'Sí' : 'No'
    if (CAMPOS_EUROS.has(k)) return euros(v) ?? sinDato
    if (k === 'metrosCuadrados') return `${(v as number).toLocaleString('es-ES')} m²`
    if (k in CATALOGO_HOGAR_DE_CAMPO || k === 'tipoViaId') return nombreOpcion(k, v)
    return String(v)
  }

  async function buscarMunicipios() {
    const cp = (E.form.cp ?? '').trim()
    setNotaMunicipio(null)
    if (!/^\d{5}$/.test(cp)) { setNotaMunicipio('Escribe un código postal de 5 cifras.'); return }
    try {
      const r = await pedirCatalogo({ tipo: 'municipios', cp })
      if (r.estado !== 'ok') { setNotaMunicipio('No se ha podido leer el catálogo de municipios ahora.'); return }
      setMunicipios(r.opciones)
      if (r.opciones.length === 0) setNotaMunicipio('Ese código postal no tiene municipios en el catálogo.')
      else if (r.opciones.length === 1) E.setForm((f) => ({ ...f, municipioId: r.opciones[0].id, municipio: r.opciones[0].nombre }))
    } catch {
      setNotaMunicipio('No se ha podido leer el catálogo de municipios ahora.')
    }
  }

  // El municipio del catálogo es de UN código postal: al cambiar el CP se suelta (y su lista de candidatos) para que no
  // quede un municipio de otra zona guardado junto al CP nuevo. Si se vuelve al CP guardado, se recupera.
  function alCambiarCp(e: React.ChangeEvent<HTMLInputElement>) {
    const cp = e.target.value
    const igualAlGuardado = cp.trim() === ((d.cp as string | null) ?? '')
    setMunicipios(null)
    setNotaMunicipio(igualAlGuardado ? null : 'Has cambiado el código postal: busca de nuevo el municipio.')
    E.setForm((f) => ({
      ...f, cp,
      municipioId: igualAlGuardado && d.municipioId != null ? String(d.municipioId) : '',
      municipio: igualAlGuardado ? ((d.municipio as string | null) ?? '') : '',
    }))
  }

  const aviso = textoFaltanVivienda(faltan as CampoVivienda[])

  return (
    <Marco
      titulo="Datos de la vivienda"
      ayuda="Lo que se sabe de la casa. Al pedir precio se precargan aquí y lo que se use se anota de vuelta."
      nota="Con la referencia catastral, la pantalla de precio lee dirección, m² y año del Catastro; aquí se cuentan igual mientras no estén anotados. Sin referencia, la pantalla de precio abre el buscador del Catastro con la calle, el número y el municipio de aquí."
      confirmadoAt={d.confirmadoAt as string | null} dePoliza={dePoliza}
      aviso={aviso}
      precio={<PrecioDelBloque riesgo={props.riesgo} ocupado={E.bloqueado} />}
      editando={E.editando} bloqueado={E.bloqueado} enviando={E.enviando} errorForm={E.errorForm}
      onEditar={E.abrir} onConfirmar={() => void E.guardar({}, true)} onGuardar={E.enviar} onCancelar={() => E.setEditando(false)}
      lectura={
        <div style={{ display: 'grid', gap: 12 }}>
          {GRUPOS_VIVIENDA.map((g) => (
            <div key={g.titulo} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{g.titulo}</div>
              <dl style={{ ...REJILLA, margin: 0 }}>
                {g.campos.map((k) => (
                  <div key={k} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{ETIQUETA_CAMPO_VIVIENDA[k]}</dt>
                    <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{valorLegible(k)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      }
      formulario={
        <div style={{ display: 'grid', gap: 14 }}>
          {GRUPOS_VIVIENDA.map((g) => (
            <div key={g.titulo} style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{g.titulo}</div>
              <div style={REJILLA}>
                {g.campos.map((k) => {
                  const c = ESPEC_VIVIENDA.find((x) => x.clave === k)!
                  const et = ETIQUETA_CAMPO_VIVIENDA[k]
                  if (c.tipo.t === 'bool') {
                    return (
                      <label key={k} style={etiquetaCss}>{et}
                        <select value={E.form[k] ?? ''} onChange={E.set(k)} style={campoCss}>
                          <option value="">Sin dato</option><option value="si">Sí</option><option value="no">No</option>
                        </select>
                      </label>
                    )
                  }
                  if (k in CATALOGO_HOGAR_DE_CAMPO || k === 'tipoViaId') {
                    const l = lista(k)
                    const actual = E.form[k] ?? ''
                    return (
                      <label key={k} style={etiquetaCss}>{et}
                        <select value={actual} onChange={E.set(k)} style={campoCss}>
                          <option value="">Sin dato</option>
                          {/* Un valor ya guardado que el catálogo no trae ahora se conserva: no se pierde en silencio. */}
                          {actual !== '' && !l?.some((o) => o.id === actual) && <option value={actual}>{actual}</option>}
                          {(l ?? []).map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                        </select>
                        {catalogos[k] === 'error' && <span style={{ fontSize: 11, color: 'var(--negative)', fontWeight: 400 }}>No se ha podido leer este catálogo ahora.</span>}
                      </label>
                    )
                  }
                  const numerico = c.tipo.t === 'entero' || c.tipo.t === 'numero'
                  return (
                    <label key={k} style={etiquetaCss}>{et}
                      <input value={E.form[k] ?? ''} onChange={k === 'cp' ? alCambiarCp : E.set(k)} inputMode={numerico ? 'decimal' : k === 'cp' ? 'numeric' : undefined}
                        maxLength={c.tipo.t === 'texto' ? c.tipo.max : k === 'referenciaCatastral' ? 24 : undefined} style={campoCss} />
                    </label>
                  )
                })}
                {g.titulo === 'Dónde está' && (
                  <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                    <button type="button" disabled={E.bloqueado} onClick={() => void buscarMunicipios()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                      Buscar municipio por código postal
                    </button>
                    {municipios && municipios.length > 1 && (
                      <select aria-label="Municipio del código postal" value={E.form.municipioId ?? ''} style={campoCss}
                        onChange={(e) => {
                          const o = municipios.find((m) => m.id === e.target.value)
                          E.setForm((f) => ({ ...f, municipioId: o?.id ?? '', municipio: o?.nombre ?? '' }))
                        }}>
                        <option value="">Elige el municipio</option>
                        {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {notaMunicipio ?? (E.form.municipioId ? `Municipio del catálogo elegido: ${E.form.municipio || E.form.municipioId}.` : 'Municipio del catálogo sin elegir.')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      }
    />
  )
}

// ─── Capital y persona (vida, salud, decesos) ────────────────────────────────

function DatosCapital(props: Props & { d: Record<string, unknown>; faltan: string[]; dePoliza: boolean }) {
  const { riesgo, d, faltan, dePoliza } = props
  const ramo = riesgo.oportunidad.ramo as RamoCapital
  const campos = camposCapitalDelRamo(ramo)
  const conAsegurados = (campos as readonly string[]).includes('asegurados')
  const spec = ESPEC_CAPITAL.filter((c) => (campos as readonly string[]).includes(c.clave))
  const E = useEdicion('datosCapital', props, spec, d, 'el capital')
  const guardados = d.asegurados as AseguradoAdicional[] | null
  const [aseg, setAseg] = useState<AseguradoForm[]>(() => aseguradosDeRiesgo(guardados))
  // Profesión (vida): catálogo CNO-11 de nivel 4 del vendor (gratis). Si no se puede leer, se teclea el código de 4 cifras.
  const [profesiones, setProfesiones] = useState<Opcion[] | 'error' | null>(null)
  useEffect(() => {
    if (ramo !== 'vida') return
    let vivo = true
    pedirCatalogo({ tipo: 'profesiones' })
      .then((r) => { if (vivo) setProfesiones(r.estado === 'ok' && r.opciones.length > 0 ? r.opciones : 'error') })
      .catch(() => { if (vivo) setProfesiones('error') })
    return () => { vivo = false }
  }, [ramo])
  const listaProfesiones = Array.isArray(profesiones) ? profesiones : null

  const abrir = () => { setAseg(aseguradosDeRiesgo(guardados)); E.abrir() }
  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    // Solo lo que DIFIERE de lo guardado, la lista incluida: sin tocarla no se reenvía (ni se pisa a otro que la editara).
    const cambios = soloLoQueCambia(d, deForm(spec, E.form))
    if (conAsegurados) {
      const nuevo = aseguradosParaEnviar(aseg)
      if (JSON.stringify(nuevo) !== JSON.stringify(aseguradosParaEnviar(aseguradosDeRiesgo(guardados)))) cambios.asegurados = nuevo
    }
    if (Object.keys(cambios).length === 0) { E.setEditando(false); return }
    void E.guardar(cambios, false)
  }

  const nombreProfesion = (v: unknown): string | null => (typeof v === 'string' ? listaProfesiones?.find((o) => o.id === v)?.nombre ?? null : null)
  const filaLectura = (k: CampoCapital): React.ReactNode => {
    const v = d[k]
    if (k === 'asegurados') {
      if (guardados === null) return sinDato
      if (guardados.length === 0) return 'Ninguno'
      // Sin DNI en pantalla de lectura: es un dato de otra persona y aquí no hace falta.
      return (
        <ul style={listaCss}>
          {guardados.map((a, i) => <li key={i} style={{ fontWeight: 600 }}>{`${a.nombre} ${a.apellido1}${a.apellido2 ? ` ${a.apellido2}` : ''} · ${fechaEs(a.fechaNacimiento) ?? a.fechaNacimiento} · ${a.sexo === 'mujer' ? 'mujer' : 'hombre'}`}</li>)}
        </ul>
      )
    }
    if (v === null || v === undefined) return sinDato
    if (k === 'capital') return euros(v) ?? sinDato
    if (k === 'fumador') return v === true ? 'Fuma' : v === false ? 'No fuma' : sinDato
    if (k === 'profesion') { const n = nombreProfesion(v); return n ? `${String(v)} · ${n}` : String(v) }
    return String(v)
  }
  const profesionActual = E.form.profesion ?? ''
  const opcionesProfesion: Opcion[] = listaProfesiones === null ? [] : profesionActual !== '' && !listaProfesiones.some((o) => o.id === profesionActual) ? [{ id: profesionActual, nombre: profesionActual }, ...listaProfesiones] : listaProfesiones
  const profesionMal = profesionActual.trim() !== '' && !/^\d{4}$/.test(profesionActual.trim())

  return (
    <Marco
      titulo={ramo === 'vida' ? 'Capital y asegurado' : 'Capital y asegurados'}
      ayuda={ramo === 'vida'
        ? 'Capital, profesión y si fuma: lo que viaja a la compañía en vida. Al pedir precio se precargan aquí y lo que se use se anota de vuelta.'
        : 'Lo que se sabe de lo que quiere el cliente y de quién más se asegura. Al pedir precio se precarga aquí y lo que se use se anota de vuelta.'}
      nota={ramo === 'vida' ? null : `En ${ramo} el capital es opcional: no viaja a la compañía, queda para el expediente.`}
      confirmadoAt={d.confirmadoAt as string | null} dePoliza={dePoliza}
      aviso={textoFaltanCapital(faltan as CampoCapital[])}
      precio={<PrecioDelBloque riesgo={riesgo} ocupado={E.bloqueado} />}
      editando={E.editando} bloqueado={E.bloqueado} enviando={E.enviando} errorForm={E.errorForm}
      onEditar={abrir} onConfirmar={() => void E.guardar({}, true)} onGuardar={enviar} onCancelar={() => E.setEditando(false)}
      lectura={
        <dl style={{ ...REJILLA, margin: 0 }}>
          {campos.map((k) => (
            <div key={k} style={{ display: 'grid', gap: 2, minWidth: 0, ...(k === 'asegurados' ? { gridColumn: '1 / -1' } : {}) }}>
              <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{ETIQUETA_CAMPO_CAPITAL[k]}</dt>
              <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{filaLectura(k)}</dd>
            </div>
          ))}
        </dl>
      }
      formulario={
        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          <div style={REJILLA}>
            {campos.filter((k) => k !== 'asegurados').map((k) => {
              if (k === 'fumador') {
                return (
                  <label key={k} style={etiquetaCss}>{ETIQUETA_CAMPO_CAPITAL[k]}
                    <select value={E.form[k] ?? ''} onChange={E.set(k)} style={campoCss}>
                      <option value="">Sin dato</option><option value="no">No fuma</option><option value="si">Fuma</option>
                    </select>
                  </label>
                )
              }
              if (k === 'profesion') {
                return (
                  <div key={k} style={etiquetaCss}>{ETIQUETA_CAMPO_CAPITAL[k]}
                    {listaProfesiones !== null ? (
                      <SelectorBuscable
                        valor={profesionActual}
                        onCambiar={(id) => E.setForm((f) => ({ ...f, profesion: id }))}
                        opciones={opcionesProfesion}
                        deshabilitado={E.bloqueado}
                        textoVacio="Sin dato"
                        nombre="profesión" plural="profesiones" marcador="p. ej. médico, camarero…" style={campoCss}
                      />
                    ) : (
                      <input value={profesionActual} onChange={E.set(k)} inputMode="numeric" maxLength={4} placeholder="2612" style={campoCss} />
                    )}
                    <span style={{ fontSize: 11, color: profesionMal ? 'var(--negative)' : 'var(--muted)', fontWeight: 400 }}>
                      {profesiones === null ? 'Cargando el catálogo de profesiones…'
                        : profesiones === 'error' ? 'No se ha podido leer el catálogo de profesiones: teclea el código CNO-11 de 4 cifras.'
                        : 'Del catálogo CNO-11 del vendor. Déjala en «Sin dato» si no se sabe: solo es obligatoria si la compañía la exige.'}
                      {profesionMal ? ' Son 4 cifras.' : ''}
                    </span>
                  </div>
                )
              }
              return (
                <label key={k} style={etiquetaCss}>{ETIQUETA_CAMPO_CAPITAL[k]}
                  <input value={E.form[k] ?? ''} onChange={E.set(k)} inputMode={k === 'modalidadDeseada' ? undefined : 'decimal'}
                    placeholder={k === 'capital' ? 'p. ej. 150.000' : undefined} maxLength={k === 'modalidadDeseada' ? 80 : undefined} style={campoCss} />
                </label>
              )
            })}
          </div>
          {conAsegurados && <AseguradosAdicionales lista={aseg} onChange={setAseg} deshabilitado={E.bloqueado} sinDni />}
        </div>
      }
    />
  )
}

// ─── Comercio ────────────────────────────────────────────────────────────────

const GRUPOS_COMERCIO: Array<{ titulo: string; campos: Array<(typeof ESPEC_COMERCIO)[number]['clave']> }> = [
  { titulo: 'Qué hace', campos: ['familiaActividad', 'actividad', 'numeroEmpleados', 'facturacionAnual', 'aforo'] },
  { titulo: 'Dónde está', campos: ['direccion', 'otrosDatosVia', 'cp', 'localidad', 'provincia', 'situacion'] },
  { titulo: 'Cómo es', campos: ['metrosCuadrados', 'superficieTotal', 'superficieExterior', 'regimenLocal', 'tipoEdificio', 'soloPlantaBaja', 'anioConstruccion', 'reformado', 'anioReforma', 'materiales', 'calidadConstruccion', 'conservacionBuena', 'instalacionElectricaRevisada', 'zona'] },
]
const M2_COMERCIO = new Set<string>(['metrosCuadrados', 'superficieTotal', 'superficieExterior'])
const EUROS_COMERCIO = new Set<string>(['facturacionAnual'])
const subtituloCss: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--muted)' }
const detallesCss: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px 12px' }
const resumenCss: React.CSSProperties = { cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700 }
/** Valor de una pregunta de compañía: `null` = «sin dato» (nunca No ni 0); € y m² por la etiqueta. */
function legiblePC(etiqueta: string, v: unknown): React.ReactNode {
  if (v === null || v === undefined) return sinDato
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return etiqueta.includes('(€)') ? eur(v) : etiqueta.includes('(m²)') ? `${v.toLocaleString('es-ES')} m²` : v.toLocaleString('es-ES')
  return String(v)
}
const listaCss: React.CSSProperties = { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }

function DatosComercio(props: Props & { d: Record<string, unknown>; faltan: string[]; dePoliza: boolean; tarifica: boolean }) {
  const { d, faltan, dePoliza, tarifica } = props
  const E = useEdicion('datosComercio', props, ESPEC_COMERCIO, d, 'los datos del comercio')
  const guardadosCap = d.capitales as CapitalComercio[] | null
  const guardadasMed = d.medidasProteccion as MedidaComercio[] | null
  const [caps, setCaps] = useState<FilaCapital[]>(() => filasDeCapitales(guardadosCap))
  const [meds, setMeds] = useState<FilaMedida[]>(() => filasDeMedidas(guardadasMed))
  const guardadoPC = d.porCompania as PorCompaniaComercio | null
  const [pc, setPc] = useState<FormCompanias>(() => formDeCompanias(guardadoPC))

  const abrir = () => { setCaps(filasDeCapitales(guardadosCap)); setMeds(filasDeMedidas(guardadasMed)); setPc(formDeCompanias(guardadoPC)); E.abrir() }
  const setPcCampo = (c: CompaniaComercio, k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setPc((f) => ({ ...f, [c]: { ...f[c], [k]: e.target.value } }))
  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    // Solo lo que DIFIERE de lo guardado, listas incluidas: una lista sin tocar no se reenvía.
    const cambios = soloLoQueCambia(d, deForm(ESPEC_COMERCIO, E.form))
    const c = listaAMandar(guardadosCap, capitalesDeFilas(caps))
    if (c !== undefined) cambios.capitales = c
    const m = listaAMandar(guardadasMed, medidasDeFilas(meds))
    if (m !== undefined) cambios.medidasProteccion = m
    const p = porCompaniaAMandar(guardadoPC, pc)
    if (p !== undefined) cambios.porCompania = p
    if (Object.keys(cambios).length === 0) { E.setEditando(false); return }
    void E.guardar(cambios, false)
  }
  const setCap = (i: number, k: keyof FilaCapital) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCaps((l) => l.map((f, j) => (j === i ? { ...f, [k]: e.target.value } : f)))
  const setMed = (i: number, k: keyof FilaMedida) => (e: React.ChangeEvent<HTMLInputElement>) => setMeds((l) => l.map((f, j) => (j === i ? { ...f, [k]: e.target.value } : f)))

  function valorLegible(k: (typeof ESPEC_COMERCIO)[number]['clave']): React.ReactNode {
    const v = d[k]
    if (v === null || v === undefined) return sinDato
    if (typeof v === 'boolean') return v ? 'Sí' : 'No'
    if (M2_COMERCIO.has(k) && typeof v === 'number') return `${v.toLocaleString('es-ES')} m²`
    if (EUROS_COMERCIO.has(k) && typeof v === 'number') return eur(v)
    if (k === 'regimenLocal') return ETIQUETA_REGIMEN_LOCAL[v as keyof typeof ETIQUETA_REGIMEN_LOCAL] ?? String(v)
    return String(v)
  }

  return (
    <Marco
      titulo="Datos del comercio"
      ayuda="Lo que manda la compañía por CIMA (actividad, situación, superficie, capitales, protección) y si el local es tuyo o alquilado."
      nota={AVISO_COMERCIO}
      confirmadoAt={d.confirmadoAt as string | null} dePoliza={dePoliza}
      aviso={textoFaltanComercio(faltan as CampoFaltaComercio[], { hayRutaTarifa: tarifica })}
      editando={E.editando} bloqueado={E.bloqueado} enviando={E.enviando} errorForm={E.errorForm}
      onEditar={abrir} onConfirmar={() => void E.guardar({}, true)} onGuardar={enviar} onCancelar={() => E.setEditando(false)}
      lectura={
        <div style={{ display: 'grid', gap: 12 }}>
          {GRUPOS_COMERCIO.map((g) => (
            <div key={g.titulo} style={{ display: 'grid', gap: 6 }}>
              <div style={subtituloCss}>{g.titulo}</div>
              <dl style={{ ...REJILLA, margin: 0 }}>
                {g.campos.map((k) => (
                  <div key={k} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{ETIQUETA_CAMPO_COMERCIO[k]}</dt>
                    <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{valorLegible(k)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={subtituloCss}>{ETIQUETA_CAMPO_COMERCIO.capitales}</div>
            {guardadosCap === null ? sinDato : guardadosCap.length === 0 ? <span style={{ color: 'var(--muted)' }}>Revisado: sin capitales</span> : (
              <ul style={listaCss}>
                {guardadosCap.map((c, i) => (
                  <li key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontWeight: 600, overflowWrap: 'anywhere' }}>
                    <span>{ETIQUETA_BIEN_COMERCIO[c.bien]}{c.descripcion ? ` · ${c.descripcion}` : ''}</span>
                    <span>{eur(c.importe)}</span>
                    {c.modalidad && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>valoración {c.modalidad}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={subtituloCss}>{ETIQUETA_CAMPO_COMERCIO.medidasProteccion}</div>
            {guardadasMed === null ? sinDato : guardadasMed.length === 0 ? <span style={{ color: 'var(--muted)' }}>Revisado: sin medidas</span> : (
              <ul style={listaCss}>
                {guardadasMed.map((m, i) => (
                  <li key={i} style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {m.medida}{m.valor ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {m.valor}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {COMPANIAS_COMERCIO.map((c) => (
            <details key={c} style={detallesCss}>
              <summary style={resumenCss}>Preguntas de {ETIQUETA_COMPANIA_COMERCIO[c]}{guardadoPC?.[c] ? '' : ' (sin dato)'}</summary>
              <dl style={{ ...REJILLA, margin: '8px 0 0' }}>
                {ESPEC_POR_COMPANIA[c].map((e) => {
                  const v = (guardadoPC?.[c] as Record<string, unknown> | undefined)?.[e.clave]
                  return (
                    <div key={e.clave} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                      <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{e.etiqueta}</dt>
                      <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{legiblePC(e.etiqueta, v)}</dd>
                    </div>
                  )
                })}
              </dl>
            </details>
          ))}
        </div>
      }
      formulario={
        <div style={{ display: 'grid', gap: 14 }}>
          {GRUPOS_COMERCIO.map((g) => (
            <div key={g.titulo} style={{ display: 'grid', gap: 8 }}>
              <div style={subtituloCss}>{g.titulo}</div>
              <div style={REJILLA}>
                {g.campos.map((k) => {
                  const c = ESPEC_COMERCIO.find((x) => x.clave === k)!
                  if (k === 'regimenLocal') {
                    return (
                      <label key={k} style={etiquetaCss}>{ETIQUETA_CAMPO_COMERCIO[k]}
                        <select value={E.form[k] ?? ''} onChange={E.set(k)} style={campoCss}>
                          <option value="">Sin dato</option>
                          {REGIMENES_LOCAL.map((r) => <option key={r} value={r}>{ETIQUETA_REGIMEN_LOCAL[r]}</option>)}
                        </select>
                      </label>
                    )
                  }
                  if (c.tipo.t === 'bool') {
                    return (
                      <label key={k} style={etiquetaCss}>{ETIQUETA_CAMPO_COMERCIO[k]}
                        <select value={E.form[k] ?? ''} onChange={E.set(k)} style={campoCss}>
                          <option value="">Sin dato</option><option value="si">Sí</option><option value="no">No</option>
                        </select>
                      </label>
                    )
                  }
                  const numerico = c.tipo.t === 'entero' || c.tipo.t === 'numero'
                  return (
                    <label key={k} style={etiquetaCss}>{ETIQUETA_CAMPO_COMERCIO[k]}
                      <input value={E.form[k] ?? ''} onChange={E.set(k)} inputMode={numerico ? 'decimal' : k === 'cp' ? 'numeric' : undefined}
                        maxLength={c.tipo.t === 'texto' ? c.tipo.max : undefined} style={campoCss} />
                    </label>
                  )
                })}
              </div>
            </div>
          ))}

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={subtituloCss}>{ETIQUETA_CAMPO_COMERCIO.capitales}</div>
            {caps.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sin filas se guarda como «sin dato».</span>}
            {caps.map((f, i) => (
              <div key={i} style={{ ...REJILLA, padding: 10, border: '1px solid var(--border)', borderRadius: 8, alignItems: 'end' }}>
                <label style={etiquetaCss}>De qué es
                  <select value={f.bien} onChange={setCap(i, 'bien')} style={campoCss}>
                    <option value="">Elige…</option>
                    {BIENES_COMERCIO.map((b) => <option key={b} value={b}>{ETIQUETA_BIEN_COMERCIO[b]}</option>)}
                  </select>
                </label>
                <label style={etiquetaCss}>Importe (€)
                  <input inputMode="decimal" value={f.importe} onChange={setCap(i, 'importe')} placeholder="p. ej. 20.000" style={campoCss} />
                </label>
                <label style={etiquetaCss}>Valoración (opcional)
                  <input value={f.modalidad} onChange={setCap(i, 'modalidad')} maxLength={40} placeholder="p. ej. VP" style={campoCss} />
                </label>
                <label style={etiquetaCss}>Descripción{f.bien === 'OTROS' ? ' (obligatoria)' : ''}
                  <input value={f.descripcion} onChange={setCap(i, 'descripcion')} maxLength={120} style={campoCss} />
                </label>
                <button type="button" disabled={E.bloqueado} onClick={() => setCaps((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar el capital ${i + 1}`}
                  style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Quitar</button>
              </div>
            ))}
            <div>
              <button type="button" disabled={E.bloqueado || caps.length >= MAX_CAPITALES_COMERCIO} onClick={() => setCaps((l) => [...l, filaCapitalVacia()])}
                style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Añadir capital</button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={subtituloCss}>{ETIQUETA_CAMPO_COMERCIO.medidasProteccion}</div>
            {meds.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sin filas se guarda como «sin dato».</span>}
            {meds.map((f, i) => (
              <div key={i} style={{ ...REJILLA, padding: 10, border: '1px solid var(--border)', borderRadius: 8, alignItems: 'end' }}>
                <label style={etiquetaCss}>Medida
                  <input value={f.medida} onChange={setMed(i, 'medida')} maxLength={120} placeholder="p. ej. Alarma conectada" style={campoCss} />
                </label>
                <label style={etiquetaCss}>Valor (opcional)
                  <input value={f.valor} onChange={setMed(i, 'valor')} maxLength={80} style={campoCss} />
                </label>
                <button type="button" disabled={E.bloqueado} onClick={() => setMeds((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar la medida ${i + 1}`}
                  style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Quitar</button>
              </div>
            ))}
            <div>
              <button type="button" disabled={E.bloqueado || meds.length >= MAX_MEDIDAS_COMERCIO} onClick={() => setMeds((l) => [...l, filaMedidaVacia()])}
                style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Añadir medida</button>
            </div>
          </div>

          {COMPANIAS_COMERCIO.map((c) => (
            <details key={c} style={detallesCss}>
              <summary style={resumenCss}>Preguntas de {ETIQUETA_COMPANIA_COMERCIO[c]} (solo si se cotiza con ella)</summary>
              <div style={{ ...REJILLA, marginTop: 8 }}>
                {ESPEC_POR_COMPANIA[c].map((e) => {
                  if (e.tipo.t === 'bool') {
                    return (
                      <label key={e.clave} style={etiquetaCss}>{e.etiqueta}
                        <select value={pc[c][e.clave] ?? ''} onChange={setPcCampo(c, e.clave)} style={campoCss}>
                          <option value="">Sin dato</option><option value="si">Sí</option><option value="no">No</option>
                        </select>
                      </label>
                    )
                  }
                  const numerico = e.tipo.t === 'entero' || e.tipo.t === 'numero'
                  return (
                    <label key={e.clave} style={etiquetaCss}>{e.etiqueta}
                      <input value={pc[c][e.clave] ?? ''} onChange={setPcCampo(c, e.clave)} inputMode={numerico ? 'decimal' : undefined}
                        maxLength={e.tipo.t === 'texto' ? e.tipo.max : undefined} style={campoCss} />
                    </label>
                  )
                })}
              </div>
            </details>
          ))}
        </div>
      }
    />
  )
}

// ─── Riesgo libre (RC, comunidades, otros) ─────────────────────────

function DatosLibre(props: Props & { d: Record<string, unknown>; dePoliza: boolean }) {
  const { d, dePoliza } = props
  const E = useEdicion('datosRiesgoLibre', props, ESPEC_LIBRE, d, 'los datos del riesgo')
  const claves = ['descripcion', 'direccion', 'capital', 'notas'] as const
  const ramo = props.riesgo.oportunidad.ramo
  // Comunidades se cotiza con los bots de compañía (formulario de la propia oportunidad, `#presupuestos`): ahí lleva el
  // botón, no a otra ruta. Los ramos sin ningún bot siguen siendo «se cotiza fuera».
  const hayBots = companiasDisponibles(ramo).length > 0
  return (
    <Marco
      titulo="Datos del riesgo"
      ayuda="Lo que se asegura, dónde y por cuánto."
      nota={avisoRamoSinTarifa(ramo, AVISO_RIESGO_LIBRE)}
      confirmadoAt={d.confirmadoAt as string | null} dePoliza={dePoliza}
      aviso={null}
      precio={hayBots ? <BotonPedirPrecio ancla="#presupuestos" motivo={motivoSinPrecioRamo({ ramoCotizable: true, editando: false, ocupado: E.bloqueado })}
        nota="Abre el formulario de presupuestos de compañías de más abajo, ya sembrado con el capital y la dirección de aquí; allí eliges compañías y lo pides." /> : undefined}
      editando={E.editando} bloqueado={E.bloqueado} enviando={E.enviando} errorForm={E.errorForm}
      onEditar={E.abrir} onConfirmar={() => void E.guardar({}, true)} onGuardar={E.enviar} onCancelar={() => E.setEditando(false)}
      lectura={
        <dl style={{ ...REJILLA, margin: 0 }}>
          {claves.map((k) => {
            const v = d[k]
            return (
              <div key={k} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{ETIQUETA_CAMPO_LIBRE[k]}</dt>
                <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere', whiteSpace: k === 'notas' ? 'pre-wrap' : undefined }}>
                  {v === null || v === undefined ? sinDato : k === 'capital' ? euros(v) ?? sinDato : String(v)}
                </dd>
              </div>
            )
          })}
        </dl>
      }
      formulario={
        <div style={REJILLA}>
          <label style={etiquetaCss}>{ETIQUETA_CAMPO_LIBRE.descripcion}<input value={E.form.descripcion ?? ''} onChange={E.set('descripcion')} maxLength={300} style={campoCss} /></label>
          <label style={etiquetaCss}>{ETIQUETA_CAMPO_LIBRE.direccion}<input value={E.form.direccion ?? ''} onChange={E.set('direccion')} maxLength={200} style={campoCss} /></label>
          <label style={etiquetaCss}>{ETIQUETA_CAMPO_LIBRE.capital}<input inputMode="decimal" value={E.form.capital ?? ''} onChange={E.set('capital')} placeholder="p. ej. 300.000" style={campoCss} /></label>
          <label style={{ ...etiquetaCss, gridColumn: '1 / -1' }}>{ETIQUETA_CAMPO_LIBRE.notas}
            <textarea value={E.form.notas ?? ''} onChange={E.set('notas')} maxLength={1000} rows={3} style={{ ...campoCss, minHeight: 88, resize: 'vertical' }} />
          </label>
        </div>
      }
    />
  )
}

/** El bloque de datos del riesgo de los ramos que NO son de vehículo. `null` = asegura no lo manda: no se inventa. */
export default function DatosRiesgo(props: Props) {
  const b = props.riesgo.datosRiesgo
  if (b === null || b.clave === 'datosVehiculo') return null
  const d = b.datos as unknown as Record<string, unknown>
  if (b.clave === 'datosVivienda') return <DatosVivienda {...props} d={d} faltan={b.faltan} dePoliza={b.dePoliza} />
  if (b.clave === 'datosCapital') return <DatosCapital {...props} d={d} faltan={b.faltan} dePoliza={b.dePoliza} />
  if (b.clave === 'datosComercio') return <DatosComercio {...props} d={d} faltan={b.faltan} dePoliza={b.dePoliza} tarifica={b.tarifica} />
  return <DatosLibre {...props} d={d} dePoliza={b.dePoliza} />
}
