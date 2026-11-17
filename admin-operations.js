'use strict';

const Ops = DemoOperations;
const opsMoney = amount => amount == null ? '待補資料' : 'NT$' + Number(amount).toLocaleString('zh-TW');
const opsLabels = { unpaid: '未付款', pending: '待核帳', paid: '已付款', shipping: '出貨中', shipped: '已出貨', cancelled: '已取消', blocked: '異常' };
const opsCategory = category => category === 'receipt' ? '已核帳顧客收款' : Ops.categories[category];
const opsTime = value => value ? new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value)) : '未記錄';
let ledgerEditing = '';

function opsList(id, rows, empty = '目前沒有符合條件的資料。') {
  $(id).replaceChildren(...(rows.length ? rows : [empty]).map(text => adminRow(text)));
}

function opsOptions(id, pairs, placeholder) {
  const select = $(id);
  const selected = select.value;
  select.replaceChildren(...(placeholder ? [new Option(placeholder, '')] : []),
    ...pairs.map(([value, name]) => new Option(name, value)));
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function opsTable(id, rows, columns) {
  $(id).replaceChildren(...(rows.length ? rows.map(cells => {
    const tr = document.createElement('tr');
    for (const cell of cells) {
      const td = document.createElement('td');
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell;
      tr.append(td);
    }
    return tr;
  }) : [document.createElement('tr')]));
  if (!rows.length) {
    const cell = document.createElement('td');
    cell.colSpan = columns;
    cell.textContent = '目前沒有符合條件的資料。';
    $(id).firstChild.append(cell);
  }
}

function opsScope() {
  return { from: $('ops-from').value, to: $('ops-to').value, cycle: $('ops-cycle').value };
}

function opsGroup(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
  }
  return result;
}

function relatedRecords(cohort, scope, orderFilter) {
  const ids = new Set(cohort.map(order => order.id));
  return ledger.filter(row => row.orderId ? ids.has(row.orderId) :
    !scope.cycle && !orderFilter && Ops.inDates(row.date, scope));
}

function renderOpsSections() {
  const cycleIds = [...new Set(orders.map(entry => entry.weekly_cycle_id ?? 'unknown'))].sort();
  opsOptions('ops-cycle', cycleIds.map(id => [id, id === 'unknown' ? '舊單未記錄週期' : id]), '全部週期');
  const scope = opsScope();
  $('ops-filter-message').textContent = scope.from && scope.to && scope.from > scope.to ? '起日不能晚於迄日。' : '';
  const scoped = orders.filter(entry => Ops.orderInScope(entry, scope));
  const summary = Ops.profit(scoped, relatedRecords(scoped, scope));
  const states = scoped.map(entry => Ops.orderState(entry, batches.find(batch => batch.id === entry.batchId)));
  const count = state => states.filter(value => value === state).length;
  renderMetrics('admin-summary', [
    ['模擬訂單', scoped.length], ['訂單總額（排除取消）', opsMoney(summary.sales)],
    ['待付款', count('unpaid')], ['待核對匯款', count('pending')],
    ['已付款（含出貨）', scoped.filter(entry => entry.paid && !entry.cancelledAt).length],
    ['待出貨', scoped.filter(entry => entry.paid && !entry.shipped && !entry.cancelledAt && !entry.refundBlocked &&
      !batches.find(batch => batch.id === entry.batchId)?.exception).length],
    ['已出貨', scoped.filter(entry => entry.shipped).length], ['取消／異常', count('cancelled') + count('blocked')],
    ['已核帳商品收入', opsMoney(summary.revenue)], ['商品毛利', opsMoney(summary.gross)], ['營運淨利', opsMoney(summary.net)],
  ]);
  opsList('ops-low-stock', products.filter(product => product.status === 'active' && demoStock(product) <= 2)
    .map(product => product.name + '｜剩餘 ' + demoStock(product) + ' 份'), '目前沒有低庫存警示。');
  const scopedIds = new Set(scoped.map(entry => entry.id));
  opsList('ops-recent', operations.filter(entry => Ops.inDates(Ops.date(entry.time), scope) &&
    (!scope.cycle || scopedIds.has(entry.target))).slice(0, 5)
    .map(entry => `${opsTime(entry.time)}｜${entry.type}｜${entry.target}`), '目前沒有展示操作紀錄。');
  renderOpsProfit(scoped, scope);
  renderLedger();
}

function renderOpsProfit(scoped, scope) {
  const type = $('profit-type').value;
  const known = new Map([...products, ...scoped.flatMap(entry => entry.items)]
    .filter(item => !type || item.type === type).map(item => [item.id, item.name]));
  opsOptions('profit-product', [...known], '全部商品');
  opsOptions('profit-order', scoped.map(entry => [entry.id, entry.id]), '全部訂單');
  const orderFilter = $('profit-order').value;
  const cohort = scoped.filter(entry => !orderFilter || entry.id === orderFilter);
  const filters = { type, product: $('profit-product').value };
  const merchandiseOnly = Boolean(filters.type || filters.product);
  const records = relatedRecords(cohort, scope, orderFilter);
  const report = Ops.profit(cohort, records, filters);
  const scopedAmount = value => merchandiseOnly ? '整單項目不分攤' : opsMoney(value);
  renderMetrics('admin-profit', [
    [merchandiseOnly ? '商品銷售額' : '訂單銷售總額', opsMoney(report.sales)], ['未核帳銷售', opsMoney(report.unpaid)],
    [merchandiseOnly ? '已核帳商品收入' : '已核帳收款', opsMoney(report.received)],
    ...(merchandiseOnly ? [] : [['已核帳商品收入', opsMoney(report.revenue)]]), ['商品成本', opsMoney(report.missingCosts ? null : report.cost)],
    ['商品毛利', opsMoney(report.gross)], ['顧客支付運費', scopedAmount(report.freight)],
    ['已記錄實際物流費', scopedAmount(report.logistics)], ['其他營運費用', scopedAmount(report.operating)],
    ['已記錄退款', scopedAmount(report.refunds)], ['調整支出', scopedAmount(report.adjustments)],
    ['其他收入', scopedAmount(report.other)], ['示範營運淨利', scopedAmount(report.net)],
  ]);
  const warnings = [
    report.missingCosts && `${report.missingCosts} 筆品項缺成本或售價快照`,
    report.missingShipping && `${report.missingShipping} 筆訂單缺運費或已出貨但缺物流費`,
    report.pendingShipping && `${report.pendingShipping} 筆待出貨訂單尚未登記物流費`,
    cohort.some(entry => !entry.createdAt) && '含成立日待補的舊單',
    cohort.some(entry => entry.paid && !entry.paidAt) && '含核帳日待補的舊單',
  ].filter(Boolean);
  $('profit-warning').textContent = warnings.length ? '資料不完整｜' + warnings.join('、') : '';
  opsTable('profit-lines', report.lines.map(({ order, item, revenue, cost }) =>
    [order.id, item.name, productTypeLabel[item.type] ?? '未記錄', item.quantity, opsMoney(revenue), opsMoney(cost), demoOrderStatus(order)]), 7);
  const paidLines = report.lines.filter(line => line.order.paid && !line.order.cancelledAt);
  const days = [...opsGroup(paidLines, line => Ops.date(line.order.createdAt) || '未記錄日期')].sort();
  opsList('profit-trend', days.map(([day, lines]) => day + '｜' + opsMoney(Ops.sum(lines, line => line.revenue ?? 0))));
  const rank = [...opsGroup(paidLines, line => line.item.id)].filter(([, lines]) =>
    lines.every(line => line.revenue !== null && line.cost !== null)).map(([, lines]) => ({
    name: lines[0].item.name, amount: Ops.sum(lines, line => line.revenue - line.cost),
  })).sort((left, right) => right.amount - left.amount);
  opsList('profit-ranking', rank.map(row => row.name + '｜' + opsMoney(row.amount)));
  opsList('profit-cycles', [...opsGroup(cohort, entry => entry.weekly_cycle_id || '舊單週期未記錄')].sort().map(([cycle, entries]) => {
    const snapshot = Ops.profit(entries, relatedRecords(entries, { ...scope, cycle }, orderFilter), filters);
    return `${cycle}｜已核帳 ${opsMoney(snapshot.received)}｜毛利 ${opsMoney(snapshot.gross)}｜淨利 ${scopedAmount(snapshot.net)}`;
  }));
  opsList('profit-records', merchandiseOnly ? [] : records.filter(row => row.category !== 'purchase').map(row =>
    `${row.id}｜${row.date}｜${opsCategory(row.category)}｜${opsMoney(row.amount)}｜${row.orderId || '未連結訂單'}｜${row.note}`));
}

function visibleLedger() {
  const range = { from: $('ledger-from').value, to: $('ledger-to').value };
  const direction = $('ledger-direction').value;
  const category = $('ledger-filter-category').value;
  const term = $('ledger-query').value.trim().toLowerCase();
  return Ops.cashRows(orders, ledger).filter(row => Ops.inDates(row.date, range) &&
    (!direction || row.direction === direction) && (!category || row.category === category) &&
    [row.id, row.note, row.orderId, row.source, opsCategory(row.category)].join(' ').toLowerCase().includes(term))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function renderLedger() {
  opsOptions('ledger-order', orders.map(entry => [entry.id, entry.id]), '無');
  const rows = visibleLedger();
  const income = Ops.sum(rows.filter(row => row.direction === 'in'), row => row.amount);
  const expenses = Ops.sum(rows.filter(row => row.direction === 'out'), row => row.amount);
  renderMetrics('ledger-summary', [['現金收入', opsMoney(income)], ['現金支出', opsMoney(expenses)],
    ['現金淨流量', opsMoney(income - expenses)], ['入帳日期待補', rows.filter(row => !row.date).length]]);
  opsTable('ledger-rows', rows.map(row => {
    const controls = document.createElement('div');
    controls.className = 'admin-actions screen-only';
    if (row.source === '手動') controls.append(
      adminAction('edit-' + row.id, '更正', false, () => editLedger(row)),
      adminAction('history-' + row.id, '更正歷史', false, () => viewLedgerHistory(row)),
    );
    return [row.date || '未記錄', `${row.direction === 'in' ? '收入' : '支出'}｜${opsCategory(row.category)}`,
      opsMoney(row.direction === 'in' ? row.amount : -row.amount), `${row.source}｜${row.orderId || '—'}`, row.note, opsTime(row.createdAt), controls];
  }), 7);
}

function editLedger(row) {
  ledgerEditing = row?.id ?? '';
  $('ledger-date').value = row?.date ?? Ops.date(new Date().toISOString());
  $('ledger-category').value = row?.category ?? 'other';
  $('ledger-amount').value = row?.amount ?? '';
  $('ledger-order').value = row?.orderId ?? '';
  $('ledger-note').value = row?.note ?? '';
  $('ledger-cancel').hidden = !row;
  $('ledger-save').textContent = row ? '儲存更正' : '新增流水帳';
  if (row) $('ledger-note').focus();
}

function viewLedgerHistory(row) {
  opsList('ledger-history', [...(row.revisions ?? []), row].map(entry =>
    `${opsTime(entry.updatedAt ?? entry.createdAt)}｜${entry.date}｜${opsCategory(entry.category)}｜${opsMoney(entry.amount)}｜${entry.orderId || '—'}｜${entry.note}`));
  $('ledger-history-dialog').showModal();
}

function printOpsSection(id) {
  document.body.dataset.printSection = id;
  window.print();
}

function initAdminOperations() {
  opsOptions('ledger-category', Object.entries(Ops.categories));
  opsOptions('ledger-filter-category', [['receipt', opsCategory('receipt')], ...Object.entries(Ops.categories)], '全部分類');
  editLedger(null);
  for (const id of ['ops-from', 'ops-to', 'ops-cycle', 'profit-type', 'profit-product', 'profit-order', 'ledger-from',
    'ledger-to', 'ledger-direction', 'ledger-filter-category', 'batch-filter']) $(id).addEventListener('change', renderAdmin);
  for (const id of ['ledger-query', 'batch-search']) $(id).addEventListener('input', renderAdmin);
  $('ops-reset-filters').addEventListener('click', () => {
    for (const id of ['ops-from', 'ops-to', 'ops-cycle', 'profit-type', 'profit-product', 'profit-order']) $(id).value = '';
    renderAdmin();
  });
  $('ledger-form').addEventListener('submit', event => {
    event.preventDefault();
    const entry = { date: $('ledger-date').value, category: $('ledger-category').value, amount: $('ledger-amount').valueAsNumber,
      orderId: $('ledger-order').value, note: $('ledger-note').value.trim() };
    const index = ledger.findIndex(row => row.id === ledgerEditing);
    const previous = ledger[index];
    const problem = Ops.validateEntry(entry, ledger, orders, previous?.id);
    if (problem || (ledgerEditing && !previous)) {
      $('ledger-status').textContent = problem || '這筆帳務已不存在。';
      return;
    }
    const now = new Date().toISOString();
    const record = { ...entry, id: previous?.id ?? 'TX-' + crypto.randomUUID().slice(0, 8),
      createdAt: previous?.createdAt ?? now, updatedAt: now };
    if (previous) {
      const { revisions = [], ...snapshot } = previous;
      record.revisions = [...revisions, snapshot];
      ledger[index] = record;
    } else ledger.push(record);
    if (saveAdminChange(previous ? '更正流水帳' : '新增流水帳', record.id,
      previous ? `${opsCategory(previous.category)} ${opsMoney(previous.amount)}` : '未登記',
      `${opsCategory(record.category)} ${opsMoney(record.amount)}`)) {
      $('ledger-status').textContent = previous ? '已保留舊版並儲存更正。' : '已新增手動帳務。';
      editLedger(null);
    }
    renderAdmin();
  });
  $('ledger-cancel').addEventListener('click', () => editLedger(null));
  $('close-ledger-history').addEventListener('click', () => $('ledger-history-dialog').close());
  $('ledger-export').addEventListener('click', () => {
    const records = visibleLedger().map(row => [row.id, row.date, row.direction === 'in' ? '收入' : '支出', opsCategory(row.category),
      row.direction === 'in' ? row.amount : -row.amount, row.source, row.orderId, row.note, row.createdAt]);
    const content = Ops.csv([['紀錄編號', '日期', '類型', '分類', '金額（NT$）', '來源', '訂單', '備註', '建立時間'], ...records]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = 'demo-cash-ledger.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('print-profit').addEventListener('click', () => printOpsSection('profit'));
  $('print-ledger').addEventListener('click', () => printOpsSection('accounting'));
  addEventListener('afterprint', () => delete document.body.dataset.printSection);
}
