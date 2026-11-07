// Datos canónicos del ENCARGADO / MEDIADOR (Alberto Suárez Gutiérrez, nombre comercial «Grupo ASegura») y remitente único
// de correo. Movido aquí (07/11/2026) desde `@central/module-seguros/src/mediador.ts`, que lo RE-EXPORTA tal cual: así las
// herramientas (`apps/empresa`, el contrato de encargo) leen la identidad del encargado sin importar `module-seguros*`
// (cepo de dos-ventanas §2) y sigue habiendo UNA sola copia. Toda la documentación de cada campo sigue aquí.
// 🚨 No cambies nada sin leer la cabecera de `packages/module-seguros/src/mediador.ts` (versión de textos legales, etc.).

export const MEDIADOR = {
  /** Nombre comercial. La persona que responde legalmente es `identidad`. */
  marca: 'Grupo ASegura',
  identidad: {
    nombre: 'Alberto Suárez Gutiérrez',
    nif: '28823484E',
    /**
     * Fecha de nacimiento de Alberto (ISO). La dio él mismo el 28/10/2026 para usarse como TOMADOR en las exploraciones
     * del tarificador RPA de patinete («datos del mediador con su consentimiento»). Única copia: nadie la repite en
     * código, tests ni commits (los tests la importan de aquí). No sale por ninguna superficie pública.
     */
    fechaNacimiento: '1984-10-11',
    figura: 'Corredor de seguros (persona física)',
    /** Clave del Registro Administrativo de Distribuidores de Seguros (DGSFP). */
    claveDgsfp: 'CS-F/0170',
    domicilio: 'San Juan de La Palma, nº 28, 41003 Sevilla',
    /**
     * 🚨 El correo ÚNICO de la correduría (Alberto, 04/09/2026: «solo quiero usar
     * un mail hola@grupoasegura.es»). Es el mismo buzón al que ya responde el
     * `Reply-To` del correo del portal (`PORTAL_MAIL_REPLY_TO`), así que el
     * cliente que contesta a su código de acceso y el que presenta una queja
     * llegan al mismo sitio — que es justo lo que un SAC tiene que garantizar.
     *
     * Decisión de Alberto (17/10/2026): TODO email público de la correduría es
     * este; `info@grupoasegura.es` ya no se publica en ninguna superficie (lo
     * vigila `mediador.test.ts`).
     */
    email: 'hola@grupoasegura.es',
    /**
     * Móvil público de la correduría (637 349 990): confirmado por Alberto el
     * 05/09/2026 y ratificado el 17/10/2026 como único móvil publicable, en la
     * web y como WhatsApp de contacto.
     *
     * 🚨 En E.164 y SIN espacios a propósito: es el formato que exige `wa.me/`
     * y el que Google espera en `telephone` del JSON-LD. Para PINTARLO usa
     * `telefonoLegible`, no este: un `+34637349990` de corrido en una web se
     * lee mal y se copia peor.
     *
     * ⚠️ Es un móvil, no una línea fija de empresa. Publicarlo es
     * irreversible: los rastreadores lo copian en horas. Si algún día hay una
     * línea de la correduría (o la WABA que el portal espera para su canal de
     * WhatsApp), se sustituye AQUÍ y cambia en todas las superficies a la vez.
     */
    telefono: '+34637349990',
    /**
     * La web pública (`apps/asegura-web`), que es la ÚNICA superficie pensada
     * para quien todavía no es cliente: quién eres, qué ramos medias y un
     * formulario para que te escriba.
     *
     * 🚨 Sin barra final y con `https://`: se concatena para formar rutas y se
     * manda tal cual por WhatsApp.
     *
     * ⚠️ El `.com` NO es nuestro (apunta a un parking de IONOS) y
     * `app.grupoasegura.com` sirve el CRM de Manuel: ni uno ni otro valen aquí.
     * El apex `.es` lo sirve `asegura-web` desde el 05/09/2026.
     *
     * `apps/asegura-web/lib/sitio.ts` deja sobreescribirlo por
     * `NEXT_PUBLIC_SITIO_URL` para sus previews; ESTE es el dominio que se le
     * enseña a una persona, así que no depende de ninguna env: un mensaje de
     * WhatsApp con la URL de una preview de Vercel no lo arregla un redeploy.
     */
    web: 'https://grupoasegura.es',
    /**
     * La intranet del cliente (`apps/asegura-portal`), que es lo que se le
     * ofrece a alguien que todavía no tiene ninguna póliza con nosotros.
     *
     * 🚨 NO es «el área de clientes» en el sentido de «solo para clientes»:
     * entrar no exige tener cartera (el código de un solo uso se manda a
     * cualquier correo, `app/api/acceso/solicitar`), la bóveda vacía tiene su
     * propio texto, y «Añade una póliza» se pinta SIN condición — admite
     * pólizas de cualquier compañía, sea nuestra o no. Su propia pantalla de
     * entrada lo dice: «Todos tus seguros en un sitio. Gratis, seas cliente o
     * no.» Por eso se puede nombrar en un primer mensaje sin mentir.
     *
     * ⚠️ Lo que NO se le puede prometer desde aquí es que se las gestionamos:
     * el propio portal declara «no la contratamos ni la gestionamos por ti»
     * sobre una póliza declarada. Es un cuaderno suyo con avisos, no un
     * encargo de mediación — y decirlo al revés sería asumir por WhatsApp un
     * deber que no existe.
     *
     * `apps/asegura-web/lib/sitio.ts` lo deja sobreescribir por
     * `NEXT_PUBLIC_PORTAL_URL` para sus previews; ESTE es el que se manda por
     * WhatsApp, así que no depende de env por la misma razón que `web`.
     */
    portal: 'https://clientes.grupoasegura.es',
  },
  /** Seguro de responsabilidad civil profesional, art. 157.1.g RDL 3/2020. */
  responsabilidadCivil: {
    aseguradora: "Lloyd's of London",
    poliza: 'M201900135',
    referenciaLegal: 'Art. 157.1.g RDL 3/2020',
  },
  remuneracion: {
    naturaleza: 'Comisión sobre la prima, abonada por la entidad aseguradora',
    /** Redacción breve para la pantalla precontractual (art. 173 RDL 3/2020). */
    resumen:
      'El mediador percibe una comisión sobre la prima que abona la entidad aseguradora. El cliente no paga ningún honorario adicional por el servicio de mediación.',
  },
} as const

/**
 * Remitente de un correo de la correduría, con el nombre visible SIEMPRE
 * tomado de `MEDIADOR.marca`.
 *
 * 🚨 Esto existe por un fallo MEDIDO el 05/09/2026: las variables de entorno
 * `PORTAL_MAIL_FROM` y `ASEGURA_MAIL_FROM` llevaban la marca con la ese
 * minúscula, así que **todos los correos al asegurado salían con el nombre
 * comercial comido**. El guardián del nombre comercial
 * (`test/regression-nombre-comercial-asegura.test.ts`) no lo vio y no podía
 * verlo: barre `git ls-files`, y el valor de una env de Vercel no está en el
 * repo. Peor todavía, media docena de esas variables son de tipo Secret, que
 * el panel ni siquiera deja releer — o sea que ahí la revisión a ojo tampoco
 * llega nunca.
 *
 * La salida no es revisar mejor: es que el nombre **no se pueda escribir en una
 * env**. La env aporta la DIRECCIÓN (que sí depende del dominio verificado en
 * el proveedor de envío) y el nombre lo pone el repo, donde ya está protegido.
 *
 * Acepta las dos formas por compatibilidad, así que no hay que tocar ninguna
 * variable para que empiece a funcionar:
 *   - `"Lo que sea <no-reply@envios.grupoasegura.es>"` → se ignora el nombre
 *   - `"no-reply@envios.grupoasegura.es"` → se le pone el nombre
 *
 * ── 🚨 Y desde el 07/09/2026 NO devuelve `null`: hay un remitente por defecto ──
 *
 * Dictado de Alberto: «solo hola@grupoasegura.es, ponlo donde sea para que no
 * vuelva a haber errores; muchos mails al final es un caos, un mail es más
 * práctico». Antes, una env ausente o mal escrita hacía que el correo **no
 * saliera**, y esa env había que acertarla en CUATRO sitios (`ASEGURA_MAIL_FROM`
 * en asegura, `PORTAL_MAIL_FROM` en el portal, y en cada uno de sus entornos de
 * Vercel). Cada sitio era una ocasión de romperlo en silencio.
 *
 * Un remitente NO es un secreto —es la dirección que el cliente ve— así que la
 * regla de «nunca un literal de reserva» (que existe para lo que FIRMA sesiones)
 * no aplica aquí; sí aplica la de al lado: el valor vive en el repo, donde se
 * revisa y se protege, y no en un panel que además oculta los valores Secret.
 * Es lo mismo que ya hacen `ASEGURA_PORTAL_URL` y `NEXT_PUBLIC_PORTAL_URL`.
 *
 * Una env presente y válida sigue mandando: sirve para probar otro buzón sin
 * tocar código. Una env con basura (sin arroba, con espacios) **cae al defecto y
 * lo dice en el log** — enviar desde la dirección buena es mejor que no enviar,
 * que era lo que pasaba antes.
 *
 * ⚠️ Esto no exime de verificar el dominio en el proveedor de envío: si
 * `grupoasegura.es` no está verificado en Resend, el envío se rechaza igual.
 * Lo que se elimina es la clase de fallo «falta la variable».
 */
export const REMITENTE_CORREDURIA = 'hola@grupoasegura.es'

export function remitenteCorreo(env?: string | undefined | null): string {
  const bruto = (env ?? '').trim()
  if (!bruto) return `${MEDIADOR.marca} <${REMITENTE_CORREDURIA}>`
  // Con `<...>` la dirección es lo de dentro; sin ellos, el valor entero.
  const entreAngulos = bruto.match(/<([^>]+)>/)
  const direccion = (entreAngulos ? entreAngulos[1] : bruto).trim()
  // Una dirección sin arroba no es una dirección: no se disfraza con la marca.
  if (!direccion || !direccion.includes('@') || /\s/.test(direccion)) {
    console.error(`[mediador] remitente mal escrito (${JSON.stringify(bruto)}): se usa ${REMITENTE_CORREDURIA}`)
    return `${MEDIADOR.marca} <${REMITENTE_CORREDURIA}>`
  }
  return `${MEDIADOR.marca} <${direccion}>`
}
