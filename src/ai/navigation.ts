export type AiNavigationHooks = {
  openRequest: (requestId: string) => void;
  openFunction: (functionId: string) => void;
};

let hooks: AiNavigationHooks | null = null;

export function setAiNavigation(next: AiNavigationHooks) {
  hooks = next;
}

export function navigateToRequest(requestId: string) {
  hooks?.openRequest(requestId);
}

export function navigateToFunction(functionId: string) {
  hooks?.openFunction(functionId);
}
