import {
  Bell,
  CheckCircle2,
  CircleDot,
  Flag,
  GitBranch,
  MessageSquare,
  Package,
  Rocket,
  Square,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

// Icon per Claude Code hook event type (mirrors the emoji table in the
// reference app's README) plus our own stage_transition type (PRD §3).
// PostToolUse is the one type that inherently signals success — it gets the
// reserved "good" status color; every other type stays neutral (status
// colors are reserved and never used for plain identity — dataviz skill).
const EVENT_TYPE_ICON: Record<string, LucideIcon> = {
  PreToolUse: Wrench,
  PostToolUse: CheckCircle2,
  Notification: Bell,
  Stop: Square,
  SubagentStop: Users,
  PreCompact: Package,
  UserPromptSubmit: MessageSquare,
  SessionStart: Rocket,
  SessionEnd: Flag,
  stage_transition: GitBranch,
}

export function getEventTypeIcon(eventType: string): LucideIcon {
  return EVENT_TYPE_ICON[eventType] ?? CircleDot
}

export function isSuccessEvent(eventType: string): boolean {
  return eventType === 'PostToolUse'
}
