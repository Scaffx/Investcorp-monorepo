export const ROLES = {
  PROSPECTOR: "prospector",
  AVALIADOR: "avaliador",
  CEO: "ceo",
  ADMIN: "admin",
};

export const ROLE_LABELS = {
  [ROLES.PROSPECTOR]: "Prospector",
  [ROLES.AVALIADOR]: "Avaliador",
  [ROLES.CEO]: "CEO",
  [ROLES.ADMIN]: "Administrador",
};

export const ROLE_OPTIONS = [ROLES.PROSPECTOR, ROLES.AVALIADOR, ROLES.CEO, ROLES.ADMIN];

export const AREA_LABELS = {
  prospeccao: "Prospeccao",
  renegociacao: "Renegociacao",
  avaliacao: "Avaliacao",
  dbicre: "DBICRE",
  financeiro: "Financeiro",
};

export const AREA_ROUTES = {
  prospeccao: "/prospeccao",
  renegociacao: "/renegociacao",
  avaliacao: "/avaliacao",
  dbicre: "/dbicre",
  financeiro: "/financeiro",
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
  },
  [ROLES.AVALIADOR]: {
    areas: {
      prospeccao: false,
      renegociacao: false,
      avaliacao: true,
      dbicre: true,
      financeiro: true,
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
    avaliacao: { view: true, editar: true },
    dbicre: { view: true, editar: false },
    financeiro: { view: true, editar: false },
  },
  [ROLES.CEO]: {
    areas: {
      prospeccao: true,
      renegociacao: true,
      avaliacao: true,
      dbicre: true,
      financeiro: true,
    },
    prospeccao: {
      cadastrar: false,
      consultar: true,
      relatorio: true,
      editar: false,
      excluir: false,
      agendar: false,
      custos: false,
    },
    renegociacao: { view: true, editar: false },
    avaliacao: { view: true, editar: false },
    dbicre: { view: true, editar: false },
    financeiro: { view: true, editar: false },
  },
  [ROLES.ADMIN]: {
    areas: {
      prospeccao: true,
      renegociacao: true,
      avaliacao: true,
      dbicre: true,
      financeiro: true,
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
    avaliacao: { view: true, editar: true },
    dbicre: { view: true, editar: true },
    financeiro: { view: true, editar: true },
  },
};

export const AUTH_USERS = [
  {
    id: "user-murillo",
    personalEmail: "murillo.scaff@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.ADMIN,
  },
  {
    id: "user-prospector",
    personalEmail: "prospector@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.PROSPECTOR,
  },
  {
    id: "user-avaliador",
    personalEmail: "avaliador@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.AVALIADOR,
  },
  {
    id: "user-ceo",
    personalEmail: "ceo@hotmail.com",
    companyEmail: "",
    password: "",
    role: ROLES.CEO,
  },
  { id: "user-invest", username: "invest", password: "corpinvest", role: ROLES.ADMIN },
  { id: "user-admin", username: "admin", password: "admin123", role: ROLES.ADMIN },
];

const normalizeUser = (value) => String(value || "").trim().toLowerCase();

const sanitizeUsers = (users) =>
  users.map((user, idx) => ({
    id: user.id || `user-${idx + 1}`,
    personalEmail: user.personalEmail || "",
    companyEmail: user.companyEmail || "",
    username: user.username || "",
    password: user.password || "",
    role: user.role || DEFAULT_ROLE,
  }));

export const loadUsers = () => {
  try {
    const raw = localStorage.getItem(AUTH_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        const sanitized = sanitizeUsers(parsed);
        localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(sanitized));
        return sanitized;
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
  const base = user?.companyEmail || user?.personalEmail || user?.username || "";
  if (!base) return "Usuario";
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
  return null;
};
