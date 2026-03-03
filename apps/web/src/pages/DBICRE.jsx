import React, { useMemo, useState } from "react";
import { Section, SearchBar, Placeholder } from "../ui";

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos os status" },
  { value: "livre", label: "Livre" },
  { value: "ocupado", label: "Ocupado" },
  { value: "em-aguardo", label: "Em aguardo" },
];

const TYPE_OPTIONS = [
  "",
  "Apartamento",
  "Casa",
  "Cobertura",
  "Comercial",
  "Galpao",
  "Terreno",
  "Sitio",
];

const UF_OPTIONS = [
  "",
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

export default function DBICRE({ permissions }) {
  const canEdit = !!permissions?.editar;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("");
  const [uf, setUf] = useState("");
  const [cidade, setCidade] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const resultCountLabel = useMemo(() => {
    if (!hasSearched) return "Aguardando pesquisa";
    if (isSearching) return "Buscando no banco...";
    if (!results.length) return "Nenhum resultado";
    return `${results.length} resultado${results.length === 1 ? "" : "s"}`;
  }, [hasSearched, isSearching, results.length]);

  const handleSearch = async () => {
    setHasSearched(true);
    setIsSearching(true);
    try {
      // TODO: integrar com API do DBICRE
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("todos");
    setTypeFilter("");
    setUf("");
    setCidade("");
    setValorMin("");
    setValorMax("");
    setAreaMin("");
    setAreaMax("");
    setHasSearched(false);
    setResults([]);
  };

  return (
    <div className="dbicre-page">
      <Section title="Requisicao DBICRE" wide>
        <div className="dbicre-header">
          <div>
            <h2>Requisicao imediata ao banco</h2>
            <p>Preencha os filtros e pesquise o que precisa no banco de dados.</p>
          </div>
          {!canEdit && <span className="dbicre-readonly">Somente leitura</span>}
        </div>

        <div className="dbicre-request">
          <div className="dbicre-request-panel">
            <SearchBar
              placeholder="Pesquisar por endereco, tipo, status, cliente ou codigo"
              value={query}
              onChange={setQuery}
              onSubmit={handleSearch}
            />

            <div className="dbicre-filter-grid">
              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-status-filter">
                  Status
                </label>
                <select
                  id="dbicre-status-filter"
                  className="float-input dbicre-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-type-filter">
                  Tipo
                </label>
                <select
                  id="dbicre-type-filter"
                  className="float-input dbicre-filter-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt || "all"} value={opt}>
                      {opt || "Todos os tipos"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-uf-filter">
                  UF
                </label>
                <select
                  id="dbicre-uf-filter"
                  className="float-input dbicre-filter-select"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                >
                  {UF_OPTIONS.map((opt) => (
                    <option key={opt || "all"} value={opt}>
                      {opt || "Todos"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-city-filter">
                  Cidade
                </label>
                <input
                  id="dbicre-city-filter"
                  className="float-input"
                  type="text"
                  placeholder="Ex: Sao Paulo"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>

              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-valor-min">
                  Valor minimo (R$)
                </label>
                <input
                  id="dbicre-valor-min"
                  className="float-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={valorMin}
                  onChange={(e) => setValorMin(e.target.value)}
                />
              </div>

              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-valor-max">
                  Valor maximo (R$)
                </label>
                <input
                  id="dbicre-valor-max"
                  className="float-input"
                  type="number"
                  min="0"
                  placeholder="Ex: 1000000"
                  value={valorMax}
                  onChange={(e) => setValorMax(e.target.value)}
                />
              </div>

              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-area-min">
                  Area minima (m2)
                </label>
                <input
                  id="dbicre-area-min"
                  className="float-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={areaMin}
                  onChange={(e) => setAreaMin(e.target.value)}
                />
              </div>

              <div className="dbicre-filter-card">
                <label className="dbicre-filter-label" htmlFor="dbicre-area-max">
                  Area maxima (m2)
                </label>
                <input
                  id="dbicre-area-max"
                  className="float-input"
                  type="number"
                  min="0"
                  placeholder="Ex: 500"
                  value={areaMax}
                  onChange={(e) => setAreaMax(e.target.value)}
                />
              </div>
            </div>

            <div className="dbicre-filter-actions">
              <button type="button" className="dbicre-clear-btn" onClick={clearFilters}>
                Limpar filtros
              </button>
              <span className="dbicre-filter-hint">
                A consulta sera executada ao clicar em Buscar.
              </span>
            </div>
          </div>

          <div className="dbicre-results-card">
            <div className="dbicre-results-head">
              <h3>Resultado da pesquisa</h3>
              <span className="dbicre-results-meta">{resultCountLabel}</span>
            </div>

            {isSearching ? (
              <div className="dbicre-results-loading">Buscando no banco de dados...</div>
            ) : null}

            {!isSearching && hasSearched && results.length === 0 ? (
              <Placeholder>Nenhum imovel encontrado com esses filtros.</Placeholder>
            ) : null}

            {!isSearching && !hasSearched ? (
              <div className="dbicre-results-empty">
                <strong>Pronto para pesquisar</strong>
                <span>Use os filtros acima e clique em Buscar para consultar o banco.</span>
              </div>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  );
}
