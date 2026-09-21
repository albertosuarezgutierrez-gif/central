-- Identidad del precio y fallos de la cotización (21/09/2026).
--
-- ⛔ **NO EJECUTADA.** Escrita para que la decida Alberto. Mientras no se aplique,
-- el código NO la usa: `lib/codeoscopic/tarificacion-guardada.ts` y
-- `lib/codeoscopic/cotizaciones.ts` siguen leyendo y escribiendo exactamente las
-- mismas columnas de siempre, y `apps/plataforma` lee los campos nuevos como
-- `undefined`/`null` = «no se sabe». Ese es el orden deliberado: si el INSERT de
-- `guardarCotizacion` nombrara una columna que todavía no existe, **cada
-- cotización de 0,50€ ya pagada se quedaría sin copia** (`guardarSinTumbar` lo
-- degrada a `no_guardada`, que es visible pero caro: el precio ya no se puede
-- retomar sin volver a pagar).
--
-- Al aplicarla, el cambio de código que la acompaña es pequeño y está acotado:
--   1. `cotizaciones.ts` → añadir al INSERT de `tarificacion_precios` los cuatro
--      campos del precio (`p.id`, `p.formaPago`, `p.frecuenciaPago`, `p.meses`)
--      y, al de `tarificaciones`, `fallos` como jsonb desde `e.cotizacion.fallos`.
--   2. `tarificacion-guardada.ts` → añadirlos al SELECT y a `PrecioGuardado`, y
--      devolver `fallos` (jsonb → `FalloProducto[]`, `null` si la columna es NULL).
--   3. `apps/plataforma/lib/retarificar-asegura.ts` ya los LEE: no hay que tocarlo.
--
-- ─── Por qué `id_precio` ────────────────────────────────────────────────────
-- Es el `mainQuote.id` del vendor (`"Q7601460"`): la ÚNICA clave estable de una
-- fila de la tabla de precios. Sin ella, la pantalla identifica cada fila por
-- `compañía + producto + POSICIÓN en el array`, y en cuanto se agrupa o se filtra
-- esa posición apunta a otra fila — se pulsa «Emitir» sobre un precio y se abre
-- otro, sin que nada falle. 🚨 NO es `product.id` (el producto del catálogo del
-- vendor, un número); confundirlos ya costó un 400 real del ReRate el 11/09/2026.
-- Se deja NULLABLE: las 187 filas ya guardadas no lo tienen y **no se inventa**.
--
-- ─── Por qué `forma_pago`, `frecuencia_pago` y `meses` ──────────────────────
-- El vendor los manda en cada precio (`paymentMethod.name`, `paymentFrequency`,
-- `termMonths`) y hoy se tiran al guardar. `entrada_eur` ya se guardaba, así que
-- una prima fraccionada se recuperaba con su primer pago pero sin saber en
-- cuántas veces ni cada cuánto: el número solo no es comparable con otro.
-- NULL = el producto no lo declara. Sin valor por defecto: «anual» supuesto sería
-- un dato inventado dentro de una comparativa de precios.
--
-- ─── Por qué `fallos` en la cabecera ────────────────────────────────────────
-- Los `errors[]` de la respuesta son los productos que NO dieron precio, con el
-- motivo de la compañía. Ahí es donde aparece **«La matrícula ya está asegurada
-- en la compañía»**: la defensa de cartera dicha por la propia compañía, gratis y
-- más fiable que nuestro emparejamiento DGS↔nombre. Hoy no se guardan, así que al
-- recuperar una cotización esa información desaparece — y la pantalla lo pintaba
-- como `fallos: []`, o sea «revisado, ninguna compañía rechazó», que es un «no se
-- ha mirado» disfrazado de dato.
-- 🚨 **NULLABLE y SIN `default '[]'`**, a propósito y en contra de la costumbre:
-- con un default, las 5 cabeceras ya guardadas pasarían de «no se guardaron» a
-- «revisado: ninguna falló» en el acto, que es exactamente la mentira que esta
-- columna existe para quitar. `[]` solo lo escribe una cotización nueva en la que
-- el vendor DE VERDAD no devolvió ningún error.

alter table seguros.tarificacion_precios
  add column if not exists id_precio       text,
  add column if not exists forma_pago      text,
  add column if not exists frecuencia_pago text,
  add column if not exists meses           integer;

comment on column seguros.tarificacion_precios.id_precio is
  'mainQuote.id del vendor ("Q7601460"): la única clave estable de una fila de precios. '
  'NO es product.id. NULL = no se guardó (filas anteriores al 21/09/2026); jamás la posición.';
comment on column seguros.tarificacion_precios.forma_pago is
  'paymentMethod.name del vendor. NULL = el producto no la declara, nunca un valor por defecto.';
comment on column seguros.tarificacion_precios.frecuencia_pago is
  'paymentFrequency del vendor. NULL = no la declara. Sin ella, entrada_eur no es comparable.';
comment on column seguros.tarificacion_precios.meses is
  'termMonths del vendor: duración del periodo. NULL = no la declara.';

-- Para poder localizar un precio por su id del vendor sin recorrer la cotización
-- entera (lo que hace `retarificar-cartera.ts` al casar la oferta aceptada).
create index if not exists tarificacion_precios_id_precio_idx
  on seguros.tarificacion_precios (id_precio)
  where id_precio is not null;

alter table seguros.tarificaciones
  add column if not exists fallos jsonb;

comment on column seguros.tarificaciones.fallos is
  'errors[] de la respuesta del vendor: los productos que NO dieron precio, con el motivo de la '
  'compañía (ahí vive «La matrícula ya está asegurada en la compañía», que es defensa de cartera '
  'gratis). NULL = NO SE GUARDARON. [] = el vendor no devolvió ningún error. No son lo mismo y por '
  'eso la columna no tiene default.';
