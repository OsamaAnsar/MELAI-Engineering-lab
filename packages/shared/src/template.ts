const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

export class MissingTemplateVariableError extends Error {
  constructor(public readonly variable: string) {
    super(`Missing template variable: ${variable}`);
    this.name = "MissingTemplateVariableError";
  }
}

/** Names referenced by `{{ placeholders }}` in a template, in first-seen order. */
export function templateVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name) seen.add(name);
  }
  return [...seen];
}

/** Substitutes every `{{ name }}` with `values[name]`; throws if any are missing. */
export function resolveTemplate(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_full, rawName: string) => {
    const name = rawName.trim();
    if (!(name in values)) throw new MissingTemplateVariableError(name);
    return values[name] ?? "";
  });
}
