import type { DecisionPlayerPhaseWorkspace } from "../../types";

export type MilitaryActionOption = DecisionPlayerPhaseWorkspace["militaryWorkspace"]["availableMilitaryActions"][number];

const REMOVED_MILITARY_ACTION_IDS = new Set(["naval_drill"]);

export function isVisibleMilitaryAction(action: MilitaryActionOption): boolean {
  return !REMOVED_MILITARY_ACTION_IDS.has(action.actionId);
}

export function visibleMilitaryActions(actions: MilitaryActionOption[]): MilitaryActionOption[] {
  return actions.filter(isVisibleMilitaryAction);
}
