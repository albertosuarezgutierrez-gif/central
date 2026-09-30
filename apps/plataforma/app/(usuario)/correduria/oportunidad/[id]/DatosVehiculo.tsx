'use client'

// «Datos del vehículo» del riesgo (30/09/2026): VER, EDITAR y CONFIRMAR lo que se sabe del coche o la
// moto sin salir de la pantalla. Se guarda en `info_riesgo.datosVehiculo` de asegura (PATCH del riesgo);
// la pantalla de pedir precio (auto-nuevo / moto-nuevo) lo PRECARGA desde ahí.
//
// Un campo sin dato se pinta «sin dato» (nunca «0» ni vacío); lo que falta para pedir precio se dice.
// El selector marca → modelo → versión del catálogo vive dentro de la pantalla de precio (entrelazado con
// su borrador local): aquí van marca/modelo/versión como texto libre y la consulta por matrícula (gratis);
// `codigoVehiculo` (la versión del catálogo) se elige allí y el riesgo lo recuerda.

import { useEffect, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import { ETIQUETA_CAMPO_VEHICULO, soloLoQueCambia, textoFaltanVehiculo, type DatosVehiculoRiesgo } from '@central/module-seguros'
import { fechaMatriculacionEstimada, normalizarMatricula } from '@central/module-seguros/matricula'
import type { Opcion } from '@/lib/auto-nuevo-asegura'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'
import { fechaEs, llamarDatosRiesgo, motivoDe } from './piezas-riesgo'
import type { Riesgo } from '@/lib/riesgo-asegura'

const campo: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44,
  background: 'var(--surface)', color: 'var(--text)', width: '100%',
}
const etiquetaCss: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const REJILLA: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }

type Form = { matricula: string; marca: string; modelo: string; version: string; fechaMatriculacion: string; fechaCompra: string; kmAnuales: string; garaje: string }

const aForm = (d: DatosVehiculoRiesgo | null): Form => ({
  matricula: d?.matricula ?? '', marca: d?.marca ?? '', modelo: d?.modelo ?? '', version: d?.version ?? '',
  fechaMatriculacion: d?.fechaMatriculacion ?? '', fechaCompra: d?.fechaCompra ?? '',
  kmAnuales: d?.kmAnuales != null ? String(d.kmAnuales) : '', garaje: d?.garaje ?? '',
})

function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

export default function DatosVehiculo({ riesgo, ocupado, onCambio, onError }: {
  riesgo: Riesgo
  ocupado: boolean
  onCambio: (texto: string) => void
  onError: (texto: string) => void
}) {
  const d = riesgo.datosVehiculo
  const op = riesgo.oportunidad
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Form>(() => aForm(d))
  const [enviando, setEnviando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [garajes, setGarajes] = useState<Opcion[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [notaMatricula, setNotaMatricula] = useState<string | null>(null)

  // El catálogo de garajes (gratis) sirve para el selector y para enseñar el nombre, no el id.
  useEffect(() => {
    let vivo = true
    pedirCatalogo({ tipo: 'garajes' })
      .then((r) => { if (vivo && r.estado === 'ok') setGarajes(r.opciones) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  if (d === null) return null // ramo sin vehículo, o asegura aún no lo manda: no se inventa un bloque vacío
  const bloqueado = enviando || ocupado
  const nombreGaraje = (id: string | null) => (id === null ? null : garajes?.find((g) => g.id === id)?.nombre ?? id)
  const aviso = textoFaltanVehiculo(riesgo.faltanVehiculo)
  const sinDato = <span style={{ color: 'var(--muted)', fontStyle: 'normal' }}>sin dato</span>
  const filas: Array<[string, React.ReactNode]> = [
    [ETIQUETA_CAMPO_VEHICULO.matricula, d.matricula ?? sinDato],
    [ETIQUETA_CAMPO_VEHICULO.marca, d.marca ?? sinDato],
    [ETIQUETA_CAMPO_VEHICULO.modelo, d.modelo ?? sinDato],
    [ETIQUETA_CAMPO_VEHICULO.version, d.version ?? sinDato],
    [ETIQUETA_CAMPO_VEHICULO.codigoVehiculo, d.codigoVehiculo ? `elegida (código ${d.codigoVehiculo})` : sinDato],
    [ETIQUETA_CAMPO_VEHICULO.fechaMatriculacion, fechaEs(d.fechaMatriculacion) ?? sinDato],
    [ETIQUETA_CAMPO_VEHICULO.fechaCompra, fechaEs(d.fechaCompra) ?? sinDato],
    [ETIQUETA_CAMPO_VEHICULO.kmAnuales, d.kmAnuales !== null ? `${d.kmAnuales.toLocaleString('es-ES')} km` : sinDato],
    [ETIQUETA_CAMPO_VEHICULO.garaje, nombreGaraje(d.garaje) ?? sinDato],
  ]

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function guardar(datosVehiculo: Record<string, unknown>, confirmar: boolean) {
    setEnviando(true)
    setErrorForm(null)
    const r = await llamarDatosRiesgo({ oportunidadId: op.id, datosVehiculo, ...(confirmar ? { confirmar: true } : {}) })
    setEnviando(false)
    if (!r.ok) {
      const m = motivoDe(r)
      if (editando) setErrorForm(m)
      onError(`No se han guardado los datos del vehículo: ${m}`)
      return
    }
    setEditando(false)
    onCambio(confirmar ? 'Datos del vehículo confirmados.' : 'Datos del vehículo guardados. Quedan sin confirmar hasta que los confirmes.')
  }

  function enviarEdicion(e: React.FormEvent) {
    e.preventDefault()
    // Solo lo que DIFIERE del estado inicial: no se copia el texto de fallback («vehiculo») a `marca`, no se
    // pisan escrituras concurrentes de campos que aquí no se tocaron, y editar marca/modelo/versión a mano hace
    // que asegura suelte el código del catálogo (un precio de otro coche no se queda pegado). Vacío = borrar.
    const cambios = soloLoQueCambia(d as unknown as Record<string, unknown>, form)
    if (Object.keys(cambios).length === 0) { setEditando(false); return }
    void guardar(cambios, false)
  }

  async function consultarMatricula() {
    const m = normalizarMatricula(form.matricula)
    setNotaMatricula(null)
    if (m.length < 4) { setNotaMatricula('Escribe la matrícula primero.'); return }
    setBuscando(true)
    try {
      const r = await pedirCatalogo({ tipo: op.ramo === 'moto' ? 'fecha-matriculacion-moto' : 'fecha-matriculacion', matricula: m })
      const f = r.estado === 'ok' ? r.opciones[0]?.id : undefined
      if (f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoyLocal()) {
        setForm((x) => ({ ...x, matricula: m, fechaMatriculacion: f }))
        setNotaMatricula('Fecha aproximada de Avant2 por la matrícula: revísala.')
        return
      }
      const est = fechaMatriculacionEstimada(m, hoyLocal())
      if (est) {
        setForm((x) => ({ ...x, matricula: m, fechaMatriculacion: est.estimada }))
        setNotaMatricula('Avant2 no ha respondido: fecha estimada por la serie de la matrícula. Revísala.')
      } else setNotaMatricula('No se ha podido deducir la fecha de esa matrícula: tecléala.')
    } catch {
      setNotaMatricula('No se ha podido consultar la matrícula ahora. Tecléala a mano.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Datos del vehículo</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Lo que se sabe {op.ramo === 'moto' ? 'de la moto' : 'del coche'}. Al pedir precio se precargan aquí y lo que se use se anota de vuelta.
          </div>
        </div>
        <Badge tono={d.confirmadoAt ? 'positivo' : 'aviso'}>
          {d.confirmadoAt ? `Confirmados el ${fechaEs(d.confirmadoAt)}` : 'Sin confirmar'}
        </Badge>
      </div>

      {aviso && <div style={{ fontSize: 13, color: 'var(--warning)' }} role="status">{aviso}</div>}

      {!editando ? (
        <>
          <dl style={{ ...REJILLA, margin: 0 }}>
            {filas.map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{k}</dt>
                <dd style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{v}</dd>
              </div>
            ))}
          </dl>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={bloqueado} onClick={() => { setForm(aForm(d)); setErrorForm(null); setNotaMatricula(null); setEditando(true) }}
              style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
              Editar
            </button>
            {!d.confirmadoAt && (
              <button type="button" disabled={bloqueado} onClick={() => void guardar({}, true)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
                {enviando ? 'Confirmando…' : 'Confirmar datos'}
              </button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={enviarEdicion} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          <div style={REJILLA}>
            <label style={etiquetaCss}>
              Matrícula
              <input value={form.matricula} onChange={set('matricula')} maxLength={20} autoCapitalize="characters" style={campo} />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" disabled={bloqueado || buscando} onClick={() => void consultarMatricula()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                {buscando ? 'Consultando…' : 'Consultar por matrícula'}
              </button>
            </div>
          </div>
          {notaMatricula && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{notaMatricula}</div>}
          <div style={REJILLA}>
            <label style={etiquetaCss}>Marca<input value={form.marca} onChange={set('marca')} maxLength={60} style={campo} /></label>
            <label style={etiquetaCss}>Modelo<input value={form.modelo} onChange={set('modelo')} maxLength={80} style={campo} /></label>
            <label style={etiquetaCss}>Versión<input value={form.version} onChange={set('version')} maxLength={120} style={campo} /></label>
            <label style={etiquetaCss}>Fecha de matriculación<input type="date" max={hoyLocal()} value={form.fechaMatriculacion} onChange={set('fechaMatriculacion')} style={campo} /></label>
            <label style={etiquetaCss}>Fecha de compra<input type="date" max={hoyLocal()} value={form.fechaCompra} onChange={set('fechaCompra')} style={campo} /></label>
            <label style={etiquetaCss}>Kilómetros al año<input inputMode="numeric" value={form.kmAnuales} onChange={set('kmAnuales')} placeholder="p. ej. 12.000" style={campo} /></label>
            <label style={etiquetaCss}>
              Garaje
              <select value={form.garaje} onChange={set('garaje')} style={campo}>
                <option value="">Sin dato</option>
                {/* Un garaje ya guardado que el catálogo no trae ahora se conserva como opción: no se pierde en silencio. */}
                {form.garaje !== '' && !garajes?.some((g) => g.id === form.garaje) && <option value={form.garaje}>{form.garaje}</option>}
                {(garajes ?? []).map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </label>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Un campo vacío se guarda como «sin dato». Si cambias marca, modelo o versión a mano, se olvida la versión del catálogo ya elegida y habrá que elegirla otra vez al pedir precio. La versión exacta del catálogo (necesaria para el precio) se elige en la pantalla de pedir precio y queda recordada aquí.
            {garajes === null && ' No se ha podido leer el catálogo de garajes ahora.'}
          </div>
          {errorForm && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{errorForm}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" disabled={bloqueado} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>{enviando ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" disabled={bloqueado} onClick={() => setEditando(false)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  )
}
