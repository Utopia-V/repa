import type { InstanceContext } from "@/project/instance-context"

export function workspaceReadIdentity(instance: InstanceContext) {
  return JSON.stringify({
    projectID: instance.project.id,
    directory: instance.directory,
    worktree: instance.worktree,
  })
}
