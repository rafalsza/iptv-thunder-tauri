// UTILS - Visibility utilities

export function isVisible(el: HTMLElement): boolean {
  const style = globalThis.getComputedStyle(el);

  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity) < 0.1
  ) return false;

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function filterVisibleElements(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter(isVisible);
}

export function isElementInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (globalThis.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (globalThis.innerWidth || document.documentElement.clientWidth)
  );
}

export function isElementPartiallyInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < (globalThis.innerHeight || document.documentElement.clientHeight) &&
    rect.left < (globalThis.innerWidth || document.documentElement.clientWidth) &&
    rect.bottom > 0 &&
    rect.right > 0
  );
}
