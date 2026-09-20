// La landing del GESTOR DE SEGUROS (`/gestor-de-seguros`): copy como datos,
// igual que `ramos.ts` y `articulos.ts`, para que el mismo cepo de copy
// regulado lo barra en cada commit y el JSON-LD salga de la misma fuente.
//
// ─── Qué es esta página y qué NO es ────────────────────────────────────────
// Es la página de INTENCIÓN de quien busca «organizar mis seguros en un solo
// sitio», «controlar los vencimientos de mis pólizas» o «app para guardar mis
// seguros». Hasta el 19/09/2026 esa intención no tenía página: la portada la
// cuenta de pasada y el portal no se indexa. Es el hueco real que dejaba el
// plan (`docs/ASEGURA-MARKETING-PLAN.md`, Fase 4) y el que más se parece a lo
// único que un comparador no puede copiar.
//
// 🚨 Cada frase de aquí tiene que ser cierta HOY sobre `apps/asegura-portal`,
// no sobre lo que se quiere construir. Lo que el portal HACE (verificado en
// su código el 19/09/2026):
//   · entra cualquiera con un correo verificado, sea cliente o no
//   · lee un PDF o una foto de póliza con IA y deja la ficha rellena, que la
//     persona confirma (`POST /api/polizas`, `confirmadaPorUsuario` nace en
//     `false`)
//   · calcula y enseña la fecha accionable (vencimiento − 30 días, art. 22
//     LCS) en la campana de avisos y en cada póliza
//   · prepara la carta de no renovación de una póliza añadida
//     (`/boveda/carta/[id]`) y la persona la copia, imprime o abre en su
//     correo — NO se envía desde el portal
//   · avisa de coberturas que aparecen en más de una póliza propia
//   · pide, en una casilla independiente y desmarcada, si quiere propuestas
//
// Lo que NO se promete, y por qué:
//   · «te avisamos por correo/WhatsApp»: el cron de correo de `apps/asegura`
//     está APAGADO y WhatsApp no existe. Se dice «te lo enseña» y «en la
//     campana», que es lo que hay. Cuando se encienda el aviso, se cambia AQUÍ.
//   · «pagas de más», «ahorra», «el más barato»: asesoramiento (RDL 3/2020) y
//     lo caza `lib/ramos.test.ts` / `gestor.test.ts`.
//   · «cancelamos tu seguro por ti»: la carta la manda la persona.
//
// ⚠️ Los textos citan el art. 22 LCS: `base` lo declara con su id de
// `NORMAS_CITABLES`, como en los artículos, para que el cepo lo compruebe.

import type { Faq } from './ramos.ts'

export const GESTOR = {
  ruta: '/gestor-de-seguros',
  title: 'Gestor de seguros gratis: todas tus pólizas en un solo sitio',
  description:
    'Guarda las pólizas de cualquier compañía en tu área privada y ve hasta qué día puedes decidir cada renovación. Gratis, sin ser cliente y sin cambiar de correduría.',
  h1: 'Todos tus seguros, de cualquier compañía, en un solo sitio',
  lead:
    'Sube el PDF o una foto de cada póliza y te la dejamos leída: compañía, número, vencimiento y coberturas. Tu área privada te enseña hasta qué día puedes decidir cada renovación y te prepara la carta si no quieres renovar. Sin coste, sin ser cliente y sin cambiar de correduría.',
  /** La búsqueda que cubre. Para no escribir dos páginas para la misma. */
  consulta: 'organizar mis seguros en un solo sitio',
  base: ['lcs-22'] as const,
  garantias: [
    'Gratis, seas cliente o no',
    'Vale un PDF o una foto desde el móvil',
    'El documento no se guarda: solo sus datos',
    'Subir una póliza no te cambia de correduría',
  ] as const,
  pasos: [
    {
      titulo: 'Entras con tu correo',
      texto: 'Te llega un código de un solo uso. Sin contraseñas que recordar y sin darte de alta en nada.',
    },
    {
      titulo: 'Subes la póliza',
      texto: 'PDF o foto. La leemos y te dejamos la ficha rellena para que la revises: nada se da por bueno solo.',
    },
    {
      titulo: 'Ves tu fecha real',
      texto:
        'Para no renovar hay que avisar un mes antes del vencimiento. Esa es la fecha que te enseñamos, no la del recibo.',
    },
    {
      titulo: 'Decides tú',
      texto:
        'Si no quieres renovar, te preparamos la carta. Si prefieres que la llevemos nosotros sin cambiar de compañía, también se puede.',
    },
  ] as const,
  /** Lo que hace la herramienta, en el orden en que lo ve quien entra. */
  funciones: [
    {
      titulo: 'Lectura automática de la póliza',
      texto:
        'Sube el PDF de las condiciones particulares o una foto y sacamos compañía, número, vencimiento, prima y coberturas. Tú confirmas.',
    },
    {
      titulo: 'La fecha hasta la que puedes decidir',
      texto:
        'Cada póliza enseña su fecha accionable: un mes antes del vencimiento, que es el preaviso que marca el artículo 22 de la Ley de Contrato de Seguro. Y la campana de avisos te la recuerda cuando se acerca.',
    },
    {
      titulo: 'Carta de no renovación lista para enviar',
      texto:
        'Con los datos de tu póliza y el plazo calculado. La copias, la imprimes o la abres en tu correo y la mandas tú a la compañía por el canal que deje constancia.',
    },
    {
      titulo: 'Coberturas repetidas',
      texto:
        'Si la misma cobertura aparece en dos de tus pólizas —defensa jurídica, asistencia en viaje, responsabilidad civil familiar— te lo decimos para que compruebes en las condiciones qué cubre cada una.',
    },
    {
      titulo: 'Tu familia y tu empresa',
      texto:
        'Puedes autorizar a quien tú digas a ver una póliza o todas, y pedirle acceso a un familiar. Cada acceso caduca solo y ves quién miró y cuándo.',
    },
    {
      titulo: 'A quién llamar cuando pasa algo',
      texto:
        'El teléfono y el canal de siniestros de tu compañía, verificados uno a uno, y un parte guiado con fotos desde el móvil. Y una hoja con QR para la nevera o la guantera.',
    },
  ] as const,
  /**
   * La privacidad, dicha con lo que el código hace. Cada frase se sostiene en
   * `apps/asegura-portal` (ver su `CLAUDE.md`, bloque legal): el correo se
   * guarda como hash, el documento no se persiste, la base de datos está en la
   * UE y la casilla comercial es independiente y nace desmarcada.
   */
  privacidad: [
    'Tu correo no se guarda en claro: solo una huella que no se puede revertir.',
    'El PDF o la foto no se almacena. Se lee, se sacan los datos y se descarta.',
    'Subir una póliza no autoriza ninguna propuesta: eso se marca en una casilla aparte, que nace sin marcar y se retira cuando quieras.',
    'Tus datos están en una base de datos en la Unión Europea, y puedes pedir su supresión desde tu propia área.',
  ] as const,
  faq: [
    {
      pregunta: '¿Tengo que ser cliente de la correduría para usarlo?',
      respuesta:
        'No. Entras con tu correo, te llega un código y ya tienes tu espacio. Puedes guardar pólizas de cualquier compañía aunque no las lleve nadie de la correduría.',
    },
    {
      pregunta: '¿Subir mi póliza me cambia de mediador o me compromete a algo?',
      respuesta:
        'No. Guardar una póliza solo la guarda. Tu mediador sigue siendo el que era y tu contrato no cambia. Si algún día quieres que la llevemos nosotros, es un trámite aparte que decides tú.',
    },
    {
      pregunta: '¿Qué pasa con el documento que subo?',
      respuesta:
        'Se lee para sacar los datos y se descarta: no se almacena el fichero. Los datos leídos quedan en tu ficha, marcados como leídos del documento, y los confirmas o corriges tú.',
    },
    {
      pregunta: '¿Me avisáis antes de que venza?',
      respuesta:
        'Tu área te enseña, para cada póliza, hasta qué día puedes decidir, y la campana de avisos te lo señala cuando se acerca. El envío por correo de esos avisos se activa por fases; mientras tanto la fecha está siempre a la vista al entrar.',
    },
    {
      pregunta: '¿La carta de no renovación la enviáis vosotros?',
      respuesta:
        'No: la preparamos con los datos de tu póliza y la envías tú a tu compañía, por un medio que deje constancia de la fecha. Es tu comunicación, y así queda a tu nombre y con tu justificante.',
    },
    {
      pregunta: '¿Cuánto cuesta?',
      respuesta:
        'Nada. La correduría cobra su comisión de la aseguradora cuando media una póliza; el gestor es gratis para quien lo usa, sea o no cliente.',
    },
  ] as readonly Faq[],
} as const

/** Todo el texto visible de la landing, en una cadena, para barrerlo. */
export function textoGestor(): string {
  return [
    GESTOR.title,
    GESTOR.description,
    GESTOR.h1,
    GESTOR.lead,
    ...GESTOR.garantias,
    ...GESTOR.pasos.flatMap((p) => [p.titulo, p.texto]),
    ...GESTOR.funciones.flatMap((f) => [f.titulo, f.texto]),
    ...GESTOR.privacidad,
    ...GESTOR.faq.flatMap((f) => [f.pregunta, f.respuesta]),
  ].join(' ')
}
