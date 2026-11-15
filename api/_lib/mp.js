// Cliente minimo de Mercado Pago (solo servidor). Usa fetch directo a los endpoints oficiales.

const API = 'https://api.mercadopago.com';

async function mp(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Mercado Pago ${res.status} en ${path}: ${detalle.slice(0, 300)}`);
  }
  return res.json();
}

export function crearPreferencia({ token, pedidoId, items, siteUrl, email }) {
  const https = siteUrl.startsWith('https://');
  return mp('/checkout/preferences', {
    token,
    method: 'POST',
    body: {
      items: items.map((it, i) => ({
        id: `${pedidoId}-${i + 1}`,
        title: it.label.slice(0, 250),
        quantity: 1,
        unit_price: it.subtotal,
        currency_id: 'ARS',
      })),
      payer: { email },
      external_reference: pedidoId,
      notification_url: `${siteUrl}/api/webhook`,
      back_urls: {
        success: `${siteUrl}/?pago=ok&pedido=${pedidoId}`,
        pending: `${siteUrl}/?pago=pendiente&pedido=${pedidoId}`,
        failure: `${siteUrl}/?pago=error&pedido=${pedidoId}`,
      },
      ...(https ? { auto_return: 'approved' } : {}),
    },
  });
}

export function obtenerPago({ token, id }) {
  return mp(`/v1/payments/${encodeURIComponent(id)}`, { token });
}
