import { requireAdminPage } from "../../../src/server/admin/rbac";
import { AdminPageHeader } from "../_components/ui";
import { SystemStatusPanel } from "./system-status-panel";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  await requireAdminPage("support");
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="حالة النظام"
        description="فحوصات حيّة للخدمات والاعتمادات. يتم التحديث كل ٣٠ ثانية أو يدويًا."
      />
      <div className="wk-elevate-1 max-w-2xl rounded-md p-4">
        <SystemStatusPanel initialPollMs={30000} />
      </div>
    </div>
  );
}
