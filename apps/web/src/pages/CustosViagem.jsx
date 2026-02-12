import React, { useEffect, useState } from "react";
import { Section, Placeholder } from "../ui";
import "../styles/custosViagem.css";
import { formatDateBR, parseDateValue } from "../helpers";

const COST_CATEGORIES = ["AEREO", "HOTEL", "CARRO", "REEMBOLSO", "OUTROS"];
const formatCurrencyBRL = (digits) => {
  const number = Number(digits || 0) / 100;
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const digitsFromCurrency = (value = "") => (value.match(/\d/g)?.join("") || "").replace(/^0+/, "") || "0";

export default function CustosViagemPage({ registro, onCancel, onSave }) {
  const [custos, setCustos] = useState({});

  useEffect(() => {
    if (!registro) {
      setCustos({});
      return;
    }
    if (registro.custosItens) {
      setCustos(registro.custosItens);
      return;
    }
    // retrocompatibilidade: coloca custo antigo em OUTROS
    if (registro.custosValor || registro.custosData || registro.custosDetalhes) {
      setCustos({
        OUTROS: {
          added: true,
          valor: registro.custosValor || "",
          data: registro.custosData || "",
          detalhes: registro.custosDetalhes || "",
        },
      });
    } else {
      setCustos({});
    }
  }, [registro?.id]);

  if (!registro) {
    return (
      <Section title="Custos da Viagem" wide>
        <Placeholder>Nenhum registro selecionado.</Placeholder>
      </Section>
    );
  }

  const updateCost = (cat, patch) => {
    setCustos((curr) => ({
      ...curr,
      [cat]: { added: true, ...(curr[cat] || {}), ...patch },
    }));
  };

  const removeCost = (cat) => {
    setCustos((curr) => {
      const copy = { ...curr };
      delete copy[cat];
      return copy;
    });
  };

  const activeCats = COST_CATEGORIES.filter((c) => custos[c]?.added);
  const allValid =
    activeCats.every((c) => {
      const item = custos[c];
      const hasContent = (item?.valor || "").trim() || (item?.data || "").trim() || (item?.detalhes || "").trim();
      if (!hasContent) return true; // permite salvar mesmo sem valor adicionado
      return digitsFromCurrency(item?.valor) !== "0" && parseDateValue(item?.data);
    });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!allValid) return;
    onSave?.({
      custosItens: custos,
      status: "CUSTOS PENDENTES",
    });
  };

  return (
    <Section title="Custos da Viagem" wide>
      <div className="optional-search" style={{ marginBottom: 12 }}>
        <div><strong>Cliente:</strong> {registro.cliente || "-"}</div>
        <div><strong>Pedido:</strong> {registro.pedido || "-"}</div>
        <div><strong>Status atual:</strong> {registro.status || "-"}</div>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        {COST_CATEGORIES.map((cat) => {
          const item = custos[cat];
          if (!item?.added) {
            return (
              <div className="float-group" key={cat}>
                <button
                  type="button"
                  className="agency-add"
                  onClick={() => updateCost(cat, { added: true, valor: "", data: "", detalhes: "" })}
                >
                  Adicionar custo de {cat.toLowerCase()}?
                </button>
              </div>
            );
          }

          return (
            <div className="float-group" key={cat}>
              <div className="input-with-delete" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label" htmlFor={`custo-${cat}-valor`}>{cat}</label>
                  <input
                    id={`custo-${cat}-valor`}
                    className="float-input"
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyBRL(digitsFromCurrency(item.valor || ""))}
                    onChange={(e) => {
                      const digits = digitsFromCurrency(e.target.value);
                      updateCost(cat, { valor: formatCurrencyBRL(digits) });
                    }}
                  />
                  <div style={{ height: 10 }} />
                  <textarea
                    id={`custo-${cat}-det`}
                    className="float-input"
                    style={{ minHeight: 80, resize: "vertical" }}
                    placeholder="Adicione os detalhes do custo"
                    value={item.detalhes || ""}
                    onChange={(e) => updateCost(cat, { detalhes: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="input-delete"
                  onClick={() => removeCost(cat)}
                  aria-label={`Remover custo ${cat}`}
                >
                  Remover
                </button>
              </div>
            </div>
          );
        })}

        <div className="form-send-row" style={{ gridColumn: "1 / span 2", justifyContent: "space-between" }}>
          <button type="button" className="table-btn" onClick={onCancel}>Voltar</button>
          <button type="submit" className={`send-button ${!allValid ? "is-disabled" : ""}`} disabled={!allValid}>
            <span className="send-button__text">Salvar custos</span>
            <span className="send-button__icon" aria-hidden="true">
              <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor">
                <path d="m476.59 227.05-.16-.07L49.35 49.84A23.56 23.56 0 0 0 27.14 52 24.65 24.65 0 0 0 16 72.59v113.29a24 24 0 0 0 19.52 23.57l232.93 43.07a4 4 0 0 1 0 7.86L35.53 303.45A24 24 0 0 0 16 327v113.31A23.57 23.57 0 0 0 26.59 460a23.94 23.94 0 0 0 13.22 4 24.55 24.55 0 0 0 9.52-1.93L476.4 285.94l.19-.09a32 32 0 0 0 0-58.8z" />
              </svg>
            </span>
          </button>
        </div>
      </form>
    </Section>
  );
}
