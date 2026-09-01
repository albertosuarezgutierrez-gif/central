import CorreduriaClient from './CorreduriaClient'

/**
 * La pantalla de la correduría. Alberto usa UNA página —este cuadro de mando—
 * y la correduría es un negocio más dentro de ella; `apps/asegura` es la
 * trastienda que sirve los datos por su puerto HTTP.
 *
 * La URL de asegura se resuelve en el SERVIDOR y baja como prop: solo se usa
 * para el único salto que tiene que ir allí (retarificar, que gasta 0,50€ y
 * vive tras su propia pantalla de confirmación). No es un secreto — el secreto
 * del puerto no sale nunca de las rutas de API.
 */
export default function CorreduriaPage() {
  const urlAsegura = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  return <CorreduriaClient urlAsegura={urlAsegura} />
}
