'use client'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

import { DIAS_VIGENCIA } from '@central/module-seguros-portal'

/**
 * «Quién puede ver mis seguros» — la parte viva de la pantalla.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 LO QUE ESTA PANTALLA NO PUEDE HACER: tranquilizar.
 *
 * Una autorización sirve para demostrar el consentimiento (art. 7.1 RGPD), y un
 * consentimiento que se pinta bonito no demuestra nada. De ahí las tres reglas
 * de copy que sostienen el fichero:
 *
 *   1. **El estado se dice con su CONSECUENCIA.** «Pendiente» a secas no dice
 *      nada; «pendiente de que lo acepte — todavía no ve nada» sí. El otorgante
 *      tiene que poder saber, de un vistazo, si la persona está viendo sus
 *      seguros ahora mismo o no.
 *   2. **`usos: []` es «no ha entrado todavía», y `usos` ausente es «no lo
 *      sabemos».** Son dos cosas distintas y la diferencia es toda la pantalla:
 *      un «sin actividad» (o peor, un check verde) sobre un registro que no nos
 *      ha llegado convierte un «no lo sé» en una afirmación falsa — la regla del
 *      `CLAUDE.md` de la raíz, aplicada al dato que más se mira aquí.
 *   3. **Aceptar dice lo que aceptas.** La segunda mitad de la doble aceptación
 *      no es un trámite: es lo que hace responsable a quien mira. Si el botón no
 *      dice que queda registrado, la autorización no vale para lo que existe.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No lee la BD ni conoce ninguna ficha: todo sale de `/api/autorizaciones`, que
 * es quien resuelve el vínculo de esta identidad. Los ids que se mandan de
 * vuelta al conceder son SIEMPRE los que vinieron en `candidatos`; esta pantalla
 * no compone ninguno.
 *
 * Móvil primero (≥320 px): una columna, tarjetas apiladas, nada de tablas, todo
 * lo pulsable por encima de 44 px y campos a 16 px (por debajo, Safari en
 * iPhone hace zoom al enfocar). Lo dan `.cartera`, `.boton`, `.campo` y
 * `.opcion` de `globals.css`.
 */

export type Alcance = 'ver' | 'ver_economico' | 'partes' | 'documentos'
export type EstadoAutorizacion = 'pendiente' | 'vigente' | 'caducada' | 'revocada'

/**
 * Un día con visitas.
 *
 * `dia` llega por JSON, así que es la cadena que produce `Date.toJSON()` de la
 * ruta (ISO completo, medianoche UTC) — y **se formatea en UTC**, como el resto
 * de columnas `date` del portal (`lib/fechas.ts`): en cuanto se pinta en la zona
 * del navegador, «entró el 3» puede salir «el 2» para media Europa.
 */
type Uso = { dia: string; visitas: number }

type AutorizacionVista = {
  id: string
  alcance: Alcance
  estado: EstadoAutorizacion
  otorganteClienteId: string
  otorganteNombre: string | null
  autorizadoClienteId: string
  autorizadoNombre: string | null
  otorgadoEn: string
  aceptadoEn: string | null
  caducaEn: string
  revocadoEn: string | null
  /**
   * 🚨 `null` y `[]` NO son lo mismo, y el contrato lo dice explícitamente:
   * `null` = **no lo sabemos** (en las RECIBIDAS viene siempre así: el registro
   * de accesos de otro no te toca verlo); `[]` = **lo hemos mirado y no ha
   * entrado**. Colapsar los dos convertiría un «no lo sé» en la afirmación de
   * que nadie entró — que es justo el dato sobre el que se decide revocar.
   */
  usos: Uso[] | null
  /**
   * Si esta fila la puede revocar QUIEN MIRA. Viene del backend en las dos
   * listas y no se deduce aquí: en las recibidas, renunciar es un acto del
   * autorizado y solo el servidor sabe si lo admite. Sin este campo habría que
   * adivinarlo y pintar un botón que devuelve `no_te_toca`.
   */
  puedoRevocar: boolean
}

type Candidato = {
  otorganteClienteId: string
  otorganteNombre: string | null
  autorizadoClienteId: string
  autorizadoNombre: string | null
  tipoRelacion: string
  /** Los que ya ocupan sitio para esta pareja (pendientes o vigentes). */
  yaConcedidos: Alcance[]
}

type Respuesta = {
  puedeAutorizar: boolean
  otorgadas: AutorizacionVista[]
  recibidas: AutorizacionVista[]
  candidatos: Candidato[]
}

type Carga = 'cargando' | 'listo' | 'error'

/** Los dos que se pueden conceder hoy, en el orden en que se ofrecen. */
const CONCEDIBLES = ['ver', 'ver_economico'] as const
type Concedible = (typeof CONCEDIBLES)[number]

/**
 * Qué ve cada alcance, en el idioma de quien lo concede. No es la etiqueta del
 * enum: es la frase que le permite a José decidir. «ver_economico» dice que
 * incluye lo anterior porque en el módulo `completo` es un superconjunto de
 * `tarjeta`, y sin decirlo la gente marca las dos casillas «por si acaso».
 */
const QUE_VE: Record<Alcance, string> = {
  ver: 'los datos de la póliza, sin lo que pagas',
  ver_economico: 'los datos de la póliza y, además, la prima y los recibos',
  // Los dos de abajo NO se conceden hoy (son apoderamiento, no lectura), pero
  // pueden llegar en una fila antigua o del CRM: se describen para no pintar el
  // identificador crudo.
  partes: 'los datos de la póliza y dar partes',
  documentos: 'los datos de la póliza y sus documentos',
}

/**
 * Las dos opciones del formulario, y son EXCLUYENTES a propósito: `ver_economico`
 * ya incluye todo lo de `ver` (el módulo lo deriva de `completo ⊃ tarjeta`), así
 * que ofrecerlas como dos casillas independientes proponía una combinación
 * redundante — y, peor, obligaba a dos POST, con la posibilidad de que el
 * segundo fallara y dejase el permiso concedido a medias sin que nadie lo dijera.
 * Un solo alcance por concesión, un solo POST.
 */
const ETIQUETA_OPCION: Record<Concedible, string> = {
  ver: 'Solo ver sus seguros — la compañía, el número de póliza y las coberturas',
  ver_economico: 'Ver también lo que paga — la prima y los recibos',
}

const AYUDA_OPCION: Record<Concedible, string> = {
  ver: 'No ve nada de lo que pagas.',
  ver_economico: 'Incluye todo lo de la opción de arriba.',
}

/** Errores de `POST /api/autorizaciones`. Códigos → lo que la persona puede HACER. */
const ERROR_CONCEDER: Record<string, string> = {
  sin_sesion: 'Se ha cerrado tu sesión. Vuelve a entrar con tu email y lo intentamos otra vez.',
  datos_invalidos: 'Falta algún dato: elige a la persona y marca al menos qué puede ver.',
  alcance_no_disponible:
    'Ese permiso todavía no se puede dar por aquí. Hoy solo se puede dejar MIRAR: dar partes o descargar documentos en tu nombre es actuar por ti, y eso necesita algo más que una casilla.',
  ficha_no_tuya: 'Esa ficha no es tuya, así que no podemos dar acceso a sus seguros desde tu cuenta.',
  nivel_insuficiente:
    'Sobre esa ficha no eres tú quien puede dar acceso: solo su titular puede ceder sus datos.',
  sin_relacion:
    'No nos consta la relación entre vosotros, así que no podemos darle acceso. Escríbenos y lo damos de alta.',
  ya_concedida: 'Ese acceso ya estaba concedido. Lo verás en la lista de arriba.',
}

/** Errores de `POST /api/autorizaciones/[id]`. */
const ERROR_ACCION: Record<string, string> = {
  sin_sesion: 'Se ha cerrado tu sesión. Vuelve a entrar con tu email y lo intentamos otra vez.',
  datos_invalidos: 'No hemos entendido la petición. Vuelve a cargar la pantalla e inténtalo otra vez.',
  no_encontrada: 'Esa autorización ya no existe. Vuelve a cargar la pantalla.',
  no_te_toca: 'Esa autorización no es tuya, así que no podemos tocarla desde tu cuenta.',
  ya_revocada: 'Ya estaba revocada: esa persona no ve nada.',
  no_pendiente: 'Esa autorización ya no está pendiente. Vuelve a cargar la pantalla para verla como está.',
}

function textoError(tabla: Record<string, string>, codigo: unknown, mensaje: unknown): string {
  if (typeof codigo === 'string' && tabla[codigo]) return tabla[codigo]
  // Un código que no conocemos NO se adivina: se dice literal, que es honesto y
  // le sirve al soporte. Si el backend mandó una frase, esa manda.
  if (typeof mensaje === 'string' && mensaje.trim() !== '') return mensaje
  const c = typeof codigo === 'string' ? ` (${codigo})` : ''
  return `No hemos podido hacerlo${c}. Inténtalo otra vez dentro de un momento.`
}

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Fecha en español legible («3 de septiembre de 2026»), nunca en ISO.
 *
 * Un `YYYY-MM-DD` es un DÍA, sin hora ni zona: se fuerza medianoche UTC y se
 * formatea en UTC para que el 3 no salga como el 2. Una marca de tiempo
 * completa sí se pinta en la zona de quien mira, que es la que le dice cuándo
 * pasó de verdad.
 */
function fechaLarga(v: string | null | undefined): string | null {
  if (!v) return null
  const dia = SOLO_DIA.test(v)
  const d = new Date(dia ? `${v}T00:00:00Z` : v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(dia ? { timeZone: 'UTC' } : {}),
  })
}

/**
 * Un día de acceso → `Date`. Acepta las dos formas en que puede venir el mismo
 * dato: `YYYY-MM-DD` y el ISO completo de `Date.toJSON()` (que es lo que manda
 * hoy la ruta). `null` si no es ninguna de las dos: un día ilegible se calla, no
 * se inventa.
 */
function aDia(v: string): Date | null {
  const d = new Date(SOLO_DIA.test(v) ? `${v}T00:00:00Z` : v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** «3 de septiembre» (con el año solo si no es este, que sería ruido). */
function diaCorto(v: string, anioActual: number): string {
  const d = aDia(v)
  if (d === null) return v
  const conAnio = d.getUTCFullYear() !== anioActual
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    ...(conAnio ? { year: 'numeric' } : {}),
  })
}

/** «el 3 y el 12 de septiembre» cuando todo cae en el mismo mes; si no, cada día entero. */
function enumerarDias(usos: readonly Uso[], anioActual: number): string {
  const fechas = usos
    .map((u) => aDia(u.dia))
    .filter((d): d is Date => d !== null)
  const mismoMes =
    fechas.length > 1 &&
    fechas.every(
      (d) => d.getUTCMonth() === fechas[0].getUTCMonth() && d.getUTCFullYear() === fechas[0].getUTCFullYear(),
    )

  const trozos = mismoMes
    ? fechas.map((d) => String(d.getUTCDate()))
    : usos.map((u) => diaCorto(u.dia, anioActual))

  const unidos =
    trozos.length === 1
      ? trozos[0]
      : `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}`

  if (!mismoMes) return unidos
  const mes = fechas[0].toLocaleDateString('es-ES', {
    month: 'long',
    timeZone: 'UTC',
    ...(fechas[0].getUTCFullYear() !== anioActual ? { year: 'numeric' } : {}),
  })
  return `${unidos} de ${mes}`
}

function nombreDe(v: string | null, porDefecto: string): string {
  const n = (v ?? '').trim()
  return n === '' ? porDefecto : n
}

export function Autorizaciones() {
  const uid = useId()
  const [carga, setCarga] = useState<Carga>('cargando')
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setErrorCarga(null)
    try {
      const r = await fetch('/api/autorizaciones', { cache: 'no-store' })
      if (r.status === 401) {
        setCarga('error')
        setErrorCarga('Se ha cerrado tu sesión. Vuelve a entrar con tu email para ver quién tiene acceso.')
        return
      }
      if (!r.ok) {
        // Un fallo NO se pinta como «no tienes ninguna»: eso convertiría un
        // error de red en la afirmación de que nadie ve tus seguros.
        setCarga('error')
        setErrorCarga('No hemos podido cargar quién tiene acceso a tus seguros. Vuelve a intentarlo.')
        return
      }
      setDatos((await r.json()) as Respuesta)
      setCarga('listo')
    } catch {
      setCarga('error')
      setErrorCarga('No hemos podido cargar quién tiene acceso: comprueba tu conexión e inténtalo otra vez.')
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (carga === 'cargando') {
    return (
      <section className="seccion" aria-busy="true">
        <p className="suave" style={{ margin: 0 }}>
          Cargando quién puede ver tus seguros…
        </p>
      </section>
    )
  }

  if (carga === 'error' || datos === null) {
    return (
      <section className="seccion">
        <p className="editor-error" role="alert" style={{ marginTop: 0 }}>
          {errorCarga ?? 'No hemos podido cargar quién tiene acceso a tus seguros.'}
        </p>
        <button type="button" className="boton" onClick={() => void cargar()}>
          Volver a intentarlo
        </button>
      </section>
    )
  }

  return (
    <>
      <Otorgadas uid={uid} lista={datos.otorgadas} onCambio={cargar} />
      <Recibidas uid={uid} lista={datos.recibidas} onCambio={cargar} />
      <Conceder
        uid={uid}
        puedeAutorizar={datos.puedeAutorizar}
        candidatos={datos.candidatos}
        onConcedida={cargar}
      />
    </>
  )
}

/* ── 1. Has dado acceso a ──────────────────────────────────────────────── */

function Otorgadas({
  uid,
  lista,
  onCambio,
}: {
  uid: string
  lista: readonly AutorizacionVista[]
  onCambio: () => Promise<void>
}) {
  return (
    <section className="seccion" aria-labelledby={`${uid}-otorgadas`}>
      <h2 id={`${uid}-otorgadas`}>Has dado acceso a</h2>
      {lista.length === 0 ? (
        // «No le has dado acceso a nadie» es una afirmación sobre TUS actos, que
        // sí sabemos. No se dice «nadie ve tus seguros»: de lo que otros hayan
        // hecho con sus propias fichas no habla esta lista.
        <p className="suave" style={{ margin: 0 }}>
          No le has dado acceso a tus seguros a nadie.
        </p>
      ) : (
        <ul className="cartera">
          {lista.map((a) => (
            <TarjetaOtorgada key={a.id} a={a} onCambio={onCambio} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TarjetaOtorgada({ a, onCambio }: { a: AutorizacionVista; onCambio: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quien = nombreDe(a.autorizadoNombre, 'Alguien de tu entorno')
  // Revocable = lo dice el backend Y todavía queda algo que quitar. Una caducada
  // o una ya revocada no ve nada: un botón ahí solo confundiría.
  const activa = (a.estado === 'pendiente' || a.estado === 'vigente') && a.puedoRevocar

  async function revocar() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch(`/api/autorizaciones/${encodeURIComponent(a.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'revocar' }),
      })
      if (r.ok) {
        setConfirmando(false)
        await onCambio()
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null
      setError(textoError(ERROR_ACCION, cuerpo?.error, cuerpo?.mensaje))
    } catch {
      setError('No hemos podido revocarlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <li className="cartera-card">
      <h3>{quien}</h3>
      <div className="linea">Ve {QUE_VE[a.alcance] ?? a.alcance}.</div>
      <EstadoOtorgada a={a} quien={quien} />
      <Accesos a={a} quien={quien} />

      <div className="chips">
        <span className={a.estado === 'vigente' ? 'chip ok' : a.estado === 'pendiente' ? 'chip aviso' : 'chip'}>
          {a.estado === 'vigente'
            ? 'en vigor'
            : a.estado === 'pendiente'
              ? 'pendiente de que lo acepte'
              : a.estado === 'caducada'
                ? 'caducada'
                : 'revocada'}
        </span>
        <span className="chip">se lo diste el {fechaLarga(a.otorgadoEn) ?? '—'}</span>
      </div>

      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}

      {activa && !confirmando && (
        <div className="editor" style={{ marginTop: 12 }}>
          <button type="button" className="boton secundario" onClick={() => setConfirmando(true)}>
            Revocar el acceso de {quien}
          </button>
        </div>
      )}

      {activa && confirmando && (
        <div className="aviso-linea">
          <strong>¿Le quitas el acceso a {quien}?</strong> Deja de ver tus seguros ahora mismo. Queda el
          registro de lo que miró mientras lo tuvo, y podrás volver a dárselo cuando quieras.
          <div className="editor-acciones" style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={() => void revocar()} disabled={enviando}>
              {enviando ? 'Revocando…' : 'Sí, revocar'}
            </button>
            <button
              type="button"
              className="boton secundario"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
            >
              No, dejarlo como está
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * 🚨 El estado CON su consecuencia. Nunca la palabra suelta: lo que el otorgante
 * necesita saber es si esa persona está viendo sus seguros ahora o no.
 */
function EstadoOtorgada({ a, quien }: { a: AutorizacionVista; quien: string }) {
  if (a.estado === 'pendiente') {
    const caduca = fechaLarga(a.caducaEn)
    return (
      <div className="linea dicho ojo">
        Pendiente de que {quien} lo acepte — <strong>todavía no ve nada</strong>
        {caduca ? `. Si no lo acepta antes del ${caduca}, se queda en nada.` : '.'}
      </div>
    )
  }
  if (a.estado === 'vigente') {
    const caduca = fechaLarga(a.caducaEn)
    return (
      <div className="linea dicho">
        En vigor{caduca ? ` hasta el ${caduca}` : ''} — lo aceptó
        {fechaLarga(a.aceptadoEn) ? ` el ${fechaLarga(a.aceptadoEn)}` : ''}.
      </div>
    )
  }
  if (a.estado === 'caducada') {
    const caduca = fechaLarga(a.caducaEn)
    return (
      <div className="linea dicho">
        Caducada{caduca ? ` el ${caduca}` : ''} — <strong>ya no ve nada</strong>. Si quieres, vuelve a
        dárselo abajo.
      </div>
    )
  }
  const revocada = fechaLarga(a.revocadoEn)
  return (
    <div className="linea dicho">
      Revocada{revocada ? ` el ${revocada}` : ''} — <strong>ya no ve nada</strong>.
    </div>
  )
}

/**
 * 🚨 EL registro de accesos, que es lo que hace demostrable el consentimiento.
 *
 * Tres estados, no dos:
 *   - `usos === null` → «no lo sabemos». NO se pinta como que no entró.
 *   - `usos` vacío    → «no ha entrado todavía». NUNCA «sin actividad» ni un
 *                       check verde: no entrar no es que todo vaya bien, es un
 *                       hecho neutro que el otorgante tiene derecho a saber.
 *   - con contenido   → los días, dichos en cristiano.
 *
 * Solo se pinta en las OTORGADAS. En las recibidas el contrato manda `null`
 * siempre (el registro de accesos de otro no te toca verlo) y ahí no se
 * menciona el registro: ni «no ha entrado» ni «no lo sabemos» — las dos frases
 * hablarían de un dato que no es de quien mira.
 */
function Accesos({ a, quien }: { a: AutorizacionVista; quien: string }) {
  const anioActual = useMemo(() => new Date().getFullYear(), [])

  if (a.usos === null) {
    return (
      <div className="linea dicho">
        No sabemos si {quien} ha entrado a mirar: no tenemos aquí el registro de accesos.
      </div>
    )
  }
  if (a.usos.length === 0) {
    if (a.estado === 'pendiente') {
      return <div className="linea dicho">No ha entrado a mirar: todavía no lo ha aceptado.</div>
    }
    return <div className="linea dicho">No ha entrado a mirar tus seguros todavía.</div>
  }

  // Se enseñan los últimos días, no todos: una lista de cincuenta fechas en el
  // móvil no la lee nadie, y el total sí se dice entero para no dar la
  // impresión de que entró menos veces de las que entró.
  const MAX = 8
  const mostrados = a.usos.slice(-MAX)
  const visitas = a.usos.reduce((t, u) => t + u.visitas, 0)
  const dias = enumerarDias(mostrados, anioActual)
  const omitidos = a.usos.length - mostrados.length

  return (
    <div className="linea dicho">
      Miró tus seguros el {dias}
      {omitidos > 0 ? ` (y ${omitidos} ${omitidos === 1 ? 'día más' : 'días más'} antes)` : ''} —{' '}
      {visitas === 1 ? '1 visita' : `${visitas} visitas`} en total.
    </div>
  )
}

/* ── 2. Te han dado acceso a ───────────────────────────────────────────── */

function Recibidas({
  uid,
  lista,
  onCambio,
}: {
  uid: string
  lista: readonly AutorizacionVista[]
  onCambio: () => Promise<void>
}) {
  return (
    <section className="seccion" aria-labelledby={`${uid}-recibidas`}>
      <h2 id={`${uid}-recibidas`}>Te han dado acceso a</h2>
      {lista.length === 0 ? (
        <p className="suave" style={{ margin: 0 }}>
          Nadie te ha dado acceso a sus seguros.
        </p>
      ) : (
        <ul className="cartera">
          {lista.map((a) => (
            <TarjetaRecibida key={a.id} a={a} onCambio={onCambio} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TarjetaRecibida({ a, onCambio }: { a: AutorizacionVista; onCambio: () => Promise<void> }) {
  const [enviando, setEnviando] = useState<'aceptar' | 'revocar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoRenuncia, setConfirmandoRenuncia] = useState(false)

  const quien = nombreDe(a.otorganteNombre, 'Una persona de tu entorno')

  async function responder(accion: 'aceptar' | 'revocar') {
    setEnviando(accion)
    setError(null)
    try {
      const r = await fetch(`/api/autorizaciones/${encodeURIComponent(a.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      if (r.ok) {
        await onCambio()
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null
      setError(textoError(ERROR_ACCION, cuerpo?.error, cuerpo?.mensaje))
    } catch {
      setError('No hemos podido guardarlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(null)
    }
  }

  return (
    <li className="cartera-card">
      <h3>Los seguros de {quien}</h3>
      <div className="linea">
        Te deja ver {QUE_VE[a.alcance] ?? a.alcance}. Solo mirar: no puedes dar partes ni cambiar nada
        suyo, y no ves su DNI, su IBAN ni sus documentos.
      </div>

      {a.estado === 'pendiente' && (
        <>
          <div className="linea dicho ojo">
            Pendiente de que lo aceptes — <strong>todavía no ves nada</strong>.
          </div>
          {/* 🚨 La mitad que hace que la autorización valga. Sin esta frase,
              alguien entra en los datos de otro sin saber que existe un registro
              con su nombre, y ese registro es justo lo que le hace responsable
              de lo que mire. No se suaviza. */}
          <div className="aviso-linea">
            Si lo aceptas, <strong>queda registrado que has accedido a los datos de otra persona</strong>:
            se guarda quién eres, cuándo lo aceptaste y cada día que entres a mirar. {quien} puede ver ese
            registro y quitarte el acceso cuando quiera.
          </div>
          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-acciones" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="boton"
              onClick={() => void responder('aceptar')}
              disabled={enviando !== null}
            >
              {enviando === 'aceptar' ? 'Aceptando…' : 'Aceptar y que quede registrado'}
            </button>
            <button
              type="button"
              className="boton secundario"
              onClick={() => void responder('revocar')}
              disabled={enviando !== null}
            >
              {enviando === 'revocar' ? 'Rechazando…' : 'Rechazar'}
            </button>
          </div>
        </>
      )}

      {a.estado === 'vigente' && (
        <>
          <div className="linea dicho">
            En vigor{fechaLarga(a.caducaEn) ? ` hasta el ${fechaLarga(a.caducaEn)}` : ''} — sus pólizas te
            salen en «Mis seguros». Cada vez que entras queda registrado, y {quien} puede quitártelo cuando
            quiera.
          </div>

          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}

          {/* Renunciar. El botón lo autoriza el BACKEND (`puedoRevocar`), no una
              suposición de la pantalla: si el servidor no admite que renuncie el
              autorizado, aquí no hay botón que devuelva `no_te_toca`. Y existe
              porque mirar los datos de otro es una responsabilidad, no un
              premio: quien ya no quiere tenerla tiene que poder soltarla sin
              pedirle el favor al otro. */}
          {a.puedoRevocar && !confirmandoRenuncia && (
            <div className="editor" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="boton secundario"
                onClick={() => setConfirmandoRenuncia(true)}
              >
                Renunciar a este acceso
              </button>
            </div>
          )}

          {a.puedoRevocar && confirmandoRenuncia && (
            <div className="aviso-linea">
              <strong>¿Renuncias a ver los seguros de {quien}?</strong> Dejas de verlos ahora mismo. Queda
              el registro de lo que miraste mientras lo tuviste, y {quien} tendrá que dártelo otra vez si
              vuelve a hacer falta.
              <div className="editor-acciones" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="boton"
                  onClick={() => void responder('revocar')}
                  disabled={enviando !== null}
                >
                  {enviando === 'revocar' ? 'Renunciando…' : 'Sí, renunciar'}
                </button>
                <button
                  type="button"
                  className="boton secundario"
                  onClick={() => setConfirmandoRenuncia(false)}
                  disabled={enviando !== null}
                >
                  No, dejarlo como está
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {a.estado === 'caducada' && (
        <div className="linea dicho">
          Caducada{fechaLarga(a.caducaEn) ? ` el ${fechaLarga(a.caducaEn)}` : ''} —{' '}
          <strong>ya no ves sus seguros</strong>. Si los necesitas, pídele que te lo dé otra vez.
        </div>
      )}

      {a.estado === 'revocada' && (
        <div className="linea dicho">
          Revocada{fechaLarga(a.revocadoEn) ? ` el ${fechaLarga(a.revocadoEn)}` : ''} —{' '}
          <strong>ya no ves sus seguros</strong>.
        </div>
      )}

      {a.estado !== 'pendiente' && a.estado !== 'vigente' && error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/* ── 3. Dar acceso a alguien ───────────────────────────────────────────── */

/** La clave de un candidato: el par de fichas, que es lo que identifica la relación. */
function claveCandidato(c: Candidato): string {
  return `${c.otorganteClienteId}|${c.autorizadoClienteId}`
}

function Conceder({
  uid,
  puedeAutorizar,
  candidatos,
  onConcedida,
}: {
  uid: string
  puedeAutorizar: boolean
  candidatos: readonly Candidato[]
  onConcedida: () => Promise<void>
}) {
  const [seleccion, setSeleccion] = useState('')
  // Un solo alcance, no un conjunto: `ver_economico` ya incluye lo de `ver`.
  // `''` = todavía no ha elegido, que NO es lo mismo que haber elegido el menor.
  const [alcance, setAlcance] = useState<Concedible | ''>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidato = candidatos.find((c) => claveCandidato(c) === seleccion) ?? null

  // Con varias fichas propias (José como particular y como autónomo, por
  // ejemplo) hay que decir DESDE CUÁL se concede: si no, dos entradas con el
  // mismo nombre de destinatario son indistinguibles.
  const variasFichas = new Set(candidatos.map((c) => c.otorganteClienteId)).size > 1

  function elegir(clave: string) {
    setSeleccion(clave)
    // El alcance se reinicia al cambiar de persona: lo elegido para uno no es
    // una respuesta sobre otro.
    setAlcance('')
    setError(null)
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (candidato === null) {
      setError('Elige primero a quién le das acceso.')
      return
    }
    if (alcance === '') {
      setError('Elige qué puede ver.')
      return
    }

    setEnviando(true)
    setError(null)
    try {
      // UNA sola llamada. Elegir `ver_economico` teniendo ya `ver` es una
      // ampliación legítima y se manda tal cual: es el backend quien decide si
      // convive con la anterior o la sustituye, no esta pantalla.
      const r = await fetch('/api/autorizaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          otorganteClienteId: candidato.otorganteClienteId,
          autorizadoClienteId: candidato.autorizadoClienteId,
          alcance,
        }),
      })
      if (r.status !== 201) {
        const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null
        setError(textoError(ERROR_CONCEDER, cuerpo?.error, cuerpo?.mensaje))
        return
      }
      setSeleccion('')
      setAlcance('')
      await onConcedida()
    } catch {
      // No se sabe si llegó a grabarse: se recarga para que la lista de arriba
      // sea la que mande, en vez de dejar a la persona creyendo que no se hizo.
      setError('No hemos podido guardarlo: comprueba tu conexión y mira arriba si se ha concedido.')
      await onConcedida()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="seccion" aria-labelledby={`${uid}-conceder`}>
      <h2 id={`${uid}-conceder`}>Dar acceso a alguien</h2>

      {!puedeAutorizar ? (
        // No es «no se puede»: es que quien cede los datos tiene que ser su
        // dueño. Se dice el porqué para que no parezca una avería.
        <p className="suave" style={{ margin: 0 }}>
          Solo el titular de la ficha puede dar acceso a sus seguros, y tu acceso a esta cartera no es el
          del titular. Si crees que debería serlo, escríbenos y lo revisamos.
        </p>
      ) : candidatos.length === 0 ? (
        <p className="suave" style={{ margin: 0 }}>
          No tenemos registrada a nadie de tu entorno con quien puedas compartir tus seguros. Escríbenos
          diciéndonos a quién quieres dar acceso y lo damos de alta.
        </p>
      ) : (
        <form className="editor-form" onSubmit={enviar} noValidate>
          <div className="editor-campo">
            <label htmlFor={`${uid}-persona`}>A quién</label>
            <p className="editor-ayuda" id={`${uid}-persona-ayuda`}>
              Solo sale quien ya nos consta como parte de tu entorno. Si falta alguien, escríbenos.
            </p>
            <select
              id={`${uid}-persona`}
              className="campo"
              value={seleccion}
              onChange={(e) => elegir(e.target.value)}
              aria-describedby={`${uid}-persona-ayuda`}
              disabled={enviando}
            >
              <option value="">Elige a la persona…</option>
              {candidatos.map((c) => (
                <option key={claveCandidato(c)} value={claveCandidato(c)}>
                  {nombreDe(c.autorizadoNombre, 'Sin nombre')} · {c.tipoRelacion}
                  {variasFichas ? ` · desde ${nombreDe(c.otorganteNombre, 'tu ficha')}` : ''}
                </option>
              ))}
            </select>
          </div>

          {candidato !== null && (
            /* Radios y no casillas: son dos niveles de lo MISMO, no dos permisos
               que se sumen. Las dos a la vista para que se lea que la segunda
               incluye a la primera, y ninguna marcada de salida — un valor por
               defecto aquí sería una decisión tomada por la pantalla sobre los
               datos de alguien. */
            <fieldset className="editor-campo grupo">
              <legend>Qué puede ver</legend>
              <div className="opciones" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {CONCEDIBLES.map((x) => {
                  const ya = candidato.yaConcedidos.includes(x)
                  return (
                    <label key={x} className="opcion" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name={`${uid}-alcance`}
                        value={x}
                        // Lo ya concedido no se vuelve a conceder: se bloquea y
                        // se dice dónde se quita (arriba, que es donde queda
                        // registro de la revocación).
                        checked={alcance === x}
                        disabled={ya || enviando}
                        onChange={() => setAlcance(x)}
                        style={{ marginTop: 3 }}
                      />
                      <span style={{ minWidth: 0 }}>
                        {ETIQUETA_OPCION[x]}
                        <span className="editor-ayuda" style={{ display: 'block', fontWeight: 400 }}>
                          {ya ? 'Ya se lo has concedido. Para quitárselo, revócalo arriba.' : AYUDA_OPCION[x]}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {/* Las dos cosas que hay que saber ANTES de conceder, no después. */}
          <p className="editor-ayuda" style={{ margin: 0 }}>
            El acceso <strong>caduca al año</strong> ({DIAS_VIGENCIA} días) y no se renueva solo: si sigue
            haciendo falta, se vuelve a dar. Puedes <strong>revocarlo en cualquier momento desde aquí</strong>
            . Hasta que la persona lo acepte, no ve nada.
          </p>

          {error && (
            <p className="editor-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="boton"
            disabled={enviando || candidato === null || alcance === ''}
          >
            {enviando ? 'Guardando…' : 'Dar acceso'}
          </button>
        </form>
      )}
    </section>
  )
}
