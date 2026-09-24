# Cómo activar el pago con Mercado Pago en Netlify

## 1. Archivos que se agregaron
- `netlify/functions/crear-pago.js` → crea el pago cuando el cliente toca "Pagar con Mercado Pago".
- `netlify/functions/estado-pago.js` → confirma si el pago se acreditó cuando el cliente vuelve.
- `netlify/functions/catalogo.json` → copia de tus productos/precios/zonas, generada automáticamente (ver punto 4).
- `netlify.toml` → hace que `/api/crear-pago` y `/api/estado-pago` (los nombres que usa `index.html`) apunten a esas funciones.
- `package.json` → declara la librería oficial de Mercado Pago (`mercadopago`), Netlify la instala solo al desplegar.

## 1.1 Si ves un error 502 o "MissingBlobsEnvironmentError"

Ya está resuelto en esta versión — no hace falta que hagas nada, solo subir estos archivos. (Si te interesa el detalle: Netlify necesita una línea extra, `connectLambda`, para que las funciones puedan usar el almacenamiento de pedidos/stock en este formato de función. Ya está agregada en todas las que la necesitan.)

## 2. Subir el sitio
Subí **toda la carpeta** (no solo el `index.html`) a tu repositorio o directamente arrastrándola en Netlify. Netlify detecta `netlify.toml` y `package.json` automáticamente e instala lo necesario.

## 3. Cargar tu Access Token (¡nunca lo pongas en el HTML!)
En Netlify: **Site settings → Environment variables** → agregá:

| Variable | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | tu Access Token de Mercado Pago (el de producción, empieza con `APP_USR-...`) |

Guardá y volvé a desplegar el sitio (Netlify: **Deploys → Trigger deploy**) para que tome la variable nueva.

## 4. Si cambiás precios, productos o zonas de envío
Los productos y precios que usa Mercado Pago viven en `netlify/functions/catalogo.json`, generado a partir del `CONFIG` de tu `index.html`. Cada vez que edites precios/productos/zonas en el `index.html`, corré (con Node instalado):

```
node scripts_generar_catalogo.js
```

Esto regenera `catalogo.json`. Después subís los cambios de nuevo a Netlify. (Si no volvés a correr este script, Mercado Pago seguirá cobrando los precios viejos — el HTML y el servidor no comparten el archivo automáticamente, por seguridad.)

## 5. Probar antes de cobrar de verdad
Mercado Pago tiene credenciales de **prueba** separadas de las de producción, con tarjetas de test para simular pagos aprobados/rechazados sin mover dinero real. Te recomiendo:
1. Crear una aplicación de prueba en tu panel de Mercado Pago Developers.
2. Poner ese Access Token de **test** en `MP_ACCESS_TOKEN` primero.
3. Hacer un pedido de prueba de punta a punta.
4. Recién ahí cambiar `MP_ACCESS_TOKEN` por el de producción.

## 6. Pedidos de WhatsApp (efectivo) también quedan guardados

Antes de abrir WhatsApp, el sitio guarda el pedido en el mismo lugar que los de Mercado Pago (con estado "Confirmado por WhatsApp"), y agrega el número de pedido al mensaje de WhatsApp. Así podés buscar **cualquier** pedido — pagado online o en efectivo — desde `pedidos.html`, todos con el mismo código.

## 7. Cómo ver la dirección de un pedido pagado

Cuando alguien paga con Mercado Pago, la dirección **no queda en Mercado Pago** (ahí solo se ve el nombre y los productos). Por eso cada pedido se guarda automáticamente en el sitio con nombre, teléfono y dirección, apenas el cliente arranca el pago.

Para verla: entrá a `tudominio.netlify.app/pedidos.html`, pegá el código de referencia que te aparece en Mercado Pago (el que empieza con `BA-`, en el detalle del pago dice "Referencia adicional") y tocá **Buscar**.

**Recomendado:** para que no cualquiera que adivine un código vea direcciones ajenas, agregá en Netlify una variable de entorno más:

| Variable | Valor |
|---|---|
| `PEDIDOS_CLAVE` | una clave que inventes vos, por ejemplo `botines2026` |

Después, en `pedidos.html` vas a tener que escribir esa misma clave junto con el código para poder buscar. Si no la configurás, la búsqueda queda abierta a quien tenga el código (que igual es bastante largo y difícil de adivinar).

## 8. Stock automático desde tu proveedor

La tienda consulta sola, cada 1 hora, el stock real de tu proveedor (nnbotines-backend) y actualiza los talles disponibles de cada color — no hace falta que vos ni nadie toque nada a mano.

**Cómo funciona:** el proveedor no comparte ningún código con tus productos, pero usa las mismas fotos. El sistema empareja cada color tuyo con el producto del proveedor **por la foto**, y de ahí saca qué talles tienen stock (número mayor a 0) y cuáles no.

**Qué pasa si agregás un producto o color nuevo:** mientras la foto que uses sea la misma que tiene el proveedor (la bajaste de ahí), se va a emparejar solo. Si usás una foto propia que el proveedor no tiene, ese color se queda con el stock que vos le hayas cargado a mano en el `index.html` (no se rompe nada, simplemente no se actualiza solo).

**Si querés desactivar esto** (por ejemplo, para cargar el stock siempre vos a mano): en `index.html`, dentro de `CONFIG`, poné `sincronizarStock: false`.

**No hace falta esperar 1 hora para la primera vez:** apenas subís el sitio, la primera visita ya dispara una consulta al proveedor si todavía no hay nada guardado.

**Productos nuevos, 100% automático:** cuando el proveedor sube un producto que todavía no tenés (ninguna foto tuya coincide con las suyas), se agrega solo a tu tienda con esta regla:
- **Precio:** el costo del proveedor + 20%, redondeado al millar más cercano.
- **Categoría:** la adivina por el nombre — si dice "Sintético" usa esa categoría, si dice "Gato"/"Sala"/"Futsal"/"Papi" usa "Papi / Futsal", si no usa "Campo (FG)" por defecto.
- Se marca automáticamente como **"Nuevo"** en la tienda (es verdad, ¡lo es!).

Esto es una regla automática, no un criterio humano — de vez en cuando convendría que te fijes en la web si algún producto nuevo quedó mal categorizado o si el margen del 20% no te cierra para ese modelo puntual, y ajustarlo a mano en `index.html` (a partir de ahí ya queda como tuyo, con esa foto, y no se vuelve a tocar solo).

Para cambiar el margen (20%) o el redondeo, o para desactivar la publicación automática y dejar solo el stock, avisame y te lo ajusto.

## 9. Qué pasa con WhatsApp
No se rompió nada: el botón de WhatsApp sigue funcionando igual que antes. Ahora el cliente elige entre pagar online (Mercado Pago) o coordinar en efectivo (WhatsApp). Si en algún momento querés cobrar **solo** por Mercado Pago, en `index.html` buscá `pagoWhatsApp: true` dentro de `CONFIG` y ponelo en `false`.
