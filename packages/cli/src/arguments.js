export function normalizeScriptArguments(argumentsList) {
  return argumentsList.filter((argument) => argument !== '--');
}

export function previewCommand(projectPath) {
  return `pnpm run preview -- ${projectPath}`;
}
