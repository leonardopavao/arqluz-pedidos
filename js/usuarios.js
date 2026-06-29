// Lista de usuários do sistema.
// Para adicionar alguém novo: crie o login em Firebase Console > Authentication > Add user
// (use um e-mail no padrão abaixo, pode ser fictício, só precisa ser único)
// e adicione uma linha aqui com o mesmo e-mail.
export const USUARIOS = {
  "larissa@arqluzpedidos.app": { nome: "Larissa", papel: "vendedor" },
  "geovana@arqluzpedidos.app": { nome: "Geovana", papel: "vendedor" },
  "thays@arqluzpedidos.app": { nome: "Thays", papel: "vendedor" },
  "clarissa@arqluzpedidos.app": { nome: "Clarissa", papel: "vendedor" },
  "leonardo@arqluzpedidos.app": { nome: "Leonardo", papel: "admin" },
  "estoque@arqluzpedidos.app": { nome: "Estoque", papel: "estoque" },
};

// papel: "vendedor" -> cadastra entregas e visitas, vê tudo
// papel: "estoque"  -> vê tudo, atualiza status das entregas/visitas
// papel: "admin"    -> acesso total
