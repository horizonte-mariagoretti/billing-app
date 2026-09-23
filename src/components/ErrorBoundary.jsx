import React from 'react';
import { getUiLang } from '../hooks/useUiTranslations';

// This boundary wraps the whole app in main.jsx, OUTSIDE UiTranslationsProvider
// (App.jsx) — if the crash happens during boot, that provider/DB may not even
// be mounted. So this can't use the t() context; it reads the language
// directly from localStorage instead, with its own tiny inline dictionary.
const STRINGS = {
  de: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Die Anwendung hat einen unerwarteten Fehler festgestellt. Versuche es erneut — deine Daten sind sicher in der lokalen Datenbank.',
    tryAgain: 'Erneut versuchen',
    reload: 'App neu laden',
  },
  fr: {
    title: 'Une erreur est survenue',
    body: "L'application a rencontré une erreur inattendue. Réessaie — tes données sont en sécurité dans la base de données locale.",
    tryAgain: 'Réessayer',
    reload: "Recharger l'application",
  },
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const s = STRINGS[getUiLang()] || STRINGS.de;
      return (
        <div style={{
          padding: '32px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#1a1a1a',
          maxWidth: '720px',
          margin: '40px auto',
        }}>
          <h1 style={{ color: '#dc2626' }}>{s.title}</h1>
          <p>{s.body}</p>
          <pre style={{
            background: '#f3f4f6',
            padding: '12px',
            borderRadius: '6px',
            overflow: 'auto',
            fontSize: '13px',
          }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button onClick={this.handleReset} style={{
              padding: '10px 16px',
              background: '#16181D',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}>{s.tryAgain}</button>
            <button onClick={this.handleReload} style={{
              padding: '10px 16px',
              background: '#fff',
              color: '#16181D',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
            }}>{s.reload}</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
