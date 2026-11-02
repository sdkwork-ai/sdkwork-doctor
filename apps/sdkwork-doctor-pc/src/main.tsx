import { createRoot } from 'react-dom/client';

import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('SDKWork Doctor PC: #root container is missing from index.html');
}

createRoot(container).render(<App />);
