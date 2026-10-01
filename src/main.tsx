import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { App } from './ui/App';
import { createEmptyDocument } from './document/defaults';
import { loadPersistedDocument } from './document/persistence';
import './styles.css';

const persisted = loadPersistedDocument();
const container = document.getElementById('root');
if (!container) throw new Error('pen-clone: #root container is missing');

createRoot(container).render(
  <StrictMode>
    <App
      initialDocument={persisted ? persisted.document : createEmptyDocument()}
      initialFileName={persisted ? persisted.fileName : 'untitled.pen'}
    />
  </StrictMode>,
);
