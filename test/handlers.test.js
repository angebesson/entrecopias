import test from 'node:test';
import assert from 'node:assert/strict';
import { crearPedidoHandler } from '../api/_lib/crear-pedido.js';
import { webhookHandler } from '../api/_lib/webhook.js';
import { firmar } from '../api/_lib/firma.js';

const ID = '11111111-2222-3333-4444-555555555555';
const SECRETO = 'whsec';
const env = { SITE_URL: 'https://copia.example/', MP_ACCESS_TOKEN: 'TEST-x', MP_WEBHOOK_SECRET: SECRETO };

// --- doubles ---
function fakeDb(inicial = {}) {
  const filas = new Map(Object.entries(inicial));
  let seq = 0;
  return {
    filas,
    from() {
      return {
        insert(fila) {
          const id = seq === 0 ? ID : `99999999-2222-3333-4444-${String(seq).padStart(12, '0')}`;
          seq++;
          filas.set(id, { id, estado: 'pendiente_pago', ...fila });
          return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        },
        select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: filas.get(id) ?? null, error: null }) }) }),
        update: (cambios) => ({
          eq: async (_c, id) => {
            Object.assign(filas.get(id), cambios);
            return { error: null };
          },
        }),
      };
    },
  };
}
function res() {
  const r = { code: 200, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const cliente = { nombre: 'Ana', apellido: 'Perez', celular: '3454000000', email: 'ana@correo.com' };
const RUTA = 'pendientes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/tp.pdf';
const item = { archivoPath: RUTA, tipo: 'impresiones', tamano: 'a4', calidad: 'color', faz: 'simple', papel: 'comun', terminado: 'anillado', copias: 2 };

// --- crear pedido ---
test('crear-pedido: recalcula el total, guarda y devuelve la URL de pago', async () => {
  const db = fakeDb();
  let recibido;
  const h = crearPedidoHandler({
    db: () => db,
    env,
    archivoExiste: async () => true,
    crearPreferencia: async (p) => ((recibido = p), { init_point: 'https://mp.test/checkout' }),
  });
  // el cliente intenta colar un total falso
  const r = res();
  await h({ method: 'POST', body: { cliente, items: [{ ...item, subtotal: 1 }], total: 1 } }, r);
  assert.equal(r.code, 200);
  assert.equal(r.body.url, 'https://mp.test/checkout');
  assert.equal(db.filas.get(ID).total, (30 + 40) * 2 + 800);
  assert.equal(recibido.items[0].subtotal, 940);
  assert.equal(recibido.siteUrl, 'https://copia.example'); // sin barra final
});

test('crear-pedido: 400 con datos invalidos y 405 con GET', async () => {
  const h = crearPedidoHandler({ db: () => fakeDb(), env, crearPreferencia: async () => ({}) });
  const r1 = res();
  await h({ method: 'POST', body: { cliente, items: [{ ...item, tamano: 'zzz' }] } }, r1);
  assert.equal(r1.code, 400);
  const r2 = res();
  await h({ method: 'GET' }, r2);
  assert.equal(r2.code, 405);
});

test('crear-pedido: si Mercado Pago falla, el pedido queda cancelado y responde 502', async () => {
  const db = fakeDb();
  const h = crearPedidoHandler({
    db: () => db,
    env,
    archivoExiste: async () => true,
    crearPreferencia: async () => {
      throw new Error('boom');
    },
  });
  const r = res();
  await h({ method: 'POST', body: { cliente, items: [item] } }, r);
  assert.equal(r.code, 502);
  assert.equal(db.filas.get(ID).estado, 'cancelado');
});

// --- webhook ---
function aviso({ dataId = '777', firmaValida = true } = {}) {
  const ts = String(Date.now());
  const v1 = firmar({ requestId: 'r1', dataId, ts, secreto: firmaValida ? SECRETO : 'otro' });
  return {
    method: 'POST',
    query: { 'data.id': dataId, type: 'payment' },
    body: {},
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'r1' },
  };
}
const pagoOk = (extra = {}) => ({ id: 777, status: 'approved', external_reference: ID, currency_id: 'ARS', transaction_amount: 940, ...extra });
const pedidoPendiente = () => ({ [ID]: { id: ID, total: 940, estado: 'pendiente_pago' } });

test('webhook: pago aprobado con monto correcto marca el pedido como pagado', async () => {
  const db = fakeDb(pedidoPendiente());
  const h = webhookHandler({ db: () => db, env, obtenerPago: async () => pagoOk() });
  const r = res();
  await h(aviso(), r);
  assert.equal(r.code, 200);
  assert.equal(db.filas.get(ID).estado, 'pagado');
  assert.equal(db.filas.get(ID).mp_payment_id, '777');
  assert.ok(db.filas.get(ID).paid_at);
});

test('webhook: firma invalida -> 401 y no toca nada ni consulta a MP', async () => {
  const db = fakeDb(pedidoPendiente());
  let consultas = 0;
  const h = webhookHandler({ db: () => db, env, obtenerPago: async () => (consultas++, pagoOk()) });
  const r = res();
  await h(aviso({ firmaValida: false }), r);
  assert.equal(r.code, 401);
  assert.equal(consultas, 0);
  assert.equal(db.filas.get(ID).estado, 'pendiente_pago');
});

test('webhook: monto o moneda distintos NO marcan como pagado', async () => {
  for (const extra of [{ transaction_amount: 100 }, { currency_id: 'BRL' }]) {
    const db = fakeDb(pedidoPendiente());
    const h = webhookHandler({ db: () => db, env, obtenerPago: async () => pagoOk(extra) });
    const r = res();
    await h(aviso(), r);
    assert.equal(db.filas.get(ID).estado, 'pendiente_pago');
  }
});

test('webhook: un rechazo posterior no baja un pedido ya pagado (idempotente)', async () => {
  const db = fakeDb({ [ID]: { id: ID, total: 940, estado: 'pagado' } });
  const h = webhookHandler({ db: () => db, env, obtenerPago: async () => pagoOk({ status: 'rejected' }) });
  const r = res();
  await h(aviso(), r);
  assert.equal(db.filas.get(ID).estado, 'pagado');
});

test('webhook: pago rechazado marca el pedido como rechazado; otros tipos y refs raras se ignoran', async () => {
  const db = fakeDb(pedidoPendiente());
  const h = webhookHandler({ db: () => db, env, obtenerPago: async () => pagoOk({ status: 'rejected' }) });
  await h(aviso(), res());
  assert.equal(db.filas.get(ID).estado, 'rechazado');

  const r2 = res();
  const otro = aviso();
  otro.query.type = 'merchant_order';
  await h(otro, r2);
  assert.equal(r2.body.ignorado, true);

  const r3 = res();
  const h3 = webhookHandler({ db: () => fakeDb(), env, obtenerPago: async () => pagoOk({ external_reference: "x' or 1=1" }) });
  await h3(aviso(), r3);
  assert.equal(r3.body.ignorado, true);
});

test('webhook: si MP no responde -> 502 (para que reintente)', async () => {
  const h = webhookHandler({
    db: () => fakeDb(),
    env,
    obtenerPago: async () => {
      throw new Error('caido');
    },
  });
  const r = res();
  await h(aviso(), r);
  assert.equal(r.code, 502);
});

test('crear-pedido: si el archivo no existe en el bucket, 400 y no se crea el pedido ni el pago', async () => {
  const db = fakeDb();
  let pagos = 0;
  const h = crearPedidoHandler({
    db: () => db,
    env,
    archivoExiste: async () => false,
    crearPreferencia: async () => (pagos++, { init_point: 'x' }),
  });
  const r = res();
  await h({ method: 'POST', body: { cliente, items: [item] } }, r);
  assert.equal(r.code, 400);
  assert.equal(pagos, 0);
  assert.equal(db.filas.size, 0);
});
