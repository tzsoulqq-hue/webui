import { PanelNotice } from './common';
import { dashboardModuleViews } from './module-registry';

export function DashboardContent({ activeView }: { activeView: string }) {
  const View = dashboardModuleViews[activeView];

  return (
    <>
      {View ? <View activeView={activeView} /> : <MissingView activeView={activeView} />}
    </>
  );
}

function MissingView({ activeView }: { activeView: string }) {
  return (
    <section className="workspace">
      <div className="panel">
        <PanelNotice kind="error" title="页面未注册" text={`未找到 ${activeView} 对应的前端模块。`} />
      </div>
    </section>
  );
}
