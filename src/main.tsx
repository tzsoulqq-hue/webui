import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import { AppQueryProvider } from '@/query/provider';
import App from './dashboard/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <AppQueryProvider>
    <ThemeProvider defaultTheme="system" storageKey="byte-v-forge-theme">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </AppQueryProvider>
);
