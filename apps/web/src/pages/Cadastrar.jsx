import React, { useEffect, useState } from "react";
import { Section, Placeholder } from "../ui";
import {
  formatDateBR,
  deriveSlaInputValue,
  RESPONSAVEIS_ADM_OPTIONS,
} from "../helpers";
import "../styles/cadastrar.css";

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

export default function CadastrarPage({ onSave, canCreate = true }) {
  return (
    <Section title="Cadastrar">
      {canCreate ? (
        <CadastroBasicoForm onSave={onSave} />
      ) : (
        <Placeholder>Sem permissao para cadastrar.</Placeholder>
      )}
    </Section>
  );
}

function CadastroBasicoForm({ onSave }) {
  const [cliente, setCliente] = useState("");
  const [clienteLocked, setClienteLocked] = useState(false);
  const [agencias, setAgencias] = useState([{ id: 0, value: "", numeroAgencia: "", hasAgency: null, locked: false }]);
  const [nextAgId, setNextAgId] = useState(1);
  const [pedido, setPedido] = useState("");
  const [pedidoLocked, setPedidoLocked] = useState(false);
  const [dataAcionamento, setDataAcionamento] = useState("");
  const [dataAcionamentoLocked, setDataAcionamentoLocked] = useState(false);
  const [solicitante, setSolicitante] = useState("");
  const [solicitanteLocked, setSolicitanteLocked] = useState(false);
  const [slaDias, setSlaDias] = useState("");
  const [slaDiasLocked, setSlaDiasLocked] = useState(false);
  const [responsavelAdm, setResponsavelAdm] = useState("");
  const [responsavelAdmLocked, setResponsavelAdmLocked] = useState(false);
  const [local, setLocal] = useState("");
  const [localLocked, setLocalLocked] = useState(false);
  const [localHasCity, setLocalHasCity] = useState(null); // "sim" | "nao" | null
  const [cidade, setCidade] = useState("");
  const [toast, setToast] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const addAgencia = () => {
    const newId = nextAgId;
    setAgencias((curr) => (curr.length >= 3 ? curr : [...curr, { id: newId, value: "", numeroAgencia: "", hasAgency: null, locked: false }]));
    setNextAgId((n) => n + 1);
    setTimeout(() => focusField(`cad-agencia-${newId}`), 0);
  };

  const handleAgenciaChange = (id, value) => {
    setAgencias((curr) =>
      curr.map((ag) => {
        if (ag.id !== id) return ag;
        const trimmed = value.trim();
        if (!trimmed) {
          return { ...ag, value, hasAgency: null, numeroAgencia: "" };
        }
        return { ...ag, value };
      })
    );
  };

  const removeAgencia = (id) => {
    setAgencias((curr) => {
      const filtered = curr.filter((ag) => ag.id !== id);
      if (filtered.length === 0) {
        const newId = nextAgId;
        setNextAgId((n) => n + 1);
        setTimeout(() => focusField(`cad-agencia-${newId}`), 0);
        return [{ id: newId, value: "", numeroAgencia: "", hasAgency: null, locked: false }];
      }
      return filtered.map((ag, idx) => (idx === 0 ? { ...ag, locked: false } : ag));
    });
    setTimeout(() => {
      const target = document.querySelector('[id^="cad-agencia-"]');
      if (target) target.focus();
    }, 0);
  };

  const editableAgencia = agencias.find((ag) => !ag.locked);
  const hasPendingChoice = agencias.some((ag) => ag.value.trim() && ag.hasAgency === null);
  const missingNumber = agencias.some((ag) => ag.hasAgency === "sim" && !ag.numeroAgencia.trim());
  const clienteOk = clienteLocked && cliente.trim();
  const dataAcionamentoOk = dataAcionamentoLocked && dataAcionamento;
  const solicitanteOk = solicitanteLocked && solicitante.trim();
  const slaOk = slaDiasLocked && slaDias !== "";
  const responsavelOk = responsavelAdmLocked && responsavelAdm.trim();
  const localChoicePending = local.trim() && localHasCity === null;
  const missingCidade = localHasCity === "sim" && !cidade.trim();
  const localOk = localLocked && local.trim() && !localChoicePending && !missingCidade;
  const firstAgencia = agencias[0];
  const firstAgOk = firstAgencia?.locked && firstAgencia?.value.trim();
  const canAdd = agencias.length < 3 && !hasPendingChoice;
  const canSend =
    clienteOk &&
    dataAcionamentoOk &&
    solicitanteOk &&
    slaOk &&
    responsavelOk &&
    localOk &&
    firstAgOk &&
    !hasPendingChoice &&
    !missingNumber;

  const handleEnterLock = (e, value, lockFn) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (value.trim()) lockFn(true);
    }
  };
  const handleBlurLock = (value, lockFn) => {
    if (value.trim()) lockFn(true);
  };

  const focusField = (id) => {
    const el = document.getElementById(id);
    if (el) el.focus();
  };

  const handleSubmit = () => {
    if (!canSend) return;
    setConfirmOpen(true);
  };

  const finalizeSubmit = () => {
    const registro = {
      cliente,
      agencias: agencias.map(({ value, numeroAgencia, hasAgency }) => ({ value, numeroAgencia, hasAgency })),
      pedido,
      dataAcionamento,
      solicitante,
      slaDias,
      responsavelAdm,
      status: "AGUARDANDO AGENDAMENTO",
      createdAt: new Date().toISOString(),
      concluidoEm: null,
      local,
      localHasCity,
      cidade,
    };
    onSave?.(registro);
    setCliente("");
    setClienteLocked(false);
    setAgencias([{ id: 0, value: "", numeroAgencia: "", hasAgency: null, locked: false }]);
    setNextAgId(1);
    setPedido("");
    setPedidoLocked(false);
    setDataAcionamento("");
    setDataAcionamentoLocked(false);
    setSolicitante("");
    setSolicitanteLocked(false);
    setSlaDias("");
    setSlaDiasLocked(false);
    setResponsavelAdm("");
    setResponsavelAdmLocked(false);
    setLocal("");
    setLocalLocked(false);
    setLocalHasCity(null);
    setCidade("");
    setTimeout(() => focusField("cad-cliente"), 0);
    setToast(true);
    setTimeout(() => setToast(false), 2000);
    setConfirmOpen(false);
  };

  return (
    <div className="form-stack">
      <div className="form-grid">
        <div className="float-group">
          <label className="field-label" htmlFor="cad-cliente">Cliente</label>
          {clienteLocked ? (
            <ValueBadge
              label="Cliente"
              value={cliente}
              show={clienteLocked}
              onEdit={() => {
                setClienteLocked(false);
                focusField("cad-cliente");
              }}
              onDelete={() => {
                setCliente("");
                setClienteLocked(false);
                setTimeout(() => focusField("cad-cliente"), 0);
              }}
            />
          ) : (
            <input
              id="cad-cliente"
              className="float-input"
              type="text"
              placeholder="Digite o nome do cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              onKeyDown={(e) => handleEnterLock(e, cliente, setClienteLocked)}
              onBlur={() => handleBlurLock(cliente, setClienteLocked)}
            />
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor={editableAgencia ? `cad-agencia-${editableAgencia.id}` : undefined}>
            AG/DENOMINACAO
          </label>

          {agencias.map((ag, idx) => {
            if (ag.locked) {
              const displayValue = ag.numeroAgencia ? `${ag.value} - No.: ${ag.numeroAgencia}` : ag.value;
              return (
                <ValueBadge
                  key={`agencia-badge-${ag.id}`}
                  label={`${idx + 1}`}
                  value={displayValue}
                  show={ag.locked}
                  onEdit={() => {
                    setAgencias((curr) =>
                      curr.map((item) =>
                        item.id === ag.id ? { ...item, locked: false } : { ...item, locked: true }
                      )
                    );
                    setTimeout(() => focusField(`cad-agencia-${ag.id}`), 0);
                  }}
                  onDelete={() => removeAgencia(ag.id)}
                />
              );
            }

            const hasText = ag.value.trim().length > 0;
            const requiresNumber = ag.hasAgency === "sim";
            const canLock =
              hasText &&
              ag.hasAgency !== null &&
              (!requiresNumber || ag.numeroAgencia.trim());

            return (
            <div className="agency-block" key={`agencia-input-${ag.id}`}>
              <div className="input-with-delete">
                <input
                  id={`cad-agencia-${ag.id}`}
                  className="float-input"
                  type="text"
                  placeholder="Digite a denominação"
                  value={ag.value}
                  onChange={(e) => handleAgenciaChange(ag.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!canLock) return;
                        setAgencias((curr) =>
                          curr.map((item) => (item.id === ag.id ? { ...item, locked: true } : item))
                        );
                      }
                    }}
                    onBlur={() => {
                      if (canLock) {
                        setAgencias((curr) =>
                          curr.map((item) => (item.id === ag.id ? { ...item, locked: true } : item))
                        );
                      }
                    }}
                  />
              </div>

                {hasText && (
                  <>
                    <div className="agency-question">
                      <span>Possui agencia?</span>
                      <div className={`option-group ${ag.hasAgency === null ? "is-error" : ""}`}>
                        <button
                          type="button"
                          className={`option-btn ${ag.hasAgency === "sim" ? "active" : ""}`}
                          data-variant="sim"
                          onClick={() => {
                            setAgencias((curr) =>
                              curr.map((item) =>
                                item.id === ag.id ? { ...item, hasAgency: "sim" } : item
                              )
                            );
                            setTimeout(() => {
                              const el = document.getElementById(`cad-ag-num-${ag.id}`);
                              if (el) el.focus();
                            }, 0);
                          }}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          className={`option-btn ${ag.hasAgency === "nao" ? "active" : ""}`}
                          data-variant="nao"
                          onClick={() => {
                            setAgencias((curr) =>
                              curr.map((item) =>
                                item.id === ag.id ? { ...item, hasAgency: "nao", numeroAgencia: "" } : item
                              )
                            );
                          }}
                        >
                          Nao
                        </button>
                      </div>
                    </div>

                    {requiresNumber && (
                      <>
                        <input
                          id={`cad-ag-num-${ag.id}`}
                          className="float-input"
                          type="text"
                          placeholder="Digite numero da agencia"
                          value={ag.numeroAgencia}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAgencias((curr) =>
                              curr.map((item) => (item.id === ag.id ? { ...item, numeroAgencia: v } : item))
                            );
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (!canLock) return;
                              setAgencias((curr) =>
                                curr.map((item) => (item.id === ag.id ? { ...item, locked: true } : item))
                              );
                            }
                          }}
                          onBlur={() => {
                            if (canLock) {
                              setAgencias((curr) =>
                                curr.map((item) => (item.id === ag.id ? { ...item, locked: true } : item))
                              );
                            }
                          }}
                        />
                        {canAdd && (
                          <button
                            type="button"
                            className="agency-add"
                            onClick={addAgencia}
                            disabled={!canAdd}
                          >
                            Adicionar mais uma agencia?
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="cad-pedido">Numero do pedido</label>
          {pedidoLocked ? (
            <ValueBadge
              label="Numero do pedido"
              value={pedido}
              show={pedidoLocked}
              onEdit={() => {
                setPedidoLocked(false);
                focusField("cad-pedido");
              }}
              onDelete={() => {
                setPedido("");
                setPedidoLocked(false);
                setTimeout(() => focusField("cad-pedido"), 0);
              }}
            />
          ) : (
            <input
              id="cad-pedido"
              className="float-input"
              type="text"
              inputMode="numeric"
              pattern="\\d*"
              placeholder="Digite o numero do pedido"
              value={pedido}
              onChange={(e) => {
                const onlyNum = e.target.value.replace(/[^0-9]/g, "");
                setPedido(onlyNum);
              }}
              onKeyDown={(e) => handleEnterLock(e, pedido, setPedidoLocked)}
              onBlur={() => handleBlurLock(pedido, setPedidoLocked)}
            />
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="cad-data-acionamento">Data acionamento</label>
          {dataAcionamentoLocked ? (
            <ValueBadge
              label="Data acionamento"
              value={formatDateBR(dataAcionamento)}
              show={dataAcionamentoLocked}
              onEdit={() => {
                setDataAcionamentoLocked(false);
                focusField("cad-data-acionamento");
              }}
              onDelete={() => {
                setDataAcionamento("");
                setDataAcionamentoLocked(false);
                setTimeout(() => focusField("cad-data-acionamento"), 0);
              }}
            />
          ) : (
            <input
              id="cad-data-acionamento"
              className="float-input"
              type="date"
              placeholder="Selecione a data de acionamento"
              value={dataAcionamento}
              onChange={(e) => setDataAcionamento(e.target.value)}
              onKeyDown={(e) => handleEnterLock(e, dataAcionamento, setDataAcionamentoLocked)}
              onBlur={() => handleBlurLock(dataAcionamento, setDataAcionamentoLocked)}
            />
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="cad-solicitante">Solicitante</label>
          {solicitanteLocked ? (
            <ValueBadge
              label="Solicitante"
              value={solicitante}
              show={solicitanteLocked}
              onEdit={() => {
                setSolicitanteLocked(false);
                focusField("cad-solicitante");
              }}
              onDelete={() => {
                setSolicitante("");
                setSolicitanteLocked(false);
                setTimeout(() => focusField("cad-solicitante"), 0);
              }}
            />
          ) : (
            <input
              id="cad-solicitante"
              className="float-input"
              type="text"
              placeholder="Digite o nome do solicitante"
              value={solicitante}
              onChange={(e) => setSolicitante(e.target.value)}
              onKeyDown={(e) => handleEnterLock(e, solicitante, setSolicitanteLocked)}
              onBlur={() => handleBlurLock(solicitante, setSolicitanteLocked)}
            />
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="cad-sla">SLA</label>
          {slaDiasLocked ? (
            <ValueBadge
              label="SLA"
              value={formatDateBR(slaDias)}
              show={slaDiasLocked}
              onEdit={() => {
                setSlaDiasLocked(false);
                focusField("cad-sla");
              }}
              onDelete={() => {
                setSlaDias("");
                setSlaDiasLocked(false);
                setTimeout(() => focusField("cad-sla"), 0);
              }}
            />
          ) : (
            <input
              id="cad-sla"
              className="float-input"
              type="date"
              placeholder="Informe a data limite do SLA"
              value={slaDias}
              onChange={(e) => setSlaDias(e.target.value)}
              onKeyDown={(e) => handleEnterLock(e, e.target.value, setSlaDiasLocked)}
              onBlur={(e) => handleBlurLock(e.target.value, setSlaDiasLocked)}
            />
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="cad-resp-adm">Responsavel ADM</label>
          {responsavelAdmLocked ? (
            <ValueBadge
              label="Responsavel ADM"
              value={responsavelAdm}
              show={responsavelAdmLocked}
              onEdit={() => {
                setResponsavelAdmLocked(false);
                focusField("cad-resp-adm");
              }}
              onDelete={() => {
                setResponsavelAdm("");
                setResponsavelAdmLocked(false);
                setTimeout(() => focusField("cad-resp-adm"), 0);
              }}
            />
          ) : (
            <select
              id="cad-resp-adm"
              className="float-input"
              value={responsavelAdm}
              onChange={(e) => setResponsavelAdm(e.target.value)}
              onBlur={() => {
                if (responsavelAdm.trim()) setResponsavelAdmLocked(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && responsavelAdm.trim()) {
                  e.preventDefault();
                  setResponsavelAdmLocked(true);
                }
              }}
            >
              <option value="">Selecione o responsavel</option>
              {RESPONSAVEIS_ADM_OPTIONS.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="float-group">
          <label className="field-label" htmlFor="cad-local">Local</label>
          {localLocked ? (
            <ValueBadge
              label="Local"
              value={
                localHasCity === "sim" && cidade.trim()
                  ? `${local} - Cidade: ${cidade}`
                  : local
              }
              show={localLocked}
              onEdit={() => {
                setLocalLocked(false);
                setLocalHasCity(null);
                setCidade("");
                focusField("cad-local");
              }}
              onDelete={() => {
                setLocal("");
                setLocalLocked(false);
                setLocalHasCity(null);
                setCidade("");
                setTimeout(() => focusField("cad-local"), 0);
              }}
            />
          ) : (
            <div className="agency-block">
              <div className="input-with-delete">
                <input
                  id="cad-local"
                  className="float-input"
                  type="text"
                  placeholder="Digite a Cidade"
                  value={local}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocal(val);
                    if (!val.trim()) {
                      setLocalHasCity(null);
                      setCidade("");
                    }
                  }}
                  onKeyDown={(e) => {
                    const requiresCidade = localHasCity === "sim";
                    const canLock = local.trim() && localHasCity !== null && (!requiresCidade || cidade.trim());
                    if (canLock) handleEnterLock(e, local, setLocalLocked);
                  }}
                  onBlur={() => {
                    const requiresCidade = localHasCity === "sim";
                    const canLock = local.trim() && localHasCity !== null && (!requiresCidade || cidade.trim());
                    if (canLock) handleBlurLock(local, setLocalLocked);
                  }}
                />
              </div>

              {local.trim() && (
                <>
                  <div className="agency-question">
                    <span>Possui UF?</span>
                    <div className={`option-group ${localHasCity === null ? "is-error" : ""}`}>
                      <button
                        type="button"
                        className={`option-btn ${localHasCity === "sim" ? "active" : ""}`}
                        data-variant="sim"
                        onClick={() => {
                          setLocalHasCity("sim");
                          setTimeout(() => {
                            const el = document.getElementById("cad-cidade");
                            if (el) el.focus();
                          }, 0);
                        }}
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        className={`option-btn ${localHasCity === "nao" ? "active" : ""}`}
                        data-variant="nao"
                        onClick={() => {
                          setLocalHasCity("nao");
                          setCidade("");
                          setLocalLocked(true);
                        }}
                      >
                        Nao
                      </button>
                    </div>
                  </div>

                  {localHasCity === "sim" && (
                    <div className="input-with-delete">
                      <input
                        id="cad-cidade"
                        className="float-input"
                        type="text"
                        placeholder="Digite a cidade"
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                        onKeyDown={(e) => {
                          const canLock = local.trim() && localHasCity !== null && cidade.trim();
                          if (canLock) handleEnterLock(e, cidade, () => setLocalLocked(true));
                        }}
                        onBlur={() => {
                          const canLock = local.trim() && localHasCity !== null && cidade.trim();
                          if (canLock) handleBlurLock(cidade, () => setLocalLocked(true));
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

      </div>

      <div className="form-send-row">
          <div className="send-row-inner">
            <button
              type="button"
              className={`send-button ${!canSend ? "is-disabled" : ""}`}
              disabled={!canSend}
              onClick={handleSubmit}
            >
              <span className="send-button__text">Enviar</span>
              <span className="send-button__loader" aria-hidden="true">
                <span className="send-spinner" />
                <span className="send-button__loader-text">Processando...</span>
              </span>
              <span className="send-button__icon" aria-hidden="true">
                <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor">
                  <path d="m476.59 227.05-.16-.07L49.35 49.84A23.56 23.56 0 0 0 27.14 52 24.65 24.65 0 0 0 16 72.59v113.29a24 24 0 0 0 19.52 23.57l232.93 43.07a4 4 0 0 1 0 7.86L35.53 303.45A24 24 0 0 0 16 327v113.31A23.57 23.57 0 0 0 26.59 460a23.94 23.94 0 0 0 13.22 4 24.55 24.55 0 0 0 9.52-1.93L476.4 285.94l.19-.09a32 32 0 0 0 0-58.8z" />
                </svg>
              </span> 
            </button>
            {toast && <div className="toast toast-inline">Enviado</div>}
          </div>
      </div>

      {confirmOpen && (
        <div className="modal-backdrop">
        <div className="modal-card">
          <p className="modal-text">Deseja realmente enviar?</p>
          <div className="modal-summary">
            <div><strong>Cliente:</strong> {cliente || "-"}</div>
            <div><strong>AG/DENOMINACAO:</strong> {agencias.map((a, i) => `${i + 1}-${a.value || "-"}`).join(", ") || "-"}</div>
            <div><strong>Numero da Agencia:</strong> {agencias.map((a) => a.numeroAgencia || "-").join(", ") || "-"}</div>
            <div><strong>Pedido:</strong> {pedido || "-"}</div>
            <div><strong>Data acionamento:</strong> {formatDateBR(dataAcionamento) || "-"}</div>
            <div><strong>Solicitante:</strong> {solicitante || "-"}</div>
            <div><strong>SLA:</strong> {formatDateBR(slaDias) || "-"}</div>
            <div><strong>Responsavel ADM:</strong> {responsavelAdm || "-"}</div>
            <div><strong>UF:</strong> {local || "-"}</div>
            {localHasCity === "sim" && <div><strong>Cidade:</strong> {cidade || "-"}</div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-yes" onClick={finalizeSubmit}>Sim</button>
            <button type="button" className="modal-btn modal-no" onClick={() => setConfirmOpen(false)}>Nao</button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
