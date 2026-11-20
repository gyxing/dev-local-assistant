import { forwardRef, useImperativeHandle, useState } from 'react';
import type { Ref } from 'react';
import { Alert, Input, Modal, Space } from 'antd';
import { formatBytes } from '../../utils';

interface DeleteConfirmModalProps {
  selectedCount: number;
  selectedSize: number;
  hiddenSelectedCount: number;
  onConfirm: () => void;
}

export interface DeleteConfirmModalRef {
  open: () => void;
}

/**
 * 永久删除的二次确认弹窗，要求用户输入固定文案以降低误操作风险。
 */
function DeleteConfirmModal({
  selectedCount,
  selectedSize,
  hiddenSelectedCount,
  onConfirm,
}: DeleteConfirmModalProps, ref: Ref<DeleteConfirmModalRef>) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => {
      setConfirmText('');
      setOpen(true);
    },
  }));

  function closeModal() {
    setOpen(false);
    setConfirmText('');
  }

  function handleConfirm() {
    onConfirm();
    closeModal();
  }

  return (
    <Modal
      title="确认永久删除"
      open={open}
      okText="永久删除"
      cancelText="取消"
      okButtonProps={{ danger: true, disabled: confirmText !== '永久删除' }}
      maskClosable={false}
      onOk={handleConfirm}
      onCancel={closeModal}
    >
      <Space direction="vertical" size={12} className="cleaner-confirm">
        <Alert type="warning" message="永久删除后无法从系统回收站恢复。" showIcon />
        <div>将删除 {selectedCount} 个 node_modules，预计释放 {formatBytes(selectedSize)}。</div>
        {hiddenSelectedCount > 0 ? <div>其中 {hiddenSelectedCount} 项在当前筛选之外。</div> : null}
        <label htmlFor="delete-confirmation">输入「永久删除」以确认</label>
        <Input id="delete-confirmation" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
      </Space>
    </Modal>
  );
}

export default forwardRef(DeleteConfirmModal);
