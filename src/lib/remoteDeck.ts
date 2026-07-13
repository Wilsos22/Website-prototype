import type { TeacherRemoteAction } from "@/lib/liveClassFlow";

export interface RemoteDeckButton {
  action: TeacherRemoteAction;
  label: string;
  detail: string;
  tone: string;
}

export interface AbbieRemoteDeckButton extends RemoteDeckButton {
  direction: string;
}

export const ABBIE_REMOTE_BUTTONS: readonly AbbieRemoteDeckButton[] = [
  {
    action: "abbie-hype",
    label: "Hype us up",
    detail: "Start with energy",
    tone: "orange",
    direction: "Pump up the class. We are about to get into it. Bring real energy and keep it short.",
  },
  {
    action: "abbie-goal",
    label: "Today's goal",
    detail: "Explain the purpose",
    tone: "teal",
    direction: "Tell the class what we are working on today and why it is worth their time. Use the learning intention and make it land.",
  },
  {
    action: "abbie-move",
    label: "Move us on",
    detail: "Transition the room",
    tone: "blue",
    direction: "Wrap up what we are doing and push the class to the next thing. Keep it moving.",
  },
  {
    action: "abbie-settle",
    label: "Settle the room",
    detail: "Refocus students",
    tone: "gold",
    direction: "The room is getting loud. Pull them back and refocus them. Be deadpan, not a nag.",
  },
  {
    action: "abbie-roast",
    label: "Roast dad",
    detail: "One clean joke",
    tone: "purple",
    direction: "Roast dad for the class about something true, such as the Red Bulls, dancing, slang, or his knees. One clean burn.",
  },
  {
    action: "abbie-stuck",
    label: "We are stuck",
    detail: "Encourage persistence",
    tone: "green",
    direction: "The class is stuck and getting frustrated. Remind them that being confused is step one and nudge them to try something.",
  },
];

export const SOUND_REMOTE_BUTTONS: readonly RemoteDeckButton[] = [
  {
    action: "play-warning",
    label: "30 second alert",
    detail: "Play the warning cue",
    tone: "gold",
  },
  {
    action: "play-countdown",
    label: "Countdown tick",
    detail: "Play one tick",
    tone: "blue",
  },
  {
    action: "play-times-up",
    label: "Time is up",
    detail: "Play the ending cue",
    tone: "red",
  },
];

export function abbieDirectionForRemoteAction(action: TeacherRemoteAction): string | null {
  return ABBIE_REMOTE_BUTTONS.find((button) => button.action === action)?.direction ?? null;
}
