import { auth, db } from "./firebase-config.js";
import { USUARIOS } from "./usuarios.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Webhook opcional do Make.com para avisar no WhatsApp quando uma tarefa nova é cadastrada.
// Deixe em branco por enquanto — a notificação dentro do site já funciona sem isso.
const MAKE_WEBHOOK_URL = "";

let currentUser = null; // { email, nome, papel }
const LAST_SEEN_KEY = "arqluz_pedidos_last_seen";

// Fluxo de status por tipo de tarefa
const STATUS_FLOWS = {
  Entrega: ["Novo", "Visto", "Em rota", "Entregue"],
  Obra: ["Agendada", "Em andamento", "Concluída"],
  Retirada: ["Novo", "Pronto para retirada", "Retirado"],
};
const STATUS_FINAL = { Entrega: "Entregue", Obra: "Concluída", Retirada: "Retirado" };
const TIPO_ICONE = { Entrega: "📦", Obra: "🚗", Retirada: "🏬" };

/* ===================== AUTENTICAÇÃO ===================== */
onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  const dados = USUARIOS[user.email];
  if (!dados) { signOut(auth); window.location.href = "index.html"; return; }
  currentUser = { email: user.email, nome: dados.nome, papel: dados.papel };
  document.getElementById("userNome").textContent = currentUser.nome;
  document.getElementById("userPapel").textContent = currentUser.papel;
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

/* ===================== MODAL ===================== */
function abrirModal(id) { document.getElementById(id).classList.add("show"); }
function fecharModal(id) { document.getElementById(id).classList.remove("show"); }

document.getElementById("btnNovaTarefa").addEventListener("click", () => abrirModal("modalTarefa"));
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => fecharModal(btn.dataset.close));
});
document.querySelectorAll(".modal-backdrop").forEach((bg) => {
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.classList.remove("show"); });
});

// Seleção de porte (estilo botão)
document.querySelectorAll("#porte_options .porte-opt").forEach((label) => {
  label.addEventListener("click", () => {
    document.querySelectorAll("#porte_options .porte-opt").forEach((l) => l.classList.remove("checked"));
    label.classList.add("checked");
    label.querySelector("input").checked = true;
  });
});

// Seleção de tipo de tarefa -> mostra/esconde os grupos de campo relevantes
let tipoSelecionado = null;
document.querySelectorAll("#tipo_options .porte-opt").forEach((label) => {
  label.addEventListener("click", () => {
    document.querySelectorAll("#tipo_options .porte-opt").forEach((l) => l.classList.remove("checked"));
    label.classList.add("checked");
    label.querySelector("input").checked = true;
    tipoSelecionado = label.dataset.tipo;
    atualizarCamposVisiveis();
  });
});

function atualizarCamposVisiveis() {
  const grupoCliente = document.getElementById("grupo_cliente");
  const grupoEntrega = document.getElementById("grupo_entrega");
  const grupoObra = document.getElementById("grupo_obra");

  grupoCliente.hidden = !(tipoSelecionado === "Entrega" || tipoSelecionado === "Retirada");
  grupoEntrega.hidden = tipoSelecionado !== "Entrega";
  grupoObra.hidden = tipoSelecionado !== "Obra";

  document.getElementById("tf_cliente").required = grupoCliente.hidden ? false : true;
  document.getElementById("tf_motivo").required = grupoObra.hidden ? false : true;
  document.getElementById("tf_destino").required = grupoObra.hidden ? false : true;
}

function resetarModalTarefa() {
  document.getElementById("formTarefa").reset();
  tipoSelecionado = null;
  document.querySelectorAll("#tipo_options .porte-opt, #porte_options .porte-opt").forEach((l) => l.classList.remove("checked"));
  atualizarCamposVisiveis();
}

/* ===================== FIRESTORE: TAREFAS ===================== */
const tarefasRef = collection(db, "tarefas");
let tarefasCache = [];
let filtroTipoAtual = "todos";
let filtroHistoricoAtual = "todos";

document.getElementById("formTarefa").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!tipoSelecionado) { alert("Selecione o tipo da tarefa (Entrega, Visita em obra ou Retirada)."); return; }

  const dados = {
    tipo: tipoSelecionado,
    data: document.getElementById("tf_data").value,
    observacao: document.getElementById("tf_obs").value.trim(),
    responsavel: currentUser.nome,
    status: STATUS_FLOWS[tipoSelecionado][0],
    criadoEm: serverTimestamp(),
  };

  if (tipoSelecionado === "Entrega" || tipoSelecionado === "Retirada") {
    const porteInput = document.querySelector('input[name="tf_porte"]:checked');
    if (!porteInput) { alert("Selecione o porte da mercadoria."); return; }
    dados.cliente = document.getElementById("tf_cliente").value.trim();
    dados.telefone = document.getElementById("tf_telefone").value.trim();
    dados.porte = porteInput.value;
  }

  if (tipoSelecionado === "Entrega") {
    dados.endereco = document.getElementById("tf_endereco").value.trim();
    dados.bairro = document.getElementById("tf_bairro").value.trim();
    dados.cidade = document.getElementById("tf_cidade").value.trim();
  }

  if (tipoSelecionado === "Obra") {
    dados.motivo = document.getElementById("tf_motivo").value.trim();
    dados.destino = document.getElementById("tf_destino").value.trim();
    dados.clienteObra = document.getElementById("tf_clienteObra").value.trim();
    dados.saida = document.getElementById("tf_saida").value;
    dados.volta = document.getElementById("tf_volta").value;
  }

  await addDoc(tarefasRef, dados);

  const resumo = tipoSelecionado === "Obra"
    ? `${dados.destino || dados.motivo}`
    : `${dados.cliente} — porte ${dados.porte}`;
  await registrarNotificacao(`${currentUser.nome} cadastrou ${tipoSelecionado.toLowerCase() === "obra" ? "uma visita em obra" : "uma " + tipoSelecionado.toLowerCase()} — ${resumo}`);
  notificarWhatsApp(`${TIPO_ICONE[tipoSelecionado]} Nova tarefa (${tipoSelecionado}) cadastrada por ${currentUser.nome}\n${resumo}\nData: ${formatarData(dados.data)}`);

  resetarModalTarefa();
  fecharModal("modalTarefa");
});

onSnapshot(query(tarefasRef, orderBy("criadoEm", "desc")), (snap) => {
  tarefasCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  document.getElementById("countTarefas").textContent =
    tarefasCache.filter((t) => t.status !== STATUS_FINAL[t.tipo]).length;
  renderTarefas();
  renderHistorico();
});

document.getElementById("filtrosTipo").addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  document.querySelectorAll("#filtrosTipo .filter-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  filtroTipoAtual = chip.dataset.tipo;
  renderTarefas();
});

document.getElementById("filtrosHistorico").addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  document.querySelectorAll("#filtrosHistorico .filter-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  filtroHistoricoAtual = chip.dataset.tipo;
  renderHistorico();
});

function podeAtualizarStatus(item) {
  if (currentUser.papel === "admin") return true;
  if (item.tipo === "Obra") return item.responsavel === currentUser.nome || currentUser.papel === "estoque";
  return currentUser.papel === "estoque";
}

function renderItemCard(it, finalizada) {
  const flow = STATUS_FLOWS[it.tipo] || [it.status];
  const statusClasse = "status-" + it.status.toLowerCase().replace(/\s/g, "");
  const porteClasse = it.porte === "Pequena" ? "pequena" : it.porte === "Média" ? "media" : it.porte === "Grande" ? "grande" : null;

  let titulo, meta;
  if (it.tipo === "Obra") {
    titulo = it.destino || it.motivo;
    const horario = [it.saida && `saída ${it.saida}`, it.volta && `volta ${it.volta}`].filter(Boolean).join(" · ");
    meta = [it.motivo, it.clienteObra, it.data && formatarData(it.data), horario].filter(Boolean).join(" · ");
  } else {
    titulo = it.cliente;
    meta = [it.endereco, it.bairro, it.cidade, it.data && formatarData(it.data)].filter(Boolean).join(" · ") ||
      (it.data ? formatarData(it.data) : "");
  }

  const acoes = (!finalizada && podeAtualizarStatus(it))
    ? `<select class="status-select" data-id="${it.id}">
        ${flow.map((s) => `<option value="${s}" ${s === it.status ? "selected" : ""}>${s}</option>`).join("")}
      </select>`
    : `<span class="status-badge ${statusClasse}">${escapeHtml(it.status)}</span>`;

  const bulb = porteClasse ? `<div class="porte-bulb ${porteClasse}" title="Porte: ${it.porte}"></div>` : `<div style="font-size:18px;line-height:1;">${TIPO_ICONE[it.tipo]}</div>`;

  return `
    <div class="item-card" style="grid-template-columns: auto 1fr auto;">
      ${bulb}
      <div class="item-main">
        <div class="cliente">${TIPO_ICONE[it.tipo]} ${escapeHtml(titulo || "(sem título)")}</div>
        <div class="meta">${escapeHtml(meta)}</div>
        ${it.observacao ? `<div class="obs">${escapeHtml(it.observacao)}</div>` : ""}
        <div class="tags">
          <span class="tag">${it.tipo}</span>
          <span class="tag">${escapeHtml(it.responsavel)}</span>
          ${it.telefone ? `<span class="tag">${escapeHtml(it.telefone)}</span>` : ""}
        </div>
      </div>
      <div class="item-actions">${acoes}</div>
    </div>`;
}

function renderTarefas() {
  const lista = document.getElementById("listaTarefas");
  const ativas = tarefasCache.filter((t) => t.status !== STATUS_FINAL[t.tipo]);
  const itens = filtroTipoAtual === "todos" ? ativas : ativas.filter((t) => t.tipo === filtroTipoAtual);

  if (itens.length === 0) {
    lista.innerHTML = `<div class="empty-state"><div class="login-bulb" style="width:30px;height:30px;display:inline-block;"></div><p>Nenhuma tarefa por aqui.</p></div>`;
    return;
  }

  lista.innerHTML = itens.map((it) => renderItemCard(it, false)).join("");

  lista.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await updateDoc(doc(db, "tarefas", sel.dataset.id), { status: sel.value });
      await registrarNotificacao(`${currentUser.nome} atualizou uma tarefa para "${sel.value}"`);
    });
  });
}

function renderHistorico() {
  const lista = document.getElementById("listaHistorico");
  const feitas = tarefasCache.filter((t) => t.status === STATUS_FINAL[t.tipo]);
  const itens = filtroHistoricoAtual === "todos" ? feitas : feitas.filter((t) => t.tipo === filtroHistoricoAtual);

  document.getElementById("countHistorico").textContent = feitas.length;

  if (itens.length === 0) {
    lista.innerHTML = `<div class="empty-state"><p>Nada no histórico ainda.</p></div>`;
    return;
  }

  lista.innerHTML = itens.map((it) => renderItemCard(it, true)).join("");
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

function getLastSeen() { return parseInt(localStorage.getItem(LAST_SEEN_KEY) || "0", 10); }

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
  return String(str).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
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
