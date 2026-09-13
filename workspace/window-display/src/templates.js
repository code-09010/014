// 道具模板与默认演示方案
export const TEMPLATES = [
  { type: 'mannequin', label: '人台', w: 0.42, h: 1.72, color: '#e9c49b' },
  { type: 'lightbox', label: '灯箱', w: 0.16, h: 1.25, color: '#ffd166' },
  { type: 'stand', label: '展台', w: 0.7, h: 0.72, color: '#9aa5b1' },
  { type: 'crate', label: '木箱', w: 0.52, h: 0.52, color: '#b08968' },
  { type: 'plant', label: '绿植', w: 0.46, h: 1.0, color: '#6a994e' },
  { type: 'rack', label: '货架', w: 0.62, h: 1.5, color: '#8d99ae' },
];

let seq = 1;
export function makeItem(tpl, pos, label) {
  return {
    id: `it_${Date.now()}_${seq++}`,
    type: tpl.type,
    label: label || tpl.label,
    w: tpl.w,
    h: tpl.h,
    color: tpl.color,
    rot: 0,
    ...pos,
  };
}

// 默认方案：近景灯箱压住人台上半身、木箱+窗台挡住低处，演示「看不全」
export function defaultItems() {
  const T = Object.fromEntries(TEMPLATES.map((t) => [t.type, t]));
  return [
    makeItem(T.mannequin, { cx: 2.6, cy: 0.86 }, '主推人台'),
    makeItem(T.plant, { cx: 1.9, cy: 0.5 }),
    makeItem(T.stand, { cx: 1.5, cy: 0.36 }),
    makeItem(T.lightbox, { cx: 0.45, cy: 2.0 }),
    makeItem(T.crate, { cx: 0.55, cy: 0.26 }),
  ];
}
