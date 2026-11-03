// Autorizar a un TERCERO sobre el patrimonio (27/10/2026): María (titular) deja que su marido José lo gestione.
//
// Lógica PURA (sin BD ni reloj). El adaptador vive en `apps/asegura-portal/lib/patrimonio/autorizar-tercero-*.ts` y reutiliza la
// invitación por correo del portal (`portal_invitacion` → aceptación con código → `portal_autorizacion`, revocación con sello).
//
// 🚨 Quién PUEDE conceder no se decide aquí por nivel: es `puedeAutorizarPatrimonio` (`acceso.ts`) — solo el propio titular (ficha
// vinculada que opera) o el Dueño de la sociedad. Un autorizado con nivel Total NO reautoriza a un cuarto.
// 🚨 Fail-closed: un alcance fuera de los dos de patrimonio no se concede ni se acepta (los de la BÓVEDA tampoco: no abren nada aquí).
import { ALCANCE_PATRIMONIO_GESTION, ALCANCE_PATRIMONIO_TOTAL } from './acceso.ts'

export const ALCANCES_PATRIMONIO = [ALCANCE_PATRIMONIO_GESTION, ALCANCE_PATRIMONIO_TOTAL] as const
export type AlcancePatrimonio = (typeof ALCANCES_PATRIMONIO)[number]

/** El alcance de patrimonio de un valor cualquiera (cuerpo de la petición o fila de BD). Lo demás → `null`. */
export function alcancePatrimonio(v: unknown): AlcancePatrimonio | null {
  return typeof v === 'string' && (ALCANCES_PATRIMONIO as readonly string[]).includes(v) ? (v as AlcancePatrimonio) : null
}

/** Nombre corto de cada nivel, el MISMO en la pantalla de quien concede y en la de quien acepta. */
export const NOMBRE_ALCANCE_PATRIMONIO: Readonly<Record<AlcancePatrimonio, string>> = Object.freeze({
  [ALCANCE_PATRIMONIO_GESTION]: 'Gestionar',
  [ALCANCE_PATRIMONIO_TOTAL]: 'Total',
})

/**
 * Lo que puede hacer quien recibe cada nivel. Es un espejo de la tabla `puede()` de `acceso.ts` (lo vigila su test): si la tabla
 * cambia y esta frase no, la pantalla prometería algo que el servidor no hace.
 */
export const QUE_PUEDE_PATRIMONIO: Readonly<Record<AlcancePatrimonio, string>> = Object.freeze({
  [ALCANCE_PATRIMONIO_GESTION]:
    'ver y editar tu patrimonio (gastos, facturas, documentos, recordatorios y seguros de cada inmueble), ' +
    'sin dar de alta ni de baja inmuebles, contratos o inquilinos, y sin ver los datos personales de tus inquilinos.',
  [ALCANCE_PATRIMONIO_TOTAL]:
    'hacer lo mismo que tú con tu patrimonio: dar de alta y de baja inmuebles, contratos e inquilinos, ver sus datos ' +
    'personales y pedir precio de seguros en tu nombre.',
})

/** Versiones del texto de consentimiento que se sellan en `portal_autorizacion.version_texto`. Una versión vieja no se reescribe. */
export const TEXTO_PATRIMONIO_GESTION_V1 = 'v1-2026-10-27-patrimonio-gestion'
export const TEXTO_PATRIMONIO_TOTAL_V1 = 'v1-2026-10-27-patrimonio-total'

const TEXTOS: Readonly<Record<AlcancePatrimonio, { version: string; texto: string }>> = Object.freeze({
  [ALCANCE_PATRIMONIO_GESTION]: {
    version: TEXTO_PATRIMONIO_GESTION_V1,
    texto:
      'Autorizo a esta persona a ver y gestionar mi patrimonio en Mis Seguros: ' +
      QUE_PUEDE_PATRIMONIO[ALCANCE_PATRIMONIO_GESTION] +
      ' No podrá autorizar a nadie más. Puedo revocarlo cuando quiera y el acceso se corta en ese momento.',
  },
  [ALCANCE_PATRIMONIO_TOTAL]: {
    version: TEXTO_PATRIMONIO_TOTAL_V1,
    texto:
      'Autorizo a esta persona a ' +
      QUE_PUEDE_PATRIMONIO[ALCANCE_PATRIMONIO_TOTAL] +
      ' No podrá autorizar a nadie más. Puedo revocarlo cuando quiera y el acceso se corta en ese momento.',
  },
})

/** El texto EXACTO que se acepta y su versión. */
export function textoConcesionPatrimonio(alcance: AlcancePatrimonio): { version: string; texto: string } {
  return TEXTOS[alcance]
}
