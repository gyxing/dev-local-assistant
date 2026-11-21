import { App, Button, Modal } from 'antd';
import { useEffect, useState } from 'react';
import './index.less';

interface AboutDialogProps {
  open: boolean;
  logo: string;
  onClose: () => void;
  afterClose: () => void;
}

/** 从任意工具页查看当前应用版本、功能简介和项目主页。 */
export default function AboutDialog({ open, logo, onClose, afterClose }: AboutDialogProps) {
  const api = window.mainWindowAbout;
  const { message } = App.useApp();
  const [version, setVersion] = useState<string | null>();
  const [openingProjectHome, setOpeningProjectHome] = useState(false);

  useEffect(() => {
    if (!open || !api) return;
    let active = true;
    void api.getVersion().then(
      (value) => { if (active) setVersion(value); },
      () => { if (active) setVersion(null); },
    );
    return () => { active = false; };
  }, [api, open]);

  async function openProjectHome() {
    if (!api) return;
    setOpeningProjectHome(true);
    try {
      await api.openProjectHome();
    } catch {
      void message.error('未能打开项目主页，请稍后重试。');
    } finally {
      setOpeningProjectHome(false);
    }
  }

  const versionLabel = !api || version === null
    ? '版本暂不可用'
    : version ? `v${version}` : '读取版本中…';

  return (
    <Modal
      title="关于本地助手"
      className="about-dialog"
      width={460}
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      focusTriggerAfterClose={false}
      footer={[
        <Button key="project-home" disabled={!api} loading={openingProjectHome} onClick={() => void openProjectHome()}>
          项目主页
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>关闭</Button>,
      ]}
    >
      <div className="about-dialog__brand">
        <img src={logo} alt="" width={42} height={42} draggable={false} />
        <strong>本地助手</strong>
        <span className="about-dialog__version" aria-live="polite">{versionLabel}</span>
      </div>
      <p className="about-dialog__intro">
        面向 Windows 的本地效率工具，集成开发环境清理、网络管理和桌面小组件。
      </p>
      <dl className="about-dialog__features">
        <dt>清理</dt>
        <dd>查找并清理项目依赖和包管理器缓存。</dd>
        <dt>网络</dt>
        <dd>查看端口占用、管理 Hosts 映射和清理 DNS 缓存。</dd>
        <dt>桌面</dt>
        <dd>使用桌面便利贴和日历，查看农历与节假日。</dd>
      </dl>
    </Modal>
  );
}
