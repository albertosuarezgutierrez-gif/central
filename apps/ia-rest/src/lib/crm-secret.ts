// Secreto que firma los JWT del CRM de leads (tokens de seguimiento y de baja /
// unsubscribe de los emails en frío). Fuente ÚNICA para emisores y validadores:
// si el emparejamiento usara literales distintos, las bajas dejarían de validar.
//
// En PRODUCCIÓN es OBLIGATORIO: sin `JWT_SECRET_CRM` lanza, en vez de caer a un
// literal conocido en el repo (que sería una credencial válida para firmar tokens).
// En desarrollo cae a un valor fijo para no romper el flujo local.
export function crmSecret(): string {
  return (
    process.env.JWT_SECRET_CRM ||
    (process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('JWT_SECRET_CRM no configurado en producción') })()
      : 'ia-rest-crm-2026')
  )
}
