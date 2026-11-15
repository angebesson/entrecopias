import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRECIOS, calcularItem, armarPedido, PedidoInvalido } from '../api/_lib/precios.js';

const cliente = { nombre: 'Ana', apellido: 'Perez', celular: '3454000000', email: 'ana@correo.com' };
const impresion = { tipo: 'impresiones', tamano: 'a4', calidad: 'byn', faz: 'simple', papel: 'comun', terminado: 'ninguna', copias: 1 };

test('los precios del servidor coinciden con los de index.html', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const grupo of Object.keys(PRECIOS)) {
    const select = html.match(new RegExp(`<select id="${grupo}"[\\s\\S]*?</select>`));
    assert.ok(select, `no encontre el select ${grupo}`);
    const opciones = [...select[0].matchAll(/<option value="([^"]+)" data-price="(\d+)"/g)];
    const delHtml = Object.fromEntries(opciones.map(([, v, p]) => [v, Number(p)]));
    assert.deepEqual(delHtml, PRECIOS[grupo], `difieren los precios de ${grupo}`);
  }
});

test('impresion: A4 byn simple comun x1 = 30', () => {
  assert.equal(calcularItem(impresion).subtotal, 30);
});

test('impresion: la terminacion es monto fijo, no por copia', () => {
  const r = calcularItem({ ...impresion, calidad: 'color', faz: 'doble', terminado: 'anillado', copias: 10 });
  assert.equal(r.subtotal, (30 + 40 + 10) * 10 + 800);
});

test('foto: 13x18 mate x4 = (220+20)*4', () => {
  const r = calcularItem({ tipo: 'fotografia', tamanoFoto: '13x18', acabadoFoto: 'mate', copias: 4 });
  assert.equal(r.subtotal, 960);
});

test('ignora un precio enviado por el cliente', () => {
  const r = calcularItem({ ...impresion, subtotal: 1, precio: 1, unitPrice: 1 });
  assert.equal(r.subtotal, 30);
});

test('rechaza opciones inventadas, copias raras y claves del prototipo', () => {
  for (const malo of [
    { ...impresion, tamano: 'a0' },
    { ...impresion, tamano: '__proto__' },
    { ...impresion, tamano: 'constructor' },
    { ...impresion, copias: 0 },
    { ...impresion, copias: -3 },
    { ...impresion, copias: 1.5 },
    { ...impresion, copias: 1001 },
    { ...impresion, copias: 'abc' },
    { tipo: 'otro' },
    null,
  ]) {
    assert.throws(() => calcularItem(malo), PedidoInvalido);
  }
});

test('armarPedido suma el total y valida el cliente', () => {
  const p = armarPedido({ cliente, items: [impresion, { tipo: 'fotografia', tamanoFoto: '10x15', acabadoFoto: 'brillante', copias: 2 }] });
  assert.equal(p.total, 30 + 300);
  assert.throws(() => armarPedido({ cliente: { ...cliente, email: 'nada' }, items: [impresion] }), PedidoInvalido);
  assert.throws(() => armarPedido({ cliente: { ...cliente, nombre: '' }, items: [impresion] }), PedidoInvalido);
  assert.throws(() => armarPedido({ cliente, items: [] }), PedidoInvalido);
});
