import { redirect } from 'next/navigation'

import { EntrarConCodigo } from '../../invitacion/[token]/Invitacion'
import { MarcaAsegura } from '../../MarcaAsegura'
import { caratulaPorToken } from '@/lib/presupuesto'
import { TEXTO_CARATULA } from '@/lib/presupuesto-vista'
import { getIdentidad } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * La carátula del enlace del presupuesto. PÚBLICA a propósito —vive fuera del
 * grupo `(portal)`— porque a quien se le manda un presupuesto puede no haber
 * entrado nunca al portal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 AQUÍ NO SE ENSEÑA NADA DEL PRESUPUESTO. Ni un precio, ni una compañía, ni
 * el bien asegurado, ni el nombre de quien lo tiene.
 *
 * El token dice QUÉ presupuesto es; QUIÉN eres lo dice el código de un solo uso
 * que llega a tu correo. Es la misma mecánica de `portal_invitacion`, y la
 * razón de que sea esa y no otra está medida:
 *
 *   1. Un GET que consume estado se lo comen el antivirus del correo y el
 *      prefetch antes de que la persona lo toque.
 *   2. Un token en un correo es una llave REENVIABLE. Con el contenido detrás
 *      del token, quien lee un buzón compartido —el de una empresa, el de una
 *      familia— vería el precio, la compañía y el bien asegurado de un tercero.
 *      En salud, vida o decesos eso roza un dato de categoría especial.
 *   3. «Aceptado por el que tenía el enlace» no es prueba de consentimiento
 *      (art. 7.1 RGPD), y este documento se acaba firmando (PR 4).
 *
 * ⚠️ Y una decisión que contradice la letra del §3.1 de la spec, dicha en voz
 * alta: allí la carátula dice «…un presupuesto para tu seguro de <bien>». Aquí
 * NO se nombra el bien. Manda el §7 Q2 («nada del contenido») y, sobre todo, la
 * línea que el propio repo ya tomó el 08/09/2026 en la invitación al portal:
 * decirle «te han preparado un presupuesto para tu coche» a quien todavía no ha
 * probado ser nadie **ya es contar algo del presupuesto**. Si alguien quiere el
 * bien en la carátula, que sea una decisión de Alberto y no un descuido.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tres finales, y los tres malos se colapsan en UNO:
 *   1. Enlace muerto (no existe, retirado, o ni siquiera tiene forma de token)
 *      → la misma página neutra. Distinguirlos convertiría esta URL en un
 *      oráculo con el que averiguar tokens válidos a base de probar.
 *   2. Sin sesión → la carátula y el formulario de código, con el destino
 *      prerellenado desde `?d=` (mismo patrón que el correo de acceso).
 *   3. Con sesión → derecho a la pantalla de dentro (`/boveda/presupuesto/<id>`),
 *      que es la que decide si
 *      esta persona lo puede ver. **Aquí no se comprueba**: la autorización
 *      vive en un solo sitio, y repartirla en dos es cómo se relaja una de las
 *      dos sin que falle nada.
 */
export default async function CaratulaPresupuesto({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const caratula = await caratulaPorToken(token)
  if (caratula.estado === 'muerta') return <EnlaceMuerto />

  const identidad = await getIdentidad()
  if (identidad !== null) redirect(`/boveda/presupuesto/${caratula.id}`)

  return (
    <main className="caratula">
      <div className="seccion">
        <span className="entrada-marca">
          <MarcaAsegura alto={34} />
        </span>
        <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>{TEXTO_CARATULA.titulo}</h1>
        <p className="suave" style={{ marginTop: 0 }}>
          {TEXTO_CARATULA.cuerpo}
        </p>
        {/* 🚨 Ni una línea más antes de entrar. */}
        <EntrarConCodigo leerEnlace />
      </div>
    </main>
  )
}

function EnlaceMuerto() {
  return (
    <main className="caratula">
      <div className="seccion">
        <span className="entrada-marca">
          <MarcaAsegura alto={34} />
        </span>
        <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Este enlace ya no sirve</h1>
        <p className="suave" style={{ marginTop: 0 }}>
          {TEXTO_CARATULA.enlaceMuerto}
        </p>
      </div>
    </main>
  )
}
