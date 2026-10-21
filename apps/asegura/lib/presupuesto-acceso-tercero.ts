// Quién ha entrado con el CÓDIGO de un presupuesto: el TOMADOR o una PERSONA DE CONTACTO (21/10/2026). PURO.
//
// El correo a una persona de contacto (`envio-presupuesto.ts`, tomador sin correo) reutiliza el mecanismo del código del
// WhatsApp: token + código atado a él. Con ese token el puente del portal resuelve la ficha DEL PROPIO PRESUPUESTO, o
// sea la del TOMADOR. Sin esta guarda, el contacto podía aceptar y firmar como `otp_whatsapp` a nombre del tomador,
// firmar la anulación de su póliza, escribir un IBAN en su ficha y marcar «dato incorrecto».
// Decisión de Alberto (21/10/2026): por ahora el contacto VE el presupuesto pero NO firma ni escribe nada. La firma en
// representación irá aparte.
//
// Cómo se sabe que el acceso es de un tercero, sin migración (la columna `canal_aviso` tiene CHECK de dos valores y
// `whatsapp_codigo_hash` CHECK de forma hex, así que ninguna admite una marca nueva):
//   1. MARCA EXPLÍCITA: `envio-presupuesto.ts` escribe un evento append-only `acceso_tercero` con el HASH DEL TOKEN nuevo
//      ANTES del compare-and-swap que lo activa. El token vigente es tercero si existe ese evento con SU hash. Un fallo
//      al escribir la marca corta el envío antes de rotar nada; una marca huérfana (CAS perdido, correo que no salió y
//      devolvió el token anterior) nunca coincide con un token vivo.
//   2. CINTURÓN (invariante, cepo en `presupuesto-acceso-tercero.test.ts`): el correo al TOMADOR borra el código
//      (`codigoWhatsapp = null`); solo el correo a un tercero deja `canal_aviso = 'email'` CON código. Si alguien cambia
//      eso, el fallo es CERRADO: el tomador queda como tercero (no firma), nunca al revés.
// Basta con una de las dos para tratarlo como tercero.

/** Evento append-only que marca el token de un aviso a una persona de contacto. `detalle.tokenHash` = el hash del token. */
export const TIPO_ACCESO_TERCERO = 'acceso_tercero'

export type FilaAccesoToken = {
  clienteId: string
  canalAviso: string | null
  whatsappCodigoHash: string | null
  /** ¿Hay un evento `acceso_tercero` cuyo `detalle.tokenHash` es el del token VIGENTE? */
  marcaTercero: boolean
}

export function esAccesoTercero(f: Pick<FilaAccesoToken, 'canalAviso' | 'whatsappCodigoHash' | 'marcaTercero'>): boolean {
  if (f.marcaTercero) return true
  return f.canalAviso === 'email' && f.whatsappCodigoHash !== null
}

export type FichaDeToken = { estado: 'ok'; clienteId: string } | { estado: 'ajena' } | { estado: 'sin_permiso' }

/**
 * La ficha con la que OPERA quien entró con el código. `ajena` = el token no es el vigente de ese presupuesto.
 * `sin_permiso` = es una persona de contacto: ve el presupuesto (eso lo decide el portal con su cookie), pero ninguna
 * acción del puente que va a nombre del tomador (datos, dato incorrecto, preparar, código, firmar, cuenta) le vale.
 */
export function fichaDeToken(f: FilaAccesoToken | null): FichaDeToken {
  if (!f) return { estado: 'ajena' }
  if (esAccesoTercero(f)) return { estado: 'sin_permiso' }
  return { estado: 'ok', clienteId: f.clienteId }
}
