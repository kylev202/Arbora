import { Navigate, Route, Routes } from "react-router-dom";
import { HomeScreen } from "../features/home/HomeScreen";
import { SourcesTab } from "../features/workspace/SourcesTab";
import { ContentTab } from "../features/workspace/ContentTab";
import { StudyTab } from "../features/workspace/StudyTab";
import { ReviewScreen } from "../features/review/ReviewScreen";
import { StudyScreen } from "../features/study/StudyScreen";
import { TimelineScreen } from "../features/timeline/TimelineScreen";
import { PlanScreen } from "../features/plan/PlanScreen";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { WorkspaceLayout } from "./shell/WorkspaceLayout";

/**
 * App routes (User Flows navigation map). Screens under /subject/:id render
 * inside WorkspaceLayout (sidebar + breadcrumb); Home and Settings are top-level.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />

      <Route path="/subject/:subjectId" element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="timeline" replace />} />
        <Route path="timeline" element={<TimelineScreen />} />
        <Route path="sources" element={<SourcesTab />} />
        <Route path="content" element={<ContentTab />} />
        <Route path="study" element={<StudyTab />} />
        <Route path="study/session" element={<StudyScreen />} />
        <Route path="review" element={<ReviewScreen />} />
        <Route path="plan" element={<PlanScreen />} />
        <Route path="dashboard" element={<DashboardScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
