'use client'
import { useEffect, useState } from 'react'

import { MarcaAsegura } from './MarcaAsegura'

/**
 * La pantalla de entrada: pedir el código y canjearlo.
 *
 * 🚨 Vive aquí y no en `page.tsx` desde el 05/09/2026, y no es un refactor: la
 * raíz `/` era este componente de CLIENTE y por tanto **no miraba nunca si ya
 * había sesión**. Quien entraba con su cookie de 30 días viva veía igualmente
 * «tu@email.com · Enviarme un código», y la conclusión razonable de cualquiera
 * —la de Alberto, literal— es «me pide el código cada vez que entro». La sesión
 * no se caía: la puerta no miraba. Ahora `page.tsx` es un componente de
 * servidor que resuelve la sesión y solo monta esto si NO la hay.
 */
export function Entrada() {
  const [destino, setDestino] = useState('')
  const [codigo, setCodigo] = useState('')
  const [fase, setFase] = useState<'pedir' | 'verificar'>('pedir')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [desdeEnlace, setDesdeEnlace] = useState(false)
  // La llave del ENLACE DIRECTO del correo de avisos (un solo uso, 72 h). Mientras la hay, no se
  // pide código: se entra con un clic en «Entrar» (POST), nunca solo al abrir el enlace.
  const [enlace, setEnlace] = useState<string | null>(null)

  // El enlace del correo trae el email y el código ya puestos, pero NO entra
  // solo: el canje sigue siendo un POST que dispara la persona. Un enlace que
  // canjeara con el GET lo consumirían los escáneres antivirus del correo antes
  // de que el usuario lo tocase, y el código le saldría `ya_usado`.
  //
  // Se lee de `window.location` en un efecto y no con `useSearchParams` para no
  // arrastrar la página entera a render dinámico por leer dos parámetros.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const d = q.get('d')
    const c = q.get('c')
    const e = q.get('e')
    if (d && e) {
      setDestino(d)
      setEnlace(e)
      setFase('verificar')
      setDesdeEnlace(true)
      window.history.replaceState(null, '', window.location.pathname)
      return
    }
    if (!d || !c) return

    setDestino(d)
    setCodigo(c)
    setFase('verificar')
    setDesdeEnlace(true)
    // El código no se queda en la barra ni en el historial más de lo necesario.
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  async function pedir() {
    setError(null)
    const r = await fetch('/api/acceso/solicitar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', destino }),
    })
    if (r.ok) setFase('verificar')
    else setError((await r.json()).error ?? 'error')
  }

  async function verificar() {
    setError(null)
    const r = await fetch('/api/acceso/verificar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(enlace ? { tipo: 'email', destino, enlace } : { tipo: 'email', destino, codigo }),
    })
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; vinculo?: string; irA?: string }
    if (!r.ok) {
      // El enlace ya no vale (usado, caducado o no es de este correo): se cae al acceso de siempre,
      // con el correo ya puesto, y se dice por qué.
      if (enlace) {
        setEnlace(null)
        setFase('pedir')
        return setError(`enlace_${cuerpo.error ?? 'error'}`)
      }
      return setError(cuerpo.error ?? 'error')
    }
    // A dónde ir lo decide el servidor (ruta interna validada); por defecto, la bóveda.
    const irA = typeof cuerpo.irA === 'string' && cuerpo.irA.startsWith('/') && !cuerpo.irA.startsWith('//') ? cuerpo.irA : '/boveda'
    // El vínculo con la cartera no bloquea la entrada, pero si no se ha podido
    // resolver se dice antes de irse: un «no tienes pólizas» sin esta línea
    // sería una afirmación sobre algo que no se ha mirado.
    const texto = textoVinculo(cuerpo.vinculo)
    if (texto) {
      setAviso(texto)
      setTimeout(() => (window.location.href = irA), 2500)
    } else {
      window.location.href = irA
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="seccion">
        {/* El logo va EN LÍNEA (no `<img src>`): esta es la primera pantalla y
            no puede quedarse un instante sin decir de quién es. */}
        <span className="entrada-marca">
          <MarcaAsegura alto={34} />
        </span>
        <h1>
          Mis <em>seguros</em>
        </h1>
        <p className="suave" style={{ marginTop: 0 }}>
          Todos tus seguros en un sitio. Gratis, seas cliente o no.
        </p>

      {fase === 'pedir' ? (
        <>
          <input
            type="email"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="tu@email.com"
            className="campo"
          />
          <button onClick={pedir} className="boton" style={{ marginTop: 12 }}>
            Enviarme un código
          </button>
        </>
      ) : (
        <>
          <p className="suave" style={{ marginTop: 0 }}>
            {enlace
              ? `Pulsa «Entrar» para acceder como ${destino}. El enlace vale una sola vez.`
              : desdeEnlace
                ? `Tu código ya está puesto. Pulsa «Entrar» para acceder como ${destino}.`
                : `Te hemos enviado un código a ${destino}. Caduca en 10 minutos.`}
          </p>
          {!enlace && (
            <input
              inputMode="numeric"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="123456"
              className="campo"
            />
          )}
          <button onClick={verificar} className="boton" style={{ marginTop: 12 }}>
            Entrar
          </button>
          {/* Esta línea NO es adorno legal: es lo que hace verdadera la fila
              `lds_art19` que el canje escribe en `portal_consentimiento`. Si se
              quita, el registro pasa a acreditar algo que no ocurrió. Va DEBAJO
              del botón y antes de irse de la pantalla, que es donde el art. 19
              LDS pide que esté: antes de operar, no después. */}
          <p className="nota-legal">
            Al entrar das por leída la{' '}
            <a href="/legal/mediador" target="_blank" rel="noreferrer noopener">
              información del mediador
            </a>{' '}
            y aceptas las{' '}
            <a href="/legal/condiciones" target="_blank" rel="noreferrer noopener">
              condiciones de uso
            </a>
            . Tratamos tus datos como cuenta la{' '}
            <a href="/legal/privacidad" target="_blank" rel="noreferrer noopener">
              política de privacidad
            </a>
            . Guardamos la fecha, la versión del texto, tu IP y tu navegador como
            prueba de que se te informó.
          </p>
        </>
      )}

        {error && <p style={{ color: 'var(--negative)', marginTop: 12 }}>{textoError(error)}</p>}
        {aviso && <p className="aviso-linea" role="status">{aviso}</p>}
      </div>
    </main>
  )
}

function textoError(codigo: string): string {
  const mapa: Record<string, string> = {
    canal_no_disponible: 'Ese canal todavía no está disponible.',
    destino_invalido: 'Revisa el correo o el móvil: el móvil va con prefijo, por ejemplo +34600123456.',
    demasiadas_peticiones: 'Has pedido demasiados códigos seguidos. Espera un rato y vuelve a intentarlo.',
    envio_fallido: 'No hemos podido enviarte el código. Inténtalo en un momento.',
    caducado: 'El código ha caducado. Pide uno nuevo.',
    ya_usado: 'Ese código ya se usó. Pide uno nuevo.',
    bloqueado: 'Demasiados intentos. Pide un código nuevo.',
    incorrecto: 'El código no es correcto.',
    sin_codigo: 'Pide un código primero.',
    enlace_ya_usado: 'Ese enlace ya se usó. Pide un código y entras igual.',
    enlace_caducado: 'Ese enlace ha caducado. Pide un código y entras igual.',
    enlace_incorrecto: 'Ese enlace no es válido para este correo. Pide un código.',
  }
  return mapa[codigo] ?? 'Ha ocurrido un error.'
}

/** Solo los estados del vínculo que la persona tiene que saber; el resto no dice nada. */
function textoVinculo(estado: string | undefined): string | null {
  switch (estado) {
    case 'ambiguo':
      return 'Hay varias fichas con este email: el corredor las revisará antes de enseñarte tus pólizas.'
    case 'sin_clave':
    case 'error':
      return 'No se ha podido comprobar la cartera ahora. Entras igual; lo reintentamos la próxima vez.'
    default:
      return null
  }
}
