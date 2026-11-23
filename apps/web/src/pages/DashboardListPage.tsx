import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardSummary } from '@ai-dashboard/contracts';
import { apiClient } from '../api/client';

export const DashboardListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: dashboards = [], isLoading, error, refetch } = useQuery({
    queryKey: ['dashboards'],
    queryFn: () => apiClient.listDashboards(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteDashboard(id),
    onSuccess: () => {
      message.success('看板已删除');
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
    onError: (err: Error) => {
      message.error(`删除失败：${err.message}`);
    },
  });

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Dashboard 资产列表
          </Typography.Title>
          <Typography.Text type="secondary">
            所有看板 Schema 持久化在 SQLite，打开时直接渲染 json-render 并实时查询 DataSource，不调用 LLM
          </Typography.Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void refetch()}>
            刷新列表
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/dashboards/new')}
            data-testid="btn-create-dashboard"
          >
            AI 生成新看板
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载 Dashboard 列表失败"
          description={error instanceof Error ? error.message : String(error)}
        />
      )}

      <div className="bi-card">
        <Table<DashboardSummary>
          rowKey="id"
          loading={isLoading}
          dataSource={dashboards}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty description="暂无已保存的 Dashboard">
                <Button type="primary" onClick={() => navigate('/dashboards/new')}>
                  立即通过 AI 生成
                </Button>
              </Empty>
            ),
          }}
          columns={[
            {
              title: 'Dashboard 名称',
              dataIndex: 'title',
              key: 'title',
              render: (title: string, record) => (
                <div>
                  <Link
                    to={`/dashboards/${record.id}`}
                    style={{ fontWeight: 600, fontSize: 14, color: '#38bdf8' }}
                  >
                    {title}
                  </Link>
                  {record.description && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {record.description}
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 110,
              render: (status: string) =>
                status === 'published' ? (
                  <Tag color="green">已发布</Tag>
                ) : (
                  <Tag color="gold">草稿</Tag>
                ),
            },
            {
              title: '版本',
              key: 'revision',
              width: 140,
              render: (_, record) => (
                <Space size={4}>
                  <Tag color="blue">v{record.currentRevision}</Tag>
                  {record.publishedRevision && (
                    <Tag color="cyan">线上 v{record.publishedRevision}</Tag>
                  )}
                </Space>
              ),
            },
            {
              title: '更新时间',
              dataIndex: 'updatedAt',
              key: 'updatedAt',
              width: 185,
              render: (val: string) => (
                <span className="bi-tabular" style={{ color: '#94a3b8', fontSize: 12 }}>
                  {new Date(val).toLocaleString('zh-CN')}
                </span>
              ),
            },
            {
              title: '操作',
              key: 'actions',
              width: 240,
              render: (_, record) => (
                <Space>
                  <Link to={`/dashboards/${record.id}`}>
                    <Button size="small" icon={<EyeOutlined />}>
                      查看
                    </Button>
                  </Link>
                  <Link to={`/dashboards/${record.id}/edit`}>
                    <Button size="small" type="primary" ghost icon={<EditOutlined />}>
                      编辑
                    </Button>
                  </Link>
                  <Popconfirm
                    title="确定删除该 Dashboard？"
                    description="删除后不可恢复，所有历史 Revision 将一并移除。"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => deleteMutation.mutate(record.id)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};
