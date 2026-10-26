(function (root) {
  'use strict';
  function fail(code) { throw new Error(code); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonical(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function date(value) {
    var s = String(value || '').trim().replace(/\//g, '-');
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3], dt = new Date(Date.UTC(y, mo - 1, d));
    return y >= 2000 && y <= 2199 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
      ? m[1] + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0') : '';
  }
  function range(order) {
    // The operator chose expectedShippingDate. Never substitute creation,
    // actual shipping, or a requested batch date for an absent scheduled date.
    var raw = String(order.expectedShippingDate || '').trim(), one = date(raw);
    if (one) return {start: one, end: one};
    var parts = raw.split(/\s*(?:～|~|至)\s*/);
    if (parts.length === 2 && date(parts[0]) && date(parts[1]) && date(parts[0]) <= date(parts[1])) return {start: date(parts[0]), end: date(parts[1])};
    return null;
  }
  function normalizeSeason(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('SEASON_INVALID');
    var s = {id: String(input.id || ''), name: String(input.name || '').trim(), start: date(input.start), end: date(input.end), basis: 'expectedShippingDate'};
    if (!/^season_[a-f0-9]{32}$/.test(s.id) || !s.name || Array.from(s.name).length > 60 || /[\x00-\x1f]/.test(s.name) || !s.start || !s.end || s.start > s.end || (input.basis && input.basis !== s.basis)) fail('SEASON_INVALID');
    return s;
  }
  function emptyState() { return {schemaVersion: 1, revision: 0, seasons: [], archives: [], operations: {}, audit: []}; }
  function state(value) {
    var s = value == null ? emptyState() : copy(value);
    if (s.schemaVersion !== 1 || !Number.isInteger(s.revision) || s.revision < 0 || !Array.isArray(s.seasons) || !Array.isArray(s.archives) || !s.operations || typeof s.operations !== 'object' || !Array.isArray(s.audit)) fail('SEASON_STATE_INVALID');
    var ids = new Set();
    s.seasons.forEach(function (item) { normalizeSeason(item); if (ids.has(item.id)) fail('SEASON_STATE_INVALID'); ids.add(item.id); });
    var used = new Set();
    s.archives.forEach(function (a) {
      if (!/^archive_[a-f0-9]{32}$/.test(a.id) || !ids.has(a.seasonId) || !['archived', 'restored'].includes(a.status) || !Array.isArray(a.orderNos) || a.orderNos.length !== a.count || new Set(a.orderNos).size !== a.count || !/^[a-f0-9]{64}$/.test(a.checksum || '')) fail('SEASON_STATE_INVALID');
      if (a.status === 'archived') a.orderNos.forEach(function (id) { if (used.has(id)) fail('SEASON_STATE_INVALID'); used.add(id); });
    });
    return s;
  }
  function index(s) {
    var map = Object.create(null);
    s.archives.filter(function (a) { return a.status === 'archived'; }).forEach(function (a) { a.orderNos.forEach(function (id) { map[id] = a.id; }); });
    return map;
  }
  function validateOrders(orders) {
    if (!Array.isArray(orders)) fail('SEASON_ORDERS_INVALID');
    var seen = new Set();
    orders.forEach(function (o) { if (!o || typeof o.orderNo !== 'string' || !o.orderNo.trim() || seen.has(o.orderNo)) fail('SEASON_ORDERS_INVALID'); seen.add(o.orderNo); });
  }
  function money(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))) return null;
    var n = Number(value), cents = Math.round(n * 100);
    return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(cents) && Math.abs(n * 100 - cents) < 0.00001 ? cents : null;
  }
  function total(orders) {
    var r = {count: orders.length, shippedCount: 0, cancelledCount: 0, amount: 0, cancelledAmount: 0}, amount = 0, cancelled = 0;
    orders.forEach(function (o) {
      var cents = money(o.finalAmount); if (cents == null) fail('SEASON_AMOUNT_INVALID');
      if (o.orderStatus === '已取消') { r.cancelledCount++; cancelled += cents; }
      else { if (o.orderStatus === '已寄出') r.shippedCount++; amount += cents; }
    });
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(cancelled)) fail('SEASON_AMOUNT_INVALID');
    r.amount = amount / 100; r.cancelledAmount = cancelled / 100; return r;
  }
  function preview(s, definition, orders, digest) {
    s = state(s); var season = normalizeSeason(definition); validateOrders(orders);
    var archived = index(s), rows = [], reasons = {unscheduled: 0, crossesSeason: 0, unfinished: 0, notificationPending: 0, amountInvalid: 0, groupIncomplete: 0, alreadyArchived: 0, outsideSeason: 0};
    var groups = Object.create(null);
    orders.forEach(function (o) { if (o.groupOrderId) (groups[o.groupOrderId] || (groups[o.groupOrderId] = [])).push(o); });
    orders.forEach(function (o) {
      var r = range(o), reason = '';
      if (archived[o.orderNo]) reason = 'alreadyArchived';
      else if (!r) reason = 'unscheduled';
      else if (r.end < season.start || r.start > season.end) reason = 'outsideSeason';
      else if (r.start < season.start || r.end > season.end) reason = 'crossesSeason';
      else if (!['已寄出', '已取消'].includes(o.orderStatus)) reason = 'unfinished';
      else if (['pending_send', 'failed', 'manual_required', 'review_required'].includes(o.notificationStatus)) reason = 'notificationPending';
      else if (money(o.finalAmount) == null) reason = 'amountInvalid';
      rows.push({order: o, reason: reason});
    });
    var byId = Object.create(null); rows.forEach(function (r) { byId[r.order.orderNo] = r; });
    // Keep a whole group in operations if any child still requires attention
    // or belongs to another season. Do not archive a partial settlement group.
    Object.keys(groups).forEach(function (key) {
      if (groups[key].some(function (o) { return !!byId[o.orderNo].reason; })) groups[key].forEach(function (o) { if (!byId[o.orderNo].reason) byId[o.orderNo].reason = 'groupIncomplete'; });
    });
    rows.forEach(function (r) { if (r.reason) reasons[r.reason]++; });
    var eligible = rows.filter(function (r) { return !r.reason; }).map(function (r) { return copy(r.order); }).sort(function (a, b) { return a.orderNo.localeCompare(b.orderNo); });
    var held = rows.filter(function (r) { return r.reason && !['outsideSeason', 'alreadyArchived'].includes(r.reason); }).map(function (r) { return {order: copy(r.order), reason: r.reason}; });
    return {season: season, revision: s.revision, sourceCount: orders.length, eligible: eligible, held: held, reasons: reasons, summary: total(eligible), previewHash: digest(canonical({revision: s.revision, season: season, orders: orders.slice().sort(function (a, b) { return a.orderNo.localeCompare(b.orderNo); })}))};
  }
  function createService(repository, options) {
    var digest = options.digest, now = options.now || function () { return new Date().toISOString(); };
    function authorized(actor) { if (!actor || !actor.uid || actor.allowed !== true) fail('ADMIN_SESSION_REQUIRED'); }
    function read() { return state(repository.readState()); }
    function locked(fn) { return repository.withLock(fn); }
    function save(s, actor, event, target) {
      s.revision++; s.audit.push({at: now(), actor: actor.uid, event: event, target: target, revision: s.revision});
      // No silent truncation of audit, operation receipts, or memberships.
      if (canonical(s).length > 200000) fail('SEASON_CAPACITY_REVIEW_REQUIRED');
      repository.writeState(s); return s.revision;
    }
    function ready() { if (options.executionEnabled !== true) fail('SEASON_ARCHIVE_LOCKED'); }
    function revision(s, expected) { if (expected !== s.revision) fail('SEASON_REVISION_CONFLICT'); }
    function operation(input, kind, s) {
      if (!/^op_[a-f0-9]{32}$/.test(input.operationId || '')) fail('SEASON_OPERATION_INVALID');
      var key = digest(canonical({kind: kind, seasonId: input.seasonId || '', archiveId: input.archiveId || '', previewHash: input.previewHash || ''})), old = s.operations[input.operationId];
      if (old && old.key !== key) fail('SEASON_OPERATION_CONFLICT');
      return {key: key, result: old && old.result};
    }
    function verifyArchive(a) {
      var data = repository.readArchive(a.id);
      if (!data || data.seasonId !== a.seasonId || !Array.isArray(data.orders) || data.orders.length !== a.count || digest(canonical(data)) !== a.checksum) fail('SEASON_ARCHIVE_INTEGRITY_FAILED');
      validateOrders(data.orders);
      if (canonical(data.orders.map(function (o) { return o.orderNo; }).sort()) !== canonical(a.orderNos.slice().sort())) fail('SEASON_ARCHIVE_INTEGRITY_FAILED');
      return data;
    }
    return Object.freeze({
      list: function (actor) { authorized(actor); var s = read(); return {revision: s.revision, seasons: s.seasons, archives: s.archives.map(function (a) { var b = copy(a); delete b.orderNos; return b; }), executionEnabled: options.executionEnabled === true}; },
      saveSeason: function (actor, input) {
        authorized(actor); var season = normalizeSeason(input.season);
        return locked(function () {
          var s = read(), old = s.seasons.find(function (x) { return x.id === season.id; });
          if (old && canonical(old) === canonical(season)) return {revision: s.revision, season: old, reused: true};
          revision(s, input.expectedRevision);
          if (s.archives.some(function (a) { return a.seasonId === season.id && a.status === 'archived'; })) fail('SEASON_ALREADY_ARCHIVED');
          if (s.seasons.some(function (x) { return x.id !== season.id && season.start <= x.end && season.end >= x.start; })) fail('SEASON_OVERLAP');
          if (!old && s.seasons.length >= 100) fail('SEASON_CAPACITY_REVIEW_REQUIRED');
          if (old) s.seasons[s.seasons.indexOf(old)] = season; else s.seasons.push(season);
          return {revision: save(s, actor, 'season_saved', season.id), season: season};
        });
      },
      preview: function (actor, input) {
        authorized(actor); var s = read(); revision(s, input.expectedRevision);
        var season = s.seasons.find(function (x) { return x.id === input.seasonId; }); if (!season) fail('SEASON_NOT_FOUND');
        var p = preview(s, season, repository.readOrders(), digest);
        p.executionEnabled = options.executionEnabled === true; return p;
      },
      archive: function (actor, input) {
        authorized(actor); ready();
        return locked(function () {
          var s = read(), op = operation(input, 'archive', s); if (op.result) return Object.assign({reused: true}, op.result);
          revision(s, input.expectedRevision);
          var season = s.seasons.find(function (x) { return x.id === input.seasonId; }); if (!season) fail('SEASON_NOT_FOUND');
          if (s.archives.some(function (a) { return a.seasonId === season.id && a.status === 'archived'; })) fail('SEASON_ALREADY_ARCHIVED');
          var taipeiToday = new Date(new Date(now()).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
          if (season.end >= taipeiToday) fail('SEASON_NOT_ENDED');
          var p = preview(s, season, repository.readOrders(), digest);
          if (p.previewHash !== input.previewHash) fail('SEASON_PREVIEW_CHANGED');
          if (!p.eligible.length) fail('SEASON_ARCHIVE_EMPTY');
          var id = input.operationId.replace(/^op_/, 'archive_'), data = {schemaVersion: 1, seasonId: season.id, season: season, orders: p.eligible};
          var a = {id: id, seasonId: season.id, status: 'archived', archivedAt: now(), archivedBy: actor.uid, count: p.eligible.length, summary: p.summary, checksum: digest(canonical(data)), orderNos: p.eligible.map(function (o) { return o.orderNo; })};
          // Immutable content is verified before a single registry publication.
          // Lost replies reuse the receipt; orphaned preparation never hides data.
          repository.writeArchive(id, data); verifyArchive(a);
          s.archives.push(a); var result = {archiveId: id, count: a.count, revision: s.revision + 1};
          s.operations[input.operationId] = {key: op.key, result: result}; save(s, actor, 'season_archived', id); return result;
        });
      },
      restore: function (actor, input) {
        authorized(actor); ready();
        return locked(function () {
          var s = read(), op = operation(input, 'restore', s); if (op.result) return Object.assign({reused: true}, op.result);
          revision(s, input.expectedRevision); var a = s.archives.find(function (x) { return x.id === input.archiveId; });
          if (!a || a.status !== 'archived') fail('SEASON_ARCHIVE_NOT_FOUND');
          verifyArchive(a); var current = repository.readOrders(); validateOrders(current);
          var present = new Set(current.map(function (o) { return o.orderNo; }));
          if (a.orderNos.some(function (id) { return !present.has(id); })) fail('SEASON_SOURCE_MISSING');
          a.status = 'restored'; a.restoredAt = now(); a.restoredBy = actor.uid;
          var result = {archiveId: a.id, count: a.count, revision: s.revision + 1};
          s.operations[input.operationId] = {key: op.key, result: result}; save(s, actor, 'season_restored', a.id); return result;
        });
      },
      history: function (actor, input) {
        authorized(actor); var s = read(); revision(s, input.expectedRevision);
        var query = String(input.query || '').trim().toLocaleLowerCase(), start = input.start ? date(input.start) : '', end = input.end ? date(input.end) : '';
        if (query.length > 100 || (input.start && !start) || (input.end && !end) || (start && end && start > end)) fail('SEASON_FILTER_INVALID');
        var archives = s.archives.filter(function (a) { return a.status === 'archived' && (!input.seasonId || a.seasonId === input.seasonId); }), rows = [];
        archives.forEach(function (a) { var data = verifyArchive(a); data.orders.forEach(function (o) { rows.push(Object.assign({}, o, {archiveSeasonName: data.season.name, archiveId: a.id})); }); });
        rows = rows.filter(function (o) { var r = range(o); return (!start || (r && r.end >= start)) && (!end || (r && r.start <= end)) && (!query || [o.orderNo, o.buyerName, o.buyerPhone, o.recipientName, o.recipientPhone].join(' ').toLocaleLowerCase().includes(query)); }).sort(function (a, b) { return String(b.expectedShippingDate).localeCompare(String(a.expectedShippingDate)) || a.orderNo.localeCompare(b.orderNo); });
        var size = input.exportAll === true ? Math.max(1, rows.length) : 20, page = input.exportAll === true ? 1 : Number(input.page || 1);
        if (!Number.isInteger(page) || page < 1) fail('SEASON_FILTER_INVALID');
        if (input.exportAll === true && rows.length > 5000) fail('SEASON_EXPORT_TOO_LARGE');
        var totalPages = Math.max(1, Math.ceil(rows.length / size)); page = Math.min(page, totalPages);
        return {revision: s.revision, orders: rows.slice((page - 1) * size, page * size), totalCount: rows.length, page: page, pageSize: size, totalPages: totalPages, complete: input.exportAll === true, summary: total(rows)};
      },
      activeOrders: function (actor) { authorized(actor); var s = read(), membership = index(s), orders = repository.readOrders(); validateOrders(orders); return orders.filter(function (o) { return !membership[o.orderNo]; }); },
      assertMutable: function (actor, orderNos) { authorized(actor); var membership = index(read()); if (orderNos.some(function (id) { return !!membership[id]; })) fail('SEASON_ORDER_ARCHIVED'); return true; }
    });
  }
  var columns = [['archiveSeasonName', '產季'], ['orderNo', '訂單編號'], ['createdAt', '成立時間'], ['expectedShippingDate', '預計出貨日期'], ['actualShippingDate', '實際出貨日期'], ['orderStatus', '訂單狀態'], ['buyerName', '訂購人'], ['buyerPhone', '訂購人電話'], ['recipientName', '收件人'], ['recipientPhone', '收件人電話'], ['recipientAddress', '收件地址'], ['itemsSummary', '商品'], ['totalBoxes', '箱數'], ['shippingFee', '運費'], ['discountAmount', '折扣'], ['finalAmount', '訂單金額'], ['paymentMethod', '付款方式'], ['paymentStatus', '付款狀態'], ['trackingNo', '宅配單號'], ['customerNote', '客戶備註'], ['adminNote', '管理備註']];
  function csv(orders) {
    function cell(v) { var s = String(v == null ? '' : v); if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
    return '\uFEFF' + [columns.map(function (c) { return cell(c[1]); }).join(',')].concat(orders.map(function (o) { return columns.map(function (c) { return cell(o[c[0]]); }).join(','); })).join('\r\n') + '\r\n';
  }
  root.SeasonArchiveCore = Object.freeze({createService: createService, preview: preview, normalizeSeason: normalizeSeason, emptyState: emptyState, validateState: state, canonical: canonical, date: date, range: range, csv: csv, columns: columns});
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SeasonArchiveCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
