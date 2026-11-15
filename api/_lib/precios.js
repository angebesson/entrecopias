// Lista de precios OFICIAL. El servidor recalcula siempre el total desde aca:
// nunca se confia en el precio que manda la pagina (se puede manipular).
// Si cambias un precio, cambialo tambien en index.html (data-price): el test lo verifica.

export const PRECIOS = {
  tamano: { a4: 30, a3: 55, oficio: 35 },
  calidad: { byn: 0, color: 40 },
  faz: { simple: 0, doble: 10 },
  papel: { comun: 0, obra: 15, fotografico: 90 },
  terminado: { ninguna: 0, anillado: 800, plastificado: 600 }, // monto fijo, no por copia
  tamanoFoto: { '10x15': 150, '13x18': 220, '20x30': 480 },
  acabadoFoto: { brillante: 0, mate: 20 },
};

const NOMBRES = {
  tamano: { a4: 'A4', a3: 'A3', oficio: 'Oficio' },
  calidad: { byn: 'Blanco y negro', color: 'Color' },
  tamanoFoto: { '10x15': '10x15 cm', '13x18': '13x18 cm', '20x30': '20x30 cm' },
};

export const MAX_COPIAS = 1000;

export class PedidoInvalido extends Error {}

function opcion(grupo, valor) {
  if (typeof valor !== 'string' || !Object.hasOwn(PRECIOS[grupo], valor)) {
    throw new PedidoInvalido(`Opcion invalida en ${grupo}`);
  }
  return PRECIOS[grupo][valor];
}

function copias(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COPIAS) {
    throw new PedidoInvalido(`Las copias deben ser un numero entero entre 1 y ${MAX_COPIAS}`);
  }
  return n;
}

/** Recibe la configuracion de un item (solo opciones, sin precios) y devuelve { label, subtotal }. */
export function calcularItem(item) {
  if (!item || typeof item !== 'object') throw new PedidoInvalido('Item invalido');
  const archivo = typeof item.archivo === 'string' ? item.archivo.slice(0, 120) : '';
  const sufijo = archivo ? ` · ${archivo}` : '';

  if (item.tipo === 'impresiones') {
    const n = copias(item.copias);
    const base =
      opcion('tamano', item.tamano) +
      opcion('calidad', item.calidad) +
      opcion('faz', item.faz) +
      opcion('papel', item.papel);
    const fijo = opcion('terminado', item.terminado);
    return {
      label: `${NOMBRES.tamano[item.tamano]} · ${NOMBRES.calidad[item.calidad]} · x${n}${sufijo}`,
      subtotal: base * n + fijo,
    };
  }

  if (item.tipo === 'fotografia') {
    const n = copias(item.copias);
    const base = opcion('tamanoFoto', item.tamanoFoto) + opcion('acabadoFoto', item.acabadoFoto);
    return {
      label: `Foto ${NOMBRES.tamanoFoto[item.tamanoFoto]} · x${n}${sufijo}`,
      subtotal: base * n,
    };
  }

  throw new PedidoInvalido('Tipo de trabajo invalido');
}

/** Valida cliente + items y devuelve { cliente, items:[{label,subtotal,config}], total }. */
export function armarPedido(body) {
  const c = body?.cliente ?? {};
  const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const cliente = {
    nombre: texto(c.nombre, 60),
    apellido: texto(c.apellido, 60),
    celular: texto(c.celular, 30),
    email: texto(c.email, 120),
  };
  if (!cliente.nombre || !cliente.apellido || !cliente.celular) {
    throw new PedidoInvalido('Faltan datos del cliente');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
    throw new PedidoInvalido('Email invalido');
  }

  if (!Array.isArray(body?.items) || body.items.length === 0 || body.items.length > 30) {
    throw new PedidoInvalido('El pedido debe tener entre 1 y 30 items');
  }
  const items = body.items.map((it) => ({ ...calcularItem(it), config: it }));
  const total = items.reduce((s, it) => s + it.subtotal, 0);
  return { cliente, items, total };
}
