import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

function Main() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const registerSw = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('SW registration failed: ', err);
      });
    };

    if (document.readyState === 'complete') {
      registerSw();
      return;
    }

    window.addEventListener('load', registerSw, { once: true });
    return () => window.removeEventListener('load', registerSw);
  }, []);

  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Main />);
