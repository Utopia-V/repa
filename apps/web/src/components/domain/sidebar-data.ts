import { BookOpen, Flag, History, LayoutGrid } from "lucide-react";

export const workspaceSections = [
  { path: "goals", label: "Goals", icon: Flag },
  { path: "wiki", label: "Wiki", icon: BookOpen },
  { path: "sources", label: "Sources 知识图", icon: LayoutGrid },
  { path: "history", label: "History", icon: History },
] as const;

/** 仅用于呈现 sidebar 的示例会话，不代表后端已有会话。 */
export const exampleConversations = [
  { id: "demo-os-exam", title: "OS Exam Prep" },
  { id: "demo-algorithm", title: "Algorithm Research" },
  { id: "demo-system-design", title: "System Design Notes" },
] as const;
