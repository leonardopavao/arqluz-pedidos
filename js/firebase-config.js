// Configuração do Firebase — projeto arqluz-pedidos
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCcsnFYOOzGJm6QCWQ4qnOMcd0oDGKgEg4",
  authDomain: "arqluz-pedidos.firebaseapp.com",
  projectId: "arqluz-pedidos",
  storageBucket: "arqluz-pedidos.firebasestorage.app",
  messagingSenderId: "765591934708",
  appId: "1:765591934708:web:e20283d4036b17f69a30a1",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
