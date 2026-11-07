'use client'
// «Mi empresa» desde el panel del operador: por empresa, QUÉ herramientas tiene, QUIÉN es el dueño que firma y quién más
// entra, y el estado del contrato de encargo. El ÚNICO sitio donde sale un correo es el botón «Enviar contrato» del modal
// (o «Reenviar»/«Recordatorio», cada uno con su confirmación): ese clic es el OK de Alberto para ESE envío.
import { useCallback, useEffect, useState } from 'react'
import { Briefcase } from 'lucide-react'
import { Pagina, PageHeader } from '@/components/ui'
import DireccionAlta, { DIRECCION_VACIA, type DireccionForm } from '../clientes/DireccionAlta'
import { CATALOGO, IDS_HERRAMIENTA, ROLES_APP, APP_DE_ROLES, estadoEfectivo, diasDesde, rolEnHerramienta, type IdHerramienta, type EstadoVersion } from '@central/core-herramientas'

type Miembro = { persona_id: string; email: string; nombre: string; rol: 'dueno' | 'admin' | 'consulta' | 'empleado'; titulo: string | null; nif: string | null; herramientas: string[]; roles_app?: Record<string, { rol_app: string | null; propagacion: string }>; origen: Record<string, unknown> | null }
type HerramientaFila = { herramienta: IdHerramienta; ref_externa: string | null; estado: string; propagacion: string }
type Envio = { tipo: string; intento: number; estado: string; confirmado_por: string; creado_en: string; error: string | null }
type Version = { id: string; n: number; estado: EstadoVersion; herramientas: string[]; destinatario: string; emitida_en: string; caduca_en: string; sha256: string; firmada_en: string | null; certificado_sha256: string | null; envios: Envio[] }
type Cuenta = {
  id: string; cif: string; razon_social: string; marca_acento: string | null
  domicilio: { via: string | null; numero: string | null; resto: string | null; cp: string | null; municipio: string | null; provincia: string | null }
  miembros: Miembro[]; herramientas: HerramientaFila[]; versiones: Version[]; eventos: { actor: string; accion: string; creado_en: string }[]
}
type Previa = { ok: true; herramientas: IdHerramienta[]; nuevas: IdHerramienta[]; destinatario: string; version: number; borrador: boolean; marcasPendientes: number; anexo: string[]; remitente: string }
type Sugerencia = { relacionadoId: string; nombre: string; tipo: string; rol: 'dueno' | 'admin' | 'consulta' | null; titulo: 'administrador' | 'apoderado' | null; motivo: string; origen: Record<string, unknown> }

const ROL: Record<string, string> = { dueno: 'Dueño (firma)', admin: 'Administración', consulta: 'Consulta', empleado: 'Empleado' }
const EST_V: Record<string, string> = { enviado: 'Pendiente de firma', firmado: 'Firmado', anulado: 'Anulado', caducado: 'Caducado (30 d)', sustituido: 'Sustituido' }
const EST_H: Record<string, string> = { apagada: 'Sin contratar', pendiente_firma: 'Pendiente de firma', activa: 'Activa', suspendida: 'Suspendida', retirada: 'Retirada' }
const ERR: Record<string, string> = {
  destinatario_cambiado: 'El dueño cambió mientras mirabas: vuelve a revisar a quién se envía.', canal_no_disponible: '«Mi empresa» no tiene proveedor de correo configurado: NO se ha emitido nada.',
  falta_confirmar_borrador: 'Marca que sabes que el texto es un borrador sin revisión de abogado.', sin_configurar: 'Falta EMPRESA_URL / HERRAMIENTAS_OPERADOR_SECRET en plataforma.',
  sin_respuesta: '«Mi empresa» no respondió. No se sabe si el envío salió: refresca la ficha ANTES de repetir.', ref_no_editable: 'No se cambia la ref de una herramienta ya contratada.',
  herramienta_no_contratada: 'Solo se concede lo contratado (emite el contrato primero).', es_el_dueno: 'Esa persona es el dueño.', datos_dueno_invalidos: 'Revisa nombre, correo, NIF y título del dueño.',
  datos_acceso_invalidos: 'Revisa nombre, correo y rol.', version_no_firmable: 'Esa versión ya no admite envíos (firmada, anulada o caducada).',
}
const err = (j: unknown, d = 'No se pudo.') => { const e = (j as { error?: string })?.error; return (e && ERR[e]) || e || d }
const fecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-ES') : '—')

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)', minWidth: 0 }
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16, minHeight: 44, boxSizing: 'border-box', minWidth: 0 }
const btn: React.CSSProperties = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 700, cursor: 'pointer' }
const btnP: React.CSSProperties = { ...btn, background: 'var(--primary)', border: 'none', color: '#fff' }
const chip = (bien: boolean | null): React.CSSProperties => ({ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 8px', background: bien === null ? 'var(--bg)' : bien ? 'var(--positive-bg)' : 'var(--negative-bg)', color: bien === null ? 'var(--muted)' : bien ? 'var(--positive)' : 'var(--negative)', border: '1px solid var(--border)' })
const rejilla: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }

async function pedir(url: string, cuerpo?: unknown): Promise<{ ok: boolean; status: number; j: unknown }> {
  const r = await fetch(url, cuerpo === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }).catch(() => null)
  if (!r) return { ok: false, status: 0, j: { error: 'sin_respuesta' } }
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => null) }
}

export default function EmpresasClient({ operador }: { operador: string }) {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)

  const cargar = useCallback(async () => {
    const r = await pedir('/api/operador/empresas')
    if (!r.ok) { setError(err(r.j, 'No se pudo cargar.')); setCuentas(null); return }
    setError(''); setCuentas((r.j as { cuentas: Cuenta[] }).cuentas)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const ahora = new Date()
  return (
    <Pagina ancho="lectura">
      <PageHeader titulo="Empresas · Mi empresa" sub={`Herramientas, contrato de encargo y accesos · ${operador}`} icono={<Briefcase size={20} strokeWidth={1.75} />}
        acciones={<button style={btnP} onClick={() => setNueva(true)}>➕ Nueva empresa</button>} />
      {error && <div style={{ ...card, color: 'var(--negative)' }}>{error}</div>}
      {cuentas === null && !error && <div style={{ color: 'var(--muted)' }}>Cargando…</div>}
      {cuentas?.length === 0 && <div style={{ color: 'var(--muted)' }}>Aún no hay empresas en «Mi empresa».</div>}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {cuentas?.map((c) => {
          const dueno = c.miembros.find((m) => m.rol === 'dueno')
          const v = c.versiones[0]
          const ev = v ? estadoEfectivo({ estado: v.estado, caducaEn: new Date(v.caduca_en) }, ahora) : null
          return (
            <div key={c.id} style={card}>
              <button type="button" onClick={() => setAbierta(abierta === c.id ? null : c.id)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', minHeight: 44 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong>{c.razon_social} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {c.cif}</span></strong>
                  {v ? <span style={chip(ev === 'firmado' ? true : ev === 'enviado' ? null : false)}>v{v.n} · {EST_V[ev!]}{ev === 'enviado' ? ` desde hace ${diasDesde(new Date(v.emitida_en), ahora)} d` : ''}</span> : <span style={chip(null)}>Sin contrato</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Dueño: {dueno ? `${dueno.nombre} · ${dueno.email}` : 'sin fijar'}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {c.herramientas.filter((h) => h.estado !== 'apagada').map((h) => <span key={h.herramienta} style={chip(h.estado === 'activa' ? true : h.estado === 'pendiente_firma' ? null : false)}>{CATALOGO[h.herramienta]?.nombre ?? h.herramienta}: {EST_H[h.estado]}</span>)}
                </div>
              </button>
              {abierta === c.id && <Ficha id={c.id} alCambiar={cargar} />}
            </div>
          )
        })}
      </div>
      {nueva && <AltaCuenta alCerrar={() => { setNueva(false); cargar() }} />}
    </Pagina>
  )
}

function Modal({ titulo, children, alCerrar }: { titulo: string; children: React.ReactNode; alCerrar: () => void }) {
  return (
    <div onClick={alCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, zIndex: 60 }}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ ...card, width: '95vw', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><strong style={{ fontSize: 17 }}>{titulo}</strong>
          <button type="button" onClick={alCerrar} style={{ ...btn, border: 'none' }} aria-label="Cerrar">×</button></div>
        {children}
      </div>
    </div>
  )
}

function AltaCuenta({ alCerrar, inicial, id }: { alCerrar: () => void; inicial?: Cuenta; id?: string }) {
  const [cif, setCif] = useState(inicial?.cif ?? '')
  const [razon, setRazon] = useState(inicial?.razon_social ?? '')
  const [dir, setDir] = useState<DireccionForm>(inicial ? { cp: inicial.domicilio.cp ?? '', provincia: inicial.domicilio.provincia ?? '', municipio: inicial.domicilio.municipio ?? '', via: inicial.domicilio.via ?? '', numero: inicial.domicilio.numero ?? '' } : DIRECCION_VACIA)
  const [resto, setResto] = useState(inicial?.domicilio.resto ?? '')
  const [acento, setAcento] = useState(inicial?.marca_acento ?? '')
  const [e, setE] = useState('')
  async function guardar(ev: React.FormEvent) {
    ev.preventDefault(); setE('')
    const r = await pedir('/api/operador/empresas', { cif, razonSocial: razon, domicilio: { ...dir, resto }, acento: acento || null })
    if (!r.ok) { setE(err(r.j)); return }
    alCerrar()
  }
  void id
  return (
    <Modal titulo={inicial ? 'Datos de la empresa' : 'Nueva empresa'} alCerrar={alCerrar}>
      <form onSubmit={guardar} style={{ display: 'grid', gap: 10, marginTop: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <label>CIF de la sociedad<input style={inp} value={cif} onChange={(x) => setCif(x.target.value)} required disabled={!!inicial} placeholder="B12345678" /></label>
        <label>Razón social<input style={inp} value={razon} onChange={(x) => setRazon(x.target.value)} required /></label>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Domicilio social (sale en el contrato)</div>
        <DireccionAlta valor={dir} onChange={setDir} />
        <label>Piso, puerta… (opcional)<input style={inp} value={resto} onChange={(x) => setResto(x.target.value)} /></label>
        <label>Color de la empresa (hex, de su logo; opcional)<input style={inp} value={acento} onChange={(x) => setAcento(x.target.value)} placeholder="#2b6a6e" /></label>
        {e && <div style={{ color: 'var(--negative)' }}>{e}</div>}
        <button type="submit" style={btnP}>Guardar</button>
      </form>
    </Modal>
  )
}

function Ficha({ id, alCambiar }: { id: string; alCambiar: () => void }) {
  const [c, setC] = useState<Cuenta | null>(null)
  const [e, setE] = useState('')
  const [ok, setOk] = useState('')
  const [marcadas, setMarcadas] = useState<IdHerramienta[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [faltan, setFaltan] = useState<string[] | null>(null)
  const [borrador, setBorrador] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [editar, setEditar] = useState(false)
  const [sug, setSug] = useState<{ estado: string; sugerencias: Sugerencia[] | null; cambios: { personaId: string; cambio: { estado: string; antes?: string; ahora?: string; rolSugerido?: string | null } }[] } | null>(null)

  const cargar = useCallback(async () => {
    const r = await pedir(`/api/operador/empresas/${id}`)
    if (!r.ok) { setE(err(r.j)); return }
    setC((r.j as { cuenta: Cuenta }).cuenta)
  }, [id])
  useEffect(() => { cargar() }, [cargar])
  const refrescar = async () => { await cargar(); alCambiar() }

  async function accion(cuerpo: Record<string, unknown>, exito: string) {
    setE(''); setOk('')
    const r = await pedir(`/api/operador/empresas/${id}`, cuerpo)
    if (!r.ok) { setE(err(r.j)); return null }
    setOk(exito); await refrescar(); return r.j
  }

  async function verPrevia() {
    setE(''); setFaltan(null)
    const r = await pedir(`/api/operador/empresas/${id}`, { accion: 'previa', herramientas: marcadas })
    const j = r.j as Previa & { faltan?: string[]; error?: string }
    if (!r.ok) { if (j?.faltan) setFaltan(j.faltan); else setE(err(j)); return }
    setBorrador(false); setPrevia(j)
  }

  async function enviarContrato() {
    if (!previa) return
    setEnviando(true)
    const j = await accion({ accion: 'activar', herramientas: marcadas, confirmoDestinatario: previa.destinatario, confirmoBorrador: borrador }, '') as { correo?: string; n?: number } | null
    setEnviando(false)
    if (j) { setPrevia(null); setMarcadas([]); setOk(j.correo === 'aceptado' ? `Contrato v${j.n} emitido y enviado a ${previa.destinatario}.` : `Contrato v${j.n} emitido, pero el correo NO salió. Usa «Reenviar» (otro clic = otro OK).`) }
  }

  async function reenvio(v: Version, tipo: 'reenviar' | 'recordatorio') {
    if (!window.confirm(`Se enviará ${tipo === 'reenviar' ? 'el contrato' : 'un recordatorio'} a ${v.destinatario} desde el correo de Grupo ASegura. ¿Enviar?`)) return
    await accion({ accion: tipo, versionId: v.id, confirmoDestinatario: v.destinatario }, `Enviado a ${v.destinatario}.`)
  }

  async function sugerir() {
    setSug(null)
    const r = await pedir(`/api/operador/empresas/${id}/sugerencias`)
    setSug((r.j as typeof sug) ?? { estado: 'no_se_pudo_leer', sugerencias: null, cambios: [] })
  }

  if (!c) return <div style={{ marginTop: 10, color: e ? 'var(--negative)' : 'var(--muted)' }}>{e || 'Cargando ficha…'}</div>
  const ahora = new Date()
  const contratables = IDS_HERRAMIENTA.filter((h) => c.herramientas.some((x) => x.herramienta === h && x.ref_externa && x.estado !== 'activa' && x.estado !== 'pendiente_firma'))
  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {e && <div style={{ color: 'var(--negative)' }}>{e}</div>}
      {ok && <div style={{ color: 'var(--positive)' }}>{ok}</div>}
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        Domicilio: {c.domicilio.via ? `${c.domicilio.via}, nº ${c.domicilio.numero ?? '¿?'}${c.domicilio.resto ? `, ${c.domicilio.resto}` : ''}, ${c.domicilio.cp ?? '¿CP?'} ${c.domicilio.municipio ?? ''} (${c.domicilio.provincia ?? ''})` : 'sin fijar (lo exige el contrato)'}
        {' '}<button type="button" style={btn} onClick={() => setEditar(true)}>Editar</button>
      </div>
      {editar && <AltaCuenta inicial={c} id={c.id} alCerrar={() => { setEditar(false); refrescar() }} />}

      <section>
        <strong>Herramientas</strong>
        <div style={{ ...rejilla, marginTop: 8 }}>
          {IDS_HERRAMIENTA.map((h) => <HerramientaRef key={h} h={h} fila={c.herramientas.find((x) => x.herramienta === h) ?? null} marcada={marcadas.includes(h)}
            alMarcar={(m) => setMarcadas((xs) => (m ? [...xs, h] : xs.filter((x) => x !== h)))} alGuardar={(ref) => accion({ accion: 'ref', herramienta: h, ref }, 'Ref guardada.')} contratable={contratables.includes(h)} />)}
        </div>
        <button type="button" style={{ ...btnP, marginTop: 10 }} disabled={marcadas.length === 0} onClick={verPrevia}>Activar herramientas…</button>
        {faltan && <div style={{ ...card, marginTop: 8, color: 'var(--negative)' }}><strong>Falta, y no se puede seguir:</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{faltan.map((f) => <li key={f}>{f}</li>)}</ul></div>}
      </section>

      <section>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <strong>Personas</strong>
          <button type="button" style={btn} onClick={sugerir}>Sugerir desde la correduría</button>
        </div>
        {sug && <Sugerencias s={sug} c={c} alCopiar={(cuerpo, t) => accion(cuerpo, t)} />}
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 6 }}>
          {c.miembros.map((m) => {
            const cambio = sug?.cambios.find((x) => x.personaId === m.persona_id)?.cambio
            return (
              <li key={m.persona_id} style={{ ...card, padding: '10px 12px' }}>
                <strong>{m.nombre}</strong> · {m.email} · {ROL[m.rol]}{m.titulo ? ` (${m.titulo})` : ''}{m.rol === 'dueno' && !m.nif ? ' · ⚠️ falta NIF' : ''}{m.rol === 'dueno' && !m.titulo ? ' · ⚠️ falta título' : ''}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {m.rol === 'admin' || m.rol === 'empleado' ? `Herramientas: ${m.herramientas.map((h) => CATALOGO[h as IdHerramienta]?.nombre ?? h).join(', ') || 'ninguna'}` : 'Ve todo lo contratado'}
                  {' · '}origen: {m.origen ? String(m.origen.fuente) + (m.origen.tipo ? ` (${String(m.origen.tipo)})` : '') : 'no consta'}
                </div>
                {m.herramientas.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{m.herramientas.map((h) => {
                  const hid = h as IdHerramienta; const fila = m.roles_app?.[h]
                  return <label key={h} style={{ fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }}>{CATALOGO[hid]?.nombre ?? h}:
                    <select style={{ ...inp, fontSize: 13, width: 'auto' }} value={fila?.rol_app ?? ''} onChange={(x) => accion({ accion: 'rol_app', personaId: m.persona_id, herramienta: h, rolApp: x.target.value }, 'Rol en la herramienta guardado.')}>
                      <option value="">{`por defecto (${rolEnHerramienta(hid, m.rol) ?? 'no entra'})`}</option>
                      {ROLES_APP[APP_DE_ROLES[hid]].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>{fila?.propagacion === 'pendiente' ? ' · en la app: pendiente' : ''}</label>
                })}</div>}
                {cambio && cambio.estado === 'cambio' && <div style={{ fontSize: 13, color: 'var(--warning)' }}>La relación cambió en la correduría: «{cambio.antes}» → «{cambio.ahora}». ¿Actualizar rol{cambio.rolSugerido ? ` a ${ROL[cambio.rolSugerido]}` : ''}? (no se cambia solo)</div>}
                {cambio && cambio.estado === 'desaparecida' && <div style={{ fontSize: 13, color: 'var(--negative)' }}>La relación de la que salió este rol ya no está en la ficha de la sociedad. Revísalo.</div>}
                {m.rol !== 'dueno' && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(m.rol === 'admin' || m.rol === 'empleado') && c.herramientas.filter((h) => (h.estado === 'activa' || h.estado === 'pendiente_firma') && !m.herramientas.includes(h.herramienta)).map((h) =>
                    <button key={h.herramienta} type="button" style={btn} onClick={() => accion({ accion: 'acceso', email: m.email, nombre: m.nombre, rol: m.rol, herramientas: [...m.herramientas, h.herramienta] }, 'Acceso concedido.')}>+ {CATALOGO[h.herramienta].nombre}</button>)}
                  <button type="button" style={btn} onClick={() => window.confirm(`¿Quitar todo el acceso de ${m.nombre}?`) && accion({ accion: 'quitar_acceso', personaId: m.persona_id, herramienta: null }, 'Acceso retirado.')}>Quitar acceso</button>
                </div>}
              </li>
            )
          })}
        </ul>
        <FormPersona c={c} alGuardar={(cuerpo, t) => accion(cuerpo, t)} />
      </section>

      <section>
        <strong>Contrato de encargo</strong>
        {c.versiones.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin versiones emitidas.</div>}
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 6 }}>
          {c.versiones.map((v) => {
            const ev = estadoEfectivo({ estado: v.estado, caducaEn: new Date(v.caduca_en) }, ahora)
            const ultimo = v.envios[v.envios.length - 1]
            return (
              <li key={v.id} style={{ ...card, padding: '10px 12px' }}>
                <strong>v{v.n}</strong> · {EST_V[ev]} · {v.herramientas.map((h) => CATALOGO[h as IdHerramienta]?.nombre ?? h).join(', ')}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Emitida {fecha(v.emitida_en)} para {v.destinatario} · caduca {fecha(v.caduca_en)}{v.firmada_en ? ` · firmada ${fecha(v.firmada_en)}` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Envíos: {v.envios.map((x) => `${x.tipo} #${x.intento} ${x.estado} (OK de ${x.confirmado_por})`).join(' · ') || 'ninguno'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all' }}>sha256 {v.sha256}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {ev === 'enviado' && ultimo?.estado === 'fallido' && <button type="button" style={btn} onClick={() => reenvio(v, 'reenviar')}>No salió el correo · Reenviar</button>}
                  {ev === 'enviado' && <button type="button" style={btn} onClick={() => reenvio(v, 'recordatorio')}>Enviar recordatorio</button>}
                  {ev === 'enviado' && <button type="button" style={btn} onClick={() => window.confirm('¿Anular esta versión? No se podrá firmar.') && accion({ accion: 'anular', versionId: v.id }, 'Versión anulada.')}>Anular</button>}
                  <a style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/api/operador/empresas/documento?version=${v.id}&tipo=contrato`}>Contrato</a>
                  {v.firmada_en && <a style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/api/operador/empresas/documento?version=${v.id}&tipo=certificado`}>Certificado</a>}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <details><summary style={{ cursor: 'pointer', minHeight: 44 }}>Historial</summary>
        <ul style={{ fontSize: 12, color: 'var(--muted)' }}>{c.eventos.map((x, i) => <li key={i}>{new Date(x.creado_en).toLocaleString('es-ES')} · {x.accion} · {x.actor}</li>)}</ul>
      </details>

      {previa && (
        <Modal titulo="Enviar contrato de encargo" alCerrar={() => setPrevia(null)}>
          <p>Se enviará el contrato de encargo (anexo v{previa.version}: {previa.anexo.join(', ')}) a <strong>{previa.destinatario}</strong> desde {previa.remitente}.</p>
          {previa.nuevas.length < previa.herramientas.length && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Lo ya activo sigue activo mientras esta versión está pendiente.</p>}
          {previa.borrador && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: 44 }}>
            <input type="checkbox" checked={borrador} onChange={(x) => setBorrador(x.target.checked)} style={{ width: 22, height: 22 }} />
            <span>Sé que el texto es un BORRADOR sin revisión de abogado ({previa.marcasPendientes} marcas «pendiente de confirmar» en el Anexo III).</span></label>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button type="button" style={btnP} disabled={enviando || (previa.borrador && !borrador)} onClick={enviarContrato}>{enviando ? 'Enviando…' : 'Enviar contrato'}</button>
            <button type="button" style={btn} onClick={() => setPrevia(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function HerramientaRef({ h, fila, marcada, alMarcar, alGuardar, contratable }: { h: IdHerramienta; fila: HerramientaFila | null; marcada: boolean; alMarcar: (m: boolean) => void; alGuardar: (ref: string) => void; contratable: boolean }) {
  const [ref, setRef] = useState(fila?.ref_externa ?? '')
  const editable = !fila || fila.estado === 'apagada' || fila.estado === 'retirada'
  return (
    <div style={{ ...card, padding: 10 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
        <input type="checkbox" disabled={!contratable} checked={marcada} onChange={(x) => alMarcar(x.target.checked)} style={{ width: 22, height: 22 }} />
        <strong>{CATALOGO[h].nombre}</strong>
      </label>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fila ? EST_H[fila.estado] : 'Sin contratar'}{fila?.propagacion === 'pendiente' ? ' · submódulo en rrhh: actívalo en Clientes (pendiente)' : ''}{!CATALOGO[h].traspaso ? ' · salto directo en F2' : ''}</div>
      <input style={{ ...inp, marginTop: 6, fontSize: 13 }} value={ref} onChange={(x) => setRef(x.target.value)} placeholder={CATALOGO[h].refEtiqueta} disabled={!editable} aria-label={CATALOGO[h].refEtiqueta} />
      {editable && <button type="button" style={{ ...btn, marginTop: 6 }} disabled={!ref.trim() || ref === fila?.ref_externa} onClick={() => alGuardar(ref.trim())}>Guardar ref</button>}
    </div>
  )
}

function FormPersona({ c, alGuardar }: { c: Cuenta; alGuardar: (cuerpo: Record<string, unknown>, t: string) => Promise<unknown> }) {
  const [rol, setRol] = useState<'dueno' | 'admin' | 'consulta' | 'empleado'>('admin')
  const [nombre, setNombre] = useState(''); const [email, setEmail] = useState(''); const [nif, setNif] = useState(''); const [titulo, setTitulo] = useState('')
  const [hs, setHs] = useState<string[]>([])
  const contratadas = c.herramientas.filter((h) => h.estado === 'activa' || h.estado === 'pendiente_firma')
  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    const cuerpo = rol === 'dueno' ? { accion: 'dueno', nombre, email, nif, titulo, origen: { fuente: 'manual' } } : { accion: 'acceso', nombre, email, rol, herramientas: rol === 'consulta' ? [] : hs, origen: { fuente: 'manual' } }
    if (await alGuardar(cuerpo, rol === 'dueno' ? 'Dueño fijado.' : 'Acceso concedido.')) { setNombre(''); setEmail(''); setNif(''); setTitulo(''); setHs([]) }
  }
  return (
    <details><summary style={{ cursor: 'pointer', minHeight: 44 }}>Añadir persona / cambiar dueño</summary>
      <form onSubmit={enviar} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <select style={inp} value={rol} onChange={(x) => setRol(x.target.value as typeof rol)}>
          <option value="dueno">Dueño con poderes (firma el contrato)</option><option value="admin">Administración (opera lo concedido, no firma)</option><option value="consulta">Consulta (ve todo, no firma ni da accesos)</option><option value="empleado">Empleado (entra en cada app con su acceso de empleado)</option>
        </select>
        <input style={inp} placeholder="Nombre y apellidos" value={nombre} onChange={(x) => setNombre(x.target.value)} required />
        <input style={inp} placeholder="Correo" type="email" value={email} onChange={(x) => setEmail(x.target.value)} required />
        {rol === 'dueno' && <><input style={inp} placeholder="NIF/NIE del firmante" value={nif} onChange={(x) => setNif(x.target.value)} />
          <select style={inp} value={titulo} onChange={(x) => setTitulo(x.target.value)}><option value="">Cargo: sin confirmar</option><option value="administrador">Administrador</option><option value="apoderado">Apoderado</option></select>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cambiar el dueño anula el contrato pendiente: habrá que reemitirlo (nuevo OK).</div></>}
        {(rol === 'admin' || rol === 'empleado') && contratadas.map((h) => <label key={h.herramienta} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" style={{ width: 22, height: 22 }} checked={hs.includes(h.herramienta)} onChange={(x) => setHs((v) => x.target.checked ? [...v, h.herramienta] : v.filter((y) => y !== h.herramienta))} />{CATALOGO[h.herramienta].nombre}</label>)}
        <button type="submit" style={btnP}>Guardar</button>
      </form>
    </details>
  )
}

function Sugerencias({ s, c, alCopiar }: { s: { estado: string; sugerencias: Sugerencia[] | null }; c: Cuenta; alCopiar: (cuerpo: Record<string, unknown>, t: string) => Promise<unknown> }) {
  if (s.estado !== 'ok' || !s.sugerencias) {
    const t: Record<string, string> = { no_encontrado: 'No encuentro esta sociedad por su CIF en la cartera (el índice puede estar incompleto: no quiere decir que no sea cliente).', ambiguo: 'Hay varias fichas con ese CIF en la cartera: revísalo en /correduria.', no_se_pudo_leer: 'No se pudieron leer las relaciones (no es «no hay»).' }
    return <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{t[s.estado] ?? 'Sin sugerencias.'}</div>
  }
  if (!s.sugerencias.length) return <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>La ficha de la sociedad no tiene relaciones anotadas.</div>
  return <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>{s.sugerencias.map((x) => <FilaSugerencia key={x.relacionadoId} x={x} c={c} alCopiar={alCopiar} />)}</div>
}

function FilaSugerencia({ x, c, alCopiar }: { x: Sugerencia; c: Cuenta; alCopiar: (cuerpo: Record<string, unknown>, t: string) => Promise<unknown> }) {
  const [rol, setRol] = useState<string>(x.rol ?? '')
  const [email, setEmail] = useState('')
  const [titulo, setTitulo] = useState<string>(x.titulo ?? '')
  const todas = c.herramientas.filter((h) => h.estado === 'activa' || h.estado === 'pendiente_firma').map((h) => h.herramienta)
  async function copiar() {
    const cuerpo = rol === 'dueno'
      ? { accion: 'dueno', nombre: x.nombre, email, nif: '', titulo, origen: x.origen }
      : { accion: 'acceso', nombre: x.nombre, email, rol, herramientas: rol === 'admin' || rol === 'empleado' ? todas : [], origen: x.origen }
    await alCopiar(cuerpo, `${x.nombre} copiado a Mi empresa como ${ROL[rol]}.`)
  }
  return (
    <div style={{ ...card, padding: 10, display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div><strong>{x.nombre}</strong> · {x.tipo} <span style={{ fontSize: 12, color: 'var(--muted)' }}>({x.motivo})</span></div>
      <select style={inp} value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Rol">
        <option value="">Sin rol (no se copia)</option><option value="dueno">Dueño (firma)</option><option value="admin">Administración (todas las herramientas contratadas)</option><option value="consulta">Consulta</option><option value="empleado">Empleado</option>
      </select>
      {rol === 'dueno' && <select style={inp} value={titulo} onChange={(e) => setTitulo(e.target.value)}><option value="">Cargo: sin confirmar</option><option value="administrador">Administrador</option><option value="apoderado">Apoderado</option></select>}
      <input style={inp} type="email" placeholder="Correo (cópialo de su ficha en /correduria)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="button" style={btn} disabled={!rol || !/@/.test(email)} onClick={copiar}>Copiar a Mi empresa</button>
    </div>
  )
}
