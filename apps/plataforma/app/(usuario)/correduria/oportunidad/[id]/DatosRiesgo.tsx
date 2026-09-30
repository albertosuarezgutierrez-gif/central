'use client'

// «Datos de la vivienda» / «Capital» / «Datos del riesgo» de la oportunidad (30/09/2026): VER, EDITAR y CONFIRMAR lo
// que se sabe del riesgo sin salir de la pantalla, en los ramos que NO son de vehículo (ese es `DatosVehiculo`).
// Mismo patrón: se guarda en `info_riesgo.<clave>` de asegura (PATCH del riesgo) y la pantalla de pedir precio lo
// PRECARGA desde ahí; lo que se use al pedir precio se anota de vuelta.
//
//   hogar                     → datosVivienda    (los selectores usan los MISMOS catálogos de Codeoscopic que
//                                                 hogar-nuevo: `CATALOGO_HOGAR_DE_CAMPO`, sin listas propias)
//   vida · salud · decesos    → datosCapital
//   RC · comercio · comunidades · otros → datosRiesgoLibre (se cotiza fuera: los datos son para el expediente)
//
// 🚨 Un campo sin dato se pinta «sin dato» (nunca «0» ni vacío); lo que falta para pedir precio se dice.

import { useEffect, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import {
  AVISO_RIESGO_LIBRE, CATALOGO_HOGAR_DE_CAMPO, ESPEC_CAPITAL, ESPEC_LIBRE, ESPEC_VIVIENDA, ETIQUETA_CAMPO_CAPITAL, ETIQUETA_CAMPO_LIBRE,
  ETIQUETA_CAMPO_VIVIENDA, camposCapitalDelRamo, soloLoQueCambia, textoFaltanCapital, textoFaltanVivienda,
  type CampoCapital, type CampoVivienda, type EspecCampo, type RamoCapital,
} from '@central/module-seguros'
import type { Opcion } from '@/lib/auto-nuevo-asegura'
import { eur } from '@/lib/dinero'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'
import { fechaEs, llamarDatosRiesgo, motivoDe } from './piezas-riesgo'
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
function Marco({ titulo, ayuda, confirmadoAt, dePoliza, aviso, nota, editando, bloqueado, enviando, errorForm, onEditar, onConfirmar, onGuardar, onCancelar, lectura, formulario }: {
  titulo: string
  ayuda: string
  confirmadoAt: string | null
  dePoliza: boolean
  aviso: string | null
  nota?: string | null
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
function useEdicion(clave: 'datosVivienda' | 'datosCapital' | 'datosRiesgoLibre', { riesgo, ocupado, onCambio, onError }: Props, spec: readonly EspecCampo[], datos: Record<string, unknown>, nombre: string) {
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

// ─── Vivienda (hogar) ────────────────────────────────────────────────────────

const GRUPOS_VIVIENDA: Array<{ titulo: string; campos: CampoVivienda[] }> = [
  { titulo: 'Dónde está', campos: ['referenciaCatastral', 'direccion', 'tipoViaId', 'nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'cp', 'municipio'] },
  { titulo: 'Cómo es', campos: ['metrosCuadrados', 'anioConstruccion', 'anioUltimaReforma', 'habitaciones', 'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad'] },
  { titulo: 'Protecciones', campos: ['alarma', 'puertasSecundarias', 'puertaPrincipalBlindada', 'ventanasSeguras', 'urbanizacionCerrada', 'vigilante'] },
  { titulo: 'Qué se asegura', campos: ['capitalContinente', 'capitalContenido', 'joyasEnCajaFuerte', 'joyasFueraDeCaja', 'objetosDeValor', 'perrosPeligrosos', 'asentamiento'] },
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

  const aviso = textoFaltanVivienda(faltan as CampoVivienda[])

  return (
    <Marco
      titulo="Datos de la vivienda"
      ayuda="Lo que se sabe de la casa. Al pedir precio se precargan aquí y lo que se use se anota de vuelta."
      nota="Con la referencia catastral, la pantalla de precio lee dirección, m² y año del Catastro; aquí se cuentan igual mientras no estén anotados."
      confirmadoAt={d.confirmadoAt as string | null} dePoliza={dePoliza}
      aviso={aviso}
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
                      <input value={E.form[k] ?? ''} onChange={E.set(k)} inputMode={numerico ? 'decimal' : k === 'cp' ? 'numeric' : undefined}
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

// ─── Capital (vida, salud, decesos) ──────────────────────────────────────────

function DatosCapital(props: Props & { d: Record<string, unknown>; faltan: string[]; dePoliza: boolean }) {
  const { riesgo, d, faltan, dePoliza } = props
  const ramo = riesgo.oportunidad.ramo as RamoCapital
  const campos = camposCapitalDelRamo(ramo)
  const E = useEdicion('datosCapital', props, ESPEC_CAPITAL.filter((c) => (campos as readonly string[]).includes(c.clave)), d, 'el capital')
  const filaLectura = (k: CampoCapital): React.ReactNode => {
    const v = d[k]
    if (v === null || v === undefined) return sinDato
    if (k === 'capital') return euros(v) ?? sinDato
    if (k === 'duracionAnios') return `${v} ${v === 1 ? 'año' : 'años'}`
    return String(v)
  }
  return (
    <Marco
      titulo="Capital del seguro"
      ayuda={ramo === 'vida' ? 'Capital y duración que quiere el cliente. Al pedir precio se precargan aquí.' : 'Lo que se sabe de lo que quiere el cliente. Al pedir precio se precarga aquí.'}
      nota={ramo === 'vida' ? null : `En ${ramo} el capital es opcional: no viaja a la compañía, queda para el expediente.`}
      confirmadoAt={d.confirmadoAt as string | null} dePoliza={dePoliza}
      aviso={textoFaltanCapital(faltan as CampoCapital[])}
      editando={E.editando} bloqueado={E.bloqueado} enviando={E.enviando} errorForm={E.errorForm}
      onEditar={E.abrir} onConfirmar={() => void E.guardar({}, true)} onGuardar={E.enviar} onCancelar={() => E.setEditando(false)}
      lectura={
        <dl style={{ ...REJILLA, margin: 0 }}>
          {campos.map((k) => (
            <div key={k} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{ETIQUETA_CAMPO_CAPITAL[k]}</dt>
              <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{filaLectura(k)}</dd>
            </div>
          ))}
        </dl>
      }
      formulario={
        <div style={REJILLA}>
          {campos.map((k) => (
            <label key={k} style={etiquetaCss}>{ETIQUETA_CAMPO_CAPITAL[k]}
              <input value={E.form[k] ?? ''} onChange={E.set(k)} inputMode={k === 'modalidadDeseada' ? undefined : 'decimal'}
                placeholder={k === 'capital' ? 'p. ej. 150.000' : undefined} maxLength={k === 'modalidadDeseada' ? 80 : undefined} style={campoCss} />
            </label>
          ))}
        </div>
      }
    />
  )
}

// ─── Riesgo libre (RC, comercio, comunidades, otros) ─────────────────────────

function DatosLibre(props: Props & { d: Record<string, unknown>; dePoliza: boolean }) {
  const { d, dePoliza } = props
  const E = useEdicion('datosRiesgoLibre', props, ESPEC_LIBRE, d, 'los datos del riesgo')
  const claves = ['descripcion', 'direccion', 'capital', 'notas'] as const
  return (
    <Marco
      titulo="Datos del riesgo"
      ayuda="Lo que se asegura, dónde y por cuánto."
      nota={AVISO_RIESGO_LIBRE}
      confirmadoAt={d.confirmadoAt as string | null} dePoliza={dePoliza}
      aviso={null}
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
  return <DatosLibre {...props} d={d} dePoliza={b.dePoliza} />
}
