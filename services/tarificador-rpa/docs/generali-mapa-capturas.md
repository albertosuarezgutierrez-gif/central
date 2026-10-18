# Generali (portal del corredor) — mapa de capturas

Fuente: Drive > «BOT compañías» (id 1PW1sQDBQ7-e6SqV-5-uMeLlWoMjPFK-9) > «Generali» (id 1Puzbyp7bVW9_eYSHlgv9SLDYybV8YxKQ).
Releído el 18/10/2026 (tarde): **6 archivos**, descargados y VISTOS como imagen (los PDF renderizados a PNG), no por OCR.
Sin datos personales: usuario, nombre del corredor y código de mediador sustituidos por [dato] (el código de la correduría vive
en una sola constante del bot, `MEDIADOR_GENERALI` de `src/adapters/generali/reglas.ts`, por decisión de Alberto).

Bot: `src/adapters/generali/auto.ts` (v0.1.0, flag `GENERALI_AUTO_ACTIVO` APAGADO) + reglas puras `src/adapters/generali/reglas.ts`
+ puertas del guard `pulsarMediadorGenerali` / `entrarTurismosGenerali` (`src/guard.ts`). Tests: `test/generali-auto.test.ts`.

## Archivos (orden por número del nombre)

| # | Nombre literal | Tipo | Qué enseña |
|---|---|---|---|
| 1 | `1.pdf` | PDF (1 pág.) | Login `access.generali.es` |
| 2 | `2 (seleccionar mediador.pdf` | PDF (1 pág.) | «SELECCIONAR MEDIADOR» (`CorredorInicio.po`) |
| 3 | `3. negocio-emision-contratacion-automoviles-turismo.jpg` | JPG | Menú desplegado hasta TURISMOS (RAMO UV) |
| 4 | `4. darle a vehículo.jpg` | JPG | «Valoración Riesgo › Datos de Valoración», bloque General + botón «Vehículo» |
| 5 | `5.jpg` | JPG | «Selector de vehículos» (tipo, subtipo, marcas) |
| 6 | `6.jpg` | JPG | «Datos de Valoración» tras el vehículo: «Identificación del vehículo» y «Personas que intervienen › Roles» |

## Pantallas

### 1. Login — `https://access.generali.es` («generali-spain - Iniciar sesión»)
- Tarjeta centrada: «Nombre de usuario» (texto, [dato]), «Contraseña» (password con ojo), casilla «Recordarme» (sin marcar),
  botón «Iniciar sesión» (gris hasta rellenar), enlaces «¿Olvidó la contraseña?» y «Ayuda».
- Bot: `loginGenerali` va a `CorredorInicio.po`; si cae en `access.generali.es` rellena usuario/contraseña
  (`CRED_GENERALI_MEDIADORES_USER/_PASS`) y pulsa «Iniciar sesión» por `ctx.pulsar`. «Recordarme» no se toca.
- El SMS de cada 30 días NO sale en las capturas: si aparece, `ctx.trasLogin` lo ve (verificacion.ts) → `requiere_humano`.

### 2. Seleccionar mediador — `https://www.generali.es/arq_genernetPortalFormWeb/CorredorInicio.po` («PORTAL DEL CORREDOR»)
- Título «SELECCIONAR MEDIADOR» (icono de personas). Cascada de `<select>` (aspecto nativo, chevron): Territorial
  («08 - SUROESTE/CANARIAS»), Sucursal («475 - OPERACIONES SUROESTE CANARIAS»), Centro («380 - OV OPERACIONES SUROESTE/CANA»),
  Comercial («50B - SG DIGITAL C.»), **Mediador («Seleccionar...», vacío)**. Botón «ACEPTAR» (borde rojo).
- ⚠️ Un carrusel/banner («FIRMA DE ANEXO CLÁUSULAS SEGURIDAD II») se pinta ENCIMA de Sucursal/Centro/Comercial. El bot no hace
  clic en los desplegables (usa `selectOption`), así que el banner no estorba; un clic a ciegas sí podría caer en él.
- Bot: Territorial…Comercial se dejan; en «Mediador» la opción del código de la correduría EXACTO (valor o «[dato] - …»);
  0 o varias → para. «ACEPTAR» solo por `pulsarMediadorGenerali` (guard: comprueba que el mediador puesto es el de la correduría).
  Tras ello la URL pasa a `.../CorredorPortal.po?mediatorCode=[dato]`; si ya entra con otro mediador, el bot para.

### 3. Portal del corredor, menú — `.../CorredorPortal.po?mediatorCode=[dato]#`
- Cabecera: GENERALI; «Portal del Corredor» + «[dato] | [dato]»; «Mis favoritos», CAT, buzón; pestañas NEGOCIO · COMPAÑÍA ·
  FORMACIÓN · NORMAS · NOTICIAS · PRODUCTOS · SERVICIOS · HISTÓRICO.
- Menú de NEGOCIO (fondo granate, columnas en cascada con «>»): EMISIÓN · EMISIÓN (NUEVO) · RED COMERCIAL · SINIESTROS ·
  CONTABILIDAD · COLECTIVOS · HERRAMIENTAS COMERCIALES · ESTADÍSTICAS → CONTRATACIÓN · ALTA DE PÓLIZA · ALTA POR REEMPLAZO ·
  CÁLCULO RÁPIDO DE PRIMAS · PROYECTO DE SEGURO · SUPLEMENTO · CONSULTAS · IMPRESIÓN DE PÓLIZA · GESTIÓN DE RECIBOS ·
  RENOVACIÓN DE CARTERA → AUTOMÓVILES → TURISMOS (RAMO UV) · VEHÍCULOS COMERCIALES Y RESTO (RAMO UY) · MOTOS Y CICLOMOTORES (RAMO UF).
- Camino (Alberto, 18/10/2026: el de las capturas, NO «Cálculo rápido»): NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES ›
  TURISMOS (RAMO UV). Bot: `entrarTurismosGenerali` (guard) SOBREVUELA los cuatro primeros y pulsa solo TURISMOS (RAMO UV), con
  `comprobarBoton` sobre su href/onclick: **si el enlace lleva `emision`/`contratacion`, se bloquea** (ver «Riesgos»).
- Alcance: solo Turismos (UV). Moto (UF) después.

### 4. Formulario de turismos — «Home › Negocio › Emisión › Contratación › Automóviles › Turismos (Ramo Uv)»
- La URL NO cambia (`CorredorPortal.po?mediatorCode=[dato]#`): el formulario se carga dentro (¿iframe o AJAX? sin HTML).
- Pestaña «Valoración Riesgo ▾» y sub-pestañas «Datos de Valoración» (activa) · «Garantías y Resultados».
- Bloque «General»: Mediador (texto «00000» seleccionado + caja gris del nombre), Flota (texto + caja gris), «F.Efectos»
  (dd/mm/aaaa, hoy, calendario), «Fecha Presupuesto» (hoy, gris), «Canal entrada» y «Subcanal entrada» (cajas grises).
- Bloque «Vehículo › Características del vehículo»: «Seleccionar vehículo» + botón gris «Vehículo».
- Bot: Canal, Subcanal y Flota se dejan como vienen (Alberto). «Mediador»: si viene vacío o a ceros se teclea el de la
  correduría (supuesto del bot: la captura enseña «00000»); con otro código, para. F.Efectos: la que propone Generali. Pulsa «Vehículo».

### 5. Selector de vehículos (tras «Vehículo»)
- Misma cabecera y migas. Título «Selector de vehículos».
- «Tipo de Vehículo»: tarjeta «Turismo» (marcada en rojo). «Subtipo de Vehículo»: Turismos (marcada) · Comerciales ·
  Autocaravanas · V. Clásicos. «Principales marcas»: 14 tarjetas con logo (Audi, BMW, Citroen, Fiat, Ford, Hyundai, Mercedes,
  Nissan, Opel, Peugeot, Renault, Seat, Toyota, Volkswagen). «Todas las marcas»: desplegable «Seleccione una» (chevron rojo).
  Botón «Cancelar». **No hay buscador por matrícula** (regla de Alberto: el vehículo llega de Allianz/Mapfre).
- Bot: tipo y subtipo se dejan; la marca SIEMPRE por «Todas las marcas» (no por los logos), casada exacto → palabra entera →
  una sola; 0 o varias → atasco con las opciones.
- **SIN CAPTURA** lo que sale tras elegir la marca (¿desplegables de modelo y versión? ¿lista? ¿botón de confirmar?). El bot
  busca `<select>` etiquetados «Modelo»/«Versión»; si no los encuentra, para con inventario + HTML.

### 6. Datos de Valoración tras elegir el vehículo
- «Identificación del vehículo»: Matrícula (texto + «?»), Uso del Vehículo («Seleccione un uso»), Renting (opciones No/Sí,
  No marcado), Garaje («Garaje colectivo»), Fecha 1ª matriculación (dd/mm/aaaa + calendario), Fecha Matriculación (dos cajas
  grises), KM anuales declarados («0» + «000»), Valor equipos sonido y multimedia («0»), Valor resto de accesorios («0»),
  ¿Entrada en puertos/aeropuertos? («SIN ENTRADA EN PUERTOS/AEROPUERTOS»).
- «Personas que intervienen › Roles»: ¿Es el propietario el mismo que el interesado/tomador? (Sí marcado) · ¿El conductor o
  conductores son personas identificadas? (Sí marcado) · El primer conductor coincide con («TOMADOR»). Sigue más abajo (cortado).
- Bot: Matrícula «1234*BCD» (regla de Alberto) y el campo de VERIFICACIÓN igual — **ese campo no sale en la captura 6**: se busca
  por su etiqueta (matrícula + verificar/confirmar/repetir) y, si no está, para con inventario. Uso: «PARTICULAR» (otro uso →
  sin mapa). Garaje: el del riesgo o «colectivo» supuesto y DECLARADO. Fecha 1ª matriculación: la del riesgo; si el riesgo no la
  trae y Generali no la autorrellena → `datos`. Renting, KM, valores y puertos: como vienen. Roles: se dejan si el riesgo dice
  tomador = propietario = conductor o no lo dice (SUPUESTO declarado); si dice que no → para (sin captura de esa variante).

## Matrícula con asterisco (`matriculaGenerali`, regla de Alberto 18/10/2026)
- Actual (4 cifras + 3 consonantes): `1234BCD` → `1234*BCD`, en «Matrícula» y en su verificación.
- Provincial antigua (decisión documentada): la misma regla literal, un asterisco en cada cambio letra/cifra (`SE1234AB` →
  `SE*1234*AB`, `M1234Z` → `M*1234*Z`), solo con un código provincial de la lista cerrada, y se DECLARA como formato supuesto.
- Cualquier otra (ciclomotor `C1234BCD`, 6 cifras anteriores a 1971, con vocales, especiales) → error de DATOS (no se inventa).

## Vehículo encadenado (Allianz/Mapfre → Generali)
- Generali no busca por matrícula. asegura (`apps/asegura/lib/tarificador-espera-vehiculo.ts`): el trabajo de Generali de una
  oportunidad queda `pendiente` con `esperaVehiculo` (no se reclama) hasta que un `ok` de allianz/auto o mapfre/auto de la MISMA
  oportunidad trae el vehículo; entonces se le inyecta `seleccionVehiculo` (marca/modelo/versión separados) y/o
  `vehiculoConfirmado` (denominación de Mapfre). Sin oportunidad → 422. Sin ningún Allianz/Mapfre vivo o a las 24 h → `cancelado`.
- Hoy el que de verdad lo da es **Mapfre** (`vehiculoConfirmado`: un solo texto). Allianz Turismos aún no llega a precio ni
  devuelve marca/modelo/versión separados: cuando lo haga, que su `tarificar` devuelva `seleccionVehiculo` y viajará solo.

## Riesgos conocidos (para la primera prueba real)
1. **Guard de emisión vs. el camino EMISIÓN › CONTRATACIÓN.** Si el enlace de TURISMOS o la petición que dispara llevan
   `emision`/`contratacion` en la URL, el guard lo BLOQUEA (fail-closed, `error_definitivo`) y el mensaje dice el texto exacto.
   **v0.1.1 (18/10/2026, OK de Alberto):** excepción mínima en guard.ts (`urlTurismosGeneraliPermitida` + ventana de
   `entrarTurismosGenerali`): SOLO los sustantivos «emisión»/«contratación», SOLO en el enlace de TURISMOS (RAMO UV) y en las
   navegaciones GET a `https://www.generali.es` durante la ventana de ese clic (≤15 s). Un POST, otro origen u otro verbo
   (emitir, contratar, grabar, pagar, aceptar, `action=`) sigue bloqueado. Sin la URL real: si el portal manda un POST con
   esas palabras, el trabajo cae y se mira con el HTML. Test: `test/generali-red-turismos.test.ts`.
2. «Mediador» del formulario a «00000»: el bot teclea el de la correduría (supuesto sin captura).
3. SMS de 30 días: el relevo del código por Telegram NO está hecho; hoy para con `requiere_humano`.

## Capturas que faltan (para cerrar hasta el PRECIO)
1. Selector de vehículos DESPUÉS de elegir la marca: modelo, versión (lista completa) y el botón con el que se confirma.
2. «Datos de Valoración» entera tras el vehículo (bajar el scroll): el campo de **verificación de la matrícula**, el resto de
   «Roles», tomador (NIF, nacimiento, CP), conductor (nacimiento, carné) y antecedentes (años asegurado, siniestros, compañía).
3. El botón/paso que lleva de «Datos de Valoración» a «Garantías y Resultados», y esa pestaña con el **PRECIO** (y cualquier
   diálogo intermedio). Idealmente con el HTML (Ctrl+S o el grabador), no solo imagen.
4. La pantalla del SMS de 30 días (para el relevo por Telegram).
5. Variantes: tomador ≠ propietario / ≠ conductor, y el desplegable «Uso del Vehículo» abierto (sus opciones).
