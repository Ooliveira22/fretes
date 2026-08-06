/* COMISSIONADO — Controle de Fretes e Comissões (offline, IndexedDB) */
(function () {
  "use strict";

  var DB_NAME = "comissionado";
  var DB_VERSION = 1;
  var STORE = "fretes";
  var db = null;
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
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }

  function getAll() {
    return new Promise(function (resolve, reject) {
      var req = tx("readonly").getAll();
      req.onsuccess = function () { resolve(req.result || []); };
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
    $("observacoes").value = f.observacoes || "";
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
    var registro = {
      data: $("data").value,
      origem: $("origem").value.trim(),
      destino: $("destino").value.trim(),
      cliente: $("cliente").value.trim(),
      valorFrete: Number($("valorFrete").value) || 0,
      valorComissao: Number($("valorComissao").value) || 0,
      status: statusAtual,
      observacoes: $("observacoes").value.trim(),
      dataCriacao: agora,
      ultimaAlteracao: agora,
    };
    if (id) {
      var antigo = cache.filter(function (f) { return String(f.id) === String(id); })[0];
      registro.id = Number(id);
      registro.dataCriacao = (antigo && antigo.dataCriacao) || agora;
    }
    await put(registro);
    fecharSheet();
    await recarregar();
    toast(id ? "Frete atualizado." : "Frete cadastrado.");
  }

  async function excluir() {
    var id = Number($("id").value);
    if (!id) return;
    if (!confirm("Excluir este frete definitivamente?")) return;
    await remove(id);
    fecharSheet();
    await recarregar();
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
      navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(function () {});
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

  document.addEventListener("DOMContentLoaded", async function () {
    splash();
    registrarSW();

    $("btnNovo").addEventListener("click", novo);
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
      await recarregar();
    } catch (err) {
      toast("Falha ao abrir o banco local.");
    }
  });
})();
