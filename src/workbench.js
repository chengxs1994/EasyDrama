import './style.css';
import './workbench.css';
import {
  createIcons,
  Scan,
  Plus,
  LayoutDashboard,
  Film,
  UsersRound,
  LayoutTemplate,
  Clapperboard,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  ImagePlus,
  Box,
  Trash2,
  Pencil,
  Download,
  Upload,
  X,
  Grip,
  Check,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize,
  FolderOpen,
  Copy,
} from 'lucide';
import {
  WORKSPACE_KEY,
  SHOT_SIZES,
  SHOT_STATUSES,
  createWork,
  createEpisode,
  createShot,
  createCharacter,
  readWorkspace,
  writeWorkspace,
  validateWorkspace,
  removeCharacter,
  moveShot,
  copyWork,
} from './workspace.js';
import { compressImage } from './media.js';

const icons = {
  Scan,
  Plus,
  LayoutDashboard,
  Film,
  UsersRound,
  LayoutTemplate,
  Clapperboard,
  ArrowLeft,
  ArrowRight,
  MoreHorizontal,
  ImagePlus,
  Box,
  Trash2,
  Pencil,
  Download,
  Upload,
  X,
  Grip,
  Check,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize,
  FolderOpen,
  Copy,
};
const root = document.getElementById('app');
document.body.classList.add('creative-app');
let data;
let startupError = '';
try {
  data = readWorkspace();
  writeWorkspace(data);
} catch (error) {
  startupError = `本机存档暂时无法读取或保存：${error.message}。请先导出本机原始备份，避免覆盖。`;
  data = { version: 1, works: [] };
}
const params = new URLSearchParams(location.search);
let workId = params.get('work') || data.works[0]?.id;
let episodeId = params.get('episode');
let view = ['overview', 'episodes', 'characters', 'canvas', 'script', 'spatial'].includes(params.get('view'))
  ? params.get('view')
  : 'overview';
let dialogState = null;
let pendingImage = '';
let noticeTimer;
const canvasViews = new Map();

/** 转义所有用户输入，避免作品文本成为可执行 HTML。 */
function esc(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
/** 输出内部图标占位。 */
function ico(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}
/** 读取当前作品，删除后的选择自动回到第一项。 */
function currentWork() {
  return data.works.find((w) => w.id === workId) || data.works[0];
}
/** 读取当前集，确保切换作品后不会引用旧分集。 */
function currentEpisode() {
  const work = currentWork();
  return work?.episodes.find((e) => e.id === episodeId) || work?.episodes[0];
}
/** 统一构造操作按钮的无障碍名称。 */
function button(action, label, icon, extra = '', className = '') {
  return `<button type="button" data-action="${action}" ${extra} class="${className}" title="${esc(label)}" aria-label="${esc(label)}">${icon ? ico(icon) : ''}<span>${esc(label)}</span></button>`;
}
/** 在页面底部显示操作结果。 */
function notify(message) {
  const el = document.getElementById('wb-notice');
  el.textContent = message;
  el.hidden = false;
  const dialog = document.getElementById('wb-dialog');
  if (dialog?.open) {
    let hint = dialog.querySelector('.wb-form-error');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'wb-form-error';
      hint.setAttribute('role', 'status');
      dialog.querySelector('.wb-form-content').prepend(hint);
    }
    hint.textContent = message;
    hint.scrollIntoView({ block: 'nearest' });
  }
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    el.hidden = true;
  }, 6000);
}
/** 复制、修改、验证、持久化成功后再替换当前状态。 */
function update(mutator, message = '已保存到本机') {
  if (startupError) {
    notify('请先备份并恢复本机存档。');
    return false;
  }
  try {
    const next = structuredClone(data);
    mutator(next);
    const changed = next.works.find((w) => w.id === workId);
    if (changed) changed.updatedAt = new Date().toISOString();
    data = writeWorkspace(next);
    render();
    if (message) notify(message);
    return true;
  } catch (error) {
    notify(
      `未保存：${error.name === 'QuotaExceededError' ? '本机空间不足，请导出作品后减少图片。' : error.message}`,
    );
    return false;
  }
}
/** 切换视图并同步地址，以便从 3D 编辑器返回原分集。 */
function navigate(nextView, epId) {
  view = nextView;
  if (epId) episodeId = epId;
  render();
}
/** 输出可操作的空状态。 */
function empty(title, description, action, label) {
  return `<section class="wb-empty">${ico('clapperboard')}<h2>${esc(title)}</h2><p>${esc(description)}</p>${button(action, label, 'plus', '', 'primary')}</section>`;
}
/** 格式化作品内所有分镜的统计。 */
function stats(work) {
  const shots = work.episodes.flatMap((e) => e.shots);
  return {
    shots,
    duration: shots.reduce((sum, s) => sum + s.duration, 0),
    done: shots.filter((s) => s.status === '已完成').length,
  };
}
/** 渲染全局导航和当前模块，所有按钮事件由根节点委托。 */
function render() {
  const work = currentWork();
  const ep = currentEpisode();
  workId = work?.id;
  episodeId = ep?.id;
  const names = {
    spatial: '空间推演',
    overview: '作品概览',
    episodes: '分集与分镜',
    characters: '角色库',
    canvas: '分镜画布',
    script: '分集剧本',
  };
  history.replaceState(
    null,
    '',
    `/?${new URLSearchParams({ ...(workId ? { work: workId } : {}), ...(episodeId ? { episode: episodeId } : {}), view })}`,
  );
  root.innerHTML = `<div class="wb-shell">
    <aside class="wb-sidebar"><a class="wb-brand" href="/" aria-label="EasyDrama 简剧">${ico('scan')}<strong>EasyDrama</strong><small>简剧</small></a>
      <div class="wb-work-select"><label for="work-select">当前作品</label><div><select id="work-select" aria-label="切换作品">${work ? data.works.map((w) => `<option value="${w.id}" ${w.id === workId ? 'selected' : ''}>${esc(w.title)}</option>`).join('') : '<option>暂无作品</option>'}</select>${button('new-work', '新建作品', 'plus', '', 'wb-icon')}</div></div>
      <nav class="wb-nav">${button('view-spatial', '空间推演', 'box', `aria-current="${view === 'spatial' ? 'page' : 'false'}"`, `wb-spatial-nav ${view === 'spatial' ? 'active' : ''}`)}${[
        ['overview', '作品概览', 'layout-dashboard'],
        ['episodes', '分集与分镜', 'film'],
        ['characters', '角色库', 'users-round'],
        ['canvas', '分镜画布', 'layout-template'],
      ]
        .map(([key, label, icon]) =>
          button(
            `view-${key}`,
            label,
            icon,
            '',
            view === key || (key === 'episodes' && view === 'script') ? 'active' : '',
          ),
        )
        .join('')}</nav>
      <div class="wb-episode-nav"><div class="wb-section-heading"><span>分集目录</span>${button('new-episode', '新建分集', 'plus', '', 'wb-icon')}</div>${work?.episodes.map((e, i) => `<button data-action="open-episode" data-id="${e.id}" class="${e.id === episodeId && ['episodes', 'canvas', 'script'].includes(view) ? 'selected' : ''}"><em>${String(i + 1).padStart(2, '0')}</em><span>${esc(e.title)}</span><small>${e.shots.length}</small></button>`).join('') || '<p class="wb-muted">新建分集，开始组织故事。</p>'}</div>
      <footer class="wb-side-footer"><span>${ico('check')} 本机创作空间</span><p>作品自动保存于当前浏览器</p><div>${button('export-work', '导出作品', 'download')}${button('import-work', '导入', 'upload')}</div><a href="/?editor=1">打开独立 3D 编辑器 ↗</a></footer></aside>
    <main class="wb-main"><header class="wb-topbar"><div><span>${esc(work?.title || '创作空间')}</span><b>/</b><strong>${names[view]}</strong></div><span class="wb-local">LOCAL <i></i> 本机存储</span></header>
    ${startupError ? `<div class="wb-warning">${esc(startupError)} ${button('raw-backup', '导出原始备份', 'download')}${button('recover-storage', '从作品文件恢复', 'upload')}</div>` : ''}
    <div class="wb-content ${view === 'canvas' ? 'wb-canvas-content' : ''}">${view === 'spatial' ? spatialView(work) : !work ? empty('从一部作品开始', '建立作品、角色与分集，在同一个空间完成分镜创作。', 'new-work', '新建作品') : view === 'overview' ? overview(work) : view === 'characters' ? characters(work) : !ep ? empty('还没有分集', '为这部作品创建第一集。', 'new-episode', '新建分集') : view === 'script' ? scriptView(ep) : view === 'canvas' ? canvasView(work, ep) : episodeView(work, ep)}</div>
    </main></div><dialog id="wb-dialog"></dialog><div id="wb-notice" role="status" hidden></div><input id="wb-import" type="file" accept="application/json,.json" hidden>`;
  createIcons({ icons, attrs: { 'stroke-width': 1.6 } });
  document.getElementById('wb-import').addEventListener('change', importFile);
  if (view === 'canvas' && ep) setupCanvas();
}
/** 渲染作品概览和各集的真实制作进度。 */
function overview(work) {
  const s = stats(work);
  return `<div class="wb-heading"><div><p class="wb-eyebrow">PROJECT / 创作项目</p><h1>${esc(work.title)}</h1><p>${esc(work.synopsis || '先写下故事的核心，接着把它变成一个个镜头。')}</p></div><div class="wb-actions">${button('edit-work', '作品设置', 'pencil')}${button('new-episode', '新建分集', 'plus', '', 'primary')}</div></div>
  ${spatialEntry(work)}
  <div class="wb-stats"><div><span>分集</span><strong>${work.episodes.length}<small>集</small></strong></div><div><span>分镜</span><strong>${s.shots.length}<small>镜</small></strong></div><div><span>共享角色</span><strong>${work.characters.length}<small>位</small></strong></div><div><span>规划时长</span><strong>${Math.floor(s.duration / 60)}<small>分</small>${s.duration % 60}<small>秒</small></strong></div></div>
  <div class="wb-section-heading wb-large"><h2>分集工作区</h2><span>${work.format} 画幅 · ${s.done} 个分镜已完成</span></div>
  <div class="wb-episode-grid">${work.episodes
    .map((ep, i) => {
      const done = ep.shots.filter((s) => s.status === '已完成').length;
      return `<article class="wb-episode-card"><div class="wb-episode-cover"><span>EP.</span><strong>${String(i + 1).padStart(2, '0')}</strong><div>${ico('film')}</div></div><div class="wb-card-body"><div class="wb-card-title"><h3>${esc(ep.title)}</h3>${button('edit-episode', '编辑分集', 'pencil', `data-id="${ep.id}"`, 'wb-icon')}</div><p>${ep.shots.length} 个分镜 · ${ep.shots.reduce((a, s) => a + s.duration, 0)} 秒</p><div class="wb-progress"><i style="width:${ep.shots.length ? (done / ep.shots.length) * 100 : 0}%"></i></div><footer><span>${done} / ${ep.shots.length} 已完成</span>${button('open-episode', '进入分集', 'arrow-right', `data-id="${ep.id}"`)}</footer></div></article>`;
    })
    .join(
      '',
    )}<button class="wb-new-card" data-action="new-episode">${ico('plus')}<span>添加新的分集</span><small>让故事继续展开</small></button></div>
  <div class="wb-workflow"><div>${ico('file-text')}<b>01 剧本与分集</b><span>组织故事结构</span></div><div>${ico('users-round')}<b>02 角色与分镜</b><span>统一人物与画面</span></div><div>${ico('box')}<b>03 空间推演</b><span>设计站位与摄影机</span></div></div>`;
}
/** 将空间推演作为作品首页的主要创作入口，展示真实已保存场景数量。 */
function spatialEntry(work) {
  const shots = work.episodes.flatMap((episode) => episode.shots);
  const saved = shots.filter((shot) => shot.spatial);
  const image = saved.find((shot) => shot.image)?.image;
  return `<section class="wb-spatial-entry"><div class="wb-spatial-intro"><p class="wb-eyebrow">3D SPACE / 核心创作工具</p><h2>空间推演</h2><p>搭建场景、安排人物站位，设计机位与走位。<br>在三维空间中预演，再把画面带回分镜。</p><div>${button('view-spatial', '进入空间推演', 'arrow-right', '', 'primary')}<span>${saved.length ? `${saved.length} 个场景可继续编辑` : '从一个场景开始创作'}</span></div></div><div class="wb-spatial-visual" aria-hidden="true">${image ? `<img src="${image}" alt="">` : `<div class="wb-spatial-grid"></div>${ico('box')}`}<span>人物站位 · 摄影机 · 走位预演</span></div></section>`;
}
/** 汇总作品各集的推演入口，明确每个按钮对应的分集与分镜。 */
function spatialView(work) {
  const entries = work?.episodes.flatMap((episode) => episode.shots.map((shot) => ({ episode, shot }))) || [];
  const saved = entries.filter(({ shot }) => shot.spatial).length;
  return `<div class="wb-heading"><div><p class="wb-eyebrow">3D SPACE / 空间推演</p><h1>把分镜放进真实的空间</h1><p>选择分镜，继续安排人物与摄影机；也可以直接进入独立编辑器，自由试拍。</p></div><a class="wb-independent-link" href="/?editor=1">${ico('box')} 打开独立 3D 编辑器 ${ico('arrow-right')}</a></div><div class="wb-list-toolbar"><strong>作品中的分镜场景</strong><span>${saved} 个已保存 · ${entries.length - saved} 个待搭建</span></div>${entries.length ? `<div class="wb-spatial-scenes">${entries.map(({ episode, shot }) => `<article class="wb-spatial-scene"><div class="wb-spatial-preview">${shot.image ? `<img src="${shot.image}" alt="${esc(shot.title)}的参考画面">` : `<div>${ico('box')}<span>${shot.spatial ? '已保存 3D 场景' : '等待搭建场景'}</span></div>`}<span>${shot.spatial ? '已有场景' : '待搭建'}</span></div><div class="wb-card-body"><p>${esc(episode.title)}</p><h3>${esc(shot.title)}</h3><footer><span>${shot.spatial ? `${shot.spatial.objects.length} 个场景对象` : `${shot.characterIds.length} 位关联角色`}</span>${button('open-spatial', shot.spatial ? '继续推演' : '开始推演', 'arrow-right', `data-id="${shot.id}" data-episode="${episode.id}"`, 'primary')}</footer></div></article>`).join('')}</div>` : empty('开始你的第一次空间推演', '直接打开独立编辑器，或先创建分镜，把场景保存到作品中。', !work ? 'new-work' : currentEpisode() ? 'new-shot' : 'new-episode', !work ? '创建作品' : currentEpisode() ? '创建分镜' : '创建分集')}`;
}

/** 渲染作品级共享角色卡片。 */
function characters(work) {
  return `<div class="wb-heading"><div><p class="wb-eyebrow">CAST / 共享资产</p><h1>角色库 <small>${work.characters.length}</small></h1><p>一份角色设定，贯穿所有分集。每个分镜都可以引用这里的角色。</p></div>${button('new-character', '新建角色', 'plus', '', 'primary')}</div>${!work.characters.length ? empty('故事里都有谁？', '添加人物名称、形象和设定，再把角色关联到分镜。', 'new-character', '创建第一个角色') : `<div class="wb-character-grid">${work.characters.map((c) => `<article class="wb-character-card"><div class="wb-portrait" style="--character-color:${c.color}">${c.image ? `<img src="${c.image}" alt="${esc(c.name)}">` : `<span>${esc(c.name.slice(0, 1))}</span><small>角色形象待上传</small>`}<em>${esc(c.role || '角色')}</em></div><div class="wb-card-body"><h3>${esc(c.name)}</h3><p class="wb-clamp">${esc(c.description || '还没有角色设定')}</p><footer><span>${work.episodes.flatMap((e) => e.shots).filter((s) => s.characterIds.includes(c.id)).length} 个分镜引用</span>${button('edit-character', '编辑', 'pencil', `data-id="${c.id}"`)}</footer></div></article>`).join('')}</div>`}`;
}
/** 渲染当前分集的镜头列表及快捷操作。 */
function episodeView(work, ep) {
  return `<div class="wb-heading"><div><p class="wb-eyebrow">EPISODE / ${String(work.episodes.indexOf(ep) + 1).padStart(2, '0')}</p><h1>${esc(ep.title)}</h1><p>${ep.shots.length} 个分镜 · ${ep.shots.reduce((a, s) => a + s.duration, 0)} 秒规划时长</p></div><div class="wb-actions">${button('edit-episode', '分集设置', 'pencil', `data-id="${ep.id}"`)}${button('view-script', '编辑剧本', 'file-text')}${button('new-shot', '添加分镜', 'plus', '', 'primary')}</div></div><div class="wb-list-toolbar"><div class="wb-tabs">${button('view-episodes', '分镜列表', 'film', '', 'active')}${button('view-canvas', '创作画布', 'layout-template')}</div><span>按镜头顺序组织画面与动作</span></div>${!ep.shots.length ? empty('把故事拆成第一个镜头', '设置画面描述、景别与角色，然后进入 3D 空间推演。', 'new-shot', '添加分镜') : `<div class="wb-shot-list">${ep.shots.map((s, i) => shotCard(work, s, i, false)).join('')}</div>`}`;
}
/** 渲染镜头卡片，在列表和画布之间复用真实数据。 */
function shotCard(work, shot, index, canvas) {
  return `<article class="wb-shot-card ${canvas ? 'on-canvas' : ''}" data-shot-id="${shot.id}" ${canvas ? `style="left:${shot.x}px;top:${shot.y}px"` : ''}><div class="wb-shot-number">${canvas ? `<button class="wb-drag" data-drag="${shot.id}" aria-label="拖动分镜 ${esc(shot.title)}，方向键微调位置">${ico('grip')}<span>SHOT ${String(index + 1).padStart(2, '0')}</span></button>` : `<span>SHOT ${String(index + 1).padStart(2, '0')}</span>`}<span class="wb-status ${shot.status === '已完成' ? 'done' : ''}">${esc(shot.status)}</span></div><div class="wb-shot-content"><button class="wb-shot-image" data-action="edit-shot" data-id="${shot.id}" aria-label="编辑分镜 ${esc(shot.title)}">${shot.image ? `<img src="${shot.image}" alt="${esc(shot.title)}的分镜画面">` : `<div>${ico(shot.spatial ? 'box' : 'image-plus')}<span>${shot.spatial ? '已保存 3D 场景' : '添加参考画面'}</span></div>`}<em>${shot.size} · ${shot.duration}s</em></button><div class="wb-shot-details"><div class="wb-card-title"><h3>${esc(shot.title)}</h3>${button('edit-shot', '编辑分镜', 'pencil', `data-id="${shot.id}"`, 'wb-icon')}</div>${shot.sceneName ? `<p class="wb-scene-name">${esc(shot.sceneName)}</p>` : ''}<p class="wb-clamp">${esc(shot.description || '描述镜头里的画面、动作和情绪…')}</p><div class="wb-cast-tags">${
    shot.characterIds
      .map((id) => work.characters.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => `<span><i style="background:${c.color}"></i>${esc(c.name)}</span>`)
      .join('') || '<small>未关联角色</small>'
  }</div></div></div><footer>${button('open-spatial', '空间推演', 'box', `data-id="${shot.id}"`)}<div>${!canvas ? `${button('shot-up', '前移', 'arrow-left', `data-id="${shot.id}" ${index === 0 ? 'disabled' : ''}`, 'wb-icon')}${button('shot-down', '后移', 'arrow-right', `data-id="${shot.id}" ${index === currentEpisode().shots.length - 1 ? 'disabled' : ''}`, 'wb-icon')}` : ''}${button('duplicate-shot', '复制分镜', 'copy', `data-id="${shot.id}"`, 'wb-icon')}</div></footer></article>`;
}
/** 提供显式保存的剧本编辑区，避免输入过程中重新渲染光标。 */
function scriptView(ep) {
  return `<div class="wb-heading"><div><p class="wb-eyebrow">SCRIPT / 分集剧本</p><h1>${esc(ep.title)}</h1><p>记录完整剧本，分镜描述在镜头卡片中单独维护。</p></div>${button('view-episodes', '返回分镜', 'arrow-left')}</div><form id="wb-script-form"><label for="episode-script">剧本正文 <span>Ctrl / ⌘ + S 保存</span></label><textarea id="episode-script" name="script" maxlength="200000" placeholder="场次、人物、对白、动作……">${esc(ep.script)}</textarea><footer><span id="script-save-hint">编辑后点击保存</span><button class="primary" type="submit">${ico('check')} 保存剧本</button></footer></form>`;
}
/** 创建自由画布，卡片位置来自每个分镜的数据。 */
function canvasView(work, ep) {
  return `<div class="wb-heading wb-canvas-heading"><div><p class="wb-eyebrow">STORYBOARD / 分镜创作画布</p><h1>${esc(ep.title)}</h1></div><div class="wb-actions">${button('view-episodes', '列表', 'film')}${button('arrange', '整理布局', 'layout-template')}${button('new-shot', '添加分镜', 'plus', '', 'primary')}</div></div><div id="wb-canvas"><div id="wb-canvas-plane">${ep.shots.map((s, i) => shotCard(work, s, i, true)).join('')}</div>${!ep.shots.length ? '<div class="wb-canvas-empty">画布还是空的，添加分镜开始创作。</div>' : ''}<div class="wb-canvas-help">拖动卡片标题移动 · 空白拖动平移 · 滚轮缩放</div><div class="wb-zoom">${button('zoom-out', '缩小', 'zoom-out', '', 'wb-icon')}<output id="wb-zoom-value">100%</output>${button('zoom-in', '放大', 'zoom-in', '', 'wb-icon')}${button('fit-canvas', '适应画布', 'maximize', '', 'wb-icon')}</div></div>`;
}
/** 创建表单控件，全部文本和值均经过转义。 */
function field(label, name, value = '', kind = 'text', options = []) {
  if (kind === 'textarea')
    return `<label>${label}<textarea name="${name}" maxlength="${name === 'description' ? 10000 : 20000}">${esc(value)}</textarea></label>`;
  if (kind === 'select')
    return `<label>${label}<select name="${name}">${options.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<label>${label}<input name="${name}" type="${kind}" value="${esc(value)}" ${kind === 'number' ? 'min="1" max="600" step="1"' : kind === 'text' ? `maxlength="${name === 'name' || name === 'role' ? 80 : 100}"` : ''} ${['title', 'name', 'duration'].includes(name) ? 'required' : ''}></label>`;
}
/** 弹出实体编辑表单，图片修改在提交前只保存在临时状态。 */
function openForm(kind, id) {
  const work = currentWork();
  const ep = currentEpisode();
  const entity =
    kind === 'work'
      ? id
        ? work
        : createWork('')
      : kind === 'episode'
        ? id
          ? work.episodes.find((e) => e.id === id)
          : createEpisode(`第 ${work.episodes.length + 1} 集`)
        : kind === 'character'
          ? id
            ? work.characters.find((c) => c.id === id)
            : createCharacter('')
          : id
            ? ep.shots.find((s) => s.id === id)
            : createShot(`分镜 ${ep.shots.length + 1}`, ep.shots.length);
  if (!entity) return;
  dialogState = { kind, id, entity, workId, episodeId };
  pendingImage = entity.image || '';
  const titles = { work: '作品', episode: '分集', character: '角色', shot: '分镜' };
  let fields =
    kind === 'character'
      ? field('角色名称', 'name', entity.name) +
        field('角色定位', 'role', entity.role) +
        field('角色设定', 'description', entity.description, 'textarea') +
        field('演员色标', 'color', entity.color, 'color')
      : field(`${titles[kind]}名称`, 'title', entity.title);
  if (kind === 'work')
    fields +=
      field('画幅', 'format', entity.format, 'select', ['16:9', '9:16', '1:1']) +
      field('故事梗概', 'synopsis', entity.synopsis, 'textarea');
  if (kind === 'episode') fields += '<p class="wb-muted">剧本正文在分集的「编辑剧本」中管理。</p>';
  if (kind === 'shot')
    fields += `<div class="wb-form-row">${field('场次 / 地点', 'sceneName', entity.sceneName)}${field('时长（秒）', 'duration', entity.duration, 'number')}</div><div class="wb-form-row">${field('景别', 'size', entity.size, 'select', SHOT_SIZES)}${field('制作状态', 'status', entity.status, 'select', SHOT_STATUSES)}</div>${field('画面描述 / 动作 / 对白', 'description', entity.description, 'textarea')}<fieldset class="wb-character-checks"><legend>关联角色</legend>${work.characters.map((c) => `<label><input type="checkbox" name="characterIds" value="${c.id}" ${entity.characterIds.includes(c.id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('') || '<p class="wb-muted">先到角色库创建角色，即可在这里关联。</p>'}</fieldset>`;
  if (['shot', 'character'].includes(kind))
    fields += `<div class="wb-image-field"><label>参考形象 / 画面<input id="wb-image-input" type="file" accept="image/png,image/jpeg,image/webp"></label><div id="wb-image-preview">${pendingImage ? `<img src="${pendingImage}" alt="当前参考图">` : '<span>支持 PNG、JPEG、WebP，自动压缩保存</span>'}</div>${button('clear-image', '移除图片', 'trash-2')}</div>`;
  const dialog = document.getElementById('wb-dialog');
  dialog.innerHTML = `<form id="wb-entity-form"><header><div><small>${id ? 'EDIT' : 'CREATE'}</small><h2>${id ? '编辑' : '新建'}${titles[kind]}</h2></div>${button('close-dialog', '关闭', 'x', '', 'wb-icon')}</header><div class="wb-form-content">${fields}</div><footer>${id ? button('delete-entity', `删除${titles[kind]}`, 'trash-2', '', 'wb-danger') : '<span></span>'}<div>${button('close-dialog', '取消')}<button type="submit" class="primary">保存${titles[kind]}</button></div></footer></form>`;
  createIcons({ icons });
  dialog.showModal();
  document.getElementById('wb-image-input')?.addEventListener('change', uploadImage);
}
/** 检查用户选择的图片并更新表单预览，不提前保存实体。 */
async function uploadImage(event) {
  const file = event.target.files[0];
  const state = dialogState;
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    notify('请选择不超过 20 MB 的 PNG、JPEG 或 WebP 图片。');
    return;
  }
  const submit = document.querySelector('#wb-entity-form [type="submit"]');
  submit.disabled = true;
  try {
    const image = await compressImage(file);
    if (dialogState !== state || !document.getElementById('wb-dialog').open) return;
    pendingImage = image;
    document.getElementById('wb-image-preview').innerHTML = `<img src="${image}" alt="待保存的参考图">`;
  } catch {
    notify('图片无法解码，请选择有效的图片文件。');
  } finally {
    submit.disabled = false;
  }
}
/** 保存表单到相应层级；保存失败时保持表单和输入内容。 */
function submitEntity(form) {
  const values = new FormData(form);
  const state = dialogState;
  const entity = structuredClone(state.entity);
  for (const key of [
    'title',
    'name',
    'role',
    'description',
    'synopsis',
    'format',
    'sceneName',
    'size',
    'status',
    'color',
  ])
    if (values.has(key)) entity[key] = String(values.get(key)).trim();
  if ((values.has('title') && !entity.title) || (values.has('name') && !entity.name)) {
    notify('名称不能为空。');
    return;
  }
  if (state.kind === 'shot') {
    entity.duration = Number(values.get('duration'));
    entity.characterIds = values.getAll('characterIds');
  }
  if (['shot', 'character'].includes(state.kind)) entity.image = pendingImage;
  const success = update((next) => {
    if (state.kind === 'work') {
      if (state.id) next.works[next.works.findIndex((w) => w.id === state.id)] = entity;
      else next.works.push(entity);
      return;
    }
    const w = next.works.find((w) => w.id === state.workId);
    const collection =
      state.kind === 'episode'
        ? w.episodes
        : state.kind === 'character'
          ? w.characters
          : w.episodes.find((e) => e.id === state.episodeId).shots;
    if (state.id) collection[collection.findIndex((e) => e.id === state.id)] = entity;
    else collection.push(entity);
  });
  if (success) {
    dialogState = null;
    if (state.kind === 'work') {
      workId = entity.id;
      episodeId = null;
      view = 'overview';
      render();
    }
    if (state.kind === 'episode') navigate('episodes', entity.id);
  }
}
/** 使用可访问的应用弹窗确认删除或放弃操作。 */
function askConfirm(message) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'wb-confirm';
    dialog.innerHTML = `<h2>确认操作</h2><p>${esc(message)}</p><div><button data-choice="cancel" autofocus>取消</button><button data-choice="confirm" class="primary">确认</button></div>`;
    document.body.append(dialog);
    dialog.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-choice]');
      if (!choice) return;
      dialog.close(choice.dataset.choice);
    });
    dialog.addEventListener(
      'close',
      () => {
        const accepted = dialog.returnValue === 'confirm';
        dialog.remove();
        resolve(accepted);
      },
      { once: true },
    );
    dialog.showModal();
  });
}

/** 删除前展示具体影响，并在删除角色时清理跨集引用。 */
async function deleteEntity() {
  const state = dialogState;
  const descriptions = {
    work: '作品内的所有分集、角色、图片和 3D 场景也会删除。',
    episode: '本集的全部分镜与 3D 场景也会删除。',
    character: '所有分镜中的角色关联会被移除，已有 3D 演员保留。',
    shot: '这个分镜的图片和 3D 场景也会删除。',
  };
  if (!(await askConfirm(`删除「${state.entity.title || state.entity.name}」？${descriptions[state.kind]}`)))
    return;
  if (
    update((next) => {
      const w = next.works.find((w) => w.id === state.workId);
      if (state.kind === 'work') next.works = next.works.filter((w) => w.id !== state.id);
      else if (state.kind === 'episode') w.episodes = w.episodes.filter((e) => e.id !== state.id);
      else if (state.kind === 'character') removeCharacter(w, state.id);
      else {
        const ep = w.episodes.find((e) => e.id === state.episodeId);
        ep.shots = ep.shots.filter((s) => s.id !== state.id);
      }
    }, '已删除')
  )
    dialogState = null;
}
/** 使用 Blob 下载完整 JSON，不发送任何数据到外部服务。 */
function downloadJson(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** 先验证整份文件，再作为独立作品副本合并到本机。 */
async function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('文件超过 30 MB。');
    const imported = validateWorkspace(JSON.parse(await file.text()));
    if (!imported.works.length) throw new Error('文件中没有作品。');
    const copies = imported.works.map(copyWork);
    if (startupError) {
      if (!(await askConfirm('用导入文件恢复创作空间？现有损坏存档将被替换，请确认已导出原始备份。'))) return;
      data = writeWorkspace({ version: 1, works: copies });
      startupError = '';
      workId = copies[0].id;
      view = 'overview';
      render();
      notify('已从文件恢复');
    } else if (update((next) => next.works.push(...copies), '已导入作品副本')) {
      workId = copies[0].id;
      episodeId = null;
      navigate('overview');
    }
  } catch (error) {
    notify(`导入失败：${error.message}`);
  }
}
/** 获取当前分集画布的临时视口状态。 */
function canvasState() {
  if (!canvasViews.has(episodeId)) canvasViews.set(episodeId, { x: 20, y: 20, zoom: 0.85 });
  return canvasViews.get(episodeId);
}
/** 应用平移缩放，保留卡片的世界坐标。 */
function paintCanvas() {
  const s = canvasState();
  const plane = document.getElementById('wb-canvas-plane');
  if (!plane) return;
  plane.style.transform = `translate(${s.x}px,${s.y}px) scale(${s.zoom})`;
  document.getElementById('wb-zoom-value').textContent = `${Math.round(s.zoom * 100)}%`;
}
/** 以指定屏幕锚点缩放画布。 */
function zoomCanvas(factor, x, y) {
  const s = canvasState();
  const rect = document.getElementById('wb-canvas').getBoundingClientRect();
  x ??= rect.width / 2;
  y ??= rect.height / 2;
  const zoom = Math.max(0.25, Math.min(1.5, s.zoom * factor));
  s.x = x - ((x - s.x) * zoom) / s.zoom;
  s.y = y - ((y - s.y) * zoom) / s.zoom;
  s.zoom = zoom;
  paintCanvas();
}
/** 将所有分镜卡片放入当前可见区域。 */
function fitCanvas() {
  const shots = currentEpisode().shots;
  const rect = document.getElementById('wb-canvas').getBoundingClientRect();
  const s = canvasState();
  if (!shots.length) {
    Object.assign(s, { x: 20, y: 20, zoom: 0.85 });
    paintCanvas();
    return;
  }
  const minX = Math.min(...shots.map((s) => s.x)),
    minY = Math.min(...shots.map((s) => s.y));
  const width = Math.max(...shots.map((s) => s.x)) + 300 - minX,
    height = Math.max(...shots.map((s) => s.y)) + 410 - minY;
  s.zoom = Math.max(0.25, Math.min(1, (rect.width - 100) / width, (rect.height - 120) / height));
  s.x = (rect.width - width * s.zoom) / 2 - minX * s.zoom;
  s.y = 35 - minY * s.zoom;
  paintCanvas();
}
/** 为卡片标题和空白区域安装拖动交互，抬起后才提交一次数据。 */
function setupCanvas() {
  const canvas = document.getElementById('wb-canvas');
  let drag = null;
  paintCanvas();
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (event.target.closest('.wb-zoom')) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomCanvas(Math.exp(-event.deltaY * 0.001), event.clientX - rect.left, event.clientY - rect.top);
    },
    { passive: false },
  );
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const handle = event.target.closest('[data-drag]');
    if (!handle && event.target.closest('button,.wb-shot-card,.wb-zoom')) return;
    const shot = handle && currentEpisode().shots.find((s) => s.id === handle.dataset.drag);
    const state = canvasState();
    drag = {
      id: shot?.id,
      startX: event.clientX,
      startY: event.clientY,
      x: shot?.x ?? state.x,
      y: shot?.y ?? state.y,
      moved: false,
      pointer: event.pointerId,
    };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (handle) handle.focus();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX,
      dy = event.clientY - drag.startY;
    drag.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    if (drag.id) {
      drag.nextX = Math.max(0, Math.min(10000, drag.x + dx / canvasState().zoom));
      drag.nextY = Math.max(0, Math.min(10000, drag.y + dy / canvasState().zoom));
      const card = canvas.querySelector(`[data-shot-id="${drag.id}"]`);
      card.style.left = `${drag.nextX}px`;
      card.style.top = `${drag.nextY}px`;
    } else {
      canvasState().x = drag.x + dx;
      canvasState().y = drag.y + dy;
      paintCanvas();
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (!drag) return;
    const done = drag;
    drag = null;
    if (done.moved && done.id) {
      const saved = update((next) => {
        const shot = next.works
          .find((w) => w.id === workId)
          .episodes.find((e) => e.id === episodeId)
          .shots.find((s) => s.id === done.id);
        shot.x = done.nextX;
        shot.y = done.nextY;
      }, '');
      if (!saved) {
        const card = canvas.querySelector(`[data-shot-id="${done.id}"]`);
        card.style.left = `${done.x}px`;
        card.style.top = `${done.y}px`;
      }
    }
  });
  canvas.addEventListener('pointercancel', () => {
    drag = null;
    render();
  });
}
/** 统一分发导航、实体编辑、导出和画布命令。 */
async function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action,
    id = target.dataset.id;
  const work = currentWork(),
    ep = currentEpisode();
  if (
    view === 'script' &&
    document.getElementById('episode-script')?.value !== ep?.script &&
    !['export-work', 'raw-backup'].includes(action)
  ) {
    if (!(await askConfirm('剧本尚未保存，确定放弃这些修改并离开吗？'))) return;
    document.getElementById('episode-script').value = ep.script;
  }
  if (action.startsWith('view-')) {
    navigate(action.slice(5));
    return;
  }
  if (action === 'new-work') return openForm('work');
  if (action === 'import-work' || action === 'recover-storage')
    return document.getElementById('wb-import').click();
  if (action === 'raw-backup')
    return downloadJson(localStorage.getItem(WORKSPACE_KEY) || 'null', 'EasyDrama-原始存档备份.json');
  if (action === 'close-dialog') {
    document.getElementById('wb-dialog').close();
    dialogState = null;
    return;
  }
  if (!work) return;
  if (action === 'edit-work') return openForm('work', work.id);
  if (action === 'new-episode') return openForm('episode');
  if (action === 'edit-episode') return openForm('episode', id);
  if (action === 'new-character') return openForm('character');
  if (action === 'edit-character') return openForm('character', id);
  if (action === 'open-episode') return navigate('episodes', id);
  if (action === 'export-work')
    return downloadJson(
      JSON.stringify({ version: 1, works: [work] }, null, 2),
      `${work.title.replace(/[\\/:*?"<>|]/g, '-')}.frame-work.json`,
    );
  if (action === 'delete-entity') return deleteEntity();
  if (action === 'clear-image') {
    pendingImage = '';
    document.getElementById('wb-image-preview').textContent = '图片已移除，保存后生效';
    return;
  }
  if (!ep) return;
  if (action === 'new-shot') return openForm('shot');
  if (action === 'edit-shot') return openForm('shot', id);
  if (action === 'open-spatial') {
    location.href = `/?${new URLSearchParams({ editor: '1', work: work.id, episode: target.dataset.episode || ep.id, shot: id })}`;
    return;
  }
  if (action === 'shot-up' || action === 'shot-down')
    return update((next) =>
      moveShot(
        next.works.find((w) => w.id === workId).episodes.find((e) => e.id === episodeId),
        id,
        action === 'shot-up' ? -1 : 1,
      ),
    );
  if (action === 'duplicate-shot')
    return update((next) => {
      const e = next.works.find((w) => w.id === workId).episodes.find((e) => e.id === episodeId);
      const original = e.shots.find((s) => s.id === id);
      const copy = structuredClone(original);
      copy.id = crypto.randomUUID();
      copy.title = `${copy.title.slice(0, 94)} · 副本`;
      copy.x = Math.min(10000, copy.x + 40);
      copy.y = Math.min(10000, copy.y + 40);
      e.shots.splice(e.shots.indexOf(original) + 1, 0, copy);
    });
  if (action === 'arrange')
    return update((next) => {
      next.works
        .find((w) => w.id === workId)
        .episodes.find((e) => e.id === episodeId)
        .shots.forEach((s, i) => {
          s.x = 50 + (i % 3) * 340;
          s.y = 50 + Math.floor(i / 3) * 440;
        });
    });
  if (action === 'zoom-in') return zoomCanvas(1.2);
  if (action === 'zoom-out') return zoomCanvas(1 / 1.2);
  if (action === 'fit-canvas') return fitCanvas();
}
/** 保存当前分集剧本，失败时保留尚未保存的正文。 */
function saveScript() {
  const value = document.getElementById('episode-script').value;
  update((next) => {
    next.works.find((w) => w.id === workId).episodes.find((e) => e.id === episodeId).script = value;
  }, '剧本已保存');
}
root.addEventListener('click', handleClick);
root.addEventListener('change', async (event) => {
  if (event.target.id === 'work-select') {
    const id = event.target.value;
    if (
      view === 'script' &&
      document.getElementById('episode-script')?.value !== currentEpisode()?.script &&
      !(await askConfirm('剧本尚未保存，确定切换作品吗？'))
    ) {
      event.target.value = workId;
      return;
    }
    workId = id;
    episodeId = null;
    navigate('overview');
  }
});
root.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'wb-entity-form') submitEntity(event.target);
  if (event.target.id === 'wb-script-form') saveScript();
});
root.addEventListener('input', (event) => {
  if (event.target.id === 'episode-script')
    document.getElementById('script-save-hint').textContent = '有未保存的修改';
});
/** 支持剧本保存快捷键与画布卡片方向键移动。 */
root.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && view === 'script') {
    event.preventDefault();
    saveScript();
    return;
  }
  const handle = event.target.closest('[data-drag]');
  const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[
    event.key
  ];
  if (handle && delta) {
    event.preventDefault();
    const id = handle.dataset.drag;
    if (
      update((next) => {
        const shot = next.works
          .find((w) => w.id === workId)
          .episodes.find((e) => e.id === episodeId)
          .shots.find((s) => s.id === id);
        shot.x = Math.max(0, Math.min(10000, shot.x + delta[0]));
        shot.y = Math.max(0, Math.min(10000, shot.y + delta[1]));
      }, '')
    )
      document.querySelector(`[data-drag="${id}"]`)?.focus();
  }
});
/** 页面关闭时提醒尚未提交的剧本文本。 */
window.addEventListener('beforeunload', (event) => {
  if (view === 'script' && document.getElementById('episode-script')?.value !== currentEpisode()?.script) {
    event.preventDefault();
    event.returnValue = '';
  }
});
/** 其他标签更新后提示刷新，避免静默丢失当前未保存的表单。 */
window.addEventListener('storage', (event) => {
  if (event.key !== WORKSPACE_KEY) return;
  if (
    document.getElementById('wb-dialog').open ||
    (view === 'script' && document.getElementById('episode-script')?.value !== currentEpisode()?.script)
  ) {
    startupError = '作品已在其他标签中更新。请复制未保存内容后刷新页面，再继续编辑。';
    notify(startupError);
    return;
  }
  try {
    data = readWorkspace();
    render();
    notify('已同步其他标签的修改');
  } catch (error) {
    notify(error.message);
  }
});
render();
