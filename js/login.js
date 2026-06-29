import { auth } from "./firebase-config.js";
import { USUARIOS } from "./usuarios.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const select = document.getElementById("usuario");
Object.entries(USUARIOS).forEach(([email, dados]) => {
  const opt = document.createElement("option");
  opt.value = email;
  opt.textContent = dados.nome;
  select.appendChild(opt);
});

// Se já estiver logado, vai direto para o app
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = "app.html";
});

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");
const btn = document.getElementById("loginBtn");

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("show");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("show");
  const email = select.value;
  const senha = document.getElementById("senha").value;

  if (!email) {
    showError("Selecione seu nome na lista.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Entrando...";

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    window.location.href = "app.html";
  } catch (err) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
      showError("Senha incorreta. Confira e tente de novo.");
    } else if (err.code === "auth/too-many-requests") {
      showError("Muitas tentativas. Aguarde um pouco e tente de novo.");
    } else {
      showError("Não foi possível entrar. Confira sua conexão e tente de novo.");
    }
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});
