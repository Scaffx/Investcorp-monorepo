import React, { useEffect, useMemo } from "react";

export const FINANCE_SECTIONS = [
  {
    key: "contas",
    label: "Contas",
    title: "Contas",
    description: "Controle de contas a pagar e a receber.",
  },
  {
    key: "emissao-nota",
    label: "Emissao de nota fiscal",
    title: "Emissao de nota fiscal",
    description: "Geracao e gerenciamento de notas fiscais.",
  },
  {
    key: "relatorios",
    label: "Relatorios Financeiros",
    title: "Relatorios Financeiros",
    description: "Relatorios consolidados do financeiro.",
  },
];

export default function Financeiro({ permissions, activeKey, onSelect }) {
  const canEdit = !!permissions?.editar;
  const resolvedKey = FINANCE_SECTIONS.some((item) => item.key === activeKey)
    ? activeKey
    : FINANCE_SECTIONS[0].key;
  const active = useMemo(
    () => FINANCE_SECTIONS.find((item) => item.key === resolvedKey) || FINANCE_SECTIONS[0],
    [resolvedKey]
  );
  const showContas = resolvedKey === "contas";
  const contasPagar = [];
  const contasReceber = [];

  useEffect(() => {
    if (!FINANCE_SECTIONS.some((item) => item.key === activeKey)) {
      onSelect?.(FINANCE_SECTIONS[0].key);
    }
  }, [activeKey, onSelect]);

  return (
    <div className="main-content">
      {showContas ? (
        <div className="financeiro-stack">
          <section className="financeiro-card">
            <div className="financeiro-card-header">
              <h2 className="financeiro-card-title">Contas a pagar</h2>
            </div>
            <div className="financeiro-table">
              <div className="financeiro-row financeiro-row-head">
                <span>Recebedor</span>
                <span>Valor</span>
                <span>Data de vencimento</span>
              </div>
              {contasPagar.length === 0 ? (
                <div className="financeiro-empty">Nenhuma conta cadastrada.</div>
              ) : (
                contasPagar.map((item) => (
                  <div className="financeiro-row" key={item.id}>
                    <span>{item.recebedor}</span>
                    <span>{item.valor}</span>
                    <span>{item.vencimento}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="financeiro-card">
            <div className="financeiro-card-header">
              <h2 className="financeiro-card-title">Contas a receber</h2>
            </div>
            <div className="financeiro-table">
              <div className="financeiro-row financeiro-row-head">
                <span>Pagador</span>
                <span>Valor</span>
                <span>Data de recebimento</span>
              </div>
              {contasReceber.length === 0 ? (
                <div className="financeiro-empty">Nenhuma conta cadastrada.</div>
              ) : (
                contasReceber.map((item) => (
                  <div className="financeiro-row" key={item.id}>
                    <span>{item.pagador}</span>
                    <span>{item.valor}</span>
                    <span>{item.recebimento}</span>
                  </div>
                ))
              )}
            </div>
          </section>
          {!canEdit && <p className="permission-note">Modo somente leitura.</p>}
        </div>
      ) : (
        <div className="page">
          <h1>{active.title}</h1>
          <p>{active.description}</p>
          {!canEdit && <p className="permission-note">Modo somente leitura.</p>}
        </div>
      )}
    </div>
  );
}
