// 世界坐标系（单位：米）：x 向右（深入橱窗），y 向上。
// 玻璃在 x=0，后墙在 x=3，顾客视点在 x<0 的街道一侧。

export const WIN = {
  glassX: 0,      // 玻璃所在平面
  backX: 3,       // 后墙
  floorY: 0,      // 窗台地台
  topY: 2.8,      // 橱窗内顶
  sillY: 0.35,    // 窗台上沿（玻璃开口下沿）
  headerY: 2.55,  // 窗楣下沿（玻璃开口上沿）
};

export const LAYERS = [
  { id: 'near', name: '近景', x0: 0, x1: 1 },
  { id: 'mid',  name: '中景', x0: 1, x1: 2 },
  { id: 'far',  name: '远景', x0: 2, x1: 3 },
];

export const EYE_MIN_H = 0.8;
export const EYE_MAX_H = 2.3;

export function layerOf(x) {
  return LAYERS.find((l) => x >= l.x0 && x < l.x1) || LAYERS[LAYERS.length - 1];
}

const DEG = Math.PI / 180;

// 道具局部坐标（中心为原点）→ 世界坐标
export function localToWorld(item, lx, ly) {
  const r = (item.rot || 0) * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return {
    x: item.cx + lx * c - ly * s,
    y: item.cy + lx * s + ly * c,
  };
}

export function itemCorners(item) {
  const hw = item.w / 2;
  const hh = item.h / 2;
  return [
    localToWorld(item, -hw, -hh),
    localToWorld(item, hw, -hh),
    localToWorld(item, hw, hh),
    localToWorld(item, -hw, hh),
  ];
}

export function itemBBox(item) {
  const cs = itemCorners(item);
  const xs = cs.map((p) => p.x);
  const ys = cs.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function fitsInWindow(item, eps = 1e-6) {
  const b = itemBBox(item);
  return (
    b.minX >= WIN.glassX - eps &&
    b.maxX <= WIN.backX + eps &&
    b.minY >= WIN.floorY - eps &&
    b.maxY <= WIN.topY + eps
  );
}

// 拖拽后调用：把道具平移回窗框内（不修改旋转）
export function clampToWindow(item) {
  const b = itemBBox(item);
  const winW = WIN.backX - WIN.glassX;
  const winH = WIN.topY - WIN.floorY;
  let dx = 0;
  let dy = 0;
  if (b.maxX - b.minX >= winW) {
    dx = (WIN.glassX + WIN.backX) / 2 - item.cx;
  } else if (b.minX < WIN.glassX) {
    dx = WIN.glassX - b.minX;
  } else if (b.maxX > WIN.backX) {
    dx = WIN.backX - b.maxX;
  }
  if (b.maxY - b.minY >= winH) {
    dy = (WIN.floorY + WIN.topY) / 2 - item.cy;
  } else if (b.minY < WIN.floorY) {
    dy = WIN.floorY - b.minY;
  } else if (b.maxY > WIN.topY) {
    dy = WIN.topY - b.maxY;
  }
  return { ...item, cx: item.cx + dx, cy: item.cy + dy };
}

// 判断从 eye 到 (tx, ty) 的视线是否被挡住。
// occluders: [{ name, cx, top, bottom }]，只含比目标更靠近玻璃的道具。
// 返回遮挡物（{ name } 或 { name: '窗框' }），未被挡返回 null。
export function rayOccluder(eye, tx, ty, occluders) {
  const dxTotal = tx - eye.x;
  if (dxTotal <= 0) return null;

  // 1) 视线必须先穿过玻璃开口，否则被窗台 / 窗楣挡住
  const tGlass = (WIN.glassX - eye.x) / dxTotal;
  const yGlass = eye.y + (ty - eye.y) * tGlass;
  if (yGlass < WIN.sillY || yGlass > WIN.headerY) return { name: '窗框' };

  // 2) 与前层道具的竖直区间做相交判断
  for (const o of occluders) {
    const t = (o.cx - eye.x) / dxTotal;
    if (t <= 0 || t >= 1) continue;
    const y = eye.y + (ty - eye.y) * t;
    if (y >= o.bottom && y <= o.top) return o;
  }
  return null;
}

// 对每个道具沿其可见高度采样若干条视线，统计可见比例。
// 返回 { [itemId]: { frac: 0~1, blockers: [名字...] } }
export function computeVisibility(items, eye) {
  const boxes = items.map((it) => {
    const b = itemBBox(it);
    return { id: it.id, name: it.label, cx: it.cx, top: b.maxY, bottom: b.minY };
  });
  const result = {};
  const N = 48;
  for (const it of items) {
    const b = itemBBox(it);
    const occluders = boxes.filter((o) => o.id !== it.id && o.cx < it.cx - 1e-9);
    let visible = 0;
    const counts = {};
    for (let i = 0; i < N; i++) {
      const y = b.minY + ((b.maxY - b.minY) * (i + 0.5)) / N;
      const blk = rayOccluder(eye, it.cx, y, occluders);
      if (blk) counts[blk.name] = (counts[blk.name] || 0) + 1;
      else visible++;
    }
    const blockers = Object.entries(counts)
      .sort((a, b2) => b2[1] - a[1])
      .map(([name]) => name);
    result[it.id] = { frac: visible / N, blockers };
  }
  return result;
}
