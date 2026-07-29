import Link from 'next/link'

export const metadata = { title: 'Manual · Almacén Joaquín Jaén' }

type Seccion = {
  id: string
  ico: string
  titulo: string
  para: string
  pasos: string[]
  nota?: string
}

// Guía fiel a cada sección del programa (los textos "para" replican los subtítulos reales de cada pantalla).
const SECCIONES: Seccion[] = [
  {
    id: 'panel',
    ico: '🏠',
    titulo: 'Panel',
    para: 'Tu visión general del almacén, nada más entrar.',
    pasos: [
      'Al iniciar sesión ves el valor total del inventario, los traspasos pendientes de recibir y cuántos materiales están bajo mínimo.',
      'Debajo, el valor y las unidades de cada almacén (la central aparece marcada).',
      'Toca cualquier tarjeta o almacén para ir directo a su detalle.',
    ],
  },
  {
    id: 'almacenes',
    ico: '🏬',
    titulo: 'Almacenes',
    para: 'Central y haciendas — el stock se lleva por almacén.',
    pasos: [
      'Crea un almacén indicando si es la central o una hacienda.',
      'Abre su ficha para ver las existencias, el valor en stock y lo que hay en tránsito.',
      'Puedes editar sus datos o borrarlo; si el almacén todavía tiene existencias, el borrado se bloquea para no perder stock.',
    ],
  },
  {
    id: 'familias',
    ico: '🗂️',
    titulo: 'Familias',
    para: 'Las categorías del maestro (vajilla, cristalería, mantelería…).',
    pasos: [
      'Crea las familias con las que agrupas tus materiales.',
      'Renómbralas o bórralas por fila en cualquier momento.',
      'Cada material se asigna a una familia, y eso ordena y filtra todo el catálogo.',
    ],
  },
  {
    id: 'materiales',
    ico: '📦',
    titulo: 'Materiales',
    para: 'El maestro de artículos del almacén.',
    pasos: [
      'Da de alta cada artículo con su familia, categoría, capacidad, precio de alquiler, coste de reposición, unidades por bandeja y stock mínimo.',
      'Usa el buscador y «Ver más» para moverte por listas largas sin que se cargue todo de golpe.',
      'Edita o borra cualquier material desde su ficha.',
    ],
    nota: 'Cuando un material baja de su stock mínimo, salta el aviso «Bajo mínimo» en el Panel para que sepas qué reponer.',
  },
  {
    id: 'transferencias',
    ico: '🔄',
    titulo: 'Transferencias',
    para: 'Traspasos entre almacenes, con confirmación de recepción.',
    pasos: [
      'Crea un traspaso eligiendo almacén de origen, de destino, material y cantidad.',
      'El material queda «en tránsito»: sale del origen pero aún no cuenta como recibido.',
      'El almacén de destino confirma la recepción y entonces el stock se suma allí. Los traspasos sin confirmar aparecen como pendientes en el Panel.',
    ],
  },
  {
    id: 'inventarios',
    ico: '📋',
    titulo: 'Inventarios',
    para: 'Conteo físico por almacén — al cerrarlo, ajusta el stock.',
    pasos: [
      'Abre un inventario de un almacén. Puede ser abierto (se ve el stock teórico) o ciego (se cuenta a ojo, sin pistas).',
      'Cuéntalo tú o asígnalo a un empleado para que lo haga desde su móvil.',
      'Al cerrar el inventario, el stock del almacén se ajusta automáticamente a lo realmente contado.',
    ],
  },
  {
    id: 'movimientos',
    ico: '📜',
    titulo: 'Movimientos',
    para: 'El libro de movimientos del almacén — para auditoría.',
    pasos: [
      'Consulta el historial completo de entradas, salidas, ajustes y traspasos.',
      'Filtra por material o por fecha para reconstruir qué pasó y cuándo.',
      'Es solo de lectura: sirve de rastro fiable, nada se edita aquí.',
    ],
  },
  {
    id: 'eventos',
    ico: '🎉',
    titulo: 'Eventos y alquileres',
    para: 'Reserva de material por evento, con prioridad sobre el resto.',
    pasos: [
      'Crea un evento y añádele las líneas de material con sus cantidades.',
      'El material del evento queda reservado con prioridad, así no se cuenta como disponible para otros usos.',
      'Vale tanto para tus eventos de catering como para el alquiler de material a terceros.',
    ],
  },
  {
    id: 'empleados',
    ico: '👥',
    titulo: 'Empleados',
    para: 'Altas de acceso — la oficina crea los usuarios y sus contraseñas.',
    pasos: [
      'Crea un empleado con su usuario y una contraseña inicial.',
      'Puedes editar su nombre, usuario y teléfono, o restablecerle la contraseña cuando haga falta.',
      'Al darlo de baja pierde el acceso, pero su historial se conserva.',
    ],
  },
  {
    id: 'mi',
    ico: '📱',
    titulo: 'Área del empleado',
    para: 'Lo que ve el empleado al entrar: sus tareas de inventario.',
    pasos: [
      'El empleado entra con el usuario y la contraseña que le dio la oficina.',
      'Ve la lista de inventarios que tiene asignados.',
      'Entra en cada uno, cuenta lo que ve de cada material desde el móvil y guarda.',
    ],
  },
  {
    id: 'publico',
    ico: '🌐',
    titulo: 'Escaparate público',
    para: 'El catálogo de alquiler y la solicitud de reserva, sin necesidad de entrar.',
    pasos: [
      'Tus clientes ven el catálogo de material disponible para alquilar en la web pública.',
      'Consultan la disponibilidad por fechas de cada artículo.',
      'Envían una solicitud de reserva que te llega a la oficina para gestionarla.',
    ],
    nota: 'Es la cara pública de la marca: mismo diseño corporativo, pero abierto a cualquiera sin contraseña.',
  },
]

export default function ManualPage() {
  return (
    <main>
      <header className="manual-cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-jj.png" alt="Joaquín Jaén · Catering" />
        <h1>Manual del programa</h1>
        <div className="manual-cover-sub">Almacén · Guía de uso paso a paso</div>
        <div className="manual-acceso">
          <span>
            Acceso: <b>almacen-pisos-turisticos-projects.vercel.app</b>
          </span>
          <span>
            La oficina entra con su email; los empleados, con el usuario que les crea la oficina.
          </span>
        </div>
      </header>

      <nav className="manual-toc" aria-label="Secciones del manual">
        {SECCIONES.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            <span aria-hidden>{s.ico}</span>
            {s.titulo}
          </a>
        ))}
      </nav>

      <section className="card">
        <div className="card-title">Qué es</div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
          El control operativo del almacén de Joaquín Jaén: el maestro de materiales por familias, el stock
          repartido entre la central y las haciendas, los traspasos entre almacenes, los inventarios físicos, la
          reserva de material por evento y el escaparate de alquiler para clientes. Todo desde un mismo sitio,
          también desde el móvil.
        </p>
      </section>

      {SECCIONES.map((s) => (
        <section key={s.id} id={s.id} className="card manual-sec">
          <div className="manual-sec-head">
            <span className="manual-ico" aria-hidden>
              {s.ico}
            </span>
            <div>
              <h2>{s.titulo}</h2>
              <div className="manual-sec-for">{s.para}</div>
            </div>
          </div>
          <ol className="manual-steps">
            {s.pasos.map((p, i) => (
              <li key={i}>
                <span className="n">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
          {s.nota && <div className="manual-note">{s.nota}</div>}
        </section>
      ))}

      <section className="card">
        <div className="manual-sec-head">
          <span className="manual-ico" aria-hidden>
            💡
          </span>
          <div>
            <h2>Buenas prácticas</h2>
            <div className="manual-sec-for">Cuatro cosas que conviene tener claras.</div>
          </div>
        </div>
        <ul className="manual-tips">
          <li>Todo se puede editar y borrar. Los borrados conservan el historial, así que no se pierde información.</li>
          <li>Los importes se muestran en euros con formato español (por ejemplo, 2.162,49&nbsp;€).</li>
          <li>El programa funciona igual en el ordenador y en el móvil.</li>
          <li>Si algo baja de su stock mínimo, el Panel te lo avisa para que lo repongas a tiempo.</li>
        </ul>
      </section>

      <p className="manual-foot">
        ¿Dudas o algo que no cuadra? Contacta con la oficina. · Joaquín Jaén · Eventos &amp; Catering
      </p>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link href="/panel" className="btn btn-primary">
          Volver al panel
        </Link>
      </div>
    </main>
  )
}
