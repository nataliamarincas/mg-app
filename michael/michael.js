/* Michael González | Panel de Michael
   Esta pantalla no guarda datos de clientes. Todo viaja por el puente (Apps Script),
   que solo responde a la clave de Michael y deja anotado en la Bitácora lo que él hace. */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbyRzND4gkwm0CiIqCqVgAx0hARZvmSZpE9HqCbJ_QB6CUTv3aYlHpdFNk7M0-wYMa8bfw/exec';
  var LS_CLAVE = 'mgm_clave', LS_TEMA = 'mg_tema';
  var clave = leerLS(LS_CLAVE);
  var S = { tab: 'hoy', datos: {}, planSel: null, semanaSel: null, cargado: {} };
  var toastTimer = null;

  var TABS = [
    { id: 'hoy', label: 'Hoy', icon: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', accion: 'admin_hoy' },
    { id: 'planes', label: 'Planes', icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>', accion: 'admin_planes' },
    { id: 'pagos', label: 'Pagos', icon: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>', accion: 'admin_pagos' },
    { id: 'clientes', label: 'Clientes', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', accion: 'admin_clientes' }
  ];
  var FLECHA = '<svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var ATRAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escribirLS(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return String(n).replace('.', ','); }
  function dinero(n) { var v = Number(n); return isFinite(v) && n !== '' && n !== null ? '$ ' + v.toLocaleString('es-CO') : ''; }
  function fechaLarga(s) { return s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }) : ''; }
  function saludo() { var h = new Date().getHours(); return h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches'); }
  function urlSegura(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }
  function clasePago(e) { return e === 'Validado' ? 'validado' : (e === 'Rechazado' ? 'rechazado' : (e === 'Pendiente de validación' ? 'validacion' : 'pendiente')); }
  function clasePlan(e) { return e === 'Aprobado' ? 'validado' : (e === 'Por aprobar' ? 'validacion' : 'pendiente'); }
  function claseCliente(e) { return e === 'Activo' ? 'validado' : (e === 'En ingreso' ? 'ing' : 'na'); }

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
  function cerrarHoja() { $('sheet').hidden = true; $('sheet').innerHTML = ''; }
  function cargando(el) { el.innerHTML = '<div class="skel big"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:55%"></div>'; }
  function ocupar(btn, si) { if (btn) { btn.classList.toggle('busy', !!si); btn.disabled = !!si; } }

  /* ---------- navegación ---------- */
  function dibujarNav() {
    $('nav').innerHTML = TABS.map(function (t) {
      return '<button data-act="ir" data-t="' + t.id + '" aria-current="' + (S.tab === t.id ? 'page' : 'false') + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + t.icon + '</svg><span>' + t.label + '</span></button>';
    }).join('');
  }
  function ir(tab, forzar) {
    if (tab !== 'planes') S.planSel = null;
    S.tab = tab;
    TABS.forEach(function (t) { $('s-' + t.id).classList.toggle('on', t.id === tab); });
    dibujarNav();
    cargarPantalla(tab, forzar);
  }
  function cargarPantalla(tab, forzar) {
    var el = $('s-' + tab), previo = S.datos[tab];
    if (tab === 'planes' && S.planSel) { cargarPlan(S.planSel, forzar); return; }
    if (previo && !forzar) dibujar(tab, previo); else cargando(el);
    var def = TABS.filter(function (t) { return t.id === tab; })[0];
    api(def.accion).then(function (d) {
      S.datos[tab] = d; S.cargado[tab] = Date.now();
      if (S.tab === tab && !(tab === 'planes' && S.planSel)) dibujar(tab, d);
    }).catch(function (e) { if (S.tab === tab && (!previo || forzar)) manejarError(e, el); else if (e && e.sesion) manejarError(e); });
  }
  function dibujar(tab, d) {
    if (tab === 'hoy') dibujarHoy(d); else if (tab === 'planes') dibujarPlanes(d);
    else if (tab === 'pagos') dibujarPagos(d); else dibujarClientes(d);
  }
  function invalidar() { S.datos = {}; S.cargado = {}; }

  /* ---------- Hoy ---------- */
  function filaHoy(x, quien) {
    var act;
    if (quien === 'Michael') {
      if (x.pagoId && x.paso === 'Validar su pago') act = 'data-act="abrirPago" data-id="' + esc(x.pagoId) + '"';
      else if (x.planId) act = 'data-act="abrirPlan" data-id="' + esc(x.planId) + '"';
      else act = 'data-act="aviso" data-m="Ese corte todavía no tiene comprobante. Escríbele a ' + esc(x.nombre) + ' por WhatsApp."';
    } else if (quien === 'Nata') {
      act = 'data-act="aviso" data-m="Esto lo hace Nata desde el computador. No tienes que hacer nada."';
    } else {
      act = 'data-act="aviso" data-m="Está esperando al cliente. Cuando avance, te aparecerá lo siguiente."';
    }
    return '<button class="row tap" ' + act + '><span class="t"><b>' + esc(x.nombre) + '</b><span>' + esc(x.paso) + '</span></span>' + (quien === 'Michael' ? FLECHA : '') + '</button>';
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

  /* ---------- Planes ---------- */
  function dibujarPlanes(lista) {
    var el = $('s-planes');
    if (!lista.length) { el.innerHTML = '<h1>Planes</h1><div class="empty"><b>Todavía no hay planes</b>Cuando Nata cargue una propuesta, la verás aquí para aprobarla.</div>'; return; }
    el.innerHTML = '<h1>Planes</h1><p class="lead">Revisa y aprueba lo que prepara Nata.</p><div class="list">' + lista.map(function (p) {
      return '<button class="row tap" data-act="abrirPlan" data-id="' + esc(p.id) + '"><span class="t"><b>' + esc(p.cliente) + '</b><span>' + esc(p.objetivo || 'Sin objetivo todavía') + '</span></span><span class="tag ' + clasePlan(p.estado) + '">' + esc(p.estado) + '</span></button>';
    }).join('') + '</div>';
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
  function abrirPago(id) {
    var p = buscarPago(id);
    if (!p) { toast('Actualicé la lista de pagos.'); ir('pagos', true); return; }
    var url = urlSegura(p.comprobante);
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
      '<div class="kv"><span>Monto</span><span>' + esc(dinero(p.monto) || '—') + '</span></div>' + original +
      '<div class="kv"><span>Comprobante</span><span>' + (url ? '<a class="linkbtn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Abrir</a>' : 'Sin archivo') + '</span></div></div>' +
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

  /* ---------- Clientes ---------- */
  function dibujarClientes(lista) {
    var el = $('s-clientes');
    if (!lista.length) { el.innerHTML = '<h1>Clientes</h1><div class="empty"><b>Todavía no hay clientes</b>Cuando des de alta al primero, aparecerá aquí.</div>'; return; }
    el.innerHTML = '<h1>Clientes</h1><p class="lead">Cómo va cada uno y qué sigue.</p><div class="list">' + lista.map(function (c) {
      var corte = c.corte && c.estado === 'Activo' ? ' · corte ' + fechaLarga(c.corte) : '';
      return '<div class="row still"><span class="t"><b>' + esc(c.nombre) + '</b><span>' + esc(c.paso) + esc(corte) + '</span></span><span class="tag ' + claseCliente(c.estado) + '">' + esc(c.estado) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- Sesión ---------- */
  function mostrarApp() { $('login').hidden = true; ir('hoy', true); }
  function cerrarSesion(mensaje) {
    clave = null; escribirLS(LS_CLAVE, null); S.datos = {}; S.planSel = null; S.cargado = {};
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
    else if (a === 'aviso') toast(el.getAttribute('data-m'));
    else if (a === 'abrirPlan') { S.planSel = id; S.semanaSel = null; if (S.tab !== 'planes') { S.tab = 'planes'; TABS.forEach(function (t) { $('s-' + t.id).classList.toggle('on', t.id === 'planes'); }); dibujarNav(); } cargarPlan(id, false); }
    else if (a === 'volverPlanes') { S.planSel = null; cargarPantalla('planes', false); }
    else if (a === 'semana') { S.semanaSel = el.getAttribute('data-w'); dibujarPlan(S.datos.plan[S.planSel]); }
    else if (a === 'pedirAprobar') pedirAprobar();
    else if (a === 'aprobar') aprobar(el);
    else if (a === 'pedirNota') pedirNota();
    else if (a === 'guardarNota') guardarNota(el);
    else if (a === 'abrirPago') { if (S.tab !== 'pagos') { S.tab = 'pagos'; TABS.forEach(function (t) { $('s-' + t.id).classList.toggle('on', t.id === 'pagos'); }); dibujarNav(); } if (!S.datos.pagos) { api('admin_pagos').then(function (d) { S.datos.pagos = d; dibujarPagos(d); abrirPago(id); }).catch(function (er) { manejarError(er); }); } else { dibujarPagos(S.datos.pagos); abrirPago(id); } }
    else if (a === 'validarPago') validarPago(el, id);
    else if (a === 'pedirRechazo') pedirRechazo(id);
    else if (a === 'rechazarPago') rechazarPago(el, id);
    else if (a === 'cerrarHoja') cerrarHoja();
    else if (a === 'salir') cerrarSesion('');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'clave') entrar();
    if (e.key === 'Escape' && !$('sheet').hidden) cerrarHoja();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !clave || $('login').hidden === false) return;
    if (S.cargado[S.tab] && Date.now() - S.cargado[S.tab] > 60000 && !S.planSel && $('sheet').hidden) cargarPantalla(S.tab, true);
  });

  /* ---------- Inicio ---------- */
  var tema = leerLS(LS_TEMA);
  if (tema === 'dark' || tema === 'light') document.documentElement.setAttribute('data-theme', tema);
  dibujarNav();
  if (clave) { $('login').hidden = true; ir('hoy', true); } else { $('login').hidden = false; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo sin conexión */ });
})();
