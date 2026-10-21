/* Michael González | Panel de Michael
   Esta pantalla no guarda datos de clientes en el teléfono. Todo viaja por el puente (Apps Script),
   que solo responde a la clave de Michael y deja anotado en la Bitácora lo que él hace y lo que consulta. */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbyRzND4gkwm0CiIqCqVgAx0hARZvmSZpE9HqCbJ_QB6CUTv3aYlHpdFNk7M0-wYMa8bfw/exec';
  var LS_CLAVE = 'mgm_clave', LS_TEMA = 'mg_tema';
  var clave = leerLS(LS_CLAVE);
  var S = { tab: 'hoy', datos: {}, planSel: null, semanaSel: null, clienteSel: null, cargado: {}, filtro: 'todos', q: '', fotos: {} };
  var toastTimer = null, urlsPdf = [];

  var TABS = [
    { id: 'hoy', label: 'Hoy', icon: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', accion: 'admin_hoy' },
    { id: 'resumen', label: 'Resumen', icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', accion: 'admin_resumen' },
    { id: 'clientes', label: 'Clientes', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', accion: 'admin_clientes' },
    { id: 'planes', label: 'Planes', icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>', accion: 'admin_planes' },
    { id: 'pagos', label: 'Pagos', icon: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>', accion: 'admin_pagos' }
  ];
  var FLECHA = '<svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var ATRAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var ANGULOS = [['frontal', 'Frontal'], ['lateral', 'Lateral'], ['posterior', 'Posterior']];
  var FILTROS = [['todos', 'Todos'], ['activos', 'Activos'], ['ingreso', 'En ingreso'], ['atencion', 'Requieren atención'], ['pausa', 'En pausa']];

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escribirLS(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return String(n).replace('.', ','); }
  function dinero(n) { var v = Number(n); return n !== '' && n !== null && n !== undefined && isFinite(v) ? '$ ' + v.toLocaleString('es-CO') : '—'; }
  function pct(x) { return x === null || x === undefined ? '—' : Math.round(x * 100) + '%'; }
  function fechaLarga(s) { return s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }) : ''; }
  function fechaCorta(s) { return s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function saludo() { var h = new Date().getHours(); return h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches'); }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function sinTildes(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function clasePago(e) { return e === 'Validado' ? 'validado' : (e === 'Rechazado' ? 'rechazado' : (e === 'Pendiente de validación' ? 'validacion' : 'pendiente')); }
  function clasePlan(e) { return e === 'Aprobado' ? 'validado' : (e === 'Por aprobar' ? 'validacion' : 'pendiente'); }
  function claseCliente(e) { return e === 'Activo' ? 'validado' : (e === 'En ingreso' ? 'ing' : 'na'); }

  /* ---------- gráficas pequeñas (SVG, sin librerías) ---------- */
  function barrasMeses(meses) {
    var max = Math.max.apply(null, meses.map(function (m) { return Math.max(m.ingresos, m.gastos); }).concat([1])), out = '';
    meses.forEach(function (m, i) {
      var x = 12 + i * 46, hi = Math.max(1, Math.round(96 * m.ingresos / max)), hg = Math.max(1, Math.round(96 * m.gastos / max));
      out += '<rect class="b-in" x="' + x + '" y="' + (100 - hi) + '" width="14" height="' + hi + '" rx="3"/><rect class="b-out" x="' + (x + 16) + '" y="' + (100 - hg) + '" width="14" height="' + hg + '" rx="3"/>' +
        '<text x="' + (x + 15) + '" y="114" text-anchor="middle">' + esc(String(m.mes).split(' ')[0]) + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 300 120" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">' + out + '</svg>' +
      '<div class="legend"><span><i></i>Ingresos</span><span><i class="o"></i>Gastos</span></div>';
  }
  function barrasSemanas(semanal) {
    var max = Math.max.apply(null, semanal.map(function (w) { return w.n; }).concat([1])), out = '';
    semanal.forEach(function (w, i) {
      var x = 10 + i * 36, h = Math.max(2, Math.round(60 * w.n / max));
      out += '<rect class="b-in" x="' + x + '" y="' + (70 - h) + '" width="24" height="' + h + '" rx="4"/><text x="' + (x + 12) + '" y="82" text-anchor="middle">' + w.n + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 300 90" role="img" aria-label="Sesiones por semana en las últimas 8 semanas">' + out + '</svg>';
  }
  function lineaPeso(peso) {
    if (peso.length < 2) return '';
    var vals = peso.map(function (p) { return p.valor; }), min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), rango = (max - min) || 1, pts = [];
    peso.forEach(function (p, i) { pts.push((10 + i * (280 / (peso.length - 1))).toFixed(1) + ',' + (60 - 50 * (p.valor - min) / rango).toFixed(1)); });
    var ult = pts[pts.length - 1].split(',');
    return '<svg class="chart" viewBox="0 0 300 70" role="img" aria-label="Evolución del peso"><polyline class="spark" points="' + pts.join(' ') + '"/><circle class="dot" cx="' + ult[0] + '" cy="' + ult[1] + '" r="4"/></svg>';
  }

  /* ---------- conexión con el puente ---------- */
  function api(accion, datos) {
    var cuerpo = JSON.stringify(Object.assign({ accion: accion, clave: clave }, datos || {}));
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) {
          var e = new Error((j && j.error) || 'No pudimos completar la acción. Inténtalo de nuevo.');
          e.usuario = true;
          e.sesion = /clave no es correcta|no es la de Michael|acceso está en pausa/.test(e.message);
          throw e;
        }
        return j.datos;
      })
      .catch(function (e) {
        if (e && e.usuario) throw e;
        var x = new Error('No hay conexión. Revisa tu internet e inténtalo de nuevo.');
        x.red = true; throw x;
      });
  }
  function manejarError(e, donde) {
    if (e && e.sesion && clave) { cerrarSesion(e.message); return; }
    var msg = (e && e.message) || 'No pudimos completar la acción.';
    if (donde) donde.innerHTML = '<div class="banner err" role="alert">' + esc(msg) + '</div><div style="margin-top:14px"><button class="btn ghost" data-act="reintentar">Intentar de nuevo</button></div>';
    else toast(msg);
  }

  /* ---------- avisos y hojas ---------- */
  function toast(m) {
    var t = $('toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3600);
  }
  function abrirHoja(html) {
    $('sheet').innerHTML = '<div class="sheet-bg" data-act="cerrarHoja"></div><div class="sheet-body" role="dialog" aria-modal="true">' + html + '</div>';
    $('sheet').hidden = false;
  }
  function cerrarHoja() {
    $('sheet').hidden = true; $('sheet').innerHTML = '';
    urlsPdf.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* nada */ } }); urlsPdf = [];
  }
  function cargando(el) { el.innerHTML = '<div class="skel big"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:55%"></div>'; }
  function ocupar(btn, si) { if (btn) { btn.classList.toggle('busy', !!si); btn.disabled = !!si; } }

  /* ---------- navegación ---------- */
  function dibujarNav() {
    $('nav').innerHTML = TABS.map(function (t) {
      return '<button data-act="ir" data-t="' + t.id + '" aria-current="' + (S.tab === t.id ? 'page' : 'false') + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + t.icon + '</svg><span>' + t.label + '</span></button>';
    }).join('');
  }
  function mostrarTab(tab) {
    S.tab = tab;
    TABS.forEach(function (t) { $('s-' + t.id).classList.toggle('on', t.id === tab); });
    dibujarNav();
  }
  function ir(tab, forzar) {
    if (tab !== 'planes') S.planSel = null;
    if (tab !== 'clientes') S.clienteSel = null;
    mostrarTab(tab);
    cargarPantalla(tab, forzar);
  }
  function cargarPantalla(tab, forzar) {
    var el = $('s-' + tab), previo = S.datos[tab];
    if (tab === 'planes' && S.planSel) { cargarPlan(S.planSel, forzar); return; }
    if (tab === 'clientes' && S.clienteSel) { cargarCliente(S.clienteSel, forzar); return; }
    if (previo && !forzar) dibujar(tab, previo); else cargando(el);
    var def = TABS.filter(function (t) { return t.id === tab; })[0];
    api(def.accion).then(function (d) {
      S.datos[tab] = d; S.cargado[tab] = Date.now();
      if (S.tab === tab && !(tab === 'planes' && S.planSel) && !(tab === 'clientes' && S.clienteSel)) dibujar(tab, d);
    }).catch(function (e) { if (S.tab === tab && (!previo || forzar)) manejarError(e, el); else if (e && e.sesion) manejarError(e); });
  }
  function dibujar(tab, d) {
    if (tab === 'hoy') dibujarHoy(d); else if (tab === 'resumen') dibujarResumen(d); else if (tab === 'planes') dibujarPlanes(d);
    else if (tab === 'pagos') dibujarPagos(d); else dibujarClientes(d);
  }
  function invalidar() { S.datos = {}; S.cargado = {}; }

  /* ---------- Hoy ---------- */
  function filaHoy(x, quien) {
    var act;
    if (quien === 'Michael' && x.pagoId && x.paso === 'Validar su pago') act = 'data-act="abrirPago" data-id="' + esc(x.pagoId) + '"';
    else if (quien === 'Michael' && x.planId) act = 'data-act="abrirPlan" data-id="' + esc(x.planId) + '"';
    else act = 'data-act="abrirCliente" data-id="' + esc(x.id) + '"';
    return '<button class="row tap" ' + act + '><span class="t"><b>' + esc(x.nombre) + '</b><span>' + esc(x.paso) + '</span></span>' + FLECHA + '</button>';
  }
  function grupoHoy(titulo, nota, lista, quien) {
    if (!lista.length) return '';
    return '<div class="group"><h2>' + titulo + '<span>' + nota + '</span></h2><div class="list" style="margin-top:4px">' + lista.map(function (x) { return filaHoy(x, quien); }).join('') + '</div></div>';
  }
  function dibujarHoy(d) {
    var tuyo = d.items.filter(function (x) { return x.quien === 'Michael'; });
    var nata = d.items.filter(function (x) { return x.quien === 'Nata'; });
    var espera = d.items.filter(function (x) { return x.quien === 'Cliente'; });
    var lead = tuyo.length === 0 ? 'No hay nada esperando tu decisión.' : (tuyo.length === 1 ? 'Hay 1 cosa esperando tu decisión.' : 'Hay ' + tuyo.length + ' cosas esperando tu decisión.');
    $('s-hoy').innerHTML = '<div class="hello">' + saludo() + '<h1>Michael</h1></div><p class="lead">' + lead + '</p>' +
      (d.items.length ? '' : '<div class="empty"><b>Todo al día</b>Cuando un cliente avance, aquí verás lo siguiente.</div>') +
      grupoHoy('Para ti', tuyo.length + (tuyo.length === 1 ? ' pendiente' : ' pendientes'), tuyo, 'Michael') +
      grupoHoy('Para Nata', 'No necesitas hacer nada', nata, 'Nata') +
      grupoHoy('Esperando al cliente', 'Por ahora, nada', espera, 'Cliente');
  }

  /* ---------- Resumen ---------- */
  function kpi(l, v, extra, clase) { return '<div class="kpi"><span class="l">' + esc(l) + '</span><span class="v ' + (clase || '') + '">' + esc(v) + '</span>' + (extra ? '<span class="s">' + esc(extra) + '</span>' : '') + '</div>'; }
  function dibujarResumen(d) {
    var di = d.dinero, c = d.clientes, o = d.operacion, v = d.ventas, cap = d.capacidad;
    var maxEmb = Math.max.apply(null, v.embudo.map(function (e) { return e.n; }).concat([1]));
    var embudo = v.embudo.map(function (e) { return '<div><span>' + esc(e.estado) + '</span><span class="bar"><i style="width:' + Math.round(100 * e.n / maxEmb) + '%"></i></span><b>' + e.n + '</b></div>'; }).join('');
    var paquetes = c.porPaquete.length ? '<div class="list" style="margin-top:12px">' + c.porPaquete.map(function (p) { return '<div class="row still"><span class="t"><b>' + esc(p.paquete) + '</b></span><span class="tag validado">' + p.n + '</span></div>'; }).join('') + '</div>' : '';
    var res = di.resultado;
    $('s-resumen').innerHTML = '<h1>Resumen</h1><p class="lead">Cómo va el negocio, de un vistazo.</p>' +
      '<div class="block"><h2>Dinero</h2><div class="kpis">' + kpi('Ingresos del mes', dinero(di.ingresosMes)) + kpi('Gastos del mes', dinero(di.gastosMes)) +
        kpi('Resultado del mes', dinero(res), '', res === null ? '' : (res >= 0 ? 'good' : 'bad')) + kpi('Esperado, próximos 30 días', dinero(di.esperados30)) + '</div>' +
        (di.meses.length ? barrasMeses(di.meses) : '') + '</div>' +
      '<div class="block"><h2>Clientes</h2><div class="kpis">' + kpi('Activos', c.activos) + kpi('En ingreso', c.enIngreso) + kpi('Altas este mes', c.altasMes) + kpi('Bajas este mes', c.bajasMes, c.pausados ? plural(c.pausados, 'cliente en pausa o inactivo', 'clientes en pausa o inactivos') : '') + '</div>' + paquetes + '</div>' +
      '<div class="block"><h2>Entrenamiento</h2><div class="kpis">' + kpi('Sesiones esta semana', o.sesionesSemana.hechas + ' de ' + o.sesionesSemana.programadas, 'hechas de programadas') +
        kpi('Adherencia promedio', pct(o.adherenciaPromedio), 'mínimo ' + pct(o.adherenciaMinima), o.adherenciaPromedio !== null && o.adherenciaPromedio < o.adherenciaMinima ? 'bad' : '') +
        kpi('Sin entrenar 7 días o más', o.sinEntrenar, o.sinEntrenar ? 'Revisa en Hoy' : 'Todos al día', o.sinEntrenar ? 'bad' : 'good') + '</div></div>' +
      '<div class="block"><h2>Ventas</h2><div class="fun">' + embudo + '</div><div class="kpis">' + kpi('Conversión', pct(v.conversion), 'de los prospectos cerrados') + kpi('Sin seguimiento', v.sinSeguimiento, v.sinSeguimiento ? 'Prospectos por retomar' : 'Al día', v.sinSeguimiento ? 'bad' : 'good') + '</div></div>' +
      '<div class="block"><h2>Capacidad</h2><div class="kpis">' + kpi('Cupos libres', typeof cap.libres === 'number' ? cap.libres : 'Sin definir', 'sesiones por semana') + kpi('Ocupación', typeof cap.ocupacion === 'number' ? pct(cap.ocupacion) : 'Sin definir') + '</div></div>';
  }

  /* ---------- Clientes: buscador y lista ---------- */
  function coincide(c) {
    var q = sinTildes(S.q).trim();
    if (q && sinTildes(c.nombre).indexOf(q) < 0 && sinTildes(c.id).indexOf(q) < 0) return false;
    if (S.filtro === 'activos') return c.estado === 'Activo';
    if (S.filtro === 'ingreso') return c.estado === 'En ingreso';
    if (S.filtro === 'atencion') return c.prioridad <= 5;
    if (S.filtro === 'pausa') return c.estado === 'Pausado' || c.estado === 'Inactivo';
    return true;
  }
  function dibujarClientes(lista) {
    var el = $('s-clientes');
    if (!lista.length) { el.innerHTML = '<h1>Clientes</h1><div class="empty"><b>Todavía no hay clientes</b>Cuando des de alta al primero, aparecerá aquí.</div>'; return; }
    el.innerHTML = '<h1>Clientes</h1><div class="search"><input id="buscar" type="search" inputmode="search" autocomplete="off" placeholder="Buscar por nombre o código" aria-label="Buscar cliente" value="' + esc(S.q) + '"></div>' +
      '<div class="chips" role="group" aria-label="Filtrar">' + FILTROS.map(function (f) { return '<button data-act="filtro" data-f="' + f[0] + '" aria-pressed="' + (S.filtro === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<div class="countline" id="cuenta" aria-live="polite"></div><div class="list" id="listaClientes" style="margin-top:6px"></div>';
    pintarLista();
  }
  function pintarLista() {
    var lista = S.datos.clientes || [], visibles = lista.filter(coincide), cont = $('listaClientes');
    if (!cont) return;
    $('cuenta').textContent = plural(visibles.length, 'cliente', 'clientes') + (visibles.length !== lista.length ? ' de ' + lista.length : '');
    cont.innerHTML = visibles.length ? visibles.map(function (c) {
      var corte = c.corte && c.estado === 'Activo' ? ' · corte ' + fechaLarga(c.corte) : '';
      return '<button class="row tap" data-act="abrirCliente" data-id="' + esc(c.id) + '"><span class="t"><b>' + esc(c.nombre) + '</b><span>' + esc(c.paso) + esc(corte) + '</span></span><span class="tag ' + claseCliente(c.estado) + '">' + esc(c.estado) + '</span></button>';
    }).join('') : '<div class="empty"><b>No encontré a nadie</b>Prueba con otro nombre o cambia el filtro.</div>';
  }

  /* ---------- Clientes: ficha ---------- */
  function abrirCliente(id) {
    if (S.tab !== 'clientes') mostrarTab('clientes');
    S.planSel = null; S.clienteSel = id; cargarCliente(id, false);
  }
  function cargarCliente(id, forzar) {
    var el = $('s-clientes'), previo = (S.datos.cliente || {})[id];
    if (previo && !forzar) dibujarCliente(previo); else cargando(el);
    api('admin_cliente', { id: id }).then(function (d) {
      S.datos.cliente = S.datos.cliente || {}; S.datos.cliente[id] = d;
      if (S.tab === 'clientes' && S.clienteSel === id) dibujarCliente(d);
    }).catch(function (e) { if (S.tab === 'clientes' && S.clienteSel === id) manejarError(e, el); else if (e && e.sesion) manejarError(e); });
  }
  function delta(a, b, unidad) {
    var x = Number(a), y = Number(b);
    if (a === '' || b === '' || !isFinite(x) || !isFinite(y)) return null;
    var d = Math.round((y - x) * 10) / 10;
    return num(x) + ' → ' + num(y) + ' ' + unidad + ' (' + (d > 0 ? '+' : (d < 0 ? '−' : '')) + num(Math.abs(d)) + ')';
  }
  function dibujarCliente(d) {
    var c = d.cliente, p = d.plan, u = d.ultima, seg = d.seguimiento;
    var wa = c.whatsapp ? '<a class="btn block-btn" style="margin-top:16px" href="https://wa.me/' + esc(c.whatsapp) + '" target="_blank" rel="noopener noreferrer">Escribirle por WhatsApp</a>' : '';
    var corte = c.proximoCorte ? fechaLarga(c.proximoCorte) : '—';
    var kpis = '<div class="kpis">' + kpi('Con Michael desde hace', c.antiguedad, c.ingreso ? fechaCorta(c.ingreso) : '') +
      kpi('Próximo corte', corte, c.diasCorte === null ? '' : (c.diasCorte < 0 ? 'venció hace ' + plural(-c.diasCorte, 'día', 'días') : (c.diasCorte === 0 ? 'es hoy' : 'en ' + plural(c.diasCorte, 'día', 'días')))) +
      kpi('Adherencia', p ? pct(p.adherencia) : '—', p && p.programadasHastaHoy ? p.hechas + ' de ' + p.programadasHastaHoy + ' sesiones' : 'Sin sesiones programadas todavía') +
      kpi('Última sesión', u ? (u.dias === 0 ? 'Hoy' : 'Hace ' + plural(u.dias, 'día', 'días')) : 'Aún ninguna', u ? u.sesion + (u.sensacion ? ' · ' + u.sensacion : '') : '') + '</div>';
    var plan = p ? '<div class="block"><h2>Plan vigente</h2><div class="block" style="margin-top:0"><div class="kv"><span>Objetivo</span><span>' + esc(p.objetivo || '—') + '</span></div>' +
      '<div class="kv"><span>Ciclo</span><span>' + esc(fechaLarga(p.inicio)) + ' al ' + esc(fechaLarga(p.corte)) + '</span></div>' +
      '<div class="kv"><span>Sesiones hechas</span><span>' + p.hechas + ' de ' + p.total + '</span></div></div>' +
      (p.adherencia !== null ? '<div class="bar' + (p.adherencia < 0.6 ? ' low' : '') + '" role="img" aria-label="Adherencia ' + pct(p.adherencia) + '"><i style="width:' + Math.min(100, Math.round(p.adherencia * 100)) + '%"></i></div>' : '') +
      '<div style="margin-top:12px"><button class="btn ghost" data-act="abrirPlan" data-id="' + esc(p.id) + '">Ver el plan</button></div></div>' : '<div class="block"><h2>Plan vigente</h2><p class="muted">Todavía no tiene un plan aprobado.</p></div>';
    var filas = [['Peso', 'peso', 'kg'], ['Cintura', 'cintura', 'cm'], ['Cadera', 'cadera', 'cm'], ['Brazo', 'brazo', 'cm'], ['Muslo', 'muslo', 'cm']].map(function (m) {
      var con = seg.filter(function (r) { return r[m[1]] !== '' && r[m[1]] !== null; });
      if (!con.length) return '';
      var ult = con[con.length - 1][m[1]], txt = con.length > 1 ? delta(con[0][m[1]], ult, m[2]) : num(ult) + ' ' + m[2];
      return '<div class="kv"><span>' + m[0] + '</span><span class="delta">' + esc(txt) + '</span></div>';
    }).join('');
    var progreso = '<div class="block"><h2>Progreso</h2>' + (filas ? '<div class="block" style="margin-top:0">' + filas + '</div>' : '<p class="muted">Todavía no ha anotado medidas.</p>') +
      lineaPeso(d.progreso.peso) + '<p class="small muted" style="margin-top:14px">Sesiones por semana, últimas 8 semanas</p>' + barrasSemanas(d.progreso.semanal) + '</div>';
    var conFoto = seg.filter(function (r) { return r.fotos.frontal || r.fotos.lateral || r.fotos.posterior; });
    var comparar = ANGULOS.filter(function (a) { return conFoto.filter(function (r) { return r.fotos[a[0]]; }).length > 1; }).map(function (a) { return '<button class="btn ghost" data-act="comparar" data-a="' + a[0] + '">Comparar ' + a[1].toLowerCase() + '</button>'; }).join('');
    var fotos = '<div class="block"><h2>Fotos de progreso</h2>' + (conFoto.length ? '<div class="chips" style="margin-top:0" role="group" aria-label="Fechas con fotos">' + conFoto.slice().reverse().map(function (r) { return '<button data-act="verFotos" data-f="' + esc(r.fecha) + '">' + esc(fechaCorta(r.fecha)) + '</button>'; }).join('') + '</div>' +
      (comparar ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">' + comparar + '</div>' : '') : '<p class="muted">Todavía no ha subido fotos.</p>') + '</div>';
    var coms = d.comentarios.length ? '<div class="block"><h2>Lo que ha dicho</h2>' + d.comentarios.map(function (m) { return '<div class="cm"><b>' + esc(m.sesion) + '</b><span>' + esc(fechaLarga(m.fecha)) + (m.sensacion ? ' · ' + esc(m.sensacion) : '') + '</span><p>' + esc(m.comentario) + '</p></div>'; }).join('') + '</div>' : '';
    var pagos = '<div class="block"><h2>Pagos</h2>' + (d.pagos.length ? '<div class="list" style="margin-top:0">' + d.pagos.map(function (g) {
      return '<button class="row tap" data-act="verComprobante" data-id="' + esc(g.id) + '"' + (g.comprobante ? '' : ' data-sin="1"') + '><span class="t"><b>' + (g.corte ? 'Corte del ' + esc(fechaLarga(g.corte)) : 'Pago') + '</b><span>' + esc(dinero(g.monto)) + '</span></span><span class="tag ' + clasePago(g.estado) + '">' + esc(g.estado) + '</span></button>';
    }).join('') + '</div>' : '<p class="muted">Todavía no hay pagos.</p>') + '</div>';
    var docs = '<div class="block"><h2>Documentos</h2><div class="block" style="margin-top:0"><div class="kv"><span>Autorización de datos</span><span>' + (d.firmas.autorizacion ? 'Firmada' : 'Pendiente') + '</span></div><div class="kv"><span>Contrato</span><span>' + (d.firmas.contrato ? 'Firmado' : 'Pendiente') + '</span></div></div></div>';
    $('s-clientes').innerHTML = '<button class="back" data-act="volverClientes">' + ATRAS + 'Clientes</button><h1>' + esc(c.nombre) + '</h1>' +
      '<p class="lead"><span class="tag ' + claseCliente(c.estado) + '">' + esc(c.estado) + '</span> ' + esc(c.servicio) + (c.ciudad ? ' · ' + esc(c.ciudad) : '') + '</p>' + wa + kpis + plan + progreso + fotos + coms + pagos + docs +
      (c.baja ? '<div class="banner" style="margin-top:24px">Se dio de baja el ' + esc(fechaLarga(c.baja)) + (c.motivoBaja ? '. Motivo: ' + esc(c.motivoBaja) : '') + '.</div>' : '');
  }

  /* ---------- Fotos y comprobantes dentro del panel ---------- */
  function guardarFoto(k, r) {
    S.fotos[k] = r; var ks = Object.keys(S.fotos); if (ks.length > 12) delete S.fotos[ks[0]];
  }
  function imagenSegura(r) { return /^image\/(jpeg|png|webp)$/.test(r.mime) ? '<img alt="" src="data:' + r.mime + ';base64,' + r.datos + '">' : ''; }
  function cargarFoto(id, fecha, angulo, destino) {
    var k = id + '|' + fecha + '|' + angulo, poner = function (html) { var el = $(destino); if (el) el.innerHTML = html; };
    if (S.fotos[k]) { poner(imagenSegura(S.fotos[k])); return; }
    api('admin_foto', { id: id, fecha: fecha, angulo: angulo }).then(function (r) { guardarFoto(k, r); poner(imagenSegura(r) || 'No se puede mostrar'); })
      .catch(function (e) { if (e && e.sesion) { manejarError(e); return; } poner(esc(e.message)); });
  }
  function seguimientoDe(id) { return ((S.datos.cliente || {})[id] || {}).seguimiento || []; }
  function verFotos(fecha) {
    var id = S.clienteSel, reg = seguimientoDe(id).filter(function (r) { return r.fecha === fecha; })[0];
    if (!reg) return;
    var slots = ANGULOS.map(function (a) {
      return '<figure><div class="ph" id="ph-' + a[0] + '">' + (reg.fotos[a[0]] ? '<div class="skel big"></div>' : 'Sin foto') + '</div><figcaption>' + a[1] + '</figcaption></figure>';
    }).join('');
    abrirHoja('<h2>' + esc(fechaCorta(fecha)) + '</h2><div class="photos">' + slots + '</div><div style="margin-top:18px"><button class="btn ghost block-btn" data-act="cerrarHoja">Cerrar</button></div>');
    ANGULOS.forEach(function (a) { if (reg.fotos[a[0]]) cargarFoto(id, fecha, a[0], 'ph-' + a[0]); });
  }
  function comparar(angulo) {
    var id = S.clienteSel, regs = seguimientoDe(id).filter(function (r) { return r.fotos[angulo]; });
    if (regs.length < 2) { toast('Hacen falta al menos dos fotos para comparar.'); return; }
    var a = regs[0], b = regs[regs.length - 1], nombre = ANGULOS.filter(function (x) { return x[0] === angulo; })[0][1];
    abrirHoja('<h2>' + nombre + ': primera y última</h2><div class="photos pair"><figure><div class="ph" id="ph-a"><div class="skel big"></div></div><figcaption>' + esc(fechaCorta(a.fecha)) + '</figcaption></figure>' +
      '<figure><div class="ph" id="ph-b"><div class="skel big"></div></div><figcaption>' + esc(fechaCorta(b.fecha)) + '</figcaption></figure></div><div style="margin-top:18px"><button class="btn ghost block-btn" data-act="cerrarHoja">Cerrar</button></div>');
    cargarFoto(id, a.fecha, angulo, 'ph-a'); cargarFoto(id, b.fecha, angulo, 'ph-b');
  }
  function verComprobante(id, sinArchivo) {
    if (sinArchivo) { toast('Ese pago todavía no tiene comprobante.'); return; }
    abrirHoja('<h2>Comprobante</h2><div class="proof" id="proof"><div class="skel big"></div></div><div style="margin-top:18px"><button class="btn ghost block-btn" data-act="cerrarHoja">Cerrar</button></div>');
    api('admin_comprobante', { id: id }).then(function (r) {
      var el = $('proof'); if (!el) return;
      if (/^image\/(jpeg|png|webp)$/.test(r.mime)) { el.innerHTML = imagenSegura(r); return; }
      if (r.mime === 'application/pdf' && typeof URL !== 'undefined' && URL.createObjectURL) {
        var bin = atob(r.datos), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); urlsPdf.push(u);
        el.innerHTML = '<p class="muted" style="margin-bottom:12px">Es un PDF.</p><a class="btn block-btn" href="' + u + '" target="_blank" rel="noopener">Abrir el PDF</a>'; return;
      }
      el.innerHTML = '<p class="muted">No se puede mostrar este tipo de archivo.</p>';
    }).catch(function (e) { if (e && e.sesion) { manejarError(e); return; } var el = $('proof'); if (el) el.innerHTML = '<div class="banner err">' + esc(e.message) + '</div>'; });
  }

  /* ---------- Planes ---------- */
  function dibujarPlanes(lista) {
    var el = $('s-planes');
    if (!lista.length) { el.innerHTML = '<h1>Planes</h1><div class="empty"><b>Todavía no hay planes</b>Cuando Nata cargue una propuesta, la verás aquí para aprobarla.</div>'; return; }
    el.innerHTML = '<h1>Planes</h1><p class="lead">Revisa y aprueba lo que prepara Nata.</p><div class="list">' + lista.map(function (p) {
      return '<button class="row tap" data-act="abrirPlan" data-id="' + esc(p.id) + '"><span class="t"><b>' + esc(p.cliente) + '</b><span>' + esc(p.objetivo || 'Sin objetivo todavía') + '</span></span><span class="tag ' + clasePlan(p.estado) + '">' + esc(p.estado) + '</span></button>';
    }).join('') + '</div>';
  }
  function abrirPlan(id) {
    S.clienteSel = null; S.planSel = id; S.semanaSel = null;
    if (S.tab !== 'planes') mostrarTab('planes');
    cargarPlan(id, false);
  }
  function cargarPlan(id, forzar) {
    var el = $('s-planes'), previo = (S.datos.plan || {})[id];
    if (previo && !forzar) dibujarPlan(previo); else cargando(el);
    api('admin_plan', { id: id }).then(function (d) {
      S.datos.plan = S.datos.plan || {}; S.datos.plan[id] = d;
      if (S.tab === 'planes' && S.planSel === id) dibujarPlan(d);
    }).catch(function (e) { if (S.tab === 'planes' && S.planSel === id) manejarError(e, el); else if (e && e.sesion) manejarError(e); });
  }
  function dibujarPlan(d) {
    var p = d.plan, semanas = Object.keys(d.semanas).sort(function (a, b) { return a - b; });
    if (!S.semanaSel || semanas.indexOf(String(S.semanaSel)) < 0) S.semanaSel = semanas[0] || null;
    var seg = semanas.map(function (k) { return '<button data-act="semana" data-w="' + k + '" aria-pressed="' + (String(k) === String(S.semanaSel)) + '">Semana ' + k + '</button>'; }).join('');
    var sesiones = (S.semanaSel && d.semanas[S.semanaSel] || []).map(function (s) {
      var ejs = s.ejercicios.map(function (e) {
        var peso = (e.peso === '' || e.peso === null) ? 'peso por definir' : num(e.peso) + ' kg';
        return '<div class="ex-line"><b>' + esc(e.nombre) + '</b><span>' + esc(e.series) + ' × ' + esc(e.repeticiones) + ' · descanso ' + esc(e.descanso) + ' s · ' + esc(peso) + '</span>' + (e.nota ? '<span>' + esc(e.nota) + '</span>' : '') + '</div>';
      }).join('');
      return '<details class="sess"><summary><span class="d">' + esc(s.dia) + '</span><span class="t"><b>' + esc(s.nombre) + '</b><span>' + esc(fechaLarga(s.fecha)) + ' · ' + esc(s.duracion) + ' min · ' + s.ejercicios.length + ' ejercicios</span></span>' + CHEV + '</summary>' + ejs + '</details>';
    }).join('');
    var acciones = (p.estado === 'Por aprobar' ? '<button class="btn block-btn" data-act="pedirAprobar">Aprobar plan</button>' : '') +
      '<button class="btn ghost block-btn" data-act="pedirNota">Dejar una nota</button>';
    $('s-planes').innerHTML = '<button class="back" data-act="volverPlanes">' + ATRAS + 'Planes</button>' +
      '<h1>' + esc(p.cliente) + '</h1><p class="lead"><span class="tag ' + clasePlan(p.estado) + '">' + esc(p.estado) + '</span></p>' +
      '<div class="block" style="margin-top:20px"><div class="kv"><span>Objetivo</span><span>' + esc(p.objetivo || '—') + '</span></div>' +
      '<div class="kv"><span>Ciclo</span><span>' + esc(fechaLarga(p.inicio)) + ' al ' + esc(fechaLarga(p.corte)) + '</span></div></div>' +
      (p.recomendacion ? '<div class="block"><h2>Lo que ve el cliente</h2><div class="quote"><p>' + esc(p.recomendacion) + '</p></div></div>' : '') +
      (p.notas ? '<div class="block"><h2>Notas para ti</h2><div class="notes">' + esc(p.notas) + '</div><span class="private">Solo tú ves esto. Léelo antes de aprobar.</span></div>' : '') +
      '<div class="block"><h2>Sesiones</h2>' + (semanas.length ? '<div class="seg" style="margin-top:0" role="group" aria-label="Semana">' + seg + '</div><div class="list" style="margin-top:8px">' + sesiones + '</div>' : '<p class="muted">Este plan todavía no tiene sesiones.</p>') + '</div>' +
      '<div class="actions">' + acciones + '</div>';
  }
  function pedirAprobar() {
    var p = S.datos.plan[S.planSel].plan;
    abrirHoja('<h2>¿Aprobar este plan?</h2><p class="muted" style="margin:8px 0 18px">Quedará aprobado y ' + esc(p.cliente) + ' lo verá en su app en cuanto esté activo.</p>' +
      '<button class="btn block-btn" data-act="aprobar">Aprobar plan</button><div style="height:10px"></div><button class="btn ghost block-btn" data-act="cerrarHoja">Cancelar</button>');
  }
  function aprobar(btn) {
    ocupar(btn, true);
    var idPlan = S.planSel;
    api('admin_aprobarPlan', { id: idPlan }).then(function () {
      cerrarHoja(); toast('Plan aprobado.'); invalidar(); if (S.tab === 'planes' && S.planSel === idPlan) cargarPlan(idPlan, true);
    }).catch(function (e) { ocupar(btn, false); if (e && e.sesion) manejarError(e); else { cerrarHoja(); toast(e.message); } });
  }
  function pedirNota() {
    abrirHoja('<h2>Dejar una nota</h2><p class="muted" style="margin:8px 0 14px">Queda en las notas del plan, para que Nata la vea.</p><textarea id="notaTxt" maxlength="400" aria-label="Nota" placeholder="Por ejemplo: subir el peso en la semana 3"></textarea>' +
      '<button class="btn block-btn" data-act="guardarNota">Guardar nota</button><div style="height:10px"></div><button class="btn ghost block-btn" data-act="cerrarHoja">Cancelar</button>');
  }
  function guardarNota(btn) {
    var txt = ($('notaTxt') || {}).value || '';
    if (!txt.trim()) { toast('Escribe la nota primero.'); return; }
    ocupar(btn, true);
    var idNota = S.planSel;
    api('admin_notaPlan', { id: idNota, nota: txt }).then(function () {
      cerrarHoja(); toast('Nota guardada.'); delete (S.datos.plan || {})[idNota]; if (S.tab === 'planes' && S.planSel === idNota) cargarPlan(idNota, true);
    }).catch(function (e) { ocupar(btn, false); if (e && e.sesion) manejarError(e); else toast(e.message); });
  }

  /* ---------- Pagos ---------- */
  function dibujarPagos(lista) {
    var el = $('s-pagos');
    if (!lista.length) { el.innerHTML = '<h1>Pagos</h1><div class="empty"><b>Todavía no hay pagos</b>Cuando un cliente suba un comprobante, lo verás aquí para validarlo.</div>'; return; }
    el.innerHTML = '<h1>Pagos</h1><p class="lead">Valida los comprobantes que suben tus clientes.</p><div class="list">' + lista.map(function (p) {
      return '<button class="row tap" data-act="abrirPago" data-id="' + esc(p.id) + '"><span class="t"><b>' + esc(p.cliente) + '</b><span>' + (p.corte ? 'Corte del ' + esc(fechaLarga(p.corte)) + ' · ' : '') + esc(dinero(p.monto)) + '</span></span><span class="tag ' + clasePago(p.estado) + '">' + esc(p.estado) + '</span></button>';
    }).join('') + '</div>';
  }
  function buscarPago(id) { return (S.datos.pagos || []).filter(function (p) { return p.id === id; })[0] || null; }
  function abrirPagoDetalle(id) {
    var p = buscarPago(id);
    if (!p) { toast('Actualicé la lista de pagos.'); ir('pagos', true); return; }
    var original = p.moneda && p.moneda !== 'COP' ? '<div class="kv"><span>Pagó en</span><span>' + esc(p.moneda) + (p.montoOriginal !== '' ? ' ' + esc(num(p.montoOriginal)) : '') + '</span></div>' : '';
    var accion = '';
    if (p.estado === 'Pendiente de validación') {
      accion = '<label class="small muted" for="montoRec">Monto recibido en pesos</label><div class="moneyin"><span>$</span><input id="montoRec" type="number" inputmode="numeric" min="0" step="1" value="' + esc(Number(p.monto) || '') + '"></div>' +
        '<button class="btn block-btn" data-act="validarPago" data-id="' + esc(p.id) + '">Validar pago</button><div style="height:10px"></div>' +
        '<button class="btn ghost block-btn" data-act="pedirRechazo" data-id="' + esc(p.id) + '">Rechazar</button>';
    } else {
      accion = '<button class="btn ghost block-btn" data-act="cerrarHoja">Cerrar</button>';
    }
    abrirHoja('<h2>' + esc(p.cliente) + '</h2><p style="margin-top:4px"><span class="tag ' + clasePago(p.estado) + '">' + esc(p.estado) + '</span></p>' +
      '<div class="block" style="margin-top:14px"><div class="kv"><span>Corte</span><span>' + esc(p.corte ? fechaLarga(p.corte) : '—') + '</span></div>' +
      '<div class="kv"><span>Monto</span><span>' + esc(dinero(p.monto)) + '</span></div>' + original +
      '<div class="kv"><span>Comprobante</span><span>' + (p.comprobante ? '<button class="linkbtn" data-act="verComprobante" data-id="' + esc(p.id) + '">Ver aquí</button>' : 'Sin archivo') + '</span></div></div>' +
      '<div style="margin-top:18px">' + accion + '</div>');
  }
  function validarPago(btn, id) {
    var v = ($('montoRec') || {}).value, datos = { id: id, decision: 'Validado' };
    if (v !== undefined && v !== '') {
      if (!(Number(v) > 0)) { toast('Revisa el monto recibido.'); return; }
      datos.monto = Number(v);
    }
    ocupar(btn, true);
    api('admin_validarPago', datos).then(function () { cerrarHoja(); toast('Pago validado.'); invalidar(); if (S.tab === 'pagos') ir('pagos', true); })
      .catch(function (e) { ocupar(btn, false); if (e && e.sesion) manejarError(e); else toast(e.message); });
  }
  function pedirRechazo(id) {
    abrirHoja('<h2>Rechazar comprobante</h2><p class="muted" style="margin:8px 0 14px">El cliente verá que debe subirlo de nuevo.</p><textarea id="motivoTxt" maxlength="200" aria-label="Motivo" placeholder="Motivo, por ejemplo: la captura no se ve completa"></textarea>' +
      '<button class="btn block-btn" data-act="rechazarPago" data-id="' + esc(id) + '">Rechazar comprobante</button><div style="height:10px"></div><button class="btn ghost block-btn" data-act="cerrarHoja">Cancelar</button>');
  }
  function rechazarPago(btn, id) {
    ocupar(btn, true);
    api('admin_validarPago', { id: id, decision: 'Rechazado', motivo: ($('motivoTxt') || {}).value || '' }).then(function () { cerrarHoja(); toast('Comprobante rechazado.'); invalidar(); if (S.tab === 'pagos') ir('pagos', true); })
      .catch(function (e) { ocupar(btn, false); if (e && e.sesion) manejarError(e); else toast(e.message); });
  }
  function abrirPago(id) {
    if (S.tab !== 'pagos') mostrarTab('pagos');
    S.planSel = null; S.clienteSel = null;
    if (!S.datos.pagos) { api('admin_pagos').then(function (d) { S.datos.pagos = d; dibujarPagos(d); abrirPagoDetalle(id); }).catch(function (er) { manejarError(er); }); }
    else { dibujarPagos(S.datos.pagos); abrirPagoDetalle(id); }
  }

  /* ---------- Sesión ---------- */
  function mostrarApp() { $('login').hidden = true; ir('hoy', true); }
  function cerrarSesion(mensaje) {
    clave = null; escribirLS(LS_CLAVE, null); S.datos = {}; S.planSel = null; S.clienteSel = null; S.cargado = {}; S.fotos = {}; S.q = ''; S.filtro = 'todos';
    $('clave').value = ''; $('err').textContent = mensaje || ''; $('login').hidden = false; cerrarHoja();
  }
  function entrar() {
    var valor = $('clave').value.trim();
    if (!valor) { $('err').textContent = 'Escribe tu clave para entrar.'; $('clave').focus(); return; }
    var b = $('btnEntrar'); b.classList.add('busy'); $('err').textContent = '';
    clave = valor;
    api('admin_login').then(function () { escribirLS(LS_CLAVE, clave); b.classList.remove('busy'); mostrarApp(); })
      .catch(function (e) { clave = null; b.classList.remove('busy'); $('err').textContent = e.message; });
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if (a === 'entrar') entrar();
    else if (a === 'ir') ir(el.getAttribute('data-t'));
    else if (a === 'reintentar') cargarPantalla(S.tab, true);
    else if (a === 'abrirPlan') abrirPlan(id);
    else if (a === 'volverPlanes') { S.planSel = null; cargarPantalla('planes', false); }
    else if (a === 'semana') { S.semanaSel = el.getAttribute('data-w'); dibujarPlan(S.datos.plan[S.planSel]); }
    else if (a === 'pedirAprobar') pedirAprobar();
    else if (a === 'aprobar') aprobar(el);
    else if (a === 'pedirNota') pedirNota();
    else if (a === 'guardarNota') guardarNota(el);
    else if (a === 'abrirCliente') abrirCliente(id);
    else if (a === 'volverClientes') { S.clienteSel = null; cargarPantalla('clientes', false); }
    else if (a === 'filtro') { S.filtro = el.getAttribute('data-f'); dibujarClientes(S.datos.clientes || []); }
    else if (a === 'verFotos') verFotos(el.getAttribute('data-f'));
    else if (a === 'comparar') comparar(el.getAttribute('data-a'));
    else if (a === 'verComprobante') verComprobante(id, el.getAttribute('data-sin') === '1');
    else if (a === 'abrirPago') abrirPago(id);
    else if (a === 'validarPago') validarPago(el, id);
    else if (a === 'pedirRechazo') pedirRechazo(id);
    else if (a === 'rechazarPago') rechazarPago(el, id);
    else if (a === 'cerrarHoja') cerrarHoja();
    else if (a === 'salir') cerrarSesion('');
  });
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'buscar') { S.q = e.target.value; pintarLista(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'clave') entrar();
    if (e.key === 'Escape' && !$('sheet').hidden) cerrarHoja();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !clave || $('login').hidden === false) return;
    if (S.cargado[S.tab] && Date.now() - S.cargado[S.tab] > 60000 && !S.planSel && !S.clienteSel && $('sheet').hidden) cargarPantalla(S.tab, true);
  });

  /* ---------- Inicio ---------- */
  var tema = leerLS(LS_TEMA);
  if (tema === 'dark' || tema === 'light') document.documentElement.setAttribute('data-theme', tema);
  dibujarNav();
  if (clave) { $('login').hidden = true; ir('hoy', true); } else { $('login').hidden = false; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo sin conexión */ });
})();
