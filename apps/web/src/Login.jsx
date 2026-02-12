    import { useState } from "react";
import "./login.css";

export default function Login({ onSubmit, error, onSkip }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="login-shell">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(login, password);
        }}
      >
        <h2 className="login-form-title">Acessar</h2>
        <div className="login-input-container">
          <label htmlFor="login-user" className="login-label">Email</label>
          <input
            id="login-user"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Digite seu hotmail ou email corporativo"
          />
        </div>
        <div className="login-input-container">
          <label htmlFor="login-pass" className="login-label">Senha</label>
          <input
            id="login-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite sua senha"
          />
        </div>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="login-submit">Entrar</button>
        {onSkip && (
          <button
            type="button"
            className="login-skip"
            onClick={onSkip}
          >
          </button>
        )}
        <div className="login-hint">
          Primeiro acesso: use seu hotmail sem senha. Depois defina o email corporativo e a senha no perfil.
        </div>
      </form>
    </div>
  );
}
