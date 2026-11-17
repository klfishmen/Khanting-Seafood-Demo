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

function previewEmail(entry, confirmation) {
  $('email-preview-recipient').textContent = memberForOrder(entry)?.email ?? demoCustomerEmail;
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
  const batch = batches.find(item => item.id === entry.batchId);
  if (batch && !Ops.batchProblem(batch, [entry])) showBatchSheet(batch, [entry], false);
}

$('close-email-preview').addEventListener('click', () => $('email-preview').close());
$('close-shipping-preview').addEventListener('click', () => $('shipping-preview').close());
$('print-order-sheet').addEventListener('click', () => window.print());

function reconcile(entry) {
  if (entry.paid || entry.cancelledAt || entry.report?.status !== 'pending') return;
  const matched = entry.report.amount === entry.total && entry.report.tail === demoBankTail;
  entry.report.status = matched ? 'verified' : 'mismatch';
  entry.paid = matched;
  entry.paidAt = matched ? new Date().toISOString() : null;
  if (!saveDemoState({ type: '人工核對匯款', target: entry.id, before: '待核對', after: matched ? '已核對' : '不符，待重填' })) {
    entry.report.status = 'pending';
    entry.paid = false;
    entry.paidAt = null;
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
    return adminRow(text, adminAction(`reconcile-${entry.id}`, '核對合成匯款', report.status !== 'pending' || Boolean(entry.cancelledAt), () => reconcile(entry)));
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

const batchOrders = batch => orders.filter(entry => entry.batchId === batch.id);
let exceptionBatchId = '';

function showBatchSheet(batch, assigned, picking) {
  $('shipping-preview-title').textContent = picking ? '示範揀貨清單' : '示範出貨單';
  $('print-order-sheet').textContent = picking ? '列印揀貨清單' : '列印出貨單';
  $('shipping-order-id').textContent = picking ? `批次 ${batch.id}｜${assigned.length} 筆訂單` :
    `批次 ${batch.id}｜訂單 ${assigned.map(entry => entry.id).join('、')}`;
  $('shipping-recipient').textContent = `列印日期 ${Ops.date(new Date().toISOString())}｜批次備註：${batch.note || '無'}`;
  let rows;
  if (picking) {
    rows = [...opsGroup(assigned.flatMap(entry => entry.items), item => item.id)].map(([, items]) =>
      `${productTypeLabel[items[0].type] ?? '商品'}｜${items[0].name} × ${Ops.sum(items, item => item.quantity)}`);
  } else {
    rows = assigned.flatMap(entry => [
      `${entry.id}｜${recipientSummary(entry.lockedRecipient)}`,
      ...entry.items.map(item => `${productTypeLabel[item.type] ?? '商品'}｜${item.name} × ${item.quantity}`),
    ]);
  }
  opsList('shipping-items', rows);
  $('shipping-preview').showModal();
}

function advanceShipping(batch) {
  const assigned = batchOrders(batch);
  const next = Ops.advanceBatch(batch, assigned);
  if (!next) return;
  const before = Ops.batchStages[batch.status];
  if (next === 'sent') {
    const time = new Date().toISOString();
    for (const entry of assigned.filter(entry => !entry.shipped)) {
      entry.shipped = true;
      entry.shippedAt = time;
    }
  }
  batch.status = next;
  saveAdminChange('推進批次', batch.id, before, Ops.batchStages[next]);
  renderAdmin();
}

function openBatchException(batch) {
  exceptionBatchId = batch.id;
  $('batch-exception-title').textContent = batch.exception ? '解除批次異常' : '標記批次異常';
  $('batch-exception-note').value = '';
  $('batch-exception-dialog').showModal();
}

$('close-batch-exception').addEventListener('click', () => $('batch-exception-dialog').close());
$('batch-exception-form').addEventListener('submit', event => {
  event.preventDefault();
  const batch = batches.find(item => item.id === exceptionBatchId);
  const note = $('batch-exception-note').value.trim();
  if (!batch || !note || batch.status === 'complete') return;
  const before = batch.exception || Ops.batchStages[batch.status];
  batch.exception = batch.exception ? '' : note;
  if (saveAdminChange('批次異常異動', batch.id, before, batch.exception ? '異常｜' + note : '解除｜' + note)) {
    $('batch-exception-dialog').close();
  }
  renderAdmin();
});

function renderBatches() {
  const select = $('batch-select');
  const selected = select.value;
  const open = batches.filter(batch => batch.status === 'picking' && !batch.exception);
  select.replaceChildren(...open.map(batch => new Option(batch.id, batch.id)));
  if (open.some(batch => batch.id === selected)) select.value = selected;
  const query = $('batch-search').value.trim().toLowerCase();
  const state = $('batch-filter').value;
  const filtered = batches.filter(batch => (!state || state === (batch.exception ? 'exception' : batch.status)) &&
    [batch.id, batch.note, batch.exception].join(' ').toLowerCase().includes(query));
  $('admin-batches').replaceChildren(...(filtered.length ? filtered.map(batch => {
    const assigned = batchOrders(batch);
    const problem = Ops.batchProblem(batch, assigned);
    const next = Ops.advanceBatch(batch, assigned);
    const controls = document.createElement('div');
    controls.className = 'admin-actions';
    controls.append(
      adminAction('batch-pack-' + batch.id, '出貨單', Boolean(problem), () => showBatchSheet(batch, assigned, false)),
      adminAction('batch-pick-' + batch.id, '揀貨清單', Boolean(problem), () => showBatchSheet(batch, assigned, true)),
      adminAction('batch-next-' + batch.id, next ? Ops.batchStages[next] : '無可執行的下一步', !next, () => advanceShipping(batch)),
      adminAction('batch-exception-' + batch.id, batch.exception ? '解除批次異常' : '標記批次異常',
        batch.status === 'complete', () => openBatchException(batch)),
    );
    const quantity = Ops.sum(assigned.flatMap(entry => entry.items), item => item.quantity);
    return adminRow(`${batch.id}｜${batch.exception ? '異常' : Ops.batchStages[batch.status]}｜${opsTime(batch.createdAt)}｜${assigned.length} 筆訂單｜${quantity} 件｜${assigned.map(entry => entry.id).join('、') || '尚未分配'}${batch.note ? '｜' + batch.note : ''}${batch.exception ? '｜' + batch.exception : ''}${problem ? '｜' + problem : ''}`, controls);
  }) : [adminRow('目前沒有出貨批次。先建立新批次再分配訂單。')]));
}

$('batch-form').addEventListener('submit', event => {
  event.preventDefault();
  const batch = { id: `BATCH-${String(batches.length + 1).padStart(3, '0')}`, status: 'picking',
    createdAt: new Date().toISOString(), note: $('batch-note').value.trim() };
  batches.push(batch);
  if (!saveAdminChange('建立出貨批次', batch.id, '尚無批次', '可分配')) return;
  renderAdmin();
  $('batch-select').value = batch.id;
  $('batch-note').value = '';
});

$('reset-demo').addEventListener('click', () => {
  if (confirm('重設展示資料？將恢復 10 位會員、10 項商品、20 筆訂單、4 批出貨及 12 筆會計紀錄。') && resetDemoData()) location.reload();
});

let selectedOrderId = '';
const recipientKeys = ['name', 'phone', 'seven', 'sevenCode', 'family', 'familyCode'];

function selectedOrder() {
  return orders.find(entry => entry.id === selectedOrderId);
}

function recipientSummary(recipient) {
  return recipient ? [recipient.name, Ops.maskedPhone(recipient.phone),
    `7-11 ${recipient.seven}${recipient.sevenCode ? '（' + recipient.sevenCode + '）' : ''}`,
    `全家 ${recipient.family}${recipient.familyCode ? '（' + recipient.familyCode + '）' : ''}`].join('｜') : '未填收件資料';
}

function viewOrder(entry) {
  selectedOrderId = entry.id;
  $('order-detail-status').textContent = '';
  $('order-cancel-reason').value = '';
  renderOrderDetail(entry);
  $('order-detail').showModal();
}

function renderOrderDetail(entry) {
  const receiver = Ops.receiver(entry, demoRecipients);
  const batch = batches.find(item => item.id === entry.batchId);
  const member = memberForOrder(entry);
  renderMetrics('order-detail-metrics', [
    ['訂單編號', entry.id], ['目前狀態', opsLabels[Ops.orderState(entry, batch)]],
    ['會員', member ? member.id + '｜' + member.name : '未連結會員'],
    ['成立時間', opsTime(entry.createdAt)], ['週期', entry.weekly_cycle_id ?? '未記錄'],
    ['顧客／手機遮罩', `${receiver?.name ?? entry.customerName ?? '展示買家'}｜${Ops.maskedPhone(receiver?.phone ?? entry.customerPhone)}`],
    ['商品小計', opsMoney(entry.subtotal)], ['顧客支付運費', opsMoney(entry.shipping)],
    ['應付合計', opsMoney(entry.total)], ['出貨批次', entry.batchId ?? '尚未分配'],
    ['批次狀態', batch?.exception ? '異常' : (Ops.batchStages[batch?.status] ?? '尚未分配')],
    ['退款異常', entry.refundBlocked ? '已標記，阻擋出貨' : '無'],
    ['匯款回報', entry.report ? `${entry.report.status === 'verified' ? '已核對' : entry.report.status === 'mismatch' ? '金額或末碼不符' : '待核對'}｜${opsMoney(entry.report.amount)}｜末五碼 ${entry.report.tail}` : '未回報'],
    ['回報／核帳時間', `${opsTime(entry.report?.reportedAt)}／${opsTime(entry.paidAt)}`],
    ['取消備註', entry.cancelReason ?? '—'],
  ]);
  $('order-detail-items').replaceChildren(...entry.items.map(item =>
    adminRow(`${item.name} × ${item.quantity}｜單價 ${opsMoney(item.unitPrice)}｜小計 ${opsMoney(item.unitPrice == null ? null : item.unitPrice * item.quantity)}｜成本快照 ${opsMoney(item.unitCost)}／份`)));
  $('order-recipient-lock').textContent = (entry.batchId ? '正式分配後已鎖定｜' : '') + recipientSummary(receiver);
  $('order-recipient-form').hidden = Boolean(entry.batchId || entry.cancelledAt);
  for (const key of recipientKeys) $('order-recipient-' + key).value = receiver?.[key] ?? '';
  $('order-cancel-form').hidden = Boolean(entry.paid || entry.batchId || entry.cancelledAt);
  const events = [...(entry.history ?? []), ...(batch?.history ?? []).filter(event =>
    event.type === '推進批次' || event.type === '批次異常異動')].sort((a, b) => b.time.localeCompare(a.time));
  opsList('order-history', events.map(event =>
    `${opsTime(event.time)}｜${event.type}｜${event.before} → ${event.after}`), '此舊單沒有保留的狀態紀錄。');
}

$('order-recipient-form').addEventListener('submit', event => {
  event.preventDefault();
  const entry = selectedOrder();
  if (!entry || entry.batchId || entry.cancelledAt) return;
  const receiver = Object.fromEntries(recipientKeys.map(key => [key, $('order-recipient-' + key).value.trim()]));
  if (!Ops.validReceiver(receiver)) return;
  const before = recipientSummary(Ops.receiver(entry, demoRecipients));
  entry.recipientDetails = receiver;
  if (saveAdminChange('更新收件資料', entry.id, before, recipientSummary(receiver))) $('order-detail-status').textContent = '已儲存示範收件資料。';
  renderOrderDetail(selectedOrder());
  renderAdmin();
});

$('order-cancel-form').addEventListener('submit', event => {
  event.preventDefault();
  const entry = selectedOrder();
  const reason = $('order-cancel-reason').value.trim();
  if (!entry || entry.paid || entry.batchId || entry.cancelledAt || !reason) return;
  const before = demoOrderStatus(entry);
  entry.cancelledAt = new Date().toISOString();
  entry.cancelReason = reason;
  if (saveAdminChange('取消示範訂單', entry.id, before, '已取消｜' + reason)) $('order-detail-status').textContent = '已取消，庫存與週累積維持原值。';
  renderOrderDetail(selectedOrder());
  renderAdmin();
});
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
  const receiver = Ops.receiver(entry, demoRecipients);
  const searchable = [entry.id, entry.batchId, entry.memberId, receiver?.name, entry.customerName,
    Ops.maskedPhone(receiver?.phone ?? entry.customerPhone), ...entry.items.map(item => item.name)].join(' ').toLowerCase();
  if (!searchable.includes(query)) return false;
  return filter === 'all' || filter === Ops.orderState(entry, batches.find(batch => batch.id === entry.batchId));
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
  renderOpsSections();
  renderMembers();
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
  const filtered = orders.filter(entry => Ops.orderInScope(entry, opsScope()) && matchesOrder(entry, $('admin-order-filter').value, query));
  $('admin-orders').replaceChildren(...(filtered.length ? filtered.map(entry => {
    const details = entry.items.map(item => `${item.name} × ${item.quantity}`).join('、');
    const batch = batches.find(item => item.id === entry.batchId);
    const canShip = () => DemoRules.canShip(entry) && batch && !Ops.batchProblem(batch, batchOrders(batch));
    const ship = adminAction(`ship-${entry.id}`, '標記模擬出貨', !canShip(), () => {
      if (!canShip()) return;
      entry.shipped = true;
      entry.shippedAt = new Date().toISOString();
      if (!saveAdminChange('標記出貨', entry.id, '已分配', '已模擬出貨')) return;
      renderAdmin();
      $('admin-status').textContent = `${entry.id} 已標記模擬出貨。`;
    });
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    const receiver = Ops.receiver(entry, demoRecipients);
    const problem = DemoRules.shipmentProblem(entry) || (!Ops.validReceiver(receiver) ? '收件資料待補' : '');
    const assign = adminAction(`assign-${entry.id}`, '分配所選批次', Boolean(problem) || !$('batch-select').value, () => {
      const batchId = $('batch-select').value;
      if (DemoRules.shipmentProblem(entry) || !Ops.validReceiver(receiver) ||
          !batches.some(item => item.id === batchId && item.status === 'picking' && !item.exception)) return;
      entry.batchId = batchId;
      entry.lockedRecipient = { ...receiver };
      entry.assignedAt = new Date().toISOString();
      saveAdminChange('分配出貨批次', entry.id, '尚未分配', batchId);
      renderAdmin();
    });
    const refund = adminAction(`refund-${entry.id}`, '標記退款異常', entry.refundBlocked || Boolean(entry.cancelledAt), () => {
      entry.refundBlocked = true;
      saveAdminChange('退款異常', entry.id, '可依條件分配', '阻擋出貨');
      renderAdmin();
    });
    const canPrint = batch && !Ops.batchProblem(batch, [entry]);
    actions.append(adminAction(`detail-${entry.id}`, '查看詳情', false, () => viewOrder(entry)), assign, refund,
      adminAction(`print-${entry.id}`, '出貨單預覽', !canPrint, () => previewShipping(entry)), ship);
    return adminRow(`${entry.id} · ${opsLabels[Ops.orderState(entry, batch)]} · ${opsMoney(entry.total)}｜${receiver?.name ?? entry.customerName ?? '展示買家'} ${Ops.maskedPhone(receiver?.phone ?? entry.customerPhone)}｜${Ops.date(entry.createdAt) || '日期未記錄'} · ${entry.weekly_cycle_id ?? '週期未記錄'}｜${details}｜${entry.batchId ?? '尚未分配'}${problem ? '｜' + problem : ''}`, actions);
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

initAdminOperations();
renderAdmin();
onDemoStateChange(() => {
  renderAdmin();
  if (!$('order-detail').open) return;
  if (selectedOrder()) renderOrderDetail(selectedOrder());
  else $('order-detail').close();
});
