import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = ""; // com proxy do Vite: /api/... vai para o Django

const DEFAULT_URL =
  "https://www.vivareal.com.br/venda/sp/sao-paulo/apartamento_residencial/";

export const AVALIACAO_SECTIONS = [
  {
    key: "buscador",
    label: "Buscador de imovel",
    title: "Buscador de imovel",
  },
];
const OPERACAO_TABS = [
  { key: "venda", label: "Comprar" },
  { key: "aluguel", label: "Alugar" },
];
const LOADING_STEPS = [
  "Carregando cookies",
  "Abrindo pagina e aplicando filtros",
  "Coletando informacoes dos imoveis",
  "Colocando na planilha",
  "Finalizando",
];
const LAST_JOB_ID_KEY = "lastro-last-job-id";

const STATUS_LABELS = {
  queued: "Fila",
  running: "Executando",
  done: "Concluido",
  error: "Erro",
  canceled: "Cancelado",
};

const GUIDE_STEPS = [
  "Defina cidade e estado para refinar o radar.",
  "Escolha o tipo do imovel e ajuste o tamanho.",
  "Use quartos e banheiros para filtrar o perfil.",
  "Inicie o scraping e acompanhe o status.",
];

const QUICK_PRESETS = [
  {
    id: "apto-compacto",
    title: "Apartamento compacto",
    description: "1-2 quartos, ate 60m2",
    patch: { tipo: "Apartamento", quartos: "2", banheiros: "1", areaMax: "60" },
  },
  {
    id: "familia-urbana",
    title: "Familia urbana",
    description: "3 quartos, 2 banheiros, 80-140m2",
    patch: { quartos: "3", banheiros: "2", areaMin: "80", areaMax: "140" },
  },
  {
    id: "casa-espacosa",
    title: "Casa com espaco",
    description: "Casa residencial, 3+ quartos, 120m2+",
    patch: { tipo: "Casa Residencial", quartos: "3", banheiros: "2", areaMin: "120" },
  },
  {
    id: "investimento",
    title: "Investimento (aluguel)",
    description: "Apto 1 quarto para locacao",
    patch: { operacao: "aluguel", tipo: "Apartamento", quartos: "1", banheiros: "1" },
  },
];

function slugify(value, separator = "-") {
  const input = String(value || "").trim();
  if (!input) return "";
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const sep = separator === "_" ? "_" : "-";
  const replaced = normalized.replace(/[^a-z0-9]+/g, sep);
  const collapsed = replaced.replace(new RegExp(`${sep}+`, "g"), sep);
  return collapsed.replace(new RegExp(`^${sep}|${sep}$`, "g"), "");
}

function buildSearchUrl(fields) {
  const operacao = slugify(fields.operacao) || "venda";
  const estado = slugify(fields.estado) || "sp";
  const cidade = slugify(fields.cidade) || "sao-paulo";
  const tipo = slugify(fields.tipo, "_") || "apartamento_residencial";
  const regiaoRaw = String(fields.regiao || "").trim();
  let regiaoSlug = slugify(regiaoRaw);
  if (["norte", "sul", "leste", "oeste"].includes(regiaoSlug)) {
    regiaoSlug = `zona-${regiaoSlug}`;
  }
  const base = regiaoSlug
    ? `https://www.vivareal.com.br/${operacao}/${estado}/${cidade}/${regiaoSlug}/${tipo}/`
    : `https://www.vivareal.com.br/${operacao}/${estado}/${cidade}/${tipo}/`;

  const params = new URLSearchParams();
  if (!regiaoSlug && regiaoRaw) params.set("regiao", regiaoRaw);
  if (fields.bairro) params.set("bairro", fields.bairro.trim());
  if (fields.quartos) params.set("quartos", String(fields.quartos));
  if (fields.banheiros) params.set("banheiros", String(fields.banheiros));
  if (fields.areaMin) params.set("area_min", String(fields.areaMin));
  if (fields.areaMax) params.set("area_max", String(fields.areaMax));
  if (fields.logradouro) params.set("logradouro", fields.logradouro.trim());

  const query = params.toString();
  return query ? `${base}?${query}` : base || DEFAULT_URL;
}

async function apiJson(url, options = {}) {
  const res = await fetch(API_BASE + url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

function normalizePreview(preview) {
  if (!preview) return { cols: [], rows: [], raw: null };

  // Caso 1: array de objetos
  if (Array.isArray(preview)) {
    const cols = preview.length ? Object.keys(preview[0]) : [];
    return { cols, rows: preview, raw: null };
  }

  // Caso 2: { rows: [...] }
  if (preview.rows && Array.isArray(preview.rows)) {
    const cols = preview.rows.length ? Object.keys(preview.rows[0]) : [];
    return { cols, rows: preview.rows, raw: null };
  }

  // Fallback: mostra JSON bruto
  return { cols: [], rows: [], raw: preview };
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR");
}

function pickPayloadValue(payload, keys) {
  if (!payload) return "";
  for (const key of keys) {
    const value = payload[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      if (value.trim()) return value.trim();
      continue;
    }
    return String(value);
  }
  return "";
}

function resolveStatusLabel(status) {
  return STATUS_LABELS[status] || status || "-";
}

export default function Avaliacao({ permissions, activeKey, onSelect }) {
  const canEdit = !!permissions?.editar;
  const resolvedKey = AVALIACAO_SECTIONS.some((item) => item.key === activeKey)
    ? activeKey
    : AVALIACAO_SECTIONS[0].key;

  useEffect(() => {
    if (activeKey !== resolvedKey) {
      onSelect?.(resolvedKey);
    }
  }, [activeKey, resolvedKey, onSelect]);

  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [operacao, setOperacao] = useState("venda");
  const [tipo, setTipo] = useState("");
  const [regiao, setRegiao] = useState("");
  const [bairro, setBairro] = useState("");
  const [quartos, setQuartos] = useState("");
  const [banheiros, setBanheiros] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const headless = true;

  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);

  const [lastJob, setLastJob] = useState(null);
  const [lastJobLoading, setLastJobLoading] = useState(false);
  const [lastJobError, setLastJobError] = useState("");
  const [logs, setLogs] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");

  const timerRef = useRef(null);
  const prevLoadingRef = useRef(false);

  const canUseRegiao = estado === "sp" || estado === "rj";

  useEffect(() => {
    if (!canUseRegiao && regiao) {
      setRegiao("");
    }
  }, [canUseRegiao, regiao]);

  const searchUrl = useMemo(
    () =>
      buildSearchUrl({
        cidade,
        estado,
        operacao,
        tipo,
        regiao,
        bairro,
        quartos,
        banheiros,
        areaMin,
        areaMax,
        logradouro,
      }),
    [
      cidade,
      estado,
      operacao,
      tipo,
      regiao,
      bairro,
      quartos,
      banheiros,
      areaMin,
      areaMax,
      logradouro,
    ]
  );

  const isLoading = !!jobId && !["done", "error", "canceled"].includes(status);
  const canExport = !!jobId && status === "done";

  const { cols, rows, raw } = useMemo(() => normalizePreview(preview), [preview]);

  const lastJobId = lastJob?.job_id || null;
  const logsJobId = jobId || lastJobId;

  const lastJobTags = useMemo(() => {
    if (!lastJob?.payload) return [];
    const payload = lastJob.payload || {};
    const tags = [];

    const operacaoVal = pickPayloadValue(payload, ["operacao", "operation"]);
    if (operacaoVal) {
      tags.push({
        label: "Operacao",
        value: operacaoVal === "aluguel" ? "Alugar" : "Comprar",
      });
    }

    const cidadeVal = pickPayloadValue(payload, ["cidade", "city"]);
    const estadoVal = pickPayloadValue(payload, ["estado", "uf", "state"]);
    if (cidadeVal || estadoVal) {
      tags.push({
        label: "Local",
        value: [cidadeVal, estadoVal].filter(Boolean).join(" / "),
      });
    }

    const tipoVal = pickPayloadValue(payload, [
      "tipo",
      "tipo_imovel",
      "tipoImovel",
      "property_type",
    ]);
    if (tipoVal) tags.push({ label: "Tipo", value: tipoVal });

    const regiaoVal = pickPayloadValue(payload, ["regiao", "zona", "region"]);
    if (regiaoVal) tags.push({ label: "Regiao", value: regiaoVal });

    const bairroVal = pickPayloadValue(payload, ["bairro", "neighborhood"]);
    if (bairroVal) tags.push({ label: "Bairro", value: bairroVal });

    const logradouroVal = pickPayloadValue(payload, ["logradouro", "rua", "street"]);
    if (logradouroVal) tags.push({ label: "Logradouro", value: logradouroVal });

    const quartosVal = pickPayloadValue(payload, ["quartos", "bedrooms"]);
    if (quartosVal) tags.push({ label: "Quartos", value: `${quartosVal}+` });

    const banheirosVal = pickPayloadValue(payload, ["banheiros", "bathrooms"]);
    if (banheirosVal) tags.push({ label: "Banheiros", value: `${banheirosVal}+` });

    const areaMinVal = pickPayloadValue(payload, ["areaMin", "area_min", "areaMinima"]);
    const areaMaxVal = pickPayloadValue(payload, ["areaMax", "area_max", "areaMaxima"]);
    let areaValue = "";
    if (areaMinVal && areaMaxVal) {
      areaValue = `${areaMinVal}-${areaMaxVal} m2`;
    } else if (areaMinVal) {
      areaValue = `min ${areaMinVal} m2`;
    } else if (areaMaxVal) {
      areaValue = `max ${areaMaxVal} m2`;
    }
    if (areaValue) tags.push({ label: "Area", value: areaValue });

    return tags;
  }, [lastJob]);

  async function fetchLatestJob() {
    setLastJobLoading(true);
    setLastJobError("");
    try {
      const data = await apiJson("/api/lastro/jobs/latest/?preview=20");
      if (data?.job === null) {
        setLastJob(null);
        if (!jobId) {
          setPreview(null);
          setStatus("idle");
        }
        return;
      }
      setLastJob(data);
      if (data?.job_id) {
        localStorage.setItem(LAST_JOB_ID_KEY, String(data.job_id));
      }
      if (!jobId) {
        setPreview(data.preview || null);
        setStatus(data.status || "idle");
      }
    } catch (e) {
      setLastJobError(String(e.message || e));
    } finally {
      setLastJobLoading(false);
    }
  }

  useEffect(() => {
    const storedId = localStorage.getItem(LAST_JOB_ID_KEY);
    if (storedId && !jobId) {
      const parsed = Number(storedId);
      if (!Number.isNaN(parsed)) {
        setJobId(parsed);
      }
    }
    fetchLatestJob();
  }, []);

  function buildPayloadFromState() {
    return {
      operacao,
      estado,
      cidade,
      tipo,
      regiao,
      bairro,
      quartos,
      banheiros,
      areaMin,
      areaMax,
      logradouro,
      headless,
      retry_visible: true,
    };
  }

  async function startJob() {
    if (!canEdit) return;

    setError("");
    setPreview(null);
    setStatus("queued");
    setLoadingStep(0);

    const payload = buildPayloadFromState();

    try {
      const data = await apiJson("/api/lastro/jobs/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setJobId(data.job_id);
      localStorage.setItem(LAST_JOB_ID_KEY, String(data.job_id));
      setLastJob({
        job_id: data.job_id,
        status: data.status || "queued",
        created_at: new Date().toISOString(),
        total_rows: 0,
        error_message: "",
        payload,
      });
    } catch (e) {
      setError(String(e.message || e));
      setStatus("error");
    }
  }

  async function repeatLastSearch() {
    if (!canEdit || !lastJob?.payload) return;

    setError("");
    setPreview(null);
    setStatus("queued");
    setLoadingStep(0);

    const payload = { ...lastJob.payload };
    if (payload.headless === undefined) payload.headless = headless;
    if (payload.retry_visible === undefined) payload.retry_visible = true;

    try {
      const data = await apiJson("/api/lastro/jobs/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setJobId(data.job_id);
      localStorage.setItem(LAST_JOB_ID_KEY, String(data.job_id));
      setLastJob({
        job_id: data.job_id,
        status: data.status || "queued",
        created_at: new Date().toISOString(),
        total_rows: 0,
        error_message: "",
        payload,
      });
    } catch (e) {
      setError(String(e.message || e));
      setStatus("error");
    }
  }

  async function fetchStatusAndLogs(id) {
    const st = await apiJson(`/api/lastro/jobs/${id}/?preview=20`);
    setStatus(st.status || "-");
    setPreview(st.preview || null);
    if (st.status === "error" && st.error_message) {
      setError(st.error_message);
    }

    setLastJob((prev) => {
      if (!prev) {
        return {
          job_id: id,
          status: st.status || "idle",
          created_at: st.created_at,
          started_at: st.started_at,
          finished_at: st.finished_at,
          total_rows: st.total_rows,
          error_message: st.error_message,
          payload: st.payload || {},
        };
      }
      if (prev.job_id !== id) return prev;
      return {
        ...prev,
        status: st.status || prev.status,
        started_at: st.started_at ?? prev.started_at,
        finished_at: st.finished_at ?? prev.finished_at,
        total_rows: st.total_rows ?? prev.total_rows,
        error_message: st.error_message ?? prev.error_message,
        payload: prev.payload || st.payload || {},
      };
    });

    return st.status;
  }

  async function cancelJob() {
    if (!canEdit || !jobId) return;
    try {
      await apiJson(`/api/lastro/jobs/${jobId}/cancel/`, { method: "POST" });
      await fetchStatusAndLogs(jobId);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function fetchLogs(targetId) {
    if (!targetId) return;
    setLogsLoading(true);
    setLogsError("");
    try {
      const data = await apiJson(`/api/lastro/jobs/${targetId}/logs/`);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setLogsError(String(e.message || e));
    } finally {
      setLogsLoading(false);
    }
  }

  function applyPayloadToFilters(payload) {
    if (!payload) return;

    const nextOperacao = pickPayloadValue(payload, ["operacao", "operation"]) || "venda";
    const nextEstado = pickPayloadValue(payload, ["estado", "uf", "state"]);
    const nextCidade = pickPayloadValue(payload, ["cidade", "city"]);
    const nextTipo = pickPayloadValue(payload, [
      "tipo",
      "tipo_imovel",
      "tipoImovel",
      "property_type",
    ]);
    const nextRegiao = pickPayloadValue(payload, ["regiao", "zona", "region"]);
    const nextBairro = pickPayloadValue(payload, ["bairro", "neighborhood"]);
    const nextQuartos = pickPayloadValue(payload, ["quartos", "bedrooms"]);
    const nextBanheiros = pickPayloadValue(payload, ["banheiros", "bathrooms"]);
    const nextAreaMin = pickPayloadValue(payload, ["areaMin", "area_min", "areaMinima"]);
    const nextAreaMax = pickPayloadValue(payload, ["areaMax", "area_max", "areaMaxima"]);
    const nextLogradouro = pickPayloadValue(payload, ["logradouro", "rua", "street"]);

    setOperacao(nextOperacao || "venda");
    setEstado(nextEstado || "");
    setCidade(nextCidade || "");
    setTipo(nextTipo || "");
    setRegiao(nextRegiao || "");
    setBairro(nextBairro || "");
    setQuartos(nextQuartos || "");
    setBanheiros(nextBanheiros || "");
    setAreaMin(nextAreaMin || "");
    setAreaMax(nextAreaMax || "");
    setLogradouro(nextLogradouro || "");
  }

  function applyPreset(preset) {
    if (!preset?.patch) return;
    const patch = preset.patch;
    if (patch.operacao !== undefined) setOperacao(String(patch.operacao));
    if (patch.estado !== undefined) setEstado(String(patch.estado));
    if (patch.cidade !== undefined) setCidade(String(patch.cidade));
    if (patch.tipo !== undefined) setTipo(String(patch.tipo));
    if (patch.regiao !== undefined) setRegiao(String(patch.regiao));
    if (patch.bairro !== undefined) setBairro(String(patch.bairro));
    if (patch.quartos !== undefined) setQuartos(String(patch.quartos));
    if (patch.banheiros !== undefined) setBanheiros(String(patch.banheiros));
    if (patch.areaMin !== undefined) setAreaMin(String(patch.areaMin));
    if (patch.areaMax !== undefined) setAreaMax(String(patch.areaMax));
    if (patch.logradouro !== undefined) setLogradouro(String(patch.logradouro));
  }

  useEffect(() => {
    if (!jobId) return;

    if (timerRef.current) clearInterval(timerRef.current);

    const poll = async () => {
      try {
        const st = await fetchStatusAndLogs(jobId);
        if (["done", "error", "canceled"].includes(st)) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } catch (e) {
        setError(String(e.message || e));
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    poll();
    timerRef.current = setInterval(poll, 2000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [jobId]);

  useEffect(() => {
    if (!isLoading) return undefined;
    const timer = setInterval(() => {
      setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 2200);
    return () => clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && jobId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, jobId]);

  useEffect(() => {
    if (!logsOpen || !logsJobId) return;
    fetchLogs(logsJobId);
  }, [logsOpen, logsJobId]);

  function exportXlsx(targetId) {
    const id = targetId || jobId;
    if (!canEdit || !id) return;
    window.location.href = `/api/lastro/jobs/${id}/export.xlsx`;
  }

  const statusLabel = resolveStatusLabel(status);

  return (
    <div className="main-content">
      <div className="avaliacao-stack">
        <section className="buscador-card">
          <div className="buscador-card-header">
            <div>
              <h2 className="buscador-card-title">Buscador de imoveis</h2>
              <p className="avaliacao-subtitle">
                Monte a busca, acompanhe o status no Django e recupere o historico recente.
              </p>
            </div>
          </div>
          <div className="avaliacao-body">
            <div className="avaliacao-summary-grid">
              <article className="avaliacao-summary-card">
                <div className="avaliacao-summary-header">
                  <div>
                    <div className="avaliacao-summary-eyebrow">Ultima busca</div>
                    <h3 className="avaliacao-summary-title">Historico mais recente</h3>
                  </div>
                  <button
                    type="button"
                    className="avaliacao-mini-btn"
                    onClick={fetchLatestJob}
                    disabled={lastJobLoading}
                  >
                    {lastJobLoading ? "Atualizando..." : "Atualizar"}
                  </button>
                </div>

                {lastJobError ? <div className="avaliacao-summary-error">{lastJobError}</div> : null}

                {lastJobLoading ? (
                  <div className="avaliacao-summary-empty">Carregando dados do Django...</div>
                ) : lastJob ? (
                  <>
                    <div className="avaliacao-summary-meta">
                      <span className={`avaliacao-status-pill status-${lastJob.status || "idle"}`}>
                        {resolveStatusLabel(lastJob.status)}
                      </span>
                      <span>Job #{lastJob.job_id}</span>
                      <span>Criado em {formatDateTime(lastJob.created_at)}</span>
                      <span>Resultados: {lastJob.total_rows ?? "-"}</span>
                    </div>
                    {lastJob.error_message ? (
                      <div className="avaliacao-summary-error">{lastJob.error_message}</div>
                    ) : null}
                    <div className="avaliacao-tag-list">
                      {lastJobTags.length ? (
                        lastJobTags.map((tag) => (
                          <span key={`${tag.label}-${tag.value}`} className="avaliacao-tag">
                            <strong>{tag.label}:</strong> {tag.value}
                          </span>
                        ))
                      ) : (
                        <span className="avaliacao-tag-empty">Sem filtros registrados.</span>
                      )}
                    </div>
                    <div className="avaliacao-summary-actions">
                      <button
                        type="button"
                        className="avaliacao-secondary-btn"
                        onClick={() => applyPayloadToFilters(lastJob.payload)}
                        disabled={!lastJob.payload}
                      >
                        Aplicar filtros
                      </button>
                      <button
                        type="button"
                        className="avaliacao-primary-btn"
                        onClick={repeatLastSearch}
                        disabled={!canEdit || !lastJob.payload}
                      >
                        Repetir busca
                      </button>
                      <button
                        type="button"
                        className="avaliacao-secondary-btn"
                        onClick={() => setLogsOpen((prev) => !prev)}
                        disabled={!logsJobId}
                      >
                        {logsOpen ? "Fechar logs" : "Ver logs"}
                      </button>
                      <button
                        type="button"
                        className="avaliacao-secondary-btn"
                        onClick={() => exportXlsx(lastJob.job_id)}
                        disabled={!canEdit || lastJob.status !== "done"}
                      >
                        Baixar XLSX
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="avaliacao-summary-empty">Nenhuma busca registrada ainda.</div>
                )}
              </article>

              <article className="avaliacao-summary-card">
                <div className="avaliacao-summary-header">
                  <div>
                    <div className="avaliacao-summary-eyebrow">Como buscar</div>
                    <h3 className="avaliacao-summary-title">Pense como um avaliador</h3>
                  </div>
                </div>
                <div className="avaliacao-guide-list">
                  {GUIDE_STEPS.map((step, idx) => (
                    <div key={step} className="avaliacao-guide-item">
                      <span className="avaliacao-guide-index">{idx + 1}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
                <div className="avaliacao-quick-grid">
                  {QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="avaliacao-quick-btn"
                      onClick={() => applyPreset(preset)}
                    >
                      <span className="avaliacao-quick-title">{preset.title}</span>
                      <span className="avaliacao-quick-desc">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </article>
            </div>

            <aside className="avaliacao-filters">
              <div className="avaliacao-tabs" role="tablist" aria-label="Operacao">
                {OPERACAO_TABS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`avaliacao-tab ${operacao === item.key ? "active" : ""}`}
                    onClick={() => setOperacao(item.key)}
                    aria-pressed={operacao === item.key}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="avaliacao-filters-content">
                <div className="form-grid">
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-estado">Estado</label>
                    <select
                      id="busca-estado"
                      className="float-input"
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                    >
                      <option value="">Selecione o estado</option>
                      <option value="Acre">Acre</option>
                      <option value="Alagoas">Alagoas</option>
                      <option value="Amapa">Amapa</option>
                      <option value="Amazonas">Amazonas</option>
                      <option value="Bahia">Bahia</option>
                      <option value="Ceara">Ceara</option>
                      <option value="Distrito Federal">Distrito Federal</option>
                      <option value="Espirito Santo">Espirito Santo</option>
                      <option value="Goias">Goias</option>
                      <option value="Maranhao">Maranhao</option>
                      <option value="Mato Grosso">Mato Grosso</option>
                      <option value="Mato Grosso do Sul">Mato Grosso do Sul</option>
                      <option value="Minas Gerais">Minas Gerais</option>
                      <option value="Para">Para</option>
                      <option value="Paraiba">Paraiba</option>
                      <option value="Parana">Parana</option>
                      <option value="Pernambuco">Pernambuco</option>
                      <option value="Piaui">Piaui</option>
                      <option value="Rio Grande do Norte">Rio Grande do Norte</option>
                      <option value="Rio Grande do Sul">Rio Grande do Sul</option>
                      <option value="Rondonia">Rondonia</option>
                      <option value="Roraima">Roraima</option>
                      <option value="Santa Catarina">Santa Catarina</option>
                      <option value="sp">Sao Paulo</option>
                      <option value="Sergipe">Sergipe</option>
                      <option value="Tocantins">Tocantins</option>
                      <option value="rj">Rio de Janeiro</option>
                    </select>
                  </div>
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-cidade">Cidade</label>
                    <input
                      id="busca-cidade"
                      className="float-input"
                      type="text"
                      placeholder="Digite a cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                    />
                  </div>
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-tipo">Tipo</label>
                    <select
                      id="busca-tipo"
                      className="float-input"
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value)}
                    >
                      <option value="">Selecione o tipo</option>
                      <option value="Apartamento">Apartamento</option>
                      <option value="Casa Residencial">Casa Residencial</option>
                      <option value="Casa de Condominio">Casa de Condominio</option>
                      <option value="Cobertura">Cobertura</option>
                      <option value="Flat">Flat</option>
                      <option value="Kitnet/Conjugado">Kitnet/Conjugado</option>
                      <option value="Lote/Terreno">Lote/Terreno</option>
                      <option value="Sobrado">Sobrado</option>
                      <option value="Edificio Residencial">Edificio Residencial</option>
                      <option value="Fazenda/Sitios/Chacaras">Fazenda/Sitios/Chacaras</option>
                      <option value="Consultorio">Consultorio</option>
                      <option value="Galpao/Deposito/Armazem">Galpao/Deposito/Armazem</option>
                      <option value="Imovel Comercial">Imovel Comercial</option>
                      <option value="Ponto Comercial/Loja/Box">Ponto Comercial/Loja/Box</option>
                      <option value="Sala/Conjunto">Sala/Conjunto</option>
                      <option value="Predio/Edificio Inteiro">Predio/Edificio Inteiro</option>
                    </select>
                  </div>
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-regiao">Regiao</label>
                    <input
                      id="busca-regiao"
                      className="float-input"
                      type="text"
                      placeholder={canUseRegiao ? "Ex: Zona Sul" : "Disponivel apenas para SP ou RJ"}
                      value={regiao}
                      onChange={(e) => setRegiao(e.target.value)}
                      disabled={!canUseRegiao}
                    />
                  </div>
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-bairro">Bairro</label>
                    <input
                      id="busca-bairro"
                      className="float-input"
                      type="text"
                      placeholder="Ex: Moema"
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                    />
                  </div>
                  <div className="avaliacao-choice">
                    <span className="field-label">Quartos</span>
                    <div className="avaliacao-choice-group">
                      {["1", "2", "3", "4"].map((item) => (
                        <button
                          key={`quartos-${item}`}
                          type="button"
                          className={`avaliacao-choice-btn ${quartos === item ? "active" : ""}`}
                          onClick={() => setQuartos((prev) => (prev === item ? "" : item))}
                          aria-pressed={quartos === item}
                        >
                          {item}+
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="avaliacao-choice">
                    <span className="field-label">Banheiros</span>
                    <div className="avaliacao-choice-group">
                      {["1", "2", "3", "4"].map((item) => (
                        <button
                          key={`banheiros-${item}`}
                          type="button"
                          className={`avaliacao-choice-btn ${banheiros === item ? "active" : ""}`}
                          onClick={() => setBanheiros((prev) => (prev === item ? "" : item))}
                          aria-pressed={banheiros === item}
                        >
                          {item}+
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-area-min">Area minima</label>
                    <input
                      id="busca-area-min"
                      className="float-input"
                      type="number"
                      min="0"
                      placeholder="Min. m2"
                      value={areaMin}
                      onChange={(e) => setAreaMin(e.target.value)}
                    />
                  </div>
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-area-max">Area maxima</label>
                    <input
                      id="busca-area-max"
                      className="float-input"
                      type="number"
                      min="0"
                      placeholder="Max. m2"
                      value={areaMax}
                      onChange={(e) => setAreaMax(e.target.value)}
                    />
                  </div>
                  <div className="float-group">
                    <label className="field-label" htmlFor="busca-logradouro">
                      Logradouro (Rua/avenida)
                    </label>
                    <input
                      id="busca-logradouro"
                      className="float-input"
                      type="text"
                      placeholder="Digite o logradouro"
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                    />
                  </div>
                </div>

                {!canEdit && <p className="permission-note">Modo somente leitura.</p>}

                <div className="avaliacao-scraper">
                  <h3 className="avaliacao-scraper-title">Scraper (VivaReal)</h3>
                  <input
                    className="avaliacao-url-input"
                    value={searchUrl}
                    readOnly
                    placeholder="URL estimada pelos filtros"
                  />
                  <div className="avaliacao-headless">Headless ativo</div>
                  <div className="avaliacao-action-row">
                    <button
                      type="button"
                      className="avaliacao-search-btn"
                      onClick={startJob}
                      disabled={!canEdit || isLoading}
                    >
                      Iniciar pesquisa
                    </button>
                    <button
                      type="button"
                      className="avaliacao-secondary-btn"
                      onClick={cancelJob}
                      disabled={!canEdit || !isLoading}
                    >
                      Cancelar busca
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <section className="avaliacao-results">
              <div className="avaliacao-status-row">
                <div className="avaliacao-status-info">
                  <span className={`avaliacao-status-pill status-${status || "idle"}`}>
                    {statusLabel}
                  </span>
                  <span>{jobId ? `Job #${jobId}` : "Sem job ativo"}</span>
                  {jobId ? <span>Resultados: {rows.length || "-"}</span> : null}
                </div>
                <button
                  type="button"
                  className="avaliacao-mini-btn"
                  onClick={() => logsJobId && fetchStatusAndLogs(logsJobId)}
                  disabled={!logsJobId}
                >
                  Atualizar status
                </button>
              </div>

              {error ? (
                <div className="avaliacao-error">
                  <strong>Erro:</strong> {error}
                </div>
              ) : null}

              {isLoading && (
                <div className="avaliacao-loading">
                  <div className="avaliacao-loading-left">
                    <div className="wheel-and-hamster" aria-hidden="true">
                      <div className="wheel" />
                      <div className="hamster">
                        <div className="hamster__head">
                          <div className="hamster__ear" />
                          <div className="hamster__eye" />
                          <div className="hamster__nose" />
                        </div>
                        <div className="hamster__body">
                          <div className="hamster__limb--fr" />
                          <div className="hamster__limb--fl" />
                          <div className="hamster__limb--br" />
                          <div className="hamster__limb--bl" />
                          <div className="hamster__tail" />
                        </div>
                      </div>
                      <div className="spoke" />
                    </div>
                  </div>
                  <div className="avaliacao-loading-right">
                    <div className="avaliacao-loading-title">Buscando imoveis...</div>
                    <div className="avaliacao-loading-bar">
                      <span />
                    </div>
                    <div className="avaliacao-loading-steps">
                      {LOADING_STEPS.map((step, idx) => (
                        <div
                          key={step}
                          className={`avaliacao-loading-step ${
                            idx === loadingStep ? "active" : idx < loadingStep ? "done" : ""
                          }`}
                        >
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="avaliacao-preview-header">
                <h3>Preview</h3>
                <button
                  type="button"
                  className="avaliacao-preview-export"
                  onClick={() => exportXlsx(jobId)}
                  disabled={!canExport}
                >
                  Baixar XLSX
                </button>
              </div>

              <div className="avaliacao-preview">
                {cols.length === 0 && raw ? (
                  <pre className="avaliacao-preview-raw">{JSON.stringify(raw, null, 2)}</pre>
                ) : null}

                {cols.length > 0 ? (
                  <div className="avaliacao-preview-body">
                    <table className="avaliacao-preview-table">
                      <thead>
                        <tr>
                          {cols.map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            {cols.map((c) => (
                              <td key={c}>{String(r?.[c] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {cols.length === 0 && !raw ? (
                  <div className="avaliacao-summary-empty">Sem dados para exibir.</div>
                ) : null}
              </div>

              {logsOpen ? (
                <div className="avaliacao-logs">
                  <div className="avaliacao-logs-header">
                    <h4 className="avaliacao-logs-title">Logs do scraping</h4>
                    <button
                      type="button"
                      className="avaliacao-mini-btn"
                      onClick={() => fetchLogs(logsJobId)}
                      disabled={!logsJobId || logsLoading}
                    >
                      {logsLoading ? "Atualizando..." : "Atualizar logs"}
                    </button>
                  </div>
                  {logsError ? <div className="avaliacao-summary-error">{logsError}</div> : null}
                  {logsLoading ? (
                    <div className="avaliacao-summary-empty">Carregando logs do Django...</div>
                  ) : logs.length ? (
                    <div className="avaliacao-logs-list">
                      {logs.map((log, idx) => (
                        <div key={`${log.created_at || ""}-${idx}`} className="avaliacao-log-item">
                          <span className="avaliacao-log-time">
                            {formatDateTime(log.created_at)}
                          </span>
                          <span className="avaliacao-log-text">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="avaliacao-summary-empty">Nenhum log disponivel.</div>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
