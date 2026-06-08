DELETE FROM protocolo_fotos WHERE protocolo_id IN (SELECT id FROM protocolos WHERE propiedad_id='12eb3eac-55eb-5772-a94e-6368d23cd4d5');
DELETE FROM protocolo_items WHERE protocolo_id IN (SELECT id FROM protocolos WHERE propiedad_id='12eb3eac-55eb-5772-a94e-6368d23cd4d5');
DELETE FROM protocolos WHERE propiedad_id='12eb3eac-55eb-5772-a94e-6368d23cd4d5';

INSERT INTO protocolos (empresa_id, propiedad_id, nombre, datos)
VALUES ('05edacff-ea49-42fe-8997-f9369613a845','12eb3eac-55eb-5772-a94e-6368d23cd4d5','Piso – Alhóndiga','{"acceso": {"llaves": "En el trastero de Farmacéutico, marcadas «número 36».", "candado_portal": {"clave": "0220", "ubicacion": "Parte exterior del portal", "nota": "Se guardan ahí las llaves de los huéspedes. Verificar y enviar foto de que se dejan."}, "canape": {"clave": "069", "contenido": "Plumero y cápsulas de café de reposición."}, "productos_limpieza": "Los del trastero de Farmacéutico o los que haya en el piso.", "ropa": "Lista en el trastero de Farmacéutico."}, "suministros": [{"item": "Papel higiénico", "cantidad": "3 rollos (normales)"}, {"item": "Cápsulas de café", "cantidad": "4", "nota": "Están en el canapé (clave 069)"}], "horarios": {"salida": "11:00", "entrada": "15:00"}, "fotos_obligatorias": ["Antes de fregar el suelo (enviar fotos).", "Candado del portal con las llaves dentro y cerrado.", "Folleto dejado en su sitio."]}'::jsonb);

INSERT INTO protocolo_items (protocolo_id, estancia, descripcion, orden)
SELECT p.id, v.estancia, v.descripcion, v.orden
FROM protocolos p, (VALUES
  ('Cocina','Cafetera vaciada (sin agua).',1),
  ('Cocina','Reponer 4 cápsulas de café.',2),
  ('Cocina','Trapo de cocina seco, dejarlo en el horno microondas.',3),
  ('Cocina','Vitrocerámica limpia.',4),
  ('Cocina','Nevera vacía y limpia.',5),
  ('Cocina','Bayeta, esponja y jabón: secos y limpios.',6),
  ('Baño','Aplicar bastante lejía en el baño y en el platero de la ducha (anti-moho).',7),
  ('Baño','Toallas: una cuadrada y otra en rollito.',8),
  ('Baño','Dejar lavabo e inodoro como en las fotos.',9),
  ('Dormitorio','Cama sin embozo y bien estirada.',10),
  ('Dormitorio','Pasar el plumero (del canapé) por toda la base de la cama para quitar el polvo.',11),
  ('Dormitorio','Funda nórdica por fuera.',12),
  ('Dormitorio','Dejar la decoración de la mesilla tal cual (importante).',13),
  ('Salón','Retirar y sacudir bien la manta; si está manchada, avisar y cambiar.',14),
  ('Salón','Cubre sofá: si está manchado, cambiarlo; siempre quitarlo y estirarlo.',15),
  ('Salón','Dejar la decoración del sofá como en la foto.',16),
  ('Salón','Mantener la decoración de escritorio y cómoda.',17),
  ('General','Limpiar ventanas y el poyete.',18),
  ('General','Limpiar muy bien el polvo.',19),
  ('General','Toallas guardadas en el mueble; perchas juntas y organizadas.',20)
) AS v(estancia,descripcion,orden)
WHERE p.propiedad_id='12eb3eac-55eb-5772-a94e-6368d23cd4d5' AND p.activo;

INSERT INTO protocolo_fotos (protocolo_id, item_key, estancia, categoria, url, caption, orden)
SELECT p.id, v.item_key, v.estancia, v.categoria, v.url, v.caption, v.orden
FROM protocolos p, (VALUES
  ('cocina_cafetera','Cocina','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/cocina_cafetera.jpg','Cafetera y reposición de cápsulas',1),
  ('r10','Cocina','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/cocina_vista.jpg','Encimera y vitro — vista general',2),
  ('materiales_productos','General','referencia','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/materiales_productos.jpg','Productos de limpieza disponibles',3),
  ('nevera','Cocina','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/nevera.jpg','Nevera: vacía y limpia',4),
  ('fregadero_utiles','Cocina','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/fregadero_utiles.jpg','Bayeta, esponja y jabón secos y limpios',5),
  ('vitroceramica','Cocina','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/vitroceramica.jpg','Vitrocerámica limpia',6),
  ('ducha_lejia','Baño','instruccion','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/ducha_lejia.jpg','Aplicar lejía en el platero de la ducha',7),
  ('r8','Baño','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/bano_lavabo.jpg','Lavabo y espejo',8),
  ('bano_wc','Baño','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/bano_wc.jpg','Inodoro',9),
  ('salon_sofa','Salón','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/salon_sofa.jpg','Decoración del sofá: debe quedar ASÍ',10),
  ('r9','Dormitorio','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/dormitorio_cama.jpg','Cama sin embozo y bien estirada',11),
  ('toallas','Dormitorio','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/toallas.jpg','Toallas guardadas en el mueble',12),
  ('dormitorio_mesilla','Dormitorio','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/dormitorio_mesilla.jpg','Decoración de la mesilla (importante)',13),
  ('deco_escritorio','Salón','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/deco_escritorio.jpg','Decoración del escritorio',14),
  ('deco_comoda','Salón','objetivo','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/deco_comoda.jpg','Decoración de la cómoda',15),
  ('verif_folleto','Verificación','verificacion','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/verif_folleto.jpg','Folleto dejado en su sitio',16),
  ('verif_candado_llaves','Verificación','verificacion','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/verif_candado_llaves.jpg','Candado abierto con las llaves dentro',17),
  ('verif_candado_ubic','Verificación','verificacion','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/verif_candado_ubic.jpg','Ubicación del candado en el portal',18),
  ('verif_candado_cerrado','Verificación','verificacion','https://wswbehlcuxqxyinousql.supabase.co/storage/v1/object/public/cleaning-photos/protocolos/12eb3eac-55eb-5772-a94e-6368d23cd4d5/verif_candado_cerrado.jpg','Candado cerrado tras dejar las llaves',19)
) AS v(item_key,estancia,categoria,url,caption,orden)
WHERE p.propiedad_id='12eb3eac-55eb-5772-a94e-6368d23cd4d5' AND p.activo;