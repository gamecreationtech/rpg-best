import type { Interactable, InteractableKind } from '../sim/types';
import type { Projector } from './camera';

export const INTERACT_INFO: Record<InteractableKind, { name: string; verb: string; color: number }> = {
  vendor: { name: 'Merchant', verb: 'trade', color: 0xffd060 },
  stash: { name: 'Stash', verb: 'open', color: 0xe0a060 },
  forge: { name: 'Forge of Heaven', verb: 'smelt', color: 0xffe066 },
  bloodfountain: { name: 'Blood Fountain', verb: 'sacrifice', color: 0xff5050 },
  arcana: { name: 'Arcana Oracle', verb: 'enchant', color: 0xc080ff },
  gate_normal: { name: 'Normal Gate', verb: 'travel', color: 0xffd060 },
  gate_nightmare: { name: 'Nightmare Gate', verb: 'travel', color: 0xa070ff },
  gate_hell: { name: 'Hell Gate', verb: 'travel', color: 0xff3040 },
  gate_inferno: { name: 'Inferno Gate', verb: 'travel', color: 0xff8a20 },
  town_portal: { name: 'Portal to the Telecenter', verb: 'enter', color: 0xb070ff },
  return_portal: { name: 'Portal to the Proving Grounds', verb: 'enter', color: 0x6fa8ff },
};

/**
 * Name tags for merchants, stations and portals. A tag shows on whatever the
 * mouse points at and on whatever the hero stands next to. The view draws the
 * matching floor rings.
 */
export class InteractLabels {
  private readonly root: HTMLDivElement;
  private readonly els = new Map<number, HTMLDivElement>();
  private readonly tmp = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private readonly view: Projector, private readonly touch: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'interact-layer';
    parent.appendChild(this.root);
  }

  /** `near` is the interactable in reach, `hover` the one under the mouse. */
  update(interactables: Interactable[], near: Interactable | null, hover: Interactable | null): void {
    const shown = new Set<number>();
    for (const it of [near, hover]) {
      if (!it) continue;
      const info = INTERACT_INFO[it.kind];
      if (shown.has(it.id)) continue;
      shown.add(it.id);
      let el = this.els.get(it.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'interact-label';
        this.root.appendChild(el);
        this.els.set(it.id, el);
      }
      const inReach = near?.id === it.id;
      const how = this.touch ? (inReach ? `Tap to ${info.verb}` : `Tap to walk over and ${info.verb}`) : inReach ? `Press F to ${info.verb}` : `Click to walk over and ${info.verb}`;
      el.innerHTML = `<b style="color:#${info.color.toString(16).padStart(6, '0')}">${info.name}</b><span>${how}</span>`;
      el.classList.toggle('near', inReach);
      // A gate's arch stands twice as tall as the other stations, so its tag floats higher
      if (this.view.project(it.x, it.kind.startsWith('gate_') ? 5.6 : 3.2, it.z, this.tmp)) {
        el.style.display = 'block';
        el.style.transform = `translate(-50%, -100%) translate(${this.tmp.x.toFixed(0)}px, ${this.tmp.y.toFixed(0)}px)`;
      } else {
        el.style.display = 'none';
      }
    }
    for (const [id, el] of this.els) {
      if (!shown.has(id) || !interactables.some((i) => i.id === id && i.active)) {
        el.remove();
        this.els.delete(id);
      }
    }
  }

  clear(): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}
