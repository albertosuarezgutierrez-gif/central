/**
 * Apartado de la política de privacidad sobre la revisión de seguros de los inmuebles (P15, BORRADOR 26/10/2026).
 * Solo se pinta con `PATRIMONIO_SENALES_ACTIVAS=1` (lo decide `page.tsx`) y entra con `VERSION_TEXTOS_LEGALES_PATRIMONIO`.
 * Texto y notas para Alberto: docs/legal/2026-10-26-borrador-p15-patrimonio.md.
 *
 * 🚨 Cada frase es una afirmación sobre el código (`packages/module-patrimonio/src/senales.ts`, el cron
 * `apps/asegura/app/api/cron/senales-patrimonio`): si cambia uno, cambia el otro en el MISMO PR.
 *   · «una vez al día»  → el cron es diario.
 *   · «solo si marcas la casilla» → `puedeCalcularSenales` exige `comercial_patrimonio` vigente y sin oposición.
 *   · «no enviamos ningún mensaje» → ni el motor ni la cola escriben a nadie (cepo en `test/regression-portal-patrimonio-senales.test.ts`).
 *   · «180 días» → `DIAS_TRAS_DESCARTE`.
 */
export function ApartadoSenalesPatrimonio() {
  return (
    <section id="senales-patrimonio">
      <h2>3 bis. Revisión de los seguros de tus inmuebles (solo si la marcas)</h2>
      <p>
        En «Patrimonio» puedes marcar una casilla, desmarcada por defecto y independiente del resto del servicio:
        «Revisión de seguros de mis inmuebles». <strong>Solo si la marcas</strong>, una vez al día comparamos los
        inmuebles, los contratos de alquiler y las pólizas de otras compañías que has apuntado ahí con los seguros que
        tienes con nosotros, y la correduría anota una «señal» cuando detecta alguna de estas situaciones: un inmueble que
        nos has dicho que no tiene seguro; un capital asegurado por debajo del valor de reconstrucción estimado a partir del
        Catastro; un alquiler vivo sin seguro de impago; una póliza con otra compañía que vence en los próximos 60 días; o
        un inmueble con hipoteca.
      </p>
      <ul>
        <li>
          <strong>Qué datos usa y guarda:</strong> el nombre que tú das al inmueble, el tipo de señal y las cifras del riesgo
          (metros cuadrados, valor estimado, capital asegurado, fecha de vencimiento). No usa ni guarda el nombre, el DNI,
          el correo ni la renta de ningún inquilino, ni los datos de tu comunidad de propietarios o de su administrador.
        </li>
        <li>
          <strong>Quién lo ve:</strong> solo la correduría, en su pantalla interna. No se comunica a ninguna compañía ni a
          terceros.
        </li>
        <li>
          <strong>Qué no hace:</strong> no enviamos ningún mensaje por esta causa. Una persona de la correduría decide si te
          contacta, y solo lo hace si lo has pedido (con «Pedir precio») o si has marcado la casilla.
        </li>
        <li>
          <strong>Base legal:</strong> tu consentimiento (art. 6.1.a RGPD). Lo puedes retirar cuando quieras desmarcando la
          casilla en la misma pantalla; retirarlo no afecta a lo ya hecho. Al retirarlo dejamos de calcular y retiramos las
          señales que estuvieran abiertas (puede tardar hasta un día).
        </li>
        <li>
          <strong>Descartes:</strong> si la correduría descarta una señal, no se vuelve a anotar hasta pasados 180 días, y
          solo si la situación sigue siendo la misma.
        </li>
      </ul>
    </section>
  )
}
