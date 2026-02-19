import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = "";
const DEFAULT_URL =
  "https://www.vivareal.com.br/venda/sp/sao-paulo/apartamento_residencial/";
const LAST_JOB_ID_KEY = "lastro-last-job-id";
const HISTORY_KEY = "lastro-job-history-v2";
const PAGE_SIZE = 10;
const AREA_CAP = 500;

const OPERACAO_TABS = [
  { key: "venda", label: "Comprar" },
  { key: "aluguel", label: "Alugar" },
];

const LOADING_STEPS = ["Coletando", "Normalizando", "Gerando XLSX"];

const STATUS_LABELS = {
  idle: "Idle",
  queued: "Running",
  running: "Running",
  done: "Success",
  error: "Error",
  canceled: "Idle",
};

const STATE_OPTIONS = [
  ["", "Selecione o estado"],
  ["ac", "Acre"],
  ["al", "Alagoas"],
  ["am", "Amazonas"],
  ["ba", "Bahia"],
  ["ce", "Ceara"],
  ["df", "Distrito Federal"],
  ["es", "Espirito Santo"],
  ["go", "Goias"],
  ["mg", "Minas Gerais"],
  ["pr", "Parana"],
  ["pe", "Pernambuco"],
  ["rj", "Rio de Janeiro"],
  ["rs", "Rio Grande do Sul"],
  ["sc", "Santa Catarina"],
  ["sp", "Sao Paulo"],
];

const PROPERTY_OPTIONS = [
  "",
  "Apartamento",
  "Casa Residencial",
  "Casa de Condominio",
  "Cobertura",
  "Flat",
  "Kitnet/Conjugado",
  "Lote/Terreno",
  "Sobrado",
  "Imovel Comercial",
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

function parsePositiveInt(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 0 ? parsed : null;
}

function buildSearchUrl(fields) {
  const operacao = slugify(fields.operacao) || "venda";
  const estado = slugify(fields.estado) || "sp";
  const cidade = slugify(fields.cidade) || "sao-paulo";
  const tipo = slugify(fields.tipo, "_") || "apartamento_residencial";
  const regiaoRaw = String(fields.regiao || "").trim();
  let regiaoSlug = slugify(regiaoRaw);
  if (["norte", "sul", "leste", "oeste"].includes(regiaoSlug)) regiaoSlug = `zona-${regiaoSlug}`;
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
  if (Array.isArray(preview)) {
    const cols = preview.length ? Object.keys(preview[0]) : [];
    return { cols, rows: preview, raw: null };
  }
  if (preview.rows && Array.isArray(preview.rows)) {
    const cols = preview.rows.length ? Object.keys(preview.rows[0]) : [];
    return { cols, rows: preview.rows, raw: null };
  }
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

function statusTone(status) {
  if (status === "done") return "success";
  if (status === "error") return "error";
  if (status === "running" || status === "queued") return "running";
  return "idle";
}

function parseMulti(value) {
  const digits = String(value || "").match(/\d+/g) || [];
  return Array.from(new Set(digits)).sort((a, b) => Number(a) - Number(b));
}

function normalizeStateCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "sp";
  const slug = slugify(raw);
  const map = {
    "sao-paulo": "sp",
    "rio-de-janeiro": "rj",
    "minas-gerais": "mg",
    "distrito-federal": "df",
    "espirito-santo": "es",
    "rio-grande-do-sul": "rs",
    "rio-grande-do-norte": "rn",
    "santa-catarina": "sc",
    "pernambuco": "pe",
    "parana": "pr",
    "alagoas": "al",
    "amazonas": "am",
    "bahia": "ba",
    "ceara": "ce",
    "goias": "go",
    "acre": "ac",
  };
  if (map[slug]) return map[slug];
  if (/^[a-z]{2}$/.test(slug)) return slug;
  return "sp";
}

export const AVALIACAO_SECTIONS = [
  {
    key: "buscador",
    label: "Buscador de imovel",
    title: "Buscador de imovel",
  },
];

export default function Avaliacao({ permissions, activeKey, onSelect }) {
  const canEdit = !!permissions?.editar;
  const resolvedKey = AVALIACAO_SECTIONS.some((item) => item.key === activeKey)
    ? activeKey
    : AVALIACAO_SECTIONS[0].key;

  useEffect(() => {
    if (activeKey !== resolvedKey) onSelect?.(resolvedKey);
  }, [activeKey, resolvedKey, onSelect]);

  const [operacao, setOperacao] = useState("venda");
  const [estado, setEstado] = useState("sp");
  const [cidade, setCidade] = useState("");
  const [cityOptions, setCityOptions] = useState([]);
  const [cityOptionsLoading, setCityOptionsLoading] = useState(false);
  const [tipo, setTipo] = useState("");
  const [regiao, setRegiao] = useState("");
  const [bairro, setBairro] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [quartosSelected, setQuartosSelected] = useState([]);
  const [banheirosSelected, setBanheirosSelected] = useState([]);
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [headless, setHeadless] = useState(true);
  const [accordion, setAccordion] = useState({ localizacao: true, imovel: false, tamanho: false, avancado: false });

  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [lastJob, setLastJob] = useState(null);
  const [lastJobLoading, setLastJobLoading] = useState(false);
  const [lastJobError, setLastJobError] = useState("");

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logs, setLogs] = useState([]);

  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [drawerMode, setDrawerMode] = useState("");
  const [resultSearch, setResultSearch] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [toasts, setToasts] = useState([]);

  const timerRef = useRef(null);
  const prevStatusRef = useRef("idle");
  const citiesFallbackRef = useRef(null);

  const quartosPayload = useMemo(() => {
    if (!quartosSelected.length) return "";
    return String(Math.max(...quartosSelected.map(Number)));
  }, [quartosSelected]);
  const banheirosPayload = useMemo(() => {
    if (!banheirosSelected.length) return "";
    return String(Math.max(...banheirosSelected.map(Number)));
  }, [banheirosSelected]);
  const searchUrl = useMemo(
    () =>
      buildSearchUrl({ operacao, estado, cidade, tipo, regiao, bairro, quartos: quartosPayload, banheiros: banheirosPayload, areaMin, areaMax, logradouro }),
    [operacao, estado, cidade, tipo, regiao, bairro, quartosPayload, banheirosPayload, areaMin, areaMax, logradouro]
  );

  const isLoading = !!jobId && ["queued", "running"].includes(status);
  const canExport = !!jobId && status === "done";
  const { cols, rows, raw } = useMemo(() => normalizePreview(preview), [preview]);
  const logsJobId = jobId || lastJob?.job_id || null;
  const currentStatusLabel = STATUS_LABELS[status] || status || "Idle";
  const lastUpdatedAt = lastJob?.finished_at || lastJob?.started_at || lastJob?.created_at || null;
  const canUseRegiao = estado === "sp" || estado === "rj";

  const chips = useMemo(() => {
    const list = [];
    if (operacao) list.push({ key: "operacao", label: "Operacao", value: operacao === "aluguel" ? "Alugar" : "Comprar" });
    if (estado) list.push({ key: "estado", label: "Estado", value: estado.toUpperCase() });
    if (cidade) list.push({ key: "cidade", label: "Cidade", value: cidade });
    if (tipo) list.push({ key: "tipo", label: "Tipo", value: tipo });
    if (regiao) list.push({ key: "regiao", label: "Regiao", value: regiao });
    if (bairro) list.push({ key: "bairro", label: "Bairro", value: bairro });
    if (logradouro) list.push({ key: "logradouro", label: "Logradouro", value: logradouro });
    if (quartosSelected.length) list.push({ key: "quartos", label: "Quartos", value: quartosSelected.map((v) => `${v}+`).join(", ") });
    if (banheirosSelected.length) list.push({ key: "banheiros", label: "Banheiros", value: banheirosSelected.map((v) => `${v}+`).join(", ") });
    if (areaMin || areaMax) list.push({ key: "area", label: "Area", value: `${areaMin || "0"}-${areaMax || "max"} m2` });
    return list;
  }, [operacao, estado, cidade, tipo, regiao, bairro, logradouro, quartosSelected, banheirosSelected, areaMin, areaMax]);

  const filteredRows = useMemo(() => {
    let list = rows;
    const query = resultSearch.trim().toLowerCase();
    if (query) list = list.filter((row) => cols.some((c) => String(row?.[c] ?? "").toLowerCase().includes(query)));
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const va = String(a?.[sortKey] ?? "").toLowerCase();
        const vb = String(b?.[sortKey] ?? "").toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return list;
  }, [rows, cols, resultSearch, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function pushToast(type, message) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3500);
  }

  function upsertHistory(entry) {
    if (!entry?.job_id) return;
    setHistory((prev) => {
      const compact = {
        job_id: entry.job_id,
        status: entry.status || "idle",
        created_at: entry.created_at || new Date().toISOString(),
        total_rows: entry.total_rows ?? 0,
        payload: entry.payload || {},
        error_message: entry.error_message || "",
      };
      return [compact, ...prev.filter((item) => item.job_id !== compact.job_id)].slice(0, 20);
    });
  }

  function toggleMulti(setter, value) {
    setter((prev) => {
      const next = prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value];
      return next.sort((a, b) => Number(a) - Number(b));
    });
  }

  function toggleAccordion(section) {
    setAccordion((prev) => {
      const willOpen = !prev[section];
      return {
        localizacao: false,
        imovel: false,
        tamanho: false,
        avancado: false,
        [section]: willOpen,
      };
    });
  }

  function clearFilters() {
    setOperacao("venda");
    setEstado("sp");
    setCidade("");
    setTipo("");
    setRegiao("");
    setBairro("");
    setLogradouro("");
    setQuartosSelected([]);
    setBanheirosSelected([]);
    setAreaMin("");
    setAreaMax("");
  }

  function removeChip(key) {
    if (key === "operacao") setOperacao("venda");
    if (key === "estado") setEstado("sp");
    if (key === "cidade") setCidade("");
    if (key === "tipo") setTipo("");
    if (key === "regiao") setRegiao("");
    if (key === "bairro") setBairro("");
    if (key === "logradouro") setLogradouro("");
    if (key === "quartos") setQuartosSelected([]);
    if (key === "banheiros") setBanheirosSelected([]);
    if (key === "area") {
      setAreaMin("");
      setAreaMax("");
    }
  }

  function applyPayloadToFilters(payload) {
    if (!payload) return;
    setOperacao(pickPayloadValue(payload, ["operacao", "operation"]) || "venda");
    setEstado(normalizeStateCode(pickPayloadValue(payload, ["estado", "uf", "state"]) || "sp"));
    setCidade(pickPayloadValue(payload, ["cidade", "city"]) || "");
    setTipo(pickPayloadValue(payload, ["tipo", "tipo_imovel", "tipoImovel", "property_type"]) || "");
    setRegiao(pickPayloadValue(payload, ["regiao", "zona", "region"]) || "");
    setBairro(pickPayloadValue(payload, ["bairro", "neighborhood"]) || "");
    setLogradouro(pickPayloadValue(payload, ["logradouro", "rua", "street"]) || "");
    setAreaMin(pickPayloadValue(payload, ["areaMin", "area_min", "areaMinima"]) || "");
    setAreaMax(pickPayloadValue(payload, ["areaMax", "area_max", "areaMaxima"]) || "");
    setQuartosSelected(parseMulti(pickPayloadValue(payload, ["quartos", "bedrooms"])));
    setBanheirosSelected(parseMulti(pickPayloadValue(payload, ["banheiros", "bathrooms"])));
    setHeadless(payload.headless !== undefined ? Boolean(payload.headless) : true);
  }

  function buildPayloadFromState() {
    return {
      url: searchUrl,
      operacao,
      estado,
      cidade,
      tipo,
      regiao,
      bairro,
      quartos: quartosPayload,
      banheiros: banheirosPayload,
      areaMin,
      areaMax,
      logradouro,
      headless,
      retry_visible: true,
    };
  }

  async function runJobWithPayload(payload) {
    if (!canEdit) return;
    setError("");
    setShowErrorDetails(false);
    setPreview(null);
    setStatus("queued");
    setLoadingStep(0);
    try {
      const data = await apiJson("/api/lastro/jobs/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const item = {
        job_id: data.job_id,
        status: data.status || "queued",
        created_at: new Date().toISOString(),
        total_rows: 0,
        error_message: "",
        payload,
      };
      setJobId(item.job_id);
      setLastJob(item);
      localStorage.setItem(LAST_JOB_ID_KEY, String(item.job_id));
      upsertHistory(item);
      pushToast("info", "Busca iniciada.");
    } catch (e) {
      setError(String(e.message || e));
      setStatus("error");
      pushToast("error", "Nao foi possivel iniciar a busca.");
    }
  }

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
      if (data?.job_id) localStorage.setItem(LAST_JOB_ID_KEY, String(data.job_id));
      upsertHistory(data);
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

  async function fetchStatus(id) {
    const st = await apiJson(`/api/lastro/jobs/${id}/?preview=50`);
    setStatus(st.status || "idle");
    setPreview(st.preview || null);
    if (st.status === "error" && st.error_message) setError(st.error_message);
    if (st.status !== "error") setError("");
    const item = {
      job_id: id,
      status: st.status || "idle",
      created_at: st.created_at,
      started_at: st.started_at,
      finished_at: st.finished_at,
      total_rows: st.total_rows,
      error_message: st.error_message,
      payload: st.payload || {},
    };
    setLastJob((prev) => (!prev || prev.job_id === id ? item : prev));
    upsertHistory(item);
    return st.status;
  }

  async function cancelJob() {
    if (!canEdit || !jobId) return;
    try {
      await apiJson(`/api/lastro/jobs/${jobId}/cancel/`, { method: "POST" });
      await fetchStatus(jobId);
      pushToast("warning", "Cancelamento solicitado.");
    } catch (e) {
      setError(String(e.message || e));
      pushToast("error", "Falha ao cancelar.");
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

  function exportXlsx(targetId) {
    const id = targetId || jobId;
    if (!canEdit || !id) return;
    window.location.href = `/api/lastro/jobs/${id}/export.xlsx`;
    pushToast("success", "Download do XLSX iniciado.");
  }

  useEffect(() => {
    if (!canUseRegiao && regiao) setRegiao("");
  }, [canUseRegiao, regiao]);

  useEffect(() => {
    let canceled = false;

    async function loadCitiesFromFallback(uf) {
      try {
        if (!citiesFallbackRef.current) {
          const res = await fetch("/cities_by_uf.json");
          if (!res.ok) return [];
          citiesFallbackRef.current = await res.json();
        }
        const raw = citiesFallbackRef.current?.[uf];
        if (!Array.isArray(raw)) return [];
        return raw
          .map((name) => String(name || "").trim())
          .filter(Boolean)
          .map((name) => ({ value: name, label: name }));
      } catch {
        return [];
      }
    }

    async function loadCitiesByState() {
      const uf = normalizeStateCode(estado).toUpperCase();
      if (!uf) {
        setCityOptions([]);
        setCidade("");
        return;
      }

      setCityOptionsLoading(true);
      try {
        const data = await apiJson(`/api/lastro/localidades/cidades/?uf=${encodeURIComponent(uf)}`);
        if (canceled) return;
        let items = Array.isArray(data?.items) ? data.items : [];
        if (!items.length) {
          items = await loadCitiesFromFallback(uf);
          if (canceled) return;
        }
        setCityOptions(items);
        setCidade((prev) => (prev && !items.some((item) => item.value === prev) ? "" : prev));
      } catch {
        if (!canceled) {
          const fallbackItems = await loadCitiesFromFallback(uf);
          if (canceled) return;
          setCityOptions(fallbackItems);
          setCidade("");
        }
      } finally {
        if (!canceled) setCityOptionsLoading(false);
      }
    }

    loadCitiesByState();
    return () => {
      canceled = true;
    };
  }, [estado]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const stored = localStorage.getItem(LAST_JOB_ID_KEY);
    if (stored && !jobId) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) setJobId(parsed);
    }
    fetchLatestJob();
  }, []);

  useEffect(() => {
    if (!jobId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const poll = async () => {
      try {
        const st = await fetchStatus(jobId);
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
    const timer = setInterval(() => setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev)), 2000);
    return () => clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!logsOpen || !logsJobId) return;
    fetchLogs(logsJobId);
  }, [logsOpen, logsJobId]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (!jobId) {
      prevStatusRef.current = status;
      return;
    }
    if (["queued", "running"].includes(prev) && status === "done") pushToast("success", "Busca concluida. XLSX pronto.");
    if (["queued", "running"].includes(prev) && status === "error") pushToast("error", "A busca terminou com erro.");
    if (["queued", "running"].includes(prev) && status === "canceled") pushToast("warning", "Busca cancelada.");
    prevStatusRef.current = status;
  }, [status, jobId]);

  useEffect(() => {
    if (!cols.length) {
      setSortKey("");
      return;
    }
    if (!sortKey || !cols.includes(sortKey)) setSortKey(cols[0]);
  }, [cols, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [resultSearch, sortKey, sortDir, rows.length]);

  const progressPct = Math.min(100, Math.round(((loadingStep + 1) / LOADING_STEPS.length) * 100));
  const friendlyError = /500/i.test(error)
    ? "O servidor retornou erro interno. Revise URL do scraper e filtros."
    : "Nao foi possivel concluir a busca com os filtros atuais.";
  const safeMin = Math.max(0, Math.min(parsePositiveInt(areaMin) ?? 0, AREA_CAP));
  const safeMax = Math.max(safeMin, Math.min(parsePositiveInt(areaMax) ?? AREA_CAP, AREA_CAP));
  const drawerOpen = !!drawerMode;

  return (
    <div className="main-content">
      <div className="avaliacao-stack">
        <section className="buscador-card avaliacao-shell">
          <header className="avaliacao-header">
            <div className="avaliacao-header-copy">
              <h2 className="buscador-card-title">Buscador de imoveis</h2>
              <p className="avaliacao-subtitle">Configure filtros, execute em 2-3 cliques e acompanhe o job em tempo real.</p>
            </div>
            <div className="avaliacao-header-status">
              <span className={`avaliacao-status-pill status-${statusTone(status)} ${isLoading ? "is-running" : ""}`}>
                {currentStatusLabel}
              </span>
              <span className="avaliacao-header-time">Ultima atualizacao: {formatDateTime(lastUpdatedAt)}</span>
            </div>
            <div className="avaliacao-header-actions">
              <button type="button" className="avaliacao-btn primary" onClick={() => runJobWithPayload(buildPayloadFromState())} disabled={!canEdit || isLoading}>Iniciar busca</button>
              <button type="button" className="avaliacao-btn" onClick={cancelJob} disabled={!canEdit || !isLoading}>Cancelar</button>
              <button type="button" className="avaliacao-btn" onClick={() => logsJobId && fetchStatus(logsJobId)} disabled={!logsJobId}>Atualizar status</button>
              <button type="button" className="avaliacao-btn" onClick={() => exportXlsx(jobId)} disabled={!canExport}>Baixar XLSX</button>
              <button type="button" className="avaliacao-btn ghost" onClick={() => setDrawerMode("history")}>Historico</button>
              <button type="button" className="avaliacao-btn ghost" onClick={() => setDrawerMode("help")}>Ajuda</button>
            </div>
          </header>

          {!canEdit ? <p className="permission-note">Modo somente leitura.</p> : null}
          {lastJobError ? <div className="avaliacao-inline-error">{lastJobError}</div> : null}

          <div className="avaliacao-layout-grid">
            <aside className="avaliacao-filter-panel">
              <div className="avaliacao-filter-scroll">
                <div className="avaliacao-operacao" role="tablist" aria-label="Operacao">
                  {OPERACAO_TABS.map((item) => (
                    <button key={item.key} type="button" className={`avaliacao-operacao-btn ${operacao === item.key ? "active" : ""}`} onClick={() => setOperacao(item.key)} aria-pressed={operacao === item.key}>{item.label}</button>
                  ))}
                </div>

                <div className="avaliacao-summary-strip">
                  <div className="avaliacao-summary-head">
                    <strong>Resumo da busca</strong>
                    <button type="button" className="avaliacao-link-btn" onClick={clearFilters}>Limpar tudo</button>
                  </div>
                  <div className="avaliacao-chip-list">
                    {chips.length ? chips.map((chip) => (
                      <button key={chip.key} type="button" className="avaliacao-chip" onClick={() => removeChip(chip.key)}>
                        <span>{chip.label}: {chip.value}</span>
                        <span className="avaliacao-chip-x" aria-hidden="true">x</span>
                      </button>
                    )) : <span className="avaliacao-empty-inline">Nenhum filtro aplicado.</span>}
                  </div>
                </div>

                <div className={`avaliacao-accordion ${accordion.localizacao ? "open" : ""}`}>
                  <button type="button" className="avaliacao-accordion-toggle" onClick={() => toggleAccordion("localizacao")} aria-expanded={accordion.localizacao}><span>Localizacao</span><span>{accordion.localizacao ? "-" : "+"}</span></button>
                  <div className="avaliacao-accordion-content"><div className="avaliacao-accordion-inner">
                    <label className="field-label" htmlFor="busca-estado">Estado</label>
                    <select id="busca-estado" className="float-input" value={estado} onChange={(e) => { setEstado(e.target.value); setCidade(""); }}>{STATE_OPTIONS.map(([value, label]) => <option key={value || "empty"} value={value}>{label}</option>)}</select>
                    <label className="field-label" htmlFor="busca-cidade">Cidade</label>
                    <select id="busca-cidade" className="float-input" value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={!estado || cityOptionsLoading}>
                      <option value="">
                        {cityOptionsLoading
                          ? "Carregando cidades..."
                          : estado
                            ? "Selecione a cidade"
                            : "Selecione o estado primeiro"}
                      </option>
                      {cityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                    <label className="field-label" htmlFor="busca-regiao">Regiao</label>
                    <input id="busca-regiao" className="float-input" type="text" placeholder={canUseRegiao ? "Ex: Zona Sul" : "Disponivel apenas para SP ou RJ"} value={regiao} onChange={(e) => setRegiao(e.target.value)} disabled={!canUseRegiao} />
                    <label className="field-label" htmlFor="busca-bairro">Bairro</label>
                    <input id="busca-bairro" className="float-input" type="text" placeholder="Ex: Moema" value={bairro} onChange={(e) => setBairro(e.target.value)} />
                    <label className="field-label" htmlFor="busca-logradouro">Logradouro</label>
                    <input id="busca-logradouro" className="float-input" type="text" placeholder="Rua ou avenida" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
                  </div></div>
                </div>

                <div className={`avaliacao-accordion ${accordion.imovel ? "open" : ""}`}>
                  <button type="button" className="avaliacao-accordion-toggle" onClick={() => toggleAccordion("imovel")} aria-expanded={accordion.imovel}><span>Imovel</span><span>{accordion.imovel ? "-" : "+"}</span></button>
                  <div className="avaliacao-accordion-content"><div className="avaliacao-accordion-inner">
                    <label className="field-label" htmlFor="busca-tipo">Tipo</label>
                    <select id="busca-tipo" className="float-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>{PROPERTY_OPTIONS.map((item) => <option key={item || "empty"} value={item}>{item || "Selecione o tipo"}</option>)}</select>
                    <div className="avaliacao-choice"><span className="field-label">Quartos (multi)</span><div className="avaliacao-choice-group">{["1", "2", "3", "4"].map((item) => <button key={`q-${item}`} type="button" className={`avaliacao-choice-btn ${quartosSelected.includes(item) ? "active" : ""}`} onClick={() => toggleMulti(setQuartosSelected, item)} aria-pressed={quartosSelected.includes(item)}>{item}+</button>)}</div></div>
                    <div className="avaliacao-choice"><span className="field-label">Banheiros (multi)</span><div className="avaliacao-choice-group">{["1", "2", "3", "4"].map((item) => <button key={`b-${item}`} type="button" className={`avaliacao-choice-btn ${banheirosSelected.includes(item) ? "active" : ""}`} onClick={() => toggleMulti(setBanheirosSelected, item)} aria-pressed={banheirosSelected.includes(item)}>{item}+</button>)}</div></div>
                  </div></div>
                </div>

                <div className={`avaliacao-accordion ${accordion.tamanho ? "open" : ""}`}>
                  <button type="button" className="avaliacao-accordion-toggle" onClick={() => toggleAccordion("tamanho")} aria-expanded={accordion.tamanho}><span>Tamanho</span><span>{accordion.tamanho ? "-" : "+"}</span></button>
                  <div className="avaliacao-accordion-content"><div className="avaliacao-accordion-inner">
                    <div className="avaliacao-range-header"><span>Area minima: {safeMin} m2</span><span>Area maxima: {safeMax} m2</span></div>
                    <div className="avaliacao-double-range">
                      <input type="range" min="0" max={AREA_CAP} value={safeMin} onChange={(e) => { const next = Number(e.target.value); setAreaMin(String(next)); if (next > safeMax) setAreaMax(String(next)); }} />
                      <input type="range" min="0" max={AREA_CAP} value={safeMax} onChange={(e) => { const next = Number(e.target.value); setAreaMax(String(next)); if (next < safeMin) setAreaMin(String(next)); }} />
                    </div>
                    <div className="avaliacao-range-inputs">
                      <div><label className="field-label" htmlFor="busca-area-min">Area min</label><input id="busca-area-min" className="float-input" type="number" min="0" value={areaMin} placeholder="0" onChange={(e) => setAreaMin(e.target.value)} /></div>
                      <div><label className="field-label" htmlFor="busca-area-max">Area max</label><input id="busca-area-max" className="float-input" type="number" min="0" value={areaMax} placeholder={String(AREA_CAP)} onChange={(e) => setAreaMax(e.target.value)} /></div>
                    </div>
                  </div></div>
                </div>

                <div className={`avaliacao-accordion ${accordion.avancado ? "open" : ""}`}>
                  <button type="button" className="avaliacao-accordion-toggle" onClick={() => toggleAccordion("avancado")} aria-expanded={accordion.avancado}><span>Avancado</span><span>{accordion.avancado ? "-" : "+"}</span></button>
                  <div className="avaliacao-accordion-content"><div className="avaliacao-accordion-inner">
                    <label className="field-label" htmlFor="busca-url">URL do scraper</label>
                    <input id="busca-url" className="float-input" value={searchUrl} readOnly />
                    <label className="avaliacao-toggle"><input type="checkbox" checked={headless} onChange={(e) => setHeadless(e.target.checked)} /><span>Executar em modo headless</span></label>
                    <button type="button" className="avaliacao-btn subtle" onClick={() => lastJob?.payload && runJobWithPayload({ ...lastJob.payload })} disabled={!canEdit || !lastJob?.payload}>Reexecutar ultima busca</button>
                  </div></div>
                </div>
              </div>
            </aside>

            <section className="avaliacao-results-panel">
              <div className="avaliacao-results-head">
                <div className="avaliacao-results-meta">
                  <span className={`avaliacao-status-pill status-${statusTone(status)} ${isLoading ? "is-running" : ""}`}>{currentStatusLabel}</span>
                  <span>{jobId ? `Job #${jobId}` : "Sem job ativo"}</span>
                  {jobId ? <span>Itens: {rows.length || "-"}</span> : null}
                </div>
                <button type="button" className="avaliacao-btn" onClick={() => setLogsOpen((prev) => !prev)} disabled={!logsJobId}>{logsOpen ? "Ocultar logs" : "Ver logs"}</button>
              </div>

              {error ? (
                <div className="avaliacao-alert error">
                  <div className="avaliacao-alert-icon">!</div>
                  <div className="avaliacao-alert-copy">
                    <strong>Ocorreu um erro ao buscar</strong>
                    <p>{friendlyError}</p>
                    <p className="avaliacao-alert-hint">Sugestao: verifique URL do scraper, estado e cidade.</p>
                    <div className="avaliacao-alert-actions">
                      <button type="button" className="avaliacao-btn" onClick={() => runJobWithPayload(buildPayloadFromState())} disabled={!canEdit}>Tentar novamente</button>
                      <button type="button" className="avaliacao-btn ghost" onClick={() => setShowErrorDetails((prev) => !prev)}>{showErrorDetails ? "Ocultar detalhes" : "Ver detalhes"}</button>
                    </div>
                    {showErrorDetails ? <pre className="avaliacao-alert-details">{String(error)}</pre> : null}
                  </div>
                </div>
              ) : null}

              {isLoading ? (
                <div className="avaliacao-loading-card">
                  <div className="avaliacao-loading-top"><div className="avaliacao-loading-title">Buscando imoveis...</div><div className="avaliacao-loading-pct">{progressPct}%</div></div>
                  <div className="avaliacao-loading-bar"><span style={{ width: `${progressPct}%` }} /></div>
                  <div className="avaliacao-loading-steps">{LOADING_STEPS.map((step, index) => <div key={step} className={`avaliacao-loading-step ${index === loadingStep ? "active" : index < loadingStep ? "done" : ""}`}>{step}</div>)}</div>
                  <div className="avaliacao-skeleton-grid"><div className="avaliacao-skeleton" /><div className="avaliacao-skeleton" /><div className="avaliacao-skeleton" /></div>
                </div>
              ) : null}

              {!isLoading && cols.length === 0 && !raw && !error ? (
                <div className="avaliacao-empty-state">
                  <div className="avaliacao-empty-illustration" aria-hidden="true"><span /><span /><span /></div>
                  <h3>Nenhum resultado para exibir</h3>
                  <p>Defina filtros e clique em Iniciar busca para preencher o preview.</p>
                  <button type="button" className="avaliacao-btn primary" onClick={() => runJobWithPayload(buildPayloadFromState())} disabled={!canEdit}>Iniciar busca</button>
                </div>
              ) : null}

              {!isLoading && (cols.length > 0 || raw) ? (
                <div className="avaliacao-preview-panel">
                  <div className="avaliacao-preview-toolbar">
                    <div className="avaliacao-preview-tools">
                      <input className="float-input compact" type="text" placeholder="Buscar no resultado" value={resultSearch} onChange={(e) => setResultSearch(e.target.value)} />
                      <select className="float-input compact" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>{cols.map((col) => <option key={col} value={col}>{`Ordenar: ${col}`}</option>)}</select>
                      <button type="button" className="avaliacao-btn" onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}>{sortDir === "asc" ? "A-Z" : "Z-A"}</button>
                    </div>
                    <div className="avaliacao-preview-count">{filteredRows.length} itens</div>
                  </div>
                  {cols.length === 0 && raw ? <pre className="avaliacao-preview-raw">{JSON.stringify(raw, null, 2)}</pre> : null}
                  {cols.length > 0 ? (
                    <div className="avaliacao-preview-table-wrap">
                      <table className="avaliacao-preview-table">
                        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>{pagedRows.map((row, rowIndex) => <tr key={`${rowIndex}-${pageSafe}`}>{cols.map((col) => <td key={`${col}-${rowIndex}`}>{String(row?.[col] ?? "")}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  ) : null}
                  {cols.length > 0 ? (
                    <div className="avaliacao-pagination">
                      <button type="button" className="avaliacao-btn" disabled={pageSafe <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Anterior</button>
                      <span>{`Pagina ${pageSafe} de ${totalPages}`}</span>
                      <button type="button" className="avaliacao-btn" disabled={pageSafe >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>Proxima</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={`avaliacao-logs-panel ${logsOpen ? "open" : ""}`}>
                <div className="avaliacao-logs-head">
                  <strong>Logs e detalhes</strong>
                  <button type="button" className="avaliacao-btn" onClick={() => fetchLogs(logsJobId)} disabled={!logsJobId || logsLoading}>{logsLoading ? "Atualizando..." : "Atualizar logs"}</button>
                </div>
                {logsOpen ? (
                  <div className="avaliacao-logs-body">
                    {logsError ? <div className="avaliacao-inline-error">{logsError}</div> : null}
                    {logsLoading ? <div className="avaliacao-empty-inline">Carregando logs...</div> : logs.length ? (
                      <div className="avaliacao-logs-list">
                        {logs.map((log, idx) => <div key={`${log.created_at || ""}-${idx}`} className="avaliacao-log-item"><span className="avaliacao-log-time">{formatDateTime(log.created_at)}</span><span className="avaliacao-log-text">{log.message}</span></div>)}
                      </div>
                    ) : <div className="avaliacao-empty-inline">Nenhum log disponivel.</div>}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>

      {drawerOpen ? <button type="button" className="avaliacao-drawer-backdrop" onClick={() => setDrawerMode("")} /> : null}
      <aside className={`avaliacao-drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="avaliacao-drawer-header">
          <h3>{drawerMode === "history" ? "Historico de buscas" : "Como buscar"}</h3>
          <button type="button" className="avaliacao-btn ghost" onClick={() => setDrawerMode("")}>Fechar</button>
        </div>
        {drawerMode === "history" ? (
          <div className="avaliacao-history-list">
            {lastJobLoading ? <div className="avaliacao-empty-inline">Atualizando historico...</div> : null}
            {!history.length ? <div className="avaliacao-empty-inline">Nenhuma busca registrada.</div> : history.map((item) => (
              <article key={item.job_id} className="avaliacao-history-item">
                <div className="avaliacao-history-top">
                  <span className={`avaliacao-status-pill status-${statusTone(item.status)}`}>{STATUS_LABELS[item.status] || item.status}</span>
                  <span>{`Job #${item.job_id}`}</span>
                </div>
                <div className="avaliacao-history-meta">{formatDateTime(item.created_at)} - {item.total_rows ?? 0} itens</div>
                <div className="avaliacao-history-actions">
                  <button type="button" className="avaliacao-btn" onClick={() => applyPayloadToFilters(item.payload)}>Aplicar filtros</button>
                  <button type="button" className="avaliacao-btn primary" disabled={!canEdit || !item.payload} onClick={() => runJobWithPayload({ ...item.payload })}>Reexecutar</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {drawerMode === "help" ? (
          <div className="avaliacao-help-list">
            {["1. Ajuste localizacao, tipo e area no accordion.", "2. Clique em Iniciar busca e acompanhe o status.", "3. Use historico para reexecutar em 1 clique."].map((item) => <div key={item} className="avaliacao-help-item">{item}</div>)}
          </div>
        ) : null}
      </aside>

      <div className="avaliacao-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => <div key={toast.id} className={`avaliacao-toast ${toast.type}`}>{toast.message}</div>)}
      </div>
    </div>
  );
}

