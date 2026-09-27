export interface Chip {
  id: string;
  label: string;
  className?: string;
}

export interface PanelRow {
  id: string;
  label: string;
  chips: Chip[];
  /** Highlight the active chip. */
  radio?: boolean;
  onPick: (id: string) => void;
}

/** Thumb-friendly rows of buttons at the bottom of the screen. */
export class Panel {
  readonly root: HTMLDivElement;
  private readonly rows = new Map<string, HTMLDivElement>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'panel';
    parent.appendChild(this.root);
  }

  addRow(row: PanelRow): void {
    const el = document.createElement('div');
    el.className = 'row';
    el.dataset.row = row.id;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = row.label;
    el.appendChild(label);
    for (const chip of row.chips) {
      const b = document.createElement('button');
      b.className = 'chip' + (chip.className ? ' ' + chip.className : '');
      b.textContent = chip.label;
      b.dataset.id = chip.id;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => {
        if (row.radio) this.setActive(row.id, chip.id);
        row.onPick(chip.id);
      });
      el.appendChild(b);
    }
    this.root.appendChild(el);
    this.rows.set(row.id, el);
  }

  setActive(rowId: string, chipId: string | null): void {
    const el = this.rows.get(rowId);
    if (!el) return;
    for (const b of el.querySelectorAll<HTMLButtonElement>('button.chip')) {
      b.classList.toggle('on', b.dataset.id === chipId);
    }
  }

  setToggled(rowId: string, chipId: string, on: boolean): void {
    const el = this.rows.get(rowId);
    const b = el?.querySelector<HTMLButtonElement>(`button.chip[data-id="${chipId}"]`);
    b?.classList.toggle('on', on);
  }
}

export function el(parent: HTMLElement, className: string, html = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  d.innerHTML = html;
  parent.appendChild(d);
  return d;
}
