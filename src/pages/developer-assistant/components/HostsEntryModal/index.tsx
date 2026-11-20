import { useEffect } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import StatusSwitch from '@/components/StatusSwitch';
import type { HostsEntry } from '../../../../../shared/network-tools-types';

interface HostsEntryFormValue {
  address: string;
  hostnames: string[];
  comment?: string;
  enabled: boolean;
}

interface HostsEntryModalProps {
  open: boolean;
  entry?: HostsEntry;
  onCancel: () => void;
  onSubmit: (entry: HostsEntry) => void;
}

function normalizeHostnames(hostnames: string[]): string[] {
  return Array.from(
    new Set(
      hostnames
        .flatMap((hostname) => hostname.split(/[\s,]+/))
        .map((hostname) => hostname.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/** 编辑单条 Hosts 映射，注释由保存服务统一写到映射行上方。 */
export default function HostsEntryModal({
  open,
  entry,
  onCancel,
  onSubmit,
}: HostsEntryModalProps) {
  const [form] = Form.useForm<HostsEntryFormValue>();

  useEffect(() => {
    if (!open) {
      return;
    }

    form.setFieldsValue({
      address: entry?.address ?? '127.0.0.1',
      hostnames: entry?.hostnames ?? [],
      comment: entry?.comment,
      enabled: entry?.enabled ?? true,
    });
  }, [entry, form, open]);

  async function handleSubmit() {
    const values = await form.validateFields();
    onSubmit({
      id: entry?.id ?? `new-${crypto.randomUUID()}`,
      address: values.address.trim(),
      hostnames: normalizeHostnames(values.hostnames),
      comment: values.comment?.trim() || undefined,
      enabled: values.enabled,
    });
  }

  return (
    <Modal
      open={open}
      title={entry ? '编辑 Hosts 记录' : '添加 Hosts 记录'}
      okText={entry ? '更新' : '添加'}
      cancelText="取消"
      destroyOnHidden
      onCancel={onCancel}
      onOk={handleSubmit}
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item label="状态" name="enabled" valuePropName="checked">
          <StatusSwitch aria-label="启用 Hosts 记录" onLabel="已启用" offLabel="已停用" />
        </Form.Item>
        <Form.Item
          label="IP 地址"
          name="address"
          rules={[{ required: true, whitespace: true, message: '请输入 IPv4 或 IPv6 地址' }]}
        >
          <Input placeholder="例如：127.0.0.1 或 ::1" maxLength={64} />
        </Form.Item>
        <Form.Item
          label="主机名"
          name="hostnames"
          extra="可输入多个主机名，按空格、逗号或回车分隔"
          rules={[
            { required: true, message: '请至少输入一个主机名' },
            {
              validator: (_, value?: string[]) => {
                const hostnames = normalizeHostnames(value ?? []);
                const invalidHostname = hostnames.find(
                  (hostname) => !/^[a-z0-9._-]+$/i.test(hostname) || hostname.length > 253,
                );
                return invalidHostname
                  ? Promise.reject(new Error(`主机名格式不正确：${invalidHostname}`))
                  : Promise.resolve();
              },
            },
          ]}
        >
          <Select
            mode="tags"
            open={false}
            tokenSeparators={[',', ' ']}
            placeholder="例如：api.local.test"
          />
        </Form.Item>
        <Form.Item
          label="注释"
          name="comment"
          extra="保存后会作为独立注释行显示在映射上方"
          rules={[{ max: 200, message: '注释不能超过 200 个字符' }]}
        >
          <Input placeholder="例如：本地 API 服务" maxLength={200} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
