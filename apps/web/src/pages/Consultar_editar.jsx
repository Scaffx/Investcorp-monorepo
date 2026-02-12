import React, { useState } from "react";
import { Section, SearchBar, Placeholder } from "../ui";
import {
  formatDateBR,
  deriveSlaInputValue,
  getSlaInfo,
  RESPONSAVEIS_ADM_OPTIONS,
} from "../helpers";
import "../styles/consultar_editar.css";

export default function ConsultarEditarPage({
  query,
  queryB,
  onQueryChange,
  onQueryBChange,
  registros,
  onUpdate,
  onAgendar,
  onCustos,
  permissions,
}) {
  const perms = permissions || {};
  return (
    <Section title="Consultar e Editar" wide>
      <SearchBar
        placeholder="Digite para consultar."
        value={query}
        onChange={onQueryChange}
        onSubmit={() => {}}
      />
      <details className="optional-search">
        <summary>Deseja uma pesquisa opcional?</summary>
        <SearchBar
          placeholder="Segundo filtro (opcional)"
          value={queryB}
          onChange={onQueryBChange}
          onSubmit={() => {}}
        />
      </details>
      <ConsultaTable
        query={query}
        queryB={queryB}
        registros={registros}
        onUpdate={onUpdate}
        onAgendar={onAgendar}
        onCustos={onCustos}
        permissions={perms}
      />
    </Section>
  );
}

function ConsultaTable({ query, queryB, registros, onUpdate, onAgendar, onCustos, permissions }) {
  const canEdit = !!permissions?.editar;
  const canDelete = !!permissions?.excluir;
  const canAgendar = !!permissions?.agendar && Boolean(onAgendar);
  const canCustos = !!permissions?.custos && Boolean(onCustos);
  const hasActions = canEdit || canDelete || canAgendar || canCustos;
  const normalize = (s = "") => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const term = normalize(query.trim());
  const termB = normalize(queryB.trim());
  const matches = (r, t) => {
    if (!t) return true;
    const blob = normalize(
      `${r.cliente} ${r.pedido} ${r.dataAcionamento || ""} ${r.solicitante || ""} ${r.slaDias || ""} ${formatDateBR(r.slaDias)} ${r.responsavelAdm || ""} ${r.status || "AGUARDANDO AGENDAMENTO"} ${r.local} ${r.agencias
        .map((a) => `${a.value} ${a.numeroAgencia || ""}`)
        .join(" ")}`
    );
    return blob.includes(t);
  };
  const filtered = registros.filter((r) => matches(r, term) && matches(r, termB));

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [openActionsId, setOpenActionsId] = useState(null);
  const handleAgendar = onAgendar || (() => {});
  const handleCustos = onCustos || (() => {});

  const startEdit = (row) => {
    if (!canEdit) return;
    setEditingId(row.id);
    setDraft({
      cliente: row.cliente || "",
      pedido: row.pedido || "",
      dataAcionamento: row.dataAcionamento || "",
      solicitante: row.solicitante || "",
      slaDias: deriveSlaInputValue(row),
      responsavelAdm: row.responsavelAdm || "",
      status: row.status || "AGUARDANDO AGENDAMENTO",
      local: row.local || "",
      agencias: row.agencias ? row.agencias.map((a) => ({ ...a })) : [],
      concluidoEm: row.concluidoEm || null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = (id) => {
    if (!canEdit) return;
    const original = registros.find((r) => r.id === id);
    const nextStatus = draft?.status || original?.status || "AGUARDANDO AGENDAMENTO";
    let concluidoEm = draft?.concluidoEm ?? original?.concluidoEm ?? null;
    if (nextStatus === "CONCLUIDO") {
      concluidoEm = concluidoEm || new Date().toISOString();
    } else if (concluidoEm && nextStatus !== "CONCLUIDO") {
      concluidoEm = null;
    }

    onUpdate(id, {
      ...draft,
      slaDias: deriveSlaInputValue(draft),
      concluidoEm,
    });
    cancelEdit();
  };

  const requestDelete = (id) => {
    if (!canDelete) return;
    setConfirmDeleteId(id);
  };
  const cancelDelete = () => setConfirmDeleteId(null);
  const confirmDelete = () => {
    if (!canDelete) return;
    if (confirmDeleteId !== null) {
      onUpdate(confirmDeleteId, null, true);
      setConfirmDeleteId(null);
    }
  };

  if (!filtered.length) {
    return <Placeholder>Nenhum registro encontrado.</Placeholder>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>AG/DENOMINACAO</th>
            <th>Numero da agencia</th>
            <th>Numero do pedido</th>
            <th>Data acionamento</th>
            <th>Solicitante</th>
            <th>SLA / Prazo</th>
            <th>Responsavel ADM</th>
            <th>Status</th>
            <th>Local</th>
            <th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const isEditing = editingId === r.id;
            const current = isEditing ? draft : r;
            const currentStatus = current.status || "AGUARDANDO AGENDAMENTO";
            const statusSlug = normalize(currentStatus).replace(/\s+/g, "-");
            const rowClass = isEditing ? "is-editing" : "";
            const slaInfo = getSlaInfo(current);
            const slaInputValue = deriveSlaInputValue(current);
            return (
              <tr key={r.id} className={rowClass}>
                <td>
                  {isEditing ? (
                    <input
                      className="float-input small"
                      type="text"
                      value={current.cliente}
                      onChange={(e) => setDraft({ ...current, cliente: e.target.value })}
                    />
                  ) : (
                    r.cliente || "-"
                  )}
                </td>
                <td className="stacked">
                  {current.agencias?.length
                    ? current.agencias.map((a, i) =>
                        isEditing ? (
                          <input
                            key={`agv-${i}`}
                            className="float-input small"
                            type="text"
                            value={a.value}
                            onChange={(e) => {
                              const nextAg = [...current.agencias];
                              nextAg[i] = { ...nextAg[i], value: e.target.value };
                              setDraft({ ...current, agencias: nextAg });
                            }}
                          />
                        ) : (
                          <div key={`agv-${i}`}>{a.value || "-"}</div>
                        )
                      )
                    : "-"}
                </td>
                <td className="stacked">
                  {current.agencias?.length
                    ? current.agencias.map((a, i) =>
                        isEditing ? (
                          <input
                            key={`agn-${i}`}
                            className="float-input small"
                            type="text"
                            value={a.numeroAgencia}
                            onChange={(e) => {
                              const nextAg = [...current.agencias];
                              nextAg[i] = { ...nextAg[i], numeroAgencia: e.target.value };
                              setDraft({ ...current, agencias: nextAg });
                            }}
                          />
                        ) : (
                          <div key={`agn-${i}`}>{a.numeroAgencia || "-"}</div>
                        )
                      )
                    : "-"}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="float-input small"
                      type="text"
                      value={current.pedido}
                      onChange={(e) => setDraft({ ...current, pedido: e.target.value })}
                    />
                  ) : (
                    r.pedido || "-"
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="float-input small"
                      type="date"
                      value={current.dataAcionamento || ""}
                      onChange={(e) => setDraft({ ...current, dataAcionamento: e.target.value })}
                    />
                  ) : (
                    formatDateBR(r.dataAcionamento) || "-"
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="float-input small"
                      type="text"
                      value={current.solicitante || ""}
                      onChange={(e) => setDraft({ ...current, solicitante: e.target.value })}
                    />
                  ) : (
                    r.solicitante || "-"
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="float-input small"
                      type="date"
                      value={slaInputValue}
                      onChange={(e) => setDraft({ ...current, slaDias: e.target.value })}
                    />
                  ) : (
                    <div className={`sla-pill sla-pill--${slaInfo.variant}`}>
                      <span className="sla-date">{slaInfo.dateLabel}</span>
                      <span className="sla-text">{slaInfo.text}</span>
                    </div>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <select
                      className="float-input small"
                      value={current.responsavelAdm || ""}
                      onChange={(e) => setDraft({ ...current, responsavelAdm: e.target.value })}
                    >
                      <option value="">Selecione</option>
                      {RESPONSAVEIS_ADM_OPTIONS.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    r.responsavelAdm || "-"
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <select
                      className="float-input small"
                      value={current.status}
                      onChange={(e) => setDraft({ ...current, status: e.target.value })}
                    >
                      <option value="AGUARDANDO AGENDAMENTO">Aguardando agendamento</option>
                      <option value="AGENDANDO">Agendando</option>
                      <option value="AGENDADO">Agendado</option>
                      <option value="CONCLUIDO">Concluido</option>
                    </select>
                  ) : canEdit ? (
                    <button
                      type="button"
                      className={`status-badge status-${statusSlug}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(r);
                      }}
                    >
                      {currentStatus}
                    </button>
                  ) : (
                    <span className={`status-badge status-${statusSlug} is-readonly`}>{currentStatus}</span>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="float-input small"
                      type="text"
                      value={current.local}
                      onChange={(e) => setDraft({ ...current, local: e.target.value })}
                    />
                  ) : (
                    r.local || "-"
                  )}
                </td>
                <td className="actions-cell">
                  {isEditing ? (
                    <div className="row-actions">
                      <button type="button" className="table-btn save" onClick={() => saveEdit(r.id)}>Salvar</button>
                      <button type="button" className="table-btn" onClick={cancelEdit}>Cancelar</button>
                    </div>
                  ) : !hasActions ? (
                    <span>-</span>
                  ) : (
                    <div
                      className={`action-toggle ${openActionsId === r.id ? "is-open" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="chevron-container">
                        <input
                          type="checkbox"
                          checked={openActionsId === r.id}
                          onChange={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                        />
                        <svg className="chevron-right" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </label>
                      {openActionsId === r.id && (
                        <div className="action-menu">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null);
                                startEdit(r);
                              }}
                            >
                              Editar
                            </button>
                          )}
                          {canAgendar && (
                            currentStatus === "CUSTOS PENDENTES" ? null : currentStatus === "AGUARDANDO SLA" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionsId(null);
                                  handleAgendar(r);
                                }}
                              >
                                Visualizar agendamento
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionsId(null);
                                  handleAgendar(r);
                                }}
                              >
                                Agendar RP
                              </button>
                            )
                          )}
                          {canCustos && currentStatus !== "AGUARDANDO AGENDAMENTO" && (
                            <button
                              type="button"
                              className="success"
                              onClick={() => {
                                setOpenActionsId(null);
                                handleCustos(r);
                              }}
                            >
                              Adicionar Custos
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                setOpenActionsId(null);
                                requestDelete(r.id);
                              }}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {confirmDeleteId !== null && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <p className="modal-text">Tem certeza que deseja excluir?</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn modal-yes" onClick={confirmDelete}>Sim</button>
              <button type="button" className="modal-btn modal-no" onClick={cancelDelete}>Não</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
