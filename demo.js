'use strict';

const demoEmail = demoCustomerEmail;
const demoPhone = '1234';
const publicPosts = {
  mackerel: { title: '鯖魚便當', category: '料理心得', body: '今天想用鯖魚片做便當。' },
  shrimp: { title: '白蝦怎麼煮？', category: '選購提問', body: '白蝦適合用清蒸的方式嗎？' },
};
let cartUnlocked = false;
let renderedProducts = '';
let renderedVideos = '';

function announce(message) {
  $(cartUnlocked ? 'cart-status' : 'announcement').textContent = message;
}

function changeQuantity(product, difference, animate = false) {
  if (!Number.isInteger(difference) || difference === 0) return;
  if (difference > quantityLimit[product.type]) return;
  if (difference > 0 && product.status !== 'active') return;
  const quantity = (cart.get(product.id) ?? 0) + difference;
  if (quantity < 0 || quantity > demoStock(product)) return;
  if (quantity === 0) cart.delete(product.id);
  else cart.set(product.id, quantity);
  saveDemoState();
  renderCart();
  if (product.type === 'fresh' && animate) {
    const stock = $(`stock-${product.id}`);
    if (stock) playStockEffect(stock);
    announce(`${product.name}已搶拍 ${difference} 份，剩餘 ${demoStock(product) - quantity} 份。`);
    return;
  }
  announce(`${product.name}在購物車中的數量為 ${quantity}。`);
}

function cartAmounts() {
  let fresh = 0;
  let frozen = 0;
  for (const product of products) {
    const amount = product.price * (cart.get(product.id) ?? 0);
    if (product.type === 'fresh') fresh += amount;
    else frozen += amount;
  }
  const subtotal = fresh + frozen;
  const accumulated = Math.max(cycleSubtotal, DemoRules.cycle(scenario).startingSpend) + subtotal;
  const shipping = cart.size ? DemoRules.freight(accumulated) : 0;
  return { fresh, frozen, subtotal, accumulated, shipping, total: subtotal + shipping };
}

function renderCart() {
  const activeButton = document.activeElement?.id;
  renderProductCards();
  $('cart-items').replaceChildren();
  let count = 0;
  for (const product of products) {
    const quantity = cart.get(product.id) ?? 0;
    count += quantity;
    const available = Math.max(0, demoStock(product) - quantity);
    const options = Math.min(available, quantityLimit[product.type]);
    const picker = $(`quantity-${product.id}`);
    if (picker) {
      if (picker.options.length !== options) {
        const previous = Number(picker.value);
        picker.replaceChildren();
        for (let count = 1; count <= options; count += 1) picker.add(new Option(count, count));
        if (options) picker.value = String(Math.max(1, Math.min(previous, options)));
      }
      picker.disabled = available <= 0;
      const add = $(`add-${product.id}`);
      add.disabled = available <= 0;
      add.textContent = available <= 0 ? '售罄' : product.type === 'fresh' ? '立即搶拍' : '加入購物車';
      $(`stock-${product.id}`).textContent = available;
    }
    if (!quantity) continue;
    const line = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${product.type === 'fresh' ? '現流搶拍' : '冷凍常備'}｜${product.name} × ${quantity}`;
    if (product.status !== 'active') name.append('（已下架）');
    const remove = document.createElement('button');
    remove.id = `remove-${product.id}`;
    remove.type = 'button';
    remove.className = 'secondary';
    remove.textContent = '−';
    remove.setAttribute('aria-label', `減少一份${product.name}`);
    remove.addEventListener('click', () => changeQuantity(product, -1));
    const increase = document.createElement('button');
    increase.id = `increase-${product.id}`;
    increase.type = 'button';
    increase.className = 'secondary';
    increase.textContent = '+';
    increase.disabled = available <= 0 || product.status !== 'active';
    increase.setAttribute('aria-label', `增加一份${product.name}`);
    increase.addEventListener('click', () => changeQuantity(product, 1));
    const actions = document.createElement('div');
    actions.className = 'cart-line-actions';
    actions.append(remove, increase);
    line.append(name, actions);
    $('cart-items').append(line);
  }
  if (/^(remove|increase)-/.test(activeButton ?? '')) {
    const previous = $(activeButton);
    const matchingDecrease = $(activeButton.replace(/^increase-/, 'remove-'));
    const next = previous && !previous.disabled ? previous : matchingDecrease;
    (next ?? $('cart-items').querySelector('button') ?? $('cart-empty')).focus();
  }
  const amounts = cartAmounts();
  $('fresh-total').textContent = money.format(amounts.fresh);
  $('frozen-total').textContent = money.format(amounts.frozen);
  $('cycle-total').textContent = money.format(amounts.accumulated);
  $('shipping').textContent = money.format(amounts.shipping);
  $('total').textContent = money.format(amounts.total);
  $('cart-empty').hidden = count > 0;
  $('nav-count').textContent = count;
  const unavailable = cartHasUnavailableItems();
  $('cart-unavailable').hidden = !unavailable;
  $('cart-settlement').hidden = DemoRules.cycle(scenario).orderOpen;
  $('place-order').disabled = !DemoRules.cycle(scenario).orderOpen || !cartUnlocked || !cart.size || unavailable || Boolean(order && !order.paid);
}

function cartHasUnavailableItems() {
  return products.some(product => cart.has(product.id) &&
    (product.status !== 'active' || cart.get(product.id) > demoStock(product)));
}

function renderOrder() {
  $('order-panel').hidden = !order;
  if (!order) return;
  $('order-summary').textContent = `${order.id} · ${money.format(order.total)}`;
  const results = $('order-stock');
  results.replaceChildren();
  for (const item of order.items) {
    if (item.type !== 'fresh') continue;
    const line = document.createElement('li');
    const remaining = document.createElement('b');
    remaining.className = 'stock-number';
    remaining.textContent = item.remaining;
    line.append(`${item.name}搶拍成功 × ${item.quantity}，剩餘 `, remaining, ' 份');
    results.append(line);
  }
  results.hidden = !results.childElementCount;
  $('payment-status').textContent = `付款狀態：${demoOrderStatus(order)}`;
  $('open-report-link').hidden = !order.reportToken;
  if (order.reportToken) $('open-report-link').href = reportLink(order);
  $('send-email').disabled = !order.paid || order.emailRecorded;
  $('email-status').hidden = !order.emailRecorded;
}

function makeProductCard(product) {
  const card = document.createElement('article');
  card.className = 'product';
  if (product.image) {
    const photo = document.createElement('img');
    photo.className = 'product-photo';
    photo.src = product.image;
    photo.alt = product.name;
    card.append(photo);
  }
  const name = document.createElement('h3');
  name.textContent = product.name;
  const weight = document.createElement('p');
  weight.className = 'muted';
  weight.textContent = product.weight;
  const price = document.createElement('strong');
  price.textContent = money.format(product.price);
  const stock = document.createElement('p');
  stock.className = 'stock';
  const stockNumber = document.createElement('b');
  stockNumber.id = `stock-${product.id}`;
  stockNumber.className = 'stock-number';
  stock.append('剩餘庫存 ', stockNumber, ' 份');
  const picker = document.createElement('select');
  picker.id = `quantity-${product.id}`;
  picker.setAttribute('aria-label', `${product.name}數量`);
  const add = document.createElement('button');
  add.type = 'button';
  add.id = `add-${product.id}`;
  add.textContent = product.type === 'fresh' ? '立即搶拍' : '加入購物車';
  add.setAttribute('aria-label', `將${product.name}加入購物車`);
  add.addEventListener('click', () => {
    const current = products.find(item => item.id === product.id);
    if (current) changeQuantity(current, Number(picker.value), true);
  });
  const actions = document.createElement('div');
  actions.className = 'product-actions';
  actions.append(picker, add);
  card.append(name, weight);
  if (product.type === 'fresh') {
    const release = document.createElement('p');
    release.className = 'muted';
    release.textContent = { daily: '例行上架', extra: '週日加開', manual: '不定時發布' }[product.release] ?? '現流上架';
    card.append(release);
  }
  if (product.description) {
    const description = document.createElement('p');
    description.className = 'muted';
    description.textContent = product.description;
    card.append(description);
  }
  if (product.listPrice > product.price) {
    const original = document.createElement('del');
    original.className = 'muted';
    original.textContent = `原價 ${money.format(product.listPrice)}`;
    card.append(original);
  }
  card.append(price, stock, actions);
  return card;
}

function renderProductCards() {
  const active = products.filter(product => product.status === 'active');
  const fresh = active.filter(product => product.type === 'fresh');
  fresh.sort((a, b) => Number(demoStock(b) > 0) - Number(demoStock(a) > 0));
  const visible = { fresh: fresh.slice(0, 2), frozen: active.filter(product => product.type === 'frozen') };
  const signature = JSON.stringify(visible, (key, value) => key === 'stock' ? undefined : value);
  if (signature === renderedProducts) return;
  renderedProducts = signature;
  for (const [type, entries] of Object.entries(visible)) {
    $(`${type}-products`).replaceChildren(...entries.map(makeProductCard));
    $(`${type}-empty`).hidden = entries.length !== 0;
  }
}

function resetCartAccess() {
  cartUnlocked = false;
  $('cart-access').reset();
  $('cart-access').hidden = false;
  $('cart-error').hidden = true;
  $('cart-content').hidden = true;
  renderCart();
}

function playStockEffect(number) {
  number.classList.remove('stock-pop');
  number.getBoundingClientRect();
  number.classList.add('stock-pop');
}

$('open-cart').addEventListener('click', () => {
  resetCartAccess();
  $('checkout').showModal();
  $('cart-email').focus();
});
$('close-cart').addEventListener('click', () => $('checkout').close());
$('checkout').addEventListener('close', resetCartAccess);
function showCartContent() {
  cartUnlocked = true;
  $('cart-access').reset();
  $('cart-access').hidden = true;
  $('cart-content').hidden = false;
  renderCart();
}

$('cart-access').addEventListener('submit', (event) => {
  event.preventDefault();
  if ($('cart-email').value.trim().toLowerCase() !== demoEmail || $('cart-phone').value !== demoPhone) {
    $('cart-error').hidden = false;
    return;
  }
  showCartContent();
  if (cart.size && !$('place-order').disabled) $('place-order').focus();
  else if (order && !order.paid) $('open-report-link').focus();
  else if (order && !order.emailRecorded) $('send-email').focus();
  else $('close-cart').focus();
});

$('open-private').addEventListener('click', () => {
  $('private-gate').hidden = true;
  $('private-conversation').hidden = false;
  $('private-message').focus();
  $('board-status').textContent = '已開啟模擬私人留言。';
});

const tabs = [$('public-tab'), $('private-tab')];

function selectBoard(selectedTab) {
  for (const tab of tabs) {
    const selected = tab === selectedTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectBoard(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[1] : tabs.find((item) => item !== tab);
    selectBoard(next);
    next.focus();
  });
}

$('post-public').addEventListener('click', () => {
  const post = publicPosts[$('public-message').value];
  const entry = document.createElement('li');
  const title = document.createElement('h3');
  const meta = document.createElement('small');
  const body = document.createElement('p');
  title.textContent = post.title;
  meta.textContent = `展示訪客 · ${post.category}`;
  body.textContent = post.body;
  entry.append(title, meta, body);
  $('public-messages').prepend(entry);
  $('board-status').textContent = '已張貼到公開留言板。';
});

$('post-private').addEventListener('click', () => {
  const entry = document.createElement('li');
  const author = document.createElement('strong');
  const body = document.createElement('p');
  author.textContent = '展示顧客';
  body.textContent = $('private-message').value;
  entry.append(author, body);
  $('private-messages').append(entry);
  $('board-status').textContent = '已新增私人示範訊息。';
});

$('place-order').addEventListener('click', () => {
  if (!DemoRules.cycle(scenario).orderOpen || !cartUnlocked || !$('checkout').open || !cart.size || cartHasUnavailableItems() || (order && !order.paid)) return;
  const amounts = cartAmounts();
  const items = products.filter(product => cart.has(product.id)).map(product => ({
    id: product.id, name: product.name, type: product.type, quantity: cart.get(product.id),
    remaining: product.stock - cart.get(product.id), unitPrice: product.price, unitCost: product.unitCost,
  }));
  order = {
    id: `DEMO-${String(orders.length + 1).padStart(3, '0')}`,
    items, subtotal: amounts.subtotal, shipping: amounts.shipping, total: amounts.total,
    paid: false, emailRecorded: false, shipped: false,
    reportToken: crypto.randomUUID(),
  };
  orders.unshift(order);
  cycleSubtotal += amounts.subtotal;
  for (const product of products) {
    const quantity = cart.get(product.id) ?? 0;
    if (!quantity) continue;
    stockLog.unshift(`${order.id} · ${product.name} ${product.stock} → ${demoStock(product) - quantity}（訂單扣庫存）`);
    product.stock -= quantity;
  }
  cart.clear();
  saveDemoState();
  renderCart();
  renderOrder();
  $('order-title').focus();
  announce(`已建立示範訂單 ${order.id}。`);
});

$('send-email').addEventListener('click', () => {
  if (!cartUnlocked || !order?.paid || order.emailRecorded) return;
  order.emailRecorded = true;
  saveDemoState();
  renderOrder();
  $('email-status').focus();
  announce('已記錄模擬通知。');
});

renderCart();
renderOrder();
renderDemoContent();
onDemoStateChange(() => {
  renderCart();
  renderOrder();
  renderDemoContent();
  if ($('report-dialog').open) renderReport();
});

function renderDemoContent() {
  $('announcement-copy').textContent = announcement;
  $('scenario-select').value = scenario;
  const cycle = DemoRules.cycle(scenario);
  $('scenario-status').textContent = `${cycle.title} · 模擬時刻 ${cycle.clock}`;
  const published = videos.filter(video => video.published).slice(0, 3);
  const signature = JSON.stringify(published);
  if (signature === renderedVideos) return;
  renderedVideos = signature;
  $('video-library').replaceChildren(...published.map(video => {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = video.title;
    const description = document.createElement('p');
    description.textContent = video.description;
    const media = document.createElement('video');
    media.controls = true;
    media.playsInline = true;
    media.preload = 'none';
    media.setAttribute('aria-label', video.title);
    media.src = './market-demo.mp4';
    section.append(title, description, media);
    return section;
  }));
  if (!published.length) $('video-library').textContent = '目前沒有發布的展示影片。';
}

$('scenario-select').addEventListener('change', () => {
  scenario = $('scenario-select').value;
  saveDemoState();
  renderDemoContent();
  renderCart();
});

$('open-lookup').addEventListener('click', () => {
  const rows = orders.map(entry => {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = reportLink(entry);
    link.textContent = `${entry.id}｜${demoOrderStatus(entry)}`;
    row.append(link);
    return row;
  });
  $('lookup-list').replaceChildren(...rows);
  if (!rows.length) $('lookup-list').textContent = '目前沒有示範訂單。';
  $('lookup-dialog').showModal();
});
$('close-lookup').addEventListener('click', () => $('lookup-dialog').close());

function renderRecipient() {
  const recipient = demoRecipients[$('report-recipient').value];
  const labels = [['收件姓名', recipient.name], ['手機', recipient.phone], ['7-11', recipient.seven], ['全家', recipient.family]];
  $('recipient-details').replaceChildren(...labels.map(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    return row;
  }));
}
$('report-recipient').addEventListener('change', renderRecipient);

function reportOrderFromLocation() {
  const token = new URLSearchParams(location.hash.slice(1)).get('report');
  return token && orders.find(entry => entry.reportToken === token);
}

function renderReport() {
  const entry = reportOrderFromLocation();
  $('report-order').textContent = entry ? `${entry.id} · 應付 ${money.format(entry.total)}` : '';
  $('report-message').textContent = entry ? demoOrderStatus(entry) : '找不到這筆示範訂單，請在原下單瀏覽器開啟信件中的表單。';
  $('report-form').hidden = !entry || entry.paid || entry.report?.status === 'pending';
}

function openReportFromLocation() {
  if (!location.hash.startsWith('#report=')) return;
  if ($('checkout').open) $('checkout').close();
  if ($('lookup-dialog').open) $('lookup-dialog').close();
  if (!$('report-dialog').open) {
    $('report-form').reset();
    renderRecipient();
    $('report-dialog').showModal();
  }
  renderReport();
}

$('report-form').addEventListener('submit', event => {
  event.preventDefault();
  const entry = reportOrderFromLocation();
  if (!entry || entry.paid || entry.report?.status === 'pending') return;
  const previous = entry.report;
  entry.report = {
    amount: $('report-amount').valueAsNumber,
    tail: $('report-tail').value,
    recipient: $('report-recipient').value,
    status: 'pending',
  };
  if (!saveDemoState()) {
    entry.report = previous;
    $('report-message').textContent = '無法儲存示範回報，請重試。';
    return;
  }
  renderReport();
  renderOrder();
});

$('close-report').addEventListener('click', () => $('report-dialog').close());
$('report-dialog').addEventListener('close', () => {
  history.replaceState(null, '', location.pathname + location.search);
});
window.addEventListener('hashchange', openReportFromLocation);

const welcome = $('welcome');
const welcomeKey = demoWelcomeKey;
let welcomeSeen = false;
try {
  welcomeSeen = localStorage.getItem(welcomeKey) === 'yes';
} catch {
  // Browsers may restrict storage for local files.
}
$('show-welcome').addEventListener('click', () => welcome.showModal());
$('close-welcome').addEventListener('click', () => welcome.close());
welcome.addEventListener('close', () => {
  try {
    localStorage.setItem(welcomeKey, 'yes');
  } catch {
    // The notice is still dismissed for the current page.
  }
});
if (location.hash.startsWith('#report=')) openReportFromLocation();
else if (!welcomeSeen) welcome.showModal();
