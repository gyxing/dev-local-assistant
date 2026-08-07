import { forwardRef, useImperativeHandle, useState } from 'react';
import type { Ref } from 'react';
import { Input, Modal } from 'antd';
import { formatBytes } from '../../utils';

interface DeleteConfirmModalProps {
  selectedCount: number;
  selectedSize: number;
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
      onOk={handleConfirm}
      onCancel={closeModal}
    >
      <p>将永久删除 {selectedCount} 个 node_modules，预计释放 {formatBytes(selectedSize)}。</p>
      <p>该操作无法从系统回收站恢复。请输入“永久删除”继续。</p>
      <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
    </Modal>
  );
}

export default forwardRef(DeleteConfirmModal);
