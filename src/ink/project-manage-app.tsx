import { ProjectLaunchApp, type ProjectLaunchAppProps, type ProjectLaunchResult } from './project-launch-app.js'

export type ProjectManageResult = ProjectLaunchResult

export function ProjectManageApp(props: ProjectLaunchAppProps) {
  return <ProjectLaunchApp {...props} />
}
