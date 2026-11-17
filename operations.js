'use strict';

globalThis.DemoOperations = (() => {
  const batchStages = { picking: '待揀貨', picked: '已揀貨', ready: '待寄件', sent: '已寄件', complete: '已完成' };
  const categories = {
    other: '其他收入', purchase: '進貨', logistics: '物流', packing: '包材',
    fee: '平台或手續費', expense: '其他費用', refund: '退款', adjustment: '營運調整支出',
  };
  const stages = Object.keys(batchStages);
  const taipei = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' });
  const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const date = value => value && Number.isFinite(Date.parse(value)) ? taipei.format(new Date(value)).slice(0, 10) : '';

  function cycleId(time) {
    if (!date(time)) return '';
    const local = taipei.format(new Date(time));
    const day = new Date(local.slice(0, 10) + 'T00:00:00Z');
    let offset = (day.getUTCDay() + 5) % 7;
    if (!offset && local.slice(11) < '12:00') offset = 7;
    day.setUTCDate(day.getUTCDate() - offset);
    return 'W-' + day.toISOString().slice(0, 10);
  }

  function inDates(day, { from = '', to = '' } = {}) {
    return (!from || (day && day >= from)) && (!to || (day && day <= to));
  }

  function orderInScope(order, scope) {
    return Boolean(inDates(date(order.createdAt), scope) && (!scope.cycle || (order.weekly_cycle_id || 'unknown') === scope.cycle));
  }

  function orderState(order, batch) {
    if (order.cancelledAt) return 'cancelled';
    if (order.refundBlocked || order.report?.status === 'mismatch' || batch?.exception) return 'blocked';
    if (order.shipped) return 'shipped';
    if (order.batchId) return 'shipping';
    if (order.paid) return 'paid';
    if (order.report?.status === 'pending') return 'pending';
    return 'unpaid';
  }

  function receiver(order, presets) {
    return order.lockedRecipient ?? order.recipientDetails ?? presets[order.report?.recipient] ?? null;
  }

  function validReceiver(recipient) {
    return Boolean(recipient?.name?.trim() && /^\d{10}$/.test(recipient.phone) && recipient.seven?.trim() &&
      recipient.family?.trim() && [recipient.sevenCode, recipient.familyCode].every(code => !code || /^\d{3,8}$/.test(code)));
  }

  const maskedPhone = phone => /^\d{10}$/.test(phone ?? '') ? phone.slice(0, 4) + '••••' + phone.slice(-2) : '—';

  function batchProblem(batch, assigned) {
    if (batch.exception) return '異常待處理';
    if (!assigned.length) return '批次尚無訂單';
    if (assigned.some(order => !order.paid || order.report?.status !== 'verified' || order.refundBlocked ||
        order.cancelledAt || !validReceiver(order.lockedRecipient))) return '批次含付款、退款或收件異常';
    return '';
  }

  function advanceBatch(batch, assigned) {
    if (batchProblem(batch, assigned)) return '';
    const index = stages.indexOf(batch.status);
    if (index < 0 || index === stages.length - 1) return '';
    if (batch.status === 'sent' && assigned.some(order => !order.shipped)) return '';
    return stages[index + 1];
  }

  function validateEntry(entry, records, orders, currentId) {
    if (!validDate(entry.date) || !Object.hasOwn(categories, entry.category) || !integer(entry.amount) ||
      entry.amount > 999999999 || (!entry.amount && entry.category !== 'logistics') || !entry.note?.trim()) return '請填寫有效日期、分類、金額與備註。';
    const order = orders.find(item => item.id === entry.orderId);
    if (entry.orderId && !order) return '找不到對應訂單。';
    if (entry.category === 'other' && entry.orderId) return '訂單收款只由人工核帳產生。其他收入不得連結訂單。';
    if (['refund', 'logistics'].includes(entry.category) && !order?.paid) return '物流與退款需連結已核帳訂單。';
    if (entry.category === 'refund') {
      if (!order.refundBlocked) return '請先在訂單標記退款異常。';
      const previous = records.filter(row => row.id !== currentId && row.orderId === order.id && row.category === 'refund');
      if (sum(previous, row => row.amount) + entry.amount > order.total) return '累計退款不得大於已核帳金額。';
    }
    return '';
  }

  function cashRows(orders, manual) {
    const receipts = orders.filter(order => order.paid && integer(order.total)).map(order => ({
      id: 'receipt-' + order.id, category: 'receipt', direction: 'in', source: '人工核帳', orderId: order.id,
      amount: order.total, date: date(order.paidAt), createdAt: order.paidAt, note: '示範訂單核帳入帳',
    }));
    return [...receipts, ...manual.map(row => ({
      ...row, source: '手動', direction: row.category === 'other' ? 'in' : 'out',
    }))];
  }

  function profit(orders, entries, filters = {}) {
    const merchandiseOnly = Boolean(filters.type || filters.product);
    const lines = orders.flatMap(order => order.items.filter(item =>
      (!filters.type || item.type === filters.type) && (!filters.product || item.id === filters.product))
      .map(item => ({ order, item, revenue: integer(item.unitPrice) ? item.unitPrice * item.quantity : null,
        cost: integer(item.unitCost) ? item.unitCost * item.quantity : null })));
    const validOrders = orders.filter(order => !order.cancelledAt);
    const paid = validOrders.filter(order => order.paid);
    const paidLines = lines.filter(line => line.order.paid && !line.order.cancelledAt);
    const records = merchandiseOnly ? [] : entries;
    const expense = category => sum(records.filter(row => row.category === category), row => row.amount);
    const missingCosts = paidLines.filter(line => line.cost === null || line.revenue === null).length;
    const missingShipping = merchandiseOnly ? 0 : paid.filter(order =>
      !integer(order.shipping) || (order.shipped && !records.some(row => row.orderId === order.id && row.category === 'logistics'))).length;
    const pendingShipping = merchandiseOnly ? 0 : paid.filter(order =>
      !order.shipped && !records.some(row => row.orderId === order.id && row.category === 'logistics')).length;
    const revenue = sum(paidLines, line => line.revenue ?? 0);
    const cost = sum(paidLines, line => line.cost ?? 0);
    const freight = merchandiseOnly ? 0 : sum(paid, order => integer(order.shipping) ? order.shipping : 0);
    const logistics = expense('logistics');
    const operating = expense('packing') + expense('fee') + expense('expense');
    const refunds = expense('refund');
    const adjustments = expense('adjustment');
    const other = expense('other');
    const gross = missingCosts ? null : revenue - cost;
    return {
      lines, revenue, cost, freight, logistics, operating, refunds, adjustments, other, gross, missingCosts, missingShipping, pendingShipping,
      sales: merchandiseOnly ? sum(lines.filter(line => !line.order.cancelledAt), line => line.revenue ?? 0) : sum(validOrders, order => order.total),
      unpaid: merchandiseOnly ? sum(lines.filter(line => !line.order.paid && !line.order.cancelledAt), line => line.revenue ?? 0) :
        sum(validOrders.filter(order => !order.paid), order => order.total),
      received: merchandiseOnly ? revenue : sum(paid, order => order.total),
      net: merchandiseOnly || gross === null || missingShipping || pendingShipping ? null :
        gross + freight + other - logistics - operating - refunds - adjustments,
    };
  }

  function csv(rows) {
    const cell = value => {
      let text = String(value ?? '');
      if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  return Object.freeze({ batchStages, categories, sum, date, cycleId, inDates, orderInScope, orderState,
    receiver, validReceiver, maskedPhone, batchProblem, advanceBatch, validateEntry, cashRows, profit, csv });
})();
