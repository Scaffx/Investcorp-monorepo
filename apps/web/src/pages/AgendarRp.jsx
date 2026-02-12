import React, { useEffect, useState } from "react";
import { Section, Placeholder } from "../ui";
import {
  PROSPECTOR_OPTIONS,
  formatDateBR,
  parseDateValue,
  DAY_MS,
} from "../helpers";
import "../styles/agendarRp.css";

function ValueBadge({ label, value, show, onEdit, onDelete }) {
  const content = (value || "").trim();
  if (!show || !content) return null;
  return (
    <div className="value-badge">
      <span className="value-badge__label">{label}</span>
      <span className="value-badge__value">{content}</span>
      <div className="value-badge__actions">
        <button type="button" className="value-badge__edit" onClick={onEdit}>
          Editar
        </button>
        <button type="button" className="value-badge__delete" onClick={onDelete}>
          X
        </button>
      </div>
    </div>
  );
}

export default function AgendarRpPage({ registro, onCancel, onSchedule }) {
  const [prospector, setProspector] = useState("");
  const [dataIda, setDataIda] = useState("");
  const [dataVolta, setDataVolta] = useState("");
  const [diasViagem, setDiasViagem] = useState("");
  const [slaProspector, setSlaProspector] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [prospectorLocked, setProspectorLocked] = useState(false);
  const [idaLocked, setIdaLocked] = useState(false);
  const [voltaLocked, setVoltaLocked] = useState(false);
  const [diasLocked, setDiasLocked] = useState(false);
  const [slaProspectorLocked, setSlaProspectorLocked] = useState(false);

  useEffect(() => {
    if (!registro) {
      setProspector("");
      setDataIda("");
      setDataVolta("");
      setDiasViagem("");
      setSlaProspector("");
      setObservacoes("");
      setProspectorLocked(false);
      setIdaLocked(false);
      setVoltaLocked(false);
      setDiasLocked(false);
      setSlaProspectorLocked(false);
      return;
    }
    setProspector(registro.rpProspector || "");
    setDataIda(registro.rpDataIda || "");
    setDataVolta(registro.rpDataVolta || "");
    setDiasViagem(registro.rpDiasViagem || "");
    setSlaProspector(registro.rpSlaProspector || "");
    setObservacoes(registro.rpObservacoes || "");
    setProspectorLocked(!!(registro.rpProspector || ""));
    setIdaLocked(!!(registro.rpDataIda || ""));
    setVoltaLocked(!!(registro.rpDataVolta || ""));
    setDiasLocked(!!(registro.rpDiasViagem || ""));
    setSlaProspectorLocked(!!(registro.rpSlaProspector || ""));
  }, [registro?.id]);

  useEffect(() => {
    if (dataIda && dataVolta) {
      const start = parseDateValue(dataIda);
      const end = parseDateValue(dataVolta);
      if (start && end && end >= start) {
        const diff = Math.round((end - start) / DAY_MS) + 1;
        setDiasViagem(String(diff));
      }
    }
  }, [dataIda, dataVolta]);

  if (!registro) {
    return (
      <Section title="Agendar RP" wide>
        <Placeholder>Nenhum registro selecionado. Volte e escolha um item em "Consultar e Editar".</Placeholder>
      </Section>
    );
  }

  const idaDate = parseDateValue(dataIda);
  const voltaDate = parseDateValue(dataVolta);
  const datesValid = idaDate && voltaDate && voltaDate >= idaDate;
  const slaProspectorDate = parseDateValue(slaProspector);
  const slaProspectorValid = Boolean(slaProspectorDate);
  const requiredLocked =
    prospectorLocked && idaLocked && voltaLocked && diasLocked && slaProspectorLocked;
  const canSubmit = Boolean(
    requiredLocked &&
      prospector.trim() &&
      idaDate &&
      voltaDate &&
      diasViagem &&
      slaProspector &&
      datesValid &&
      slaProspectorValid
  );

  const handleEnterLock = (e, value, lockFn) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (String(value).trim()) lockFn(true);
    }
  };
  const handleBlurLock = (value, lockFn) => {
    if (String(value).trim()) lockFn(true);
  };

  // Locks triggered apenas quando o valor está completo/válido
  useEffect(() => {
    if (diasViagem && !diasLocked) setDiasLocked(true);
  }, [diasViagem, diasLocked]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) {
      alert("Preencha Prospector, datas de ida/volta (volta igual ou depois da ida), dias de viagem e SLA do prospector.");
      return;
    }
    onSchedule?.({
      rpProspector: prospector.trim(),
      rpDataIda: dataIda,
      rpDataVolta: dataVolta,
      rpDiasViagem: diasViagem,
      rpSlaProspector: slaProspector,
      rpObservacoes: observacoes,
      concluidoEm: null,
    });
  };

  return (
    <Section title="Agendar RP" wide>
      <div className="optional-search" style={{ marginBottom: 12 }}>
        <div><strong>Cliente:</strong> {registro.cliente || "-"}</div>
        <div><strong>Pedido:</strong> {registro.pedido || "-"}</div>
        <div><strong>SLA do banco:</strong> {formatDateBR(registro.slaDias) || "-"}</div>
        <div><strong>Status atual:</strong> {registro.status || "AGUARDANDO AGENDAMENTO"}</div>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="float-group">
          <label className="field-label" htmlFor="rp-prospector">Prospector</label>
          {prospectorLocked ? (
            <ValueBadge
              label="Prospector"
              value={prospector}
              show={prospectorLocked}
              onEdit={() => setProspectorLocked(false)}
              onDelete={() => {
                setProspector("");
                setProspectorLocked(false);
              }}
            />
          ) : (
            <select
              id="rp-prospector"
              className="float-input"
              value={prospector}
              onChange={(e) => setProspector(e.target.value)}
              onBlur={() => handleBlurLock(prospector, setProspectorLocked)}
              onKeyDown={(e) => handleEnterLock(e, prospector, setProspectorLocked)}
            >
              <option value="">Selecione o prospector</option>
              {PROSPECTOR_OPTIONS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="rp-ida">Data ida</label>
          {idaLocked ? (
            <ValueBadge
              label="Data ida"
              value={formatDateBR(dataIda)}
              show={idaLocked}
              onEdit={() => setIdaLocked(false)}
              onDelete={() => {
                setDataIda("");
                setIdaLocked(false);
              }}
            />
          ) : (
            <input
              id="rp-ida"
              className="float-input"
              type="date"
              value={dataIda}
              onChange={(e) => setDataIda(e.target.value)}
              onBlur={(e) => handleBlurLock(e.target.value, setIdaLocked)}
              onKeyDown={(e) => handleEnterLock(e, e.target.value, setIdaLocked)}
            />
          )}
        </div>
        <div className="float-group">
          <label className="field-label" htmlFor="rp-volta">Data volta</label>
          {voltaLocked ? (
            <ValueBadge
              label="Data volta"
              value={formatDateBR(dataVolta)}
              show={voltaLocked}
              onEdit={() => setVoltaLocked(false)}
              onDelete={() => {
                setDataVolta("");
                setVoltaLocked(false);
              }}
            />
          ) : (
            <input
              id="rp-volta"
              className="float-input"
              type="date"
              value={dataVolta}
              onChange={(e) => setDataVolta(e.target.value)}
              onBlur={(e) => handleBlurLock(e.target.value, setVoltaLocked)}
              onKeyDown={(e) => handleEnterLock(e, e.target.value, setVoltaLocked)}
            />
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="rp-dias">Quantos dias de viagem</label>
          <div className="value-badge value-badge--static">
            <span className="value-badge__label">Dias</span>
            <span className="value-badge__value">{diasViagem || "-"}</span>
          </div>
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="rp-sla-prospector">SLA do prospector</label>
          {slaProspectorLocked ? (
            <ValueBadge
              label="SLA prospector"
              value={formatDateBR(slaProspector)}
              show={slaProspectorLocked}
              onEdit={() => setSlaProspectorLocked(false)}
              onDelete={() => {
                setSlaProspector("");
                setSlaProspectorLocked(false);
              }}
            />
          ) : (
            <input
              id="rp-sla-prospector"
              className="float-input"
              type="date"
              value={slaProspector}
              onChange={(e) => setSlaProspector(e.target.value)}
              onBlur={() => handleBlurLock(slaProspector, setSlaProspectorLocked)}
              onKeyDown={(e) => handleEnterLock(e, slaProspector, setSlaProspectorLocked)}
            />
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="rp-sla-banco">SLA do banco</label>
          <div className="value-badge value-badge--static">
            <span className="value-badge__label">SLA banco</span>
            <span className="value-badge__value">{formatDateBR(registro.slaDias) || "-"}</span>
          </div>
        </div>

        <div className="float-group" style={{ gridColumn: "1 / span 2" }}>
          <label className="field-label" htmlFor="rp-obs">Observações</label>
          <textarea
            id="rp-obs"
            className="float-input"
            style={{ minHeight: 90, resize: "vertical" }}
            placeholder="Inclua detalhes do agendamento, local, contatos etc."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            disabled={false}
          />
        </div>
        <div className="form-send-row" style={{ gridColumn: "1 / span 2", justifyContent: "space-between" }}>
          <button type="button" className="table-btn" onClick={onCancel}>Voltar</button>
          <button type="submit" className={`send-button ${!canSubmit ? "is-disabled" : ""}`} disabled={!canSubmit}>
            <span className="send-button__text">Salvar agendamento</span>
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
