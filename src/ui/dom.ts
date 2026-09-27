/** Tiny DOM helpers so panels read as markup, not as createElement soup. */
export type Child = Node | string | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((e: Event) => void) | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** Buttons stop pointer events from reaching the game canvas underneath. */
export function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = h('button', { class: cls, onclick: () => onClick() }, label);
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
}
