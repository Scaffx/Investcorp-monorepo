import React, { useState } from "react";

export function Section({ title, children, wide = false }) {
  return (
    <section className={`section ${wide ? "section-wide" : ""}`}>
      <header className="section-header">
        <h1>{title}</h1>
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Spinner({ size = 16 }) {
  return (
    <span className="spinner" aria-hidden="true" style={{ width: size, height: size }}>
      <svg viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" />
      </svg>
    </span>
  );
}

export function SearchBar({ placeholder, value, onChange, onSubmit }) {
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await onSubmit?.();
    } finally {
      setLoading(false);
    }
  };
  return (
    <form
      className="search"
      onSubmit={handleSubmit}
    >
      <div className="float-group">
        <input
          id={`f-${placeholder}`}
          className="float-input search-input"
          type="text"
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="float-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10 2a8 8 0 105.293 14.293l4.207 4.207 1.414-1.414-4.207-4.207A8 8 0 0010 2zm0 2a6 6 0 110 12A6 6 0 0110 4z" />
          </svg>
        </div>
      </div>

      <button className={`search-btn ${loading ? "is-loading" : ""}`} type="submit">
        {loading ? (
          <>
            <Spinner size={16} />
            <span style={{ marginLeft: 8 }}>Buscando…</span>
          </>
        ) : (
          "Buscar"
        )}
      </button>
    </form>
  );
}

export function Placeholder({ children }) {
  return <div className="placeholder">{children}</div>;
}
