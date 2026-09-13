import { useEffect, useMemo, useState } from 'react';
import Stage from './Stage';
import { TEMPLATES, makeItem, defaultItems } from './templates';
import { savePlan, listPlans, deletePlan } from './db';
import { WIN, layerOf, clampToWindow, fitsInWindow, computeVisibility } from './geometry';

const SEASONS = ['春', '夏', '秋', '冬'];
const SEASON_ICON = { 春: '🌸', 夏: '☀️', 秋: '🍂', 冬: '❄️' };

function OcclusionReport({ items, eye }) {
  const vis = computeVisibility(items, { x: -eye.dist, y: eye.h });
  const rows = items
    .map((it) => ({ it, v: vis[it.id] }))
    .sort((a, b) => a.v.frac - b.v.frac);
  if (rows.length === 0) return <p className="muted">橱窗里还没有道具</p>;
  return (
    <ul className="report">
      {rows.map(({ it, v }) => (
        <li key={it.id} className={v.frac < 0.995 ? 'bad' : 'ok'}>
          <span className="dot" style={{ background: it.color }} />
          <span className="nm">{it.label}</span>
          <span className="ly">{layerOf(it.cx).name}</span>
          <span className="bar">
            <i style={{ width: `${Math.round(v.frac * 100)}%` }} />
          </span>
          <span className="pc">{Math.round(v.frac * 100)}%</span>
          {v.frac < 0.995 && <span className="by">被「{v.blockers[0]}」挡住</span>}
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  const [mode, setMode] = useState('edit'); // edit | compare
  const [items, setItems] = useState(defaultItems);
  const [eye, setEye] = useState({ h: 1.6, dist: 6 });
  const [selectedId, setSelectedId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [planName, setPlanName] = useState('');
  const [season, setSeason] = useState('春');
  const [toast, setToast] = useState('');
  const [cmpA, setCmpA] = useState(null);
  const [cmpB, setCmpB] = useState(null);

  const notify = (msg) => {
    setToast(msg);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(''), 2200);
  };

  const refreshPlans = async () => {
    const list = await listPlans();
    setPlans(list);
    return list;
  };

  useEffect(() => {
    refreshPlans().then((list) => {
      if (list[0]) setCmpA(list[0].id);
      if (list[1]) setCmpB(list[1].id);
    });
  }, []);

  const selected = items.find((i) => i.id === selectedId) || null;

  // ---------- 道具操作 ----------
  const addItem = (tpl) => {
    const cx = [0.5, 1.5, 2.5][items.length % 3];
    const it = clampToWindow(makeItem(tpl, { cx, cy: tpl.h / 2 }));
    setItems((arr) => [...arr, it]);
    setSelectedId(it.id);
  };

  const updateItem = (id, patch) => {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const moveItem = (id, patch) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    updateItem(id, clampToWindow({ ...it, ...patch }));
  };

  const rotateItem = (id, rot) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const cand = { ...it, rot };
    if (fitsInWindow(cand)) updateItem(id, { rot });
    else notify('这个角度会翻出窗框，已阻止');
  };

  const removeItem = (id) => {
    setItems((arr) => arr.filter((i) => i.id !== id));
    setSelectedId(null);
  };

  // ---------- 方案存取 ----------
  const onSave = async () => {
    const plan = {
      name: planName.trim() || `方案 ${new Date().toLocaleString('zh-CN')}`,
      season,
      eye,
      items,
      updatedAt: Date.now(),
    };
    if (currentId != null) plan.id = currentId;
    const id = await savePlan(plan);
    setCurrentId(id);
    const list = await refreshPlans();
    if (cmpA == null && list[0]) setCmpA(list[0].id);
    if (cmpB == null && list[1]) setCmpB(list[1].id);
    notify('已保存到本地 IndexedDB');
  };

  const onLoad = (p) => {
    setItems(p.items);
    setEye(p.eye);
    setPlanName(p.name);
    setSeason(p.season || '春');
    setCurrentId(p.id);
    setSelectedId(null);
    setMode('edit');
    notify(`已加载「${p.name}」`);
  };

  const onNew = () => {
    setItems(defaultItems());
    setEye({ h: 1.6, dist: 6 });
    setPlanName('');
    setSeason('春');
    setCurrentId(null);
    setSelectedId(null);
  };

  const onDeletePlan = async (p) => {
    if (!window.confirm(`删除方案「${p.name}」？`)) return;
    await deletePlan(p.id);
    if (currentId === p.id) setCurrentId(null);
    await refreshPlans();
  };

  const planA = plans.find((p) => p.id === cmpA) || null;
  const planB = plans.find((p) => p.id === cmpB) || null;

  return (
    <div className="app">
      <header>
        <h1>🪟 橱窗陈列视线设计器</h1>
        <nav>
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>
            编辑陈列
          </button>
          <button className={mode === 'compare' ? 'on' : ''} onClick={() => setMode('compare')}>
            季节对比
          </button>
        </nav>
        <span className="hint">纯本地 · 零后端 · 方案存 IndexedDB</span>
      </header>

      {toast && <div className="toast">{toast}</div>}

      {mode === 'edit' ? (
        <div className="edit-layout">
          <aside className="panel left">
            <section>
              <h2>道具库（点击加入）</h2>
              <div className="palette">
                {TEMPLATES.map((t) => (
                  <button key={t.type} onClick={() => addItem(t)}>
                    <span className="sw" style={{ background: t.color }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h2>顾客视点</h2>
              <label>
                高度 {eye.h.toFixed(2)} m
                <input
                  type="range"
                  min="0.8"
                  max="2.3"
                  step="0.01"
                  value={eye.h}
                  onChange={(e) => setEye({ ...eye, h: +e.target.value })}
                />
              </label>
              <label>
                隔街距离 {eye.dist} m
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="0.5"
                  value={eye.dist}
                  onChange={(e) => setEye({ ...eye, dist: +e.target.value })}
                />
              </label>
            </section>
            <section>
              <h2>陈列方案</h2>
              <div className="save-row">
                <input
                  placeholder="方案名，如：春季上新"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                />
                <select value={season} onChange={(e) => setSeason(e.target.value)}>
                  {SEASONS.map((s) => (
                    <option key={s} value={s}>
                      {SEASON_ICON[s]} {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="save-row">
                <button className="primary" onClick={onSave}>
                  {currentId != null ? '保存修改' : '保存方案'}
                </button>
                <button onClick={onNew}>新建</button>
              </div>
              <ul className="plan-list">
                {plans.map((p) => (
                  <li key={p.id} className={p.id === currentId ? 'cur' : ''}>
                    <button className="load" onClick={() => onLoad(p)}>
                      {SEASON_ICON[p.season] || '📋'} {p.name}
                      <small>{new Date(p.updatedAt).toLocaleDateString('zh-CN')}</small>
                    </button>
                    <button className="del" onClick={() => onDeletePlan(p)} title="删除">
                      ×
                    </button>
                  </li>
                ))}
                {plans.length === 0 && <li className="muted">还没有保存过方案</li>}
              </ul>
            </section>
          </aside>

          <main>
            <Stage
              items={items}
              eye={eye}
              selectedId={selectedId}
              onItemsChange={setItems}
              onEyeChange={setEye}
              onSelect={setSelectedId}
              onNotify={notify}
            />
            <p className="ops">
              操作：拖拽移动（横向跨带自动换层）· 双击道具旋转 15° · 滚轮微调旋转 · Delete 删除选中 · 拖动左侧小人改视点高度
            </p>
          </main>

          <aside className="panel right">
            <section>
              <h2>选中道具</h2>
              {selected ? (
                <div className="props">
                  <p>
                    <b>{selected.label}</b>
                    <span className="tag">{layerOf(selected.cx).name}层</span>
                  </p>
                  <label>
                    前后位置 {selected.cx.toFixed(2)} m
                    <input
                      type="range"
                      min={WIN.glassX + 0.05}
                      max={WIN.backX - 0.05}
                      step="0.01"
                      value={selected.cx}
                      onChange={(e) => moveItem(selected.id, { cx: +e.target.value })}
                    />
                  </label>
                  <label>
                    高度 {selected.cy.toFixed(2)} m
                    <input
                      type="range"
                      min={WIN.floorY}
                      max={WIN.topY}
                      step="0.01"
                      value={selected.cy}
                      onChange={(e) => moveItem(selected.id, { cy: +e.target.value })}
                    />
                  </label>
                  <label>
                    旋转 {selected.rot}°
                    <input
                      type="range"
                      min="-80"
                      max="80"
                      step="1"
                      value={selected.rot}
                      onChange={(e) => rotateItem(selected.id, +e.target.value)}
                    />
                  </label>
                  <button className="danger" onClick={() => removeItem(selected.id)}>
                    移出道具
                  </button>
                </div>
              ) : (
                <p className="muted">点击画布中的道具进行编辑</p>
              )}
            </section>
            <section>
              <h2>遮挡报告</h2>
              <OcclusionReport items={items} eye={eye} />
            </section>
          </aside>
        </div>
      ) : (
        <div className="compare-layout">
          {[
            ['A', cmpA, setCmpA, planA],
            ['B', cmpB, setCmpB, planB],
          ].map(([slot, val, setter, plan]) => (
            <div className="compare-col" key={slot}>
              <div className="compare-head">
                <select value={val ?? ''} onChange={(e) => setter(+e.target.value)}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {SEASON_ICON[p.season] || '📋'} {p.name}
                    </option>
                  ))}
                </select>
                {plan && (
                  <span className="muted">
                    视点 {plan.eye.h.toFixed(2)}m · 隔街 {plan.eye.dist}m
                  </span>
                )}
              </div>
              {plan ? (
                <>
                  <Stage items={plan.items} eye={plan.eye} readOnly />
                  <OcclusionReport items={plan.items} eye={plan.eye} />
                </>
              ) : (
                <p className="muted empty">先在「编辑陈列」里保存至少两个方案，再来左右对比</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
