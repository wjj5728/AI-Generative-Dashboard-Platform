import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChartOutlined,
  BookOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Tag } from 'antd';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isList = location.pathname === '/dashboards' || location.pathname === '/';
  const isNew = location.pathname === '/dashboards/new';
  const isRules = location.pathname === '/integration-rules';

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link to="/dashboards" className="app-brand">
            <span className="app-brand-mark">
              <BarChartOutlined />
            </span>
            <span>GenUI Dashboard Platform</span>
            <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
              V2 · json-render
            </Tag>
          </Link>
          <nav className="app-nav">
            <Link
              to="/dashboards"
              className={`app-nav-link ${isList ? 'app-nav-link--active' : ''}`}
            >
              看板列表
            </Link>
            <Link
              to="/dashboards/new"
              className={`app-nav-link ${isNew ? 'app-nav-link--active' : ''}`}
            >
              <ThunderboltOutlined style={{ marginRight: 5 }} />
              AI 生成看板
            </Link>
            <Link
              to="/integration-rules"
              className={`app-nav-link ${isRules ? 'app-nav-link--active' : ''}`}
              data-testid="nav-integration-rules"
            >
              <BookOutlined style={{ marginRight: 5 }} />
              后端接入规范
            </Link>
          </nav>
        </div>

        <Link to="/dashboards/new">
          <Button type="primary" icon={<PlusOutlined />} size="small">
            新建 AI 看板
          </Button>
        </Link>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
};
