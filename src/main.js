import './style.css';
import { editorContext, readEditorScene, saveEditorScene, workbenchUrl } from './editor-context.js';
import { compressImage } from './media.js';
import {
  createIcons,
  Scan,
  Box,
  UserRound,
  Camera,
  Move,
  Rotate3d,
  Scaling,
  Plus,
  Undo2,
  Redo2,
  Download,
  Upload,
  Focus,
  Grid2x2,
  Magnet,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Play,
  Pause,
  SkipBack,
  Clapperboard,
  ChevronDown,
  PanelLeftClose,
  CircleHelp,
  X,
  Check,
  Cuboid,
  Trees,
  Armchair,
  Table2,
  Columns3,
  Layers,
  ArrowUpRight,
  Image,
  RotateCcw,
  Save,
  MapPin,
  Crosshair,
  Maximize2,
  Film,
} from 'lucide';
import { createProject, createObject, validateProject, TYPE_NAMES, History } from './project.js';
import { Stage } from './stage.js';

const ICONS = {
  Scan,
  Box,
  UserRound,
  Camera,
  Move,
  Rotate3d,
  Scaling,
  Plus,
  Undo2,
  Redo2,
  Download,
  Upload,
  Focus,
  Grid2x2,
  Magnet,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Play,
  Pause,
  SkipBack,
  Clapperboard,
  ChevronDown,
  PanelLeftClose,
  CircleHelp,
  X,
  Check,
  Cuboid,
  Trees,
  Armchair,
  Table2,
  Columns3,
  Layers,
  ArrowUpRight,
  Image,
  RotateCcw,
  Save,
  MapPin,
  Crosshair,
  Maximize2,
  Film,
};
const STORAGE_KEY = 'frame.spatial.project.v1';
const objectIcons = {
  actor: 'user-round',
  box: 'box',
  cylinder: 'cuboid',
  wall: 'columns-3',
  table: 'table-2',
  chair: 'armchair',
  stairs: 'layers',
  plant: 'trees',
};
let project = createProject('studio');
let storageWarning = '';
try {
  const saved = editorContext ? null : localStorage.getItem(STORAGE_KEY);
  if (saved) project = validateProject(JSON.parse(saved));
} catch {
  storageWarning = '未能读取本机存档，已载入默认场景。';
}
if (editorContext) project = readEditorScene();
let history = new History(project),
  selectedId = project.objects[0]?.id,
  playing = false,
  preview = false,
  time = 0,
  mode = 'translate',
  snap = false,
  cameraView = false,
  startTime = 0,
  pathStart = null,
  toastTimer;

/** 生成仅使用内部图标名称的占位元素。 */
function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}
/** 将项目名称等用户输入转义为安全文本。 */
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
/** 获取界面节点。 */
function $(id) {
  return document.getElementById(id);
}
/** 替换当前新增的图标占位。 */
function icons() {
  createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.6 } });
}

$('app').innerHTML = `
<header class="app-header">
  <a class="brand" href="#" aria-label="EasyDrama 简剧 · 空间推演">${icon('scan')}<b>EasyDrama<span>简剧</span></b><em>LOCAL</em></a>
  <div class="project-heading"><input id="project-name" aria-label="工程名称" maxlength="100"><span class="save-state" id="save-state">${icon('check')} 本机已保存</span></div>
  <nav class="header-actions"><button id="return-workbench">返回工作台</button>${editorContext ? '<button id="save-shot-image">保存画面到分镜</button>' : ''}<button id="undo" class="icon-btn" title="撤销 · Ctrl/⌘ Z" aria-label="撤销">${icon('undo-2')}</button><button id="redo" class="icon-btn" title="重做 · Ctrl/⌘ Shift Z" aria-label="重做">${icon('redo-2')}</button><span class="divider"></span><button id="import-project" title="导入 JSON 工程">${icon('upload')}<span>导入</span></button><button id="export-project" class="primary">${icon('download')}<span>导出工程</span></button></nav>
</header>
<div class="workspace">
  <aside class="left-panel">
    <div class="panel-title"><span>${icon('layers')} 场景搭建</span><span class="subtle">01</span></div>
    <section class="library-section"><div class="section-label">场景模板 <span>SCENES</span></div><div class="templates">
      <button class="template" data-template="studio"><span class="template-art studio-art">${icon('scan')}</span><span>摄影棚</span></button>
      <button class="template" data-template="classroom"><span class="template-art classroom-art">${icon('table-2')}</span><span>教室</span></button>
      <button class="template" data-template="courtyard"><span class="template-art courtyard-art">${icon('columns-3')}</span><span>庭院</span></button>
    </div></section>
    <section class="library-section"><div class="section-label">添加到场景 <span>ASSETS</span></div><button class="add-actor" data-add="actor">${icon('user-round')} 添加演员 ${icon('plus')}</button><div class="asset-grid">
      ${['box', 'cylinder', 'wall', 'table', 'chair', 'stairs', 'plant'].map((type) => `<button data-add="${type}" title="添加${TYPE_NAMES[type]}">${icon(objectIcons[type])}<span>${TYPE_NAMES[type]}</span></button>`).join('')}
    </div></section>
    <section class="objects-section"><div class="section-label">场景对象 <span id="object-count"></span></div><div id="object-list" class="object-list"></div></section>
    <footer class="panel-footer">${icon('save')} 工程自动保存在本机<button id="help" class="icon-btn" title="操作指南" aria-label="操作指南">${icon('circle-help')}</button></footer>
  </aside>
  <main class="center-panel">
    <div class="viewport-toolbar"><div class="tool-group"><button class="tool active" data-mode="translate" title="移动 · W" aria-label="移动工具">${icon('move')}<span>移动</span><kbd>W</kbd></button><button class="tool" data-mode="rotate" title="旋转 · E" aria-label="旋转工具">${icon('rotate-3d')}<span>旋转</span><kbd>E</kbd></button><button class="tool" data-mode="scale" title="缩放 · R" aria-label="缩放工具">${icon('scaling')}<span>缩放</span><kbd>R</kbd></button></div><div class="tool-group secondary-tools"><button id="snap" class="icon-btn" title="吸附：0.5m / 15°" aria-label="切换吸附">${icon('magnet')}</button><button id="grid" class="icon-btn active" title="显示网格 · G" aria-label="切换网格">${icon('grid-2x2')}</button><button id="focus" class="icon-btn" title="聚焦选中 · F" aria-label="聚焦选中">${icon('focus')}</button></div></div>
    <div id="viewport" class="viewport"><div class="viewport-corner"><span class="view-tag" id="view-label">${icon('box')} 透视视图</span><span class="viewport-note">米制 · Y 轴向上</span></div><div class="view-switch"><button id="perspective" class="active">透视</button><button id="top-view">俯视</button><button id="camera-view">${icon('camera')} 取景</button></div><div class="axis-compass"><span class="axis-y">Y</span><span class="axis-z">Z</span><span class="axis-x">X</span></div><div class="viewport-hint"><span>左键选择 / 环绕</span><span>右键平移</span><span>滚轮缩放</span></div><button id="use-view" class="use-view">${icon('camera')} 将当前视角设为机位</button><div id="preview-banner" hidden>走位预演中 · 返回编辑后恢复原始站位</div></div>
    <section class="timeline"><div class="timeline-header"><div class="timeline-name">${icon('film')} 走位预演 <span>TAKE 01</span></div><div class="playback"><button id="reset-play" class="icon-btn" aria-label="回到起点" title="回到起点">${icon('skip-back')}</button><button id="play" class="play-button" aria-label="播放预演">${icon('play')}</button><span id="time-readout">00:00.0</span><span class="duration-label">/ <span id="duration-readout">12.0</span>s</span><button id="edit-mode" class="small-btn" hidden>返回编辑</button></div><label class="duration-input">时长 <input id="duration" aria-label="预演时长" type="number" min="1" max="120" step="1"> s</label></div><div class="timeline-body"><div class="track-labels" id="track-labels"></div><div class="track-area"><div class="ruler" id="ruler"></div><div id="tracks"></div><div class="playhead" id="playhead"><span></span></div><input id="scrubber" type="range" min="0" max="12" value="0" step="0.01" aria-label="时间轴进度"></div></div><div class="timeline-footer"><span id="timeline-description">选中演员，在右侧记录起点和终点即可添加走位。</span><span>空格 播放 / 暂停</span></div></section>
  </main>
  <aside class="right-panel"><div class="panel-title"><span>${icon('camera')} 导演监看</span><span class="subtle">02</span></div>
    <section class="monitor-section"><div class="monitor-head"><span id="shot-name">双人全景</span><select id="aspect" aria-label="画幅比例"><option>16:9</option><option>9:16</option><option>1:1</option><option>2.35:1</option></select></div><div id="monitor" class="monitor"></div><div class="monitor-foot"><span><b id="lens-value">35</b> mm</span><button id="snapshot" title="导出当前机位的 PNG">${icon('image')} 导出画面</button></div><div class="shot-grid">${['双人全景', '高位俯拍', 'A 特写', 'B 特写', '越 B 肩拍 A', '越 A 肩拍 B'].map((name) => `<button data-shot="${name}">${name}</button>`).join('')}</div><label class="lens-label">焦距 <input id="focal" type="range" min="18" max="120" step="1" aria-label="摄影机焦距"><output id="focal-output">35 mm</output></label></section>
    <div class="inspector-heading"><span>${icon('sliders-horizontal')} 对象属性</span><div><button id="duplicate" class="icon-btn" aria-label="复制选中对象" title="复制 · Ctrl/⌘ D">${icon('copy')}</button><button id="delete" class="icon-btn" aria-label="删除选中对象" title="删除 · Delete">${icon('trash-2')}</button></div></div>
    <div id="inspector"></div>
    <details class="environment"><summary>环境与光线 ${icon('chevron-down')}</summary><label>光照强度<input id="intensity" type="range" min="0" max="6" step="0.1"></label><label>光线方向<input id="azimuth" type="range" min="0" max="360" step="5"></label></details>
  </aside>
</div>
<footer class="status-bar"><span>${icon('box')} <span id="status-objects"></span><span class="status-separator">|</span><span id="selection-status">未选中</span></span><span>EasyDrama 简剧 / 空间推演编辑器 <b>v0.1</b></span></footer>
<div id="toast" class="toast" role="status" hidden></div><input id="file-input" type="file" accept=".json,application/json" hidden>
<dialog id="dialog"><div id="dialog-content"></div></dialog>`;
// 属性标题复用参数图标，避免引入额外图标集合。
document.querySelector('[data-lucide="sliders-horizontal"]').setAttribute('data-lucide', 'scaling');

let stage;
try {
  stage = new Stage($('viewport'), $('monitor'), {
    onSelect: selectObject,
    onTransform: (id, transform) => {
      const object = project.objects.find((o) => o.id === id);
      if (object) {
        Object.assign(object, transform);
        commit();
      }
    },
    onTransformPreview: (node) => {
      for (const key of ['position', 'rotation', 'scale'])
        for (let i = 0; i < 3; i++) {
          const input = document.querySelector(`[data-transform="${key}"][data-axis="${i}"]`);
          if (input && document.activeElement !== input)
            input.value = Number(
              (
                (key === 'rotation'
                  ? [node.rotation.x, node.rotation.y, node.rotation.z][i]
                  : node[key].getComponent(i)) * (key === 'rotation' ? 180 / Math.PI : 1)
              ).toFixed(2),
            );
        }
    },
  });
} catch (error) {
  $('viewport').innerHTML =
    '<div class="webgl-error"><h2>无法启动三维视口</h2><p>请在浏览器中开启硬件加速，并使用支持 WebGL 2 的浏览器重新打开。</p></div>';
  console.error(error);
  throw error;
}

/** 获取当前选中的数据对象。 */
function selected() {
  return project.objects.find((o) => o.id === selectedId);
}

/** 显示不阻断编辑的操作反馈。 */
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 3500);
}

/** 保存可恢复工程；配额或隐私模式阻止存储时明确提示。 */
function saveLocal() {
  try {
    if (editorContext) saveEditorScene(project);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    $('save-state').innerHTML = `${icon('check')} 本机已保存`;
    return true;
  } catch {
    $('save-state').textContent = '保存失败，请导出工程备份';
    return false;
  }
}

/** 将一次完整修改提交到历史和本机存档，再刷新场景。 */
function commit() {
  history.push(project);
  saveLocal();
  render();
}

/** 改变选中对象时清除尚未完成的走位起点。 */
function selectObject(id) {
  if (selectedId !== id) pathStart = null;
  selectedId = id;
  render();
}

/** 返回编辑模式，丢弃播放派生姿态但保留工程原始站位。 */
function stopPreview() {
  playing = false;
  preview = false;
  time = 0;
  stage.setTime(0, false);
  render();
}

/** 刷新列表、属性、时间轴与三维对象，避免重复绑定事件。 */
function render() {
  if (!project.objects.some((o) => o.id === selectedId)) selectedId = null;
  $('project-name').value = project.name;
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
  $('object-count').textContent = String(project.objects.length).padStart(2, '0');
  $('status-objects').textContent = `${project.objects.length} 个对象`;
  $('selection-status').textContent = selected()?.name || '未选中对象';
  $('object-list').innerHTML = project.objects
    .map(
      (o) =>
        `<div class="object-row ${o.id === selectedId ? 'selected' : ''} ${!o.visible ? 'muted' : ''}"><button class="object-select" data-select="${o.id}" aria-label="选择 ${escapeHtml(o.name)}">${icon(objectIcons[o.type])}<span>${escapeHtml(o.name)}</span>${o.type === 'actor' ? `<em style="background:${o.color}"></em>` : ''}</button><button class="visibility-btn" data-visible="${o.id}" title="${o.visible ? '隐藏' : '显示'}${escapeHtml(o.name)}" aria-label="${o.visible ? '隐藏' : '显示'}${escapeHtml(o.name)}">${icon(o.visible ? 'eye' : 'eye-off')}</button></div>`,
    )
    .join('');
  document
    .querySelectorAll('[data-template]')
    .forEach((b) => b.classList.toggle('active', b.dataset.template === project.template));
  $('aspect').value = project.camera.aspect;
  $('lens-value').textContent = Math.round(project.camera.focal);
  $('focal').value = project.camera.focal;
  $('focal-output').textContent = `${Math.round(project.camera.focal)} mm`;
  $('shot-name').textContent = project.camera.preset;
  document
    .querySelectorAll('[data-shot]')
    .forEach((b) => b.classList.toggle('active', b.dataset.shot === project.camera.preset));
  $('intensity').value = project.environment.intensity;
  $('azimuth').value = project.environment.azimuth;
  $('grid').classList.toggle('active', project.environment.grid);
  $('duration').value = project.duration;
  $('duration-readout').textContent = project.duration.toFixed(1);
  $('scrubber').max = project.duration;
  $('delete').disabled = $('duplicate').disabled = !selected() || preview;
  $('preview-banner').hidden = !preview;
  $('edit-mode').hidden = !preview;
  $('play').innerHTML = icon(playing ? 'pause' : 'play');
  $('play').setAttribute('aria-label', playing ? '暂停预演' : '播放预演');
  renderInspector();
  renderTracks();
  stage.sync(project, selectedId);
  updateTimeUI();
  icons();
}

/** 按对象状态创建精确变换输入和演员走位控制。 */
function renderInspector() {
  const object = selected();
  if (!object) {
    $('inspector').innerHTML =
      `<div class="empty-inspector">${icon('crosshair')}<p>选择一个对象</p><span>点击场景或左侧对象列表<br>编辑位置、外观和走位</span></div>`;
    return;
  }
  $('inspector').innerHTML =
    `<fieldset ${preview ? 'disabled' : ''}><div class="object-name-row">${icon(objectIcons[object.type])}<input id="object-name" aria-label="对象名称" maxlength="80" value="${escapeHtml(object.name)}"><input id="object-color" type="color" value="${object.color}" aria-label="对象颜色"></div>
    ${[
      ['position', '位置', 'm'],
      ['rotation', '旋转', '°'],
      ['scale', '缩放', '×'],
    ]
      .map(
        ([key, name, unit]) =>
          `<div class="transform-field"><div class="field-label">${name}<span>${unit}</span></div><div class="vector-inputs">${['X', 'Y', 'Z'].map((axis, i) => `<label><span class="component-${i}">${axis}</span><input type="number" aria-label="${name} ${axis}" data-transform="${key}" data-axis="${i}" step="any" min="${key === 'scale' ? '0.05' : key === 'position' ? '-100' : '-36000'}" max="${key === 'scale' ? '20' : key === 'position' ? '100' : '36000'}" value="${Number((object[key][i] * (key === 'rotation' ? 180 / Math.PI : 1)).toFixed(2))}"></label>`).join('')}</div></div>`,
      )
      .join('')}
    ${object.type === 'actor' ? `<div class="motion-panel"><div class="field-label">${icon('map-pin')} A → B 走位<span>${object.motion ? '已设置' : '未设置'}</span></div><p>${pathStart ? '起点已记录。移动演员到终点，再点击下方按钮。' : '记录起点后，将演员移到终点。'}</p><div class="motion-buttons"><button id="mark-start" class="${pathStart ? 'active' : ''}">${icon('map-pin')} ${pathStart ? '重记起点' : '记录起点'}</button><button id="mark-end" ${!pathStart ? 'disabled' : ''}>${icon('check')} 设为终点</button></div>${object.motion ? `<div class="motion-timing"><label>开始<input id="motion-start" type="number" min="0" max="${project.duration - 0.1}" step="0.1" value="${object.motion.start}"></label><label>结束<input id="motion-end" type="number" min="0.1" max="${project.duration}" step="0.1" value="${object.motion.end}"></label><button id="clear-motion" class="icon-btn" aria-label="清除走位" title="清除走位">${icon('trash-2')}</button></div>` : ''}</div>` : ''}</fieldset>`;
}

/** 将演员路径绘制成时间片段，空场景仍保留明确的空态。 */
function renderTracks() {
  const actors = project.objects.filter((o) => o.type === 'actor');
  $('track-labels').innerHTML =
    '<div class="ruler-label">演员轨道</div>' +
    actors
      .map(
        (o) =>
          `<button data-select="${o.id}" class="track-label ${o.id === selectedId ? 'active' : ''}"><span style="background:${o.color}"></span>${escapeHtml(o.name)}</button>`,
      )
      .join('');
  $('ruler').innerHTML = Array.from(
    { length: 7 },
    (_, i) => `<span>${Number(((i * project.duration) / 6).toFixed(1))}s</span>`,
  ).join('');
  $('tracks').innerHTML =
    actors
      .map(
        (o) =>
          `<div class="track-row">${o.motion ? `<button class="clip" data-select="${o.id}" style="left:${(o.motion.start / project.duration) * 100}%;width:${((o.motion.end - o.motion.start) / project.duration) * 100}%;--clip-color:${o.color}" title="${escapeHtml(o.name)}：${o.motion.start}–${o.motion.end} 秒">${icon('move')} 行走 <span>A → B</span></button>` : '<span class="empty-track">尚未设置走位</span>'}</div>`,
      )
      .join('') || '<div class="empty-track">添加演员后可设置走位</div>';
}

/** 更新播放时间显示，不重建属性面板或三维模型。 */
function updateTimeUI() {
  $('time-readout').textContent = `00:${time.toFixed(1).padStart(4, '0')}`;
  $('scrubber').value = time;
  $('playhead').style.left = `${(time / project.duration) * 100}%`;
}

/** 使用浏览器下载能力保存工程或图片。 */
function download(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

/** 打开会替换整个场景的确认窗口，避免误丢当前布局。 */
function confirmAction(title, message, action) {
  $('dialog-content').innerHTML =
    `<div class="dialog-icon">${icon('layers')}</div><h2>${title}</h2><p>${message}</p><div class="dialog-actions"><button id="dialog-cancel">取消</button><button id="dialog-confirm" class="primary">确定</button></div>`;
  icons();
  $('dialog').showModal();
  $('dialog-cancel').onclick = () => $('dialog').close();
  $('dialog-confirm').onclick = () => {
    $('dialog').close();
    action();
  };
}

/** 新增程序化人物或道具并立即选中，保持每个对象的 ID 唯一。 */
function addObject(type) {
  if (preview) stopPreview();
  if (project.objects.length >= 200) return toast('一个工程最多容纳 200 个对象。');
  const n = project.objects.filter((o) => o.type === type).length + 1;
  const name = type === 'actor' ? `演员 ${String.fromCharCode(64 + n)}` : `${TYPE_NAMES[type]} ${n}`;
  const object = createObject(
    type,
    name,
    [0, 0, 1.8],
    type === 'actor' ? ['#d58b62', '#7eaaa1', '#a5a1ce'][n % 3] : '#bcb29d',
  );
  project.objects.push(object);
  selectedId = object.id;
  pathStart = null;
  commit();
  toast(`已添加${name}`);
}

/** 复制当前对象并偏移位置，已有走位同步偏移。 */
function duplicateObject() {
  if (!selected() || preview || project.objects.length >= 200) return;
  const object = structuredClone(selected());
  object.id = crypto.randomUUID();
  object.name = `${object.name.slice(0, 74)} 副本`;
  object.position[0] = Math.min(100, object.position[0] + 0.7);
  if (object.motion) {
    object.motion.from[0] = Math.min(100, object.motion.from[0] + 0.7);
    object.motion.to[0] = Math.min(100, object.motion.to[0] + 0.7);
  }
  project.objects.push(object);
  selectedId = object.id;
  pathStart = null;
  commit();
}

/** 删除选中对象；完整状态可通过撤销恢复。 */
function deleteObject() {
  if (!selected() || preview) return;
  project.objects = project.objects.filter((o) => o.id !== selectedId);
  selectedId = null;
  pathStart = null;
  commit();
  toast('对象已删除，可撤销恢复');
}

/** 在不更改工程的情况下开始或暂停预演。 */
function togglePlay() {
  if (!project.objects.some((o) => o.motion)) {
    toast('先选中演员，记录起点和终点，再播放走位。');
    return;
  }
  if (playing) playing = false;
  else {
    if (time >= project.duration) time = 0;
    preview = true;
    playing = true;
    startTime = performance.now() - time * 1000;
  }
  render();
}

/** 设置编辑工具并刷新工具栏选中状态。 */
function setMode(value) {
  if (preview) stopPreview();
  mode = value;
  stage.setMode(value);
  document
    .querySelectorAll('[data-mode]')
    .forEach((b) => b.classList.toggle('active', b.dataset.mode === value));
}

/** 恢复指定方向的历史记录，退出预演并立即同步本机存档。 */
function restoreHistory(direction) {
  playing = preview = false;
  time = 0;
  pathStart = null;
  project = history[direction]();
  saveLocal();
  render();
}

/** 向所有静态与动态控件委托点击事件。 */
function handleClick(event) {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.select) return selectObject(button.dataset.select);
  if (button.dataset.add) return addObject(button.dataset.add);
  if (button.dataset.mode) return setMode(button.dataset.mode);
  if (button.dataset.visible) {
    const object = project.objects.find((o) => o.id === button.dataset.visible);
    object.visible = !object.visible;
    return commit();
  }
  if (button.dataset.template)
    return confirmAction(
      '切换场景模板？',
      '当前布局将被替换。切换后仍可使用撤销恢复，也可以先导出工程。',
      () => {
        playing = preview = false;
        time = 0;
        pathStart = null;
        project = createProject(button.dataset.template);
        selectedId = project.objects[0].id;
        commit();
        stage.focus();
        setView('perspective');
        toast('场景模板已载入');
      },
    );
  if (button.dataset.shot) {
    const camera = stage.shotPreset(button.dataset.shot);
    if (!camera) return toast('请先添加至少一位可见演员');
    project.camera = { ...project.camera, ...camera };
    return commit();
  }
  const actions = {
    undo: () => restoreHistory('undo'),
    redo: () => restoreHistory('redo'),
    duplicate: duplicateObject,
    delete: deleteObject,
    snap: () => {
      snap = !snap;
      stage.setSnap(snap);
      $('snap').classList.toggle('active', snap);
      toast(snap ? '吸附已开启：移动 0.5m，旋转 15°' : '吸附已关闭');
    },
    grid: () => {
      project.environment.grid = !project.environment.grid;
      commit();
    },
    focus: () => {
      stage.focus(selectedId);
      setView('perspective', false);
    },
    perspective: () => setView('perspective'),
    'top-view': () => setView('top'),
    'camera-view': () => setView('camera'),
    'use-view': () => {
      project.camera = { ...project.camera, ...stage.captureCamera() };
      commit();
      toast('当前视角已设为摄影机机位');
    },
    snapshot: () => {
      download(stage.screenshot(), `EasyDrama-${project.camera.preset}.png`);
      toast('已导出摄影机画面');
    },
    'export-project': () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
      );
      download(url, `${project.name.replace(/[\\/:*?"<>|]/g, '-')}.frame.json`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast('工程已导出');
    },
    'import-project': () => $('file-input').click(),
    'mark-start': () => {
      pathStart = { id: selectedId, position: [...selected().position] };
      renderInspector();
      icons();
      toast('起点已记录，请将演员移到终点');
    },
    'mark-end': () => {
      const object = selected();
      if (!pathStart || pathStart.id !== object.id) return;
      if (Math.hypot(...object.position.map((v, i) => v - pathStart.position[i])) < 0.05)
        return toast('请先移动演员，起点与终点不能相同。');
      object.motion = {
        from: [...pathStart.position],
        to: [...object.position],
        start: 0,
        end: Math.min(6, project.duration),
      };
      object.position = [...pathStart.position];
      pathStart = null;
      commit();
      toast('走位已建立，点击播放查看效果');
    },
    'clear-motion': () => {
      selected().motion = null;
      commit();
    },
    play: togglePlay,
    'reset-play': () => {
      time = 0;
      playing = false;
      stage.setTime(0, preview);
      render();
    },
    'edit-mode': stopPreview,
    help: showHelp,
  };
  actions[button.id]?.();
}

/** 切换视角标签，摄影机取景保持真实画幅，不拉伸画面。 */
function setView(view, moveCamera = true) {
  cameraView = view === 'camera';
  stage.setCameraView(cameraView);
  if (moveCamera && view === 'top') stage.topView();
  if (moveCamera && view === 'perspective') stage.focus();
  $('view-label').innerHTML =
    `${icon(cameraView ? 'camera' : 'box')} ${{ camera: '摄影机取景', top: '俯视视图', perspective: '透视视图' }[view]}`;
  $('perspective').classList.toggle('active', view === 'perspective');
  $('top-view').classList.toggle('active', view === 'top');
  $('camera-view').classList.toggle('active', cameraView);
  $('use-view').hidden = cameraView;
  icons();
}

/** 展示可以直接操作的快捷键及功能边界。 */
function showHelp() {
  $('dialog-content').innerHTML =
    `<div class="dialog-icon">${icon('scan')}</div><h2>把想法摆进空间</h2><p>选择模板，摆放人物和道具，再切换机位查看构图。</p><dl class="shortcuts"><dt>选择 / 环绕视角</dt><dd>左键点击 / 拖动</dd><dt>平移 / 缩放视角</dt><dd>右键拖动 / 滚轮</dd><dt>移动 / 旋转 / 缩放</dt><dd>W / E / R</dd><dt>聚焦 / 网格</dt><dd>F / G</dd><dt>播放 / 暂停</dt><dd>空格</dd><dt>复制 / 删除</dt><dd>⌘ 或 Ctrl D / Delete</dd><dt>撤销 / 重做</dt><dd>⌘ 或 Ctrl Z / Shift Z</dd></dl><p class="help-note">走位：选中演员 → 记录起点 → 移动演员 → 设为终点。预演是直线移动，不包含碰撞避让或上下楼梯适配。工程保存在本机浏览器，建议定期导出 JSON 备份。</p><button id="close-help" class="primary">开始编辑</button>`;
  icons();
  $('dialog').showModal();
  $('close-help').onclick = () => $('dialog').close();
}

/** 验证并提交属性输入，预览态下不接受原始变换修改。 */
function handleChange(event) {
  const el = event.target;
  if (el.dataset.transform && selected() && !preview) {
    const value = Number(el.value),
      key = el.dataset.transform,
      axis = Number(el.dataset.axis);
    if (!Number.isFinite(value) || !el.checkValidity()) {
      toast('请输入允许范围内的数值');
      renderInspector();
      icons();
      return;
    }
    selected()[key][axis] = value * (key === 'rotation' ? Math.PI / 180 : 1);
    commit();
  } else if (el.id === 'object-name' && selected()) {
    selected().name = el.value.trim() || TYPE_NAMES[selected().type];
    commit();
  } else if (el.id === 'object-color' && selected()) {
    selected().color = el.value;
    commit();
  } else if (el.id === 'project-name') {
    project.name = el.value.trim() || '未命名场景';
    commit();
  } else if (el.id === 'aspect') {
    project.camera.aspect = el.value;
    commit();
  } else if (el.id === 'focal') {
    project.camera.focal = Number(el.value);
    commit();
  } else if (el.id === 'intensity' || el.id === 'azimuth') {
    project.environment[el.id] = Number(el.value);
    commit();
  } else if (el.id === 'duration') {
    const duration = Number(el.value);
    if (!el.checkValidity() || !duration) return render();
    if (project.objects.some((o) => o.motion && o.motion.end > duration)) {
      toast('时长不能短于现有走位片段，请先调整片段结束时间');
      return render();
    }
    playing = preview = false;
    time = 0;
    project.duration = duration;
    commit();
  } else if (['motion-start', 'motion-end'].includes(el.id) && selected()?.motion) {
    const start = Number($('motion-start').value),
      end = Number($('motion-end').value);
    if (start < 0 || end <= start || end > project.duration || !Number.isFinite(start + end)) {
      toast('结束时间必须大于开始时间，且不能超出预演时长');
      return render();
    }
    Object.assign(selected().motion, { start, end });
    commit();
  }
}

/** 读取并验证文件后才替换工程，失败时保留当前状态。 */
async function importFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('工程文件不能超过 2 MB。');
    const imported = validateProject(JSON.parse(await file.text()));
    confirmAction('导入工程？', `即将打开「${escapeHtml(imported.name)}」。当前布局可通过撤销恢复。`, () => {
      playing = preview = false;
      time = 0;
      pathStart = null;
      project = imported;
      selectedId = project.objects[0]?.id;
      commit();
      stage.focus();
      setView('perspective', false);
      toast('工程已导入');
    });
  } catch (error) {
    toast(error instanceof SyntaxError ? 'JSON 无法解析，请检查工程文件。' : error.message);
  }
}

/** 输入框和弹窗中不触发编辑快捷键。 */
function handleKey(event) {
  if (event.target.closest('input,textarea,select') || $('dialog').open) return;
  const key = event.key.toLowerCase(),
    mod = event.ctrlKey || event.metaKey;
  if (mod && key === 'z') {
    event.preventDefault();
    return restoreHistory(event.shiftKey ? 'redo' : 'undo');
  }
  if (mod && key === 'd') {
    event.preventDefault();
    return duplicateObject();
  }
  if (mod && key === 's') {
    event.preventDefault();
    saveLocal();
    icons();
    return toast('工程已保存到本机');
  }
  if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    return deleteObject();
  }
  if (key === ' ') {
    event.preventDefault();
    return togglePlay();
  }
  if (mod || event.altKey) return;
  if ({ w: 'translate', e: 'rotate', r: 'scale' }[key])
    setMode({ w: 'translate', e: 'rotate', r: 'scale' }[key]);
  if (key === 'f') {
    stage.focus(selectedId);
    setView('perspective', false);
  }
  if (key === 'g') {
    project.environment.grid = !project.environment.grid;
    commit();
  }
  if (key === 'escape') {
    if (preview) stopPreview();
    else selectObject(null);
  }
}

/** 使用单调时钟推进播放，结束后停在最终帧。 */
function animate(now) {
  if (playing) {
    time = Math.min(project.duration, (now - startTime) / 1000);
    stage.setTime(time, true);
    updateTimeUI();
    if (time >= project.duration) {
      playing = false;
      render();
    }
  }
  requestAnimationFrame(animate);
}

document.addEventListener('click', handleClick);
document.addEventListener('change', handleChange);
document.addEventListener('keydown', handleKey);
$('file-input').addEventListener('change', importFile);
$('scrubber').addEventListener('input', (e) => {
  playing = false;
  preview = true;
  time = Number(e.target.value);
  stage.setTime(time, true);
  updateTimeUI();
  $('preview-banner').hidden = false;
  $('edit-mode').hidden = false;
  $('play').innerHTML = icon('play');
  $('play').setAttribute('aria-label', '播放预演');
  renderInspector();
  $('delete').disabled = $('duplicate').disabled = true;
  icons();
});
$('focal').addEventListener('input', (e) => {
  $('focal-output').textContent = `${e.target.value} mm`;
  $('lens-value').textContent = e.target.value;
  stage.shotCamera.setFocalLength(Number(e.target.value));
});
window.addEventListener('beforeunload', () => {
  stage.dispose();
});
render();
requestAnimationFrame(animate);
if (storageWarning) toast(storageWarning);

/** 返回工作台前确认当前场景成功落盘。 */
$('return-workbench').addEventListener('click', () => {
  if (saveLocal()) location.href = workbenchUrl();
  else toast('当前场景未保存，可能存储已满或分镜已删除，请先导出工程备份。');
});
/** 将摄影机画面压缩后写回分镜卡片，空间编辑数据独立保存。 */
$('save-shot-image')?.addEventListener('click', async () => {
  const button = $('save-shot-image');
  button.disabled = true;
  try {
    const blob = await (await fetch(stage.screenshot())).blob();
    const image = await compressImage(blob);
    saveEditorScene(project, image);
    toast('机位画面已保存到分镜卡片');
  } catch (error) {
    toast(`保存失败：${error.message}`);
  } finally {
    button.disabled = false;
  }
});
