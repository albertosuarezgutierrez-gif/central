'use client'

// El cliente pide que sus recibos se carguen en otra cuenta (29/09/2026). Dos pasos: IBAN + su correo
// de acceso → código a ese correo → confirmar. Lo que se guarda es una SOLICITUD: la cuenta la cambia
// el corredor en la compañía, y la pantalla lo dice para que nadie crea que ya está hecho.
import { useState } from 'react'

type Estado =
  | { tipo: 'idle' }
  | { tipo: 'enviando' }
  | { tipo: 'codigo'; email: string; aviso?: string }
  | { tipo: 'hecho'; mascara: string }
  | { tipo: 'aviso'; texto: string }

const AVISO_CODIGO: Record<string, string> = {
  iban_invalido: 'Esa cuenta no es un IBAN válido. Revísala: en España son 24 caracteres y empieza por ES.',
  correo_no_es_tuyo: 'Escribe el correo con el que entras en Mis Seguros: el código solo se manda a ese.',
  demasiados: 'Has pedido varios códigos seguidos. Espera un rato y vuelve a intentarlo.',
  envio_fallido: 'No hemos podido mandarte el código. Inténtalo otra vez en unos minutos.',
}

const AVISO_CONFIRMAR: Record<string, string> = {
  codigo_no_valido: 'El código no es correcto o ha caducado. Pide uno nuevo.',
  iban_invalido: 'Esa cuenta no es un IBAN válido.',
  sin_ficha: 'Todavía no tenemos tu ficha enlazada. Llámanos y lo cambiamos por teléfono.',
  varias_fichas: 'Tu acceso está enlazado a varias fichas. Llámanos y lo cambiamos por teléfono.',
  sin_puente: 'Ahora mismo no podemos guardarlo. Inténtalo más tarde o llámanos.',
  error: 'No se ha podido guardar. Inténtalo otra vez o llámanos.',
}

export default function CambioCuenta() {
  const [iban, setIban] = useState('')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [estado, setEstado] = useState<Estado>({ tipo: 'idle' })

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault()
    setEstado({ tipo: 'enviando' })
    const r = await fetch('/api/mis-datos/cuenta/codigo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ iban, email }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { estado?: string; mensaje?: string } | null
    if (r?.ok && j?.estado === 'codigo_enviado') return setEstado({ tipo: 'codigo', email })
    // El modo corredor (Alberto mirando como el cliente) contesta con su propio `mensaje`: se dice tal cual.
    setEstado({ tipo: 'aviso', texto: j?.mensaje ?? AVISO_CODIGO[j?.estado ?? ''] ?? AVISO_CODIGO.envio_fallido })
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setEstado({ tipo: 'enviando' })
    const r = await fetch('/api/mis-datos/cuenta', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ iban, codigo }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { estado?: string; mascara?: string; motivo?: string; mensaje?: string } | null
    if (r?.ok && j?.estado === 'ok' && j.mascara) return setEstado({ tipo: 'hecho', mascara: j.mascara })
    if (r?.ok && j?.estado === 'sin_cambios') return setEstado({ tipo: 'aviso', texto: 'Esa cuenta ya es la que tenemos para tus recibos: no hay nada que cambiar.' })
    const texto = j?.mensaje ?? ((j?.estado === 'iban_invalido' && j.motivo) || AVISO_CONFIRMAR[j?.estado ?? ''] || AVISO_CONFIRMAR.error)
    // Un código mal tecleado se puede volver a escribir: no se obliga a pedir otro (hay 3 por hora).
    if (j?.estado === 'codigo_no_valido' && j.motivo === 'incorrecto') return setEstado({ tipo: 'codigo', email, aviso: 'Ese código no es correcto. Revísalo y vuelve a escribirlo.' })
    setEstado({ tipo: 'aviso', texto })
  }

  const enviando = estado.tipo === 'enviando'
  const conCodigo = estado.tipo === 'codigo' || (enviando && codigo !== '')

  return (
    <section className="seccion" aria-labelledby="cambio-cuenta-titulo">
      <p className="antetitulo">Dónde se cargan tus recibos</p>
      <h2 id="cambio-cuenta-titulo">Cambiar la cuenta bancaria</h2>
      <p className="supresion-intro">
        Escribe la cuenta nueva y te mandaremos un código a tu correo para confirmarlo. <strong>No se cambia al
        momento:</strong> nos llega el aviso y la cambiamos nosotros en cada compañía. Hasta entonces, los recibos
        pueden seguir llegando a la cuenta de siempre.
      </p>

      {estado.tipo === 'hecho' ? (
        <p role="status" className="mi-direccion-ok">
          Recibido: tus recibos pasarán a cargarse en la cuenta <strong>{estado.mascara}</strong> en cuanto la cambiemos
          en la compañía. Te avisaremos si necesitamos algo más.
        </p>
      ) : (
        <form onSubmit={conCodigo ? confirmar : pedirCodigo} className="mi-direccion-form">
          <label className="mi-direccion-campo">
            <span>Cuenta nueva (IBAN)</span>
            <input
              value={iban}
              onChange={(e) => { setIban(e.target.value.toUpperCase()); if (estado.tipo === 'codigo') setEstado({ tipo: 'idle' }) }}
              placeholder="ES00 0000 0000 0000 0000 0000"
              autoComplete="off"
              maxLength={42}
              disabled={conCodigo}
            />
          </label>
          {!conCodigo && (
            <label className="mi-direccion-campo">
              <span>Tu correo de acceso</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={255} />
            </label>
          )}
          {conCodigo && (
            <label className="mi-direccion-campo">
              <span>Te hemos mandado un código a <strong>{estado.tipo === 'codigo' ? estado.email : email}</strong>. Escríbelo:</span>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
              />
            </label>
          )}
          <button
            type="submit"
            className="boton"
            disabled={enviando || iban.trim().length < 15 || (!conCodigo && email.trim() === '') || (conCodigo && codigo.length !== 6)}
          >
            {enviando ? 'Un momento…' : conCodigo ? 'Confirmar el cambio' : 'Enviarme el código'}
          </button>
          {conCodigo && !enviando && (
            <button type="button" className="boton boton-secundario" onClick={() => { setCodigo(''); setEstado({ tipo: 'idle' }) }}>
              Cambiar la cuenta o el correo
            </button>
          )}
        </form>
      )}
      {estado.tipo === 'aviso' && <p role="status" className="mi-direccion-aviso">{estado.texto}</p>}
      {estado.tipo === 'codigo' && estado.aviso && <p role="status" className="mi-direccion-aviso">{estado.aviso}</p>}
    </section>
  )
}
