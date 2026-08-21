// Envío a SES: lo ÚNICO de este módulo que toca la red.
//
// El `fetch` entra por parámetro para poder probar el resto sin red y sin credenciales.
import { leerRespuesta, type RespuestaSes } from './respuesta.ts'

export type CredencialesSes = {
  usuario: string
  password: string
}

export type OpcionesEnvio = {
  url: string
  credenciales: CredencialesSes
  /** Sobre SOAP completo, ya construido. */
  sobre: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * POST del sobre con Basic auth.
 *
 * 🚨 **Nunca se desactiva la verificación TLS.** Por este canal viajan documentos de identidad de
 * personas: aceptar cualquier certificado convierte un error de configuración en un
 * man-in-the-middle silencioso sobre datos personales de categoría sensible. La implementación de
 * referencia en Python que se estudió para este diseño usaba `verify=False`, y no era descuido:
 * es lo que se acaba haciendo cuando la cadena no cierra. La solución correcta es servir la cadena
 * FNMT correcta (ver `certs/ses-ca-bundle.pem` y `NODE_EXTRA_CA_CERTS`), no bajar la guardia.
 *
 * Cualquier fallo antes de tener respuesta se clasifica como `transporte`: es un «no lo sé»,
 * nunca un «el parte está mal».
 */
export async function enviarSes(opts: OpcionesEnvio): Promise<RespuestaSes> {
  const { url, credenciales, sobre, timeoutMs = 30_000, fetchImpl = fetch } = opts
  const auth = Buffer.from(`${credenciales.usuario}:${credenciales.password}`, 'utf8').toString('base64')

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        Authorization: `Basic ${auth}`,
      },
      body: sobre,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const cuerpo = await res.text()
    return leerRespuesta(res.status, cuerpo)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    // El fallo de cadena de certificados merece su propio texto: es el que más tiempo costó
    // diagnosticar y el que más fácil se confunde con un problema de credenciales.
    const esTls = /certificate|self.signed|UNABLE_TO_VERIFY|UnknownIssuer|CERT_/i.test(msg)
    return {
      ok: false,
      clase: 'transporte',
      codigo: null,
      descripcion: null,
      lotes: [],
      detalle: esTls
        ? `fallo de TLS antes de autenticar (${msg.slice(0, 200)}) — revisa la cadena FNMT en NODE_EXTRA_CA_CERTS`
        : `no se pudo contactar con SES (${msg.slice(0, 200)})`,
    }
  }
}
