/* =========================================================================
   Dashboard Lilian Mesquita (conta "Rubra") — Tráfego pago (SEGUIDORES / VISITAS AO PERFIL)
   3 abas: Visão Geral · Tráfego Pago · Relatório. Grupos p/ comparação: Todas · E1-DIST · Antiga.
   Dados: window.DASH (data.js) — daily[] (funil/dia) + grain[] (dia × anúncio) + followers[] ({d,gain}).
   Fonte 1: Meta Graph API (insights nível anúncio) — mídia + VISITAS AO PERFIL (campo results).
   Fonte 2: planilha da Lilian — coluna "Seguid." (N) das abas mensais (seguidores lançados à mão, número-verdade).
   CTR sempre de LINK. Imposto ×1,1385 sobre todo gasto. Benchmarks próprios da conta (custo/seguidor ≤ R$2).
   ========================================================================= */
(function () {
  "use strict";
  var D = window.DASH || {};
  var arr = function (x) { return Array.isArray(x) ? x : (x ? [x] : []); };
  var daily = arr(D.daily).slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  var grain = arr(D.grain);
  var followersAll = arr(D.followers);
  var adLinks = D.adLinks || {};   // ad_name -> link do post no Instagram (do criativo)
  var TAX = D.tax || 1.1385;

  /* ---------------------------------------------------------------- formato */
  var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf4 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  function ok(v) { return v !== null && v !== undefined && isFinite(v); }
  function money(v) { return (v < 0 ? '−R$ ' : 'R$ ') + nf2.format(Math.abs(v || 0)); }
  function money0(v) { return (v < 0 ? '−R$ ' : 'R$ ') + nf0.format(Math.round(Math.abs(v || 0))); }
  function int(v) { return nf0.format(Math.round(v || 0)); }
  function pct1(v) { return nf1.format((v || 0) * 100) + '%'; }
  function taxStr(v) { return nf4.format(v || 1); }
  var M = {
    money: function (v) { return ok(v) ? money(v) : '—'; },
    money0: function (v) { return ok(v) ? money0(v) : '—'; },
    int: function (v) { return ok(v) ? int(v) : '—'; },
    pct1: function (v) { return ok(v) ? pct1(v) : '—'; }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function $(id) { return document.getElementById(id); }
  function div(a, b) { return b > 0 ? a / b : null; }

  function dayAdd(ds, n) { var p = ds.split('-'); var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }
  function brDate(ds) { var p = ds.split('-'); return p[2] + '/' + p[1]; }
  function brFull(ds) { var p = ds.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function diffDays(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5); }

  /* ---------------------------------------------------------------- período */
  // range cobre mídia E seguidores manuais (a planilha pode ter dias antes/depois do 1º gasto)
  var folDates = followersAll.map(function (f) { return f.d; }).filter(Boolean).sort();
  var dMin = daily.length ? daily[0].d : '2026-01-01';
  var dMax = daily.length ? daily[daily.length - 1].d : '2026-01-01';
  var minDate = folDates.length && folDates[0] < dMin ? folDates[0] : dMin;
  var maxDate = folDates.length && folDates[folDates.length - 1] > dMax ? folDates[folDates.length - 1] : dMax;
  function firstOfMonth(ds) { return ds.slice(0, 7) + '-01'; }
  function clampD(ds) { return ds < minDate ? minDate : (ds > maxDate ? maxDate : ds); }

  var STATE = {
    from: minDate, to: maxDate, preset: 'all', compare: true, tab: 'overview',
    metric: 'spend', treeSort: { key: 'spend', dir: -1 }, expanded: {}, campGroup: 'all'
  };

  /* ---------------------------------------------------------------- grupo de campanha (comparativo) */
  // edist = campanhas no padrão da agência (E1-DIST) · old = campanha antiga (pré-nomenclatura)
  var GROUP_LABEL = { all: 'Todas as campanhas', edist: 'E1-DIST (padrão da agência)', old: 'Campanha antiga' };
  function groupOf(c) { return /e1[-\s]?dist/i.test(String(c || '')) ? 'edist' : 'old'; }
  function campOK(c) { return !(STATE.campGroup && STATE.campGroup !== 'all') || groupOf(c) === STATE.campGroup; }
  function groupActive() { return !!(STATE.campGroup && STATE.campGroup !== 'all'); }

  /* ---------------------------------------------------------------- agregação (mídia) */
  function blank() { return { spend: 0, impr: 0, reach: 0, clk: 0, visits: 0, follows: 0 }; }
  function derive(t) {
    var o = Object.assign({}, t);
    o.cpm = div(t.spend * 1000, t.impr);
    o.ctr = div(t.clk, t.impr);            // CTR de LINK
    o.cpc = div(t.spend, t.clk);
    o.cpVisit = div(t.spend, t.visits);    // custo por visita ao perfil (headline de mídia)
    o.result = t.visits || 0;              // resultado da campanha = visitas ao perfil
    return o;
  }
  function within(d, from, to) { return d >= from && d <= to; }
  function aggregate(from, to) {
    var t = blank();
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      t.spend += g.spend; t.impr += g.impr; t.reach += g.reach; t.clk += g.clk; t.visits += g.visits; t.follows += g.follows;
    }
    return derive(t);
  }
  function dailyRows(from, to) {
    var md = {};
    for (var j = 0; j < grain.length; j++) {
      var g = grain[j]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var m = md[g.d] || (md[g.d] = blank());
      m.spend += g.spend; m.impr += g.impr; m.reach += g.reach; m.clk += g.clk; m.visits += g.visits; m.follows += g.follows;
    }
    var out = [];
    for (var i = 0; i < daily.length; i++) {
      var x = daily[i]; if (!within(x.d, from, to)) continue;
      var m = md[x.d]; if (!m) { if (groupActive()) continue; m = Object.assign(blank(), { spend: x.spend, impr: x.impr, reach: x.reach, clk: x.clk, visits: x.visits, follows: x.follows }); }
      out.push(derive(Object.assign(blank(), { d: x.d }, m)));
    }
    return out;
  }

  /* ---------------------------------------------------------------- seguidores (planilha manual) */
  var HAS_FOL = followersAll.length > 0;
  // gasto e visitas do grupo selecionado por dia (pra cruzar com os seguidores manuais)
  function metaByDay(from, to) {
    var s = {}, v = {};
    for (var i = 0; i < grain.length; i++) { var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue; s[g.d] = (s[g.d] || 0) + g.spend; v[g.d] = (v[g.d] || 0) + g.visits; }
    return { spend: s, visits: v };
  }
  // linhas diárias de seguidores cruzadas com gasto e visitas (só dias em que o grupo teve gasto — honesto)
  function followersDailyRows(from, to) {
    var mb = metaByDay(from, to), sp = mb.spend, vi = mb.visits, fol = {};
    for (var j = 0; j < followersAll.length; j++) { var f = followersAll[j]; if (!within(f.d, from, to)) continue; fol[f.d] = (fol[f.d] || 0) + (f.gain || 0); }
    var days = {}; Object.keys(fol).forEach(function (d) { if (!groupActive() || (sp[d] || 0) > 0) days[d] = 1; });
    return Object.keys(days).sort().map(function (d) { var g = fol[d] || 0, s = sp[d] || 0; return { d: d, gain: g, spend: s, visits: vi[d] || 0, cpf: div(s, g) }; });
  }
  function folAgg(from, to) {
    var rows = followersDailyRows(from, to), tot = 0, sp = 0, vis = 0;
    rows.forEach(function (r) { tot += r.gain; sp += r.spend; vis += r.visits; });
    return { total: tot, spend: sp, visits: vis, dias: rows.length, cpf: div(sp, tot), convVS: div(tot, vis), rows: rows };
  }

  /* ---------------------------------------------------------------- seguidores AO VIVO (lê a planilha client-side; instantâneo no F5) */
  var FOL_LIVE = false;   // vira true quando a leitura ao vivo funciona
  function parseCsvLineJS(line) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  }
  function fetchFolTab(gid) {
    var url = 'https://docs.google.com/spreadsheets/d/' + D.folSheet + '/gviz/tq?tqx=out:csv&gid=' + encodeURIComponent(gid) + '&_=' + Date.now();
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
      var map = {};
      txt.split('\n').forEach(function (line) {
        if (!line.trim()) return;
        var f = parseCsvLineJS(line); if (f.length < 14) return;
        var draw = (f[1] || '').trim(), sraw = (f[13] || '').trim();
        var m = draw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return;   // DD/MM/YYYY
        var iso = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);   // -> YYYY-MM-DD
        var sc = sraw.replace(/[^\d-]/g, ''); if (sc === '' || sc === '-') return;
        var seg = parseInt(sc, 10); if (!(seg > 0)) return;
        map[iso] = (map[iso] || 0) + seg;
      });
      return map;
    }).catch(function () { return {}; });
  }
  function fetchLiveFollowers() {
    var tabs = arr(D.folTabs);
    if (!D.folSheet || !tabs.length || typeof fetch !== 'function') return Promise.resolve(null);
    return Promise.all(tabs.map(fetchFolTab)).then(function (maps) {
      var all = {}, any = false;
      maps.forEach(function (mp) { for (var k in mp) { all[k] = (all[k] || 0) + mp[k]; any = true; } });
      if (!any) return null;
      return Object.keys(all).sort().map(function (d) { return { d: d, gain: all[d] }; });
    }).catch(function () { return null; });
  }
  function applyLiveFollowers(fol) {
    if (!fol || !fol.length) return;                 // fetch falhou -> mantém o dado do build (fallback)
    followersAll = fol; HAS_FOL = true; FOL_LIVE = true;
    folDates = followersAll.map(function (f) { return f.d; }).filter(Boolean).sort();
    minDate = folDates.length && folDates[0] < dMin ? folDates[0] : dMin;
    maxDate = folDates.length && folDates[folDates.length - 1] > dMax ? folDates[folDates.length - 1] : dMax;
    if ($('from')) { $('from').min = $('to').min = minDate; $('from').max = $('to').max = maxDate; }
    if (STATE.preset === 'all') { STATE.from = minDate; STATE.to = maxDate; if ($('from')) { $('from').value = minDate; $('to').value = maxDate; } }
    else { STATE.from = clampD(STATE.from); STATE.to = clampD(STATE.to); }
    if (daily.length) refresh();
  }

  /* ---------------------------------------------------------------- régua de benchmarks (da conta Rubra) */
  var BANDS = {
    ctr: { label: 'CTR (link)', good: 0.015, mid: 0.01, dir: 'high', fmt: M.pct1, lim: 'bom ≥ 1,5%' },
    cpc: { label: 'CPC', good: 0.50, mid: 0.80, dir: 'low', fmt: M.money, lim: 'bom ≤ R$0,50 · alerta > R$0,80' },
    cpm: { label: 'CPM', good: 22, mid: 30, dir: 'low', fmt: M.money, lim: 'bom ≤ R$22 · alerta > R$30' },
    cps: { label: 'Custo por seguidor', good: 2, mid: 3, dir: 'low', fmt: M.money, lim: 'bom ≤ R$2,00' }
  };
  function statusOf(v, b) {
    if (!ok(v)) return null;
    var lvl;
    if (b.dir === 'high') lvl = v >= b.good ? 'good' : v >= b.mid ? 'warn' : 'bad';
    else lvl = v <= b.good ? 'good' : v <= b.mid ? 'warn' : 'bad';
    var word = lvl === 'good' ? 'bom' : lvl === 'warn' ? 'médio' : 'ruim';
    var cls = lvl === 'good' ? 'g' : lvl === 'warn' ? 'y' : 'r';
    return { lvl: lvl, word: word, cls: cls };
  }
  function scoreOf(v, b) {
    if (!ok(v)) return null;
    if (b.dir === 'high') {
      if (v >= b.good) return 100;
      if (v >= b.mid) return 60 + (v - b.mid) / (b.good - b.mid) * 30;
      return Math.max(5, v / b.mid * 55);
    } else {
      if (v <= b.good) return 100;
      if (v <= b.mid) return 60 + (b.mid - v) / (b.mid - b.good) * 30;
      return Math.max(5, 55 - (v - b.mid) / b.mid * 55);
    }
  }
  var scoreColor = function (s) { return s == null ? 'var(--ink-3)' : s >= 75 ? 'var(--good)' : s >= 50 ? 'var(--warning)' : 'var(--critical)'; };
  var bandLabel = function (s) { return s == null ? 'sem dados' : s >= 80 ? 'Saudável' : s >= 60 ? 'Bom' : s >= 40 ? 'Atenção' : 'Crítico'; };

  var HEALTH_KEYS = ['ctr', 'cpc', 'cpm'];
  function health(a) {
    var bars = HEALTH_KEYS.map(function (k) {
      var b = BANDS[k], v = a[k], sc = scoreOf(v, b);
      return { label: b.label, valueStr: b.fmt(v), score: sc, band: b, cls: (statusOf(v, b) || {}).cls };
    });
    var valid = bars.filter(function (b) { return b.score != null; });
    var score = valid.length ? Math.round(valid.reduce(function (s, b) { return s + b.score; }, 0) / valid.length) : null;
    return { score: score, band: bandLabel(score), bars: bars };
  }

  /* ---------------------------------------------------------------- SVG helpers */
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(n, at) { var e = document.createElementNS(NS, n); for (var k in at) e.setAttribute(k, at[k]); return e; }
  function niceMax(v) { if (!(v > 0)) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))); var f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function ticks(max, n) { n = n || 4; var out = []; for (var i = 0; i <= n; i++) out.push(max * i / n); return out; }
  function labelStep(count, width) { return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 58)))); }

  var TIP = null;
  function showTip(html, ev) {
    TIP.innerHTML = html; TIP.style.opacity = 1;
    var r = TIP.getBoundingClientRect();
    var x = ev.clientX + 14, y = ev.clientY - r.height - 12;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 18;
    TIP.style.left = x + 'px'; TIP.style.top = y + 'px';
  }
  function hideTip() { TIP.style.opacity = 0; }

  function comboChart(host, rows, cfg) {
    host.innerHTML = '';
    var W = Math.max(300, host.clientWidth || 520), H = 240;
    var P = { t: 22, r: 50, b: 28, l: 56 }, iw = W - P.l - P.r, ih = H - P.t - P.b, n = rows.length;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img' });
    var leftMax = niceMax(Math.max.apply(null, rows.flatMap(function (r) { return cfg.bars.map(function (b) { return r[b.key] || 0; }); }).concat([0])));
    var rightVals = rows.map(function (r) { return r[cfg.line.key]; }).filter(ok);
    var rightMax = niceMax(Math.max.apply(null, rightVals.concat([0])));
    var yL = function (v) { return P.t + ih - (leftMax > 0 ? (v / leftMax) * ih : 0); };
    var yR = function (v) { return P.t + ih - (rightMax > 0 ? (v / rightMax) * ih : 0); };
    ticks(leftMax).forEach(function (t) { svg.appendChild(svgEl('line', { class: 'gl', x1: P.l, x2: P.l + iw, y1: yL(t), y2: yL(t) })); var tx = svgEl('text', { x: P.l - 7, y: yL(t) + 4, 'text-anchor': 'end' }); tx.textContent = cfg.leftFmt(t); svg.appendChild(tx); });
    ticks(rightMax).forEach(function (t) { var tx = svgEl('text', { x: P.l + iw + 7, y: yR(t) + 4, 'text-anchor': 'start' }); tx.textContent = cfg.rightFmt(t); svg.appendChild(tx); });
    svg.appendChild(svgEl('line', { class: 'ax', x1: P.l, x2: P.l + iw, y1: P.t + ih, y2: P.t + ih }));
    var slot = iw / Math.max(1, n), nb = cfg.bars.length;
    var groupW = Math.min(slot - 3, nb > 1 ? 40 : 30), bw = Math.max(2, groupW / nb - 1), step = labelStep(n, iw);
    rows.forEach(function (r, i) {
      var cx = P.l + slot * i + slot / 2;
      cfg.bars.forEach(function (b, bi) {
        var v = r[b.key] || 0, h = Math.max(v > 0 ? 1.5 : 0, P.t + ih - yL(v));
        var x = cx - groupW / 2 + bi * (groupW / nb) + (groupW / nb - bw) / 2;
        if (h > 0) svg.appendChild(svgEl('rect', { x: x, y: P.t + ih - h, width: bw, height: h, fill: b.color, rx: Math.min(3, bw / 2) }));
      });
      if (i % step === 0 || i === n - 1) { var tx = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }); tx.textContent = brDate(r.d); svg.appendChild(tx); }
    });
    var pts = rows.map(function (r, i) { var v = r[cfg.line.key]; return ok(v) ? [P.l + slot * i + slot / 2, yR(v), v] : null; });
    var seg = [], segs = [];
    pts.forEach(function (p) { if (p) seg.push(p); else if (seg.length) { segs.push(seg); seg = []; } }); if (seg.length) segs.push(seg);
    segs.forEach(function (s) { var d = s.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' '); svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: cfg.line.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); });
    if (n <= 45) pts.forEach(function (p) { if (p) svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 3.2, fill: cfg.line.color, stroke: 'var(--card)', 'stroke-width': 1.5 })); });
    var cross = svgEl('line', { class: 'cross', y1: P.t, y2: P.t + ih }); svg.appendChild(cross);
    var hit = svgEl('rect', { class: 'hit', x: P.l, y: P.t, width: iw, height: ih });
    hit.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var i = Math.max(0, Math.min(n - 1, Math.floor((((ev.clientX - box.left) / box.width) * W - P.l) / slot)));
      var r = rows[i], cx = P.l + slot * i + slot / 2;
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.opacity = 1;
      var html = '<b>' + brFull(r.d) + '</b>';
      cfg.bars.forEach(function (b) { html += '<div class="r"><em><i style="background:' + b.color + '"></i>' + b.name + '</em><strong>' + cfg.leftFmt(r[b.key] || 0) + '</strong></div>'; });
      html += '<div class="r"><em><i style="background:' + cfg.line.color + '"></i>' + cfg.line.name + '</em><strong>' + cfg.lineFmt(r[cfg.line.key]) + '</strong></div>';
      showTip(html, ev);
    });
    hit.addEventListener('mouseleave', function () { cross.style.opacity = 0; hideTip(); });
    svg.appendChild(hit);
    host.appendChild(svg);
  }

  function lineChart(host, labels, series, fmt) {
    host.innerHTML = '';
    var W = Math.max(320, host.clientWidth || 900), H = 240;
    var P = { t: 16, r: 14, b: 28, l: 64 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img' });
    var all = series.flatMap(function (s) { return s.values.filter(ok); });
    var max = niceMax(Math.max.apply(null, all.concat([0])));
    var n = labels.length;
    var x = function (i) { return n === 1 ? P.l + iw / 2 : P.l + (iw * i) / (n - 1); };
    var y = function (v) { return P.t + ih - (max > 0 ? (v / max) * ih : 0); };
    ticks(max).forEach(function (t) { svg.appendChild(svgEl('line', { class: 'gl', x1: P.l, x2: P.l + iw, y1: y(t), y2: y(t) })); var tx = svgEl('text', { x: P.l - 8, y: y(t) + 4, 'text-anchor': 'end' }); tx.textContent = fmt(t); svg.appendChild(tx); });
    svg.appendChild(svgEl('line', { class: 'ax', x1: P.l, x2: P.l + iw, y1: P.t + ih, y2: P.t + ih }));
    var step = labelStep(n, iw);
    labels.forEach(function (lb, i) { if (i % step === 0 || i === n - 1) { var tx = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }); tx.textContent = lb; svg.appendChild(tx); } });
    series.forEach(function (s) {
      var pts = s.values.map(function (v, i) { return [x(i), y(v || 0)]; });
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var path = svgEl('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      if (s.dashed) path.setAttribute('stroke-dasharray', '5 4');
      svg.appendChild(path);
      if (n <= 40) pts.forEach(function (p) { svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 4, fill: s.color, stroke: 'var(--card)', 'stroke-width': 2 })); });
    });
    var cross = svgEl('line', { class: 'cross', y1: P.t, y2: P.t + ih }); svg.appendChild(cross);
    var hit = svgEl('rect', { class: 'hit', x: P.l - 4, y: P.t, width: iw + 8, height: ih });
    hit.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var rel = ((ev.clientX - box.left) / box.width) * W;
      var i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((rel - P.l) / iw) * (n - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.opacity = 1;
      showTip('<b>' + (series[0].fullLabels ? series[0].fullLabels[i] : labels[i]) + '</b>' +
        series.map(function (s) { return '<div class="r"><em><i style="background:' + s.color + '"></i>' + s.name + '</em><strong>' + fmt(s.values[i]) + '</strong></div>'; }).join(''), ev);
    });
    hit.addEventListener('mouseleave', function () { cross.style.opacity = 0; hideTip(); });
    svg.appendChild(hit);
    host.appendChild(svg);
  }

  function gauge(score, colorVar) {
    var s = ok(score) ? score : 0, r = 54, c = 2 * Math.PI * r, off = c * (1 - s / 100);
    var disp = ok(score) ? Math.round(score) : '—';
    return '<div class="gauge"><svg viewBox="0 0 132 132" width="132" height="132">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="var(--plane)" stroke-width="12"/>' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + colorVar + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '</svg><div class="gv"><b>' + disp + '</b><span>de 100</span></div></div>';
  }

  /* ---------------------------------------------------------------- deltas */
  function miniDelta(cur, prev, better) {
    if (!STATE.compare || !ok(prev) || prev === 0 || !ok(cur)) return '<span class="flat">—</span>';
    var ch = (cur - prev) / Math.abs(prev);
    var ar = Math.abs(ch) < 0.0005 ? '→' : (ch > 0 ? '▲' : '▼');
    var cls;
    if (better === null) cls = 'flat';
    else { var bad = better === false; cls = Math.abs(ch) < 0.0005 ? 'flat' : ((ch > 0) !== bad ? 'up' : 'down'); }
    return '<span class="' + cls + '">' + ar + ' ' + nf1.format(Math.abs(ch) * 100) + '%</span>';
  }

  /* ---------------------------------------------------------------- árvore campanha › conjunto › anúncio */
  function tblank(label) { return { label: label, spend: 0, impr: 0, reach: 0, clk: 0, visits: 0, follows: 0, kids: {} }; }
  var RAW = ['spend', 'impr', 'reach', 'clk', 'visits', 'follows'];
  function tderive(t) {
    var o = Object.assign({}, t);
    o.cpm = div(t.spend * 1000, t.impr); o.ctr = div(t.clk, t.impr); o.cpc = div(t.spend, t.clk);
    o.cpVisit = div(t.spend, t.visits);
    return o;
  }
  function accum(a, g) { for (var i = 0; i < RAW.length; i++) { a[RAW[i]] += g[RAW[i]]; } }
  function buildTree(from, to) {
    var root = {};
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var c = root[g.camp] || (root[g.camp] = tblank(g.camp));
      var s = c.kids[g.adset] || (c.kids[g.adset] = tblank(g.adset));
      var a = s.kids[g.ad] || (s.kids[g.ad] = tblank(g.ad));
      accum(a, g);
    }
    function roll(node, key, level) {
      var kids = Object.keys(node.kids).map(function (k) { return roll(node.kids[k], key + ' ▸ ' + k, level + 1); });
      var agg = tblank(node.label);
      RAW.forEach(function (k) { agg[k] = node[k]; });
      kids.forEach(function (c) { RAW.forEach(function (k) { agg[k] += c[k]; }); });
      var d = tderive(agg); d.key = key; d.level = level; d.kids = kids;
      return d;
    }
    return Object.keys(root).map(function (k) { return roll(root[k], k, 0); });
  }
  function adsByName(from, to) {
    var map = {};
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var a = map[g.ad] || (map[g.ad] = tblank(g.ad));
      accum(a, g);
    }
    return Object.keys(map).map(function (k) { return tderive(map[k]); }).filter(function (a) { return a.spend > 0 || a.visits > 0; });
  }
  // melhor anúncio do período: menor custo/visita entre os que têm volume (gasto ≥ R$10); desempate por mais visitas
  function bestAd(from, to) {
    var ads = adsByName(from, to).filter(function (a) { return a.visits > 0; });
    if (!ads.length) return null;
    var strong = ads.filter(function (a) { return a.spend >= 10; });
    var pool = strong.length ? strong : ads;
    pool.sort(function (a, b) { return (a.cpVisit - b.cpVisit) || (b.visits - a.visits); });
    var top = pool[0];
    return { ad: top, link: adLinks[top.label] || '' };
  }
  function adLinkBtn(label, txt) {
    var url = adLinks[label] || '';
    if (!url) return '';
    return '<a class="btn adlink" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + (txt || 'Ver anúncio no Instagram') + ' ↗</a>';
  }

  var TCOLS = [
    { k: 'label', label: 'Campanha › Conjunto › Anúncio' },
    { k: 'spend', label: 'Invest.', fmt: M.money },
    { k: 'ctr', label: 'CTR', fmt: M.pct1, scale: 'high' },
    { k: 'cpc', label: 'CPC', fmt: M.money, scale: 'low' },
    { k: 'clk', label: 'Cliques', fmt: M.int },
    { k: 'visits', label: 'Visitas perfil', fmt: M.int, scale: 'high' },
    { k: 'cpVisit', label: 'Custo/visita', fmt: M.money, scale: 'low' }
  ];

  /* ================================================================ VISÃO GERAL */
  // painel de Seguidores — seguidores lançados à mão na planilha × visitas ao perfil (Graph API)
  function renderFollowers(m, fol) {
    var scopeLbl = STATE.campGroup === 'all' ? '' : ' · ' + esc(GROUP_LABEL[STATE.campGroup]);
    var liveLbl = FOL_LIVE ? ' <span class="rep-flag g" title="Lido direto da planilha agora — aparece no F5, sem esperar o rebuild">● ao vivo</span>' : '';
    var head = '<h2>👥 Seguidores <small style="font-weight:500;color:var(--ink-3)">· lançados à mão na planilha (coluna N)' + scopeLbl + '</small>' + liveLbl + '</h2>';
    var total = fol.total, cpf = fol.cpf, convVS = fol.convVS;
    var cpsSt = statusOf(cpf, BANDS.cps);
    var stages = [
      { n: 'Investimento', big: M.money(m.spend), bg: '#8fe01e', ink: '#0c1400', cl: 'com imposto', cv: '×' + taxStr(TAX), sub: 'campanha de seguidores / perfil' },
      { n: 'Visitas ao perfil', big: M.int(m.visits), bg: '#7ecb1c', ink: '#0c1400', cl: 'Custo / visita', cv: M.money(m.cpVisit), sub: 'visitas ao perfil do Instagram (Meta)' },
      { n: 'Novos seguidores', big: M.int(total), bg: '#356606', ink: '#fff', cl: 'Custo / seguidor', cv: (total ? M.money(cpf) : '—'), sub: total ? 'visita → seguidor <b>' + M.pct1(convVS) + '</b>' + (cpsSt ? ' · <b class="rep-flag ' + cpsSt.cls + '">' + cpsSt.word + '</b>' : '') : 'sem seguidor lançado no período' }
    ];
    var funnelHTML = stages.map(function (s) {
      return '<div class="fstage"><div class="fl" style="background:' + s.bg + ';color:' + s.ink + '"><div class="fn">' + s.n + '</div><div class="fv">' + s.big + '</div></div>' +
        '<div class="fr"><div class="cl">' + s.cl + '</div><div class="cv">' + s.cv + '</div><div class="fsub">' + s.sub + '</div></div></div>';
    }).join('');
    var chartBlock = total > 0
      ? '<h3 class="qh" style="margin-top:16px">Novos seguidores por dia <small>· barras = seguidores (planilha) · linha = custo/seguidor</small></h3><div id="chFol"></div>'
      : '<div class="alertbar amber" style="margin-top:12px">📝 <b>Nenhum seguidor lançado no período/grupo selecionado.</b> As visitas ao perfil vêm da Meta automaticamente; os <b>novos seguidores</b> você preenche na coluna <b>N (Seguid.)</b> das abas mensais — assim que preencher, o custo por seguidor e a conversão aparecem aqui.</div>';
    var note = '<p class="note" style="margin-top:10px">Os <b>novos seguidores</b> são o número que você lança à mão na planilha (coluna <b>N · Seguid.</b>) — o que você atribui à campanha, não o total da conta (que inclui orgânico). Custo por seguidor bom <b>≤ R$2,00</b>. Investimento, visitas e mídia vêm da Meta.</p>';
    return '<div class="panel quiz-panel">' + head + '<div class="funnel">' + funnelHTML + '</div>' + chartBlock + note + '</div>';
  }

  function renderOverview() {
    var from = STATE.from, to = STATE.to, len = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(len - 1));
    var cur = aggregate(from, to), prev = STATE.compare ? aggregate(pFrom, pTo) : null;
    var fol = folAgg(from, to);

    var h = health(cur), sc = scoreColor(h.score);
    var healthHTML = gauge(h.score, sc) +
      '<div><p class="health-head">Saúde da mídia' +
      '<span class="tag" style="background:color-mix(in srgb,' + sc + ' 20%,transparent);color:' + sc + '">' + h.band + '</span>' +
      '<span style="font-size:11.5px;font-weight:500;color:var(--ink-3);margin-left:6px">' + (h.score == null ? '—' : h.score + '/100') + ' · pela régua da conta</span></p>' +
      '<div class="hbars" style="margin-top:12px">' + h.bars.map(function (b) {
        var col = b.score == null ? 'var(--ink-3)' : scoreColor(b.score);
        var w = b.score == null ? 0 : Math.max(0, Math.min(100, b.score));
        return '<div class="hbar"><div class="hb-top"><em>' + b.label + ' <span style="color:var(--ink-3);font-weight:500">· ' + b.band.lim + '</span></em><strong>' + b.valueStr + '</strong></div>' +
          '<div class="hb-track"><div class="hb-fill" style="width:' + w.toFixed(0) + '%;background:' + col + '"></div></div></div>';
      }).join('') + '</div></div>';

    // hero: Investimento → Visitas ao perfil → Custo/visita · Novos seguidores (planilha)
    var cpf = fol.cpf;
    function hc(k, sub, val, dv, cardCls, green) {
      return '<div class="hcard' + (cardCls ? ' ' + cardCls : '') + '"><div class="hk">' + k + (sub ? ' <small>' + sub + '</small>' : '') + '</div>' +
        '<div class="hv' + (green ? ' g' : '') + '">' + val + '</div><div class="hd">' + (dv || '') + '</div></div>';
    }
    var OP = function (s) { return '<div class="op">' + s + '</div>'; };
    var heroHTML =
      hc('💸 Investimento', 'c/ imposto', M.money(cur.spend), miniDelta(cur.spend, prev && prev.spend, null) + ' vs anterior') + OP('→') +
      hc('👤 Visitas ao perfil', 'Instagram', M.int(cur.visits), 'custo/visita ' + M.money(cur.cpVisit), '', true) + OP('→') +
      hc('👥 Novos seguidores', 'planilha', M.int(fol.total), fol.total ? 'visita → seguidor ' + M.pct1(fol.convVS) : 'preencher coluna N') + OP('=') +
      hc('🎯 Custo por seguidor', 'bom ≤ R$2', (fol.total ? M.money(cpf) : '—'), '', 'roas');
    var heroLine = fol.total > 0
      ? '<b>' + int(cur.visits) + ' visitas ao perfil</b> e <b>' + int(fol.total) + ' novos seguidores</b> por <b>' + M.money(cur.spend) + '</b> — custo por seguidor <b>' + M.money(cpf) + '</b> e por visita <b>' + M.money(cur.cpVisit) + '</b>.'
      : '<b>' + int(cur.visits) + ' visitas ao perfil</b> por <b>' + M.money(cur.spend) + '</b> (custo/visita <b>' + M.money(cur.cpVisit) + '</b>). Preencha a coluna <b>N (Seguid.)</b> pra ver o custo por seguidor.';

    var showFol = HAS_FOL && (cur.spend > 0 || fol.total > 0);
    var folPanel = showFol ? renderFollowers(cur, fol) : '';

    var ba = bestAd(from, to);
    var bestAdPanel = ba ? (
      '<div class="panel bestad"><h2>🏆 Melhor anúncio do período <small style="font-weight:500;color:var(--ink-3)">· menor custo por visita</small></h2>' +
      '<div class="bestad-row">' +
        '<div class="bestad-info">' +
          '<div class="bestad-name">' + esc(ba.ad.label) + '</div>' +
          '<div class="bestad-stats">' +
            '<span><b>' + M.int(ba.ad.visits) + '</b> visitas ao perfil</span>' +
            '<span>custo/visita <b>' + M.money(ba.ad.cpVisit) + '</b></span>' +
            '<span>CTR <b>' + M.pct1(ba.ad.ctr) + '</b></span>' +
            '<span><b>' + M.money(ba.ad.spend) + '</b> investidos</span>' +
          '</div>' +
        '</div>' +
        (ba.link ? '<div class="bestad-cta">' + adLinkBtn(ba.ad.label, 'Ver anúncio no Instagram') + '</div>' : '<div class="bestad-cta"><span class="muted" style="font-size:12px;color:var(--ink-3)">link indisponível</span></div>') +
      '</div></div>'
    ) : '';

    var overview =
      folPanel +
      bestAdPanel +
      '<div class="panel"><div class="health" id="health">' + healthHTML + '</div></div>' +
      '<div class="hero" id="hero">' + heroHTML + '</div>' +
      '<p class="hero-line" style="margin-bottom:10px">' + heroLine + '</p>' +
      '<div class="panel"><h2>Comparativo por campanha <span style="font-weight:500;color:var(--ink-3)">— com imposto ×' + taxStr(TAX) + '</span></h2><div class="funil-grid" id="funilInv"></div></div>' +
      '<div class="grid-funnel">' +
      '<div class="panel"><h2>Funil completo</h2><p class="note">Investimento → Impressões → Cliques → Visitas ao perfil → Novos seguidores. Cada etapa mostra o <b>volume</b> e, à direita, o <b>custo</b> e a <b>taxa de passagem</b>.</p><div class="funnel" id="funnel"></div></div>' +
      '<div class="panel"><h2>Resultados por dia</h2><p class="note">Barras = <b>Investimento c/ imposto</b> (esq., R$) · linha = <b>Visitas ao perfil</b> (dir., nº).</p><div class="legend" id="legA"></div><div id="chA"></div>' +
      '<h2 style="margin-top:20px">Cliques × Visitas × Custo/visita</h2><p class="note">Barras = <b>Cliques</b> e <b>Visitas ao perfil</b> (esq., nº) · linha = <b>Custo por visita</b> (dir., R$).</p><div class="legend" id="legB"></div><div id="chB"></div></div>' +
      '</div>' +
      '<div class="panel"><h2 id="metricTitle">Investimento por dia</h2><p class="note">Escolha a métrica; com a comparação ligada, a linha tracejada é o período anterior alinhado dia a dia.</p><div class="tabs" id="metricTabs"></div><div class="legend" id="legend"></div><div id="chMetric"></div></div>' +
      '<div class="panel"><h2>Visão diária — principais métricas por dia</h2><p class="note">Uma linha por dia, mais recente no topo. Heatmap por coluna: <b style="color:var(--good-text)">verde = melhor</b>, <b style="color:var(--critical)">vermelho = pior</b> no período.</p><div class="tblwrap"><table id="dtbl" class="daily"></table></div></div>';

    $('overviewView').innerHTML = overview;

    if (showFol && fol.total > 0 && $('chFol')) {
      comboChart($('chFol'), fol.rows, { bars: [{ key: 'gain', color: 'var(--good)', name: 'Novos seguidores' }], line: { key: 'cpf', color: 'var(--ink-1)', name: 'Custo/seguidor' }, leftFmt: M.int, rightFmt: M.money0, lineFmt: M.money });
    }

    renderFunilInv(from, to);
    renderFunnel(cur, fol);
    var rows = dailyRows(from, to), pRows = dailyRows(pFrom, pTo);
    comboChart($('chA'), rows, { bars: [{ key: 'spend', color: 'var(--critical)', name: 'Investimento c/ imposto' }], line: { key: 'visits', color: 'var(--good)', name: 'Visitas ao perfil' }, leftFmt: M.money0, rightFmt: M.int, lineFmt: M.int });
    comboChart($('chB'), rows, { bars: [{ key: 'clk', color: 'var(--series-2)', name: 'Cliques' }, { key: 'visits', color: 'var(--good)', name: 'Visitas ao perfil' }], line: { key: 'cpVisit', color: 'var(--ink-1)', name: 'Custo/visita' }, leftFmt: M.int, rightFmt: M.money0, lineFmt: M.money });
    var lgSq = function (c) { return '<i style="background:' + c + '"></i>'; }, lgLn = function (c) { return '<i style="width:15px;height:0;border-top:2px solid ' + c + ';border-radius:0"></i>'; };
    $('legA').innerHTML = '<span>' + lgSq('var(--critical)') + '<span style="color:var(--ink-2)">Investimento c/ imposto</span></span><span>' + lgLn('var(--good)') + '<span style="color:var(--ink-2)">Visitas ao perfil (eixo dir.)</span></span>';
    $('legB').innerHTML = '<span>' + lgSq('var(--series-2)') + '<span style="color:var(--ink-2)">Cliques</span></span><span>' + lgSq('var(--good)') + '<span style="color:var(--ink-2)">Visitas ao perfil</span></span><span>' + lgLn('var(--ink-1)') + '<span style="color:var(--ink-2)">Custo/visita (eixo dir.)</span></span>';

    var METRICS = [
      { k: 'spend', label: 'Investimento', fmt: M.money0 }, { k: 'visits', label: 'Visitas ao perfil', fmt: M.int },
      { k: 'cpVisit', label: 'Custo/visita', fmt: M.money }, { k: 'clk', label: 'Cliques', fmt: M.int },
      { k: 'cpc', label: 'CPC', fmt: M.money }, { k: 'cpm', label: 'CPM', fmt: M.money0 },
      { k: 'ctr', label: 'CTR', fmt: M.pct1 }, { k: 'impr', label: 'Impressões', fmt: M.int }
    ];
    $('metricTabs').innerHTML = METRICS.map(function (x) { return '<button class="btn' + (x.k === STATE.metric ? ' on' : '') + '" data-metric="' + x.k + '">' + x.label + '</button>'; }).join('');
    var met = METRICS.find(function (m) { return m.k === STATE.metric; }) || METRICS[0];
    var series = [{ name: 'Período atual', color: 'var(--series-1)', values: rows.map(function (r) { return r[met.k]; }), fullLabels: rows.map(function (r) { return brFull(r.d); }) }];
    if (STATE.compare) series.push({ name: 'Período anterior', color: 'var(--series-2)', dashed: true, values: rows.map(function (_, i) { return pRows[i] ? pRows[i][met.k] : null; }) });
    $('legend').innerHTML = series.length > 1 ? series.map(function (s) { return '<span style="color:' + s.color + '"><i class="' + (s.dashed ? 'dash' : '') + '" style="background:' + (s.dashed ? 'transparent' : s.color) + '"></i><span style="color:var(--ink-2)">' + s.name + '</span></span>'; }).join('') : '';
    lineChart($('chMetric'), rows.map(function (r) { return brDate(r.d); }), series, met.fmt);
    $('metricTitle').textContent = met.label + ' por dia';
    Array.prototype.forEach.call(document.querySelectorAll('[data-metric]'), function (b) { b.onclick = function () { STATE.metric = b.dataset.metric; renderOverview(); }; });

    renderDaily(from, to);
  }

  function renderFunilInv(from, to) {
    // comparativo por CAMPANHA (E1-DIST vs Antiga) — investimento, visitas e custo/visita
    var g = {}, total = 0, COLORS = ['var(--good)', 'var(--series-2)', 'var(--brand)', 'var(--ink-3)'];
    for (var i = 0; i < grain.length; i++) {
      var x = grain[i]; if (!within(x.d, from, to)) continue; if (!campOK(x.camp)) continue;
      var key = x.camp; (g[key] || (g[key] = { spend: 0, visits: 0, clk: 0, impr: 0 }));
      g[key].spend += x.spend; g[key].visits += x.visits; g[key].clk += x.clk; g[key].impr += x.impr; total += x.spend;
    }
    var keys = Object.keys(g).sort(function (a, b) { return g[b].spend - g[a].spend; });
    var cards = keys.map(function (k, idx) {
      var o = g[k], share = total ? o.spend / total : 0, col = COLORS[idx % COLORS.length];
      var nice = k.length > 42 ? esc(k.slice(0, 40)) + '…' : esc(k);
      return '<div class="finv"><div class="fshare">' + pct1(share) + '</div><div class="ftop"><span class="fico" style="background:' + col + '"></span>' + (groupOf(k) === 'edist' ? 'E1-DIST' : 'Antiga') + '</div><div class="fmain" style="color:' + col + '">' + money0(o.spend) + '</div><div class="fmeta" title="' + esc(k) + '">' + nice + '<br>' + int(o.visits) + ' visitas · ' + money(div(o.spend, o.visits) || 0) + '/visita</div></div>';
    });
    cards.push('<div class="finv total"><div class="ftop">Σ Total</div><div class="fmain">' + money0(total) + '</div><div class="fmeta">soma das campanhas · com imposto ×' + taxStr(TAX) + '</div></div>');
    $('funilInv').innerHTML = cards.join('');
  }
  function renderFunnel(c, fol) {
    var stages = [
      { n: 'Investimento', big: M.money(c.spend), bg: '#8fe01e', ink: '#0c1400', cl: 'Gasto bruto', cv: M.money(c.spend / TAX), sub: '+ imposto ×' + taxStr(TAX) + ' = <b>' + M.money(c.spend) + '</b>' },
      { n: 'Impressões', big: M.int(c.impr), bg: '#7ecb1c', ink: '#0c1400', cl: 'CPM', cv: M.money(c.cpm), sub: 'CTR (link) <b>' + M.pct1(c.ctr) + '</b>' },
      { n: 'Cliques (link)', big: M.int(c.clk), bg: '#5aa60f', ink: '#fff', cl: 'CPC', cv: M.money(c.cpc), sub: 'alcance <b>' + M.int(c.reach) + '</b>' },
      { n: 'Visitas ao perfil', big: M.int(c.visits), bg: '#356606', ink: '#fff', cl: 'Custo / visita', cv: M.money(c.cpVisit), sub: 'visitas ao perfil do Instagram (Meta)' }
    ];
    if (HAS_FOL) {
      stages.push(fol && fol.total
        ? { n: 'Novos seguidores', big: M.int(fol.total), bg: '#1e3d05', ink: '#fff', cl: 'Custo / seguidor', cv: M.money(fol.cpf), sub: 'da planilha (coluna N) · visita → seguidor <b>' + M.pct1(fol.convVS) + '</b>' }
        : { n: 'Novos seguidores', big: '—', bg: '#1e3d05', ink: '#fff', cl: 'Custo / seguidor', cv: '—', sub: 'preencher coluna <b>N · Seguid.</b> na planilha' });
    }
    $('funnel').innerHTML = stages.map(function (s) {
      return '<div class="fstage"><div class="fl" style="background:' + s.bg + ';color:' + s.ink + '"><div class="fn">' + s.n + '</div><div class="fv">' + s.big + '</div></div>' +
        '<div class="fr"><div class="cl">' + s.cl + '</div><div class="cv">' + s.cv + '</div><div class="fsub">' + s.sub + '</div></div></div>';
    }).join('');
  }

  var DCOLS = [
    { k: 'd', label: 'Dia' }, { k: 'spend', label: 'Invest.', fmt: M.money }, { k: 'cpm', label: 'CPM', fmt: M.money, scale: 'low' },
    { k: 'cpc', label: 'CPC', fmt: M.money, scale: 'low' }, { k: 'ctr', label: 'CTR', fmt: M.pct1, scale: 'high' },
    { k: 'clk', label: 'Cliques', fmt: M.int }, { k: 'visits', label: 'Visitas perfil', fmt: M.int, scale: 'high' }, { k: 'cpVisit', label: 'Custo/visita', fmt: M.money, scale: 'low' }
  ];
  function renderDaily(from, to) {
    var rows = dailyRows(from, to).reverse();
    var scales = {};
    DCOLS.filter(function (c) { return c.scale; }).forEach(function (c) {
      var vals = rows.filter(function (r) { return r.spend > 0 && ok(r[c.k]); }).map(function (r) { return r[c.k]; });
      if (vals.length > 1) scales[c.k] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), dir: c.scale };
    });
    function heat(k, v) {
      var s = scales[k]; if (!s || !ok(v) || s.max === s.min) return '';
      var t = (v - s.min) / (s.max - s.min); if (s.dir === 'low') t = 1 - t;
      var hue = t >= 0.5 ? 'var(--good)' : 'var(--critical)', strength = Math.round(Math.abs(t - 0.5) * 2 * 32);
      return strength < 6 ? '' : 'background:color-mix(in srgb,' + hue + ' ' + strength + '%,transparent)';
    }
    var head = DCOLS.map(function (c) { return '<th>' + c.label + '</th>'; }).join('');
    var body = rows.map(function (r) {
      return '<tr>' + DCOLS.map(function (c) {
        if (c.k === 'd') return '<td>' + brFull(r.d) + '</td>';
        var st = c.scale ? heat(c.k, r[c.k]) : '', v = c.fmt(r[c.k]);
        return '<td>' + (st ? '<span class="cell-scale" style="' + st + '">' + v + '</span>' : v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    $('dtbl').innerHTML = '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>';
  }

  /* ================================================================ TRÁFEGO PAGO */
  function flagFor(k, v) { var st = statusOf(v, BANDS[k]); if (!st) return ''; return '<span class="rep-flag ' + st.cls + '">' + st.word + '</span>'; }
  function renderTraffic() {
    var from = STATE.from, to = STATE.to, len = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(len - 1));
    var cur = aggregate(from, to), prev = STATE.compare ? aggregate(pFrom, pTo) : null;
    var fol = folAgg(from, to);

    function kpi(lbl, val, sub, delta) { return '<div class="kpi"><div class="k">' + lbl + '</div><div class="v sm">' + val + '</div><div class="d">' + (delta || '') + (sub ? '<span>' + sub + '</span>' : '') + '</div></div>'; }
    var kpis = [
      kpi('Investimento', M.money0(cur.spend), 'com imposto', miniDelta(cur.spend, prev && prev.spend, null)),
      kpi('CPM', M.money(cur.cpm), BANDS.cpm.lim, flagFor('cpm', cur.cpm)),
      kpi('CTR (link)', M.pct1(cur.ctr), BANDS.ctr.lim, flagFor('ctr', cur.ctr)),
      kpi('CPC', M.money(cur.cpc), BANDS.cpc.lim, flagFor('cpc', cur.cpc)),
      kpi('Visitas ao perfil', M.int(cur.visits), 'custo/visita ' + M.money(cur.cpVisit), miniDelta(cur.visits, prev && prev.visits, true)),
      kpi('Novos seguidores', M.int(fol.total), fol.total ? 'custo/seg ' + M.money(fol.cpf) : 'coluna N', ''),
      kpi('Custo por seguidor', fol.total ? M.money(fol.cpf) : '—', BANDS.cps.lim, flagFor('cps', fol.cpf))
    ];

    $('trafficView').innerHTML =
      '<div class="scopenote"><span>🎯 Aba operacional: mídia (Meta) e resultado por anúncio. <b>Visitas ao perfil</b> = <b>visitas ao perfil do Instagram</b> (métrica `instagram_profile_visits`, só o IG — não a "e à Página"); os <b>novos seguidores</b> (coluna N da planilha) ficam na Visão Geral. CTR sempre de <b>link</b>.</span></div>' +
      '<div class="kpis">' + kpis.join('') + '</div>' +
      '<div class="panel"><h2>Comparativo por campanha <span style="font-weight:500;color:var(--ink-3)">— com imposto ×' + taxStr(TAX) + '</span></h2><div class="funil-grid" id="funilInv"></div></div>' +
      '<div class="panel"><h2>Otimização — Campanha › Conjunto › Anúncio</h2>' +
      '<p class="note">Clique numa <b>campanha</b> pra abrir os conjuntos, e num conjunto pra abrir os anúncios. Clique nos cabeçalhos pra ordenar. Heatmap: verde = melhor.</p>' +
      '<div class="tblwrap"><table id="tbl" class="tree"></table></div></div>';

    renderFunilInv(from, to);
    renderTree(from, to);
  }
  function sortNodes(list, key, dir) {
    return list.slice().sort(function (a, b) {
      if (key === 'label') return dir * a.label.localeCompare(b.label, 'pt-BR');
      var av = a[key], bv = b[key], an = !ok(av), bn = !ok(bv);
      if (an && bn) return 0; if (an) return 1; if (bn) return -1; return dir * (av - bv);
    });
  }
  function renderTree(from, to) {
    var camps = buildTree(from, to);
    var key = STATE.treeSort.key, dir = STATE.treeSort.dir;
    var scales = {};
    TCOLS.filter(function (c) { return c.scale; }).forEach(function (c) {
      var vals = camps.filter(function (r) { return r.spend > 0 && ok(r[c.k]); }).map(function (r) { return r[c.k]; });
      if (vals.length > 1) scales[c.k] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), dir: c.scale };
    });
    function shade(k, v) { var s = scales[k]; if (!s || !ok(v) || s.max === s.min) return ''; var t = (v - s.min) / (s.max - s.min); if (s.dir === 'low') t = 1 - t; if (t < 0.15) return ''; return 'background:color-mix(in srgb,var(--scale-ink) ' + Math.round(t * 32) + '%,transparent)'; }
    var head = TCOLS.map(function (c) { var active = key === c.k; var arw = active ? (dir === 1 ? '▲' : '▼') : '▾'; return '<th data-k="' + c.k + '"' + (active ? ' data-active' : '') + '>' + c.label + '<span class="arw">' + arw + '</span></th>'; }).join('');
    function flatten() {
      var out = [];
      sortNodes(camps, key, dir).forEach(function (c) {
        out.push(c);
        if (STATE.expanded[c.key]) sortNodes(c.kids, key, dir).forEach(function (s) {
          out.push(s);
          if (STATE.expanded[s.key]) sortNodes(s.kids, key, dir).forEach(function (a) { out.push(a); });
        });
      });
      return out;
    }
    function rowHTML(r) {
      var exp = r.level < 2 && r.kids && r.kids.length > 0, open = STATE.expanded[r.key];
      var caret = '<span class="caret">' + (exp ? '▸' : '') + '</span>';
      return '<tr class="lv' + r.level + (exp ? ' exp' : '') + (open ? ' open' : '') + '" data-key="' + encodeURIComponent(r.key) + '">' +
        '<td><span class="nm">' + caret + esc(r.label) + '</span></td>' +
        TCOLS.slice(1).map(function (c) { var st = c.scale ? shade(c.k, r[c.k]) : ''; var v = c.fmt(r[c.k]); return '<td>' + (st ? '<span class="cell-scale" style="' + st + '">' + v + '</span>' : v) + '</td>'; }).join('') + '</tr>';
    }
    var tot = tderive(camps.reduce(function (t, r) { RAW.forEach(function (k) { t[k] += r[k]; }); return t; }, tblank('')));
    var rows = flatten();
    $('tbl').innerHTML = '<thead><tr>' + head + '</tr></thead><tbody>' +
      (rows.map(rowHTML).join('') || '<tr><td colspan="' + TCOLS.length + '" style="text-align:center;color:var(--ink-3);padding:32px">Sem dados no período.</td></tr>') +
      '</tbody><tfoot><tr><td>Total — ' + camps.length + ' campanha(s)</td>' + TCOLS.slice(1).map(function (c) { return '<td>' + c.fmt(tot[c.k]) + '</td>'; }).join('') + '</tr></tfoot>';
    Array.prototype.forEach.call(document.querySelectorAll('#tbl tbody tr.exp'), function (tr) {
      tr.querySelector('td:first-child').onclick = function () { var k = decodeURIComponent(tr.dataset.key); STATE.expanded[k] = !STATE.expanded[k]; renderTree(from, to); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tbl thead th'), function (th) {
      th.onclick = function () { var k = th.dataset.k; STATE.treeSort = key === k ? { key: k, dir: -dir } : { key: k, dir: k === 'label' ? 1 : -1 }; renderTree(from, to); };
    });
  }

  /* ================================================================ RELATÓRIO */
  function repStat(l, v) { return '<div class="rep-stat"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }
  function renderReport() {
    var from = STATE.from, to = STATE.to, days = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(days - 1));
    var cur = aggregate(from, to), prev = aggregate(pFrom, pTo);
    var fol = folAgg(from, to);
    var dRows = dailyRows(from, to), camps = buildTree(from, to), ads = adsByName(from, to);
    var perLabel = days === 1 ? brFull(from) : brFull(from) + ' a ' + brFull(to) + ' · ' + days + ' dias';
    var cgR = STATE.campGroup;

    function selo(k, v) { var st = statusOf(v, BANDS[k]); return st ? '<span class="rep-flag ' + st.cls + '">' + st.word + '</span>' : ''; }
    var dTbl = '<div class="tblwrap"><table style="min-width:520px"><thead><tr><th style="text-align:left">Dia</th><th>Gasto</th><th>Cliques</th><th>Visitas perfil</th><th>Custo/visita</th></tr></thead><tbody>' +
      dRows.slice().reverse().map(function (r) { return '<tr><td style="text-align:left">' + brFull(r.d) + '</td><td>' + M.money(r.spend) + '</td><td>' + int(r.clk) + '</td><td>' + int(r.visits) + '</td><td>' + M.money(r.cpVisit) + '</td></tr>'; }).join('') + '</tbody></table></div>';

    var resumoStats = repStat('Investimento', M.money(cur.spend)) + repStat('Visitas ao perfil', int(cur.visits)) +
      repStat('Custo por visita', M.money(cur.cpVisit)) + repStat('Novos seguidores', int(fol.total)) +
      repStat('Custo por seguidor ' + selo('cps', fol.cpf), fol.total ? M.money(fol.cpf) : '—') + repStat('Alcance', int(cur.reach));
    var resumoNote = 'Campanha de <b>seguidores / visitas ao perfil</b>' + (cgR !== 'all' ? ' — <b>' + esc(GROUP_LABEL[cgR]) + '</b>' : '') + '. <b>Visitas ao perfil</b> = <b>visitas ao perfil do Instagram</b> (só o IG, não a "e à Página") · <b>Novos seguidores</b> = número real da planilha (coluna N), que você atribui à campanha. Custo por seguidor bom ≤ R$2,00.';

    var secVisual =
      '<div class="rep-sec"><div class="step">1 · RESUMO</div><h3>📊 Números do período' + (cgR !== 'all' ? ' <span style="font-weight:500;color:var(--ink-3)">— ' + esc(GROUP_LABEL[cgR]) + '</span>' : '') + '</h3><div class="rep-stats">' +
      resumoStats + '</div><p class="rep-p muted">' + resumoNote + '</p></div>' +

      '<div class="rep-sec"><div class="step">2 · MÍDIA</div><h3>🚀 Eficiência da mídia</h3><div class="rep-stats">' +
      repStat('CTR ' + selo('ctr', cur.ctr), M.pct1(cur.ctr)) + repStat('CPC ' + selo('cpc', cur.cpc), M.money(cur.cpc)) +
      repStat('CPM ' + selo('cpm', cur.cpm), M.money(cur.cpm)) + repStat('Impressões', int(cur.impr)) + repStat('Cliques', int(cur.clk)) + '</div>' +
      '<p class="rep-p muted">Selos pela régua da conta: ' + BANDS.ctr.lim + ' · ' + BANDS.cpc.lim + ' · ' + BANDS.cpm.lim + '.</p></div>' +

      '<div class="rep-sec"><div class="step">3 · DIA A DIA</div><h3>📅 Funil por dia</h3>' + dTbl + '</div>' +

      '<div class="rep-sec"><div class="step">4 · CAMPANHAS</div><h3>🗂️ Investimento e resultados</h3>' +
      '<div class="tblwrap"><table style="min-width:520px"><thead><tr><th style="text-align:left">Campanha</th><th>Gasto</th><th>CTR</th><th>CPC</th><th>Visitas</th><th>Custo/visita</th></tr></thead><tbody>' +
      camps.filter(function (c) { return c.spend > 0; }).sort(function (a, b) { return b.spend - a.spend; }).map(function (c) { return '<tr><td style="text-align:left">' + esc(c.label) + '</td><td>' + M.money(c.spend) + '</td><td>' + M.pct1(c.ctr) + '</td><td>' + M.money(c.cpc) + '</td><td>' + int(c.visits) + '</td><td>' + M.money(c.cpVisit) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +

      '<div class="rep-sec"><div class="step">5 · MELHORES ANÚNCIOS</div><h3>🏆 Destaques pra produzir mais</h3>' +
      (function () {
        var b = ads.filter(function (a) { return a.visits > 0; }).sort(function (a, z) { return (a.cpVisit || 1e9) - (z.cpVisit || 1e9); }).slice(0, 6);
        return b.length ? b.map(function (a) { var res = int(a.visits) + ' visita(s) · custo/visita ' + M.money(a.cpVisit); var linkPart = adLinks[a.label] ? adLinkBtn(a.label, 'Ver no Instagram') : '<input data-adlink="' + encodeURIComponent(a.label) + '" placeholder="cole o link do anúncio (Instagram)">'; return '<div class="rep-ad"><div><span class="nm">' + esc(a.label) + '</span> <span class="mt">· ' + res + ' · ' + M.money(a.spend) + ' gastos</span></div>' + linkPart + '</div>'; }).join('')
          : '<p class="rep-p muted">Sem visita atribuída a um anúncio específico no período.</p>';
      })() + '</div>';

    /* ---- briefing do gestor (interno) ---- */
    var brief = [];
    var xGeral = 'Investimento ' + M.money(cur.spend) + ' → ' + int(cur.visits) + ' visitas ao perfil (custo/visita ' + M.money(cur.cpVisit) + ')' + (fol.total > 0 ? ' e ' + int(fol.total) + ' novo(s) seguidor(es) (custo/seguidor ' + M.money(fol.cpf) + ', da planilha)' : ' — seguidores ainda não lançados na coluna N') + '.';
    brief.push({ t: 'Leitura geral', h: '<p>' + xGeral + '</p>', x: xGeral });

    var topStatus = [['ctr', cur.ctr], ['cpc', cur.cpc], ['cpm', cur.cpm]].map(function (p) { var st = statusOf(p[1], BANDS[p[0]]); return BANDS[p[0]].label + ' ' + BANDS[p[0]].fmt(p[1]) + ' (' + (st ? st.word : '—') + ')'; }).join(' · ');
    var allTopGood = ['ctr', 'cpc', 'cpm'].every(function (k) { var st = statusOf(cur[k], BANDS[k]); return st && st.lvl === 'good'; });
    var xTopo = 'Mídia: ' + topStatus + '. ' + (allTopGood ? 'A mídia está barata e atraente — a distribuição pro perfil está eficiente.' : 'Há espaço pra melhorar a mídia (criativo/público) antes de escalar.');
    brief.push({ t: 'Mídia', h: '<p>' + xTopo + '</p>', x: xTopo });

    var cpsSt = statusOf(fol.cpf, BANDS.cps);
    var xSeg = fol.total > 0
      ? int(fol.total) + ' novo(s) seguidor(es) por ' + M.money(fol.spend) + ' — custo/seguidor ' + M.money(fol.cpf) + ' (' + (cpsSt ? cpsSt.word : '—') + ', meta ≤ R$2,00) · conversão visita → seguidor ' + M.pct1(fol.convVS) + '.'
      : 'Seguidores ainda não lançados na coluna N no período. Assim que preencher, o custo por seguidor e a conversão visita→seguidor aparecem aqui.';
    brief.push({ t: 'Seguidores', h: '<p>' + xSeg + '</p>', x: xSeg });

    var ds = dRows.filter(function (r) { return r.visits > 0; });
    var xDia;
    if (ds.length) {
      var best = ds.reduce(function (a, b) { return (b.cpVisit || 1e9) < (a.cpVisit || 1e9) ? b : a; });
      var worst = ds.reduce(function (a, b) { return (b.cpVisit || 0) > (a.cpVisit || 0) ? b : a; });
      xDia = ds.length + ' dia(s) com visita. Melhor: ' + brFull(best.d) + ' (custo/visita ' + M.money(best.cpVisit) + ', ' + int(best.visits) + ' visitas)' + (worst !== best ? ' · pior: ' + brFull(worst.d) + ' (custo/visita ' + M.money(worst.cpVisit) + ')' : '') + '.';
    } else xDia = 'Sem visita dia a dia no período.';
    brief.push({ t: 'Dia a dia', h: '<p>' + xDia + '</p>', x: xDia });

    var winners = ads.filter(function (a) { return a.visits > 0 && ok(a.cpVisit); }).sort(function (a, b) { return a.cpVisit - b.cpVisit; }).slice(0, 4);
    var burning = ads.filter(function (a) { return a.spend >= (cur.cpVisit || 0.5) * 30 && a.visits === 0; }).sort(function (a, b) { return b.spend - a.spend; }).slice(0, 4);
    var campHtml = '';
    if (winners.length) campHtml += '<p><span class="rep-flag g">CAMPEÕES</span> menor custo/visita:</p><ul>' + winners.map(function (a) { return '<li><b>' + esc(a.label) + '</b> — ' + int(a.visits) + ' visita(s), custo/visita ' + M.money(a.cpVisit) + ', ' + M.money(a.spend) + ' gastos.</li>'; }).join('') + '</ul>';
    if (burning.length) campHtml += '<p style="margin-top:10px"><span class="rep-flag r">QUEIMANDO VERBA</span> gasto relevante sem visita:</p><ul>' + burning.map(function (a) { return '<li><b>' + esc(a.label) + '</b> — ' + M.money(a.spend) + ' gastos, 0 visita — candidato a pausar/revisar criativo.</li>'; }).join('') + '</ul>';
    if (!campHtml) campHtml = '<p class="rep-p muted">Ainda sem volume por anúncio pra separar campeões de perdedores com segurança.</p>';
    var campX = 'Campeões (custo/visita): ' + (winners.map(function (a) { return a.label + ' (' + M.money(a.cpVisit) + ')'; }).join('; ') || '—') + '.\nQueimando verba: ' + (burning.map(function (a) { return a.label + ' (' + M.money(a.spend) + ', 0 visita)'; }).join('; ') || '—') + '.';
    brief.push({ t: 'Campanhas / anúncios', h: campHtml, x: campX });

    var ins = [];
    var topGoods = ['ctr', 'cpc', 'cpm'].filter(function (k) { var st = statusOf(cur[k], BANDS[k]); return st && st.lvl === 'good'; });
    if (topGoods.length >= 2) ins.push(['✅', '<b>Mídia forte:</b> ' + topGoods.map(function (k) { return BANDS[k].label; }).join(', ') + ' dentro da faixa boa. A entrega está barata e distribuindo bem pro perfil.']);
    if (fol.total > 0 && cpsSt) ins.push([cpsSt.lvl === 'good' ? '👥' : '⚠️', '<b>Custo por seguidor ' + cpsSt.word + ':</b> ' + M.money(fol.cpf) + ' (' + int(fol.total) + ' seguidores por ' + M.money(fol.spend) + ', meta ≤ R$2,00).']);
    if (fol.total === 0 && cur.visits > 0) ins.push(['📝', '<b>Falta lançar seguidores:</b> ' + int(cur.visits) + ' visitas geradas, mas a coluna N está vazia no período — sem ela não dá pra medir custo por seguidor.']);
    winners.slice(0, 2).forEach(function (a) { ins.push(['⭐', '<b>Destaque:</b> "' + esc(a.label) + '" custo/visita ' + M.money(a.cpVisit) + ' com ' + int(a.visits) + ' visita(s) — colocar mais verba e criar variações.']); });
    burning.slice(0, 2).forEach(function (a) { ins.push(['🔥', '<b>Queimando verba:</b> "' + esc(a.label) + '" gastou ' + M.money(a.spend) + ' sem visita — candidato a pausar.']); });
    ins.push(['🧭', allTopGood ? '<b>Resumo:</b> mídia saudável — foco em volume de visitas baratas e em transformar visita em seguidor (bio/conteúdo do perfil).' : '<b>Resumo:</b> ajustar mídia (criativo/público) antes de escalar verba.']);
    var insHtml = '<div>' + ins.map(function (i) { return '<div class="insight"><span class="ico">' + i[0] + '</span><span class="tx">' + i[1] + '</span></div>'; }).join('') + '</div>';
    brief.push({ t: 'Insights e gargalos', h: insHtml, x: ins.map(function (i) { return '• ' + i[1].replace(/<[^>]+>/g, ''); }).join('\n') });

    var sug = [];
    if (winners.length) sug.push('Escalar os campeões de custo/visita: ' + winners.slice(0, 3).map(function (a) { return esc(a.label); }).join(', ') + '.');
    burning.slice(0, 2).forEach(function (a) { sug.push('Pausar/revisar "' + esc(a.label) + '" (' + M.money(a.spend) + ' sem visita).'); });
    sug.push('Lançar diariamente os novos seguidores na planilha (coluna N · Seguid.) pra o custo por seguidor ficar sempre atualizado.');
    if (fol.total > 0 && cpsSt && cpsSt.lvl !== 'good') sug.push('Custo por seguidor acima da meta (R$2): testar criativos que puxem mais o clique pro perfil e melhorar a conversão visita→seguidor (bio, destaque, conteúdo).');
    sug.push('Acompanhar custo por visita e por seguidor semana a semana pra decidir realocação de verba entre criativos.');
    brief.push({ t: 'Próximos passos (sugestões)', h: '<ul>' + sug.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>', x: sug.map(function (s) { return '• ' + s.replace(/<[^>]+>/g, ''); }).join('\n') });

    var briefText = 'BRIEFING DO GESTOR — Lilian Mesquita (Rubra)\n' + perLabel + '\n\n' + brief.map(function (s) { return s.t.toUpperCase() + '\n' + s.x; }).join('\n\n') + '\n\n— gerado pela dashboard (' + (D.generatedAt || '') + ' ' + (D.tz || 'BRT') + ')';

    var briefingBlock = '<div class="briefing"><div class="bh"><h3>🔒 Briefing do gestor <span style="font-weight:500;font-size:12px;color:var(--ink-3)">— uso interno, não vai no print/cliente.</span></h3><button class="rep-copy" id="repCopy">📋 Copiar briefing</button></div>' +
      brief.map(function (s) { return '<div class="brief-sub"><div class="bt">' + s.t + '</div>' + s.h + '</div>'; }).join('') +
      '<div class="brief-scratch"><div class="bt" style="color:var(--brand)">✍️ Suas anotações (rascunho)</div><textarea data-note="scratch" rows="3" placeholder="rascunho livre pra você…"></textarea></div></div>';

    $('reportView').innerHTML = '<div class="report"><div class="rep-head"><div><h2>📄 Relatório' + (cgR !== 'all' ? ' · ' + esc(GROUP_LABEL[cgR]) : '') + ' — ' + esc(perLabel) + '</h2>' +
      '<p class="sub" style="margin-top:2px">Muda sozinho conforme o período · dados de ' + esc(D.generatedAt || '—') + '</p></div></div>' +
      '<p class="sub" style="margin:0 0 8px">⬇️ Blocos visuais limpos (é o que você manda em print pro cliente). Seu <b style="color:var(--ink-2)">briefing interno</b> fica no final.</p>' +
      secVisual + briefingBlock + '</div>';

    Array.prototype.forEach.call(document.querySelectorAll('#reportView [data-note]'), function (t) {
      var k = 'rb-note-' + t.dataset.note; try { t.value = localStorage.getItem(k) || ''; } catch (e) { }
      t.oninput = function () { try { localStorage.setItem(k, t.value); } catch (e) { } };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#reportView [data-adlink]'), function (inp) {
      var k = 'rb-adlink-' + decodeURIComponent(inp.dataset.adlink); try { inp.value = localStorage.getItem(k) || ''; } catch (e) { }
      inp.oninput = function () { try { localStorage.setItem(k, inp.value); } catch (e) { } };
    });
    $('repCopy').onclick = function (e) {
      var btn = e.currentTarget, scratch = ''; try { scratch = (localStorage.getItem('rb-note-scratch') || '').trim(); } catch (_) { }
      var full = briefText + (scratch ? '\n\nSUAS ANOTAÇÕES\n' + scratch : '');
      navigator.clipboard.writeText(full).then(function () { btn.textContent = '✅ Copiado!'; setTimeout(function () { btn.textContent = '📋 Copiar briefing'; }, 1800); }).catch(function () { btn.textContent = '❌ copie manualmente'; });
    };
  }

  /* ================================================================ filtro de grupo (comparativo) */
  function filterBarHTML() {
    if (groupActive())
      return '<div class="filterbar">🎯 <b>Grupo: ' + esc(GROUP_LABEL[STATE.campGroup]) + '</b> — os números refletem só essas campanhas. Use as abas acima pra comparar E1-DIST × Antiga.</div>';
    return '';
  }

  /* ================================================================ shell / roteamento */
  function refresh() {
    var len = diffDays(STATE.from, STATE.to) + 1;
    $('filterBar').innerHTML = filterBarHTML();
    $('cmpNote').textContent = STATE.compare
      ? 'comparando com ' + brFull(dayAdd(dayAdd(STATE.from, -1), -(len - 1))) + ' – ' + brFull(dayAdd(STATE.from, -1)) + ' (' + len + (len > 1 ? ' dias' : ' dia') + ')'
      : len + (len > 1 ? ' dias selecionados' : ' dia selecionado');
    $('overviewView').hidden = STATE.tab !== 'overview';
    $('trafficView').hidden = STATE.tab !== 'traffic';
    $('reportView').hidden = STATE.tab !== 'report';
    if (STATE.tab === 'overview') renderOverview();
    else if (STATE.tab === 'traffic') renderTraffic();
    else renderReport();
  }
  function setPeriod(from, to, preset) {
    STATE.from = clampD(from); STATE.to = clampD(to); STATE.preset = preset || 'custom';
    $('from').value = STATE.from; $('to').value = STATE.to;
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) { b.setAttribute('aria-pressed', b.dataset.preset === STATE.preset); });
    refresh();
  }

  function shell() {
    var m = D;
    $('subtitle').innerHTML = '<b>Seguidores · Visitas ao perfil</b> · dados de ' + brFull(minDate) + ' a ' + brFull(maxDate) + ' · ' + int(daily.length) + ' dias com registro';
    $('updated').textContent = 'atualizado ' + esc(m.generatedAt || '—') + ' ' + esc(m.tz || 'BRT');
    $('taxBadge').textContent = TAX === 1 ? 'sem imposto' : 'imposto ×' + taxStr(TAX);
    $('from').min = $('to').min = minDate; $('from').max = $('to').max = maxDate;

    var totalSpend = daily.reduce(function (s, r) { return s + r.spend; }, 0);
    var totVis = daily.reduce(function (s, r) { return s + r.visits; }, 0);
    var totFol = followersAll.reduce(function (s, r) { return s + (r.gain || 0); }, 0);
    $('footer').innerHTML =
      'Gasto total do período completo: ' + money(totalSpend) + ' (já com imposto ×' + taxStr(TAX) + '). ' +
      'Fonte: <b>Meta Graph API</b> (insights nível anúncio) · conta <code>' + esc(m.account || '') + '</code> + planilha da Lilian (seguidores lançados à mão). ' +
      '<b>Visitas ao perfil do Instagram</b> = instagram_profile_visits (' + int(totVis) + ' no total) · <b>Novos seguidores</b> = coluna N · Seguid. (' + int(totFol) + ' no total). ' +
      'CTR sempre de <b>link</b>. Somente leitura.';

    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
      b.onclick = function () {
        var p = b.dataset.preset;
        if (p === 'all') return setPeriod(minDate, maxDate, 'all');
        if (p === 'today') return setPeriod(maxDate, maxDate, 'today');
        if (p === 'yesterday') { var y = dayAdd(maxDate, -1); return setPeriod(y, y, 'yesterday'); }
        if (p === 'month') return setPeriod(firstOfMonth(maxDate), maxDate, 'month');
        var n = +p; return setPeriod(dayAdd(maxDate, -(n - 1)), maxDate, p);
      };
    });
    function clampDates() { var f = $('from').value, t = $('to').value; if (!f || !t) return; if (f > t) { var tmp = f; f = t; t = tmp; } setPeriod(f, t, 'custom'); }
    $('from').onchange = clampDates; $('to').onchange = clampDates;
    $('cmp').onclick = function (e) { STATE.compare = !STATE.compare; e.currentTarget.classList.toggle('on', STATE.compare); e.currentTarget.setAttribute('aria-pressed', STATE.compare); refresh(); };

    try { var tv = localStorage.getItem('rb-tab'); if (['overview', 'traffic', 'report'].indexOf(tv) >= 0) STATE.tab = tv; } catch (e) { }
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === STATE.tab);
      b.onclick = function () {
        STATE.tab = b.dataset.tab;
        try { localStorage.setItem('rb-tab', STATE.tab); } catch (e) { }
        Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { x.setAttribute('aria-selected', x.dataset.tab === STATE.tab); });
        refresh();
      };
    });

    // abas de comparação: Todas / E1-DIST / Antiga
    try { var cg = localStorage.getItem('rb-campgroup'); if (['all', 'edist', 'old'].indexOf(cg) >= 0) STATE.campGroup = cg; } catch (e) { }
    Array.prototype.forEach.call(document.querySelectorAll('[data-camp-group]'), function (b) {
      b.setAttribute('aria-selected', b.dataset.campGroup === STATE.campGroup);
      b.onclick = function () {
        STATE.campGroup = b.dataset.campGroup;
        try { localStorage.setItem('rb-campgroup', STATE.campGroup); } catch (e) { }
        Array.prototype.forEach.call(document.querySelectorAll('[data-camp-group]'), function (x) { x.setAttribute('aria-selected', x.dataset.campGroup === STATE.campGroup); });
        refresh();
      };
    });

    setPeriod(firstOfMonth(maxDate), maxDate, 'month');
  }

  /* ---------------------------------------------------------------- tema */
  function applyTheme(t) { document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? 'Claro' : 'Escuro'; try { localStorage.setItem('rb-theme', t); } catch (e) { } }
  $('theme').onclick = function () { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); };
  $('refresh').onclick = function () { var b = this; b.textContent = '⏳ Atualizando…'; b.disabled = true; setTimeout(function () { location.reload(); }, 60); };
  try { var saved = localStorage.getItem('rb-theme'); applyTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')); } catch (e) { applyTheme('dark'); }

  /* ---------------------------------------------------------------- boot */
  TIP = $('tip');
  var rt;
  addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (daily.length) refresh(); }, 180); });
  if (!daily.length) { $('overviewView').innerHTML = '<div class="panel"><div class="loading">Sem dados. Rode o build.</div></div>'; }
  else shell();
  // upgrade: seguidores AO VIVO da planilha (aparece no F5, sem esperar o rebuild de hora em hora)
  if (daily.length) fetchLiveFollowers().then(applyLiveFollowers);
})();
