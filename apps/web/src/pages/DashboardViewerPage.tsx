import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  EditOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { DashboardRenderer } from '../renderer/DashboardRenderer';

/**
 * Dashboard Viewer (/dashboards/:id)
 * STRICT RULE: Never calls any AI generation or AI edit endpoint.
 * Restores persisted PageDocument from SQLite and executes live DataSource queries.
 */
export const DashboardViewerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const {
    data: dashboard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => apiClient.getDashboard(id!),
    enabled: Boolean(id),
  });

  const publishMutation = useMutation({
    mutationFn: () => apiClient.publishDashboard(id!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['dashboard', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      message.success(`已发布版本 v${updated.publishedRevision}`);
    },
    onError: (err: Error) => {
      message.error(`发布失败：${err.message}`);
    },
  });

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      message.success('已复制独立访问 URL');
    } catch {
      message.info(window.location.href);
    }
  };

  if (isLoading) {
    return (
      <div className="bi-card">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <Alert
        type="error"
        showIcon
        message="无法加载 Dashboard"
        description={
          error instanceof Error ? error.message : 'Dashboard 不存在或已被删除'
        }
        action={
          <Link to="/dashboards">
            <Button size="small">返回列表</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div data-testid="dashboard-viewer" data-dashboard-id={dashboard.id}>
      <div className="page-header-bar">
        <Space wrap size="middle">
          <Link to="/dashboards">
            <Button icon={<ArrowLeftOutlined />} size="small">
              返回列表
            </Button>
          </Link>
          <div>
            <Space align="center" size="small">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {dashboard.title}
              </Typography.Title>
              <Tag color={dashboard.status === 'published' ? 'green' : 'gold'}>
                {dashboard.status === 'published' ? '已发布' : '草稿'}
              </Tag>
              <Tag color="blue" data-testid="viewer-revision-tag">
                v{dashboard.currentRevision}
              </Tag>
              {dashboard.publishedRevision && (
                <Tag color="cyan">线上 v{dashboard.publishedRevision}</Tag>
              )}
            </Space>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              ID: {dashboard.id} · Schema v{dashboard.schemaVersion} · Catalog v
              {dashboard.catalogVersion}
            </div>
          </div>
        </Space>

        <Space wrap>
          <Button icon={<CopyOutlined />} onClick={handleCopyUrl}>
            复制链接
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            loading={publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
            data-testid="btn-publish-viewer"
          >
            发布当前版本
          </Button>
          <Link to={`/dashboards/${dashboard.id}/edit`}>
            <Button type="primary" icon={<EditOutlined />} data-testid="btn-go-edit">
              AI 编辑 / 版本管理
            </Button>
          </Link>
        </Space>
      </div>

      <DashboardRenderer pageDocument={dashboard.pageDocument} />
    </div>
  );
};
