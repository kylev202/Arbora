import { Outlet, useLocation, useParams } from "react-router-dom";
import { useSettings } from "../settings";
import { useAsync } from "../../lib/useAsync";
import { api } from "../../lib/api";
import { TopBar } from "./TopBar";
import { Breadcrumb, type Crumb } from "./Breadcrumb";
import { SubjectNav } from "./SubjectNav";
import styles from "./WorkspaceLayout.module.css";

const SECTION_LABELS: Record<string, string> = {
  overview: "Overview",
  plan: "Plan",
  study: "Study",
  review: "Review",
  map: "Map",
};

/**
 * Frame for everything under /subject/:subjectId — top bar + the combined
 * Home/Calendar + subject-page nav strip + the active page via <Outlet>.
 * Focus mode (Settings) drops the strip and restores the top bar's center nav.
 */
export function WorkspaceLayout() {
  const { subjectId = "" } = useParams();
  const location = useLocation();
  const { focusMode } = useSettings();

  const subject = useAsync(() => api.getSubject(subjectId), [subjectId]);
  const dashboard = useAsync(() => api.getSubjectDashboard(subjectId), [subjectId]);
  const reviewQueue = useAsync(() => api.getReviewQueue(subjectId), [subjectId]);

  const subjectName = subject.data?.name ?? "…";
  const section = location.pathname.split("/")[3] ?? "overview";
  const sectionLabel = SECTION_LABELS[section] ?? "Overview";

  const crumbs: Crumb[] = [
    { label: "Home", to: "/" },
    { label: subjectName, to: `/subject/${subjectId}/overview` },
    { label: sectionLabel },
  ];

  const badges = {
    review: reviewQueue.data?.length ?? 0,
    today: dashboard.data?.stats.due_today ?? 0,
  };

  return (
    <div className={styles.shell}>
      <TopBar breadcrumb={<Breadcrumb crumbs={crumbs} />} hideNav={!focusMode} />
      {!focusMode && <SubjectNav subjectId={subjectId} badges={badges} />}
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
