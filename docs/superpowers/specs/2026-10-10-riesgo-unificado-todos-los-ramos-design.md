# Una sola pantalla de riesgo para TODOS los ramos (4 bloques + «Pedir precio» embebido)

> Pedido de Alberto (10/10/2026). Estado: **diseño, pendiente de OK**. Continúa
> `2026-09-29-riesgo-figuras-variantes-design.md` (figuras + variantes), que ya está en gran parte hecho.
> Sin SQL aquí: solo se describe qué haría falta.

## 0. Punto de partida (medido en el código el 10/10/2026)

`/correduria/oportunidad/[id]` (`RiesgoPantalla.tsx`) **ya es la pantalla única** para todos los ramos. Hoy pinta,
de arriba abajo: cabecera · `DatosVehiculo` **o** `DatosRiesgo` (vivienda / capital / comercio / libre) ·
`FigurasRiesgo` · `HistorialRiesgo` · bloque «Pedir precio» · `OfertasOportunidad` · `PresupuestosCompanias` (bots) ·
`HistorialVariantes` (P1…Pn) · `PropuestaEscenarios`. Lo que falta no es la pantalla, es que **los 4 bloques sean
iguales por contrato en todos los ramos** y que «Pedir precio» deje de bifurcarse con `if (esMoto)`.

Huecos reales encontrados (no opiniones):

| # | Hueco | Dónde | Consecuencia |
|---|---|---|---|
| H1 | `diferenciasVariante()` solo mira rutas de auto/moto/hogar (`holder`, `risk.owner`, `risk.vehicle…`, `risk.address…`). No mira `risk.insured`, `risk.insureds[]` ni el capital de vida/salud/decesos. | `module-seguros/variantes-riesgo.ts` | Dos variantes de vida con distinto capital salen como **«Mismos datos que la anterior»**: se afirma una igualdad que no se ha comparado (regla «no mirado ≠ no hay»). Debe devolver `null` («no se puede comparar») en ramos sin comparador. |
| H2 | Asegurados de salud/decesos son **texto** (`AseguradoAdicional`: nombre, apellidos, nacimiento, sexo) dentro de `info_riesgo.datosCapital`, sin `cliente_id` ni DNI. | `datos-capital-riesgo.ts` | Rompe «cada figura es una ficha / agrupar por identidad»: la ficha del hijo no sabe en qué riesgos figura y dos tecleos del mismo hijo no se reconocen. |
| H3 | `oportunidad_figura` tiene `unique (oportunidad_id, rol)` y `check rol in (tomador, propietario, conductor_habitual, conductor_ocasional)`; `rolesDelRamo()` da `['tomador']` a todo lo que no es auto/moto. | `sql/2026-09-29e_riesgo_figuras.sql` · `variantes-riesgo.ts` | No caben asegurados (n), asegurado ≠ tomador en vida/hogar, ni varios de un rol. La foto `tarificaciones.figuras` es `rol → un cliente_id`: tampoco admite n. |
| H4 | «Historial» solo tiene contenido de vehículo (seguro anterior de `poliza_competencia` + carné). En hogar/vida/salud/decesos se pinta el seguro anterior y nada más. | `oportunidad-riesgo.ts` (asegura) · `lib/historial-riesgo.ts` | Correcto en tres estados, pero vacío de lo que importa por ramo (siniestros del hogar, preexistencias…). |
| H5 | P1…Pn salen SOLO de `seguros.tarificaciones.oportunidad_id` (regla 9). Los bots (comunidades) y las ofertas tecleadas viven aparte (`PresupuestosCompanias`, `OfertasOportunidad`). No existe «archivar» una variante (solo `presupuesto.retiradoAt`). | `HistorialVariantes`, `OfertasOportunidad` | El bloque 4 no es uno: son tres listas según de dónde salió el precio. |
| H6 | Hay DOS `HistorialRiesgo.tsx`: el de la oportunidad (seguro anterior/carné) y el de la póliza (cadena de pólizas del mismo bien). | `oportunidad/[id]/` · `poliza/[id]/` | Mismo nombre, dos conceptos. Renombrar el de póliza a «Pólizas de este bien» cuando se toque. |

## a) Matriz RAMO × bloques

Cotizador: **CDS** = Codeoscopic/Avant2 (API REST solo auto, moto, hogar, salud, decesos, vida; 0,50€ por
`POST /insurances` con 200). **RPA** = bots de compañía (`module-tarificacion`, `RamoRpa` hoy solo `comunidades`/Allianz).

| Ramo | 1 · Personas (rol) | 2 · Objeto del riesgo (clave `info_riesgo`) | 3 · Historial relevante | Cotizador hoy | Qué falta |
|---|---|---|---|---|---|
| **Moto** | tomador · propietario · conductor habitual (sin ocasional: el vendor no lo tiene) | `datosVehiculo` (matrícula, catálogo marca/modelo/versión, matriculación, compra, km, garaje, CP/municipio circulación, cilindrada) | seguro anterior (compañía, nº póliza, años sin siniestros, siniestros 5 años, matrícula de esa póliza) · carné moto del conductor · experiencia en moto | CDS **embebido** (`PedirPrecioMoto` + `CotizadorMoto`, huella `firmaRiesgoMoto`) | Pasarlo al registro (es la referencia; sin cambio de conducta). |
| **Auto** | tomador · propietario · conductor habitual · 1 ocasional | `datosVehiculo` (+ remolque ligero) | igual que moto + carné B · supuesto de 10.000 km marcado (`km-auto.ts`) | CDS **embebido** en el riesgo (`RAMOS_COTIZADOR_EMBEBIDO`; PR #4477), antes en pantalla aparte `cliente/[id]/auto-nuevo?oportunidad=` (`AutoNuevo.tsx`, 2.030 líneas) | Ya embebido (PR #4477). |
| **Hogar** | tomador · **asegurado/propietario de la vivienda** (falta: hoy solo tomador) · acreedor hipotecario (texto/entidad, no ficha) | `datosVivienda` (ref. catastral, dirección troceada, m², año, reforma, tipo, régimen, uso, materiales, alarma, blindada…; catálogos CDS) + capitales continente/contenido | seguro anterior · siniestros del hogar (nuestros: `siniestros` de la póliza si es renovación; ajenos: declarados) · años en la compañía | CDS en pantalla aparte `hogar-nuevo?oportunidad=`; retarifica póliza en riesgo (`retarificaEnRiesgo`) | Rol `asegurado`; `CotizadorHogar` embebido; comparador ya tiene CP/capitales/régimen (completar ref. catastral). |
| **Vida** | tomador · **asegurado** (puede no ser el tomador) · beneficiarios (designación) | `datosCapital`: capital, profesión, fumador (duración retirada 03/10) | seguro de vida anterior / préstamo vinculado (no hay campo) | CDS en pantalla aparte `vida-nuevo`; 🚧 la forma de `risk` es una SUPOSICIÓN (`peticion-vida.ts`) | Rol `asegurado`; comparador de capital (H1); validar forma real con una cotización con OK (0,50€). |
| **Salud** | tomador · asegurados (n, hasta 10) | `datosCapital`: modalidad deseada, capital (nota) + asegurados | seguro anterior (compañía, antigüedad → carencias) · preexistencias (no hay campo; dato de salud = categoría especial RGPD) | CDS en pantalla aparte `salud-nuevo` (🚧 «sin verificar» en el menú) | H2/H3 (asegurados como figuras), comparador `risk.insureds`, verificar esquema. |
| **Decesos** | tomador · asegurados (n) | `datosCapital`: capital (nota) + asegurados | póliza de decesos anterior (antigüedad, capital) | CDS en pantalla aparte `decesos-nuevo` | Igual que salud (H2/H3/H1). |
| **Comercio** | tomador (empresa, CIF) · asegurado | `datosComercio` (actividad/CNAE, dirección, m², año, régimen local, empleados, facturación, capitales[], medidas de protección, `porCompania`) | seguro anterior · siniestros del local | **Ninguno**: CDS sin endpoint; formulario canónico RPA existe (`formulario-comercio.ts`) pero sin compañía grabada (Allianz ePAC pendiente) | Cotizador RPA cuando haya un bot; mientras, «se cotiza fuera» + oferta tecleada. |
| **RC** | tomador (persona o empresa) | `datosRiesgoLibre` (descripción, dirección, capital, notas); canónico RPA `formulario-rc.ts` (CNAE, ámbito territorial…) | siniestros RC declarados | **Ninguno** (Occident por grabar) | Igual que comercio. Pasar a un objeto propio cuando haya bot. |
| **Comunidades** | tomador = comunidad (CIF); presidente/administrador como contacto, no figura | `datosRiesgoLibre` (capital, dirección) que siembra `FormularioComunidad` | póliza a reemplazar (`polizaAReemplazar`) · siniestros | **RPA** Allianz (`PresupuestosCompanias`) | Que sus resultados entren en P1…Pn (H5). |
| **Otros** | tomador | `datosRiesgoLibre` | seguro anterior | Ninguno | Nada: expediente. |

## b) Modelo de datos común

**Ya sirve y no se toca:**

- `seguros.oportunidades` = el riesgo; `poliza_id` para renovación; `info_riesgo.<clave>` con UNA clave por ramo
  (`claveDatosDeRamo()` es la única fuente) y el patrón editar/confirmar/precargar de `datos-riesgo-ramo.ts`.
- `seguros.oportunidad_figura` = personas vigentes del riesgo (fichas, por `cliente_id`).
- `seguros.tarificaciones` (`oportunidad_id`, `figuras` jsonb, `nota`, `peticion`, `respuesta`) = cada P. La regla 9
  sigue: **solo lo enlazado por `oportunidad_id` se emite**.
- `oportunidad_historial` para cada acción; `poliza_competencia.seguroAnterior` para el historial.

**Haría falta (describir, no SQL):**

| Cambio | Para qué | Si se hace mal |
|---|---|---|
| Ampliar el `check` de `oportunidad_figura.rol` con `asegurado` (y, si se decide, `beneficiario`); sustituir el `unique (oportunidad_id, rol)` por único **parcial** para los roles de uno (tomador, propietario, conductor habitual, ocasional) + columna `orden` para los de n. | Vida/hogar (asegurado ≠ tomador) y salud/decesos (n asegurados). | Quitar el único sin el parcial deja meter dos tomadores: el puerto de asegura debe seguir rechazándolo (test). |
| `rolesDelRamo()` → `{ rol, min, max }` por ramo (fuente única en `module-seguros`). | La pantalla y el puerto leen la misma cardinalidad. | Dos listas de roles (pantalla y puerto) se desincronizan: el registro de la pantalla LEE de aquí. |
| `tarificaciones.figuras`: admitir `rol → cliente_id[]` para los de n (lectura tolerante de la forma vieja). | Foto de asegurados por variante. | Una variante vieja sin foto sigue diciendo «figuras no constan», nunca «el cliente». |
| Asegurados de `datosCapital.asegurados` → figuras `asegurado`. Las listas de texto existentes **no se migran a fichas solas** (no hay DNI: se fundiría por nombre); se enseñan como «asegurados tecleados (sin ficha)» hasta que el corredor los vincule. | H2. | Crear fichas automáticamente por nombre+nacimiento = fusión por no-identidad. Prohibido. |
| `tarificaciones.archivada_at` + `archivada_por` (o tabla aparte si se prefiere no tocar la de Codeoscopic). | «Guardados y archivados»: ocultar P viejas sin borrar. | Archivar no borra ni desenlaza (regla 9); una archivada no se emite sin desarchivar. |
| Una **vista de lectura** (en el puerto, no tabla) que una P de CDS, trabajos de bots y ofertas tecleadas con `origen ∈ codeoscopic·bot·manual` y `emitible` (solo CDS). | H5: un bloque 4 único. | Pintar una oferta tecleada como emitible: el botón de emitir solo para `origen = codeoscopic`. |
| `comparador` por ramo en `diferenciasVariante` (rutas `risk.insured`, `risk.insureds[]`, capital/`deathBenefit`, modalidad) y `null` para el ramo sin comparador. | H1. | Ver contrato abajo: sin comparador = `null`, nunca `[]`. |

Historial por ramo: **no hace falta tabla nueva** para empezar. Siniestros nuestros: los de la póliza enlazada
(`poliza_id`), con la cadencia de corte por compañía (`corte-siniestros-compania`) → si el corte está viejo, la fila
dice «sin dato desde dd/mm», no 0. Lo ajeno (preexistencias, siniestros de otra compañía) se DECLARA al pedir precio
y queda en la `peticion` de la variante.

## c) Contrato de componentes

Registro **puro** en `apps/plataforma/lib/correduria/registro-ramos.ts` (testeable sin React) + mapa de componentes
cliente en `oportunidad/[id]/registro-componentes.tsx`. `RiesgoPantalla` deja de tener `if (esMoto)/esVehiculo`:
pide la entrada del ramo y monta los 4 bloques + «Pedir precio».

```ts
type RamoRiesgo = 'auto' | 'moto' | 'hogar' | 'vida' | 'salud' | 'decesos' | 'comercio' | 'rc' | 'comunidades' | 'otros'

interface DefinicionRamo<R extends RamoRiesgo> {
  ramo: R
  roles: readonly { rol: RolFigura; min: number; max: number }[]   // = rolesDelRamo(ramo), no copia
  claveObjeto: ClaveDatosRiesgo                                     // = claveDatosDeRamo(ramo), no copia
  filasHistorial: (h: HistorialRiesgo, ctx: { hoy: string }) => FilaHistorial[]   // tres estados
  comparar: ((a: unknown, b: unknown) => Diferencia[] | null) | null              // null = «no se puede comparar»
  cotizador: CotizadorDeRamo<R>
}

interface BloqueObjetoProps<R> {          // BloqueObjeto<Ramo>: DatosVehiculo, DatosVivienda, DatosCapital…
  riesgo: Riesgo; ocupado: boolean
  onCambio(texto: string): void; onError(texto: string): void
  onEditando(aMedias: boolean): void       // obligatorio: bloquea el cotizador (hoy solo vehículo lo da)
}

type CotizadorDeRamo<R> =
  | { tipo: 'embebido'; embebido: CotizadorEmbebido<R> }
  | { tipo: 'pantalla'; ruta: (e: { tomadorId: string; oportunidadId: string }) => string }  // transitorio
  | { tipo: 'bots' }                       // PresupuestosCompanias sembrado con el objeto
  | { tipo: 'fuera'; aviso: string }       // sin tarifa: expediente + oferta tecleada

interface CotizadorEmbebido<R> {
  firma(r: Riesgo): string                 // huella de lo que cotiza (vehículo/vivienda/capital + figuras)
  abrir(oportunidadId: string): Promise<Apertura<R>>   // server action: relee riesgo + catálogos (gratis)
  Componente: ComponentType<{
    apertura: AperturaOk<R>
    bloqueo: string | null                 // de motivoBloqueoCotizador(): editando, recargando, desfase
    onCotizando(enVuelo: boolean): void
    onCotizado(tarificacionId: string): void   // ya enlazada por oportunidad_id (regla 9)
    onCerrar(): void
  }>
}
```

Reglas del contrato: (1) la huella se compara al abrir y antes de pagar (patrón `cotizador-embebido.ts`, generalizado:
`firmaRiesgo(r, claveObjeto)`); (2) el cotizador **no edita** objeto ni personas, solo condiciones de la cotización;
(3) confirmación explícita de 0,50€ dentro del componente; (4) un guardián lee el registro y exige que todo ramo de
`RAMOS_PRESUPUESTO` (pendiente de crear como registro de este diseño; hoy existe un `RAMOS_PRESUPUESTO` distinto en `apps/plataforma/lib/ficha-asegura.ts`) y de `claveDatosDeRamo` tenga entrada, que `tipo:'embebido'|'pantalla'` coincida con
`ramoVariante()` y que un ramo con `comparar: null` pinte «No se puede comparar». Brazos vistos en rojo.

## d) Plan por fases (un PR por ramo)

| Fase | PR | Contenido | Riesgo |
|---|---|---|---|
| 0 | Registro + H1 | `registro-ramos.ts` con los 10 ramos apuntando a lo que hay HOY (auto y moto embebidos (RAMOS_COTIZADOR_EMBEBIDO), resto `pantalla`/`bots`/`fuera`); `RiesgoPantalla` lee del registro sin cambiar conducta; `diferenciasVariante` → `null` en vida/salud/decesos/comercio/RC hasta tener comparador; guardián. | Bajo. Cero llamadas a CDS. |
| 1 | **Auto** (en curso) | Extraer `CotizadorAuto` de `AutoNuevo.tsx` como `CotizadorMoto`; `abrirCotizadorAutoDeOportunidad`; firma con ocasional y remolque. | Medio: pantalla grande; F3 de la memoria toca el mismo fichero → coordinar, no en paralelo. |
| 2 | Figuras multi + rol `asegurado` (asegura) | SQL de `oportunidad_figura` y `tarificaciones.figuras`; puerto y `rolesDelRamo` con cardinalidad. **Antes** de hogar/vida/salud/decesos. Asegura se despliega antes que plataforma. | Alto (migración, alto riesgo según CLAUDE.md → `agente-architect` revisa). |
| 3 | **Hogar** | `CotizadorHogar` embebido; asegurado/propietario; historial con siniestros de la póliza enlazada. | Medio. Primera cotización embebida con OK (0,50€). |
| 4 | **Decesos** | Asegurados como figuras; comparador `risk.insureds`. | Medio. |
| 5 | **Vida** | Asegurado ≠ tomador; comparador capital; **verificar la forma `risk` real** (hoy suposición) con UNA cotización con OK. | Medio-alto: esquema no verificado. |
| 6 | **Salud** | Igual que decesos + verificar esquema (🚧). Preexistencias NO se guardan en esta fase (RGPD). | Medio-alto. |
| 7 | Bloque 4 unificado + archivar | Vista `origen/emitible`; `archivada_at`; comunidades (bots) y ofertas tecleadas en P1…Pn. | Medio: no confundir oferta tecleada con emitible. |
| 8 | Comercio / RC | Solo cuando exista el primer bot grabado; hasta entonces `fuera`. | — |

Orden recomendado: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (valor: auto/moto/hogar concentran las cotizaciones CDS; riesgo:
las migraciones de figuras antes de cualquier ramo de personas, y los esquemas sin verificar al final). El volumen
por ramo no lo he medido: si Alberto quiere priorizar por cartera, contar oportunidades por `tipo` primero.

Riesgos transversales:

- **0,50€:** ningún PR añade una ruta que cotice sola; cada cotizador embebido pasa por el libro de consumo y la
  huella anti-duplicado (409 sin cargo). Las pruebas reales, una por ramo y con OK de Alberto.
- **Emisión:** fuera de alcance. El emitir sigue en «Presupuestos de este riesgo» y solo para `origen=codeoscopic`
  enlazada (regla 9). Asegurados nuevos en emisión → spec propia (regla 6).
- **Tres estados:** objeto, historial y asegurados: `null` = sin dato, `[]` = revisado ninguno. Un `catch` del puerto
  = «no se ha podido leer», nunca bloque vacío. H1 es justo este fallo.
- **32.600 fichas ≠ clientes:** las personas que se añaden como figura son **leads** hasta tener póliza en vigor
  (`esCarteraEnVigor`); la pantalla no debe rotular «cliente» a un asegurado por estar en un riesgo, ni usar
  `clientes.tipo`. Elegir persona: vínculos de la ficha + «Nueva persona», nunca un buscador sobre las 32.600.
- **Multi-tenant:** todo por el puerto con `correduriaId` explícito; las figuras se validan contra la misma correduría.

## e) Decisiones abiertas para Alberto (con recomendación)

1. **Asegurados de salud/decesos: ¿fichas o texto?** Recomiendo **fichas** (rol `asegurado`), con alta ligera
   (nombre, nacimiento, sexo; DNI se pide al emitir). Los tecleados de hoy quedan como «sin ficha» hasta vincularlos.
2. **Beneficiarios de vida: ¿figura?** Recomiendo **no por ahora**: es una cláusula («herederos legales»), se recoge
   como texto al emitir.
3. **Archivar un presupuesto (P):** Recomiendo **columna `archivada_at`** (oculta, no borra, no se emite sin
   desarchivar), distinta de «retirado» (que es del presupuesto enviado al cliente).
4. **Precios de bots y ofertas tecleadas en P1…Pn:** Recomiendo **sí, en la misma lista**, marcados
   «Bot de compañía» / «Tecleado» y sin botón de emitir.
5. **Orden tras auto:** Recomiendo **hogar antes que los ramos de personas**, y la migración de figuras multi (fase 2)
   antes de hogar; salud y vida al final por esquema sin verificar.

**Aprobado por Alberto 10/10/2026:** las 5 decisiones, tal como se recomiendan (asegurados de salud/decesos como fichas;
beneficiarios de vida como texto; archivar con `archivada_at`; bots y tecleados en la misma lista P1..Pn, marcados y sin
emitir; hogar antes que los ramos de personas). Fase 0 implementada: H1 en `variantes-riesgo.ts` y
`apps/plataforma/lib/correduria/registro-ramos.ts` (registro puro + guardián; `RiesgoPantalla` aún no lo lee).
