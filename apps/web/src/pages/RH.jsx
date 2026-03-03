import React, { useEffect, useMemo, useState } from "react";
import { Section, Placeholder } from "../ui";
import { deriveDisplayName } from "../auth";
import "../styles/global.css";

export const RH_SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "colaboradores", label: "Colaboradores" },
  { key: "recrutamento", label: "Recrutamento" },
  { key: "relatorios", label: "Relatorios" },
];

const API_BASE = "";
const STATUS_COLAB = ["ativo", "ferias", "afastado"];
const STATUS_VAGA = ["aberta", "triagem", "entrevista", "final", "fechada"];

export default function RH({ permissions, activeKey, onSelect, user, role }) {
  const canEdit = !!permissions?.editar;
  const resolvedKey = RH_SECTIONS.some((item) => item.key === activeKey)
    ? activeKey
    : RH_SECTIONS[0].key;

  const [employees, setEmployees] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [colabForm, setColabForm] = useState({
    name: "",
    role_title: "",
    area: "",
    manager_name: "",
    status: "ativo",
    start_date: "",
  });
  const [vagaForm, setVagaForm] = useState({
    title: "",
    area: "",
    candidates_count: "",
    status: "aberta",
  });

  const actorId =
    user?.id ||
    user?.companyEmail ||
    user?.personalEmail ||
    user?.username ||
    "";

  useEffect(() => {
    if (activeKey !== resolvedKey) {
      onSelect?.(resolvedKey);
    }
  }, [activeKey, resolvedKey, onSelect]);

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

  const downloadFile = async (url, filename) => {
    const res = await fetch(API_BASE + url, {
      headers: {
        "X-Actor-Id": actorId,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(link.href);
  };

  const syncActor = async () => {
    if (!actorId) return;
    const payload = {
      users: [
        {
          external_id: actorId,
          personal_email: user?.personalEmail || "",
          company_email: user?.companyEmail || "",
          username: user?.username || "",
          role: role || user?.role || "",
          is_manager: Boolean(user?.isManager),
          team_id: user?.teamId || null,
          display_name: deriveDisplayName(user),
        },
      ],
    };
    await apiJson("/api/gestao/users/sync/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };

  const loadEmployees = async () => {
    const data = await apiJson("/api/rh/colaboradores/");
    setEmployees(Array.isArray(data) ? data : []);
  };

  const loadVacancies = async () => {
    const data = await apiJson("/api/rh/vagas/");
    setVacancies(Array.isArray(data) ? data : []);
  };

  const loadIndicators = async () => {
    const data = await apiJson("/api/rh/indicators/");
    setIndicators(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!actorId) return;
      setLoading(true);
      setError("");
      try {
        await syncActor();
        await Promise.all([loadEmployees(), loadVacancies(), loadIndicators()]);
      } catch (err) {
        if (active) setError(String(err.message || err));
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [actorId, role]);

  const metrics = useMemo(() => {
    const total = employees.length;
    const ativos = employees.filter((c) => c.status === "ativo").length;
    const afastados = employees.filter((c) => c.status === "afastado").length;
    const ferias = employees.filter((c) => c.status === "ferias").length;
    const vagasAbertas = vacancies.filter((v) => v.status !== "fechada").length;
    return { total, ativos, afastados, ferias, vagasAbertas };
  }, [employees, vacancies]);

  const handleAddColab = async () => {
    if (!canEdit) return;
    if (!colabForm.name.trim()) return;
    const created = await apiJson("/api/rh/colaboradores/", {
      method: "POST",
      body: JSON.stringify({
        name: colabForm.name.trim(),
        role_title: colabForm.role_title.trim(),
        area: colabForm.area.trim(),
        manager_name: colabForm.manager_name.trim(),
        status: colabForm.status,
        start_date: colabForm.start_date || null,
      }),
    });
    setEmployees((prev) => [created, ...prev]);
    setColabForm({
      name: "",
      role_title: "",
      area: "",
      manager_name: "",
      status: "ativo",
      start_date: "",
    });
    await loadIndicators();
  };

  const handleUpdateColab = async (id, patch) => {
    if (!canEdit) return;
    const updated = await apiJson(`/api/rh/colaboradores/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setEmployees((prev) => prev.map((c) => (c.id === id ? updated : c)));
    await loadIndicators();
  };

  const handleAddVaga = async () => {
    if (!canEdit) return;
    if (!vagaForm.title.trim()) return;
    const created = await apiJson("/api/rh/vagas/", {
      method: "POST",
      body: JSON.stringify({
        title: vagaForm.title.trim(),
        area: vagaForm.area.trim(),
        candidates_count: vagaForm.candidates_count || 0,
        status: vagaForm.status,
      }),
    });
    setVacancies((prev) => [created, ...prev]);
    setVagaForm({ title: "", area: "", candidates_count: "", status: "aberta" });
  };

  const handleUpdateVaga = async (id, patch) => {
    if (!canEdit) return;
    const updated = await apiJson(`/api/rh/vagas/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setVacancies((prev) => prev.map((v) => (v.id === id ? updated : v)));
  };

  const handleExport = async (format) => {
    try {
      const filename = format === "pdf" ? "rh.pdf" : "rh.xlsx";
      await downloadFile(`/api/rh/report.${format}`, filename);
    } catch (err) {
      setError(String(err.message || err));
    }
  };

  return (
    <div className="area-page">
      {error ? <div className="gestao-error">{error}</div> : null}
      {loading ? <div className="gestao-loading">Carregando dados...</div> : null}

      {resolvedKey === "dashboard" ? (
        <Section title="RH" wide>
          <div className="area-grid">
            <div className="area-card">
              <h3>Visao geral</h3>
              <div className="area-stats">
                <div>
                  <strong>Total</strong>
                  <span>{metrics.total}</span>
                </div>
                <div>
                  <strong>Ativos</strong>
                  <span>{metrics.ativos}</span>
                </div>
                <div>
                  <strong>Ferias</strong>
                  <span>{metrics.ferias}</span>
                </div>
                <div>
                  <strong>Afastados</strong>
                  <span>{metrics.afastados}</span>
                </div>
              </div>
            </div>
            <div className="area-card">
              <h3>Recrutamento</h3>
              <div className="area-stats">
                <div>
                  <strong>Vagas ativas</strong>
                  <span>{metrics.vagasAbertas}</span>
                </div>
                <div>
                  <strong>Em entrevista</strong>
                  <span>{vacancies.filter((v) => v.status === "entrevista").length}</span>
                </div>
                <div>
                  <strong>Finalistas</strong>
                  <span>{vacancies.filter((v) => v.status === "final").length}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="area-card">
            <h3>Performance por gestor</h3>
            {indicators.length ? (
              <div className="area-table">
                <div className="area-row area-row-head">
                  <span>Gestor</span>
                  <span>Total</span>
                  <span>Ativos</span>
                  <span>Ferias</span>
                  <span>Afastados</span>
                </div>
                {indicators.map((row) => (
                  <div key={row.name} className="area-row">
                    <span>{row.name}</span>
                    <span>{row.total}</span>
                    <span>{row.extra?.ativos || 0}</span>
                    <span>{row.extra?.ferias || 0}</span>
                    <span>{row.extra?.afastados || 0}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Placeholder>Nenhum indicador disponivel.</Placeholder>
            )}
          </div>
        </Section>
      ) : null}

      {resolvedKey === "colaboradores" ? (
        <Section title="Colaboradores" wide>
          <div className="area-card">
            <h3>Novo colaborador</h3>
            <div className="area-form">
              <input
                className="float-input"
                placeholder="Nome"
                value={colabForm.name}
                onChange={(e) => setColabForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="float-input"
                placeholder="Cargo"
                value={colabForm.role_title}
                onChange={(e) => setColabForm((prev) => ({ ...prev, role_title: e.target.value }))}
              />
              <input
                className="float-input"
                placeholder="Area"
                value={colabForm.area}
                onChange={(e) => setColabForm((prev) => ({ ...prev, area: e.target.value }))}
              />
              <input
                className="float-input"
                placeholder="Gestor"
                value={colabForm.manager_name}
                onChange={(e) => setColabForm((prev) => ({ ...prev, manager_name: e.target.value }))}
              />
              <select
                className="float-input"
                value={colabForm.status}
                onChange={(e) => setColabForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                {STATUS_COLAB.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <input
                className="float-input"
                type="date"
                value={colabForm.start_date}
                onChange={(e) => setColabForm((prev) => ({ ...prev, start_date: e.target.value }))}
              />
              <button type="button" className="table-btn" onClick={handleAddColab} disabled={!canEdit}>
                Adicionar
              </button>
            </div>
          </div>

          <div className="area-card">
            <h3>Equipe atual</h3>
            {employees.length ? (
              <div className="area-table">
                <div className="area-row area-row-head">
                  <span>Nome</span>
                  <span>Cargo</span>
                  <span>Area</span>
                  <span>Gestor</span>
                  <span>Status</span>
                </div>
                {employees.map((colab) => (
                  <div key={colab.id} className="area-row">
                    <span>{colab.name}</span>
                    <span>{colab.role_title || "-"}</span>
                    <span>{colab.area || "-"}</span>
                    <span>{colab.manager_name || "-"}</span>
                    <span>
                      <select
                        className="float-input compact"
                        value={colab.status}
                        disabled={!canEdit}
                        onChange={(e) => handleUpdateColab(colab.id, { status: e.target.value })}
                      >
                        {STATUS_COLAB.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Placeholder>Nenhum colaborador cadastrado.</Placeholder>
            )}
          </div>
        </Section>
      ) : null}

      {resolvedKey === "recrutamento" ? (
        <Section title="Recrutamento" wide>
          <div className="area-card">
            <h3>Nova vaga</h3>
            <div className="area-form">
              <input
                className="float-input"
                placeholder="Titulo da vaga"
                value={vagaForm.title}
                onChange={(e) => setVagaForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <input
                className="float-input"
                placeholder="Area"
                value={vagaForm.area}
                onChange={(e) => setVagaForm((prev) => ({ ...prev, area: e.target.value }))}
              />
              <input
                className="float-input"
                type="number"
                placeholder="Candidatos"
                value={vagaForm.candidates_count}
                onChange={(e) => setVagaForm((prev) => ({ ...prev, candidates_count: e.target.value }))}
              />
              <select
                className="float-input"
                value={vagaForm.status}
                onChange={(e) => setVagaForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                {STATUS_VAGA.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button type="button" className="table-btn" onClick={handleAddVaga} disabled={!canEdit}>
                Adicionar
              </button>
            </div>
          </div>

          <div className="area-card">
            <h3>Pipeline de vagas</h3>
            {vacancies.length ? (
              <div className="area-table">
                <div className="area-row area-row-head">
                  <span>Vaga</span>
                  <span>Area</span>
                  <span>Candidatos</span>
                  <span>Status</span>
                </div>
                {vacancies.map((vaga) => (
                  <div key={vaga.id} className="area-row">
                    <span>{vaga.title}</span>
                    <span>{vaga.area || "-"}</span>
                    <span>{vaga.candidates_count}</span>
                    <span>
                      <select
                        className="float-input compact"
                        value={vaga.status}
                        disabled={!canEdit}
                        onChange={(e) => handleUpdateVaga(vaga.id, { status: e.target.value })}
                      >
                        {STATUS_VAGA.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Placeholder>Nenhuma vaga cadastrada.</Placeholder>
            )}
          </div>
        </Section>
      ) : null}

      {resolvedKey === "relatorios" ? (
        <Section title="Relatorios" wide>
          <div className="area-card">
            <h3>Exportar relatorios</h3>
            <div className="area-form">
              <button type="button" className="table-btn" onClick={() => handleExport("xlsx")}>
                Exportar Excel
              </button>
              <button type="button" className="table-btn" onClick={() => handleExport("pdf")}>
                Exportar PDF
              </button>
            </div>
            <p className="muted">Relatorio completo em Excel ou PDF.</p>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
