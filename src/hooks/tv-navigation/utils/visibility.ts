// UTILS - Visibility utilities

export function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);

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
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

export function isElementPartiallyInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
    rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
    rect.bottom > 0 &&
    rect.right > 0
  );
}
