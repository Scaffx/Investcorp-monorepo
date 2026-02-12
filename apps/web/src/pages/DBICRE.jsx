import React, { useEffect, useMemo, useState } from "react";
import { Section, SearchBar, Placeholder } from "../ui";

const STORAGE_KEY = "dbicre-imoveis-v2";

const seedImoveis = [
  {
    id: 1,
    endereco: "Rua das Palmeiras, 120 - Centro",
    tipo: "Apartamento",
    valor: 420000,
    status: "LIVRE",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: 2,
    endereco: "Av. Paulista, 900 - Bela Vista",
    tipo: "Comercial",
    valor: 980000,
    status: "OCUPADO",
    cliente: "Itau",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
  },
  {
    id: 3,
    endereco: "Rua do Sol, 45 - Jardim",
    tipo: "Casa",
    valor: 650000,
    status: "EM AGUARDO",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
  {
    id: 4,
    endereco: "Av. Atlantica, 2100 - Copacabana",
    tipo: "Apartamento",
    valor: 1200000,
    status: "OCUPADO",
    cliente: "Santander",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
  },
  {
    id: 5,
    endereco: "Rua das Acacias, 18 - Zona Sul",
    tipo: "Terreno",
    valor: 310000,
    status: "LIVRE",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
  },
  {
    id: 6,
    endereco: "Alameda Santos, 560 - Jardins",
    tipo: "Comercial",
    valor: 1650000,
    status: "OCUPADO",
    cliente: "Bradesco",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
  },
  {
    id: 7,
    endereco: "Rua das Flores, 302 - Centro",
    tipo: "Casa",
    valor: 540000,
    status: "EM AGUARDO",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
  },
  {
    id: 8,
    endereco: "Estrada do Campo, 500 - Rural",
    tipo: "Sitio",
    valor: 750000,
    status: "LIVRE",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString(),
  },
  {
    id: 9,
    endereco: "Av. Brasil, 4000 - Norte",
    tipo: "Galpao",
    valor: 2300000,
    status: "OCUPADO",
    cliente: "Banco do Brasil",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
  },
];

const normalize = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
};

const formatTempo = (createdAt, now) => {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "-";
  const diffMs = Math.max(0, now - created.getTime());
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? "dia" : "dias"}`;
  }
  const months = Math.floor(diffDays / 30);
  const days = diffDays % 30;
  const monthLabel = months === 1 ? "mes" : "meses";
  if (!days) return `${months} ${monthLabel}`;
  const dayLabel = days === 1 ? "dia" : "dias";
  return `${months} ${monthLabel} ${days} ${dayLabel}`;
};

const getStatusKey = (status) => {
  const key = normalize(status || "");
  if (key === "ocupada") return "ocupado";
  return key;
};

const isOccupied = (status) => getStatusKey(status) === "ocupado";

const loadImoveis = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seedImoveis));
  return seedImoveis;
};

export default function DBICRE({ permissions }) {
  const canEdit = !!permissions?.editar;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [imoveis, setImoveis] = useState(() => loadImoveis());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY) {
        setImoveis(loadImoveis());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return imoveis.filter((item) => {
      const statusKey = getStatusKey(item.status);
      const matchesStatus = statusFilter === "todos" ? true : statusKey === statusFilter;
      if (!matchesStatus) return false;
      if (!term) return true;
      const blob = normalize(
        `${item.endereco} ${item.tipo} ${item.status} ${item.cliente || ""} ${item.valor} ${item.createdAt}`
      );
      return blob.includes(term);
    });
  }, [imoveis, query, statusFilter]);

  const showClienteColumn = useMemo(() => filtered.some((item) => isOccupied(item.status)), [filtered]);

  return (
    <div className="dbicre-page">
      <Section title="Painel DBICRE" wide>
        <div className="dbicre-header">
          <div>
            <h2>Banco de dados em tempo real</h2>
            <p>Imoveis atualizados conforme sao inseridos no DBICRE.</p>
          </div>
          {!canEdit && <span className="dbicre-readonly">Somente leitura</span>}
        </div>

        <div className="dbicre-filters">
          <SearchBar
            placeholder="Pesquisar por endereco, tipo, status, cliente ou valor"
            value={query}
            onChange={setQuery}
            onSubmit={() => {}}
          />
          <div className="dbicre-filters-row">
            <div className="float-group dbicre-filter">
              <label className="dbicre-filter-label" htmlFor="dbicre-status-filter">
                Status
              </label>
              <select
                id="dbicre-status-filter"
                className="float-input dbicre-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="todos">Todos os status</option>
                <option value="livre">Livre</option>
                <option value="ocupado">Ocupado</option>
                <option value="em-aguardo">Em aguardo</option>
              </select>
            </div>
          </div>
        </div>

        {!filtered.length ? (
          <Placeholder>Nenhum imovel encontrado.</Placeholder>
        ) : (
          <div className="dbicre-table-wrap">
            <table className="dbicre-table">
              <thead>
                <tr>
                  <th>Endereco</th>
                  <th>Tipo imovel</th>
                  <th>Valor</th>
                  <th>Status</th>
                  {showClienteColumn && <th>Cliente</th>}
                  <th>Tempo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{item.endereco || "-"}</td>
                    <td>{item.tipo || "-"}</td>
                    <td>{formatMoney(item.valor)}</td>
                    <td>
                      <span
                        className={`dbicre-status dbicre-status--${getStatusKey(item.status).replace(/\s+/g, "-")}`}
                      >
                        {item.status || "-"}
                      </span>
                    </td>
                    {showClienteColumn && (
                      <td>{isOccupied(item.status) ? item.cliente || "-" : "-"}</td>
                    )}
                    <td>{formatTempo(item.createdAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
