'use client'
import { useId, useState } from 'react'

/**
 * Las dos piezas vivas del enlace de invitación:
 *
 *   - `EntrarConCodigo` — el código de un solo uso, igual que en la entrada del
 *     portal. Es lo que hace que el token del correo no sea una llave: quien
 *     abre el enlace tiene que probar que ese buzón es suyo.
 *   - `ResponderInvitacion` — aceptar o rechazar, ya con sesión.
 *
 * Nada de esto lee la BD ni conoce ninguna ficha: la página servidora resuelve
 * qué se puede contar y estos componentes solo pintan y llaman al puerto.
 */

/* ── Entrar con el código de un solo uso ──────────────────────────────────── */

/**
 * Mismo flujo y mismos dos POST que `app/page.tsx`: pedir el código y canjearlo.
 *
 * 🚨 `canal_no_disponible` (503) NO es «el envío falló» (502), y desde el código
 * las dos cosas se ven idénticas: decirle a alguien que ha fallado el envío
 * cuando en realidad ese canal no está montado es mentirle. Los textos son los
 * de la pantalla de entrada a propósito — la misma situación no puede contarse
 * de dos maneras según por dónde se haya entrado.
 */
const ERROR_ACCESO: Record<string, string> = {
  canal_no_disponible: 'Ese canal todavía no está disponible.',
  envio_fallido: 'No hemos podido enviarte el código. Inténtalo en un momento.',
  caducado: 'El código ha caducado. Pide uno nuevo.',
  ya_usado: 'Ese código ya se usó. Pide uno nuevo.',
  bloqueado: 'Demasiados intentos. Pide un código nuevo.',
  incorrecto: 'El código no es correcto.',
  sin_codigo: 'Pide un código primero.',
  datos_invalidos: 'Revisa el correo que has escrito.',
}

function textoAcceso(codigo: unknown): string {
  return (typeof codigo === 'string' ? ERROR_ACCESO[codigo] : undefined) ?? 'Ha ocurrido un error.'
}

export function EntrarConCodigo() {
  const uid = useId()
  const [destino, setDestino] = useState('')
  const [codigo, setCodigo] = useState('')
  const [fase, setFase] = useState<'pedir' | 'verificar'>('pedir')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pedir() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/acceso/solicitar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'email', destino }),
      })
      if (r.ok) {
        setFase('verificar')
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown } | null
      setError(textoAcceso(cuerpo?.error))
    } catch {
      setError('No hemos podido pedirte el código: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  async function verificar() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/acceso/verificar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'email', destino, codigo }),
      })
      if (r.ok) {
        // Se recarga ESTA misma página en vez de irse a la bóveda: la persona
        // vino a contestar una invitación, y quien decide qué puede ver ahora
        // es el servidor, que es el único que sabe si el correo con el que
        // acaba de entrar es al que se mandó.
        window.location.reload()
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown } | null
      setError(textoAcceso(cuerpo?.error))
    } catch {
      setError('No hemos podido comprobar el código: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="editor" style={{ marginTop: 12 }}>
      {fase === 'pedir' ? (
        <>
          <label htmlFor={`${uid}-email`} style={{ fontSize: 13, fontWeight: 600 }}>
            Tu correo
          </label>
          <input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            className="campo"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="tu@email.com"
            disabled={enviando}
          />
          <button
            type="button"
            className="boton"
            onClick={() => void pedir()}
            disabled={enviando || destino.trim() === ''}
          >
            {enviando ? 'Enviando…' : 'Enviarme un código'}
          </button>
        </>
      ) : (
        <>
          <p className="suave" style={{ margin: 0 }}>
            Te hemos enviado un código a {destino}. Caduca en 10 minutos.
          </p>
          <label htmlFor={`${uid}-codigo`} style={{ fontSize: 13, fontWeight: 600 }}>
            El código
          </label>
          <input
            id={`${uid}-codigo`}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="campo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="123456"
            disabled={enviando}
          />
          <button
            type="button"
            className="boton"
            onClick={() => void verificar()}
            disabled={enviando || codigo.trim() === ''}
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            className="boton secundario"
            onClick={() => {
              setFase('pedir')
              setCodigo('')
              setError(null)
            }}
            disabled={enviando}
          >
            Usar otro correo
          </button>
        </>
      )}
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/* ── Aceptar o rechazar, ya con sesión ───────────────────────────────────── */

/**
 * Qué recibe quien acepta, dicho desde SU lado.
 *
 * No se importa el mapa de `Autorizaciones.tsx` a propósito: allí las frases
 * están escritas para el que CONCEDE («los datos de la póliza, sin lo que
 * pagas») y aquí para el que recibe. Y son alcances de LECTURA porque una
 * invitación no apodera a nadie: `partes` y `documentos` exigen decir con qué
 * título se representa a una sociedad, y a quien todavía no ha probado ser esa
 * dirección de correo no se le delega eso.
 */
const QUE_RECIBES: Record<string, string> = {
  ver: 'los datos de sus pólizas: la compañía, el número de póliza y las coberturas. No verás lo que paga.',
  ver_economico: 'los datos de sus pólizas y, además, lo que paga: la prima y los recibos.',
  partes: 'los datos de sus pólizas, y podrás dar partes en su nombre.',
  documentos: 'los datos de sus pólizas y su documentación.',
}

/** Errores de `POST /api/invitaciones/responder`. */
const ERROR_RESPONDER: Record<string, string> = {
  // 🚨 Igual que la página del enlace muerto: no se distingue «no existe» de
  // «ya no vale». Un texto distinto por cada caso convertiría este botón en la
  // misma máquina de comprobar tokens que la página evita.
  no_encontrada: 'Este enlace ya no vale. Pídele a esa persona que te invite otra vez.',
  no_es_tu_correo:
    'Esta invitación se mandó a otro correo. Sal y entra con la dirección a la que te llegó.',
  sin_sesion: 'Se ha cerrado tu sesión. Vuelve a entrar con tu correo y lo intentamos otra vez.',
  datos_invalidos: 'No hemos entendido la petición. Vuelve a cargar la página e inténtalo otra vez.',
}

function textoResponder(codigo: unknown, mensaje: unknown): string {
  // Manda el `mensaje` del servidor: es el que sabe por qué. La tabla queda de
  // red por debajo, para los códigos que llegan sin frase.
  if (typeof mensaje === 'string' && mensaje.trim() !== '') return mensaje
  if (typeof codigo === 'string' && ERROR_RESPONDER[codigo]) return ERROR_RESPONDER[codigo]
  return 'No hemos podido guardarlo. Inténtalo otra vez dentro de un momento.'
}

const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Fecha en español legible. Un `YYYY-MM-DD` es un DÍA, sin hora ni zona: se
 * fuerza medianoche UTC y se formatea en UTC, o el 3 sale como el 2 para media
 * Europa (misma regla que `lib/fechas.ts`).
 */
function fechaLarga(v: string | null): string | null {
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

export function ResponderInvitacion({
  token,
  otorganteNombre,
  alcance,
  polizaId,
  polizaEtiqueta,
  mensaje,
  caducaEn,
}: {
  token: string
  /** `null` = no hemos podido leer su nombre. No se inventa uno ni se pinta un uuid. */
  otorganteNombre: string | null
  alcance: string
  /** `null` = todas sus pólizas, también las que contrate más adelante. */
  polizaId: string | null
  polizaEtiqueta: string | null
  /** Lo que escribió quien invita. `null` = no escribió nada (nunca `''`). */
  mensaje: string | null
  caducaEn: string
}) {
  const [enviando, setEnviando] = useState<'aceptar' | 'rechazar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<'rechazada' | null>(null)

  // `null` o vacío = no sabemos su nombre. Se dice «Una persona» y no se
  // inventa ninguno: quien recibe esto decide sobre datos de un tercero.
  const nombre = (otorganteNombre ?? '').trim()
  const quien = nombre === '' ? 'Una persona' : nombre
  const caduca = fechaLarga(caducaEn)

  async function responder(accion: 'aceptar' | 'rechazar') {
    setEnviando(accion)
    setError(null)
    try {
      const r = await fetch('/api/invitaciones/responder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, accion }),
      })
      if (r.ok) {
        // Aceptar lleva a la bóveda, que es donde ya están sus pólizas.
        // Rechazar se queda aquí: irse a un sitio con seguros ajenos después de
        // decir que no sería justo lo contrario de lo que la persona pidió.
        if (accion === 'aceptar') {
          window.location.href = '/boveda'
          return
        }
        setHecho('rechazada')
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: unknown; mensaje?: unknown } | null
      setError(textoResponder(cuerpo?.error, cuerpo?.mensaje))
    } catch {
      setError('No hemos podido guardarlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(null)
    }
  }

  if (hecho === 'rechazada') {
    return (
      <div className="seccion">
        <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Has rechazado la invitación</h1>
        <p style={{ marginTop: 0 }}>
          No verás los seguros de {quien} y este enlace ya no vale. Si cambias de idea, pídele que te
          invite otra vez.
        </p>
      </div>
    )
  }

  return (
    <div className="seccion">
      <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>
        {quien} quiere darte acceso a{' '}
        {polizaId === null ? <>sus seguros</> : <>una de sus pólizas</>}
      </h1>

      {/* Lo que escribió quien invita. Va como texto (React lo escapa), y
          separado de lo que decimos nosotros: es su mensaje, no el nuestro. */}
      {mensaje !== null && mensaje.trim() !== '' && (
        <blockquote
          style={{
            margin: '12px 0 0',
            padding: '10px 12px',
            borderLeft: '3px solid var(--border)',
            fontSize: 14,
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
          }}
        >
          {mensaje}
        </blockquote>
      )}

      <div className="linea" style={{ marginTop: 12 }}>
        Si lo aceptas, podrás ver {QUE_RECIBES[alcance] ?? 'los datos de sus pólizas.'}
      </div>

      {polizaId === null ? (
        <div className="linea dicho">
          Alcanza a <strong>todas las pólizas de {quien}</strong>, también a las que contrate más
          adelante.
        </div>
      ) : (
        <div className="linea dicho">
          Alcanza <strong>solo a {polizaEtiqueta ?? 'una póliza concreta'}</strong>
          {polizaEtiqueta === null ? ' (no hemos podido leer cuál es)' : ''}. El resto de sus seguros no
          los verás.
        </div>
      )}

      {caduca && (
        <div className="linea dicho">
          Tienes hasta el <strong>{caduca}</strong> para contestar. Después, esta invitación se queda en
          nada y {quien} tendría que mandarte otra.
        </div>
      )}

      {/* 🚨 La mitad que hace que la autorización valga, con las mismas palabras
          que en «Quién puede ver mis seguros»: aceptar no es un trámite, es lo
          que te hace responsable de lo que mires. No se suaviza. */}
      <div className="aviso-linea">
        Si lo aceptas, <strong>queda registrado que has accedido a los datos de otra persona</strong>: se
        guarda quién eres, cuándo lo aceptaste y cada día que entres a mirar. {quien} puede ver ese
        registro y quitarte el acceso cuando quiera. Solo podrás mirar: no puedes dar partes ni cambiar
        nada suyo, y no ves su DNI, su IBAN ni sus documentos.
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
          onClick={() => void responder('rechazar')}
          disabled={enviando !== null}
        >
          {enviando === 'rechazar' ? 'Rechazando…' : 'Rechazar'}
        </button>
      </div>
    </div>
  )
}
