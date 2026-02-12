import React, { useEffect, useState } from "react";
import CadastrarPage from "./Cadastrar";
import ConsultarEditarPage from "./Consultar_editar";
import RelatorioPage from "./Relatorio";
import { deriveSlaInputValue } from "../helpers";
import "../styles/global.css";
export const PROSPECCAO_SECTIONS = [
  { key: "cadastrar", label: "Cadastrar", permission: "cadastrar" },
  { key: "consultar", label: "Consultar e Editar", permission: "consultar" },
  { key: "relatorio", label: "Relatorio", permission: "relatorio" },
];

export default function Prospecao({ permissions, activeKey, onSelect }) {
  const perms = permissions || {};
  const allowedPages = PROSPECCAO_SECTIONS.filter((item) => perms[item.permission]).map(
    (item) => item.key
  );
  const page = allowedPages.includes(activeKey) ? activeKey : allowedPages[0] || "cadastrar";
  const [queryConsultar, setQueryConsultar] = useState("");
  const [queryConsultarB, setQueryConsultarB] = useState("");
  const [registros, setRegistros] = useState(() => {
    try {
      const raw = localStorage.getItem("cad-registros");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!allowedPages.length) return;
    if (!allowedPages.includes(activeKey)) {
      onSelect?.(allowedPages[0]);
    }
  }, [allowedPages, activeKey, onSelect]);

  const persistRegistros = (next) => {
    setRegistros(next);
    localStorage.setItem("cad-registros", JSON.stringify(next));
  };

  // Ajusta registros antigos para incluir createdAt/concluidoEm e normalizar o SLA em data
  useEffect(() => {
    setRegistros((curr) => {
      const nowIso = new Date().toISOString();
      const upgraded = curr.map((r) => {
        const normalizedSla = deriveSlaInputValue(r);
        return {
          ...r,
          createdAt: r.createdAt || nowIso,
          concluidoEm: r.concluidoEm || null,
          slaDias: normalizedSla,
        };
      });
      const changed = upgraded.some((item, idx) => {
        const original = curr[idx];
        return (
          item.createdAt !== original.createdAt ||
          item.concluidoEm !== original.concluidoEm ||
          item.slaDias !== original.slaDias
        );
      });
      if (changed) {
        localStorage.setItem("cad-registros", JSON.stringify(upgraded));
      }
      return changed ? upgraded : curr;
    });
  }, []);

  const handleAddRegistro = (registro) => {
    if (!perms.cadastrar) return;
    const status = registro.status || "AGUARDANDO AGENDAMENTO";
    const nowIso = new Date().toISOString();
    const next = [
      ...registros,
      {
        ...registro,
        status,
        id: Date.now(),
        createdAt: registro.createdAt || nowIso,
        concluidoEm: registro.concluidoEm ?? null,
      },
    ];
    persistRegistros(next);
  };

  const handleUpdateRegistro = (id, patch, remove = false) => {
    if (remove && !perms.excluir) return;
    if (!remove && !perms.editar) return;
    if (remove) {
      const next = registros.filter((r) => r.id !== id);
      persistRegistros(next);
      return;
    }
    const next = registros.map((r) => (r.id === id ? { ...r, ...patch } : r));
    persistRegistros(next);
  };

  const handleRelatorioDownload = () => {
    if (!perms.relatorio) return;
    alert("Baixar relatorio consolidado da base (placeholder).");
  };

  if (!allowedPages.length) {
    return (
      <div className="page access-denied">
        <h1>Acesso negado</h1>
        <p>Seu cargo nao possui permissao para esta area.</p>
      </div>
    );
  }

  return (
    <div className="main-content">
      {page === "cadastrar" && <CadastrarPage onSave={handleAddRegistro} canCreate={!!perms.cadastrar} />}

      {page === "consultar" && (
        <ConsultarEditarPage
          query={queryConsultar}
          queryB={queryConsultarB}
          onQueryChange={setQueryConsultar}
          onQueryBChange={setQueryConsultarB}
          registros={registros}
          onUpdate={handleUpdateRegistro}
          permissions={{
            editar: !!perms.editar,
            excluir: !!perms.excluir,
            agendar: !!perms.agendar,
            custos: !!perms.custos,
          }}
        />
      )}
      {page === "relatorio" && <RelatorioPage onDownload={handleRelatorioDownload} />}
    </div>
  );
}
