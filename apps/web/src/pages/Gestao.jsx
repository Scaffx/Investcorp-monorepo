import React, { useEffect, useMemo, useState } from "react";
import { Section, Placeholder } from "../ui";
import {
  loadUsers,
  saveUsers,
  updateStoredUser,
  deriveDisplayName,
  canManageTeam,
  isAdmin,
} from "../auth";

export const GESTAO_SECTIONS = [
  { key: "perfil", label: "Meu Perfil", title: "Meu Perfil" },
  { key: "equipe", label: "Equipe", title: "Equipe" },
  { key: "templates", label: "Templates", title: "Templates" },
  { key: "metas", label: "Metas", title: "Metas" },
  { key: "dashboard", label: "Dashboard", title: "Dashboard" },
];

const API_BASE = "";
const TEAM_SEEDS = [
  { name: "Prospeccao", managers: ["user-sabrina"] },
  { name: "Renegociacao", managers: ["user-sabrina"] },
  { name: "Financeiro", managers: ["user-luciana"] },
  { name: "RH", managers: ["user-luciana"] },
  { name: "Avaliacao", managers: ["user-jaqueline", "user-diego"] },
];
const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "A fazer" },
  { value: "doing", label: "Em andamento" },
  { value: "done", label: "Concluida" },
  { value: "blocked", label: "Bloqueada" },
];

const GOAL_PERIOD_OPTIONS = [
  { value: "daily", label: "Diario" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "custom", label: "Customizado" },
];

const toDateInputValue = (inputDate = new Date()) => {
  const offset = inputDate.getTimezoneOffset();
  const local = new Date(inputDate.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
};

const formatNumber = (value) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("pt-BR");
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `${num.toFixed(1)}%`;
};

export default function Gestao({ permissions, activeKey, onSelect, user, role }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedLeaderId, setSelectedLeaderId] = useState("");
  const [teamUsers, setTeamUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [profileDate, setProfileDate] = useState(() => toDateInputValue());
  const [teamDate, setTeamDate] = useState(() => toDateInputValue());
  const [plan, setPlan] = useState(null);
  const [planNotes, setPlanNotes] = useState("");
  const [teamPlan, setTeamPlan] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [teamGoals, setTeamGoals] = useState([]);
  const [userGoals, setUserGoals] = useState([]);
  const [dashboard, setDashboard] = useState(null);

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [userEdit, setUserEdit] = useState({ displayName: "", teamId: "", isManager: false });

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newItem, setNewItem] = useState({ title: "", description: "", target: "", unit: "", sort: 0 });
  const [itemDrafts, setItemDrafts] = useState({});

  const [goalForm, setGoalForm] = useState({
    scope: "user",
    name: "",
    target: "",
    current: "",
    unit: "",
    period: "monthly",
    start: toDateInputValue(),
    end: "",
  });

  const [taskDrafts, setTaskDrafts] = useState({});

  const actorId =
    user?.id ||
    user?.companyEmail ||
    user?.personalEmail ||
    user?.username ||
    "";
  const isManager = canManageTeam(user, role);
  const roleKey = String(role || "").toLowerCase();
  const isProspeccaoManager = roleKey === "gestor_prospeccao_renegociacao";
  const isFinanceiroRhManager = roleKey === "gestor_financeiro_rh";
  const isAvaliacaoManager = roleKey === "gestor_avaliacao";

  const [rhSummary, setRhSummary] = useState(null);

  const activeSection = useMemo(
    () =>
      GESTAO_SECTIONS.find((item) => item.key === activeKey) ||
      GESTAO_SECTIONS[0],
    [activeKey]
  );

  useEffect(() => {
    if (activeSection.key !== activeKey) {
      onSelect?.(activeSection.key);
    }
  }, [activeSection.key, activeKey, onSelect]);

  const apiJson = async (url, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      "X-Actor-Id": actorId,
      ...(options.headers || {}),
    };
    const res = await fetch(API_BASE + url, { ...options, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  const mergeProfilesToLocal = (items) => {
    if (!Array.isArray(items)) return;
    const local = loadUsers();
    const byExternal = new Map(items.map((p) => [p.external_id, p]));
    const next = local.map((u) => {
      const profile = byExternal.get(u.id);
      if (!profile) return u;
      return {
        ...u,
        displayName: profile.display_name || u.displayName || "",
        isManager: Boolean(profile.is_manager),
        teamId: profile.team ? String(profile.team) : "",
      };
    });
    saveUsers(next);
  };

  const syncUsers = async () => {
    const local = loadUsers();
    const payload = {
      users: local.map((u) => ({
        external_id: u.id || u.personalEmail || u.username,
        personal_email: u.personalEmail,
        company_email: u.companyEmail,
        username: u.username,
        role: u.role,
        is_manager: Boolean(u.isManager),
        team_id: u.teamId || null,
        display_name: deriveDisplayName(u),
      })),
    };
    const data = await apiJson("/api/gestao/users/sync/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    mergeProfilesToLocal(data);
  };

  const loadTeams = async () => {
    const data = await apiJson("/api/gestao/teams/");
    setTeams(Array.isArray(data) ? data : []);
    return Array.isArray(data) ? data : [];
  };

  const loadProfiles = async () => {
    const data = await apiJson("/api/gestao/users/");
    const list = Array.isArray(data) ? data : [];
    setProfiles(list);
    const current = list.find((item) => item.external_id === actorId) || null;
    setCurrentProfile(current);
    if (!selectedTeamId) {
      if (current?.team) {
        setSelectedTeamId(String(current.team));
      } else if (list.length && list[0].team) {
        setSelectedTeamId(String(list[0].team));
      }
    }
    return list;
  };

  const seedTeamsAndManagers = async (teamsData, profilesData) => {
    if (!isAdmin(role)) return false;
    let changed = false;
    const teamsMap = new Map(
      (teamsData || []).map((team) => [String(team.name || "").toLowerCase(), team])
    );
    const profilesMap = new Map(
      (profilesData || []).map((profile) => [profile.external_id, profile])
    );

    for (const seed of TEAM_SEEDS) {
      const key = String(seed.name || "").toLowerCase();
      let team = teamsMap.get(key);
      if (!team) {
        team = await apiJson("/api/gestao/teams/", {
          method: "POST",
          body: JSON.stringify({ name: seed.name, description: "" }),
        });
        teamsMap.set(key, team);
        changed = true;
      }

      const managerIds = seed.managers || [];
      if (managerIds.length) {
        const primary = profilesMap.get(managerIds[0]);
        if (primary && String(team.manager || "") !== String(primary.id)) {
          await apiJson(`/api/gestao/teams/${team.id}/`, {
            method: "PATCH",
            body: JSON.stringify({ manager: primary.id }),
          });
          team.manager = primary.id;
          changed = true;
        }
      }

      for (const managerExternalId of managerIds) {
        const profile = profilesMap.get(managerExternalId);
        if (!profile) continue;
        const needsUpdate =
          !profile.is_manager || String(profile.team || "") !== String(team.id);
        if (needsUpdate) {
          await apiJson(`/api/gestao/users/${profile.id}/`, {
            method: "PATCH",
            body: JSON.stringify({
              is_manager: true,
              team: team.id,
            }),
          });
          updateStoredUser(managerExternalId, {
            isManager: true,
            teamId: String(team.id),
          });
          changed = true;
        }
      }
    }

    return changed;
  };

  const loadTeamUsers = async (teamId) => {
    if (!teamId) {
      setTeamUsers([]);
      return;
    }
    const data = await apiJson(`/api/gestao/users/?team_id=${encodeURIComponent(teamId)}`);
    const list = Array.isArray(data) ? data : [];
    setTeamUsers(list);
    if (!selectedUserId && list.length) {
      setSelectedUserId(String(list[0].id));
    }
  };

  const loadTemplates = async (teamId) => {
    if (!teamId) {
      setTemplates([]);
      return;
    }
    const data = await apiJson(`/api/gestao/templates/?team_id=${encodeURIComponent(teamId)}`);
    setTemplates(Array.isArray(data) ? data : []);
  };

  const loadUserPlan = async (userId, dateValue, setter) => {
    if (!userId || !dateValue) {
      setter(null);
      return;
    }
    const data = await apiJson(
      `/api/gestao/daily-plans/?user_id=${encodeURIComponent(userId)}&date=${encodeURIComponent(dateValue)}`
    );
    setter(data?.plan || null);
  };

  const loadGoals = async (scope, params = {}) => {
    const query = new URLSearchParams({ scope, ...params });
    const data = await apiJson(`/api/gestao/goals/?${query.toString()}`);
    return Array.isArray(data) ? data : [];
  };

  const loadDashboard = async (teamId, dateValue) => {
    if (!teamId || !dateValue) {
      setDashboard(null);
      return;
    }
    const data = await apiJson(
      `/api/gestao/dashboard/?team_id=${encodeURIComponent(teamId)}&date=${encodeURIComponent(dateValue)}`
    );
    setDashboard(data || null);
  };

  const loadRhSummary = async () => {
    try {
      const [employees, vacancies] = await Promise.all([
        apiJson("/api/rh/colaboradores/"),
        apiJson("/api/rh/vagas/"),
      ]);
      const listEmployees = Array.isArray(employees) ? employees : [];
      const listVacancies = Array.isArray(vacancies) ? vacancies : [];
      const total = listEmployees.length;
      const ativos = listEmployees.filter((c) => c.status === "ativo").length;
      const ferias = listEmployees.filter((c) => c.status === "ferias").length;
      const afastados = listEmployees.filter((c) => c.status === "afastado").length;
      const vagasAbertas = listVacancies.filter((v) => v.status !== "fechada").length;
      const entrevistas = listVacancies.filter((v) => v.status === "entrevista").length;
      const finalistas = listVacancies.filter((v) => v.status === "final").length;
      setRhSummary({ total, ativos, ferias, afastados, vagasAbertas, entrevistas, finalistas });
    } catch {
      setRhSummary(null);
    }
  };
  useEffect(() => {
    let active = true;
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        await syncUsers();
        const teamsData = await loadTeams();
        const profilesData = await loadProfiles();
        const seeded = await seedTeamsAndManagers(teamsData, profilesData);
        if (seeded) {
          await loadTeams();
          await loadProfiles();
        }
      } catch (err) {
        if (active) setError(String(err.message || err));
      } finally {
        if (active) setLoading(false);
      }
    };
    if (actorId) {
      init();
    }
    return () => {
      active = false;
    };
  }, [actorId]);

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamUsers(selectedTeamId);
      loadTemplates(selectedTeamId);
      loadDashboard(selectedTeamId, teamDate);
      loadGoals("team", { team_id: selectedTeamId }).then(setTeamGoals);
    }
  }, [selectedTeamId, teamDate]);

  useEffect(() => {
    if (!actorId) return;
    if (!isFinanceiroRhManager && !isAdmin(role)) return;
    loadRhSummary();
  }, [actorId, role, isFinanceiroRhManager]);

  useEffect(() => {
    if (currentProfile?.id) {
      loadUserPlan(currentProfile.id, profileDate, setPlan);
      loadGoals("user", { user_id: currentProfile.id }).then(setUserGoals);
    }
  }, [currentProfile?.id, profileDate]);

  useEffect(() => {
    if (plan) {
      setPlanNotes(plan.notes || "");
    } else {
      setPlanNotes("");
    }
  }, [plan]);

  useEffect(() => {
    if (selectedUserId) {
      loadUserPlan(selectedUserId, teamDate, setTeamPlan);
    }
  }, [selectedUserId, teamDate]);

  useEffect(() => {
    if (!selectedUserId && teamUsers.length) {
      setSelectedUserId(String(teamUsers[0].id));
    }
  }, [teamUsers, selectedUserId]);

  useEffect(() => {
    if (selectedTemplateId || !templates.length) return;
    setSelectedTemplateId(String(templates[0].id));
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedUserId) return;
    const userRow = teamUsers.find((item) => String(item.id) === String(selectedUserId));
    if (!userRow) return;
    setUserEdit({
      displayName: userRow.display_name || "",
      teamId: userRow.team ? String(userRow.team) : "",
      isManager: Boolean(userRow.is_manager),
    });
  }, [selectedUserId, teamUsers]);

  const selectedTeam = teams.find((item) => String(item.id) === String(selectedTeamId)) || null;
  const selectedTemplate = templates.find((item) => String(item.id) === String(selectedTemplateId)) || null;
  const selectedUser = teamUsers.find((item) => String(item.id) === String(selectedUserId)) || null;
  const leaderOptions = useMemo(() => {
    const teamsMap = new Map(teams.map((team) => [String(team.id), team]));
    const leaders = profiles
      .filter((profile) => profile.is_manager && profile.team)
      .map((profile) => {
        const teamId = String(profile.team);
        const team = teamsMap.get(teamId);
        return {
          leaderId: String(profile.id),
          teamId,
          label: profile.display_name || profile.external_id || "Lider",
          teamName: team?.name || "",
        };
      });
    const usedTeams = new Set(leaders.map((item) => item.teamId));
    const fallbacks = teams
      .filter((team) => !usedTeams.has(String(team.id)))
      .map((team) => ({
        leaderId: `team-${team.id}`,
        teamId: String(team.id),
        label: team.name,
        teamName: team.name,
      }));
    return [...leaders, ...fallbacks];
  }, [profiles, teams]);

  const selectedLeader =
    leaderOptions.find((opt) => String(opt.leaderId) === String(selectedLeaderId)) ||
    leaderOptions.find((opt) => String(opt.teamId) === String(selectedTeamId)) ||
    null;
  const selectedTeamLabel = selectedLeader?.label || selectedTeam?.name || "Sem equipe";
  const formatLeaderOptionLabel = (option) => {
    if (!option) return "Sem equipe";
    if (option.teamName && option.teamName !== option.label) {
      return `${option.label} (${option.teamName})`;
    }
    return option.label;
  };

  const getTeamOptionLabel = (team) => {
    if (!team) return "Sem equipe";
    const leader = leaderOptions.find((opt) => String(opt.teamId) === String(team.id));
    return leader ? formatLeaderOptionLabel(leader) : team.name;
  };

  const handleLeaderSelect = (leaderId) => {
    setSelectedLeaderId(leaderId);
    const leader = leaderOptions.find((opt) => String(opt.leaderId) === String(leaderId));
    if (leader && String(selectedTeamId) !== String(leader.teamId)) {
      setSelectedTeamId(leader.teamId);
    }
  };

  useEffect(() => {
    if (!leaderOptions.length) return;
    if (selectedLeaderId) {
      const leader = leaderOptions.find((opt) => String(opt.leaderId) === String(selectedLeaderId));
      if (leader && String(selectedTeamId) !== String(leader.teamId)) {
        setSelectedTeamId(leader.teamId);
      }
      return;
    }
    const fallback =
      leaderOptions.find((opt) => String(opt.teamId) === String(selectedTeamId)) || leaderOptions[0];
    if (fallback) {
      setSelectedLeaderId(fallback.leaderId);
      if (!selectedTeamId || String(selectedTeamId) !== String(fallback.teamId)) {
        setSelectedTeamId(fallback.teamId);
      }
    }
  }, [leaderOptions, selectedLeaderId, selectedTeamId]);

  const prospeccaoStats = useMemo(() => {
    if (!isProspeccaoManager && !isAdmin(role)) return null;
    try {
      const raw = localStorage.getItem("cad-registros");
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return null;
      const total = list.length;
      const byStatus = list.reduce((acc, item) => {
        const key = String(item?.status || "Sem status");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const aguardando = list.filter((item) =>
        String(item?.status || "").toLowerCase().includes("aguardando")
      ).length;
      const concluido = list.filter((item) => item?.concluidoEm).length;
      return { total, concluido, aguardando, byStatus };
    } catch {
      return null;
    }
  }, [isProspeccaoManager, role]);

  const renegociacaoStats = useMemo(() => {
    if (!isProspeccaoManager && !isAdmin(role)) return null;
    try {
      const raw = localStorage.getItem("renegociacao-rules-v1");
      const data = raw ? JSON.parse(raw) : {};
      const totalRules = data && typeof data === "object" ? Object.keys(data).length : 0;
      return { totalRules };
    } catch {
      return { totalRules: 0 };
    }
  }, [isProspeccaoManager, role]);

  const avaliacaoStats = useMemo(() => {
    if (!isAvaliacaoManager && !isAdmin(role)) return null;
    try {
      const raw = localStorage.getItem("lastro-job-history-v2");
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return null;
      const total = list.length;
      const success = list.filter((item) => item.status === "done").length;
      const lastRun = list[0]?.created_at || null;
      return { total, success, lastRun };
    } catch {
      return null;
    }
  }, [isAvaliacaoManager, role]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    await apiJson("/api/gestao/teams/", {
      method: "POST",
      body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDescription }),
    });
    setNewTeamName("");
    setNewTeamDescription("");
    await loadTeams();
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    const payload = {
      display_name: userEdit.displayName,
    };
    if (isAdmin(role)) {
      payload.team = userEdit.teamId || null;
      payload.is_manager = Boolean(userEdit.isManager);
    }
    await apiJson(`/api/gestao/users/${selectedUser.id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (selectedUser.external_id) {
      updateStoredUser(selectedUser.external_id, {
        displayName: userEdit.displayName,
        isManager: Boolean(userEdit.isManager),
        teamId: userEdit.teamId || "",
      });
    }
    await loadProfiles();
    await loadTeamUsers(selectedTeamId);
  };

  const handleCreateTemplate = async () => {
    if (!selectedTeamId || !newTemplateName.trim()) return;
    await apiJson("/api/gestao/templates/", {
      method: "POST",
      body: JSON.stringify({ team: Number(selectedTeamId), name: newTemplateName.trim(), is_active: true }),
    });
    setNewTemplateName("");
    await loadTemplates(selectedTeamId);
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!templateId) return;
    await apiJson(`/api/gestao/templates/${templateId}/`, { method: "DELETE" });
    if (String(selectedTemplateId) === String(templateId)) {
      setSelectedTemplateId("");
    }
    await loadTemplates(selectedTeamId);
  };

  const handleCreateItem = async () => {
    if (!selectedTemplate) return;
    if (!newItem.title.trim()) return;
    await apiJson(`/api/gestao/templates/${selectedTemplate.id}/items/`, {
      method: "POST",
      body: JSON.stringify({
        title: newItem.title.trim(),
        description: newItem.description,
        target_value: newItem.target || 0,
        unit: newItem.unit,
        sort_order: Number(newItem.sort || 0),
      }),
    });
    setNewItem({ title: "", description: "", target: "", unit: "", sort: 0 });
    await loadTemplates(selectedTeamId);
  };

  const handleSaveItem = async (item) => {
    const draft = { ...item, ...(itemDrafts[item.id] || {}) };
    await apiJson(`/api/gestao/templates/items/${item.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        title: draft.title,
        description: draft.description,
        target_value: draft.target_value,
        unit: draft.unit,
        sort_order: draft.sort_order,
      }),
    });
    await loadTemplates(selectedTeamId);
  };

  const handleDeleteItem = async (itemId) => {
    await apiJson(`/api/gestao/templates/items/${itemId}/`, { method: "DELETE" });
    await loadTemplates(selectedTeamId);
  };

  const handleApplyTemplate = async (target) => {
    if (!selectedTemplate) return;
    if (target === "team" && !selectedTeamId) {
      setError("Selecione uma equipe para aplicar o template.");
      return;
    }
    if (target === "user" && !selectedUserId) {
      setError("Selecione um usuario para aplicar o template.");
      return;
    }
    const payload = { date: teamDate, overwrite: false };
    if (target === "team" && selectedTeamId) {
      payload.team_id = Number(selectedTeamId);
    }
    if (target === "user" && selectedUserId) {
      payload.user_ids = [Number(selectedUserId)];
    }
    await apiJson(`/api/gestao/templates/${selectedTemplate.id}/apply/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadUserPlan(selectedUserId, teamDate, setTeamPlan);
    await loadUserPlan(currentProfile?.id, profileDate, setPlan);
    await loadDashboard(selectedTeamId, teamDate);
  };

  const handleSavePlanNotes = async () => {
    if (!plan) return;
    await apiJson(`/api/gestao/daily-plans/${plan.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ notes: planNotes, status: plan.status }),
    });
    await loadUserPlan(currentProfile?.id, profileDate, setPlan);
  };

  const handleUpdateTask = async (taskId) => {
    const draft = taskDrafts[taskId];
    if (!draft) return;
    await apiJson(`/api/gestao/daily-tasks/${taskId}/`, {
      method: "PATCH",
      body: JSON.stringify({
        status: draft.status,
        actual_value: draft.actual_value,
      }),
    });
    await loadUserPlan(currentProfile?.id, profileDate, setPlan);
    if (selectedUserId) {
      await loadUserPlan(selectedUserId, teamDate, setTeamPlan);
    }
    await loadDashboard(selectedTeamId, teamDate);
  };

  const handleCreateGoal = async () => {
    if (goalForm.scope === "team" && !selectedTeamId) {
      setError("Selecione uma equipe para criar a meta.");
      return;
    }
    if (goalForm.scope === "user" && !currentProfile?.id) {
      setError("Usuario nao identificado para criar a meta.");
      return;
    }
    const payload = {
      scope: goalForm.scope,
      name: goalForm.name,
      target_value: goalForm.target || 0,
      current_value: goalForm.current || 0,
      unit: goalForm.unit,
      period: goalForm.period,
      start_date: goalForm.start || toDateInputValue(),
      end_date: goalForm.end || null,
    };
    if (goalForm.scope === "team") {
      payload.team = selectedTeamId ? Number(selectedTeamId) : null;
    } else {
      payload.user = currentProfile?.id || null;
    }
    await apiJson("/api/gestao/goals/", { method: "POST", body: JSON.stringify(payload) });
    setGoalForm((prev) => ({ ...prev, name: "", target: "", current: "", unit: "" }));
    if (payload.scope === "team") {
      const items = await loadGoals("team", { team_id: selectedTeamId });
      setTeamGoals(items);
    } else {
      const items = await loadGoals("user", { user_id: currentProfile?.id });
      setUserGoals(items);
    }
  };

  const handleUpdateGoal = async (goalId, currentValue) => {
    await apiJson(`/api/gestao/goals/${goalId}/`, {
      method: "PATCH",
      body: JSON.stringify({ current_value: currentValue }),
    });
    if (selectedTeamId) {
      const items = await loadGoals("team", { team_id: selectedTeamId });
      setTeamGoals(items);
    }
    if (currentProfile?.id) {
      const items = await loadGoals("user", { user_id: currentProfile.id });
      setUserGoals(items);
    }
    await loadDashboard(selectedTeamId, teamDate);
  };

  const goalHighlights = useMemo(() => {
    if (!Array.isArray(teamGoals) || !teamGoals.length) return [];
    return teamGoals.slice(0, 3).map((goal) => {
      const target = Number(goal.target_value) || 0;
      const current = Number(goal.current_value) || 0;
      const pct = target ? (current / target) * 100 : 0;
      return { ...goal, _pct: pct };
    });
  }, [teamGoals]);

  const renderGoalHighlights = (title) => (
    <div className="gestao-card">
      <h3>{title}</h3>
      {goalHighlights.length ? (
        <div className="gestao-goals-grid">
          {goalHighlights.map((goal) => (
            <div key={goal.id} className="gestao-goal-card">
              <strong>{goal.name}</strong>
              <span>{`Meta: ${formatNumber(goal.target_value)} ${goal.unit || ""}`}</span>
              <span>{`Atual: ${formatNumber(goal.current_value)} ${goal.unit || ""}`}</span>
              <span>{`Progresso: ${formatPercent(goal._pct)}`}</span>
            </div>
          ))}
        </div>
      ) : (
        <Placeholder>Sem metas definidas.</Placeholder>
      )}
    </div>
  );

  const renderManagerDashboard = () => {
    if (isProspeccaoManager) {
      const topStatuses = Object.entries(prospeccaoStats?.byStatus || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);
      const total = prospeccaoStats?.total ?? 0;
      const concluido = prospeccaoStats?.concluido ?? 0;
      const concluidoPct = total ? (concluido / total) * 100 : 0;
      return (
        <>
          <div className="gestao-card">
            <h3>Prospeccao e Renegociacao</h3>
            <div className="area-stats">
              <div>
                <strong>Cadastros</strong>
                <span>{prospeccaoStats?.total ?? 0}</span>
              </div>
              <div>
                <strong>Concluidos</strong>
                <span>{prospeccaoStats?.concluido ?? 0}</span>
              </div>
              <div>
                <strong>Aguardando</strong>
                <span>{prospeccaoStats?.aguardando ?? 0}</span>
              </div>
              <div>
                <strong>Taxa conclusao</strong>
                <span>{formatPercent(concluidoPct)}</span>
              </div>
              <div>
                <strong>Regras salvas</strong>
                <span>{renegociacaoStats?.totalRules ?? 0}</span>
              </div>
              <div>
                <strong>Status principal</strong>
                <span>{topStatuses[0] ? `${topStatuses[0][0]} (${topStatuses[0][1]})` : "-"}</span>
              </div>
            </div>
            {topStatuses.length ? (
              <div className="gestao-summary">
                {topStatuses.map(([label, value]) => (
                  <div key={label}>
                    <strong>{label}:</strong> {value}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {renderGoalHighlights("Metas da area")}
        </>
      );
    }

    if (isFinanceiroRhManager) {
      return (
        <>
          <div className="gestao-card">
            <h3>Financeiro e RH</h3>
            {rhSummary ? (
              <div className="area-stats">
                <div>
                  <strong>Colaboradores</strong>
                  <span>{rhSummary.total}</span>
                </div>
                <div>
                  <strong>Ativos</strong>
                  <span>{rhSummary.ativos}</span>
                </div>
                <div>
                  <strong>Ferias</strong>
                  <span>{rhSummary.ferias}</span>
                </div>
                <div>
                  <strong>Afastados</strong>
                  <span>{rhSummary.afastados}</span>
                </div>
                <div>
                  <strong>Vagas abertas</strong>
                  <span>{rhSummary.vagasAbertas}</span>
                </div>
                <div>
                  <strong>Entrevistas</strong>
                  <span>{rhSummary.entrevistas}</span>
                </div>
                <div>
                  <strong>Finalistas</strong>
                  <span>{rhSummary.finalistas}</span>
                </div>
              </div>
            ) : (
              <Placeholder>Sem dados de RH.</Placeholder>
            )}
          </div>
          {renderGoalHighlights("Metas da area")}
        </>
      );
    }

    if (isAvaliacaoManager) {
      const total = avaliacaoStats?.total ?? 0;
      const success = avaliacaoStats?.success ?? 0;
      const successPct = total ? (success / total) * 100 : 0;
      return (
        <>
          <div className="gestao-card">
            <h3>Avaliacao</h3>
            {avaliacaoStats ? (
              <div className="area-stats">
                <div>
                  <strong>Coletas</strong>
                  <span>{avaliacaoStats.total}</span>
                </div>
                <div>
                  <strong>Sucesso</strong>
                  <span>{avaliacaoStats.success}</span>
                </div>
                <div>
                  <strong>Taxa sucesso</strong>
                  <span>{formatPercent(successPct)}</span>
                </div>
                <div>
                  <strong>Ultima execucao</strong>
                  <span>{formatDateTime(avaliacaoStats.lastRun)}</span>
                </div>
              </div>
            ) : (
              <Placeholder>Sem historico de avaliacao.</Placeholder>
            )}
          </div>
          {renderGoalHighlights("Metas da area")}
        </>
      );
    }

    if (isAdmin(role)) {
      return (
        <>
          <div className="gestao-card">
            <h3>Visao executiva</h3>
            <div className="area-stats">
              <div>
                <strong>Prospeccao</strong>
                <span>{prospeccaoStats?.total ?? 0}</span>
              </div>
              <div>
                <strong>Regras</strong>
                <span>{renegociacaoStats?.totalRules ?? 0}</span>
              </div>
              <div>
                <strong>RH</strong>
                <span>{rhSummary?.total ?? 0}</span>
              </div>
              <div>
                <strong>Avaliacao</strong>
                <span>{avaliacaoStats?.total ?? 0}</span>
              </div>
            </div>
          </div>
          {renderGoalHighlights("Metas da area")}
        </>
      );
    }

    return null;
  };

  const renderTasks = (list, editable) => {
    if (!list || !list.length) return <Placeholder>Nenhuma tarefa registrada.</Placeholder>;
    return (
      <div className="gestao-table">
        <div className="gestao-row gestao-row-head">
          <span>Tarefa</span>
          <span>Meta</span>
          <span>Atual</span>
          <span>Status</span>
          <span>Acoes</span>
        </div>
        {list.map((task) => {
          const draft = taskDrafts[task.id] || {
            actual_value: task.actual_value,
            status: task.status,
          };
          return (
            <div key={task.id} className="gestao-row">
              <span className="gestao-task-name">{task.title}</span>
              <span>{`${formatNumber(task.target_value)} ${task.unit || ""}`}</span>
              <span>
                <input
                  className="float-input compact"
                  type="number"
                  disabled={!editable}
                  value={draft.actual_value}
                  onChange={(e) =>
                    setTaskDrafts((prev) => ({
                      ...prev,
                      [task.id]: { ...draft, actual_value: e.target.value },
                    }))
                  }
                />
              </span>
              <span>
                <select
                  className="float-input compact"
                  disabled={!editable}
                  value={draft.status}
                  onChange={(e) =>
                    setTaskDrafts((prev) => ({
                      ...prev,
                      [task.id]: { ...draft, status: e.target.value },
                    }))
                  }
                >
                  {TASK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </span>
              <span>
                <button
                  type="button"
                  className="table-btn"
                  disabled={!editable}
                  onClick={() => handleUpdateTask(task.id)}
                >
                  Salvar
                </button>
              </span>
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <div className="gestao-page">
      {loading ? <div className="gestao-loading">Carregando gestao...</div> : null}
      {error ? <div className="gestao-error">{error}</div> : null}

      {activeSection.key === "perfil" ? (
        <Section title="Meu perfil" wide>
          <div className="gestao-grid">
            <div className="gestao-card">
              <h3>Resumo</h3>
              <div className="gestao-summary">
                <div><strong>Usuario:</strong> {currentProfile?.display_name || "-"}</div>
                <div><strong>Cargo:</strong> {currentProfile?.role || "-"}</div>
                <div><strong>Equipe:</strong> {selectedTeamLabel}</div>
              </div>
            </div>
            <div className="gestao-card">
              <h3>Dia</h3>
              <div className="gestao-field">
                <label>Data</label>
                <input
                  type="date"
                  className="float-input"
                  value={profileDate}
                  onChange={(e) => setProfileDate(e.target.value)}
                />
              </div>
              <p className="muted">Atualize o dia para ver as tarefas.</p>
            </div>
          </div>

          <div className="gestao-card">
            <h3>Tarefas do dia</h3>
            {plan ? (
              <>
                {renderTasks(plan.tasks || [], true)}
                <div className="gestao-notes">
                  <label>Observacoes</label>
                  <textarea
                    className="float-input"
                    rows="3"
                    value={planNotes}
                    placeholder="Notas do dia"
                    onChange={(e) => setPlanNotes(e.target.value)}
                  />
                  <button type="button" className="table-btn" onClick={handleSavePlanNotes}>
                    Salvar notas
                  </button>
                </div>
              </>
            ) : (
              <Placeholder>Sem plano para esta data.</Placeholder>
            )}
          </div>

          <div className="gestao-card">
            <h3>Metas pessoais</h3>
            {userGoals.length ? (
              <div className="gestao-goals-grid">
                {userGoals.map((goal) => (
                  <div key={goal.id} className="gestao-goal-card">
                    <strong>{goal.name}</strong>
                    <span>{`Meta: ${formatNumber(goal.target_value)} ${goal.unit || ""}`}</span>
                    <div className="gestao-goal-update">
                      <input
                        className="float-input compact"
                        type="number"
                        value={goal.current_value}
                        onChange={(e) => handleUpdateGoal(goal.id, e.target.value)}
                      />
                      <span>{goal.unit || ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Placeholder>Nenhuma meta pessoal criada.</Placeholder>
            )}
          </div>
        </Section>
      ) : null}

      {activeSection.key === "equipe" ? (
        <Section title="Equipe" wide>
          {!isManager && !isAdmin(role) ? (
            <Placeholder>Sem permissao para ver a equipe.</Placeholder>
          ) : (
            <>
              <div className="gestao-grid">
                <div className="gestao-card">
                  <h3>Equipe</h3>
                  <div className="gestao-field">
                    <label>Selecionar lider</label>
                    <select
                      className="float-input"
                      value={selectedLeaderId}
                      onChange={(e) => handleLeaderSelect(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {leaderOptions.map((option) => (
                        <option key={option.leaderId} value={option.leaderId}>
                          {formatLeaderOptionLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isAdmin(role) ? (
                    <div className="gestao-form">
                      <label>Nova equipe</label>
                      <input
                        className="float-input"
                        placeholder="Nome da equipe"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                      />
                      <textarea
                        className="float-input"
                        rows="2"
                        placeholder="Descricao"
                        value={newTeamDescription}
                        onChange={(e) => setNewTeamDescription(e.target.value)}
                      />
                      <button type="button" className="table-btn" onClick={handleCreateTeam}>
                        Criar equipe
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="gestao-card">
                  <h3>Membros</h3>
                  <div className="gestao-list">
                    {teamUsers.length ? (
                      teamUsers.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className={`gestao-list-item ${
                            String(member.id) === String(selectedUserId) ? "active" : ""
                          }`}
                          onClick={() => setSelectedUserId(String(member.id))}
                        >
                          <span>{member.display_name || member.external_id}</span>
                          <span className="gestao-pill">{member.role || "sem cargo"}</span>
                        </button>
                      ))
                    ) : (
                      <Placeholder>Sem membros cadastrados.</Placeholder>
                    )}
                  </div>
                </div>
              </div>

              {selectedUser ? (
                <div className="gestao-card">
                  <h3>Detalhes do usuario</h3>
                  <div className="gestao-grid">
                    <div className="gestao-field">
                      <label>Nome</label>
                      <input
                        className="float-input"
                        value={userEdit.displayName}
                        onChange={(e) => setUserEdit((prev) => ({ ...prev, displayName: e.target.value }))}
                      />
                    </div>
                    <div className="gestao-field">
                      <label>Equipe</label>
                      <select
                        className="float-input"
                        disabled={!isAdmin(role)}
                        value={userEdit.teamId}
                        onChange={(e) => setUserEdit((prev) => ({ ...prev, teamId: e.target.value }))}
                      >
                        <option value="">Sem equipe</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {getTeamOptionLabel(team)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="gestao-field">
                      <label>Gestor</label>
                      <select
                        className="float-input"
                        disabled={!isAdmin(role)}
                        value={userEdit.isManager ? "yes" : "no"}
                        onChange={(e) =>
                          setUserEdit((prev) => ({ ...prev, isManager: e.target.value === "yes" }))
                        }
                      >
                        <option value="no">Nao</option>
                        <option value="yes">Sim</option>
                      </select>
                    </div>
                  </div>
                  <button type="button" className="table-btn" onClick={handleSaveUser}>
                    Salvar usuario
                  </button>
                </div>
              ) : null}

              <div className="gestao-card">
                <h3>Plano diario do membro</h3>
                <div className="gestao-field">
                  <label>Data</label>
                  <input
                    type="date"
                    className="float-input"
                    value={teamDate}
                    onChange={(e) => setTeamDate(e.target.value)}
                  />
                </div>
                {teamPlan ? renderTasks(teamPlan.tasks || [], true) : <Placeholder>Sem plano.</Placeholder>}
              </div>
            </>
          )}
        </Section>
      ) : null}

      {activeSection.key === "templates" ? (
        <Section title="Templates" wide>
          {!isManager && !isAdmin(role) ? (
            <Placeholder>Sem permissao para gerenciar templates.</Placeholder>
          ) : (
            <>
              <div className="gestao-grid">
                <div className="gestao-card">
                  <h3>Templates da equipe</h3>
                  <div className="gestao-field">
                    <label>Selecionar template</label>
                    <select
                      className="float-input"
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {templates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="gestao-form">
                    <label>Novo template</label>
                    <input
                      className="float-input"
                      placeholder="Nome do template"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                    />
                    <button type="button" className="table-btn" onClick={handleCreateTemplate}>
                      Criar template
                    </button>
                  </div>
                  {selectedTemplate ? (
                    <button
                      type="button"
                      className="table-btn danger"
                      onClick={() => handleDeleteTemplate(selectedTemplate.id)}
                    >
                      Excluir template
                    </button>
                  ) : null}
                </div>

                <div className="gestao-card">
                  <h3>Aplicar template</h3>
                  <div className="gestao-field">
                    <label>Data</label>
                    <input
                      type="date"
                      className="float-input"
                      value={teamDate}
                      onChange={(e) => setTeamDate(e.target.value)}
                    />
                  </div>
                  <div className="gestao-actions">
                    <button type="button" className="table-btn" onClick={() => handleApplyTemplate("team")}>
                      Aplicar na equipe
                    </button>
                    <button type="button" className="table-btn" onClick={() => handleApplyTemplate("user")}>
                      Aplicar no usuario
                    </button>
                  </div>
                </div>
              </div>

              <div className="gestao-card">
                <h3>Itens do template</h3>
                {selectedTemplate ? (
                  <>
                    {selectedTemplate.items?.length ? (
                      <div className="gestao-table">
                        <div className="gestao-row gestao-row-head">
                          <span>Tarefa</span>
                          <span>Meta</span>
                          <span>Unidade</span>
                          <span>Ordem</span>
                          <span>Acoes</span>
                        </div>
                        {selectedTemplate.items.map((item) => {
                          const draft = { ...item, ...(itemDrafts[item.id] || {}) };
                          return (
                            <div key={item.id} className="gestao-row">
                              <span>
                                <input
                                  className="float-input compact"
                                  value={draft.title}
                                  onChange={(e) =>
                                    setItemDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: { ...draft, title: e.target.value },
                                    }))
                                  }
                                />
                              </span>
                              <span>
                                <input
                                  className="float-input compact"
                                  type="number"
                                  value={draft.target_value}
                                  onChange={(e) =>
                                    setItemDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: { ...draft, target_value: e.target.value },
                                    }))
                                  }
                                />
                              </span>
                              <span>
                                <input
                                  className="float-input compact"
                                  value={draft.unit}
                                  onChange={(e) =>
                                    setItemDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: { ...draft, unit: e.target.value },
                                    }))
                                  }
                                />
                              </span>
                              <span>
                                <input
                                  className="float-input compact"
                                  type="number"
                                  value={draft.sort_order}
                                  onChange={(e) =>
                                    setItemDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: { ...draft, sort_order: e.target.value },
                                    }))
                                  }
                                />
                              </span>
                              <span className="gestao-inline-actions">
                                <button type="button" className="table-btn" onClick={() => handleSaveItem(item)}>
                                  Salvar
                                </button>
                                <button type="button" className="table-btn danger" onClick={() => handleDeleteItem(item.id)}>
                                  Excluir
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <Placeholder>Nenhum item cadastrado.</Placeholder>
                    )}
                    <div className="gestao-form-row">
                      <input
                        className="float-input"
                        placeholder="Nova tarefa"
                        value={newItem.title}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, title: e.target.value }))}
                      />
                      <input
                        className="float-input"
                        type="number"
                        placeholder="Meta"
                        value={newItem.target}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, target: e.target.value }))}
                      />
                      <input
                        className="float-input"
                        placeholder="Unidade"
                        value={newItem.unit}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, unit: e.target.value }))}
                      />
                      <input
                        className="float-input"
                        type="number"
                        placeholder="Ordem"
                        value={newItem.sort}
                        onChange={(e) => setNewItem((prev) => ({ ...prev, sort: e.target.value }))}
                      />
                      <button type="button" className="table-btn" onClick={handleCreateItem}>
                        Adicionar
                      </button>
                    </div>
                  </>
                ) : (
                  <Placeholder>Selecione um template.</Placeholder>
                )}
              </div>
            </>
          )}
        </Section>
      ) : null}

      {activeSection.key === "metas" ? (
        <Section title="Metas" wide>
          <div className="gestao-grid">
            <div className="gestao-card">
              <h3>Criar meta</h3>
              <div className="gestao-field">
                <label>Escopo</label>
                <select
                  className="float-input"
                  value={goalForm.scope}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, scope: e.target.value }))}
                >
                  <option value="user">Usuario</option>
                  <option value="team">Equipe</option>
                </select>
              </div>
              <input
                className="float-input"
                placeholder="Nome da meta"
                value={goalForm.name}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <div className="gestao-form-row">
                <input
                  className="float-input"
                  type="number"
                  placeholder="Meta"
                  value={goalForm.target}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, target: e.target.value }))}
                />
                <input
                  className="float-input"
                  type="number"
                  placeholder="Atual"
                  value={goalForm.current}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, current: e.target.value }))}
                />
                <input
                  className="float-input"
                  placeholder="Unidade"
                  value={goalForm.unit}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, unit: e.target.value }))}
                />
              </div>
              <div className="gestao-form-row">
                <select
                  className="float-input"
                  value={goalForm.period}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, period: e.target.value }))}
                >
                  {GOAL_PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  className="float-input"
                  type="date"
                  value={goalForm.start}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, start: e.target.value }))}
                />
                <input
                  className="float-input"
                  type="date"
                  value={goalForm.end}
                  onChange={(e) => setGoalForm((prev) => ({ ...prev, end: e.target.value }))}
                />
              </div>
              <button type="button" className="table-btn" onClick={handleCreateGoal}>
                Criar meta
              </button>
            </div>

            <div className="gestao-card">
              <h3>Metas da equipe</h3>
              {teamGoals.length ? (
                <div className="gestao-goals-grid">
                  {teamGoals.map((goal) => (
                    <div key={goal.id} className="gestao-goal-card">
                      <strong>{goal.name}</strong>
                      <span>{`Meta: ${formatNumber(goal.target_value)} ${goal.unit || ""}`}</span>
                      <div className="gestao-goal-update">
                        <input
                          className="float-input compact"
                          type="number"
                          value={goal.current_value}
                          onChange={(e) => handleUpdateGoal(goal.id, e.target.value)}
                        />
                        <span>{goal.unit || ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Placeholder>Nenhuma meta da equipe.</Placeholder>
              )}
            </div>
          </div>
        </Section>
      ) : null}

      {activeSection.key === "dashboard" ? (
        <Section title="Dashboard" wide>
          <div className="gestao-grid">
            <div className="gestao-card">
              <h3>Equipe</h3>
              <div className="gestao-field">
                <label>Lider da equipe</label>
                <select
                  className="float-input"
                  value={selectedLeaderId}
                  onChange={(e) => handleLeaderSelect(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {leaderOptions.map((option) => (
                    <option key={option.leaderId} value={option.leaderId}>
                      {formatLeaderOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="gestao-field">
                <label>Data</label>
                <input
                  type="date"
                  className="float-input"
                  value={teamDate}
                  onChange={(e) => setTeamDate(e.target.value)}
                />
              </div>
            </div>

            <div className="gestao-card">
              <h3>Resumo</h3>
              {dashboard ? (
                <div className="gestao-summary">
                  <div><strong>Tarefas:</strong> {dashboard.team_totals?.tasks_done || 0} / {dashboard.team_totals?.tasks_total || 0}</div>
                  <div><strong>Conclusao:</strong> {formatPercent(dashboard.team_totals?.tasks_pct || 0)}</div>
                  <div><strong>Meta:</strong> {formatPercent(dashboard.team_totals?.target_pct || 0)}</div>
                </div>
              ) : (
                <Placeholder>Sem dados para o periodo.</Placeholder>
              )}
            </div>

            {renderManagerDashboard()}
          </div>

          {dashboard?.users?.length ? (
            <div className="gestao-table">
              <div className="gestao-row gestao-row-head">
                <span>Usuario</span>
                <span>Tarefas</span>
                <span>Conclusao</span>
                <span>Meta</span>
              </div>
              {dashboard.users.map((row) => (
                <div key={row.user_id} className="gestao-row">
                  <span>{row.display_name || row.external_id}</span>
                  <span>{`${row.tasks_done}/${row.tasks_total}`}</span>
                  <span>{formatPercent(row.tasks_pct)}</span>
                  <span>{formatPercent(row.target_pct)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Placeholder>Nenhum dado de usuarios.</Placeholder>
          )}

          <div className="gestao-card">
            <h3>Metas da equipe</h3>
            {dashboard?.goals?.length ? (
              <div className="gestao-goals-grid">
                {dashboard.goals.map((goal) => (
                  <div key={goal.id} className="gestao-goal-card">
                    <strong>{goal.name}</strong>
                    <span>{`Meta: ${formatNumber(goal.target_value)} ${goal.unit || ""}`}</span>
                    <span>{`Atual: ${formatNumber(goal.current_value)} ${goal.unit || ""}`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Placeholder>Sem metas cadastradas.</Placeholder>
            )}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
