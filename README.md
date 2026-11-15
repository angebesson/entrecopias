# Copia Litoral (proyecto de práctica)

Pedido de impresiones con pago por Mercado Pago (Checkout Pro). Es un proyecto de práctica, no un comercio real.

## Cómo funciona
1. La página (`index.html` + `app.js`) arma el pedido y manda al servidor **solo las opciones** (tamaño, copias, etc.), nunca el precio.
2. `api/crear-pedido.js` recalcula el total con `api/_lib/precios.js`, guarda el pedido en Supabase (`pedidos`) y crea la preferencia de pago en Mercado Pago. Devuelve la URL del checkout.
3. Mercado Pago avisa a `api/webhook.js`. El servidor **verifica la firma**, le pregunta a Mercado Pago el estado real del pago, comprueba monto y moneda contra el pedido y recién ahí lo marca `pagado`.
4. La URL de vuelta (`?pago=ok`) solo muestra un mensaje; no marca nada como pagado.

## Subida de archivos
1. La página le pide a `api/subir-archivo.js` una **URL firmada** (manda solo nombre, tipo y tamaño, no el archivo). El servidor valida formato (.pdf .doc .docx .jpg .png), tipo y tamaño (hasta 20 MB) y devuelve una ruta `pendientes/<uuid>/<nombre-seguro>`.
2. El navegador sube el archivo **directo a Supabase Storage** (bucket privado `archivos`) con esa URL. No pasa por Vercel (límite de 4,5 MB) y la clave secreta no sale del servidor.
3. Al crear el pedido, el servidor comprueba que la ruta tenga la forma exacta y que el archivo **exista** en el bucket antes de cobrar.
Correr `supabase/storage.sql` una vez para crear el bucket (privado, 20 MB, solo esos tipos).
Límite conocido: cualquiera puede pedir URLs de subida, así que hay topes de formato y tamaño, pero no limitación por cantidad; los archivos de pedidos no pagados quedan en `pendientes/` hasta limpiarlos.

## Pendiente (próximas etapas)
- Vista de pedidos para el local (con descarga del archivo).
- Migrar de la API de Preferences (se descontinúa) a Orders.
- Limpiar archivos de pedidos no pagados.
- Mail al cliente cuando el pedido esté listo (el texto de la página lo promete).

## Probar
```
npm install
npm test
```
Los tests no usan red ni claves: precios, firma del webhook y los dos endpoints con base de datos y Mercado Pago simulados.

## Poner en marcha (modo PRUEBA, sin dinero real)
1. Supabase: crear proyecto, correr `supabase/schema.sql` en el SQL Editor.
2. Mercado Pago Developers: crear una aplicación, usar credenciales de **prueba** (el access token empieza con `TEST-`) y usuarios de prueba (vendedor y comprador).
3. Vercel: importar el repositorio y cargar las variables de `.env.example`.
4. En Mercado Pago > Webhooks: URL `https://TU-SITIO/api/webhook`, evento "Pagos"; copiar la clave secreta a `MP_WEBHOOK_SECRET`.
5. Pagar con una tarjeta de prueba y comprobar en Supabase que el pedido pasa a `pagado`.

Las claves secretas viven solo en las variables de entorno de Vercel. Nunca en el código ni en GitHub.

## Notas
- Antes usaba Firebase (pedía tarjeta para Cloud Functions/Storage). Se reemplazó por Supabase + Vercel, sin tarjeta.
- Los precios están en `api/_lib/precios.js` y en `index.html` (`data-price`); un test verifica que coincidan.
- La clave web de Firebase quedó en el historial de git. Es una clave pública por diseño, pero si no vas a usar ese proyecto, conviene borrarlo desde la consola de Firebase.
