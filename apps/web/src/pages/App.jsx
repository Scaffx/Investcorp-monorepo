import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import Login from "../Login";
import Renegociacao, { RENEGOCIACAO_SECTIONS } from "./Renegociacao";
import Avaliacao, { AVALIACAO_SECTIONS } from "./Avaliacao";
import DBICRE from "./DBICRE";
import Financeiro, { FINANCE_SECTIONS } from "./Financeiro";
import Prospecao, { PROSPECCAO_SECTIONS } from "./Prospecao";
import "../styles/global.css";
import {
  AUTH_STORAGE_KEYS,
  findUserByCredentials,
  getFirstUserByRole,
  getAreaLabel,
  getAreaPermissions,
  getDefaultRouteForRole,
  getUserById,
  getRoleLabel,
  getRolePermissions,
  resolveAreaFromPath,
  updateStoredUser,
  deriveDisplayName,
  ROLE_LABELS,
  ROLE_OPTIONS,
  loadUsers,
  saveUsers,
  DEFAULT_ROLE,
} from "../auth";

function BrandBar({ invert }) {
  const logoSrc = invert ? "/InvestCorp-Logo--branco.png" : "/InvestCorp-Logo.png";

  return (
    <div className="brandbar">
      <img
        className="brandbar-logo"
        src={logoSrc}
        alt="InvestCorp"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
    </div>
  );
}

function MenuItem({ label, active, onClick, disabled }) {
  return (
    <button
      className={`topbar-tab ${active ? "topbar-tab-active" : ""} ${disabled ? "is-disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
      type="button"
      disabled={disabled}
      title={disabled ? "Sem permissao" : undefined}
    >
      {label}
    </button>
  );
}

function AccessDenied({ areaLabel, roleLabel, onGoHome }) {
  return (
    <div className="page access-denied">
      <h1>Acesso negado</h1>
      <p>Seu cargo ({roleLabel}) nao possui acesso a area: {areaLabel}.</p>
      <button type="button" className="table-btn" onClick={onGoHome}>
        Ir para area permitida
      </button>
    </div>
  );
}

function PermissionSwitcher({ role, onRoleChange }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = React.useRef({ startX: 0, startY: 0, baseX: 0, baseY: 0, dragging: false });

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragState.current.dragging) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setOffset({ x: dragState.current.baseX + dx, y: dragState.current.baseY + dy });
    };
    const handleUp = () => {
      dragState.current.dragging = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  const handlePointerDown = (e) => {
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      dragging: true,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  return (
    <div
      className="permission-switcher"
      style={{ transform: `translate(-50%, 0) translate(${offset.x}px, ${offset.y}px)` }}
    >
      <button type="button" className="permission-handle" onPointerDown={handlePointerDown}>
        Mover
      </button>
      <div className="permission-body">
        <span className="permission-label">Permissoes</span>
        <select
          className="permission-select"
          value={role}
          onChange={(e) => onRoleChange?.(e.target.value)}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {ROLE_LABELS[opt] || opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ProfileMenu({ user, roleLabel, onLogout, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const menuRef = React.useRef(null);
  const displayName = deriveDisplayName(user);
  const email = user?.companyEmail || user?.personalEmail || user?.username || "desconhecido";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  useEffect(() => {
    const handleClick = (event) => {
      if (!menuRef.current || menuRef.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className={`profile-menu ${open ? "is-open" : ""}`} ref={menuRef}>
      <button type="button" className="profile-trigger" onClick={() => setOpen((prev) => !prev)}>
        <span className="profile-avatar">{initials || "U"}</span>
      </button>
      {open && (
        <div className="profile-dropdown">
          <div className="profile-header">
            <div className="profile-avatar large">{initials || "U"}</div>
            <div className="profile-meta">
              <div className="profile-signed">SIGNED IN AS</div>
              <div className="profile-email">{email}</div>
              <div className="profile-name">{displayName}</div>
              <div className="profile-role">Acesso: {roleLabel}</div>
            </div>
          </div>
          <button type="button" className="profile-item" onClick={() => setOpen(false)}>
            Profile
          </button>
          <button
            type="button"
            className="profile-item"
            onClick={() => {
              setOpen(false);
              onOpenSettings?.();
            }}
          >
            Settings
          </button>
          <button
            type="button"
            className="profile-item danger"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

function SettingsModal({ open, onClose, user, onSave, themeMode, onThemeModeChange }) {
  const [companyEmail, setCompanyEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const dropdownRef = React.useRef(null);
  const displayName = deriveDisplayName(user);
  const personalEmail = user?.personalEmail || "";
  const appearanceLabel = {
    dark: "Escuro",
    light: "Claro",
  };

  useEffect(() => {
    if (!open) return;
    setCompanyEmail(user?.companyEmail || "");
    setPassword("");
    setConfirm("");
    setError("");
    setAppearanceOpen(false);
  }, [open, user?.id, user?.companyEmail]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (!dropdownRef.current || dropdownRef.current.contains(event.target)) return;
      setAppearanceOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    const emailValue = companyEmail.trim();
    if (!emailValue || !emailValue.includes("@")) {
      setError("Informe o email corporativo.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Defina uma senha com pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas nao conferem.");
      return;
    }
    onSave?.({ companyEmail: emailValue, password });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card settings-modal">
        <h2 className="modal-title">Configuracoes de acesso</h2>
        <p className="modal-subtitle">
          Primeiro acesso com a conta Microsoft. Depois defina o email corporativo e a senha.
        </p>
        <div className="settings-summary">
          <div><strong>Usuario:</strong> {displayName}</div>
          <div><strong>Email:</strong> {personalEmail || "-"}</div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">Geral</div>
          <div className="settings-row" ref={dropdownRef}>
            <span className="settings-row-label">Aparencia</span>
            <button
              type="button"
              className="appearance-trigger"
              onClick={() => setAppearanceOpen((prev) => !prev)}
            >
              <span className="appearance-icon" aria-hidden="true">
                {themeMode === "dark" ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8M1 13h3v-2H1m10 10h2v-3h-2m9-10v2h3v-2m-3.24 6.16l1.8 1.79 1.41-1.41-1.79-1.8M13 1h-2v3h2M4.22 18.36l1.42-1.42-1.8-1.79-1.41 1.41M12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                )}
              </span>
              <span>{appearanceLabel[themeMode] || "Claro"}</span>
              <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
                <path
                  d="M1.41.59 6 5.17 10.59.59 12 2l-6 6-6-6z"
                  fill="currentColor"
                />
              </svg>
            </button>
            {appearanceOpen && (
              <div className="appearance-dropdown">
                {["dark", "light"].map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className="appearance-option"
                    onClick={() => {
                      onThemeModeChange?.(mode);
                      setAppearanceOpen(false);
                    }}
                  >
                    <span>{appearanceLabel[mode]}</span>
                    {themeMode === mode && (
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path
                          d="M9 16.2l-3.5-3.5 1.4-1.4L9 13.4l7.1-7.1 1.4 1.4z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="settings-grid">
          <div className="settings-input-card">
            <label className="settings-label" htmlFor="company-email">Email corporativo</label>
            <input
              id="company-email"
              className="settings-input"
              type="email"
              placeholder="nome@investcorp.com.br"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
            />
          </div>
          <div className="settings-input-card">
            <label className="settings-label" htmlFor="company-pass">Nova senha</label>
            <input
              id="company-pass"
              className="settings-input"
              type="password"
              placeholder="Crie uma senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="settings-input-card">
            <label className="settings-label" htmlFor="company-pass-confirm">Confirmar senha</label>
            <input
              id="company-pass-confirm"
              className="settings-input"
              type="password"
              placeholder="Confirme a senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div className="modal-actions settings-actions">
          <button type="button" className="modal-btn modal-no" onClick={onClose}>Cancelar</button>
          <button type="button" className="modal-btn modal-yes" onClick={handleSave}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function MainApp({ role, onRoleChange, user, onLogout, onSaveUser }) {
  const navigate = useNavigate();
  const [themeMode, setThemeMode] = useState(() => {
    const stored = localStorage.getItem("theme-mode");
    if (stored === "dark" || stored === "light") return stored;
    return localStorage.getItem("themeInvert") === "1" ? "dark" : "light";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  );
  const showSidebarToggle = true;
  const [invert, setInvert] = useState(false);
  const location = useLocation();
  const permissions = useMemo(() => getRolePermissions(role), [role]);
  const roleLabel = getRoleLabel(role);
  const defaultRoute = useMemo(() => getDefaultRouteForRole(role), [role]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prospeccaoTab, setProspeccaoTab] = useState(PROSPECCAO_SECTIONS[0]?.key || "cadastrar");
  const [renegociacaoTab, setRenegociacaoTab] = useState(
    RENEGOCIACAO_SECTIONS[0]?.key || "regras"
  );
  const [financeiroTab, setFinanceiroTab] = useState(FINANCE_SECTIONS[0]?.key || "contas");
  const [avaliacaoTab, setAvaliacaoTab] = useState(AVALIACAO_SECTIONS[0]?.key || "buscador");

  useEffect(() => {
    const nextInvert = themeMode === "dark";
    setInvert(nextInvert);
    const el = document.documentElement;
    el.classList.toggle("invert", nextInvert);
    localStorage.setItem("themeInvert", nextInvert ? "1" : "0");
    localStorage.setItem("theme-mode", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("sidebar-collapsed", sidebarCollapsed);
    localStorage.setItem("sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEYS.ok);
    localStorage.removeItem(AUTH_STORAGE_KEYS.role);
    localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    window.location.reload();
  };

  const area = resolveAreaFromPath(location.pathname);
  const sidebarConfig = useMemo(() => {
    if (!area) return null;

    if (area === "prospeccao") {
      const prospeccaoPerms = getAreaPermissions(role, "prospeccao");
      const items = PROSPECCAO_SECTIONS.map((item) => ({
        key: item.key,
        label: item.label,
        disabled: !prospeccaoPerms[item.permission],
      }));
      return {
        title: getAreaLabel("prospeccao"),
        items,
        activeKey: prospeccaoTab,
        onSelect: setProspeccaoTab,
      };
    }

    if (area === "renegociacao") {
      return {
        title: getAreaLabel("renegociacao"),
        items: RENEGOCIACAO_SECTIONS,
        activeKey: renegociacaoTab,
        onSelect: setRenegociacaoTab,
      };
    }

    if (area === "financeiro") {
      return {
        title: getAreaLabel("financeiro"),
        items: FINANCE_SECTIONS,
        activeKey: financeiroTab,
        onSelect: setFinanceiroTab,
      };
    }

    if (area === "avaliacao") {
      return {
        title: getAreaLabel("avaliacao"),
        items: AVALIACAO_SECTIONS,
        activeKey: avaliacaoTab,
        onSelect: setAvaliacaoTab,
      };
    }

    if (area === "dbicre") {
      return {
        title: getAreaLabel("dbicre"),
        items: [{ key: "painel", label: "Painel" }],
        activeKey: "painel",
      };
    }

    return null;
  }, [area, role, prospeccaoTab, renegociacaoTab, financeiroTab, avaliacaoTab]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <BrandBar invert={invert} />

          <nav className="topbar-nav">
          <MenuItem
            label="Prospeccao"
            active={location.pathname === "/" || location.pathname === "/prospeccao"}
            onClick={() => navigate("/prospeccao")}
            disabled={!permissions.areas?.prospeccao}
          />
          <MenuItem
            label="Renegociacao"
            active={location.pathname === "/renegociacao"}
            onClick={() => navigate("/renegociacao")}
            disabled={!permissions.areas?.renegociacao}
          />
          <MenuItem
            label="Avaliacao"
            active={location.pathname === "/avaliacao"}
            onClick={() => navigate("/avaliacao")}
            disabled={!permissions.areas?.avaliacao}
          />
          <MenuItem
            label="DBICRE"
            active={location.pathname === "/dbicre"}
            onClick={() => navigate("/dbicre")}
            disabled={!permissions.areas?.dbicre}
          />
          <MenuItem
            label="Financeiro"
            active={location.pathname === "/financeiro"}
            onClick={() => navigate("/financeiro")}
            disabled={!permissions.areas?.financeiro}
          />
        </nav>
        </div>

        <div className="topbar-right">
          <div className="pill">{roleLabel}</div>
          <ProfileMenu
            user={user}
            roleLabel={roleLabel}
            onLogout={onLogout || handleLogout}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      </header>
      {showSidebarToggle && (
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          aria-pressed={sidebarCollapsed}
          title={sidebarCollapsed ? "Mostrar menu lateral" : "Ocultar menu lateral"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15.5 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* CONTEÃšDO */}
      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-title">{sidebarConfig?.title || "Menu"}</div>
          <nav className="sidebar-nav">
            {sidebarConfig?.items?.length ? (
              sidebarConfig.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`sidebar-item ${sidebarConfig.activeKey === item.key ? "sidebar-item-active" : ""} ${
                    item.disabled ? "is-disabled" : ""
                  }`}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    sidebarConfig.onSelect?.(item.key);
                  }}
                >
                  {item.label}
                </button>
              ))
            ) : (
              <span className="muted">Sem opcoes</span>
            )}
          </nav>
        </aside>

        <main className="main content">
          <Routes>
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          <Route
            path="/prospeccao"
            element={
              permissions.areas?.prospeccao ? (
                <Prospecao
                  permissions={getAreaPermissions(role, "prospeccao")}
                  activeKey={prospeccaoTab}
                  onSelect={setProspeccaoTab}
                />
              ) : (
                <AccessDenied
                  areaLabel={getAreaLabel("prospeccao")}
                  roleLabel={roleLabel}
                  onGoHome={() => navigate(defaultRoute)}
                />
              )
            }
          />
          <Route
            path="/renegociacao"
            element={
              permissions.areas?.renegociacao ? (
                <Renegociacao
                  permissions={getAreaPermissions(role, "renegociacao")}
                  activeKey={renegociacaoTab}
                />
              ) : (
                <AccessDenied
                  areaLabel={getAreaLabel("renegociacao")}
                  roleLabel={roleLabel}
                  onGoHome={() => navigate(defaultRoute)}
                />
              )
            }
          />
          <Route
            path="/avaliacao"
            element={
              permissions.areas?.avaliacao ? (
                <Avaliacao
                  permissions={getAreaPermissions(role, "avaliacao")}
                  activeKey={avaliacaoTab}
                  onSelect={setAvaliacaoTab}
                />
              ) : (
                <AccessDenied
                  areaLabel={getAreaLabel("avaliacao")}
                  roleLabel={roleLabel}
                  onGoHome={() => navigate(defaultRoute)}
                />
              )
            }
          />
          <Route
            path="/dbicre"
            element={
              permissions.areas?.dbicre ? (
                <DBICRE permissions={getAreaPermissions(role, "dbicre")} />
              ) : (
                <AccessDenied
                  areaLabel={getAreaLabel("dbicre")}
                  roleLabel={roleLabel}
                  onGoHome={() => navigate(defaultRoute)}
                />
              )
            }
          />
          <Route
            path="/financeiro"
            element={
              permissions.areas?.financeiro ? (
                <Financeiro
                  permissions={getAreaPermissions(role, "financeiro")}
                  activeKey={financeiroTab}
                  onSelect={setFinanceiroTab}
                />
              ) : (
                <AccessDenied
                  areaLabel={getAreaLabel("financeiro")}
                  roleLabel={roleLabel}
                  onGoHome={() => navigate(defaultRoute)}
                />
              )
            }
          />
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
          </Routes>
        </main>
      </div>
      <PermissionSwitcher role={role} onRoleChange={onRoleChange} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        onSave={(patch) => {
          onSaveUser?.(patch);
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}

export default function App() {
  const [authError, setAuthError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem(AUTH_STORAGE_KEYS.ok) === "1");
  const [authRole, setAuthRole] = useState(() => localStorage.getItem(AUTH_STORAGE_KEYS.role) || "");
  const [authUserId, setAuthUserId] = useState(() => localStorage.getItem(AUTH_STORAGE_KEYS.user) || "");

  const isMicrosoftEmail = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized.includes("@")) return false;
    const domain = normalized.split("@")[1];
    return ["hotmail.com", "outlook.com", "live.com", "msn.com"].includes(domain);
  };

  const registerMicrosoftUser = (email) => {
    const users = loadUsers();
    const nextUser = {
      id: `user-${Date.now()}`,
      personalEmail: email,
      companyEmail: "",
      username: "",
      password: "",
      role: DEFAULT_ROLE,
    };
    saveUsers([...users, nextUser]);
    return nextUser;
  };

  const handleLoginSubmit = (user, pass, mode = "password") => {
    const login = String(user || "").trim();
    if (!login) {
      setAuthError("Informe seu email.");
      return;
    }

    if (mode === "microsoft") {
      if (!isMicrosoftEmail(login)) {
        setAuthError("Use sua conta Microsoft (hotmail/outlook/live).");
        return;
      }
      let account = getUserById(login);
      if (account?.password) {
        setAuthError("Conta ja ativada. Entre com email corporativo e senha.");
        return;
      }
      if (!account) {
        account = registerMicrosoftUser(login);
      }
      localStorage.setItem(AUTH_STORAGE_KEYS.ok, "1");
      localStorage.setItem(AUTH_STORAGE_KEYS.role, account.role);
      localStorage.setItem(AUTH_STORAGE_KEYS.user, account.id || account.personalEmail || login);
      setAuthRole(account.role);
      setAuthUserId(account.id || account.personalEmail || login);
      setIsAuthenticated(true);
      setAuthError("");
      return;
    }

    if (login.includes("@")) {
      const candidate = getUserById(login);
      if (candidate && !candidate.password) {
        setAuthError("Primeiro acesso: use Conta Microsoft.");
        return;
      }
    }

    const account = findUserByCredentials(login, pass);
    if (!account) {
      setAuthError("Login ou senha invalidos.");
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEYS.ok, "1");
    localStorage.setItem(AUTH_STORAGE_KEYS.role, account.role);
    localStorage.setItem(AUTH_STORAGE_KEYS.user, account.id || account.username || account.personalEmail || login);
    setAuthRole(account.role);
    setAuthUserId(account.id || account.username || account.personalEmail || login);
    setIsAuthenticated(true);
    setAuthError("");
  };

  if (!isAuthenticated) {
    return (
      <Login
        onSubmit={handleLoginSubmit}
        error={authError}
        onSkip={() => {
          const adminUser = getFirstUserByRole("admin");
          localStorage.setItem(AUTH_STORAGE_KEYS.ok, "1");
          localStorage.setItem(AUTH_STORAGE_KEYS.role, "admin");
          localStorage.setItem(AUTH_STORAGE_KEYS.user, adminUser?.id || "admin");
          setAuthRole("admin");
          setAuthUserId(adminUser?.id || "admin");
          setIsAuthenticated(true);
          setAuthError("");
        }}
      />
    );
  }

  const handleRoleChange = (nextRole) => {
    localStorage.setItem(AUTH_STORAGE_KEYS.role, nextRole);
    setAuthRole(nextRole);
    if (authUserId) {
      updateStoredUser(authUserId, { role: nextRole });
    }
  };

  const currentUser = getUserById(authUserId);

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEYS.ok);
    localStorage.removeItem(AUTH_STORAGE_KEYS.role);
    localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    window.location.reload();
  };

  const handleSaveUser = (patch) => {
    if (!authUserId) return;
    updateStoredUser(authUserId, patch);
  };

  return (
    <MainApp
      role={authRole || currentUser?.role || "admin"}
      onRoleChange={handleRoleChange}
      user={currentUser}
      onLogout={handleLogout}
      onSaveUser={handleSaveUser}
    />
  );
}
