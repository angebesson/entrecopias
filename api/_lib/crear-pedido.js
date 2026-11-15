import { armarPedido, PedidoInvalido } from './precios.js';

/**
 * POST /api/crear-pedido
 * Recibe { cliente, items:[solo opciones] }. Recalcula el total en el servidor, guarda el pedido
 * y crea la preferencia de pago de Mercado Pago. Devuelve { url } para redirigir al checkout.
 * Las dependencias se inyectan para poder probarlo sin red.
 */
export function crearPedidoHandler({ db, crearPreferencia, env }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Metodo no permitido' });
    }

    let pedido;
    try {
      pedido = armarPedido(req.body);
    } catch (e) {
      if (e instanceof PedidoInvalido) return res.status(400).json({ error: e.message });
      throw e;
    }

    const siteUrl = (env.SITE_URL ?? '').trim().replace(/\/$/, '');
    if (!siteUrl || !env.MP_ACCESS_TOKEN) {
      console.error('Faltan SITE_URL o MP_ACCESS_TOKEN');
      return res.status(500).json({ error: 'El pago no esta configurado todavia.' });
    }

    const supabase = db();
    const { data, error } = await supabase
      .from('pedidos')
      .insert({ cliente: pedido.cliente, items: pedido.items, total: pedido.total })
      .select('id')
      .single();
    if (error) {
      console.error('No se pudo guardar el pedido:', error.message);
      return res.status(500).json({ error: 'No se pudo guardar el pedido. Proba de nuevo.' });
    }

    try {
      const pref = await crearPreferencia({
        token: env.MP_ACCESS_TOKEN,
        pedidoId: data.id,
        items: pedido.items,
        siteUrl,
        email: pedido.cliente.email,
      });
      return res.status(200).json({ url: pref.init_point, pedidoId: data.id });
    } catch (e) {
      console.error(e.message);
      await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', data.id);
      return res.status(502).json({ error: 'No se pudo iniciar el pago. Proba de nuevo.' });
    }
  };
}
