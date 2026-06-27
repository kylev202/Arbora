import { Outlet, useLocation, useParams } from "react-router-dom";
import { useSettings } from "../settings";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { TopBar } from "./TopBar";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { Sidebar } from "./Sidebar";
import styles from "./WorkspaceLayout.module.css";

const SECTION_LABELS: Record<string, string> = {
  timeline: "Timeline",
  sources: "Sources",
  content: "Content",
  study: "Study",
  review: "Review",
  plan: "Plan",
  dashboard: "Dashboard",
  ask: "Ask",
  map: "Map",
  diagrams: "Diagrams",
};

/**
 * Frame for everything under /subject/:subjectId — top bar + breadcrumb +
 * section sidebar + the active tab via <Outlet>. Focus mode (Settings) drops
 * the sidebar so the user sees only the current task.
 */
export function WorkspaceLayout() {
  const { subjectId = "" } = useParams();
  const location = useLocation();
  const { focusMode } = useSettings();

  const subject = useAsync(() => api.getSubject(subjectId), [subjectId]);
  const dashboard = useAsync(() => api.getSubjectDashboard(subjectId), [subjectId]);
  const reviewQueue = useAsync(() => api.getReviewQueue(subjectId), [subjectId]);

  const subjectName = subject.data?.name ?? "…";
  const section = location.pathname.split("/")[3] ?? "timeline";
  const sectionLabel = SECTION_LABELS[section] ?? "Timeline";

  const crumbs: Crumb[] = [
    { label: "Home", to: "/" },
    { label: subjectName, to: `/subject/${subjectId}/timeline` },
    { label: sectionLabel },
  ];

  const badges = {
    review: reviewQueue.data?.length ?? 0,
    today: dashboard.data?.stats.due_today ?? 0,
  };

  return (
    <div className={styles.shell}>
      <TopBar breadcrumb={<Breadcrumb crumbs={crumbs} />} />
      <div className={styles.body}>
        {!focusMode && <Sidebar subjectId={subjectId} badges={badges} />}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
