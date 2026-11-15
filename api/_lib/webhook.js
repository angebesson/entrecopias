import { verificarFirma } from './firma.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/webhook  (aviso de Mercado Pago)
 * 1) verifica la firma, 2) le pregunta a Mercado Pago el estado REAL del pago (no confia en el aviso),
 * 3) comprueba monto y moneda contra el pedido, 4) actualiza el pedido. Nunca baja un pedido "pagado".
 */
export function webhookHandler({ db, obtenerPago, env }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Metodo no permitido' });
    }

    const query = req.query ?? {};
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const dataId = query['data.id'] ?? body?.data?.id;
    const tipo = query.type ?? query.topic ?? body.type ?? body.topic;

    const valida = verificarFirma({
      firma: req.headers['x-signature'],
      requestId: req.headers['x-request-id'],
      dataId: dataId == null ? null : String(dataId),
      secreto: env.MP_WEBHOOK_SECRET,
    });
    if (!valida) return res.status(401).json({ error: 'Firma invalida' });
    if (tipo !== 'payment') return res.status(200).json({ ignorado: true });

    let pago;
    try {
      pago = await obtenerPago({ token: env.MP_ACCESS_TOKEN, id: dataId });
    } catch (e) {
      console.error(e.message);
      return res.status(502).json({ error: 'No se pudo consultar el pago' }); // MP reintenta
    }

    const ref = pago.external_reference;
    if (!ref || !UUID.test(ref)) return res.status(200).json({ ignorado: true });

    const supabase = db();
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('id,total,estado')
      .eq('id', ref)
      .maybeSingle();
    if (error) {
      console.error(error.message);
      return res.status(500).json({ error: 'Error de base de datos' });
    }
    if (!pedido) return res.status(200).json({ ignorado: true });

    const cambios = { mp_payment_id: String(pago.id), mp_status: pago.status };
    if (pedido.estado !== 'pagado') {
      if (pago.status === 'approved') {
        if (pago.currency_id !== 'ARS' || Number(pago.transaction_amount) !== pedido.total) {
          console.error(`Monto o moneda no coinciden en pedido ${pedido.id}`);
          return res.status(200).json({ ignorado: true, motivo: 'monto' });
        }
        cambios.estado = 'pagado';
        cambios.paid_at = new Date().toISOString();
      } else if (pago.status === 'rejected' || pago.status === 'cancelled') {
        cambios.estado = 'rechazado';
      }
    }

    const { error: errUpd } = await supabase.from('pedidos').update(cambios).eq('id', pedido.id);
    if (errUpd) {
      console.error(errUpd.message);
      return res.status(500).json({ error: 'Error de base de datos' });
    }
    return res.status(200).json({ pedidoId: pedido.id, estado: cambios.estado ?? pedido.estado });
  };
}
