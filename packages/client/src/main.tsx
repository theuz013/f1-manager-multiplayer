import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const token = localStorage.getItem('f1m_token');
  if (token && url.startsWith('/api/')) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    init = { ...init, headers };
  }
  return nativeFetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
