/* Michael González | Portal del Cliente
   Esta app no guarda datos de clientes. Todo viaja por el puente (Apps Script),
   que verifica la clave personal y devuelve solo lo de esa persona. */
(function () {
  'use strict';

  var API_URL = 'https://script.google.com/macros/s/AKfycbyRzND4gkwm0CiIqCqVgAx0hARZvmSZpE9HqCbJ_QB6CUTv3aYlHpdFNk7M0-wYMa8bfw/exec';
  var WHATSAPP_MICHAEL = '573229082935'; // WhatsApp de Michael con indicativo de país (57), sin signos

  var LS_CLAVE = 'mg_clave', LS_TEMA = 'mg_tema';
  var clave = leerLS(LS_CLAVE);
  var S = { tab: 'inicio', datos: {}, sesionId: null, semanaSel: null, vista: 'front', ses: null, hechos: {}, kg: {}, restLeft: 0, ejercicioFuerza: null };
  var restTimer = null, toastTimer = null, debounces = {};

  var TABS = [
    { id: 'inicio', label: 'Inicio', icon: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
    { id: 'plan', label: 'Mi Plan', icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>' },
    { id: 'entrenar', label: 'Entrenar', icon: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>' },
    { id: 'progreso', label: 'Progreso', icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
    { id: 'seguimiento', label: 'Seguimiento', icon: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>' },
    { id: 'pagos', label: 'Pagos', icon: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>' },
    { id: 'perfil', label: 'Perfil', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>' }
  ];
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var DUMB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>';
  var CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  var ETIQUETA = { Completada: 'Hecha', Pendiente: 'Próxima', Omitida: 'Omitida', Validado: 'Validado', 'Pendiente de validación': 'Pendiente de validación', Rechazado: 'Rechazado', Firmado: 'Firmado' };

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escribirLS(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return String(n).replace('.', ','); }
  function dinero(n) { var v = Number(n); return isFinite(v) ? '$ ' + v.toLocaleString('es-CO') : ''; }
  function hoyStr() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fechaLarga(s, conDia) {
    if (!s) return '';
    var d = new Date(s + 'T12:00:00');
    return d.toLocaleDateString('es-CO', conDia ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long' });
  }
  function etiquetaDia(s) {
    if (!s) return '';
    var h = hoyStr();
    if (s === h) return 'Hoy';
    var man = new Date(h + 'T12:00:00'); man.setDate(man.getDate() + 1);
    var ms = man.getFullYear() + '-' + ('0' + (man.getMonth() + 1)).slice(-2) + '-' + ('0' + man.getDate()).slice(-2);
    if (s === ms) return 'Mañana';
    var t = fechaLarga(s, true); return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function saludo() { var h = new Date().getHours(); return h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches'); }
  function urlSegura(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }

  /* ---------- conexión con el puente ---------- */
  function api(accion, datos) {
    var cuerpo = JSON.stringify(Object.assign({ accion: accion, clave: clave }, datos || {}));
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) {
          var e = new Error((j && j.error) || 'No pudimos completar la acción. Inténtalo de nuevo.');
          e.usuario = true;
          e.sesion = /clave no es correcta|acceso está en pausa|cuenta está en pausa/.test(e.message);
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

  /* ---------- avisos, hojas y descanso ---------- */
  function toast(m) {
    var t = $('toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function abrirHoja(html) {
    $('sheet').innerHTML = '<div class="sheet-bg" data-act="cerrarHoja"></div><div class="sheet-body" role="dialog" aria-modal="true">' + html + '</div>';
    $('sheet').hidden = false;
  }
  function cerrarHoja() { $('sheet').hidden = true; $('sheet').innerHTML = ''; }
  function mostrarDescanso() { var m = Math.floor(S.restLeft / 60), s = S.restLeft % 60; $('restTime').textContent = m + ':' + (s < 10 ? '0' : '') + s; }
  function pararDescanso() { clearInterval(restTimer); restTimer = null; S.restLeft = 0; $('rest').hidden = true; }
  function iniciarDescanso(seg) {
    clearInterval(restTimer); S.restLeft = seg; $('rest').hidden = false; mostrarDescanso();
    restTimer = setInterval(function () {
      S.restLeft--;
      if (S.restLeft <= 0) { pararDescanso(); toast('Descanso terminado. Sigue con la próxima serie.'); } else mostrarDescanso();
    }, 1000);
  }
  function cargando(el) { el.innerHTML = '<div class="skel big"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:55%"></div>'; }

  /* ---------- navegación ---------- */
  function dibujarNav() {
    $('nav').innerHTML = TABS.map(function (t) {
      return '<button data-act="ir" data-t="' + t.id + '" aria-label="' + t.label + '"' + (t.id === S.tab ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + t.icon + '</svg><span>' + t.label + '</span></button>';
    }).join('');
  }
  function ir(tab, forzar) {
    S.tab = tab;
    TABS.forEach(function (t) { $('s-' + t.id).classList.toggle('on', t.id === tab); });
    dibujarNav();
    cargarPantalla(tab, forzar);
    $('s-' + tab).scrollTop = 0;
  }
  function cargarPantalla(tab, forzar) {
    var el = $('s-' + tab);
    var clavesAccion = { inicio: 'home', plan: 'plan', progreso: 'progreso', seguimiento: 'seguimiento', pagos: 'pagos', perfil: 'perfil' };
    if (tab === 'entrenar') { cargarEntrenar(forzar); return; }
    var accion = clavesAccion[tab];
    var previo = S.datos[tab];
    if (previo && !forzar) { dibujar(tab, previo); } else { cargando(el); }
    var extra = tab === 'progreso' && S.ejercicioFuerza ? { ejercicio: S.ejercicioFuerza } : null;
    var pedidos = [api(accion, extra)];
    if (tab === 'perfil') pedidos.push(api('documentos'));
    Promise.all(pedidos).then(function (r) {
      S.datos[tab] = tab === 'perfil' ? { perfil: r[0], docs: r[1] } : r[0];
      if (S.tab === tab) dibujar(tab, S.datos[tab]);
    }).catch(function (e) { if (S.tab === tab && (!previo || forzar)) manejarError(e, el); else if (e && e.sesion) manejarError(e); });
  }
  function dibujar(tab, d) {
    ({ inicio: dibujarInicio, plan: dibujarPlan, progreso: dibujarProgreso, seguimiento: dibujarSeguimiento, pagos: dibujarPagos, perfil: dibujarPerfil })[tab](d);
  }
  function invalidar() { S.datos = {}; }

  /* ---------- Inicio ---------- */
  function dibujarInicio(d) {
    var el = $('s-inicio');
    var h = '<div class="hello">' + saludo() + '<h1>' + esc(d.nombre) + '</h1></div>' +
      '<div class="welcome"><p>Te doy la bienvenida a tu espacio. Aquí registras cómo entrenas y cómo te sientes, y ves tu avance mes a mes.</p>' +
      '<p>Yo reviso lo que anotas y ajusto tu plan contigo. Cuéntame todo, por pequeño que parezca.</p><p class="by">Michael</p></div>';
    if (!d.plan) {
      el.innerHTML = h + '<div class="banner">' + esc(d.mensaje || 'Michael está preparando tu plan. Te avisa aquí cuando esté listo.') + '</div>' + bloqueCorte(d);
      return;
    }
    var p = d.proxima, hoy = hoyStr(), hero;
    if (p) {
      var listo = p.fecha && p.fecha <= hoy;
      hero = '<p class="k">Tu próximo entrenamiento</p><h2>' + esc(p.nombre) + '</h2><p class="m">' + esc(etiquetaDia(p.fecha)) + (p.duracion ? ', ' + esc(p.duracion) + ' minutos' : '') + '.</p>' +
        (listo ? '<button class="btn" data-act="empezar" data-id="' + esc(p.id) + '">Empezar sesión</button>'
               : '<button class="btn" data-act="aviso" data-m="Esta sesión se abre ' + esc(etiquetaDia(p.fecha).toLowerCase()) + '.">Disponible ' + esc(etiquetaDia(p.fecha).toLowerCase()) + '</button>');
    } else {
      hero = '<p class="k">Tu próximo entrenamiento</p><h2>Plan completo</h2><p class="m">Hiciste todas las sesiones de este ciclo. Michael prepara el siguiente.</p>';
    }
    var hechas = d.sesiones.hechas, total = d.sesiones.total, pct = total ? Math.round(hechas / total * 100) : 0;
    h += '<div class="hero"><img class="mk" src="img/logo-mark.png" alt="">' + hero + '</div>' +
      '<div class="block"><h2>Tu plan de este ciclo</h2>' +
      '<div class="plan-line"><span class="num">' + hechas + '</span><span class="muted">de ' + total + ' sesiones (' + pct + '%)</span></div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + hechas + '" aria-label="Sesiones del plan"><i style="width:' + pct + '%"></i></div>' +
      (d.corte ? '<div class="cut"><span>Tu fecha de corte es el ' + esc(fechaLarga(d.corte)) + '</span><b>' + (d.diasCorte === 0 ? 'Es hoy' : 'Faltan ' + d.diasCorte + ' días') + '</b></div>' : '') +
      '<div class="week" aria-label="Tu semana">' + d.semana.map(function (s) {
        var cls = s.estado === 'Completada' ? 'done' : (s.estado === 'Omitida' ? 'omit' : '');
        if (s.hoy) cls += ' today';
        return '<div class="day ' + cls + '"><i>' + (s.estado === 'Completada' ? CHECK : '') + '</i>' + esc(s.dia) + '</div>';
      }).join('') + '</div></div>';
    h += '<div class="block"><h2>Tu cuerpo esta semana</h2><p class="muted" style="margin-bottom:4px">Mira qué músculos has trabajado y cuáles vienen.</p><button class="btn ghost block-btn" style="margin-top:12px" data-act="ir" data-t="progreso">Ver mi mapa del cuerpo</button></div>';
    var mp = d.mesPasado;
    h += '<div class="block"><h2>' + (mp ? 'El ciclo pasado' : 'Tu constancia') + '</h2><div class="stats">' +
      '<div><span class="num">' + (mp ? mp.sesiones : hechas) + '</span><span class="l">sesiones</span></div>' +
      '<div><span class="num">' + d.racha + '</span><span class="l">semanas seguidas</span></div>' +
      (mp && mp.asistencia !== null ? '<div><span class="num">' + mp.asistencia + '%</span><span class="l">de asistencia</span></div>' : '') + '</div></div>';
    if (d.plan.recomendacion) h += '<div class="block"><h2>Recomendación de Michael</h2><div class="quote"><p>' + esc(d.plan.recomendacion) + '</p><p class="by">Michael</p></div></div>';
    el.innerHTML = h;
  }
  function bloqueCorte(d) {
    return d.corte ? '<div class="block"><div class="cut" style="border-top:0;margin-top:0"><span>Tu fecha de corte es el ' + esc(fechaLarga(d.corte)) + '</span><b>Faltan ' + d.diasCorte + ' días</b></div></div>' : '';
  }

  /* ---------- Mi Plan ---------- */
  function dibujarPlan(d) {
    var el = $('s-plan');
    if (!d.plan) { el.innerHTML = '<h1>Tu plan</h1><div class="banner">' + esc(d.mensaje) + '</div>'; return; }
    var semanas = Object.keys(d.semanas).sort(function (a, b) { return a - b; });
    if (!semanas.length) { el.innerHTML = '<h1>Tu plan</h1><div class="banner">Tu plan todavía no tiene sesiones. Michael te avisa cuando las cargue.</div>'; return; }
    if (!S.semanaSel || semanas.indexOf(String(S.semanaSel)) < 0) {
      var prox = (S.datos.inicio && S.datos.inicio.proxima) ? String(S.datos.inicio.proxima.semana || '') : '';
      S.semanaSel = semanas.indexOf(prox) >= 0 ? prox : semanas[0];
    }
    var hoy = hoyStr();
    var filas = d.semanas[S.semanaSel].map(function (s) {
      var estado = s.estado === 'Pendiente' && s.fecha === hoy ? 'hoy' : s.estado;
      var cls = estado === 'Completada' ? 'hecha' : (estado === 'hoy' ? 'hoy' : (estado === 'Omitida' ? 'omitida' : 'futura'));
      var txt = estado === 'hoy' ? 'Hoy' : (estado === 'Completada' ? 'Hecha' : (estado === 'Omitida' ? 'Omitida' : 'Próxima'));
      var act = s.estado === 'Pendiente' && s.fecha && s.fecha <= hoy ? 'data-act="empezar" data-id="' + esc(s.id) + '"'
        : (s.estado === 'Completada' ? 'data-act="aviso" data-m="Sesión completada. Puedes ver tu avance en Progreso."' : 'data-act="aviso" data-m="Esta sesión se abre el día que te toca."');
      return '<button class="row" ' + act + '><span class="d">' + esc(s.dia) + '</span><span class="t"><b>' + esc(s.nombre) + '</b><span>' + (s.duracion ? esc(s.duracion) + ' minutos' : '') + (s.fecha ? (s.duracion ? ', ' : '') + esc(fechaLarga(s.fecha)) : '') + '</span></span><span class="tag ' + cls + '">' + txt + '</span></button>';
    }).join('');
    var seg = semanas.map(function (k) { return '<button data-act="semana" data-w="' + k + '" aria-pressed="' + (String(k) === String(S.semanaSel)) + '">Semana ' + k + '</button>'; }).join('');
    el.innerHTML = '<h1>Tu plan</h1>' + (d.plan.objetivo ? '<p class="lead">' + esc(d.plan.objetivo) + '.</p>' : '') +
      (d.plan.corte ? '<p class="note">Tu ciclo termina en tu fecha de corte, el ' + esc(fechaLarga(d.plan.corte)) + '.</p>' : '') +
      '<div class="seg" role="group" aria-label="Semanas del plan">' + seg + '</div><div class="list">' + filas + '</div>' +
      '<p class="note" style="margin-top:20px">Ajusto tu plan con lo que me cuentas después de entrenar.</p>';
  }

  /* ---------- Entrenar ---------- */
  function cargarEntrenar(forzar) {
    var el = $('s-entrenar');
    if (!S.sesionId) {
      var inicio = S.datos.inicio;
      var candidata = inicio && inicio.proxima && inicio.proxima.fecha && inicio.proxima.fecha <= hoyStr() ? inicio.proxima.id : null;
      if (!candidata) {
        el.innerHTML = '<h1>Entrenar</h1><div class="banner">No tienes una sesión lista para hoy. Mira tu plan para ver cuál sigue.</div><div style="margin-top:16px"><button class="btn" data-act="ir" data-t="plan">Ver mi plan</button></div>';
        if (!inicio) api('home').then(function (d) { S.datos.inicio = d; if (S.tab === 'entrenar' && !S.sesionId) cargarEntrenar(); }).catch(function () {});
        return;
      }
      S.sesionId = candidata;
    }
    if (S.ses && S.ses.sesion.id === S.sesionId && !forzar) { dibujarEntrenar(); return; }
    cargando(el);
    api('sesion', { idSesion: S.sesionId }).then(function (r) {
      S.ses = r; S.hechos = {}; S.kg = {};
      r.hechos.forEach(function (h) { S.hechos[h.ejercicio + '|' + h.serie] = true; if (h.peso !== '' && h.peso !== null) S.kg[h.ejercicio] = h.peso; });
      r.ejercicios.forEach(function (e) {
        if (S.kg[e.nombre] === undefined) S.kg[e.nombre] = e.ultimoPeso !== null ? e.ultimoPeso : (e.pesoSugerido !== '' && e.pesoSugerido !== null ? e.pesoSugerido : '');
      });
      if (S.tab === 'entrenar') dibujarEntrenar();
    }).catch(function (e) { S.sesionId = null; manejarError(e, el); });
  }
  function totalSeries() { return S.ses.ejercicios.reduce(function (a, e) { return a + e.series; }, 0); }
  function seriesHechas() { return Object.keys(S.hechos).filter(function (k) { return S.hechos[k]; }).length; }
  function dibujarEntrenar() {
    var el = $('s-entrenar'), r = S.ses, s = r.sesion;
    if (s.estado === 'Completada') {
      el.innerHTML = '<div class="done-box"><div class="ring">' + CHECK + '</div><h1>Sesión completada</h1><p class="lead">Recibí tu feedback. Hiciste ' + seriesHechas() + ' de ' + totalSeries() + ' series.</p>' +
        '<div style="margin-top:24px"><button class="btn" data-act="ir" data-t="progreso">Ver mi progreso</button></div></div>';
      return;
    }
    var top = el.scrollTop, d = seriesHechas(), total = totalSeries(), pct = total ? Math.round(d / total * 100) : 0;
    var lista = r.ejercicios.map(function (e) {
      var sets = '';
      for (var i = 1; i <= e.series; i++) {
        var on = !!S.hechos[e.nombre + '|' + i];
        sets += '<button class="set" data-act="serie" data-e="' + esc(e.nombre) + '" data-i="' + i + '" aria-pressed="' + on + '" aria-label="Serie ' + i + ' de ' + esc(e.nombre) + '">' + (on ? CHECK : i) + '</button>';
      }
      var v = urlSegura(e.video);
      return '<div class="ex"><div class="ex-top"><div class="thumb">' + DUMB + '</div><div class="ex-info"><b>' + esc(e.nombre) + '</b><span>' + e.series + ' series de ' + esc(e.repeticiones) + (e.grupo ? ', ' + esc(String(e.grupo).toLowerCase()) : '') + '</span>' +
        (v ? '<div class="videolink"><a class="linkbtn" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">Ver video</a></div>' : '') +
        (e.nota ? '<div class="note" style="margin-top:4px">' + esc(e.nota) + '</div>' : '') + '</div>' +
        '<label class="kg"><input type="number" inputmode="decimal" min="0" step="0.5" value="' + esc(S.kg[e.nombre]) + '" data-kg="' + esc(e.nombre) + '" aria-label="Peso en kilos para ' + esc(e.nombre) + '"><span>kg</span></label></div><div class="sets">' + sets + '</div></div>';
    }).join('');
    el.innerHTML = '<h1>' + esc(s.nombre) + '</h1><p class="lead">Con calma y buena técnica. Marca cada serie cuando la termines.</p>' +
      '<div class="prog-line"><span><span class="num" style="font-size:28px">' + d + '</span> <span class="muted">de ' + total + ' series</span></span><span class="muted small">' + pct + '%</span></div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + d + '" aria-label="Series completadas"><i style="width:' + pct + '%"></i></div>' +
      '<div>' + lista + '</div><div style="margin-top:24px"><button class="btn block-btn" data-act="finalizar">Finalizar sesión</button></div>';
    el.scrollTop = top;
  }
  function alternarSerie(nombre, i) {
    var r = S.ses, e = r.ejercicios.filter(function (x) { return x.nombre === nombre; })[0];
    if (!e) return;
    var k = nombre + '|' + i, prev = !!S.hechos[k], nuevo = !prev;
    S.hechos[k] = nuevo; dibujarEntrenar();
    if (nuevo) iniciarDescanso(e.descanso || 45);
    var datos = { idSesion: r.sesion.id, ejercicio: nombre, serie: i, repeticiones: e.repeticiones, peso: S.kg[nombre] };
    if (!nuevo) datos.quitar = true;
    api('registrarSerie', datos).catch(function (err) {
      S.hechos[k] = prev; dibujarEntrenar(); manejarError(err);
    });
  }
  function abrirFeedback() {
    var d = seriesHechas(), total = totalSeries();
    abrirHoja('<h2>¿Cómo se sintió la sesión?</h2><p class="muted" style="margin-top:6px">Hiciste ' + d + ' de ' + total + ' series. Leo tu respuesta para ajustar lo que sigue.</p>' +
      '<div class="choices" role="group" aria-label="Cómo se sintió la sesión">' + ['Ligera', 'Bien', 'Exigente', 'Muy dura'].map(function (c) { return '<button class="choice" data-act="sensacion" data-v="' + c + '" aria-pressed="false">' + c + '</button>'; }).join('') + '</div>' +
      '<textarea id="fbtxt" maxlength="500" placeholder="¿Algo que Michael deba saber? (opcional)" aria-label="Comentario para Michael"></textarea>' +
      '<button class="btn block-btn" data-act="enviarFeedback">Enviar a Michael</button><div style="height:8px"></div><button class="btn ghost block-btn" data-act="cerrarHoja">Seguir entrenando</button>');
  }
  var sensacion = null;
  function enviarFeedback(btn) {
    if (!sensacion) { toast('Elige cómo se sintió la sesión antes de enviar.'); return; }
    btn.classList.add('busy');
    api('finalizarSesion', { idSesion: S.ses.sesion.id, sensacion: sensacion, comentario: ($('fbtxt') || {}).value || '' }).then(function () {
      cerrarHoja(); pararDescanso(); S.ses.sesion.estado = 'Completada'; invalidar();
      dibujarEntrenar(); toast('Recibí tu feedback. Buen trabajo hoy.');
    }).catch(function (e) { btn.classList.remove('busy'); manejarError(e); });
  }

  /* ---------- Progreso ---------- */
  var MUSC = {
    pecho: 'Pecho', hombros: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps', dorsales: 'Dorsales', trapecio: 'Trapecio', antebrazos: 'Antebrazos',
    abdomen: 'Abdomen', oblicuos: 'Oblicuos', cuadriceps: 'Cuádriceps', isquios: 'Isquiotibiales', gluteos: 'Glúteos', gemelos: 'Pantorrillas', espaldabaja: 'Espalda baja'
  };
  var ARM = 'M50 106 C 44 106, 42 114, 42 124 C 42 134, 46 142, 52 142 C 57 134, 58 120, 56 108 Z';
  var DELT = 'M60 76 C 54 68, 44 70, 42 82 C 41 92, 44 100, 50 102 C 56 96, 60 88, 60 76 Z';
  var FORE = 'M52 146 C 46 146, 42 158, 40 172 L 38 194 C 40 200, 46 200, 48 196 L 54 162 C 56 154, 56 148, 52 146 Z';
  var FRONT = [['hombros', DELT], ['pecho', 'M98 72 C 88 68, 72 70, 62 80 C 60 92, 66 102, 80 104 C 90 104, 98 98, 98 90 Z'], ['biceps', ARM], ['antebrazos', FORE],
    ['abdomen', 'M98 108 L 84 108 L 84 122 L 98 122 Z M98 126 L 84 126 L 84 140 L 98 140 Z M98 144 L 86 144 L 88 160 L 98 160 Z'],
    ['oblicuos', 'M82 108 C 72 110, 66 122, 66 140 C 66 152, 68 160, 72 164 L 84 162 C 82 150, 82 130, 82 108 Z'],
    ['cuadriceps', 'M98 184 C 84 184, 70 192, 68 212 C 66 242, 68 270, 74 294 C 80 298, 90 296, 96 290 C 100 262, 100 222, 98 184 Z'],
    ['gemelos', 'M76 306 C 70 306, 68 320, 70 340 L 74 372 C 78 376, 86 374, 88 370 C 92 350, 92 322, 88 306 Z']];
  var BACK = [['trapecio', 'M100 54 L86 58 C 74 62, 66 68, 62 76 C 70 84, 84 94, 100 108 Z'], ['hombros', DELT],
    ['dorsales', 'M98 114 L 80 98 C 70 96, 62 102, 62 116 C 62 134, 68 150, 80 158 L 98 150 Z'], ['espaldabaja', 'M98 154 L 84 160 C 82 168, 84 176, 92 180 L 98 180 Z'],
    ['triceps', ARM], ['antebrazos', FORE], ['gluteos', 'M98 184 C 86 182, 70 186, 66 200 C 64 214, 74 224, 88 222 C 96 220, 100 212, 98 184 Z'],
    ['isquios', 'M96 228 C 84 228, 70 232, 68 248 C 66 266, 70 284, 76 296 C 84 298, 92 296, 96 292 C 100 270, 100 246, 96 228 Z'],
    ['gemelos', 'M76 304 C 70 304, 68 320, 72 340 C 74 352, 78 362, 80 366 C 84 366, 90 362, 90 356 C 94 340, 94 320, 88 306 Z']];
  var MIR = 'translate(200 0) scale(-1 1)';
  function estadoMusculo(k, d) {
    if ((d.hoy || []).indexOf(k) >= 0) return 'hoy';
    var dias = d.musculos[k];
    return dias !== undefined && dias <= 3 ? 'reciente' : 'libre';
  }
  function textoMusculo(k, d) {
    if ((d.hoy || []).indexOf(k) >= 0) return 'Hoy toca. Está en tu sesión de hoy.';
    var dias = d.musculos[k];
    if (dias === undefined) return 'Todavía no lo has entrenado en este plan.';
    if (dias === 0) return 'Lo entrenaste hoy.';
    return dias <= 3 ? 'Lo entrenaste hace ' + dias + ' días.' : 'Hace ' + dias + ' días que no lo entrenas.';
  }
  function cuerpoSvg(vista, d) {
    var lista = vista === 'front' ? FRONT : BACK;
    function ambos(el) { return el + el.replace('/>', ' transform="' + MIR + '"/>'); }
    var o = '<circle class="base" cx="100" cy="26" r="16"/><rect class="base" x="91" y="38" width="18" height="20" rx="6"/>';
    o += ambos('<path class="base" d="M100 56 L84 58 C70 60, 60 68, 58 80 L60 120 L64 168 L100 180 Z"/>');
    o += ambos('<path class="basel" d="M52 84 L47 142 L42 190" stroke-width="20"/>') + ambos('<circle class="base" cx="41" cy="198" r="8"/>');
    o += ambos('<path class="basel" d="M84 198 L80 298" stroke-width="34"/>') + ambos('<path class="basel" d="M80 306 L80 368" stroke-width="22"/>') + ambos('<ellipse class="base" cx="79" cy="384" rx="12" ry="6"/>');
    lista.forEach(function (it) {
      o += '<g class="mus m-' + estadoMusculo(it[0], d) + '" data-act="musculo" data-m="' + it[0] + '" tabindex="0" role="button" aria-label="' + esc(MUSC[it[0]]) + '. ' + esc(textoMusculo(it[0], d)) + '"><path d="' + it[1] + '"/><path d="' + it[1] + '" transform="' + MIR + '"/></g>';
    });
    return '<svg class="body" viewBox="0 0 200 400" role="group" aria-label="Mapa del cuerpo, vista ' + (vista === 'front' ? 'frontal' : 'posterior') + '">' + o + '</svg>';
  }
  function barras(datos) {
    var W = 340, H = 150, pl = 6, pr = 6, pt = 22, pb = 22, max = Math.max.apply(null, datos.map(function (x) { return x.n; }).concat([1])), n = datos.length, gap = 10, bw = (W - pl - pr - gap * (n - 1)) / n, o = '';
    datos.forEach(function (x, i) {
      var hh = (x.n / max) * (H - pt - pb), xx = pl + i * (bw + gap), yy = H - pb - hh, ult = i === n - 1;
      o += '<rect x="' + xx.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="5" fill="' + (ult ? 'var(--ink)' : 'var(--accent)') + '"/>';
      o += '<text x="' + (xx + bw / 2).toFixed(1) + '" y="' + (yy - 6).toFixed(1) + '" text-anchor="middle" class="' + (ult ? 'val' : '') + '">' + x.n + '</text>';
      o += '<text x="' + (xx + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + (i + 1) + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sesiones por semana en las últimas 8 semanas. Esta semana llevas ' + datos[n - 1].n + '.">' + o + '</svg>';
  }
  function linea(puntos, unidad, etiqueta, ini, fin) {
    var W = 340, H = 150, pl = 10, pr = 10, pt = 26, pb = 24, v = puntos.map(function (p) { return p; }), min = Math.min.apply(null, v), max = Math.max.apply(null, v), span = (max - min) || 1, n = v.length;
    function x(i) { return pl + i * (W - pl - pr) / (n - 1); }
    function y(val) { return pt + (1 - (val - min) / span) * (H - pt - pb); }
    var d = v.map(function (val, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val).toFixed(1); }).join(' '), L = n - 1;
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(etiqueta) + '"><line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (H - pb + 6) + '" y2="' + (H - pb + 6) + '" stroke="var(--line)"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + x(L).toFixed(1) + '" cy="' + y(v[L]).toFixed(1) + '" r="5.5" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>' +
      '<text class="val" x="' + (x(L) - 2).toFixed(1) + '" y="' + (y(v[L]) - 12).toFixed(1) + '" text-anchor="end">' + num(v[L]) + ' ' + unidad + '</text>' +
      '<text x="' + pl + '" y="' + (H - 4) + '">' + esc(ini) + '</text><text x="' + (W - pr) + '" y="' + (H - 4) + '" text-anchor="end">' + esc(fin) + '</text></svg>';
  }
  function dibujarProgreso(d) {
    var el = $('s-progreso');
    var pesoPts = d.peso.map(function (p) { return p.valor; });
    var fz = d.fuerza.serie.filter(function (p) { return p.peso !== null; });
    var selector = d.ejercicios.length > 1 ? '<select class="select" data-act="cambiarEjercicio" aria-label="Ejercicio">' + d.ejercicios.map(function (n) { return '<option' + (n === d.fuerza.ejercicio ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' : '';
    el.innerHTML = '<h1>Tu progreso</h1><p class="lead">Mira cómo vas. Cada semana cuenta.</p>' +
      '<div class="block"><h2>Tu cuerpo esta semana</h2><p class="muted small" style="margin-top:-6px">Toca un músculo para ver cuándo lo entrenaste.</p><div id="bodybox"></div></div>' +
      '<div class="block"><div class="ch-head"><b>Sesiones por semana</b><span>últimas 8</span></div>' + barras(d.semanal) + '</div>' +
      '<div class="block"><div class="ch-head"><b>Peso corporal</b><span>' + (pesoPts.length > 1 ? (pesoPts[pesoPts.length - 1] - pesoPts[0] < 0 ? 'bajó ' : 'subió ') + num(Math.abs(pesoPts[pesoPts.length - 1] - pesoPts[0]).toFixed(1)) + ' kg' : '') + '</span></div>' +
      (pesoPts.length > 1 ? linea(pesoPts, 'kg', 'Peso corporal en kilos', fechaLarga(d.peso[0].fecha), fechaLarga(d.peso[d.peso.length - 1].fecha)) : '<p class="note">Registra tu peso en Seguimiento para ver aquí cómo cambia.</p>') + '</div>' +
      '<div class="block"><div class="ch-head"><b>' + esc(d.fuerza.ejercicio || 'Tu fuerza') + '</b><span>peso por semana</span></div>' + selector +
      (fz.length > 1 ? linea(fz.map(function (p) { return p.peso; }), 'kg', 'Peso levantado por semana en ' + d.fuerza.ejercicio, fechaLarga(fz[0].semana), fechaLarga(fz[fz.length - 1].semana)) : '<p class="note">Cuando registres tus series en dos semanas distintas, aquí verás cómo sube tu peso.</p>') + '</div>' +
      '<div class="block"><button class="btn ghost block-btn" data-act="ir" data-t="seguimiento">Ver mis fotos y medidas</button></div>';
    dibujarCuerpo();
  }
  function dibujarCuerpo() {
    var box = $('bodybox'), d = S.datos.progreso; if (!box || !d) return;
    box.innerHTML = '<div class="seg" role="group" aria-label="Vista del cuerpo"><button data-act="vista" data-v="front" aria-pressed="' + (S.vista === 'front') + '">Frente</button><button data-act="vista" data-v="back" aria-pressed="' + (S.vista === 'back') + '">Espalda</button></div>' +
      cuerpoSvg(S.vista, d) + '<div class="legend"><span><i class="l1"></i>Toca hoy</span><span><i class="l2"></i>Entrenado en los últimos 3 días</span><span><i class="l3"></i>Más de 3 días sin entrenar</span></div>';
  }

  /* ---------- Imágenes y archivos ---------- */
  function reducirImagen(archivo, maximo, calidad) {
    return new Promise(function (ok, mal) {
      var img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = function () {
        var esc2 = Math.min(1, maximo / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * esc2); c.height = Math.round(img.height * esc2);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', calidad));
      };
      img.onerror = function () { URL.revokeObjectURL(url); mal(new Error('No pudimos leer esa imagen. Prueba con otra.')); };
      img.src = url;
    });
  }
  function preparar(archivo) {
    if (archivo.type === 'application/pdf') {
      if (archivo.size > 6 * 1024 * 1024) return Promise.reject(new Error('El PDF pesa mucho. Sube uno de menos de 6 MB.'));
      return new Promise(function (ok, mal) {
        var r = new FileReader();
        r.onload = function () { ok({ mime: 'application/pdf', datos: String(r.result).split(',')[1] }); };
        r.onerror = function () { mal(new Error('No pudimos leer ese archivo.')); };
        r.readAsDataURL(archivo);
      });
    }
    return reducirImagen(archivo, 1600, 0.82).then(function (url) { return { mime: 'image/jpeg', datos: url.split(',')[1], vista: url }; });
  }

  /* ---------- Seguimiento ---------- */
  var subidas = {};
  function dibujarSeguimiento(d) {
    var el = $('s-seguimiento'), ultimo = d.registros[0], enviadas = (ultimo && ultimo.fecha === hoyStr()) ? ultimo.fotos : {};
    function slot(k, etiqueta) {
      var listo = subidas[k] || enviadas[k];
      var cuerpo = subidas[k] && subidas[k].vista ? '<img src="' + subidas[k].vista + '" alt="Foto ' + etiqueta.toLowerCase() + '"><em>Enviada</em>' : (listo ? CAM + '<span class="ok">Enviada</span>' : CAM + '<span>Subir foto</span>');
      return '<div><label class="slot' + (listo ? ' sent' : '') + '"><input type="file" accept="image/*" data-foto="' + k + '" aria-label="Subir foto ' + etiqueta.toLowerCase() + '"><span class="slot-body">' + cuerpo + '</span></label><div class="slot-name">' + etiqueta + '</div></div>';
    }
    function campo(k, etiqueta, unidad, ph) {
      return '<div class="field"><label for="m-' + k + '">' + etiqueta + '</label><div class="in"><input id="m-' + k + '" type="number" inputmode="decimal" step="0.1" placeholder="' + ph + '" data-m="' + k + '"><span>' + unidad + '</span></div></div>';
    }
    var hist = d.registros.slice(0, 3).map(function (r) {
      var partes = [];
      if (r.peso !== '') partes.push(num(r.peso) + ' kg');
      if (r.cintura !== '') partes.push('cintura ' + num(r.cintura) + ' cm');
      return '<div class="kv"><span>' + esc(r.fecha ? fechaLarga(r.fecha) : '') + '</span><span>' + esc(partes.join(', ')) + '</span></div>';
    }).join('');
    el.innerHTML = '<h1>Seguimiento</h1><p class="lead">Aquí me ayudas a ver tu cambio. Sube tus fotos y medidas cada 4 semanas.</p>' +
      '<div class="block"><h2>Tus fotos</h2><div class="slots">' + slot('frontal', 'Frontal') + slot('lateral', 'Lateral') + slot('posterior', 'Posterior') + '</div><p class="note">Solo yo veo tus fotos.</p></div>' +
      '<div class="block"><h2>Tus medidas</h2><div class="fields">' + campo('peso', 'Peso', 'kg', '68,2') + campo('cintura', 'Cintura', 'cm', '74') + campo('cadera', 'Cadera', 'cm', '98') + campo('brazo', 'Brazo', 'cm', '29') + campo('muslo', 'Muslo', 'cm', '56') + '</div>' +
      '<div style="margin-top:16px"><button class="btn block-btn" data-act="guardarMedidas">Guardar seguimiento</button></div></div>' +
      (hist ? '<div class="block"><h2>Tus últimos registros</h2>' + hist + '</div>' : '');
  }

  /* ---------- Pagos ---------- */
  function dibujarPagos(d) {
    var el = $('s-pagos');
    var actual = d.pagos.filter(function (p) { return p.corte === d.proximoCorte; })[0] || null;
    var estado = actual ? actual.estado : 'Pendiente';
    var cls = estado === 'Validado' ? 'validado' : (estado === 'Rechazado' ? 'rechazado' : (estado === 'Pendiente de validación' ? 'validacion' : 'pendiente'));
    var accion;
    if (estado === 'Pendiente' || estado === 'Rechazado') {
      accion = '<label class="btn file-btn block-btn"><input type="file" accept="image/*,application/pdf" data-comprobante="' + esc(actual ? actual.id : '') + '" aria-label="Subir comprobante de pago">' + (estado === 'Rechazado' ? 'Volver a subir el comprobante' : 'Subir comprobante') + '</label>';
    } else if (estado === 'Validado') {
      accion = '<p class="note" style="margin-top:0">Tu pago está validado. Gracias.</p>';
    } else {
      accion = '<p class="note" style="margin-top:0">Recibí tu comprobante. Lo reviso y te aviso aquí.</p>';
    }
    var monto = actual && actual.monto !== '' ? actual.monto : d.montoMensual;
    var hist = d.pagos.map(function (p) {
      var c = p.estado === 'Validado' ? 'validado' : (p.estado === 'Rechazado' ? 'rechazado' : (p.estado === 'Pendiente de validación' ? 'validacion' : 'pendiente'));
      return '<div class="row" style="cursor:default"><span class="t"><b>Corte del ' + esc(p.corte ? fechaLarga(p.corte) : '') + '</b><span>' + esc(dinero(p.monto)) + (p.nota ? '. ' + esc(p.nota) : '') + '</span></span><span class="tag ' + c + '">' + esc(ETIQUETA[p.estado] || p.estado) + '</span></div>';
    }).join('');
    el.innerHTML = '<h1>Pagos</h1><p class="lead">Transfiere y sube tu comprobante. Yo lo reviso y te confirmo aquí.</p>' +
      '<div class="pay-now"><span class="tag ' + cls + '">' + esc(ETIQUETA[estado] || estado) + '</span><p class="amt">' + esc(dinero(monto) || 'Sin valor definido') + '</p>' +
      '<p class="muted" style="margin-bottom:14px">' + (d.proximoCorte ? 'Tu fecha de corte es el ' + esc(fechaLarga(d.proximoCorte)) + '.' : 'Michael te confirma tu fecha de corte.') + '</p>' + accion + '</div>' +
      (hist ? '<div class="block" style="margin-top:8px"><h2>Historial</h2><div class="list" style="margin-top:0">' + hist + '</div></div>' : '');
  }

  /* ---------- Perfil ---------- */
  function dibujarPerfil(r) {
    var p = r.perfil, dc = r.docs, cur = document.documentElement.getAttribute('data-theme') || 'auto';
    function tb(v, l) { return '<button data-act="tema" data-v="' + v + '" aria-pressed="' + (cur === v) + '">' + l + '</button>'; }
    function doc(nombre, x) {
      var firmado = x.estado === 'Firmado';
      return '<div class="who-doc"><div><b>' + nombre + '</b><span class="s">' + (firmado && x.fecha ? 'Firmado el ' + esc(fechaLarga(x.fecha)) : (firmado ? 'Firmado' : 'Pendiente de firma')) + '</span></div><span class="tag ' + (firmado ? 'hecha' : 'pendiente') + '">' + (firmado ? 'Firmado' : 'Pendiente') + '</span></div>';
    }
    var ini = String(p.nombre || '').split(/\s+/).map(function (x) { return x.charAt(0); }).slice(0, 2).join('').toUpperCase();
    $('s-perfil').innerHTML = '<h1>Tu perfil</h1><div class="who"><div class="avatar" aria-hidden="true">' + esc(ini) + '</div><div><b>' + esc(p.nombre) + '</b>' + (p.desde ? '<span class="muted small">Conmigo desde ' + esc(fechaLarga(p.desde)) + '</span>' : '') + '</div></div>' +
      '<div class="block" style="margin-top:20px"><div class="kv"><span>Modalidad</span><span>' + esc(p.modalidad) + '</span></div><div class="kv"><span>Plan</span><span>' + esc(p.servicio) + '</span></div>' +
      '<div class="kv"><span>Frecuencia</span><span>' + esc(p.sesionesPorSemana) + ' días por semana</span></div><div class="kv"><span>Fecha de corte</span><span>El ' + esc(p.diaCorte) + ' de cada mes</span></div></div>' +
      '<div class="block"><h2>Documentos</h2>' + doc('Contrato y acuerdos', dc.contrato) + doc('Autorización de datos personales', dc.autorizacion) + '</div>' +
      '<div class="block"><h2>Apariencia</h2><div class="seg" style="margin-top:0" role="group" aria-label="Apariencia">' + tb('auto', 'Automática') + tb('dark', 'Oscura') + tb('light', 'Clara') + '</div></div>' +
      '<div class="block">' + (WHATSAPP_MICHAEL ? '<a class="btn block-btn" href="https://wa.me/' + esc(WHATSAPP_MICHAEL) + '" target="_blank" rel="noopener noreferrer">Escribir a Michael</a><div style="height:10px"></div>' : '') +
      '<button class="btn ghost block-btn" data-act="salir">Cerrar sesión</button></div>' +
      '<div class="block"><p class="note">Para tenerla como app: en el iPhone, toca Compartir y luego Añadir a pantalla de inicio. En Android, abre el menú del navegador y elige Instalar aplicación.</p></div>';
  }

  /* ---------- Sesión ---------- */
  function mostrarApp() { $('login').hidden = true; ir('inicio', true); }
  function cerrarSesion(mensaje) {
    pararDescanso(); clave = null; escribirLS(LS_CLAVE, null); S.datos = {}; S.ses = null; S.sesionId = null; subidas = {};
    $('clave').value = ''; $('err').textContent = mensaje || ''; $('login').hidden = false;
  }
  function entrar() {
    var valor = $('clave').value.trim();
    if (!valor) { $('err').textContent = 'Escribe la clave que te envió Michael para entrar.'; $('clave').focus(); return; }
    var b = $('btnEntrar'); b.classList.add('busy'); $('err').textContent = '';
    clave = valor;
    api('login').then(function () { escribirLS(LS_CLAVE, clave); b.classList.remove('busy'); mostrarApp(); })
      .catch(function (e) { clave = null; b.classList.remove('busy'); $('err').textContent = e.message; });
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.getAttribute('data-act');
    if (a === 'entrar') entrar();
    else if (a === 'ir') ir(el.getAttribute('data-t'));
    else if (a === 'reintentar') cargarPantalla(S.tab, true);
    else if (a === 'aviso') toast(el.getAttribute('data-m'));
    else if (a === 'empezar') { S.sesionId = el.getAttribute('data-id'); S.ses = null; ir('entrenar', true); }
    else if (a === 'semana') { S.semanaSel = el.getAttribute('data-w'); dibujarPlan(S.datos.plan); }
    else if (a === 'serie') alternarSerie(el.getAttribute('data-e'), Number(el.getAttribute('data-i')));
    else if (a === 'finalizar') { sensacion = null; abrirFeedback(); }
    else if (a === 'sensacion') { sensacion = el.getAttribute('data-v'); document.querySelectorAll('.choice').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); }); }
    else if (a === 'enviarFeedback') enviarFeedback(el);
    else if (a === 'cerrarHoja') cerrarHoja();
    else if (a === 'saltarDescanso') pararDescanso();
    else if (a === 'vista') { S.vista = el.getAttribute('data-v'); dibujarCuerpo(); }
    else if (a === 'musculo') {
      var k = el.getAttribute('data-m'), d = S.datos.progreso;
      abrirHoja('<h2>' + esc(MUSC[k]) + '</h2><p class="muted" style="margin:6px 0 14px">' + esc(textoMusculo(k, d)) + '</p><div style="margin-top:20px"><button class="btn ghost block-btn" data-act="cerrarHoja">Cerrar</button></div>');
    }
    else if (a === 'guardarMedidas') guardarMedidas(el);
    else if (a === 'tema') {
      var v = el.getAttribute('data-v');
      if (v === 'auto') { document.documentElement.removeAttribute('data-theme'); escribirLS(LS_TEMA, null); } else { document.documentElement.setAttribute('data-theme', v); escribirLS(LS_TEMA, v); }
      dibujarPerfil(S.datos.perfil);
    }
    else if (a === 'salir') cerrarSesion('');
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-act') === 'cambiarEjercicio') { S.ejercicioFuerza = t.value; cargarPantalla('progreso', true); return; }
    if (t.hasAttribute && t.hasAttribute('data-foto') && t.files && t.files[0]) subirFoto(t);
    if (t.hasAttribute && t.hasAttribute('data-comprobante') && t.files && t.files[0]) subirComprobante(t);
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-kg')) {
      var nombre = t.getAttribute('data-kg'); S.kg[nombre] = t.value;
      clearTimeout(debounces[nombre]);
      debounces[nombre] = setTimeout(function () {
        // si ya hay series marcadas de este ejercicio, se actualiza el peso registrado
        var ej = S.ses && S.ses.ejercicios.filter(function (x) { return x.nombre === nombre; })[0]; if (!ej) return;
        for (var i = 1; i <= ej.series; i++) {
          if (S.hechos[nombre + '|' + i]) api('registrarSerie', { idSesion: S.ses.sesion.id, ejercicio: nombre, serie: i, repeticiones: ej.repeticiones, peso: S.kg[nombre] }).catch(function () {});
        }
      }, 900);
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('mus')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if (e.key === 'Escape' && !$('sheet').hidden) cerrarHoja();
  });
  $('clave').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  $('rest').addEventListener('click', function (e) { if (e.target.closest('[data-act="saltarDescanso"]')) pararDescanso(); });

  function guardarMedidas(btn) {
    var datos = {}, alguna = false;
    document.querySelectorAll('[data-m]').forEach(function (i) { if (i.value !== '') { datos[i.getAttribute('data-m')] = i.value; alguna = true; } });
    if (!alguna) { toast('Escribe al menos una medida para guardar.'); return; }
    btn.classList.add('busy');
    api('guardarSeguimiento', datos).then(function () { btn.classList.remove('busy'); toast('Seguimiento guardado. Lo reviso esta semana.'); delete S.datos.seguimiento; delete S.datos.progreso; cargarPantalla('seguimiento', true); })
      .catch(function (e) { btn.classList.remove('busy'); manejarError(e); });
  }
  function subirFoto(input) {
    var tipo = input.getAttribute('data-foto'), cuerpo = input.parentNode.querySelector('.slot-body');
    cuerpo.innerHTML = '<span>Subiendo…</span>';
    preparar(input.files[0]).then(function (f) {
      return api('subirFoto', { tipo: tipo, mime: f.mime, datos: f.datos }).then(function () { subidas[tipo] = { vista: f.vista }; toast('Foto enviada. Solo yo la veo.'); delete S.datos.seguimiento; dibujarSeguimiento(S.datos.seguimiento || { registros: [] }); cargarPantalla('seguimiento', true); });
    }).catch(function (e) { cuerpo.innerHTML = CAM + '<span>Subir foto</span>'; manejarError(e); });
  }
  function subirComprobante(input) {
    var idPago = input.getAttribute('data-comprobante'), boton = input.parentNode;
    boton.classList.add('busy');
    preparar(input.files[0]).then(function (f) {
      var datos = { mime: f.mime, datos: f.datos }; if (idPago) datos.idPago = idPago;
      return api('subirComprobante', datos);
    }).then(function () { toast('Comprobante enviado. Lo reviso pronto.'); delete S.datos.pagos; cargarPantalla('pagos', true); })
      .catch(function (e) { boton.classList.remove('busy'); manejarError(e); });
  }

  /* ---------- Arranque ---------- */
  var temaGuardado = leerLS(LS_TEMA);
  if (temaGuardado === 'dark' || temaGuardado === 'light') document.documentElement.setAttribute('data-theme', temaGuardado);
  dibujarNav();
  if (clave) {
    $('login').hidden = true; ir('inicio', true);
  }
  if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); }); }
})();
