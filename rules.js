'use strict';

globalThis.DemoRules = Object.freeze({
  freight(amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Invalid goods amount');
    return amount <= 2000 ? 130 : amount < 3000 ? 60 : 0;
  },
  cycle(scenario) {
    const scenarios = {
      open: { title: '開賣中', clock: '週二 12:00（台北）', orderOpen: true, startingSpend: 0 },
      settlement: { title: '結算中，暫停新訂單', clock: '週二 06:00（台北）', orderOpen: false, startingSpend: 0 },
      soldout: { title: '現流透抽售罄', clock: '週三 12:30（台北）', orderOpen: true, startingSpend: 0 },
      free: { title: '本期已達免運', clock: '週一 18:00（台北）', orderOpen: true, startingSpend: 3000 },
    };
    return scenarios[scenario] ?? scenarios.open;
  },
  shipmentProblem(order) {
    if (order.cancelledAt) return '訂單已取消';
    if (!order.paid) return '尚未核對付款';
    if (order.refundBlocked) return '退款異常，停止出貨';
    if (!order.report?.recipient || order.report.status !== 'verified') return '缺少已核對的收件資料';
    if (order.batchId) return '此單已有出貨批次';
    if (order.shipped) return '此單已標記出貨';
    return '';
  },
  canShip(order) {
    return Boolean(order.paid && !order.refundBlocked && order.report?.status === 'verified' &&
      order.report.recipient && order.batchId && !order.shipped && !order.cancelledAt);
  },
});
