export interface NewSessionProject {
  path: string | null
}

export function newSessionParams(project: NewSessionProject | null) {
  return {
    cols: 80,
    source: 'mikey-ios',
    ...(project?.path ? { cwd: project.path } : {})
  }
}
