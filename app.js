// ===================================================================
// Copia Litoral — order calculator, ticket/cart, and checkout hook
// ===================================================================
// The page only SHOWS prices. The real total is recalculated on the server
// (api/_lib/precios.js) from the options sent in each cart item.

const state = {
  cart: [],      // { id, label, subtotal (display only), config (options sent to the server) }
  file: null,    // File object (name only is used; no real upload happens)
};

const money = (n) => `$${n.toLocaleString('es-AR')}`;

// ---------- Tabs (Impresiones / Fotografía) ----------
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');

function activateTab(tab) {
  tabs.forEach((t) => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
    t.tabIndex = -1;
  });
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  tab.tabIndex = 0;
  tab.focus();

  const target = tab.dataset.tab;
  panels.forEach((p) => {
    p.hidden = p.dataset.panel !== target;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));

  // Standard ARIA tabs keyboard pattern: Left/Right arrows move focus + selection
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const nextIndex = e.key === 'ArrowRight'
      ? (index + 1) % tabs.length
      : (index - 1 + tabs.length) % tabs.length;
    activateTab(tabs[nextIndex]);
  });
});

function activeTab() {
  return document.querySelector('.tab.active').dataset.tab;
}

// ---------- File upload (simulated — no real upload/storage) ----------
const fileInput = document.getElementById('archivo');
const fileNameEl = document.getElementById('fileName');

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  state.file = file || null;
  fileNameEl.textContent = file ? `Archivo listo: ${file.name}` : '';
});

// ---------- Price calculation ----------
function selectedOptionPrice(selectId) {
  const el = document.getElementById(selectId);
  const opt = el.options[el.selectedIndex];
  return Number(opt.dataset.price || 0);
}

function calculateCurrentConfig() {
  if (activeTab() === 'impresiones') {
    const base =
      selectedOptionPrice('tamano') +
      selectedOptionPrice('calidad') +
      selectedOptionPrice('faz') +
      selectedOptionPrice('papel');
    const terminado = selectedOptionPrice('terminado'); // flat fee, not per-copy
    const copias = Math.max(1, Number(document.getElementById('copias').value || 1));

    const label = buildImpresionesLabel(copias);
    const unitSubtotal = base * copias + terminado;
    const config = {
      tipo: 'impresiones',
      tamano: document.getElementById('tamano').value,
      calidad: document.getElementById('calidad').value,
      faz: document.getElementById('faz').value,
      papel: document.getElementById('papel').value,
      terminado: document.getElementById('terminado').value,
      copias,
    };
    return { label, config, subtotal: unitSubtotal };
  } else {
    const base = selectedOptionPrice('tamanoFoto') + selectedOptionPrice('acabadoFoto');
    const copias = Math.max(1, Number(document.getElementById('copiasFoto').value || 1));
    const label = buildFotoLabel(copias);
    const unitSubtotal = base * copias;
    const config = {
      tipo: 'fotografia',
      tamanoFoto: document.getElementById('tamanoFoto').value,
      acabadoFoto: document.getElementById('acabadoFoto').value,
      copias,
    };
    return { label, config, subtotal: unitSubtotal };
  }
}

function buildImpresionesLabel(copias) {
  const tamano = document.getElementById('tamano').selectedOptions[0].text;
  const calidad = document.getElementById('calidad').selectedOptions[0].text;
  return `${tamano} · ${calidad} · x${copias}`;
}

function buildFotoLabel(copias) {
  const tamano = document.getElementById('tamanoFoto').selectedOptions[0].text;
  return `Foto ${tamano} · x${copias}`;
}

// ---------- Ticket / cart rendering ----------
const ticketItemsEl = document.getElementById('ticketItems');
const ticketTotalEl = document.getElementById('ticketTotal');
const heroTickerTotalEl = document.getElementById('heroTickerTotal');
const payBtn = document.getElementById('payBtn');

function renderTicket() {
  if (state.cart.length === 0) {
    ticketItemsEl.innerHTML = `<p class="ticket-empty">Todavía no agregaste nada. Completá el formulario y sumalo acá.</p>`;
    payBtn.disabled = true;
  } else {
    ticketItemsEl.innerHTML = state.cart.map((item) => `
      <div class="ticket-item">
        <span>${item.label}</span>
        <span>${money(item.subtotal)}
          <button type="button" class="ticket-item-remove" data-id="${item.id}" aria-label="Quitar ${item.label} del ticket">quitar</button>
        </span>
      </div>
    `).join('');
    payBtn.disabled = false;
  }

  const total = state.cart.reduce((sum, item) => sum + item.subtotal, 0);
  ticketTotalEl.textContent = money(total);
  heroTickerTotalEl.textContent = money(total);

  document.querySelectorAll('.ticket-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cart = state.cart.filter((item) => item.id !== btn.dataset.id);
      renderTicket();
      showToast('Ítem eliminado del ticket');
    });
  });
}

// ---------- Add to cart ----------
const form = document.getElementById('orderForm');

form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const config = calculateCurrentConfig();
  state.cart.push({
    id: crypto.randomUUID(),
    label: config.label + (state.file ? ` · ${state.file.name}` : ''),
    subtotal: config.subtotal,
    // Only the file NAME travels for now: real file upload is the next stage.
    config: { ...config.config, archivo: state.file ? state.file.name : '' },
  });

  renderTicket();
  showToast('Agregado al ticket ✓');
});

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message, ms = 2200) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ===================================================================
// Mercado Pago (Checkout Pro)
// The page sends customer data + cart OPTIONS to /api/crear-pedido. The
// server recalculates the total, saves the order and creates the payment
// preference with the secret token. We only receive the checkout URL.
// Payment confirmation arrives at /api/webhook (server to server).
// ===================================================================

payBtn.addEventListener('click', () => {
  if (state.cart.length === 0) return;
  startMercadoPagoCheckout();
});

function resetPayBtn() {
  payBtn.textContent = 'Pagar con Mercado Pago';
  payBtn.disabled = state.cart.length === 0;
}

async function startMercadoPagoCheckout() {
  const fields = ['nombre', 'apellido', 'celular', 'email'];
  const cliente = Object.fromEntries(fields.map((f) => [f, document.getElementById(f).value.trim()]));
  const missing = fields.find((f) => !cliente[f]);
  if (missing) {
    document.getElementById(missing).focus();
    showToast('Completá tus datos antes de pagar');
    return;
  }

  payBtn.disabled = true;
  payBtn.textContent = 'Preparando el pago…';

  try {
    const res = await fetch('/api/crear-pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente, items: state.cart.map((item) => item.config) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      showToast(data.error || 'No se pudo iniciar el pago. Probá de nuevo.');
      resetPayBtn();
      return;
    }
    payBtn.textContent = 'Redirigiendo a Mercado Pago…';
    window.location.assign(data.url);
  } catch (error) {
    console.error('Error al iniciar el pago:', error);
    showToast('No hay conexión con el servidor. Probá de nuevo.');
    resetPayBtn();
  }
}

// ---------- Return from Mercado Pago (?pago=ok|pendiente|error) ----------
// This only informs the customer. The order is marked as paid by the webhook,
// never by this URL (anyone could type ?pago=ok).
function showPaymentResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('pago');
  if (!result) return;
  const messages = {
    ok: 'Recibimos tu pago. Te avisamos por mail cuando esté listo.',
    pendiente: 'Tu pago está pendiente. Te avisamos cuando se acredite.',
    error: 'El pago no se completó. Podés intentarlo de nuevo.',
  };
  if (messages[result]) showToast(messages[result], 7000);
  history.replaceState(null, '', window.location.pathname);
}

// ---------- Init ----------
renderTicket();
showPaymentResult();
