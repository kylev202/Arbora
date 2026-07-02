import type { RadioOption } from "../../components";
import type { AIPreset, StudyGoal } from "../../lib/types";

/** AI machine presets (🌱/🌿/🌳) shared by Settings (S-09) and Onboarding (S-10). */
export const PRESET_OPTIONS: RadioOption<AIPreset>[] = [
  {
    value: "low",
    label: "Light",
    icon: <span aria-hidden="true">🌱</span>,
    description: "RAM ≤ 8 GB · ~3B model + Whisper tiny. Works on modest laptops.",
  },
  {
    value: "medium",
    label: "Medium",
    icon: <span aria-hidden="true">🌿</span>,
    description: "RAM ~16 GB · ~7B model + Whisper base. Balanced quality and speed.",
  },
  {
    value: "high",
    label: "Full",
    icon: <span aria-hidden="true">🌳</span>,
    description: "RAM ≥ 32 GB · 14B+ model + Whisper small. Best quality.",
  },
];

/** RAM → recommended preset. Callers pass real device RAM (api.getSystemInfo). */
export function recommendedPreset(ramGb: number): AIPreset {
  if (ramGb <= 8) return "low";
  if (ramGb < 32) return "medium";
  return "high";
}

/** Study-goal options (user_profile.goal), shared by Onboarding and Settings. */
export const GOAL_OPTIONS: RadioOption<StudyGoal>[] = [
  {
    value: "pass",
    label: "Pass my courses",
    description: "A lighter plan: cover what matters, keep the load gentle.",
  },
  {
    value: "high_gpa",
    label: "Aim for a high GPA",
    description: "A more thorough plan: start earlier before deadlines, review more.",
  },
];
