import React from "react";
import { Section, Placeholder } from "../ui";
import "../styles/relatorio.css";

export default function RelatorioPage({ onDownload }) {
  return (
    <Section title="Relatório">
      <div className="report-download">
        <button type="button" className="button report-download-button" onClick={onDownload}>
          <span className="button__text">Baixar relatório</span>
          <span className="button__icon" aria-hidden="true">
            <svg className="svg" viewBox="0 0 24 24">
              <path d="M12 3v12.586l4.293-4.293 1.414 1.414L12 19.414l-5.707-5.707 1.414-1.414L11 15.586V3h1zM5 21h14v-2H5v2z" />
            </svg>
          </span>
        </button>
        <p className="report-download-hint">
          Gera o relatório diretamente da base e inicia o download automático.
        </p>
      </div>

      <Placeholder>Espaço para filtros, download (PDF/Excel) e visualização.</Placeholder>
    </Section>
  );
}
