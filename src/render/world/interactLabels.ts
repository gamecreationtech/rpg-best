import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial, RingGeometry, Scene } from 'three';
import type { Interactable, InteractableKind } from '../../sim/types';
import type { Viewport } from '../viewport';

export const INTERACT_INFO: Record<InteractableKind, { name: string; verb: string; color: number }> = {
  vendor: { name: 'Merchant', verb: 'trade', color: 0xffd060 },
  stash: { name: 'Stash', verb: 'open', color: 0xe0a060 },
  forge: { name: 'Forge of Heaven', verb: 'smelt', color: 0xffe066 },
  bloodfountain: { name: 'Blood Fountain', verb: 'sacrifice', color: 0xff5050 },
  arcana: { name: 'Arcana Oracle', verb: 'enchant', color: 0xc080ff },
  waypoint: { name: 'Waypoint', verb: 'travel', color: 0xffd060 },
  town_portal: { name: 'Portal to Town', verb: 'enter', color: 0xb070ff },
  return_portal: { name: 'Portal to the Proving Grounds', verb: 'enter', color: 0x6fa8ff },
};

/**
 * Name tags and ground rings for merchants, stations and portals. A tag shows on
 * whatever the mouse points at and on whatever the hero stands next to.
 */
export class InteractLabels {
  private readonly root: HTMLDivElement;
  private readonly els = new Map<number, HTMLDivElement>();
  private readonly rings: Mesh[] = [];
  private readonly tmp = { x: 0, y: 0 };
  private time = 0;

  constructor(parent: HTMLElement, private readonly view: Viewport, scene: Scene, private readonly touch: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'interact-layer';
    parent.appendChild(this.root);
    const geo = new RingGeometry(0.82, 1, 48);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(geo, new MeshBasicMaterial({ transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
      m.visible = false;
      m.position.y = 0.07;
      scene.add(m);
      this.rings.push(m);
    }
  }

  /** `near` is the interactable in reach, `hover` the one under the mouse. */
  update(dt: number, interactables: Interactable[], near: Interactable | null, hover: Interactable | null): void {
    this.time += dt;
    const shown = new Set<number>();
    const targets: [Interactable | null, Mesh, boolean][] = [[near, this.rings[0]!, true], [hover, this.rings[1]!, false]];
    for (const [it, ring, isNear] of targets) {
      if (!it) {
        ring.visible = false;
        continue;
      }
      const info = INTERACT_INFO[it.kind];
      ring.visible = true;
      ring.position.set(it.x, 0.07, it.z);
      ring.scale.setScalar(Math.max(0.9, it.radius) * (isNear ? 1 + Math.sin(this.time * 5) * 0.06 : 1));
      (ring.material as MeshBasicMaterial).color.setHex(info.color).multiplyScalar(isNear ? 0.9 : 0.5);
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
      if (this.view.project(it.x, 2.6, it.z, this.tmp)) {
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
    for (const r of this.rings) r.visible = false;
  }
}
