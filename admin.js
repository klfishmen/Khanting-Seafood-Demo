'use strict';

function adminRow(text, action) {
  const row = document.createElement('li');
  const label = document.createElement('span');
  label.textContent = text;
  row.append(label);
  if (action) row.append(action);
  return row;
}

function adminAction(id, label, disabled, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.id = id;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

const statusLabels = { active: '已上架', draft: '草稿', paused: '已下架', stopped: '停售' };
let editingProduct = null;
let productImage = '';
let imageRequest = 0;

function saveProductRecord(product, previous) {
  const position = previous ? products.indexOf(previous) : products.length;
  products.splice(position, previous ? 1 : 0, product);
  const stockChanged = previous ? previous.stock !== product.stock : product.stock > 0;
  if (stockChanged) {
    stockLog.unshift(`${product.name} ${previous?.stock ?? 0} → ${product.stock}（${previous ? '庫存調整' : '初始庫存'}）`);
  }
  const summary = item => item ? `${item.name}・${statusLabels[item.status]}・${money.format(item.price)}・庫存 ${item.stock}` : '尚無商品';
  const type = !previous ? '新增商品' : previous.status !== product.status ? '商品狀態' : previous.stock !== product.stock ? '調整庫存' : '編輯商品';
  if (saveDemoState({ type, target: product.name, before: summary(previous), after: summary(product) })) return true;
  products.splice(position, 1, ...(previous ? [previous] : []));
  if (stockChanged) stockLog.shift();
  return false;
}

function updateProductPreview() {
  const preview = $('product-preview');
  if (productImage) preview.src = productImage;
  else preview.removeAttribute('src');
  preview.hidden = !productImage;
  $('remove-product-image').hidden = !productImage;
}

function productError(message) {
  $('product-error').textContent = message;
  $('product-error').hidden = !message;
}

function updatePriceFields() {
  const frozen = $('product-type').value === 'frozen';
  $('product-list-price-field').hidden = !frozen;
  $('product-list-price').disabled = !frozen;
  $('product-release-field').hidden = frozen;
}

function openProductEditor(product) {
  editingProduct = product ? { ...product } : null;
  productImage = product?.image ?? '';
  imageRequest += 1;
  $('product-form').reset();
  $('product-editor-title').textContent = product ? '編輯商品' : '新增商品草稿';
  $('product-name').value = product?.name ?? '';
  $('product-type').value = product?.type ?? ($('product-filter').value === 'frozen' ? 'frozen' : 'fresh');
  $('product-release').value = product?.release ?? 'manual';
  $('product-weight').value = product?.weight ?? '';
  $('product-description').value = product?.description ?? '';
  $('product-price').value = product?.price ?? '';
  $('product-cost').value = product?.unitCost ?? '';
  $('product-list-price').value = product?.listPrice ?? '';
  $('product-stock').value = product?.stock ?? 0;
  $('save-product').disabled = false;
  updateProductPreview();
  updatePriceFields();
  productError('');
  $('product-editor').showModal();
  $('product-name').focus();
}

async function readProductImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
    throw new Error('請選擇 256 KB 以下的 PNG、JPEG 或 WebP 圖片。');
  }
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = source;
  await image.decode();
  return source;
}

$('product-image').addEventListener('change', async () => {
  const file = $('product-image').files[0];
  if (!file) return;
  const request = ++imageRequest;
  $('save-product').disabled = true;
  productError('');
  try {
    const source = await readProductImage(file);
    if (request !== imageRequest) return;
    productImage = source;
    updateProductPreview();
  } catch (error) {
    if (request !== imageRequest) return;
    $('product-image').value = '';
    productError(error instanceof Error && error.message.startsWith('請選擇') ? error.message : '無法讀取圖片，請重新選擇。');
  } finally {
    if (request === imageRequest) $('save-product').disabled = false;
  }
});

$('remove-product-image').addEventListener('click', () => {
  imageRequest += 1;
  productImage = '';
  $('product-image').value = '';
  $('save-product').disabled = false;
  productError('');
  updateProductPreview();
});

$('product-form').addEventListener('submit', event => {
  event.preventDefault();
  const previous = editingProduct && products.find(product => product.id === editingProduct.id);
  if (editingProduct && (!previous || JSON.stringify(previous) !== JSON.stringify(editingProduct))) {
    productError('商品或庫存已更新，請關閉後重新開啟編輯。');
    return;
  }
  const name = $('product-name').value.trim();
  const weight = $('product-weight').value.trim();
  if (!name || !weight) {
    productError('請填寫商品名稱與規格。');
    return;
  }
  const stock = $('product-stock').valueAsNumber;
  if (stock < (cart.get(previous?.id) ?? 0)) {
    productError('庫存不能低於購物車已選數量。');
    return;
  }
  const type = $('product-type').value;
  const price = $('product-price').valueAsNumber;
  const unitCost = $('product-cost').value ? $('product-cost').valueAsNumber : null;
  const listPrice = type === 'frozen' && $('product-list-price').value ? $('product-list-price').valueAsNumber : null;
  if (listPrice !== null && listPrice < price) {
    productError('冷凍原價須大於或等於售價。');
    return;
  }
  const product = {
    id: previous?.id ?? `product-${crypto.randomUUID()}`,
    name, type, weight, release: type === 'fresh' ? $('product-release').value : null,
    description: $('product-description').value.trim(), image: productImage,
    price, listPrice, unitCost, stock, status: previous?.status ?? 'draft',
  };
  if (!saveProductRecord(product, previous)) {
    productError('瀏覽器儲存空間不足或無法寫入，請移除圖片後重試。');
    return;
  }
  $('product-editor').close();
  renderAdmin();
  $('admin-status').textContent = `已儲存${product.name}。`;
});

$('new-product').addEventListener('click', () => openProductEditor(null));
$('product-type').addEventListener('change', updatePriceFields);
$('close-product-editor').addEventListener('click', () => $('product-editor').close());
$('product-editor').addEventListener('close', () => { imageRequest += 1; });
$('product-filter').addEventListener('change', renderAdmin);
$('product-status-filter').addEventListener('change', renderAdmin);

function makeProductRow(product) {
  const row = document.createElement('li');
  const heading = document.createElement('h3');
  heading.textContent = product.name;
  const info = document.createElement('p');
  info.textContent = `${productTypeLabel[product.type]}｜${product.weight}｜${money.format(product.price)}｜${statusLabels[product.status]}｜庫存 ${product.stock} 份`;
  if (product.listPrice) info.append(`｜原價 ${money.format(product.listPrice)}`);
  info.append(`｜單位成本 ${product.unitCost === null ? '未填寫' : money.format(product.unitCost)}`);
  const selected = cart.get(product.id) ?? 0;
  const available = Math.max(0, demoStock(product) - selected);
  if (product.status === 'active' && available === 0) info.append('｜售罄');
  if (selected) info.append(`｜購物車已選 ${selected} 份｜剩餘 ${product.stock - selected} 份`);
  row.append(heading, info);
  if (product.description) {
    const description = document.createElement('p');
    description.textContent = product.description;
    row.append(description);
  }
  if (product.image) {
    const image = document.createElement('img');
    image.className = 'product-preview';
    image.src = product.image;
    image.alt = product.name;
    row.append(image);
  } else {
    const noImage = document.createElement('p');
    noImage.className = 'muted';
    noImage.textContent = '未上傳圖片';
    row.append(noImage);
  }
  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  const active = product.status === 'active';
  const changeStatus = adminAction(`listing-${product.id}`, active ? '下架' : product.status === 'stopped' ? '重新上架' : '上架', !active && product.stock === 0, () => {
    const saved = saveProductRecord({ ...product, status: active ? 'paused' : 'active' }, product);
    renderAdmin();
    $('admin-status').textContent = saved ? `${product.name}已${active ? '下架' : '上架'}。` : '無法儲存商品狀態。';
  });
  actions.append(adminAction(`edit-${product.id}`, '編輯', false, () => openProductEditor(product)), changeStatus);
  actions.append(adminAction(`stop-${product.id}`, '停售', product.status === 'stopped', () => {
    const saved = saveProductRecord({ ...product, status: 'stopped' }, product);
    renderAdmin();
    $('admin-status').textContent = saved ? `${product.name}已停售。` : '無法儲存商品狀態。';
  }));
  for (const [difference, label] of [[1, '補貨 +1'], [-1, '盤減 −1']]) {
    const disabled = difference < 0 ? product.stock <= (cart.get(product.id) ?? 0) : product.stock >= 9999;
    const button = adminAction(`admin-${product.id}-${difference}`, label, disabled, () => {
      const stock = product.stock + difference;
      const saved = saveProductRecord({ ...product, stock }, product);
      renderAdmin();
      $('admin-status').textContent = saved ? `${product.name}庫存已調整為 ${stock}。` : '無法儲存庫存異動。';
    });
    button.setAttribute('aria-label', `${product.name}${label}`);
    actions.append(button);
  }
  row.append(actions);
  return row;
}

function renderMetrics(id, metrics) {
  $(id).replaceChildren(...metrics.map(([name, value]) => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const count = document.createElement('dd');
    label.textContent = name;
    count.textContent = value;
    row.append(label, count);
    return row;
  }));
}

function renderProfit() {
  const paid = orders.filter(entry => entry.paid);
  const costed = paid.filter(entry => entry.items.length && entry.items.every(item =>
    Number.isSafeInteger(item.unitPrice) && Number.isSafeInteger(item.unitCost)));
  let revenue = 0;
  let cost = 0;
  for (const entry of costed) {
    for (const item of entry.items) {
      revenue += item.unitPrice * item.quantity;
      cost += item.unitCost * item.quantity;
    }
  }
  renderMetrics('admin-profit', [
    ['已付款總額（含運費）', money.format(paid.reduce((sum, entry) => sum + entry.total, 0))],
    ['納入毛利的商品收入', money.format(revenue)],
    ['納入毛利的商品成本', money.format(cost)],
    ['商品毛利', costed.length ? money.format(revenue - cost) : '—'],
    ['商品毛利率', revenue ? (100 * (revenue - cost) / revenue).toFixed(1) + '%' : '—'],
    ['成本缺漏，未計入毛利', paid.length - costed.length],
  ]);
}

function previewEmail(entry, confirmation) {
  $('email-preview-recipient').textContent = demoCustomerEmail;
  $('email-preview-subject').textContent = `[示範] ${entry.id}｜${confirmation ? '付款確認' : '訂單已建立'}`;
  $('email-preview-body').textContent = confirmation
    ? `已記錄 ${entry.id} 的示範付款，金額 ${money.format(entry.total)}。`
    : `您好，您的示範訂單 ${entry.id} 已建立，應付 ${money.format(entry.total)}。請點下方按鈕回填匯款及收件資料，送出後等待營運中心核對。`;
  $('email-preview-items').replaceChildren(...entry.items.map(item =>
    adminRow(`${item.name} × ${item.quantity}${Number.isSafeInteger(item.unitPrice) ? ' · ' + money.format(item.unitPrice * item.quantity) : ''}`)));
  const totals = Number.isSafeInteger(entry.subtotal) && Number.isSafeInteger(entry.shipping)
    ? [['商品小計', money.format(entry.subtotal)], ['運費', money.format(entry.shipping)]]
    : [];
  totals.push([confirmation ? '已記錄付款金額' : '應付金額', money.format(entry.total)]);
  renderMetrics('email-preview-totals', totals);
  $('email-preview-link').hidden = !entry.reportToken;
  if (entry.reportToken) $('email-preview-link').href = reportLink(entry);
  $('email-preview').showModal();
}

function previewShipping(entry) {
  $('shipping-order-id').textContent = `訂單 ${entry.id}｜${demoOrderStatus(entry)}`;
  const recipient = demoRecipients[entry.report.recipient];
  $('shipping-recipient').textContent = `${entry.batchId}｜${recipient.name}｜${recipient.phone}｜${recipient.seven}｜${recipient.family}`;
  $('shipping-items').replaceChildren(...entry.items.map(item =>
    adminRow(`${productTypeLabel[item.type] ?? '商品'}｜${item.name} × ${item.quantity}`)));
  $('shipping-preview').showModal();
}

$('close-email-preview').addEventListener('click', () => $('email-preview').close());
$('close-shipping-preview').addEventListener('click', () => $('shipping-preview').close());
$('print-order-sheet').addEventListener('click', () => window.print());

function reconcile(entry) {
  if (entry.paid || entry.report?.status !== 'pending') return;
  const matched = entry.report.amount === entry.total && entry.report.tail === demoBankTail;
  entry.report.status = matched ? 'verified' : 'mismatch';
  entry.paid = matched;
  if (!saveDemoState({ type: '人工核對匯款', target: entry.id, before: '待核對', after: matched ? '已核對' : '不符，待重填' })) {
    entry.report.status = 'pending';
    entry.paid = false;
    $('admin-status').textContent = '無法儲存核對結果。';
    return;
  }
  renderAdmin();
  $('admin-status').textContent = matched ? '合成匯款已核對。' : '金額或末五碼不符，訂單仍未付款。';
}

function renderRemittances() {
  const reports = orders.filter(entry => entry.report);
  $('admin-remittances').replaceChildren(...(reports.length ? reports.map(entry => {
    const report = entry.report;
    const text = `${entry.id}｜${demoOrderStatus(entry)}｜回報 ${money.format(report.amount)}／末五碼 ${report.tail}｜合成入帳 ${money.format(entry.total)}／末五碼 ${demoBankTail}`;
    return adminRow(text, adminAction(`reconcile-${entry.id}`, '核對合成匯款', report.status !== 'pending', () => reconcile(entry)));
  }) : [adminRow('目前沒有匯款回報。')]));
}

let editingAnnouncement = announcements[0]?.id ?? null;
let editingVideo = null;
const visibility = published => published ? '已發布' : '已隱藏';
const videoSummary = entry => `${entry.title}｜${localVideoLinks[entry.asset]}｜${visibility(entry.published)}`;
const announcementSummary = entry => `${visibility(entry.published)}｜${entry.text}`;

function saveAdminChange(type, target, before, after) {
  if (saveDemoState({ type, target, before, after })) return true;
  loadDemoState();
  $('admin-status').textContent = '無法儲存展示資料，已還原上一次儲存的狀態。';
  return false;
}

function editAnnouncement(entry) {
  editingAnnouncement = entry?.id ?? null;
  $('admin-announcement').value = entry?.text ?? '';
  $('admin-announcement').focus();
}

function editVideo(entry) {
  editingVideo = entry?.id ?? null;
  $('video-name').value = entry?.title ?? '';
  $('video-asset').value = entry?.asset ?? 'market-demo.mp4';
  renderPublishing();
  $('video-name').focus();
}

function publishingActions(...buttons) {
  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  actions.append(...buttons);
  return actions;
}

function moveVideo(index, direction) {
  const destination = index + direction;
  if (destination < 0 || destination >= videos.length) return;
  const entry = videos[index];
  [videos[index], videos[destination]] = [videos[destination], videos[index]];
  saveAdminChange('影片排序', entry.title, String(index + 1), String(destination + 1));
  renderAdmin();
}

function renderPublishing() {
  $('admin-announcements').replaceChildren(...announcements.map((entry, index) =>
    adminRow(announcementSummary(entry), publishingActions(
      adminAction(`edit-announcement-${index}`, '編輯公告', false, () => editAnnouncement(entry)),
      adminAction(`toggle-announcement-${index}`, entry.published ? '隱藏公告' : '發布公告', false, () => {
        const before = visibility(entry.published);
        entry.published = !entry.published;
        saveAdminChange('公告狀態', '首頁公告', before, visibility(entry.published));
        renderAdmin();
      })))));
  $('admin-videos').replaceChildren(...videos.map((entry, index) => {
    const row = adminRow(`${index + 1}. ${videoSummary(entry)}`, publishingActions(
      adminAction(`edit-video-${index}`, '編輯影片', false, () => editVideo(entry)),
      adminAction(`video-up-${index}`, '上移', index === 0, () => moveVideo(index, -1)),
      adminAction(`video-down-${index}`, '下移', index === videos.length - 1, () => moveVideo(index, 1)),
      adminAction(`toggle-video-${index}`, entry.published ? '隱藏' : '發布', false, () => {
        const before = visibility(entry.published);
        entry.published = !entry.published;
        saveAdminChange('影片狀態', entry.title, before, visibility(entry.published));
        renderAdmin();
      })));
    const link = document.createElement('a');
    link.href = videoHref(entry.asset);
    link.textContent = '開啟本機影片';
    row.append(link);
    return row;
  }));
  $('save-video').disabled = !editingVideo && videos.length >= 3;
  $('save-video').textContent = editingVideo ? '儲存影片' : '新增展示片段';
  $('cancel-video-edit').hidden = !editingVideo;
}

$('admin-announcement').value = announcements[0]?.text ?? '';
$('new-announcement').addEventListener('click', () => editAnnouncement(null));
$('video-asset').replaceChildren(...Object.entries(localVideoLinks).map(([asset, label]) => new Option(label, asset)));
$('cancel-video-edit').addEventListener('click', () => editVideo(null));

$('announcement-form').addEventListener('submit', event => {
  event.preventDefault();
  const value = $('admin-announcement').value.trim();
  if (!value) return;
  const existing = announcements.find(entry => entry.id === editingAnnouncement);
  if (editingAnnouncement && !existing) return;
  const before = existing ? announcementSummary(existing) : '尚無公告';
  const entry = existing ?? { id: crypto.randomUUID(), published: true };
  entry.text = value;
  if (!existing) announcements.push(entry);
  const saved = saveAdminChange(existing ? '修改公告' : '新增公告', '首頁公告', before, announcementSummary(entry));
  if (saved) editingAnnouncement = entry.id;
  renderAdmin();
  if (saved) $('admin-status').textContent = '公告已更新。';
});

$('video-form').addEventListener('submit', event => {
  event.preventDefault();
  const title = $('video-name').value.trim();
  const asset = $('video-asset').value;
  const existing = videos.find(entry => entry.id === editingVideo);
  if (!title || !Object.hasOwn(localVideoLinks, asset) || (editingVideo && !existing) || (!existing && videos.length >= 3)) return;
  const before = existing ? videoSummary(existing) : '尚無影片';
  const entry = existing ?? { id: crypto.randomUUID(), description: '本機合成影片，供展示操作。', published: true };
  Object.assign(entry, { title, asset });
  if (!existing) videos.push(entry);
  if (saveAdminChange(existing ? '編輯影片' : '新增影片', title, before, videoSummary(entry))) editVideo(null);
  renderAdmin();
});

function renderBatches() {
  const select = $('batch-select');
  const selected = select.value;
  select.replaceChildren(...batches.map(batch => new Option(batch.id, batch.id)));
  if (batches.some(batch => batch.id === selected)) select.value = selected;
  $('admin-batches').replaceChildren(...(batches.length ? batches.map(batch => {
    const assigned = orders.filter(entry => entry.batchId === batch.id);
    return adminRow(`${batch.id}｜${assigned.length} 筆訂單${assigned.length ? '｜' + assigned.map(entry => entry.id).join('、') : ''}`);
  }) : [adminRow('目前沒有出貨批次。先建立新批次再分配訂單。')]));
}

$('batch-form').addEventListener('submit', event => {
  event.preventDefault();
  const batch = { id: `BATCH-${String(batches.length + 1).padStart(3, '0')}` };
  batches.push(batch);
  if (!saveAdminChange('建立出貨批次', batch.id, '尚無批次', '可分配')) return;
  renderAdmin();
  $('batch-select').value = batch.id;
});

$('reset-demo').addEventListener('click', () => {
  if (confirm('重設本 Demo 的商品、購物車、訂單、公告、影片與操作紀錄？') && resetDemoData()) location.reload();
});

function viewOrder(entry) {
  renderMetrics('order-detail-metrics', [
    ['訂單編號', entry.id], ['目前狀態', demoOrderStatus(entry)],
    ['應付合計', money.format(entry.total)], ['出貨批次', entry.batchId ?? '尚未分配'],
    ['退款異常', entry.refundBlocked ? '已標記，阻擋出貨' : '無'],
    ['匯款回報', entry.report?.status === 'pending' ? '待核對' : entry.report ? demoOrderStatus(entry) : '未回報'],
  ]);
  $('order-detail-items').replaceChildren(...entry.items.map(item =>
    adminRow(`${item.name} × ${item.quantity}｜${Number.isFinite(item.unitPrice) ? money.format(item.unitPrice) + '／份' : '未記錄單價'}`)));
  $('order-detail').showModal();
}
$('close-order-detail').addEventListener('click', () => $('order-detail').close());
$('admin-order-search').addEventListener('input', renderAdmin);
$('admin-order-filter').addEventListener('change', renderAdmin);
$('admin-scenario').addEventListener('change', () => {
  const before = DemoRules.cycle(scenario).title;
  scenario = $('admin-scenario').value;
  saveAdminChange('切換情境', '展示時鐘', before, DemoRules.cycle(scenario).title);
  renderAdmin();
});

function matchesOrder(entry, filter, query) {
  const searchable = [entry.id, entry.batchId, ...entry.items.map(item => item.name)].join(' ').toLowerCase();
  if (!searchable.includes(query)) return false;
  switch (filter) {
    case 'unpaid': return !entry.paid;
    case 'pending': return entry.report?.status === 'pending';
    case 'paid': return entry.paid;
    case 'blocked': return Boolean(entry.refundBlocked);
    case 'shipped': return entry.shipped;
    default: return true;
  }
}

const operationTime = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Taipei' });
function renderOperations() {
  $('admin-operations').replaceChildren(...(operations.length ? operations.map(entry => {
    const row = adminRow(`${entry.type}｜${entry.target}｜${entry.before} → ${entry.after}`);
    const time = document.createElement('time');
    time.dateTime = entry.time;
    time.textContent = operationTime.format(new Date(entry.time));
    row.prepend(time);
    return row;
  }) : [adminRow('目前沒有展示操作紀錄。')]));
}

function renderAdmin() {
  const activeId = document.activeElement?.id;
  renderMetrics('admin-summary', [
    ['示範訂單', orders.length],
    ['待模擬付款', orders.filter(entry => !entry.paid).length],
    ['待核對匯款', orders.filter(entry => entry.report?.status === 'pending').length],
    ['待模擬出貨', orders.filter(entry => entry.paid && !entry.shipped).length],
    ['低庫存品項（2 份以下）', products.filter(product => product.stock <= 2).length],
  ]);
  renderProfit();
  renderRemittances();
  renderPublishing();
  renderBatches();
  renderOperations();
  $('admin-scenario').value = scenario;
  $('admin-scenario-status').textContent = DemoRules.cycle(scenario).title;

  const type = $('product-filter').value;
  const status = $('product-status-filter').value;
  const catalog = products.filter(product => (type === 'all' || product.type === type) &&
    (status === 'all' || product.status === status ||
      (status === 'soldout' && product.status === 'active' && demoStock(product) <= (cart.get(product.id) ?? 0))));
  $('admin-stock').replaceChildren(...(catalog.length ? catalog.map(makeProductRow) : [adminRow('沒有符合篩選條件的商品。')]));
  $('admin-stock-log').replaceChildren(...(stockLog.length ? stockLog : ['目前沒有庫存異動。']).map(text => adminRow(text)));

  const query = $('admin-order-search').value.trim().toLowerCase();
  const filtered = orders.filter(entry => matchesOrder(entry, $('admin-order-filter').value, query));
  $('admin-orders').replaceChildren(...(filtered.length ? filtered.map(entry => {
    const details = entry.items.map(item => `${item.name} × ${item.quantity}`).join('、');
    const ship = adminAction(`ship-${entry.id}`, '標記模擬出貨', !DemoRules.canShip(entry), () => {
      if (!DemoRules.canShip(entry)) return;
      entry.shipped = true;
      if (!saveAdminChange('標記出貨', entry.id, '已分配', '已模擬出貨')) return;
      renderAdmin();
      $('admin-status').textContent = `${entry.id} 已標記模擬出貨。`;
    });
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    const problem = DemoRules.shipmentProblem(entry);
    const assign = adminAction(`assign-${entry.id}`, '分配所選批次', Boolean(problem) || !batches.length, () => {
      const batchId = $('batch-select').value;
      if (DemoRules.shipmentProblem(entry) || !batches.some(batch => batch.id === batchId)) return;
      entry.batchId = batchId;
      saveAdminChange('分配出貨批次', entry.id, '尚未分配', batchId);
      renderAdmin();
    });
    const refund = adminAction(`refund-${entry.id}`, '標記退款異常', entry.refundBlocked || entry.shipped, () => {
      entry.refundBlocked = true;
      saveAdminChange('退款異常', entry.id, '可依條件分配', '阻擋出貨');
      renderAdmin();
    });
    const canPrint = Boolean(entry.batchId && entry.paid && !entry.refundBlocked && entry.report?.status === 'verified');
    actions.append(adminAction(`detail-${entry.id}`, '查看詳情', false, () => viewOrder(entry)), assign, refund,
      adminAction(`print-${entry.id}`, '出貨單預覽', !canPrint, () => previewShipping(entry)), ship);
    return adminRow(`${entry.id} · ${demoOrderStatus(entry)} · ${money.format(entry.total)}｜${details}｜${entry.batchId ?? '尚未分配'}${problem ? '｜' + problem : ''}`, actions);
  }) : [adminRow(orders.length ? '找不到符合條件的訂單。' : '目前沒有示範訂單。')]));
  const notifications = orders.flatMap(entry => {
    const rows = [];
    if (entry.reportToken) rows.push(adminRow(`${entry.id} · 訂單成立信`,
      adminAction(`email-order-${entry.id}`, '預覽信件', false, () => previewEmail(entry, false))));
    if (entry.emailRecorded) rows.push(adminRow(`${entry.id} · 已記錄模擬通知`,
      adminAction(`email-payment-${entry.id}`, '預覽付款通知', false, () => previewEmail(entry, true))));
    return rows;
  });
  $('admin-notifications').replaceChildren(...(notifications.length
    ? notifications
    : [adminRow('目前沒有模擬通知。')]));
  const previousControl = $(activeId);
  if (previousControl && !previousControl.disabled) previousControl.focus();
  else if (activeId) $('admin-title').focus();
}

renderAdmin();
onDemoStateChange(renderAdmin);
