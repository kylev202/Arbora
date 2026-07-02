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
import { CalendarScreen } from "../features/calendar/CalendarScreen";
import { ChatScreen } from "../features/chat/ChatScreen";
import { KnowledgeMapScreen } from "../features/map/KnowledgeMapScreen";
import { InterleavedStudyScreen } from "../features/study/InterleavedStudyScreen";
import { DiagramsScreen } from "../features/diagrams/DiagramsScreen";
import { WorkspaceLayout } from "./shell/WorkspaceLayout";

/**
 * App routes (User Flows navigation map). Screens under /subject/:id render
 * inside WorkspaceLayout (sidebar + breadcrumb); Home and Settings are top-level.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/interleaved" element={<InterleavedStudyScreen />} />
      <Route path="/calendar" element={<CalendarScreen />} />
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
        <Route path="ask" element={<ChatScreen />} />
        <Route path="map" element={<KnowledgeMapScreen />} />
        <Route path="diagrams" element={<DiagramsScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
