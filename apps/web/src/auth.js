export const ROLES = {
  PROSPECTOR: "prospector",
  AVALIADOR: "avaliador",
  GESTOR_PROSPECCAO_RENEGOCIACAO: "gestor_prospeccao_renegociacao",
  GESTOR_NOVOS_NEGOCIOS: "gestor_novos_negocios",
  GESTOR_FINANCEIRO_RH: "gestor_financeiro_rh",
  GESTOR_AVALIACAO: "gestor_avaliacao",
  GESTOR_AGENDAMENTO: "gestor_agendamento",
  CEO: "ceo",
  ADMIN: "admin",
};

export const ROLE_LABELS = {
  [ROLES.PROSPECTOR]: "Prospector",
  [ROLES.AVALIADOR]: "Avaliador",
  [ROLES.GESTOR_PROSPECCAO_RENEGOCIACAO]: "Gestor Prospeccao/Renegociacao",
  [ROLES.GESTOR_NOVOS_NEGOCIOS]: "Gestor Novos Negocios",
  [ROLES.GESTOR_FINANCEIRO_RH]: "Gestor Financeiro/RH",
  [ROLES.GESTOR_AVALIACAO]: "Gestor Avaliacao",
  [ROLES.GESTOR_AGENDAMENTO]: "Gestor Agendamento",
  [ROLES.CEO]: "CEO",
  [ROLES.ADMIN]: "Administrador",
};

export const ROLE_OPTIONS = [
  ROLES.PROSPECTOR,
  ROLES.AVALIADOR,
  ROLES.GESTOR_PROSPECCAO_RENEGOCIACAO,
  ROLES.GESTOR_NOVOS_NEGOCIOS,
  ROLES.GESTOR_FINANCEIRO_RH,
  ROLES.GESTOR_AVALIACAO,
  ROLES.GESTOR_AGENDAMENTO,
  ROLES.CEO,
  ROLES.ADMIN,
];

export const AREA_LABELS = {
  prospeccao: "Prospeccao",
  renegociacao: "Renegociacao",
  avaliacao: "Avaliacao",
  dbicre: "DBICRE",
  financeiro: "Financeiro",
  rh: "RH",
  gestao: "Perfil",
};

export const AREA_ROUTES = {
  prospeccao: "/prospeccao",
  renegociacao: "/renegociacao",
  avaliacao: "/avaliacao",
  dbicre: "/dbicre",
  financeiro: "/financeiro",
  rh: "/rh",
  gestao: "/perfil",
};

export const AUTH_STORAGE_KEYS = {
  ok: "auth-ok",
  role: "auth-role",
  user: "auth-user",
};

export const AUTH_USERS_KEY = "auth-users";

export const DEFAULT_ROLE = ROLES.PROSPECTOR;

export const ROLE_PERMISSIONS = {
  [ROLES.PROSPECTOR]: {
    areas: {
      prospeccao: true,
      renegociacao: true,
      avaliacao: false,
      dbicre: true,
      financeiro: true,
      rh: false,
      gestao: true,
    },
    prospeccao: {
      cadastrar: true,
      consultar: true,
      relatorio: true,
      editar: true,
      excluir: true,
      agendar: true,
      custos: true,
    },
    renegociacao: { view: true, editar: true },
    avaliacao: { view: false, editar: false },
    dbicre: { view: true, editar: false },
    financeiro: { view: true, editar: false },
    rh: { view: false, editar: false },
    gestao: { view: true, editar: true },
  },
  [ROLES.AVALIADOR]: {
    areas: {
      prospeccao: false,
      renegociacao: false,
      avaliacao: true,
      dbicre: true,
      financeiro: true,
      rh: false,
      gestao: true,
    },
    prospeccao: {
      cadastrar: false,
      consultar: false,
      relatorio: false,
      editar: false,
      excluir: false,
      agendar: false,
      custos: false,
    },
    renegociacao: { view: false, editar: false },
    avaliacao: { view: true, editar: true, logs: false },
    dbicre: { view: true, editar: false },
    financeiro: { view: true, editar: false },
    rh: { view: false, editar: false },
    gestao: { view: true, editar: true },
  },
  [ROLES.GESTOR_PROSPECCAO_RENEGOCIACAO]: {
    areas: {
      prospeccao: true,
      renegociacao: true,
      avaliacao: false,
      dbicre: false,
      financeiro: false,
      rh: false,
      gestao: true,
    },
    prospeccao: {
      cadastrar: true,
      consultar: true,
      relatorio: true,
      editar: true,
      excluir: true,
      agendar: true,
      custos: true,
    },
    renegociacao: { view: true, editar: true },
    avaliacao: { view: false, editar: false },
    dbicre: { view: false, editar: false },
    financeiro: { view: false, editar: false },
    rh: { view: false, editar: false },
    gestao: { view: true, editar: true },
  },
  [ROLES.GESTOR_NOVOS_NEGOCIOS]: {
    areas: {
      prospeccao: false,
      renegociacao: false,
      avaliacao: false,
      dbicre: false,
      financeiro: false,
      rh: false,
      gestao: true,
    },
    prospeccao: {
      cadastrar: false,
      consultar: false,
      relatorio: false,
      editar: false,
      excluir: false,
      agendar: false,
      custos: false,
    },
    renegociacao: { view: false, editar: false },
    avaliacao: { view: false, editar: false },
    dbicre: { view: false, editar: false },
    financeiro: { view: false, editar: false },
    rh: { view: false, editar: false },
    gestao: { view: true, editar: true },
  },
  [ROLES.GESTOR_FINANCEIRO_RH]: {
    areas: {
      prospeccao: false,
      renegociacao: false,
      avaliacao: false,
      dbicre: false,
      financeiro: true,
      rh: true,
      gestao: true,
    },
    prospeccao: {
      cadastrar: false,
      consultar: false,
      relatorio: false,
      editar: false,
      excluir: false,
      agendar: false,
      custos: false,
    },
    renegociacao: { view: false, editar: false },
    avaliacao: { view: false, editar: false },
    dbicre: { view: false, editar: false },
    financeiro: { view: true, editar: true },
    rh: { view: true, editar: true },
    gestao: { view: true, editar: true },
  },
  [ROLES.GESTOR_AVALIACAO]: {
    areas: {
      prospeccao: false,
      renegociacao: false,
      avaliacao: true,
      dbicre: false,
      financeiro: false,
      rh: false,
      gestao: true,
    },
    prospeccao: {
      cadastrar: false,
      consultar: false,
      relatorio: false,
      editar: false,
      excluir: false,
      agendar: false,
      custos: false,
    },
    renegociacao: { view: false, editar: false },
    avaliacao: { view: true, editar: true, logs: true },
    dbicre: { view: false, editar: false },
    financeiro: { view: false, editar: false },
    rh: { view: false, editar: false },
    gestao: { view: true, editar: true },
  },
  [ROLES.GESTOR_AGENDAMENTO]: {
    areas: {
      prospeccao: false,
      renegociacao: false,
      avaliacao: false,
      dbicre: false,
      financeiro: false,
      rh: false,
      gestao: true,
    },
    prospeccao: {
      cadastrar: false,
      consultar: false,
      relatorio: false,
      editar: false,
      excluir: false,
      agendar: false,
      custos: false,
    },
    renegociacao: { view: false, editar: false },
    avaliacao: { view: false, editar: false },
    dbicre: { view: false, editar: false },
    financeiro: { view: false, editar: false },
    rh: { view: false, editar: false },
    gestao: { view: true, editar: true },
  },
  [ROLES.CEO]: {
    areas: {
      prospeccao: true,
      renegociacao: true,
      avaliacao: true,
      dbicre: true,
      financeiro: true,
      rh: true,
      gestao: true,
    },
    prospeccao: {
      cadastrar: true,
      consultar: true,
      relatorio: true,
      editar: true,
      excluir: true,
      agendar: true,
      custos: true,
    },
    renegociacao: { view: true, editar: true },
    avaliacao: { view: true, editar: true, logs: true },
    dbicre: { view: true, editar: true },
    financeiro: { view: true, editar: true },
    rh: { view: true, editar: true },
    gestao: { view: true, editar: true },
  },
  [ROLES.ADMIN]: {
    areas: {
      prospeccao: true,
      renegociacao: true,
      avaliacao: true,
      dbicre: true,
      financeiro: true,
      rh: true,
      gestao: true,
    },
    prospeccao: {
      cadastrar: true,
      consultar: true,
      relatorio: true,
      editar: true,
      excluir: true,
      agendar: true,
      custos: true,
    },
    renegociacao: { view: true, editar: true },
    avaliacao: { view: true, editar: true, logs: true },
    dbicre: { view: true, editar: true },
    financeiro: { view: true, editar: true },
    rh: { view: true, editar: true },
    gestao: { view: true, editar: true },
  },
};

export const AUTH_USERS = [
  {
    id: "user-murillo",
    personalEmail: "murillo.scaff@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.ADMIN,
    isManager: false,
    teamId: "",
  },
  {
    id: "user-sabrina",
    username: "sabrina",
    password: "123456",
    role: ROLES.GESTOR_PROSPECCAO_RENEGOCIACAO,
    displayName: "Sabrina",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-joao",
    username: "joao",
    password: "123456",
    role: ROLES.GESTOR_NOVOS_NEGOCIOS,
    displayName: "Joao",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-luciana",
    username: "luciana",
    password: "123456",
    role: ROLES.GESTOR_FINANCEIRO_RH,
    displayName: "Luciana",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-jaqueline",
    username: "jaqueline",
    password: "123456",
    role: ROLES.GESTOR_AVALIACAO,
    displayName: "Jaqueline",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-diego",
    username: "diego",
    password: "123456",
    role: ROLES.GESTOR_AVALIACAO,
    displayName: "Diego",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-barbara",
    username: "barbara",
    password: "123456",
    role: ROLES.GESTOR_AGENDAMENTO,
    displayName: "Barbara",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-ana",
    username: "ana",
    password: "123456",
    role: ROLES.CEO,
    displayName: "Ana",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-nelson",
    username: "nelson",
    password: "123456",
    role: ROLES.CEO,
    displayName: "Nelson",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-inacio",
    username: "inacio",
    password: "123456",
    role: ROLES.CEO,
    displayName: "Inacio",
    isManager: true,
    teamId: "",
  },
  {
    id: "user-prospector",
    personalEmail: "prospector@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.PROSPECTOR,
    isManager: false,
    teamId: "",
  },
  {
    id: "user-avaliador",
    personalEmail: "avaliador@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.AVALIADOR,
    isManager: false,
    teamId: "",
  },
  {
    id: "user-ceo",
    personalEmail: "ceo@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.CEO,
    isManager: true,
    teamId: "",
  },
  { id: "user-invest", username: "invest", password: "corpinvest", role: ROLES.ADMIN, isManager: false, teamId: "" },
  { id: "user-admin", username: "admin", password: "admin123", role: ROLES.ADMIN, isManager: false, teamId: "" },
];

const normalizeUser = (value) => String(value || "").trim().toLowerCase();

const sanitizeUsers = (users) =>
  users.map((user, idx) => ({
    id: user.id || `user-${idx + 1}`,
    displayName: user.displayName || "",
    personalEmail: user.personalEmail || "",
    companyEmail: user.companyEmail || "",
    username: user.username || "",
    password: user.password || "",
    role: user.role || DEFAULT_ROLE,
    isManager: Boolean(user.isManager),
    teamId: user.teamId || "",
  }));

const mergeSeedUsers = (stored, seeds) => {
  const byId = new Map();
  stored.forEach((user) => byId.set(user.id, user));
  seeds.forEach((seed) => {
    const existing = byId.get(seed.id);
    if (!existing) {
      byId.set(seed.id, seed);
      return;
    }
    if (!existing.displayName && seed.displayName) existing.displayName = seed.displayName;
    if (!existing.role && seed.role) existing.role = seed.role;
    if (!existing.isManager && seed.isManager) existing.isManager = true;
  });
  return Array.from(byId.values());
};

export const loadUsers = () => {
  try {
    const raw = localStorage.getItem(AUTH_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const sanitized = sanitizeUsers(parsed);
        const seeded = sanitizeUsers(AUTH_USERS);
        const merged = mergeSeedUsers(sanitized, seeded);
        localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch {
    // ignore
  }
  const seeded = sanitizeUsers(AUTH_USERS);
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(seeded));
  return seeded;
};

export const saveUsers = (users) => {
  const sanitized = sanitizeUsers(users || []);
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(sanitized));
  return sanitized;
};

export const getUserById = (idOrLogin) => {
  if (!idOrLogin) return null;
  const normalized = normalizeUser(idOrLogin);
  return (
    loadUsers().find(
      (user) =>
        user.id === idOrLogin ||
        normalizeUser(user.username) === normalized ||
        normalizeUser(user.personalEmail) === normalized ||
        normalizeUser(user.companyEmail) === normalized
    ) || null
  );
};

export const updateStoredUser = (id, patch) => {
  if (!id) return null;
  const users = loadUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) return null;
  const updated = { ...users[index], ...patch };
  users[index] = updated;
  saveUsers(users);
  return updated;
};

export const getFirstUserByRole = (role) =>
  loadUsers().find((user) => user.role === role) || null;

export const deriveDisplayName = (user) => {
  const base = user?.displayName || user?.companyEmail || user?.personalEmail || user?.username || "";
  if (!base) return "Usuario";
  if (user?.displayName) return user.displayName;
  const raw = base.includes("@") ? base.split("@")[0] : base;
  const cleaned = raw.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Usuario";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const findUserByCredentials = (user, pass) => {
  const login = normalizeUser(user);
  const users = loadUsers();
  if (!login) return null;
  const isEmail = login.includes("@");

  if (isEmail) {
    const entry =
      users.find((u) => normalizeUser(u.companyEmail) === login) ||
      users.find((u) => normalizeUser(u.personalEmail) === login);
    if (!entry) return null;
    if (entry.password) {
      if (normalizeUser(entry.companyEmail) !== login) return null;
      return entry.password === pass ? entry : null;
    }
    return normalizeUser(entry.personalEmail) === login ? entry : null;
  }

  const entry = users.find((u) => normalizeUser(u.username) === login);
  if (!entry) return null;
  if (entry.password && entry.password !== pass) return null;
  return entry;
};

export const getRolePermissions = (role) => ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[DEFAULT_ROLE];

export const getAreaPermissions = (role, area) => {
  const perms = getRolePermissions(role);
  return perms[area] || {};
};

export const canAccessArea = (role, area) => Boolean(getRolePermissions(role).areas?.[area]);

export const getAllowedAreas = (role) => {
  const areas = getRolePermissions(role).areas || {};
  return Object.keys(AREA_ROUTES).filter((area) => areas[area]);
};

export const getDefaultRouteForRole = (role) => {
  const allowed = getAllowedAreas(role);
  return AREA_ROUTES[allowed[0]] || "/prospeccao";
};

export const getRoleLabel = (role) => ROLE_LABELS[role] || "Desconhecido";

export const getAreaLabel = (area) => AREA_LABELS[area] || area;

export const resolveAreaFromPath = (pathname = "") => {
  if (pathname === "/" || pathname.startsWith("/prospeccao")) return "prospeccao";
  if (pathname.startsWith("/renegociacao")) return "renegociacao";
  if (pathname.startsWith("/avaliacao")) return "avaliacao";
  if (pathname.startsWith("/dbicre")) return "dbicre";
  if (pathname.startsWith("/financeiro")) return "financeiro";
  if (pathname.startsWith("/rh")) return "rh";
  if (pathname.startsWith("/perfil")) return "gestao";
  if (pathname.startsWith("/gestao")) return "gestao";
  return null;
};

export const isAdmin = (role) => [ROLES.ADMIN, ROLES.CEO].includes(role);

export const canManageTeam = (user, role) => {
  if (isAdmin(role)) return true;
  return Boolean(user?.isManager);
};
