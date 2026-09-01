/**
 * Puerto de canal: por dónde sale el código de acceso.
 *
 * WhatsApp es el canal que quiere el negocio, pero la WABA de Grupo Asegura NO
 * existe todavía. Cablearlo directamente habría dejado esta fase entera
 * bloqueada esperando a Meta. Con el puerto, el día que haya número se añade
 * `canal-whatsapp.ts` y se registra aquí: ni una línea del resto cambia.
 */
export type TipoCanal = 'whatsapp' | 'email'

export interface Canal {
  tipo: TipoCanal
  /** Devuelve true si el envío se aceptó. Un false NO es una excepción: es «no se pudo». */
  enviarCodigo(destino: string, codigo: string): Promise<boolean>
}

const registro = new Map<TipoCanal, Canal>()

export function registrarCanal(canal: Canal): void {
  registro.set(canal.tipo, canal)
}

/**
 * `null` cuando el canal no está registrado. Es DISTINTO de «el envío falló», y
 * quien llama tiene que distinguirlo: decirle al usuario «no te hemos podido
 * enviar el código» cuando en realidad WhatsApp no está montado es mentirle.
 */
export function obtenerCanal(tipo: TipoCanal): Canal | null {
  return registro.get(tipo) ?? null
}
