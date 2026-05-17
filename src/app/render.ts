type RenderFn = () => void;

let renderApp: RenderFn = () => {};

export function setRenderApp(fn: RenderFn) {
  renderApp = fn;
}

export function render() {
  renderApp();
}
