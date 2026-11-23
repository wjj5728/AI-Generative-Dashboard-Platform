import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/AppLayout';
import { BackendIntegrationRulesPage } from './pages/BackendIntegrationRulesPage';
import { DashboardEditorPage } from './pages/DashboardEditorPage';
import { DashboardListPage } from './pages/DashboardListPage';
import { DashboardNewPage } from './pages/DashboardNewPage';
import { DashboardViewerPage } from './pages/DashboardViewerPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#0ea5e9',
            colorBgBase: '#080d1a',
            colorBgContainer: '#0f172a',
            colorBgElevated: '#131f38',
            colorBorder: 'rgba(148, 163, 184, 0.2)',
            borderRadius: 8,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Inter', 'PingFang SC', sans-serif",
          },
        }}
      >
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboards" replace />} />
              <Route path="/dashboards" element={<DashboardListPage />} />
              <Route path="/dashboards/new" element={<DashboardNewPage />} />
              <Route path="/dashboards/:id" element={<DashboardViewerPage />} />
              <Route path="/dashboards/:id/edit" element={<DashboardEditorPage />} />
              <Route path="/integration-rules" element={<BackendIntegrationRulesPage />} />
              <Route path="*" element={<Navigate to="/dashboards" replace />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
};
