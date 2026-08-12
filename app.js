/* COMISSIONADO — Controle de Fretes e Comissões (offline, IndexedDB) */
(function () {
  "use strict";

  var DB_NAME = "comissionado";
  var DB_VERSION = 2;
  var STORE = "fretes";
  var db = null;
  var firestore = null;
  var userId = null;
  var isAdmin = false;
  var OWNER_EMAIL = (window.localConfig && window.localConfig.OWNER_EMAIL) || null;
  var ordemDesc = true;
  var cache = [];
  var mesSelecionado = hoje().slice(0, 7);

  function numero(valor) {
    if (typeof valor === "number") return valor;
    var texto = String(valor == null ? "" : valor).trim();
    if (texto.indexOf("R$") !== -1) texto = texto.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
    return Number(texto) || 0;
  }

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
      var snapshot = await firestore.collection("fretes").get();
      var remote = await Promise.all(snapshot.docs.map(async function (doc) {
        var data = doc.data();
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
    if (!firestore || !isOnline() || !isAdmin || !userId) return;
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

  async function deleteRemote(frete) {
    if (!firestore || !isOnline() || !isAdmin || !userId || !frete.remoteId) return;
    await firestore.collection("fretes").doc(frete.remoteId).delete();
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
  function nomeMes(mes) {
    var partes = mes.split("-");
    var data = new Date(Number(partes[0]), Number(partes[1]) - 1, 1);
    return data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
  function alterarMes(delta) {
    var partes = mesSelecionado.split("-");
    var data = new Date(Number(partes[0]), Number(partes[1]) - 1 + delta, 1);
    mesSelecionado = data.getFullYear() + "-" + String(data.getMonth() + 1).padStart(2, "0");
    render();
  }

  var toastTimer;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  /* ---------- Render ---------- */
  function totais(todos, mesSelecionadoItens) {
    var pend = 0, rec = 0, qp = 0, qr = 0;
    todos.forEach(function (f) {
      var v = numero(f.valorComissao);
      if (f.status !== "Recebido") { pend += v; qp++; }
    });
    mesSelecionadoItens.forEach(function (f) {
      var v = numero(f.valorComissao);
      if (f.status === "Recebido") { rec += v; qr++; }
    });
    $("valorPendente").textContent = brl(pend);
    $("valorRecebido").textContent = brl(rec);
    $("qtdPendente").textContent = qp;
    $("qtdRecebido").textContent = qr;
  }

  function render() {
    var termo = $("busca").value.trim().toLowerCase();
    var itens = cache.filter(function (f) {
      return String(f.data || "").slice(0, 7) === mesSelecionado;
    });

    totais(cache, itens);
    $("mesAtual").textContent = nomeMes(mesSelecionado);

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
          '<span class="item-value">' + brl(numero(f.valorComissao)) + "</span>" +
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
    cache = await getAll();
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

  function aplicarPermissoes() {
    Array.prototype.forEach.call(document.querySelectorAll(".admin-only"), function (el) {
      el.classList.toggle("hidden", !isAdmin);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#form input, #form textarea, #form .seg"), function (el) {
      el.disabled = !isAdmin;
    });
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
    if (!isAdmin) return toast("Apenas o administrador pode alterar fretes.");
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
    $("btnExcluir").classList.toggle("hidden", !isAdmin);
    aplicarPermissoes();
    abrirSheet();
  }


  async function salvar(e) {
    e.preventDefault();
    if (!isAdmin) return toast("Apenas o administrador pode alterar fretes.");
    if (!$("data").value || !$("origem").value.trim() || !$("destino").value.trim()) {
      toast("Preencha data, origem e destino.");
      return;
    }
    var agora = new Date().toISOString();
    var id = $("id").value;
    var valorComissao = Number($("valorComissao").value) || 0;
    var valorRecebido = Number($("valorRecebidoParcial").value) || 0;
    var saldoPendente = valorComissao - valorRecebido;
    if (statusAtual === "Parcial" && (!id || valorRecebido <= 0 || valorRecebido >= valorComissao)) {
      toast(id ? "Informe um valor menor que a comissão total." : "O recebimento parcial só está disponível na edição.");
      return;
    }
    var antigo = cache.filter(function (f) { return String(f.id) === String(id); })[0];
    var registro = {
      data: statusAtual === "Parcial" && antigo && antigo.data ? antigo.data : $("data").value,
      origem: $("origem").value.trim(),
      destino: $("destino").value.trim(),
      cliente: $("cliente").value.trim(),
      valorFrete: numero($("valorFrete").value),
      valorComissao: statusAtual === "Parcial" ? saldoPendente : valorComissao,
      status: statusAtual === "Parcial" ? "A Receber" : statusAtual,
      observacoes: $("observacoes").value.trim(),
      dataCriacao: agora,
      ultimaAlteracao: agora,
      ownerId: userId,
    };
    if (id) {
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
        data: hoje(),
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
    if (!isAdmin) return toast("Apenas o administrador pode alterar fretes.");
    var id = $("id").value;
    if (!id) return;
    if (!confirm("Excluir este frete definitivamente?")) return;
    var frete = cache.filter(function (item) { return String(item.id) === String(id); })[0];
    try {
      await deleteRemote(frete || {});
      await remove(id);
    } catch (err) {
      console.warn("deleteRemote failed", err);
      toast("Não foi possível excluir o frete.");
      return;
    }
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
        .register("service-worker.js?v=12", { scope: "./" })
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

  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function showInstallOption() {
    if (!isInstalled()) $("btnInstall").classList.remove("hidden");
  }

  async function installApp() {
    var promptEvent = window.deferredInstallPrompt;
    if (!promptEvent) {
      var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      toast(ios
        ? "Toque em Compartilhar e depois em Adicionar à Tela de Início."
        : "Abra o menu do navegador e toque em Instalar aplicativo ou Adicionar à tela inicial.");
      return;
    }
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
  }

  async function entrar(email, senha, criar) {
    try {
      var auth = firebase.auth();
      var result = criar
        ? await auth.createUserWithEmailAndPassword(email, senha)
        : await auth.signInWithEmailAndPassword(email, senha);
      if (criar) {
        await firebase.auth().signOut();
        toast("Somente o administrador pode entrar como editor.");
        return;
      }
      var idToken = await result.user.getIdTokenResult();
      if (!(idToken && idToken.claims && idToken.claims.isAdmin)) {
        await firebase.auth().signOut();
        toast("Conta sem permissão de administrador.");
        return;
      }
      if (!result.user.emailVerified) {
        await firebase.auth().signOut();
        toast("Confirme o e-mail do administrador no Firebase antes de editar.");
        return;
      }
      userId = result.user.uid;
      isAdmin = true;
      aplicarPermissoes();
      $("login").classList.add("hidden");
      await recarregar();
      await syncWithFirestore();
    } catch (err) {
      toast(err.code === "auth/invalid-credential" ? "E-mail ou senha inválidos." : "Não foi possível entrar.");
    }
  }

  async function reenviarVerificacao() {
    var email = $("loginEmail").value.trim();
    var senha = $("loginPassword").value;
    if (!email || !senha) {
      toast("Informe o e-mail e a senha para reenviar a confirmação.");
      return;
    }
    try {
      var result = await firebase.auth().signInWithEmailAndPassword(email, senha);
      var idToken = await result.user.getIdTokenResult();
      if (!(idToken && idToken.claims && idToken.claims.isAdmin)) {
        await firebase.auth().signOut();
        toast("Conta sem permissão de administrador.");
        return;
      }
      if (result.user.emailVerified) {
        await firebase.auth().signOut();
        toast("Este e-mail já está confirmado. Tente entrar novamente.");
        return;
      }
      await result.user.sendEmailVerification();
      await firebase.auth().signOut();
      toast("E-mail de confirmação reenviado. Verifique sua caixa de entrada.");
    } catch (err) {
      toast(err.code === "auth/invalid-credential" ? "E-mail ou senha inválidos." : "Não foi possível reenviar o e-mail.");
    }
  }

  document.addEventListener("DOMContentLoaded", async function () {
    splash();
    registrarSW();

    $("btnNovo").addEventListener("click", novo);
    $("btnAdmin").addEventListener("click", function () {
      mostrarLogin();
    });
    $("btnSair").addEventListener("click", function () { firebase.auth().signOut(); });
    $("btnFecharLogin").addEventListener("click", function () { $("login").classList.add("hidden"); });
    $("loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      entrar($("loginEmail").value.trim(), $("loginPassword").value, false);
    });
    $("btnReenviarVerificacao").addEventListener("click", reenviarVerificacao);
    $("btnInstall").addEventListener("click", installApp);
    window.addEventListener("beforeinstallprompt", showInstallButton);
    window.addEventListener("load", showInstallOption);
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
    $("btnMesAnterior").addEventListener("click", function () { alterarMes(-1); });
    $("btnProximoMes").addEventListener("click", function () { alterarMes(1); });
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
      $("app").classList.remove("hidden");
      $("login").classList.add("hidden");
      $("btnNovo").classList.add("hidden");
      $("btnAdmin").classList.remove("hidden");
      $("btnSair").classList.add("hidden");
      aplicarPermissoes();
      firebase.auth().onAuthStateChanged(async function (user) {
        if (user) {
          try {
            var idToken = await user.getIdTokenResult();
            if (idToken && idToken.claims && idToken.claims.isAdmin && user.emailVerified) {
              userId = user.uid;
              isAdmin = true;
            } else {
              userId = null;
              isAdmin = false;
            }
          } catch (ex) {
            userId = null;
            isAdmin = false;
          }
        } else {
          userId = null;
          isAdmin = false;
        }
        if (user && !isAdmin) {
          await firebase.auth().signOut();
          return;
        }
        if (isAdmin) {
          await recarregar();
        } else {
          cache = [];
          render();
        }
        await syncWithFirestore();
        $("login").classList.add("hidden");
        $("btnNovo").classList.toggle("hidden", !isAdmin);
        $("btnAdmin").classList.toggle("hidden", isAdmin);
        $("btnSair").classList.toggle("hidden", !isAdmin);
        aplicarPermissoes();
      });
      window.addEventListener("online", syncWithFirestore);
    } catch (err) {
      $("app").classList.remove("hidden");
      cache = [];
      render();
      toast("Falha ao abrir o banco local.");
    }
  });
})();
