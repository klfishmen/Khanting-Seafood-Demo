'use strict';

const initialProducts = DemoFixtures.products;
const legacyProductImages = { fresh: './fresh.png', frozen: './frozen.png' };
const products = [];
const quantityLimit = { fresh: 10, frozen: 6 };
const productTypeLabel = { fresh: '現流', frozen: '冷凍' };
const cart = new Map();
const orders = [];
const stockLog = [];
const money = new Intl.NumberFormat('zh-TW', {
  style: 'currency', currency: 'TWD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0,
});
const $ = (id) => document.getElementById(id);
const demoStateKey = 'khanting-vibe-demo-2026-v1';
const demoCustomerEmail = 'demo-buyer@example.invalid';
const demoBankTail = '54321';
const demoRecipients = DemoFixtures.recipients;
let order = null;
let cycleSubtotal = 0;
let scenario = "open";
let announcements = [];
let videos = [];
let operations = [];
let ledger = [];
const batches = [];
const demoWelcomeKey = demoStateKey + "-welcome";
const localVideoLinks = {
  'market-demo.mp4': '完整示範（9 秒）',
  'market-demo.mp4#t=0,3': '片段：逛魚市（0–3 秒）',
  'market-demo.mp4#t=3,6': '片段：加入購物車（3–6 秒）',
  'market-demo.mp4#t=6,9': '片段：建立訂單（6–9 秒）',
};

function videoHref(asset) {
  return './' + (Object.hasOwn(localVideoLinks, asset) ? asset : 'market-demo.mp4');
}

function loadDemoState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(demoStateKey));
  } catch {
    saved = null;
  }
  const catalog = saved?.products?.map(product => {
    if (product.image !== legacyProductImages[product.type]) return product;
    const original = initialProducts.find(item => item.id === product.id && item.type === product.type);
    return original ? { ...product, image: original.image } : product;
  }) ?? initialProducts.map(product => ({ status: "active", description: "", ...product }));
  products.splice(0, products.length, ...catalog);
  scenario = saved?.scenario ?? "open";
  announcements = saved?.announcements ?? [{
    id: 'market-update', text: saved?.announcement ?? DemoFixtures.announcement, published: true,
  }];
  videos = (saved?.videos ?? DemoFixtures.videos).map((video, index) => ({ id: 'video-original-' + index, ...video }));
  operations = saved?.operations ?? [];
  ledger = saved?.ledger ?? [];
  const recordedTime = (type, id) => operations.find(event => event.type === type && event.target === id)?.time;
  orders.splice(0, orders.length, ...(saved?.orders ?? []).map(entry => {
    const createdAt = entry.createdAt ?? recordedTime('建立示範訂單', entry.id);
    const paidAt = entry.paidAt ?? (entry.paid && operations.find(event =>
      event.target === entry.id && event.type === '人工核對匯款' && event.after === '已核對')?.time) ?? null;
    const lockedRecipient = entry.batchId ? DemoOperations.receiver(entry, demoRecipients) : null;
    const history = entry.history ?? operations.filter(event => event.target === entry.id);
    return { ...entry, createdAt, paidAt: paidAt || null, lockedRecipient, history,
      weekly_cycle_id: entry.weekly_cycle_id ?? (createdAt ? DemoOperations.cycleId(createdAt) : null) };
  }));
  batches.splice(0, batches.length, ...(saved?.batches ?? []).map(batch => {
    const assigned = orders.filter(entry => entry.batchId === batch.id);
    const status = assigned.length && assigned.every(entry => entry.shipped) ? 'sent' : 'picking';
    return { status, createdAt: recordedTime('建立出貨批次', batch.id),
      history: operations.filter(event => event.target === batch.id), ...batch };
  }));
  stockLog.splice(0, stockLog.length, ...(saved?.stockLog ?? []));
  cycleSubtotal = saved?.cycleSubtotal ?? 0;
  cart.clear();
  for (const [id, quantity] of saved?.cart ?? []) cart.set(id, quantity);
  order = orders[0] ?? null;
}

function saveDemoState(event) {
  const change = event && { time: new Date().toISOString(), ...event };
  const history = change ? [change, ...operations].slice(0, 100) : operations;
  const subject = change && (orders.find(order => order.id === change.target) ?? batches.find(batch => batch.id === change.target));
  const subjectHistory = subject && [change, ...(subject.history ?? [])];
  try {
    localStorage.setItem(demoStateKey, JSON.stringify({
      products,
      orders: orders.map(order => order === subject ? { ...order, history: subjectHistory } : order),
      stockLog,
      cycleSubtotal, scenario, announcements, videos, ledger, operations: history,
      batches: batches.map(batch => batch === subject ? { ...batch, history: subjectHistory } : batch),
      cart: [...cart],
    }));
    if (subject) subject.history = subjectHistory;
    operations = history;
    return true;
  } catch {
    return false;
  }
}

function onDemoStateChange(render) {
  window.addEventListener('storage', event => {
    if (event.key !== demoStateKey && event.key !== null) return;
    loadDemoState();
    render();
  });
}

function resetDemoData() {
  try {
    localStorage.removeItem(demoStateKey);
    localStorage.removeItem(demoWelcomeKey);
    return true;
  } catch {
    return false;
  }
}

function demoStock(product) {
  return scenario === "soldout" && product.id === "squid" ? 0 : product.stock;
}

function reportLink(order) {
  return `./index.html#report=${order.reportToken}`;
}

function demoOrderStatus(order) {
  if (order.cancelledAt) return '已取消';
  if (order.refundBlocked) return '退款異常';
  if (order.shipped) return '已模擬出貨';
  if (order.report?.status === 'verified') return '匯款已核對';
  if (order.paid) return '已模擬付款';
  if (order.report?.status === 'pending') return '匯款待核對';
  if (order.report?.status === 'mismatch') return '匯款不符，待重新回報';
  return '待模擬付款';
}

loadDemoState();
