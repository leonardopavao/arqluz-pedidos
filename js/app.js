import { auth, db } from "./firebase-config.js";
import { USUARIOS } from "./usuarios.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Webhook opcional do Make.com para avisar no WhatsApp quando uma entrega nova é cadastrada.
// Deixe em branco por enquanto — a notificação dentro do site já funciona sem isso.
// Quando quiser ativar: crie um cenário no Make com gatilho "Webhooks > Custom webhook",
// cole a URL gerada aqui, e ligue a um módulo Z-API de envio de WhatsApp.
const MAKE_WEBHOOK_URL = "";

let currentUser = null; // { email, nome, papel }

const LAST_SEEN_KEY = "arqluz_pedidos_last_seen";

/* ===================== AUTENTICAÇÃO ===================== */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  const dados = USUARIOS[user.email];
  if (!dados) {
    // E-mail autenticado mas não cadastrado na lista de usuários do app
    signOut(auth);
    window.location.href = "index.html";
    return;
  }
  currentUser = { email: user.email, nome: dados.nome, papel: dados.papel };
  document.getElementById("userNome").textContent = currentUser.nome;
  document.getElementById("userPapel").textContent = currentUser.papel;
  iniciarApp();
});

document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

/* ===================== TABS ===================== */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "notificacoes") marcarNotificacoesComoVistas();
  });
});

/* ===================== MODAIS ===================== */
function abrirModal(id) { document.getElementById(id).classList.add("show"); }
function fecharModal(id) { document.getElementById(id).classList.remove("show"); }

document.getElementById("btnNovaEntrega").addEventListener("click", () => abrirModal("modalEntrega"));
document.getElementById("btnNovaObra").addEventListener("click", () => abrirModal("modalObra"));
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => fecharModal(btn.dataset.close));
});
document.querySelectorAll(".modal-backdrop").forEach((bg) => {
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.classList.remove("show"); });
});

// Seleção visual do porte (Pequena / Média / Grande)
document.querySelectorAll("#ent_porte_options .porte-opt").forEach((label) => {
  label.addEventListener("click", () => {
    document.querySelectorAll("#ent_porte_options .porte-opt").forEach((l) => l.classList.remove("checked"));
    label.classList.add("checked");
    label.querySelector("input").checked = true;
  });
});

/* ===================== ENTREGAS ===================== */
const entregasRef = collection(db, "entregas");
let entregasCache = [];
let filtroEntregaAtual = "todos";

document.getElementById("formEntrega").addEventListener("submit", async (e) => {
  e.preventDefault();
  const porteInput = document.querySelector('input[name="ent_porte"]:checked');
  if (!porteInput) { alert("Selecione o porte da entrega."); return; }

  const dados = {
    cliente: document.getElementById("ent_cliente").value.trim(),
    telefone: document.getElementById("ent_telefone").value.trim(),
    dataPrevista: document.getElementById("ent_data").value,
    endereco: document.getElementById("ent_endereco").value.trim(),
    bairro: document.getElementById("ent_bairro").value.trim(),
    cidade: document.getElementById("ent_cidade").value.trim(),
    porte: porteInput.value,
    observacao: document.getElementById("ent_obs").value.trim(),
    status: "Novo",
    vendedor: currentUser.nome,
    vendedorEmail: currentUser.email,
    criadoEm: serverTimestamp(),
  };

  await addDoc(entregasRef, dados);
  await registrarNotificacao(`${currentUser.nome} cadastrou uma entrega para ${dados.cliente} — porte ${dados.porte}`);
  notificarWhatsApp(`📦 Nova entrega cadastrada por ${currentUser.nome}\nCliente: ${dados.cliente}\nPorte: ${dados.porte}\nData prevista: ${formatarData(dados.dataPrevista)}`);

  e.target.reset();
  document.querySelectorAll("#ent_porte_options .porte-opt").forEach((l) => l.classList.remove("checked"));
  fecharModal("modalEntrega");
});

onSnapshot(query(entregasRef, orderBy("criadoEm", "desc")), (snap) => {
  entregasCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  document.getElementById("countEntregas").textContent = entregasCache.filter((e) => e.status !== "Entregue").length;
  renderEntregas();
});

document.getElementById("filtrosEntrega").addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  document.querySelectorAll("#filtrosEntrega .filter-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  filtroEntregaAtual = chip.dataset.status;
  renderEntregas();
});

function renderEntregas() {
  const lista = document.getElementById("listaEntregas");
  const itens = filtroEntregaAtual === "todos"
    ? entregasCache
    : entregasCache.filter((e) => e.status === filtroEntregaAtual);

  if (itens.length === 0) {
    lista.innerHTML = `<div class="empty-state"><div class="login-bulb" style="width:30px;height:30px;display:inline-block;"></div><p>Nenhuma entrega aqui ainda.</p></div>`;
    return;
  }

  const podeAtualizarStatus = currentUser.papel === "estoque" || currentUser.papel === "admin";

  lista.innerHTML = itens.map((it) => {
    const porteClasse = it.porte === "Pequena" ? "pequena" : it.porte === "Média" ? "media" : "grande";
    const statusClasse = "status-" + it.status.toLowerCase().replace(/\s/g, "");
    const acoes = podeAtualizarStatus
      ? `<select class="status-select" data-id="${it.id}" data-col="entregas">
          ${["Novo","Visto","Em rota","Entregue"].map((s) => `<option value="${s}" ${s === it.status ? "selected" : ""}>${s}</option>`).join("")}
        </select>`
      : `<span class="status-badge ${statusClasse}">${it.status}</span>`;

    return `
      <div class="item-card">
        <div class="porte-bulb ${porteClasse}" title="Porte: ${it.porte}"></div>
        <div class="item-main">
          <div class="cliente">${escapeHtml(it.cliente)}</div>
          <div class="meta">${[it.endereco, it.bairro, it.cidade].filter(Boolean).join(" · ") || "Endereço não informado"} ${it.dataPrevista ? "· " + formatarData(it.dataPrevista) : ""}</div>
          ${it.observacao ? `<div class="obs">${escapeHtml(it.observacao)}</div>` : ""}
          <div class="tags">
            <span class="tag">${escapeHtml(it.vendedor)}</span>
            ${it.telefone ? `<span class="tag">${escapeHtml(it.telefone)}</span>` : ""}
          </div>
        </div>
        <div class="item-actions">${acoes}</div>
      </div>`;
  }).join("");

  if (podeAtualizarStatus) {
    lista.querySelectorAll(".status-select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        await updateDoc(doc(db, "entregas", sel.dataset.id), { status: sel.value });
        await registrarNotificacao(`${currentUser.nome} atualizou a entrega para "${sel.value}"`);
      });
    });
  }
}

/* ===================== VISITA EM OBRA ===================== */
const obraRef = collection(db, "visitasObra");
let obraCache = [];
let filtroObraAtual = "todos";

document.getElementById("formObra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = {
    data: document.getElementById("obra_data").value,
    saida: document.getElementById("obra_saida").value,
    volta: document.getElementById("obra_volta").value,
    motivo: document.getElementById("obra_motivo").value.trim(),
    destino: document.getElementById("obra_destino").value.trim(),
    clienteObra: document.getElementById("obra_cliente").value.trim(),
    responsavel: currentUser.nome,
    status: "Agendada",
    criadoEm: serverTimestamp(),
  };

  await addDoc(obraRef, dados);
  await registrarNotificacao(`${currentUser.nome} agendou uma visita em obra — ${dados.destino || dados.motivo}`);
  notificarWhatsApp(`🚗 Visita em obra agendada por ${currentUser.nome}\nDestino: ${dados.destino}\nMotivo: ${dados.motivo}\nData: ${formatarData(dados.data)}`);

  e.target.reset();
  fecharModal("modalObra");
});

onSnapshot(query(obraRef, orderBy("criadoEm", "desc")), (snap) => {
  obraCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  document.getElementById("countObra").textContent = obraCache.filter((o) => o.status !== "Concluída").length;
  renderObra();
});

document.getElementById("filtrosObra").addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  document.querySelectorAll("#filtrosObra .filter-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  filtroObraAtual = chip.dataset.status;
  renderObra();
});

function renderObra() {
  const lista = document.getElementById("listaObra");
  const itens = filtroObraAtual === "todos" ? obraCache : obraCache.filter((o) => o.status === filtroObraAtual);

  if (itens.length === 0) {
    lista.innerHTML = `<div class="empty-state"><div class="login-bulb" style="width:30px;height:30px;display:inline-block;"></div><p>Nenhuma visita registrada ainda.</p></div>`;
    return;
  }

  lista.innerHTML = itens.map((it) => {
    const statusClasse = "status-" + it.status.toLowerCase().replace(/\s/g, "");
    const horario = [it.saida, it.volta].filter(Boolean).map((h, i) => i === 0 ? `saída ${h}` : `volta ${h}`).join(" · ");
    return `
      <div class="item-card" style="grid-template-columns: 1fr auto;">
        <div class="item-main">
          <div class="cliente">${escapeHtml(it.destino || it.motivo)}</div>
          <div class="meta">${escapeHtml(it.motivo)} ${it.clienteObra ? "· " + escapeHtml(it.clienteObra) : ""} ${it.data ? "· " + formatarData(it.data) : ""} ${horario ? "· " + horario : ""}</div>
          <div class="tags"><span class="tag">${escapeHtml(it.responsavel)}</span></div>
        </div>
        <div class="item-actions">
          <select class="status-select" data-id="${it.id}">
            ${["Agendada","Em andamento","Concluída"].map((s) => `<option value="${s}" ${s === it.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>`;
  }).join("");

  lista.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await updateDoc(doc(db, "visitasObra", sel.dataset.id), { status: sel.value });
      await registrarNotificacao(`${currentUser.nome} atualizou a visita para "${sel.value}"`);
    });
  });
}

/* ===================== NOTIFICAÇÕES ===================== */
const notifRef = collection(db, "notificacoes");

async function registrarNotificacao(mensagem) {
  await addDoc(notifRef, { mensagem, criadoEm: serverTimestamp() });
}

let notifCache = [];
onSnapshot(query(notifRef, orderBy("criadoEm", "desc")), (snap) => {
  notifCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderNotificacoes();
  atualizarBadge();
});

function renderNotificacoes() {
  const lista = document.getElementById("listaNotificacoes");
  if (notifCache.length === 0) {
    lista.innerHTML = `<div class="empty-state"><p>Sem notificações ainda.</p></div>`;
    return;
  }
  lista.innerHTML = notifCache.slice(0, 100).map((n) => `
    <div class="notif-item">
      <div class="notif-dot"></div>
      <div>
        <div class="notif-text">${escapeHtml(n.mensagem)}</div>
        <div class="notif-time">${formatarDataHora(n.criadoEm)}</div>
      </div>
    </div>`).join("");
}

function getLastSeen() {
  return parseInt(localStorage.getItem(LAST_SEEN_KEY) || "0", 10);
}

function atualizarBadge() {
  const lastSeen = getLastSeen();
  const naoLidas = notifCache.filter((n) => n.criadoEm && n.criadoEm.toMillis && n.criadoEm.toMillis() > lastSeen).length;
  const dot = document.getElementById("bellDot");
  const bell = document.getElementById("bellBtn");
  document.getElementById("countNotif").textContent = naoLidas;
  if (naoLidas > 0) {
    dot.textContent = naoLidas > 99 ? "99+" : naoLidas;
    dot.classList.add("show");
    bell.classList.add("has-unread");
  } else {
    dot.classList.remove("show");
    bell.classList.remove("has-unread");
  }
}

function marcarNotificacoesComoVistas() {
  localStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
  atualizarBadge();
}

document.getElementById("bellBtn").addEventListener("click", () => {
  document.querySelector('.tab-btn[data-tab="notificacoes"]').click();
});

/* ===================== WHATSAPP (Make.com) — opcional ===================== */
function notificarWhatsApp(texto) {
  if (!MAKE_WEBHOOK_URL) return;
  fetch(MAKE_WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  }).catch(() => {});
}

/* ===================== HELPERS ===================== */
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

function formatarData(isoStr) {
  if (!isoStr) return "";
  const [ano, mes, dia] = isoStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(ts) {
  if (!ts || !ts.toDate) return "agora";
  const d = ts.toDate();
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function iniciarApp() {
  // ponto de extensão futuro (ex: carregar preferências do usuário)
}
