/* COMISSIONADO — Controle de Fretes e Comissões (offline, IndexedDB) */
(function () {
  "use strict";

  var DB_NAME = "comissionado";
  var DB_VERSION = 2;
  var STORE = "fretes";
  var db = null;
  var firestore = null;
  var userId = null;
  var ordemDesc = true;
  var cache = [];

  /* ---------- IndexedDB ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var database = e.target.result;
        if (!database.objectStoreNames.contains(STORE)) {
          var store = database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("data", "data");
          store.createIndex("status", "status");
          store.createIndex("remoteId", "remoteId", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function firebaseInit() {
    if (!window.firebaseConfig || !window.firebase) return null;
    try {
      firebase.initializeApp(window.firebaseConfig);
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      var db = firebase.firestore();
      db.enablePersistence().catch(function () {
        // Persistência offline não disponível
      });
      return db;
    } catch (err) {
      return null;
    }
  }

  function isOnline() {
    return navigator.onLine;
  }

  async function syncWithFirestore() {
    if (!firestore || !isOnline()) return;
    try {
      var snapshot = await firestore.collection("fretes").where("ownerId", "==", userId).get();
      var remote = await Promise.all(snapshot.docs.map(async function (doc) {
        var data = doc.data();
        if (data.ownerId !== userId) return null;
        data.remoteId = doc.id;
        var existing = await getByRemoteId(data.remoteId);
        if (existing) {
          data.id = existing.id;
          data.dataCriacao = data.dataCriacao || existing.dataCriacao || new Date().toISOString();
        }
        var key = await put(data);
        data.id = key;
        return data;
      }));
      cache = remote.filter(Boolean);
      render();
    } catch (err) {
      console.warn("syncWithFirestore failed", err);
      await recarregar();
    }
  }

  async function saveRemote(frete) {
    if (!firestore || !isOnline()) return;
    try {
      var remoteId = frete.remoteId;
      var data = Object.assign({}, frete, {});
      delete data.id;
      delete data.remoteId;
      data.ownerId = userId;
      if (remoteId) {
        await firestore.collection("fretes").doc(remoteId).set(data);
      } else {
        var doc = await firestore.collection("fretes").add(data);
        frete.remoteId = doc.id;
        put(frete);
      }
    } catch (err) {
      console.warn("saveRemote failed", err);
    }
  }

  function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }

  function getAll() {
    return new Promise(function (resolve, reject) {
      var req = tx("readonly").getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function getByRemoteId(remoteId) {
    return new Promise(function (resolve, reject) {
      var req = tx("readonly").index("remoteId").get(remoteId);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function put(registro) {
    return new Promise(function (resolve, reject) {
      var req = tx("readwrite").put(registro);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function remove(id) {
    return new Promise(function (resolve, reject) {
      var req = tx("readwrite").delete(id);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ---------- Helpers ---------- */
  var moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  function brl(v) { return moeda.format(Number(v) || 0); }
  function dataBR(iso) {
    if (!iso) return "--/--/----";
    var p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }
  function hoje() { return new Date().toISOString().slice(0, 10); }
  function $(id) { return document.getElementById(id); }

  var toastTimer;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  /* ---------- Render ---------- */
  function totais(itens) {
    var pend = 0, rec = 0, qp = 0, qr = 0;
    itens.forEach(function (f) {
      var v = Number(f.valorComissao) || 0;
      if (f.status === "Recebido") { rec += v; qr++; } else { pend += v; qp++; }
    });
    $("valorPendente").textContent = brl(pend);
    $("valorRecebido").textContent = brl(rec);
    $("qtdPendente").textContent = qp;
    $("qtdRecebido").textContent = qr;
  }

  function render() {
    var termo = $("busca").value.trim().toLowerCase();
    var itens = cache.slice();

    totais(itens);

    if (termo) {
      itens = itens.filter(function (f) {
        return [f.origem, f.destino, f.cliente, f.observacoes, f.status]
          .join(" ").toLowerCase().indexOf(termo) !== -1;
      });
    }

    itens.sort(function (a, b) {
      var r = String(a.data || "").localeCompare(String(b.data || ""));
      return ordemDesc ? -r : r;
    });

    var lista = $("lista");
    lista.innerHTML = "";
    $("vazio").classList.toggle("hidden", itens.length > 0);

    itens.forEach(function (f, i) {
      var recebido = f.status === "Recebido";
      var li = document.createElement("li");
      li.className = "item " + (recebido ? "recebido" : "pendente");
      li.style.animationDelay = Math.min(i * 30, 300) + "ms";
      li.tabIndex = 0;
      li.innerHTML =
        '<div class="item-top">' +
          '<span class="item-date">' + dataBR(f.data) + "</span>" +
          '<span class="badge ' + (recebido ? "recebido" : "pendente") + '">' + (recebido ? "Recebido" : "A Receber") + "</span>" +
        "</div>" +
        '<div class="item-route">' + esc(f.origem) + " → " + esc(f.destino) + "</div>" +
        '<div class="item-bottom">' +
          '<span class="item-date">' + (f.cliente ? esc(f.cliente) : "Sem cliente") + "</span>" +
          '<span class="item-value">' + brl(f.valorComissao) + "</span>" +
        "</div>";
      li.addEventListener("click", function () { abrir(f); });
      lista.appendChild(li);
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  async function recarregar() {
    cache = (await getAll()).filter(function (frete) { return !userId || frete.ownerId === userId; });
    render();
  }

  /* ---------- Sheet / Form ---------- */
  var statusAtual = "A Receber";

  function setStatus(valor) {
    statusAtual = valor;
    Array.prototype.forEach.call(document.querySelectorAll(".seg"), function (b) {
      b.classList.toggle("active", b.dataset.status === valor);
    });
    $("parcialGroup").classList.toggle("hidden", valor !== "Parcial");
  }

  function abrirSheet() {
    $("backdrop").classList.remove("hidden");
    $("sheet").classList.remove("hidden");
  }

  function fecharSheet() {
    $("backdrop").classList.add("hidden");
    $("sheet").classList.add("hidden");
  }

  function novo() {
    $("sheetTitle").textContent = "Novo Frete";
    $("form").reset();
    $("id").value = "";
    $("data").value = hoje();
    $("valorComissao").dataset.manual = "";
    $("valorRecebidoParcial").value = "";
    $("parcialBtn").classList.add("hidden");
    setStatus("A Receber");
    $("btnExcluir").classList.add("hidden");
    abrirSheet();
  }

  function comissaoManual(f) {
    var frete = Number(f.valorFrete) || 0;
    var comissao = Number(f.valorComissao) || 0;
    var auto = Number((frete * 0.15).toFixed(2));
    return comissao !== auto;
  }

  function calcularComissao() {
    if ($("valorComissao").dataset.manual === "true") return;
    var frete = Number($("valorFrete").value) || 0;
    $("valorComissao").value = (frete * 0.15).toFixed(2);
  }


  function abrir(f) {
    $("sheetTitle").textContent = "Editar Frete";
    $("id").value = f.id;
    $("data").value = f.data || hoje();
    $("origem").value = f.origem || "";
    $("destino").value = f.destino || "";
    $("cliente").value = f.cliente || "";
    $("valorFrete").value = f.valorFrete != null ? f.valorFrete : "";
    $("valorComissao").value = f.valorComissao != null ? f.valorComissao : "";
    $("valorComissao").dataset.manual = comissaoManual(f) ? "true" : "";
    $("valorRecebidoParcial").value = "";
    $("observacoes").value = f.observacoes || "";
    $("parcialBtn").classList.remove("hidden");
    setStatus(f.status === "Recebido" ? "Recebido" : "A Receber");
    $("btnExcluir").classList.remove("hidden");
    abrirSheet();
  }


  async function salvar(e) {
    e.preventDefault();
    if (!$("data").value || !$("origem").value.trim() || !$("destino").value.trim()) {
      toast("Preencha data, origem e destino.");
      return;
    }
    var agora = new Date().toISOString();
    var id = $("id").value;
    var valorComissao = Number($("valorComissao").value) || 0;
    var valorRecebido = Number($("valorRecebidoParcial").value) || 0;
    if (statusAtual === "Parcial" && (!id || valorRecebido <= 0 || valorRecebido >= valorComissao)) {
      toast(id ? "Informe um valor menor que a comissão total." : "O recebimento parcial só está disponível na edição.");
      return;
    }
    var registro = {
      data: $("data").value,
      origem: $("origem").value.trim(),
      destino: $("destino").value.trim(),
      cliente: $("cliente").value.trim(),
      valorFrete: Number($("valorFrete").value) || 0,
      valorComissao: valorComissao,
      status: statusAtual === "Parcial" ? "A Receber" : statusAtual,
      observacoes: $("observacoes").value.trim(),
      dataCriacao: agora,
      ultimaAlteracao: agora,
      ownerId: userId,
    };
    if (id) {
      var antigo = cache.filter(function (f) { return String(f.id) === String(id); })[0];
      registro.id = isNaN(Number(id)) ? id : Number(id);
      registro.dataCriacao = (antigo && antigo.dataCriacao) || agora;
      registro.remoteId = antigo && antigo.remoteId;
    }
    var key = await put(registro);
    registro.id = key;
    await saveRemote(registro);
    if (statusAtual === "Parcial") {
      var recebido = Object.assign({}, registro, {
        id: undefined,
        remoteId: undefined,
        valorComissao: valorRecebido,
        status: "Recebido",
        observacoes: registro.observacoes ? registro.observacoes + " (Recebimento parcial)" : "Recebimento parcial",
        dataCriacao: agora,
        ultimaAlteracao: agora,
      });
      delete recebido.id;
      delete recebido.remoteId;
      recebido.id = await put(recebido);
      await saveRemote(recebido);
    }
    fecharSheet();
    if (firestore && isOnline()) {
      await syncWithFirestore();
    } else {
      await recarregar();
    }
    toast(id ? "Frete atualizado." : "Frete cadastrado.");
  }

  async function excluir() {
    var id = $("id").value;
    if (!id) return;
    if (!confirm("Excluir este frete definitivamente?")) return;
    await remove(id);
    fecharSheet();
    if (firestore && isOnline()) {
      await syncWithFirestore();
    } else {
      await recarregar();
    }
    toast("Frete excluído.");
  }

  /* ---------- Boot ---------- */
  function splash() {
    setTimeout(function () {
      var s = $("splash");
      s.classList.add("out");
      $("app").classList.remove("hidden");
      setTimeout(function () { s.classList.add("hidden"); }, 450);
    }, 2000);
  }

  function registrarSW() {
    if (!("serviceWorker" in navigator)) return;
    var h = location.hostname;
    var preview =
      window.top !== window.self ||
      h.indexOf("id-preview--") === 0 ||
      h.indexOf("preview--") === 0 ||
      /(^|\.)lovableproject(-dev)?\.com$/.test(h) ||
      /(^|\.)beta\.lovable\.dev$/.test(h) ||
      location.search.indexOf("sw=off") !== -1;
    if (preview) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) {
          if (r.active && r.active.scriptURL.indexOf("/app/service-worker.js") !== -1) r.unregister();
        });
      });
      return;
    }
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .register("service-worker.js?v=3", { scope: "./" })
        .then(function (registration) {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          if (registration.installing) {
            registration.installing.addEventListener("statechange", function () {
              if (registration.installing.state === "installed" && navigator.serviceWorker.controller) {
                registration.installing.postMessage({ type: "SKIP_WAITING" });
              }
            });
          }
          if (navigator.serviceWorker.controller) {
            registration.update();
          }
        })
        .catch(function () {});
    });
  }

  function showInstallButton(evt) {
    evt.preventDefault();
    window.deferredInstallPrompt = evt;
    var installBtn = $("btnInstall");
    installBtn.classList.remove("hidden");
  }

  async function installApp() {
    var promptEvent = window.deferredInstallPrompt;
    if (!promptEvent) return;
    promptEvent.prompt();
    var result = await promptEvent.userChoice;
    window.deferredInstallPrompt = null;
    $("btnInstall").classList.add("hidden");
    if (result.outcome === "accepted") {
      toast("Aplicativo instalado com sucesso.");
    } else {
      toast("Instalação cancelada.");
    }
  }

  function mostrarLogin() {
    $("login").classList.remove("hidden");
    $("app").classList.add("hidden");
  }

  async function entrar(email, senha, criar) {
    try {
      var auth = firebase.auth();
      var result = criar
        ? await auth.createUserWithEmailAndPassword(email, senha)
        : await auth.signInWithEmailAndPassword(email, senha);
      userId = result.user.uid;
      $("login").classList.add("hidden");
      $("app").classList.remove("hidden");
      await recarregar();
      await syncWithFirestore();
    } catch (err) {
      toast(err.code === "auth/invalid-credential" ? "E-mail ou senha inválidos." : "Não foi possível entrar.");
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    splash();
    registrarSW();

    $("btnNovo").addEventListener("click", novo);
    $("btnSair").addEventListener("click", function () { firebase.auth().signOut(); });
    $("loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      entrar($("loginEmail").value.trim(), $("loginPassword").value, false);
    });
    $("btnCriarConta").addEventListener("click", function () {
      entrar($("loginEmail").value.trim(), $("loginPassword").value, true);
    });
    $("btnInstall").addEventListener("click", installApp);
    window.addEventListener("beforeinstallprompt", showInstallButton);
    window.addEventListener("appinstalled", function () {
      toast("Aplicativo instalado.");
      $("btnInstall").classList.add("hidden");
    });
    $("btnCancelar").addEventListener("click", fecharSheet);
    $("backdrop").addEventListener("click", fecharSheet);
    $("btnExcluir").addEventListener("click", excluir);
    $("form").addEventListener("submit", salvar);
    $("busca").addEventListener("input", render);
    $("btnOrdem").addEventListener("click", function () {
      ordemDesc = !ordemDesc;
      toast(ordemDesc ? "Mais recentes primeiro" : "Mais antigos primeiro");
      render();
    });
    $("valorFrete").addEventListener("input", calcularComissao);
    $("valorComissao").addEventListener("input", function () {
      $("valorComissao").dataset.manual = "true";
    });
    Array.prototype.forEach.call(document.querySelectorAll(".seg"), function (b) {
      b.addEventListener("click", function () { setStatus(b.dataset.status); });
    });


    try {
      db = await openDB();
      firestore = firebaseInit();
      if (!firestore) throw new Error("Firebase indisponível");
      firebase.auth().onAuthStateChanged(async function (user) {
        if (!user) {
          mostrarLogin();
          return;
        }
        userId = user.uid;
        $("login").classList.add("hidden");
        $("app").classList.remove("hidden");
        await recarregar();
        await syncWithFirestore();
      });
      window.addEventListener("online", syncWithFirestore);
    } catch (err) {
      mostrarLogin();
      toast("Falha ao abrir o banco local.");
    }
  });
})();
