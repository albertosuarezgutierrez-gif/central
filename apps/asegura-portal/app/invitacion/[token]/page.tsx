import Link from 'next/link'

import { normalizarTokenInvitacion } from '@central/module-seguros-portal'

import { invitacionParaIdentidad, invitacionPorToken } from '@/lib/invitaciones'
import { getIdentidad } from '@/lib/session'

import { EntrarConCodigo, ResponderInvitacion } from './Invitacion'

export const dynamic = 'force-dynamic'

/**
 * La pantalla que abre el enlace del correo de invitación. Es PÚBLICA a
 * propósito —vive fuera del grupo `(portal)`— porque a quien se invita
 * normalmente no ha entrado nunca al portal: es la única pantalla, junto con la
 * de la entrada, que tiene que funcionar sin sesión.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 EL TOKEN NO ABRE SESIÓN, Y ESTA PÁGINA ES DONDE ESO SE NOTA.
 *
 * Lee la cabecera de `packages/module-seguros-portal/src/invitacion.ts` antes de
 * «simplificar» nada de aquí. El reparto es: **el token dice QUÉ invitación es;
 * el código de un solo uso al correo invitado dice QUIÉN eres.** Por eso esta
 * página resuelve la sesión con `getIdentidad()` y **no** con `redirect`: aquí
 * la ausencia de sesión no es un error, es el caso normal.
 *
 * De ahí los tres estados, que NO se colapsan:
 *
 *   1. Sin sesión → se invita a entrar, y NO SE ENSEÑA NADA MÁS. Ni quién
 *      invita, ni qué pólizas, ni el correo. Un enlace de correo es reenviable
 *      y quien abre esto puede no ser el invitado: el correo ya nombró a quien
 *      invita, y la página no tiene por qué repetírselo a cualquiera que pase.
 *   2. Con sesión y el correo CASA → se dice qué se ofrece y de quién, y se
 *      puede aceptar o rechazar.
 *   3. Con sesión y el correo NO casa → se dice que el enlace es para otra
 *      dirección, **sin decir cuál**.
 *
 * Y el enlace muerto (token que no existe, caducada o ya resuelta) sale por una
 * página neutra que **no distingue** entre «no existe» y «ya no vale»:
 * distinguirlo convertiría esta URL en un oráculo con el que averiguar tokens
 * válidos a base de probar. Es la misma razón por la que `respuestaPublica()`
 * colapsa los cuatro resultados de la petición de acceso.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La página no lee la BD por su cuenta: todo sale de `@/lib/invitaciones`, que
 * es quien sabe qué se puede contar en cada caso. `invitacionPorToken` devuelve
 * `{ existe, viva }` y **ni un dato más**: hasta que hay sesión no hay a quién
 * enseñarle nada.
 */
export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: crudo } = await params

  // Se valida la FORMA antes de tocar la BD: un valor cualquiera metido en la
  // URL no tiene por qué llegar a una consulta. `null` = eso no es un token, y
  // se contesta exactamente igual que un token que no existe.
  const token = normalizarTokenInvitacion(crudo)
  if (token === null) return <EnlaceMuerto />

  const { existe, viva } = await invitacionPorToken(token)
  if (!existe || !viva) return <EnlaceMuerto />

  const identidad = await getIdentidad()

  // ── 1. Sin sesión ─────────────────────────────────────────────────────────
  if (identidad === null) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
        <div className="seccion">
          <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Te han invitado a ver unos seguros</h1>
          <p className="suave" style={{ marginTop: 0 }}>
            Alguien te ha dado acceso a sus seguros en Grupo ASegura.{' '}
            <strong>Entra con tu correo para verlo</strong>: te mandamos un código de un solo uso y, una
            vez dentro, decides si lo aceptas.
          </p>
          {/* 🚨 Ni una línea más antes de entrar. Nada de quién invita, qué
              pólizas o a qué dirección se mandó: este enlace se reenvía, y quien
              lo abre puede no ser la persona invitada. */}
          <EntrarConCodigo />
        </div>
      </main>
    )
  }

  const oferta = await invitacionParaIdentidad(token, identidad.id)

  // ── 3. Con sesión, pero el correo no casa ────────────────────────────────
  if (oferta === null) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
        <div className="seccion">
          <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Este enlace es para otra dirección</h1>
          {/* No se dice CUÁL es esa dirección: quien está aquí puede ser
              cualquiera con el enlace, y decírselo sería regalarle el correo de
              un tercero. Tampoco se afirma que la invitación exista o no: solo
              que esta cuenta no es la suya. */}
          <p style={{ marginTop: 0 }}>
            La invitación se mandó a otro correo, así que desde esta cuenta no se puede aceptar. Sal y
            entra con la dirección a la que te llegó el correo.
          </p>
          <h2 style={{ fontSize: '1rem' }}>Entrar con otra dirección</h2>
          <EntrarConCodigo />
          <p style={{ margin: '12px 0 0', fontSize: 14 }}>
            <Link href="/boveda">Volver a mis seguros</Link>
          </p>
        </div>
      </main>
    )
  }

  // ── 2. Con sesión y el correo casa ───────────────────────────────────────
  // La fecha cruza a un componente de CLIENTE, así que viaja como cadena: un
  // `Date` no es serializable en esa frontera. Se admiten las dos formas en
  // que puede venir del puerto (ya en ISO, o `Date` de Prisma) en vez de
  // suponer una y quedarse con un «Invalid Date» pintado en pantalla.
  const caducaEn =
    typeof oferta.caducaEn === 'string' ? oferta.caducaEn : oferta.caducaEn.toISOString()

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1rem' }}>
      <ResponderInvitacion
        token={token}
        otorganteNombre={oferta.otorganteNombre}
        alcance={oferta.alcance}
        polizaId={oferta.polizaId}
        polizaEtiqueta={oferta.polizaEtiqueta}
        mensaje={oferta.mensaje}
        caducaEn={caducaEn}
      />
    </main>
  )
}

/**
 * 🚨 UNA sola página para los tres finales del enlace: no existe, caducó y ya
 * se contestó. Decir cuál de los tres es convierte esta URL en una máquina de
 * comprobar tokens — y encima le contaría a quien tenga un enlace reenviado que
 * la persona invitada ya aceptó o rechazó, que es un dato de ella.
 *
 * Se dice qué HACER, que es lo único útil: quien invitó puede mandar otra.
 */
function EnlaceMuerto() {
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="seccion">
        <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Este enlace ya no vale</h1>
        <p style={{ marginTop: 0 }}>
          No podemos abrir esta invitación. Si te la mandó alguien y sigues queriendo ver sus seguros,
          pídele que te invite otra vez: le llegará un enlace nuevo a tu correo.
        </p>
        <p className="suave" style={{ marginBottom: 0 }}>
          Si ya tienes cuenta en el portal, puedes entrar con tu correo y ver lo que tengas.
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 14 }}>
          <Link href="/">Ir a la entrada del portal</Link>
        </p>
      </div>
    </main>
  )
}
