import { useEffect, useRef } from 'react';
import {
  WIN,
  LAYERS,
  EYE_MIN_H,
  EYE_MAX_H,
  itemBBox,
  itemCorners,
  clampToWindow,
  fitsInWindow,
  computeVisibility,
  rayOccluder,
  localToWorld,
} from './geometry';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function Stage({
  items,
  eye, // { h, dist }
  selectedId,
  readOnly = false,
  onItemsChange,
  onEyeChange,
  onSelect,
  onNotify,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const trRef = useRef(null);
  const dragRef = useRef(null);
  const dprRef = useRef(1);
  // 事件回调里需要读到最新 props
  const stateRef = useRef({});
  stateRef.current = { items, eye, selectedId, readOnly, onItemsChange, onEyeChange, onSelect, onNotify };

  // ---------- 绘制 ----------
  const drawRef = useRef(() => {});
  drawRef.current = () => {
    const cv = canvasRef.current;
    if (!cv || !cv.width) return;
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    const u = dprRef.current;
    const { items, eye, selectedId, readOnly } = stateRef.current;
    const eyePos = { x: -eye.dist, y: eye.h };

    const view = {
      minX: -(eye.dist + 0.8),
      maxX: WIN.backX + 0.4,
      minY: -0.34,
      maxY: WIN.topY + 0.5,
    };
    const scale = Math.min(W / (view.maxX - view.minX), H / (view.maxY - view.minY));
    const ox = (W - scale * (view.maxX - view.minX)) / 2;
    const oy = (H - scale * (view.maxY - view.minY)) / 2;
    const tr = {
      scale,
      x: (wx) => ox + (wx - view.minX) * scale,
      y: (wy) => H - oy - (wy - view.minY) * scale,
      inv: (sx, sy) => ({
        x: view.minX + (sx - ox) / scale,
        y: view.minY + (H - oy - sy) / scale,
      }),
    };
    trRef.current = tr;

    const rectW = (x0, y0, x1, y1, fill) => {
      ctx.fillStyle = fill;
      const a = tr.x(x0);
      const b = tr.y(y1);
      ctx.fillRect(a, b, (x1 - x0) * scale, (y1 - y0) * scale);
    };
    const line = (x0, y0, x1, y1, stroke, lw = 1, dash = null) => {
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(tr.x(x0), tr.y(y0));
      ctx.lineTo(tr.x(x1), tr.y(y1));
      ctx.stroke();
      ctx.restore();
    };
    const text = (str, wx, wy, color, size = 12, align = 'center') => {
      ctx.fillStyle = color;
      ctx.font = `${size * u}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(str, tr.x(wx), tr.y(wy));
    };

    // 背景
    ctx.fillStyle = '#1d2129';
    ctx.fillRect(0, 0, W, H);
    // 街道地面
    rectW(view.minX, view.minY, WIN.glassX, WIN.floorY, '#272c36');
    // 橱窗内部
    rectW(WIN.glassX, WIN.floorY, WIN.backX, WIN.topY, '#f4ecdd');
    // 橱窗地台
    rectW(WIN.glassX, view.minY, WIN.backX, WIN.floorY, '#d9cdb6');

    // 视线可及区域（透过玻璃开口的视锥）
    const tB = (WIN.backX - eyePos.x) / (WIN.glassX - eyePos.x);
    const ySillB = eyePos.y + (WIN.sillY - eyePos.y) * tB;
    const yHeadB = eyePos.y + (WIN.headerY - eyePos.y) * tB;
    const poly = (pts, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(tr.x(px), tr.y(py));
        else ctx.lineTo(tr.x(px), tr.y(py));
      });
      ctx.closePath();
      ctx.fill();
    };
    poly(
      [
        [WIN.glassX, WIN.sillY],
        [WIN.glassX, WIN.headerY],
        [WIN.backX, yHeadB],
        [WIN.backX, ySillB],
      ],
      'rgba(255, 214, 102, 0.16)'
    );
    // 窗框遮挡阴影区
    poly(
      [
        [WIN.glassX, WIN.headerY],
        [WIN.glassX, WIN.topY],
        [WIN.backX, WIN.topY],
        [WIN.backX, yHeadB],
      ],
      'rgba(0, 0, 0, 0.10)'
    );
    poly(
      [
        [WIN.glassX, WIN.floorY],
        [WIN.glassX, WIN.sillY],
        [WIN.backX, ySillB],
        [WIN.backX, WIN.floorY],
      ],
      'rgba(0, 0, 0, 0.10)'
    );

    // 三条层带
    LAYERS.forEach((L, i) => {
      rectW(L.x0, WIN.floorY, L.x1, WIN.topY, i % 2 ? 'rgba(90,110,150,0.07)' : 'rgba(90,110,150,0.13)');
      line(L.x0, WIN.floorY, L.x0, WIN.topY, 'rgba(61,52,42,0.25)', 1 * u, [4 * u, 4 * u]);
      text(L.name, (L.x0 + L.x1) / 2, WIN.topY - 0.16, '#8a7d68', 13);
    });
    line(WIN.backX, WIN.floorY, WIN.backX, WIN.topY, 'rgba(61,52,42,0.4)', 2 * u);

    // 玻璃与窗框
    rectW(WIN.glassX - 0.03, WIN.sillY, WIN.glassX + 0.03, WIN.headerY, 'rgba(140,190,235,0.55)');
    rectW(WIN.glassX - 0.07, WIN.floorY, WIN.glassX + 0.07, WIN.sillY, '#5b5348');
    rectW(WIN.glassX - 0.07, WIN.headerY, WIN.glassX + 0.07, WIN.topY, '#5b5348');
    rectW(WIN.glassX, WIN.topY, WIN.backX, WIN.topY + 0.06, '#c9bda6');
    text('玻璃', WIN.glassX + 0.16, WIN.headerY + 0.14, '#7c6f5c', 11, 'left');
    text('后墙', WIN.backX - 0.1, WIN.topY - 0.34, '#8a7d68', 11, 'right');

    // 遮挡计算
    const vis = computeVisibility(items, eyePos);
    const boxes = items.map((it) => {
      const b = itemBBox(it);
      return { id: it.id, name: it.label, cx: it.cx, top: b.maxY, bottom: b.minY };
    });
    const occFor = (it) => boxes.filter((o) => o.id !== it.id && o.cx < it.cx - 1e-9);

    // 视线（每个道具顶、底两条）
    for (const it of items) {
      const b = itemBBox(it);
      const occ = occFor(it);
      for (const y of [b.maxY, b.minY]) {
        const blk = rayOccluder(eyePos, it.cx, y, occ);
        line(
          eyePos.x,
          eyePos.y,
          it.cx,
          y,
          blk ? 'rgba(248, 81, 73, 0.7)' : 'rgba(63, 185, 80, 0.55)',
          1.4 * u
        );
      }
    }

    // 道具（远的先画）
    const sorted = [...items].sort((a, b2) => b2.cx - a.cx);
    for (const it of sorted) {
      const corners = itemCorners(it);
      ctx.save();
      ctx.beginPath();
      corners.forEach((p, i) => {
        if (i === 0) ctx.moveTo(tr.x(p.x), tr.y(p.y));
        else ctx.lineTo(tr.x(p.x), tr.y(p.y));
      });
      ctx.closePath();
      if (it.type === 'lightbox') {
        ctx.shadowColor = 'rgba(255, 209, 102, 0.95)';
        ctx.shadowBlur = 22 * u;
      }
      ctx.fillStyle = it.color;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      corners.forEach((p, i) => {
        if (i === 0) ctx.moveTo(tr.x(p.x), tr.y(p.y));
        else ctx.lineTo(tr.x(p.x), tr.y(p.y));
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(30, 25, 20, 0.5)';
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
      ctx.restore();

      // 类型装饰
      const P = (lx, ly) => {
        const p = localToWorld(it, lx, ly);
        return [tr.x(p.x), tr.y(p.y)];
      };
      const hw = it.w / 2;
      const hh = it.h / 2;
      ctx.lineWidth = 1.2 * u;
      if (it.type === 'mannequin') {
        const [hx, hy] = P(0, hh - 0.15);
        ctx.beginPath();
        ctx.arc(hx, hy, 0.1 * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#f5d7b0';
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,25,20,0.4)';
        ctx.stroke();
      } else if (it.type === 'lightbox') {
        const inset = 0.035;
        const pts = [
          P(-hw + inset, -hh + inset),
          P(hw - inset, -hh + inset),
          P(hw - inset, hh - inset),
          P(-hw + inset, hh - inset),
        ];
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 252, 235, 0.95)';
        ctx.fill();
      } else if (it.type === 'rack') {
        ctx.strokeStyle = 'rgba(30,25,20,0.35)';
        for (const ly of [-hh / 2, 0, hh / 2]) {
          const [ax, ay] = P(-hw + 0.04, ly);
          const [bx, by] = P(hw - 0.04, ly);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      } else if (it.type === 'crate') {
        ctx.strokeStyle = 'rgba(30,25,20,0.3)';
        const d = [
          [P(-hw, -hh), P(hw, hh)],
          [P(hw, -hh), P(-hw, hh)],
        ];
        for (const [[ax, ay], [bx, by]] of d) {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      } else if (it.type === 'stand') {
        const [ax, ay] = P(-hw, hh);
        const [bx, by] = P(hw, hh);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.lineWidth = 1.2 * u;
      } else if (it.type === 'plant') {
        ctx.fillStyle = '#7fb069';
        for (const [lx, ly, r] of [[-0.09, hh - 0.2, 0.14], [0.09, hh - 0.16, 0.14], [0, hh - 0.06, 0.16]]) {
          const [px, py] = P(lx, ly);
          ctx.beginPath();
          ctx.arc(px, py, r * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        const pot = [P(-0.12, -hh), P(0.12, -hh), P(0.1, -hh + 0.24), P(-0.1, -hh + 0.24)];
        ctx.beginPath();
        pot.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = '#a47148';
        ctx.fill();
      }

      // 名称标签（画在包围盒下方）
      const b = itemBBox(it);
      text(it.label, it.cx, b.minY - 0.11, '#4a4234', 11);

      // 遮挡标记
      const v = vis[it.id];
      if (v && v.frac < 0.995) {
        ctx.save();
        ctx.setLineDash([5 * u, 4 * u]);
        ctx.strokeStyle = '#da3633';
        ctx.lineWidth = 1.6 * u;
        ctx.strokeRect(
          tr.x(b.minX) - 3 * u,
          tr.y(b.maxY) - 3 * u,
          (b.maxX - b.minX) * scale + 6 * u,
          (b.maxY - b.minY) * scale + 6 * u
        );
        ctx.restore();
        const pct = Math.round(v.frac * 100);
        const label = v.frac === 0 ? '完全被挡' : `看不全 · 可见${pct}%`;
        ctx.font = `bold ${11 * u}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        const tw = ctx.measureText(label).width + 12 * u;
        const bx = tr.x(it.cx) - tw / 2;
        const by = tr.y(b.maxY) - 22 * u;
        ctx.fillStyle = 'rgba(218, 54, 51, 0.95)';
        ctx.beginPath();
        ctx.roundRect(bx, by, tw, 16 * u, 4 * u);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tr.x(it.cx), by + 8 * u);
      }

      // 选中高亮
      if (it.id === selectedId && !readOnly) {
        ctx.save();
        ctx.beginPath();
        corners.forEach((p, i) => {
          if (i === 0) ctx.moveTo(tr.x(p.x), tr.y(p.y));
          else ctx.lineTo(tr.x(p.x), tr.y(p.y));
        });
        ctx.closePath();
        ctx.strokeStyle = '#4dabf7';
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 顾客视点（街对面的小人）
    const ex = tr.x(eyePos.x);
    const ey = tr.y(eyePos.y);
    line(eyePos.x, 0, eyePos.x, eyePos.y - 0.12, '#8b949e', 2.5 * u);
    ctx.beginPath();
    ctx.arc(ex, ey - 5 * u, 7 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb454';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    if (!readOnly) {
      line(eyePos.x, EYE_MIN_H, eyePos.x, EYE_MAX_H, 'rgba(139,148,158,0.5)', 1 * u, [3 * u, 4 * u]);
    }
    text(`顾客视点 ${eye.h.toFixed(2)}m`, eyePos.x, eyePos.y + 0.22, '#e6edf3', 12);
    text(`隔街 ${eye.dist}m`, eyePos.x / 2 + WIN.glassX / 2, 0.14, '#8b949e', 11);
    if (!readOnly) {
      text('⇕ 拖动小人改视点高度', eyePos.x, view.minY + 0.14, '#8b949e', 11);
    }
  };

  // 尺寸自适应
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current.clientWidth;
      const h = Math.max(400, Math.min(560, w * 0.52));
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvasRef.current.width = w * dpr;
      canvasRef.current.height = h * dpr;
      canvasRef.current.style.height = `${h}px`;
      drawRef.current();
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // 每次渲染后重绘
  useEffect(() => {
    drawRef.current();
  });

  // ---------- 交互 ----------
  const toWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = dprRef.current;
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;
    return trRef.current.inv(sx, sy);
  };

  const hitItem = (wx, wy) => {
    const { items } = stateRef.current;
    const list = [...items].sort((a, b) => a.cx - b.cx); // 近的优先命中
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      const r = (-(it.rot || 0) * Math.PI) / 180;
      const dx = wx - it.cx;
      const dy = wy - it.cy;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= it.w / 2 + 0.06 && Math.abs(ly) <= it.h / 2 + 0.06) return it;
    }
    return null;
  };

  const onPointerDown = (e) => {
    if (stateRef.current.readOnly) return;
    const { eye, onSelect } = stateRef.current;
    const w = toWorld(e);
    canvasRef.current.setPointerCapture(e.pointerId);
    if (Math.abs(w.x - -eye.dist) < 0.3 && Math.abs(w.y - eye.h) < 0.3) {
      dragRef.current = { kind: 'eye' };
      return;
    }
    const it = hitItem(w.x, w.y);
    if (it) {
      onSelect(it.id);
      dragRef.current = { kind: 'item', id: it.id, offX: w.x - it.cx, offY: w.y - it.cy };
    } else {
      onSelect(null);
    }
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const { items, eye, onItemsChange, onEyeChange } = stateRef.current;
    const w = toWorld(e);
    if (d.kind === 'eye') {
      onEyeChange({ ...eye, h: clamp(w.y, EYE_MIN_H, EYE_MAX_H) });
    } else {
      const it = items.find((i) => i.id === d.id);
      if (!it) return;
      const moved = clampToWindow({ ...it, cx: w.x - d.offX, cy: w.y - d.offY });
      onItemsChange(items.map((i) => (i.id === d.id ? moved : i)));
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onDoubleClick = (e) => {
    if (stateRef.current.readOnly) return;
    const { items, onItemsChange, onSelect, onNotify } = stateRef.current;
    const w = toWorld(e);
    const it = hitItem(w.x, w.y);
    if (!it) return;
    onSelect(it.id);
    const cand = { ...it, rot: (it.rot || 0) + 15 };
    if (fitsInWindow(cand)) {
      onItemsChange(items.map((i) => (i.id === it.id ? cand : i)));
    } else {
      onNotify?.('再转会翻出窗框，已阻止旋转');
    }
  };

  // 滚轮微调选中道具的旋转（需要非 passive 监听）
  useEffect(() => {
    const cv = canvasRef.current;
    const handler = (e) => {
      const { selectedId, items, onItemsChange, readOnly, onNotify } = stateRef.current;
      if (readOnly || !selectedId) return;
      const it = items.find((i) => i.id === selectedId);
      if (!it) return;
      e.preventDefault();
      const rot = clamp((it.rot || 0) + (e.deltaY > 0 ? 3 : -3), -80, 80);
      const cand = { ...it, rot };
      if (fitsInWindow(cand)) {
        onItemsChange(items.map((i) => (i.id === it.id ? cand : i)));
      } else {
        onNotify?.('再转会翻出窗框，已阻止旋转');
      }
    };
    cv.addEventListener('wheel', handler, { passive: false });
    return () => cv.removeEventListener('wheel', handler);
  }, []);

  const onKeyDown = (e) => {
    if (stateRef.current.readOnly) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const { selectedId, items, onItemsChange, onSelect } = stateRef.current;
    if (!selectedId) return;
    onItemsChange(items.filter((i) => i.id !== selectedId));
    onSelect(null);
  };

  return (
    <div
      ref={wrapRef}
      className="stage-wrap"
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', display: 'block', touchAction: 'none', cursor: readOnly ? 'default' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
