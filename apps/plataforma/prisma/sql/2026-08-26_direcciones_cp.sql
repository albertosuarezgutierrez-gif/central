-- Direcciones del patrimonio: completar el código postal (26/08/2026).
--
-- El seed de `2026-08-22_patrimonio.sql` lleva `ON CONFLICT (id) DO NOTHING`, así que corregir
-- allí NO toca las filas ya insertadas: hace falta este UPDATE explícito.
--
-- Qué falla y por qué importa: sólo House Sevillana tenía CP. Los dos pisos de Bustos Tavera y el
-- Dúplex decían «…, Sevilla» a secas. Una dirección sin CP no es un dato incompleto inofensivo:
-- es la que se copia a un contrato, a un parte de viajeros o a un schema.org, y en Sevilla la
-- misma calle puede repartirse entre distritos. Los cuatro pisos turísticos son **41003**
-- (confirmado por Alberto el 26/08/2026; el del Dúplex sale además de su nota simple —
-- «PJ Villasís 1 Es:2 Pl:01 Pt:C, 41003 Sevilla», `docs/FISCAL-venta-duplex-villasis.md`).
--
-- Del Dúplex se fija de paso la puerta exacta: Alberto lo llama indistintamente «Villasís» y
-- «Francisco Molina» porque el piso tiene DOS accesos, y hasta ahora la dirección guardada
-- yuxtaponía los dos portales sin decir cuál era el registral. El registral es Villasís 1.
--
-- Monte Carmelo 68 (vivienda habitual) se deja como está: no consta su CP en ninguna fuente del
-- repo y no se inventa.

UPDATE patrimonio_activos SET direccion = 'Calle Bustos Tavera 22, bajo derecha, 41003 Sevilla'
 WHERE id = 'act_luxury_busto';

UPDATE patrimonio_activos SET direccion = 'Calle Bustos Tavera 22, bajo izquierda, 41003 Sevilla'
 WHERE id = 'act_busto_reform';

UPDATE patrimonio_activos
   SET direccion = 'Pasaje Villasís 1, Es:2 Pl:01 Pt:C, 41003 Sevilla (acceso alternativo por Pasaje Francisco Molina 4)'
 WHERE id = 'act_duplex_center';
