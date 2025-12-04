import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './components/ThemeProvider';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Tailorings from './pages/Tailorings';
import TailoringDetail from './pages/TailoringDetail';
import FitProfiles from './pages/FitProfiles';
import FitProfileDetail from './pages/FitProfileDetail';
import Atelier from './pages/Atelier';
import YAMLGenerator from './pages/YAMLGenerator';
import Costs from './pages/Costs';
import Analytics from './pages/Analytics';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="sartor-ui-theme">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tailorings" element={<Tailorings />} />
              <Route path="/tailorings/:namespace/:name" element={<TailoringDetail />} />
            <Route path="/fitprofiles" element={<FitProfiles />} />
            <Route path="/fitprofiles/:namespace/:name" element={<FitProfileDetail />} />
            <Route path="/atelier" element={<Atelier />} />
            <Route path="/generator" element={<YAMLGenerator />} />
            <Route path="/costs" element={<Costs />} />
            <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
