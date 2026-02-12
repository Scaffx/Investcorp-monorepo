import React, { useEffect, useMemo, useState } from "react";
import "../styles/Renegociacao.css";

const API_BASE = ""; // com proxy do Vite: /api/... vai para o Django
const RULES_STORAGE_KEY = "renegociacao-rules-v1";

export const RENEGOCIACAO_SECTIONS = [
  { key: "gerar", label: "Gerador de Excel" },
  { key: "backend", label: "Backend" },
  { key: "historico", label: "Ultimas atualizacoes" },
];

export default function Renegociacao({ permissions, activeKey = "gerar" }) {
  const canEdit = !!permissions?.editar;
  const [reportType, setReportType] = useState("tim");
  const [rulesetTim, setRulesetTim] = useState("");
  const [rulesetBradesco, setRulesetBradesco] = useState("");
  const [rulesetClaroRenov, setRulesetClaroRenov] = useState("");
  const [rulesetClaroDistr, setRulesetClaroDistr] = useState("");
  const [fileRelneg, setFileRelneg] = useState(null);
  const [fileModeloTim, setFileModeloTim] = useState(null);
  const [fileRefRenov, setFileRefRenov] = useState(null);
  const [fileRefDistr, setFileRefDistr] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [activeRule, setActiveRule] = useState(null);
  const [ruleTexts, setRuleTexts] = useState({});
  const [ruleSaveMessage, setRuleSaveMessage] = useState("");
  const resolvedKey = useMemo(() => {
    return RENEGOCIACAO_SECTIONS.some((item) => item.key === activeKey) ? activeKey : "gerar";
  }, [activeKey]);

  const fakeUpdates = [
    { id: 1, when: "Hoje 10:42", who: "Murillo", desc: "Atualizou regras TIM (345 itens)" },
    { id: 2, when: "Ontem 18:10", who: "Admin", desc: "Ativou revisao antiga Bradesco (120 itens)" },
    { id: 3, when: "02/02 09:11", who: "Murillo", desc: "Criou RuleSet Claro Renovacao" },
  ];

  const rulesetButtons = [
    { key: "bradesco", label: "Regras Bradesco" },
    { key: "casas-bahia", label: "Regras Casas Bahia" },
    { key: "claro", label: "Regras Claro" },
    { key: "tim", label: "Regras Tim" },
  ];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RULES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          setRuleTexts(parsed);
        }
      }
    } catch (err) {
      console.warn("Falha ao carregar regras salvas:", err);
    }
  }, []);

  const handleSaveRules = (key) => {
    try {
      const payload = { ...ruleTexts };
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(payload));
      setRuleSaveMessage(`Regras salvas para ${key}.`);
    } catch (err) {
      setRuleSaveMessage("Nao foi possivel salvar as regras.");
    }
  };

  const isTim = reportType === "tim";
  const isBradesco = reportType === "bradesco";
  const isClaro = reportType === "claro_merge";
  const canSubmitTim = rulesetTim && fileRelneg && fileModeloTim;
  const canSubmitBradesco = rulesetBradesco && fileRelneg;
  const canSubmitClaro =
    rulesetClaroRenov && rulesetClaroDistr && fileRelneg && fileRefRenov && fileRefDistr;
  const canSubmit =
    canEdit &&
    !isSubmitting &&
    (isTim ? canSubmitTim : isBradesco ? canSubmitBradesco : canSubmitClaro);

  const resetMessages = () => {
    setSubmitError("");
    setSubmitSuccess("");
  };

  const extractFilename = (disposition, fallbackName) => {
    if (!disposition) return fallbackName;
    const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
    const match = disposition.match(/filename="?([^\";]+)"?/i);
    return match?.[1] || fallbackName;
  };

  const handleGenerateReport = async () => {
    if (!canEdit || isSubmitting) return;
    resetMessages();

    if (!canSubmit) {
      setSubmitError("Preencha todos os campos obrigatorios antes de gerar.");
      return;
    }

    const formData = new FormData();
    formData.append("type", reportType);
    formData.append("relneg", fileRelneg);

    if (isTim) {
      formData.append("ruleset_id", rulesetTim.trim());
      formData.append("modelo_tim", fileModeloTim);
    } else if (isBradesco) {
      formData.append("ruleset_id", rulesetBradesco.trim());
    } else {
      formData.append("ruleset_id_renovacao", rulesetClaroRenov.trim());
      formData.append("ruleset_id_distrato", rulesetClaroDistr.trim());
      formData.append("ref_renov", fileRefRenov);
      formData.append("ref_distr", fileRefDistr);
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(API_BASE + "/api/reports/generate/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const fallbackName = `relatorio-${reportType}.xlsx`;
      const filename = extractFilename(res.headers.get("content-disposition"), fallbackName);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSubmitSuccess("Relatorio gerado. O download foi iniciado.");
    } catch (err) {
      setSubmitError(String(err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="renegociacao-page">
      {!canEdit && (
        <div className="card">
          <p className="muted">Modo somente leitura.</p>
        </div>
      )}

      {resolvedKey === "regras" && (
        <div className="card">
          <h3 className="card-title">Regras (numeros)</h3>
          <p className="muted">
            Cole ou digite numeros (um por linha ou separado por ponto e virgula). O backend vai
            normalizar e versionar.
          </p>

          <textarea
            className="renegociacao-textarea"
            placeholder="Ex: 3002893; 3005931&#10;3007001"
            disabled={!canEdit}
          />

          <div className="renegociacao-actions">
            <button type="button" className="btn-primary" disabled={!canEdit}>
              Salvar nova revisao
            </button>
            <button type="button" className="btn-ghost">Pre-visualizar normalizacao</button>
          </div>
        </div>
      )}

      {resolvedKey === "gerar" && (
        <div className="renegociacao-stack-page">
          <div className="card">
            <h3 className="card-title">Regras</h3>
            <p className="muted">Escolha qual conjunto de regras deseja visualizar ou editar.</p>
            <div className="renegociacao-rule-grid">
              {rulesetButtons.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`renegociacao-rule-btn ${activeRule === item.key ? "is-active" : ""}`}
                  onClick={() => {
                    setRuleSaveMessage("");
                    setActiveRule((prev) => (prev === item.key ? null : item.key));
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {activeRule && (
              <div className="renegociacao-rule-editor">
                <h4 className="renegociacao-rule-title">
                  {rulesetButtons.find((item) => item.key === activeRule)?.label}
                </h4>
                <p className="muted">
                  Cole ou digite os numeros (um por linha ou separado por ponto e virgula).
                </p>
                <textarea
                  className="renegociacao-textarea"
                  placeholder="Ex: 3002893; 3005931&#10;3007001"
                  value={ruleTexts[activeRule] || ""}
                  onChange={(e) =>
                    setRuleTexts((prev) => ({ ...prev, [activeRule]: e.target.value }))
                  }
                />
                <div className="renegociacao-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleSaveRules(activeRule)}
                  >
                    Salvar regras
                  </button>
                  <button type="button" className="btn-ghost">
                    Pre-visualizar normalizacao
                  </button>
                </div>
                {ruleSaveMessage && (
                  <div className="renegociacao-alert success">{ruleSaveMessage}</div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Ultimas atualizacoes (regras)</h3>
            <p className="muted">Atualizacoes recentes apenas das regras.</p>
            <div className="renegociacao-updates">
              {fakeUpdates.map((update) => (
                <div key={update.id} className="renegociacao-update">
                  <div className="renegociacao-update-header">
                    <strong>{update.desc}</strong>
                    <span className="muted">{update.when}</span>
                  </div>
                  <div className="muted">por {update.who}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Gerador de Excel</h3>
            <p className="muted">
              Selecione o tipo e envie o RelNegociacao/Modelos. O download do Excel vem na resposta.
            </p>
            <p className="muted renegociacao-hint">
              Campos obrigatorios mudam conforme o tipo selecionado.
            </p>

            <div className="renegociacao-grid">
              <div className="renegociacao-field">
                <div className="muted">Tipo</div>
                <select
                  className="renegociacao-select"
                  value={reportType}
                  onChange={(e) => {
                    setReportType(e.target.value);
                    resetMessages();
                  }}
                  disabled={!canEdit || isSubmitting}
                >
                  <option value="tim">TIM</option>
                  <option value="bradesco">Bradesco</option>
                  <option value="claro_merge">Claro (Merge)</option>
                </select>
              </div>

              <div className="renegociacao-field">
                <div className="muted">RuleSet ID</div>
                {isTim && (
                  <input
                    className="renegociacao-input"
                    type="text"
                    placeholder="ID do RuleSet TIM"
                    value={rulesetTim}
                    onChange={(e) => setRulesetTim(e.target.value)}
                    disabled={!canEdit || isSubmitting}
                  />
                )}
                {isBradesco && (
                  <input
                    className="renegociacao-input"
                    type="text"
                    placeholder="ID do RuleSet Bradesco"
                    value={rulesetBradesco}
                    onChange={(e) => setRulesetBradesco(e.target.value)}
                    disabled={!canEdit || isSubmitting}
                  />
                )}
                {isClaro && (
                  <div className="renegociacao-stack">
                    <input
                      className="renegociacao-input"
                      type="text"
                      placeholder="ID RuleSet Renovacao"
                      value={rulesetClaroRenov}
                      onChange={(e) => setRulesetClaroRenov(e.target.value)}
                      disabled={!canEdit || isSubmitting}
                    />
                    <input
                      className="renegociacao-input"
                      type="text"
                      placeholder="ID RuleSet Distrato"
                      value={rulesetClaroDistr}
                      onChange={(e) => setRulesetClaroDistr(e.target.value)}
                      disabled={!canEdit || isSubmitting}
                    />
                  </div>
                )}
              </div>

              <div className="renegociacao-field">
                <div className="muted">RelNegociacao (xlsx)</div>
                <input
                  className="renegociacao-file"
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => {
                    setFileRelneg(e.target.files?.[0] || null);
                    resetMessages();
                  }}
                  disabled={!canEdit || isSubmitting}
                />
              </div>

              {isTim && (
                <div className="renegociacao-field">
                  <div className="muted">Modelo TIM (xlsx)</div>
                  <input
                    className="renegociacao-file"
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => {
                      setFileModeloTim(e.target.files?.[0] || null);
                      resetMessages();
                    }}
                    disabled={!canEdit || isSubmitting}
                  />
                </div>
              )}

              {isClaro && (
                <>
                  <div className="renegociacao-field">
                    <div className="muted">Referencia Renovacao (xlsx)</div>
                    <input
                      className="renegociacao-file"
                      type="file"
                      accept=".xlsx"
                      onChange={(e) => {
                        setFileRefRenov(e.target.files?.[0] || null);
                        resetMessages();
                      }}
                      disabled={!canEdit || isSubmitting}
                    />
                  </div>
                  <div className="renegociacao-field">
                    <div className="muted">Referencia Distrato (xlsx)</div>
                    <input
                      className="renegociacao-file"
                      type="file"
                      accept=".xlsx"
                      onChange={(e) => {
                        setFileRefDistr(e.target.files?.[0] || null);
                        resetMessages();
                      }}
                      disabled={!canEdit || isSubmitting}
                    />
                  </div>
                </>
              )}
            </div>

            {submitError && (
              <div className="renegociacao-alert error">
                <strong>Erro:</strong> {submitError}
              </div>
            )}

            {submitSuccess && (
              <div className="renegociacao-alert success">
                <strong>Sucesso:</strong> {submitSuccess}
              </div>
            )}

            <div className="renegociacao-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleGenerateReport}
                disabled={!canSubmit}
              >
                {isSubmitting ? "Gerando..." : "Gerar e baixar Excel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resolvedKey === "backend" && (
        <div className="card">
          <h3 className="card-title">Backend (processamento de planilhas)</h3>
          <p className="muted">
            Envie os arquivos para processamento no backend e acompanhe o status de cada empresa.
          </p>

          <div className="renegociacao-grid">
            <div className="renegociacao-field">
              <div className="muted">Empresa</div>
              <select className="renegociacao-select">
                <option value="tim">TIM</option>
                <option value="bradesco">Bradesco</option>
                <option value="claro">Claro</option>
                <option value="vivo">Vivo</option>
              </select>
            </div>

            <div className="renegociacao-field">
              <div className="muted">Planilha base (xlsx)</div>
              <input className="renegociacao-file" type="file" accept=".xlsx" />
            </div>

            <div className="renegociacao-field">
              <div className="muted">Complemento (opcional)</div>
              <input className="renegociacao-file" type="file" accept=".xlsx" />
            </div>
          </div>

          <div className="renegociacao-actions">
            <button type="button" className="btn-primary" disabled={!canEdit}>
              Enviar para processamento
            </button>
            <button type="button" className="btn-ghost">Ver fila de execucao</button>
          </div>

          <div className="renegociacao-log">
            Saida do backend aparecera aqui (logs, status e links de download).
          </div>
        </div>
      )}

      {resolvedKey === "historico" && (
        <div className="card">
          <h3 className="card-title">Ultimas atualizacoes</h3>
          <p className="muted">Mudancas recentes em regras e revisoes (auditoria).</p>

          <div className="renegociacao-updates">
            {fakeUpdates.map((update) => (
              <div key={update.id} className="renegociacao-update">
                <div className="renegociacao-update-header">
                  <strong>{update.desc}</strong>
                  <span className="muted">{update.when}</span>
                </div>
                <div className="muted">por {update.who}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
