/* ============================================================
   PWA Aceitabilidade — Lucas do Rio Verde - MT
   JavaScript vanilla (compatível com navegadores antigos)
   Offline-first: IndexedDB (fallback localStorage) + fila de envio
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     CONFIGURAÇÃO FIXA — PLANILHA (edite somente aqui)
     Cole entre as aspas o link do Apps Script da planilha
     (termina em /exec). Não é preciso configurar nada no painel.
     Exemplo:
     var URL_PLANILHA = 'https://script.google.com/macros/s/AKfycb.../exec';
     ============================================================ */
  var URL_PLANILHA = 'https://script.google.com/macros/s/AKfycbxM8Va0kxCpJ75CTrVKBtaIBS6QfwSH80W3TmnQNNVj_roB6ErJn5IyZXaZCAC5hFh_QA/exec';

  /* ---------------- Utilidades ---------------- */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dataHoje(d) {
    d = d || new Date();
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function agora(d) {
    d = d || new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  var LS_CFG = 'lrv_cfg_v1';
  var TITULO_PADRAO = 'Como foi a alimentação escolar hoje?';
  function getCfg() {
    try { return JSON.parse(localStorage.getItem(LS_CFG)) || {}; }
    catch (e) { return {}; }
  }
  function setCfg(c) {
    try { localStorage.setItem(LS_CFG, JSON.stringify(c)); } catch (e) {}
  }
  function tituloAtual() {
    var t = getCfg().titulo;
    t = String(t == null ? '' : t).replace(/^\s+|\s+$/g, '');
    return t || TITULO_PADRAO;
  }
  function aplicarTitulo() {
    var el = $('pergunta');
    if (el) el.textContent = tituloAtual();
  }

  /* ---------------- Armazenamento ----------------
     IndexedDB como principal; localStorage como reserva
     (para WebViews muito antigos ou modo privado). */
  var modo = null;   // 'idb' | 'ls'
  var db = null;
  var LS_VOTOS = 'lrv_votos_v1';

  function lsVotos() {
    try { return JSON.parse(localStorage.getItem(LS_VOTOS)) || []; }
    catch (e) { return []; }
  }
  function lsSalvar(a) {
    try { localStorage.setItem(LS_VOTOS, JSON.stringify(a)); } catch (e) {}
  }

  function abrirStore(pronto) {
    var resolvido = false;
    function finalizar(m, d) {
      if (resolvido) return;
      resolvido = true;
      modo = m; db = d || null;
      pronto();
    }
    var timer = setTimeout(function () { finalizar('ls'); }, 2000);
    if (!window.indexedDB) { clearTimeout(timer); finalizar('ls'); return; }
    var rq;
    try { rq = indexedDB.open('lrv_aceitabilidade', 1); }
    catch (e) { clearTimeout(timer); finalizar('ls'); return; }
    rq.onupgradeneeded = function (e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('votos')) {
        var os = d.createObjectStore('votos', { keyPath: 'id' });
        try { os.createIndex('synced', 'synced', { unique: false }); } catch (e2) {}
      }
    };
    rq.onsuccess = function (e) { clearTimeout(timer); finalizar('idb', e.target.result); };
    rq.onerror = function () { clearTimeout(timer); finalizar('ls'); };
    rq.onblocked = function () { clearTimeout(timer); finalizar('ls'); };
  }

  function salvarVoto(v, feito) {
    if (modo === 'idb') {
      try {
        var tx = db.transaction('votos', 'readwrite');
        tx.objectStore('votos').put(v);
        tx.oncomplete = function () { if (feito) feito(); };
        tx.onerror = function () { if (feito) feito(); };
        return;
      } catch (e) { /* cai para LS */ }
    }
    var arr = lsVotos(); arr.push(v); lsSalvar(arr);
    if (feito) feito();
  }

  function todosVotos(feito) {
    if (modo === 'idb') {
      var res = [];
      try {
        var tx = db.transaction('votos', 'readonly');
        var rq = tx.objectStore('votos').openCursor();
        rq.onsuccess = function (e) {
          var c = e.target.result;
          if (c) { res.push(c.value); c.continue(); }
        };
        tx.oncomplete = function () { feito(res); };
        tx.onerror = function () { feito(res); };
        return;
      } catch (e) { /* cai para LS */ }
    }
    feito(lsVotos());
  }

  function votosPendentes(feito) {
    todosVotos(function (all) {
      var res = [];
      for (var i = 0; i < all.length; i++) if (!all[i].synced) res.push(all[i]);
      feito(res);
    });
  }

  function marcarSincronizados(ids, feito) {
    if (modo === 'idb') {
      try {
        var tx = db.transaction('votos', 'readwrite');
        var st = tx.objectStore('votos');
        for (var i = 0; i < ids.length; i++) {
          (function (id) {
            var rq = st.get(id);
            rq.onsuccess = function (e) {
              var v = e.target.result;
              if (v) { v.synced = 1; st.put(v); }
            };
          })(ids[i]);
        }
        tx.oncomplete = function () { if (feito) feito(); };
        tx.onerror = function () { if (feito) feito(); };
        return;
      } catch (e) { /* cai para LS */ }
    }
    var arr = lsVotos();
    for (var j = 0; j < arr.length; j++) {
      if (ids.indexOf(arr[j].id) >= 0) arr[j].synced = 1;
    }
    lsSalvar(arr);
    if (feito) feito();
  }

  function apagarSincronizados(feito) {
    if (modo === 'idb') {
      try {
        var tx = db.transaction('votos', 'readwrite');
        var rq = tx.objectStore('votos').openCursor();
        rq.onsuccess = function (e) {
          var c = e.target.result;
          if (c) { if (c.value.synced) { c.delete(); } c.continue(); }
        };
        tx.oncomplete = function () { if (feito) feito(); };
        tx.onerror = function () { if (feito) feito(); };
        return;
      } catch (e) { /* cai para LS */ }
    }
    lsSalvar(lsVotos().filter(function (v) { return !v.synced; }));
    if (feito) feito();
  }

  /* ---------------- Opções da escala ---------------- */
  var OPCOES = [
    { cod: 0, nome: 'Não comi',   cls: 'op0' },
    { cod: 1, nome: 'Detestei',   cls: 'op1' },
    { cod: 2, nome: 'Não gostei', cls: 'op2' },
    { cod: 3, nome: 'Gostei',     cls: 'op3' },
    { cod: 4, nome: 'Adorei',     cls: 'op4' }
  ];

  /* ---------------- Votação ---------------- */
  var votando = false;

  function votar(cod) {
    if (votando) return;
    votando = true;
    var op = null;
    for (var i = 0; i < OPCOES.length; i++) {
      if (OPCOES[i].cod === cod) { op = OPCOES[i]; break; }
    }
    if (!op) { votando = false; return; }
    var cfg = getCfg();
    var agoraD = new Date();
    var voto = {
      id: 'v' + agoraD.getTime() + '_' + Math.floor(Math.random() * 10000),
      codigo: op.cod,
      resposta: op.nome,
      titulo: tituloAtual(),
      escola: cfg.escola || 'Não informada',
      data: dataHoje(agoraD),
      hora: agora(agoraD),
      iso: agoraD.toISOString(),
      synced: 0
    };
    salvarVoto(voto, function () {
      mostrarOverlay(op);
      agendaSync();
      atualizaStatus();
    });
  }

  function mostrarOverlay(op) {
    var ov = $('overlay');
    var botao = document.querySelector('.opcao.' + op.cls);
    var faceOrigem = botao ? botao.querySelector('svg') : null;
    var alvo = $('overlay-face');
    alvo.innerHTML = '';
    if (faceOrigem) alvo.appendChild(faceOrigem.cloneNode(true));
    $('overlay-resposta').textContent = 'Você respondeu: ' + op.nome;
    ov.className = 'overlay ' + op.cls;
    ov.hidden = false;
    setTimeout(function () {
      ov.hidden = true;
      votando = false;
    }, 1000);
  }

  /* ---------------- Sincronização (Apps Script) ---------------- */
  var sincronizando = false;
  var timerSync = null;

  function agendaSync() {
    if (timerSync) clearTimeout(timerSync);
    timerSync = setTimeout(function () { sincronizar(); }, 2500);
  }

  function sincronizar() {
    if (sincronizando) return;
    var cfg = getCfg();
    if (!URL_PLANILHA) { atualizaStatus(); return; }
    if (navigator.onLine === false) { atualizaStatus(); return; }
    sincronizando = true;
    atualizaStatus();

    votosPendentes(function (pend) {
      if (!pend.length) { sincronizando = false; atualizaStatus(); return; }
      pend.sort(function (a, b) { return a.iso < b.iso ? -1 : 1; });
      var lote = pend.slice(0, 25);
      var votos = [];
      for (var i = 0; i < lote.length; i++) {
        votos.push({
          id: lote[i].id,
          codigo: lote[i].codigo,
          resposta: lote[i].resposta,
          titulo: lote[i].titulo || '',
          escola: lote[i].escola,
          data: lote[i].data,
          hora: lote[i].hora,
          iso: lote[i].iso
        });
      }
      var payload = JSON.stringify({
        versao: 1,
        aparelho: getCfg().escola || '',
        votes: votos
      });
      xhrPost(URL_PLANILHA, payload, function (ok) {
        if (ok) {
          var ids = [];
          for (var j = 0; j < lote.length; j++) ids.push(lote[j].id);
          marcarSincronizados(ids, function () {
            sincronizando = false;
            if (pend.length > lote.length) { sincronizar(); }
            else { atualizaStatus(); }
            if (!$('painel').hidden) renderPainel();
          });
        } else {
          sincronizando = false;
          atualizaStatus();
        }
      });
    });
  }

  function xhrPost(url, dados, cb) {
    try {
      var x = new XMLHttpRequest();
      x.open('POST', url, true);
      x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
      x.timeout = 20000;
      x.onload = function () { cb(x.status >= 200 && x.status < 400, x.responseText); };
      x.onerror = function () { cb(false, 'erro de rede'); };
      x.ontimeout = function () { cb(false, 'tempo esgotado'); };
      x.send(dados);
    } catch (e) { cb(false, String(e)); }
  }

  function testarConexao(url, cb) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url + (url.indexOf('?') >= 0 ? '&' : '?') + 'ping=' + Date.now(), true);
      x.timeout = 15000;
      x.onload = function () { cb(x.status >= 200 && x.status < 400, x.responseText); };
      x.onerror = function () { cb(false, 'Falha de rede ou URL incorreta'); };
      x.ontimeout = function () { cb(false, 'Tempo esgotado (15 s)'); };
      x.send();
    } catch (e) { cb(false, String(e)); }
  }

  /* ---------------- Indicador de status ---------------- */
  function atualizaStatus() {
    var el = $('status-sync');
    if (!el) return;
    votosPendentes(function (pend) {
      var online = navigator.onLine !== false;
      var elDot = document.createElement('span');
      var texto;
      if (!URL_PLANILHA) {
        elDot.className = 'dot s-local';
        texto = pend.length ? (pend.length + ' voto(s) salvos no aparelho') : 'Armazenamento local';
      } else if (!online) {
        elDot.className = 'dot s-off';
        texto = pend.length ? ('Offline · ' + pend.length + ' pendente(s)') : 'Offline';
      } else if (sincronizando) {
        elDot.className = 'dot s-sinc';
        texto = 'Sincronizando…';
      } else if (pend.length) {
        elDot.className = 'dot s-pend';
        texto = pend.length + ' pendente(s) de envio';
      } else {
        elDot.className = 'dot s-ok';
        texto = 'Tudo sincronizado';
      }
      el.innerHTML = '';
      el.appendChild(elDot);
      el.appendChild(document.createTextNode(texto));
    });
  }

  /* ---------------- Painel do operador ---------------- */
  function faceSVG(classe, alvo) {
    var botao = document.querySelector('.opcao.' + classe);
    var svg = botao ? botao.querySelector('svg') : null;
    if (svg) alvo.appendChild(svg.cloneNode(true));
  }

  function renderPainel() {
    var cfg = getCfg();
    $('cfg-titulo').value = cfg.titulo || '';
    $('cfg-escola').value = cfg.escola || '';
    $('cfg-senha').value = '';
    $('aviso-url').hidden = !!URL_PLANILHA;
    $('data-hoje').textContent = dataHoje();

    todosVotos(function (all) {
      var hoje = dataHoje();
      var cont = [0, 0, 0, 0, 0, 0];
      var tot = [0, 0, 0, 0, 0, 0];
      var hojeN = 0, pendN = 0;
      for (var i = 0; i < all.length; i++) {
        var v = all[i];
        if (v.codigo >= 0 && v.codigo <= 5) {
          tot[v.codigo]++;
          if (v.data === hoje) { cont[v.codigo]++; hojeN++; }
        }
        if (!v.synced) pendN++;
      }

      var chips = $('chips');
      chips.innerHTML = '';
      for (var c = 0; c < OPCOES.length; c++) {
        (function (idx) {
          var chip = document.createElement('div');
          chip.className = 'chip';
          var f = document.createElement('span');
          faceSVG(OPCOES[idx].cls, f);
          var nome = document.createElement('span');
          nome.className = 'chip-nome';
          nome.textContent = OPCOES[idx].nome;
          var nums = document.createElement('span');
          nums.className = 'chip-nums';
          var h = document.createElement('span');
          h.className = 'chip-hoje';
          h.textContent = String(cont[idx]);
          var t = document.createElement('span');
          t.className = 'chip-total';
          t.textContent = 'total ' + tot[idx];
          nums.appendChild(h); nums.appendChild(t);
          chip.appendChild(f); chip.appendChild(nome); chip.appendChild(nums);
          chips.appendChild(chip);
        })(c);
      }

      $('tot-hoje').textContent = String(hojeN);
      $('tot-geral').textContent = String(all.length);
      $('tot-sync').textContent = String(all.length - pendN);
      $('tot-pend').textContent = String(pendN);
    });
  }

  function abrirPainel() {
    renderPainel();
    $('painel').hidden = false;
    atualizaStatus();
  }
  function fecharPainel() {
    $('painel').hidden = true;
  }

  /* ---------------- Guarda (senha do operador) ---------------- */
  var SENHA_PADRAO = '0000';
  function senhaAtual() {
    var s = getCfg().senha;
    s = String(s == null ? '' : s);
    return /^\d{4}$/.test(s) ? s : SENHA_PADRAO;
  }
  function abrirGuarda() {
    $('guarda-resp').value = '';
    $('guarda-pergunta').textContent = 'Digite a senha para continuar';
    $('guarda').hidden = false;
    setTimeout(function () { try { $('guarda-resp').focus(); } catch (e) {} }, 60);
  }
  function confirmarGuarda() {
    var v = String($('guarda-resp').value || '');
    if (v === senhaAtual()) {
      $('guarda').hidden = true;
      abrirPainel();
    } else {
      $('guarda-pergunta').textContent = 'Senha incorreta. Tente de novo:';
      $('guarda-resp').value = '';
    }
  }

  /* ------- Acesso escondido: 5 toques seguidos no topo ------- */
  var toques = 0, timerToques = null;
  function toqueNoTopo(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'BUTTON') return; /* toques em botões não contam */
      el = el.parentNode;
    }
    toques++;
    if (timerToques) clearTimeout(timerToques);
    timerToques = setTimeout(function () { toques = 0; }, 2500);
    if (toques >= 5) {
      toques = 0;
      if ($('painel').hidden && $('guarda').hidden) abrirGuarda();
    }
  }

  /* ------- Trava de saída: o app só fecha pelo painel ------- */
  var saindo = false;
  function armarTrava() {
    try {
      history.replaceState({ lrv: 1 }, '');
      history.pushState({ lrv: 2 }, '');
      window.addEventListener('popstate', function () {
        if (saindo) return;
        try {
          if (!$('painel').hidden) $('painel').hidden = true;
          if (!$('guarda').hidden) $('guarda').hidden = true;
        } catch (e2) {}
        try { history.pushState({ lrv: 2 }, ''); } catch (e3) {}
      });
    } catch (e) {}
  }
  function sairDoApp() {
    if (!confirm('Sair do aplicativo?')) return;
    saindo = true;
    sairTelaCheia();
    try { window.close(); } catch (e) {}
    setTimeout(function () {
      try { history.go(-2); } catch (e2) {}
    }, 300);
  }

  /* ------- Bloqueio de arrastar / puxar para recarregar ------- */
  function bloquearArrastar() {
    document.addEventListener('touchmove', function (e) {
      var el = e.target, n = 0;
      while (el && el !== document.body && n < 12) {
        if (el.classList && el.classList.contains('painel-corpo')) return; /* painel pode rolar */
        el = el.parentNode; n++;
      }
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ---------------- CSV ---------------- */
  function escCSV(s) {
    s = String(s == null ? '' : s);
    if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function exportarCSV() {
    todosVotos(function (all) {
      if (!all.length) { alert('Nenhum voto registrado neste aparelho ainda.'); return; }
      all.sort(function (a, b) { return a.iso < b.iso ? -1 : 1; });
      var linhas = ['ID;Data;Hora;Escola;Referência;Resposta;Código;Sincronizado'];
      for (var i = 0; i < all.length; i++) {
        var v = all[i];
        linhas.push([
          escCSV(v.id), escCSV(v.data), escCSV(v.hora), escCSV(v.escola),
          escCSV(v.titulo || ''), escCSV(v.resposta), escCSV(v.codigo), v.synced ? 1 : 0
        ].join(';'));
      }
      var blob = new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      var url = URL.createObjectURL(blob);
      a.href = url;
      a.download = 'votos-aceitabilidade-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    });
  }

  /* ---------------- Tela cheia ---------------- */
  function emTelaCheia() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
              document.mozFullScreenElement || document.msFullscreenElement);
  }
  function atualizarBotoesFixos() {
    var btn = $('btn-tela-cheia');
    if (btn) btn.hidden = emTelaCheia(); /* some quando entra em tela cheia */
  }
  function sairTelaCheia() {
    var d = document;
    var s = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
    if (s) { try { s.call(d); } catch (e) {} }
  }
  function alternarTelaCheia() {
    var d = document, el = d.documentElement;
    var atual = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement;
    if (atual) {
      var sair = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
      if (sair) sair.call(d);
    } else {
      var entrar = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (entrar) {
        try {
          var p = entrar.call(el);
          if (p && p.catch) p.catch(function () { /* ignora recusa do navegador */ });
        } catch (e) {}
      } else {
        alert('Este navegador não suporta tela cheia. Você pode instalar o app pelo menu do Chrome ("Adicionar à tela inicial").');
      }
    }
  }

  /* ---------------- Service Worker ---------------- */
  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    try {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    } catch (e) {}
  }

  /* ---------------- Ligação dos eventos ---------------- */
  function ligarEventos() {
    var botoes = document.querySelectorAll('.opcao');
    for (var i = 0; i < botoes.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          votar(parseInt(b.getAttribute('data-cod'), 10));
        });
      })(botoes[i]);
    }

    $('btn-tela-cheia').addEventListener('click', alternarTelaCheia);
    $('topo').addEventListener('click', toqueNoTopo);
    $('btn-fechar').addEventListener('click', fecharPainel);

    $('guarda-ok').addEventListener('click', confirmarGuarda);
    $('guarda-cancel').addEventListener('click', function () { $('guarda').hidden = true; });
    $('guarda-resp').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) confirmarGuarda();
    });

    $('btn-salvar').addEventListener('click', function () {
      var cfg = getCfg();
      cfg.titulo = $('cfg-titulo').value.replace(/^\s+|\s+$/g, '');
      cfg.escola = $('cfg-escola').value.replace(/^\s+|\s+$/g, '');
      var novaSenha = $('cfg-senha').value.replace(/^\s+|\s+$/g, '');
      if (novaSenha) {
        if (!/^\d{4}$/.test(novaSenha)) {
          var stE = $('teste-status');
          stE.className = 'mini-status erro';
          stE.textContent = 'A senha deve ter exatamente 4 dígitos numéricos.';
          return;
        }
        cfg.senha = novaSenha;
      }
      setCfg(cfg);
      aplicarTitulo();
      $('cfg-senha').value = '';
      var st = $('teste-status');
      st.className = 'mini-status ok';
      st.textContent = 'Configurações salvas neste aparelho.';
      atualizaStatus();
      agendaSync();
    });

    $('btn-testar').addEventListener('click', function () {
      var st = $('teste-status');
      if (!URL_PLANILHA) {
        st.className = 'mini-status erro';
        st.textContent = 'Defina a URL_PLANILHA no arquivo app.js do aplicativo.';
        return;
      }
      st.className = 'mini-status';
      st.textContent = 'Testando conexão…';
      testarConexao(URL_PLANILHA, function (ok, resp) {
        if (ok) {
          st.className = 'mini-status ok';
          st.textContent = 'Conexão OK! ' + String(resp || '').slice(0, 80);
        } else {
          st.className = 'mini-status erro';
          st.textContent = 'Falhou: ' + String(resp || 'resposta inválida') + '. Verifique a URL e se o acesso é "Qualquer pessoa".';
        }
      });
    });

    $('btn-sync').addEventListener('click', function () { sincronizar(); });
    $('btn-csv').addEventListener('click', exportarCSV);

    $('btn-limpar').addEventListener('click', function () {
      if (confirm('Isso apaga APENAS os votos que já foram sincronizados com a planilha. Os pendentes continuam salvos. Continuar?')) {
        apagarSincronizados(function () {
          renderPainel();
          atualizaStatus();
        });
      }
    });

    $('btn-sair-cheia').addEventListener('click', sairTelaCheia);
    $('btn-sair').addEventListener('click', sairDoApp);

    document.addEventListener('fullscreenchange', atualizarBotoesFixos);
    document.addEventListener('webkitfullscreenchange', atualizarBotoesFixos);
    document.addEventListener('mozfullscreenchange', atualizarBotoesFixos);
    document.addEventListener('MSFullscreenChange', atualizarBotoesFixos);

    window.addEventListener('online', function () { agendaSync(); atualizaStatus(); });
    window.addEventListener('offline', atualizaStatus);
    setInterval(function () { sincronizar(); }, 90000);
    setInterval(atualizaStatus, 30000);
  }

  /* ---------------- Início ---------------- */
  function iniciar() {
    ligarEventos();
    aplicarTitulo();
    armarTrava();
    bloquearArrastar();
    atualizarBotoesFixos();
    abrirStore(function () {
      atualizaStatus();
      agendaSync();
      registrarSW();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
