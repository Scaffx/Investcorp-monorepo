import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = ""; // com proxy do Vite: /api/... vai para o Django

const DEFAULT_URL =
  "https://www.vivareal.com.br/venda/sp/sao-paulo/apartamento_residencial/";

const AVALIACAO_SECTIONS = [
  {
    key: "buscador",
    label: "Buscador de imoveis",
    title: "Buscador de imoveis",
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

export default function Avaliacao({ permissions }) {
  const canEdit = !!permissions?.editar;
  const [section, setSection] = useState(AVALIACAO_SECTIONS[0].key);

  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [operacao, setOperacao] = useState("venda");
  const [tipo, setTipo] = useState("");
  const [regiao, setRegiao] = useState("");
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

  async function startJob() {
    if (!canEdit) return;

    setError("");
    setPreview(null);
    setStatus("queued");
    setLoadingStep(0);
    const payload = {
      operacao,
      estado,
      cidade,
      tipo,
      regiao,
      quartos,
      banheiros,
      areaMin,
      areaMax,
      logradouro,
      headless,
      retry_visible: true,
    };

    const data = await apiJson("/api/lastro/jobs/", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    setJobId(data.job_id);
  }

  async function fetchStatusAndLogs(id) {
    const st = await apiJson(`/api/lastro/jobs/${id}/?preview=20`);
    setStatus(st.status || "-");
    setPreview(st.preview || null);

    return st.status;
  }

  useEffect(() => {
    if (!jobId) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(async () => {
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
    }, 2000);

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

  function exportXlsx() {
    if (!canEdit || !jobId) return;
    window.location.href = `/api/lastro/jobs/${jobId}/export.xlsx`;
  }

  return (
    <div className="avaliacao-layout">
      <aside className="sidebar">
        <nav className="sidebar-menu">
          {AVALIACAO_SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`menu-item ${section === item.key ? "active" : ""}`}
              onClick={() => setSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <div className="avaliacao-stack">
          <section className="buscador-card">
            <div className="buscador-card-header">
              <h2 className="buscador-card-title">Buscador de imoveis</h2>
            </div>
            <div className="avaliacao-body">
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
                      placeholder="URL gerada pelos filtros"
                    />
                    <div className="avaliacao-headless">Headless ativo</div>
                    <button
                      type="button"
                      className="avaliacao-search-btn"
                      onClick={startJob}
                      disabled={!canEdit || isLoading}
                    >
                      Iniciar pesquisa
                    </button>
                  </div>
                </div>
              </aside>

              <section className="avaliacao-results">
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
                    onClick={exportXlsx}
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
                </div>
              </section>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
