import { Navigate, Route, Routes } from "react-router-dom";
import { HomeScreen } from "../features/home/HomeScreen";
import { OverviewScreen } from "../features/overview/OverviewScreen";
import { PlanningScreen } from "../features/plan/PlanningScreen";
import { StudyHomeScreen } from "../features/study/StudyHomeScreen";
import { ReviewScreen } from "../features/review/ReviewScreen";
import { StudyScreen } from "../features/study/StudyScreen";
import { JourneyScreen } from "../features/study/JourneyScreen";
import { TestScreen } from "../features/test/TestScreen";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { CalendarScreen } from "../features/calendar/CalendarScreen";
import { KnowledgeMapScreen } from "../features/map/KnowledgeMapScreen";
import { InterleavedStudyScreen } from "../features/study/InterleavedStudyScreen";
import { WorkspaceLayout } from "./shell/WorkspaceLayout";

/**
 * App routes (User Flows navigation map). A subject has exactly three pages —
 * Overview, Plan, Study — rendered inside WorkspaceLayout (horizontal nav).
 * Sessions (study/test/review) are sub-flows reached by buttons, not nav items.
 * Old sidebar paths redirect so saved links keep working.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/interleaved" element={<InterleavedStudyScreen />} />
      <Route path="/calendar" element={<CalendarScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />

      <Route path="/subject/:subjectId" element={<WorkspaceLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewScreen />} />
        <Route path="plan" element={<PlanningScreen />} />
        <Route path="study" element={<StudyHomeScreen />} />
        <Route path="study/session" element={<StudyScreen />} />
        <Route path="study/journey" element={<JourneyScreen />} />
        <Route path="study/test" element={<TestScreen />} />
        <Route path="review" element={<ReviewScreen />} />
        <Route path="map" element={<KnowledgeMapScreen />} />

        {/* Legacy sidebar paths → their new home. */}
        <Route path="timeline" element={<Navigate to="../plan" replace />} />
        <Route path="sources" element={<Navigate to="../overview" replace />} />
        <Route path="content" element={<Navigate to="../study" replace />} />
        <Route path="dashboard" element={<Navigate to="../overview" replace />} />
        <Route path="ask" element={<Navigate to="../study" replace />} />
        <Route path="diagrams" element={<Navigate to="../study" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
