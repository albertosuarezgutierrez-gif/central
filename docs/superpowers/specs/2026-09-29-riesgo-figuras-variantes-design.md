# El riesgo como pantalla: figuras, variantes e historial de presupuestos

> Dictado de Alberto (29/09/2026): «Nosotros aseguramos riesgos. Siempre se trabaja dentro de la
> oportunidad, que es el riesgo. El riesgo no cambia; lo que cambia es la persona». Estado: **diseño,
> pendiente de OK de Alberto**. No hay código todavía.

## 1. El problema

Hoy la tarificación y el presupuesto cuelgan del **cliente + ramo**:

- `ultimaTarificacionNueva` busca la última de `cliente_id + ramo`. Una segunda cotización de la
  misma moto **pisa** a la primera en pantalla, y una cotización a nombre del padre se guardaría en
  la ficha del padre, **lejos de la moto**.
- `seguros.oportunidades` no tiene figuras. El tomador es `cliente_id`. Propietario y conductor solo
  existen como texto libre en el borrador del navegador de `AutoNuevo` y se pierden al cerrarlo.
  Moto ni eso: manda la misma persona como tomador, propietario y conductor.
- No hay sitio donde ver los presupuestos de un riesgo, ni en qué se diferencia uno de otro.

Casos que tienen que salir solos:

1. **Nuevo.** «Mírame a nombre de mi padre», sin salir de la pantalla ni crear otra oportunidad.
2. **Renovación.** La compañía sube el precio por siniestralidad y Alberto retarifica el mismo
   riesgo con el padre de tomador para que el cliente no se vaya.
3. **Comparar.** Ver P1…Pn del mismo riesgo con su precio y **qué cambió** entre ellos (tomador,
   código postal, conductor, garaje, km…).

## 2. El modelo

**Riesgo = oportunidad** (mientras se cotiza) o **póliza** (cuando está en vigor). Es lo fijo: la
moto 2121NST, sus km, dónde duerme. Dentro del riesgo:

- **Figuras**: tomador · propietario · conductor habitual · conductores ocasionales (solo auto; el
  vendor no tiene conductor ocasional en moto). **Cada figura es una ficha** (`cliente_id`), nunca
  texto suelto: es la regla de «agrupar por identidad» y lo que permite que la ficha del padre sepa
  en qué riesgos figura.
- **Variantes**: cada tarificación del riesgo es una variante (P1, P2…) con **su propia foto de
  figuras y de datos**. Las figuras vigentes del riesgo son las de la variante en curso; cambiar una
  figura no reescribe las variantes anteriores.
- **Estado**: oportunidad (abierta / ganada / perdida) → al emitir, póliza, y las figuras de la
  variante elegida pasan a `poliza_intervinientes`. En la renovación, la póliza abre oportunidad de
  retarificación con esas mismas figuras precargadas.

La oportunidad **no cambia de dueño** por probar otra persona: sigue en la ficha de quien trata con
Alberto. Si de verdad pasa a llevarla otro, hay una acción aparte: «Pasar la oportunidad a…».

## 3. Datos (migración en `seguros`)

| Cambio | Para qué |
|---|---|
| `oportunidad_figura (id, correduria_id, oportunidad_id, rol, cliente_id, orden, creado_at, actor)` con `rol ∈ tomador·propietario·conductor_habitual·conductor_ocasional`; único `(oportunidad_id, rol)` salvo ocasional | Las figuras vigentes del riesgo. Sin fila de tomador, el tomador es `oportunidades.cliente_id` (compatibilidad con las 100 % actuales). |
| `oportunidades.poliza_id uuid null` (FK polizas) | Riesgo que YA es póliza nuestra (renovación / retarificación). Hoy vive como `info_riesgo->>'polizaId'`: se rellena desde ahí en la migración. |
| `tarificaciones.figuras jsonb` (`{tomador, propietario, conductor, ocasionales[]}` → `cliente_id`) | La foto de figuras de esa variante. NULL en las viejas = «no consta», no «el cliente». |
| `tarificaciones.nota text` | Etiqueta libre de Alberto: «probando a nombre del padre». |
| `oportunidad_historial` (ya existe) | Nuevas acciones: `figura_asignada`, `figura_nueva`, `variante_cotizada`, `presupuesto_enviado`, `oportunidad_traspasada`. |

**No se guarda el «qué cambió»**: se **deriva** de la `peticion` de cada variante contra la
anterior con una función pura (`diferenciasVariante(a, b)` en `module-seguros`). Guardarlo sería
una segunda verdad que se desincroniza.

La búsqueda de «la tarificación de este riesgo» pasa a ser **por `oportunidad_id`**. La de
`cliente + ramo` queda solo como caída para las tarificaciones viejas sin oportunidad.

## 4. Crear una persona dentro del riesgo

En cada selector de figura: el cliente · sus vínculos (`cliente_relaciones`, sin «Sin vínculo») ·
**«+ Nueva persona»**. Esta última abre un panel lateral dentro de la misma pantalla:

- Pide lo que la compañía exige y nada más: nombre y apellidos, DNI, nacimiento, sexo, estado
  civil, móvil y, si conduce, fecha del carnet. `AltaCliente` no trae sexo, estado civil ni carnet:
  van a los sitios que ya lee `clienteOrigenDe` (`saludo`, `clientes.estado_civil`,
  `cliente_carnets_conducir`).
- En un solo paso: `altaCliente` (lead) + relación con el cliente de la oportunidad (tipo elegido) +
  `oportunidad_figura`. DNI repetido → «ya existe» con enlace, y se asigna la existente.
- **Sin datos completos no se cotiza** (ni se pagan los 0,50€). La variante queda «esperando datos
  de X» con dos botones: «Pedírselos a X» y «Pedírselos a [cliente]». Los dos usan el enlace de
  solicitud de datos que ya existe, ampliado a «datos de un tercero» con casilla de consentimiento
  (RGPD). El móvil del familiar **no** se sustituye por el del cliente.

## 5. La pantalla del riesgo

`/correduria/oportunidad/[id]` (hoy redirige a la ficha) pasa a ser la pantalla. La **póliza** monta
los mismos bloques en su ficha, con «Retarificar este riesgo». Mismo lenguaje visual que la maqueta
**«Presupuesto por garantías»**: Quicksand/Nunito Sans, marca `#3364ee`, tarjetas de 16 px y sí/no/
no consta en verde/rojo/ámbar. De arriba abajo:

1. **Cabecera del riesgo**: «Moto · 2121NST · Yamaha…», estado (oportunidad abierta / póliza en
   vigor), vencimiento, compañía actual y su prima si la hay.
2. **Intervinientes**: cuatro chips, uno por figura, con nombre y vínculo («Padre de Manuel»). Tocar
   uno abre el selector con «+ Nueva persona». Un aviso por figura incompleta.
3. **Presupuestos de este riesgo** (el historial; cifras de EJEMPLO): una fila por variante, de la más reciente a la más
   antigua.
   - **P3 · 29/09** · «Tomador: su padre · CP 41003 → 11520» · mejor prima **180,00€** (Reale) · 12
     opciones · *Enviado, visto*.
   - **P2 · 28/09** · «Garaje privado · 5.000 km» · 216,53€ (Allianz) · 31 · *Enviado*.
   - **P1 · 27/09** · primera · 231,10€ · 28 · *Sin enviar*.

   «Lo que cambió» es contra la variante anterior, en palabras (tomador, conductor, CP, garaje, km,
   fecha de efecto, modalidades pedidas). Al tocar una fila se abre su parrilla. Una casilla
   «Comparar» en dos filas enseña las diferencias campo a campo y el precio de las mismas compañías
   en las dos.
4. **Nueva variante**: copia la variante abierta, deja cambiar figuras y datos del riesgo, dice
   «esto costará 0,50€», y solo entonces pide precio.
5. **Parrilla de la variante abierta**: la de la maqueta. Arriba las **3 recomendadas** (más barata ·
   equilibrio · mejor cubierta por menos); barra lateral **«¿Qué quieres que incluya?»** con un
   interruptor por garantía y su recuento (grúa marcada de serie); lista con logo, categoría,
   franquicia y prima; **Comparar** hasta 3; y la vista del corredor «Incluir en el presupuesto»
   (lo de hoy, opt-in). Las garantías salen de lo que ya trae #3953 (opciones del producto), con los
   tres estados sí / no / no consta.
6. **Enviar**: `PrepararPresupuesto` de hoy. **Destinatario por defecto: el tomador de la variante**
   (es quien contrata y firma), cambiable a quien lleva la oportunidad.

## 6. Reglas que no se negocian

- **Nada se supone de una persona** (DNI, nacimiento, móvil, carnet): o está en su ficha, o se pide.
- **Cotizar gasta 0,50€**: nueva variante = confirmación explícita, libro de consumo de siempre.
- **La variante contratada tiene que ser la verdad.** Al emitir una variante cuyas figuras difieren
  de la primera del riesgo, Alberto confirma una casilla: «X es el conductor habitual real y el
  vehículo duerme en CP Y». Declarar a otro conductor o domicilio para abaratar es ocultación del
  riesgo (arts. 10 y 89 LCS): la compañía puede negar o reducir la indemnización.
- **NULL ≠ «el cliente»**: una variante vieja sin foto de figuras dice «figuras no constan».

## 7. Entregas

1. **Pantalla del riesgo + figuras + historial.** Migración, selectores con «+ Nueva persona»,
   historial P1…Pn con «qué cambió» y parrilla nueva. Cotizar una variante con otras figuras en
   **auto** (el constructor ya lo soporta). Enviar al tomador.
2. **Moto con figuras distintas** (propietario / conductor ≠ tomador; hoy manda la misma persona). La
   primera cotización real puede dar un 400 nuevo: se prueba con OK de Alberto (0,50€).
3. **Pedir datos a un tercero** (enlace al familiar o al cliente, con consentimiento), **emisión →
   intervinientes** y **renovación desde la póliza** con figuras precargadas. Además, «Pasar la
   oportunidad a…».

## 8. Preguntas abiertas

- ¿Cuántos ocasionales como máximo en auto? El vendor manda uno (`secondaryDriver`). Propuesta: uno.
- Tomador **empresa** (sin sexo ni estado civil): fuera de este diseño, como hoy.
- Hogar: mismo modelo (figuras = tomador + asegurado). Se deja para después de auto y moto.
