import { createProject, createObject, validateProject } from './project.js';

export const WORKSPACE_KEY = 'frame.creative.workspace.v1';
export const LEGACY_KEY = 'frame.spatial.project.v1';
export const SHOT_SIZES = ['远景', '全景', '中景', '近景', '特写'];
export const SHOT_STATUSES = ['待设计', '制作中', '已完成'];

/** 创建具有独立三维工程与画布坐标的分镜。 */
export function createShot(title = '新分镜', index = 0) {
  return {
    id: crypto.randomUUID(),
    title,
    sceneName: '',
    description: '',
    duration: 6,
    size: '中景',
    status: '待设计',
    characterIds: [],
    image: '',
    x: 60 + (index % 3) * 340,
    y: 60 + Math.floor(index / 3) * 440,
    spatial: null,
  };
}
/** 创建一个空分集，剧本与分镜均归属于当前集。 */
export function createEpisode(title = '第 1 集') {
  return { id: crypto.randomUUID(), title, script: '', shots: [] };
}
/** 创建作品及首集，角色库由整部作品共享。 */
export function createWork(title = '未命名作品') {
  return {
    id: crypto.randomUUID(),
    title,
    synopsis: '',
    format: '16:9',
    characters: [],
    episodes: [createEpisode()],
    updatedAt: new Date().toISOString(),
  };
}
/** 创建角色档案，图片与色标供所有分集引用。 */
export function createCharacter(name = '新角色') {
  return { id: crypto.randomUUID(), name, role: '主要角色', description: '', color: '#a785c8', image: '' };
}
/** 初次使用时复制旧场景到首个分镜，不改变旧存档。 */
export function createWorkspace(legacy = null) {
  const work = createWork('我的第一部作品');
  if (legacy) {
    const shot = createShot('原有空间推演');
    shot.spatial = validateProject(legacy);
    shot.duration = shot.spatial.duration;
    work.episodes[0].shots.push(shot);
  }
  return { version: 1, works: [work] };
}
/** 检查字符串长度，返回原始文本以保留换行。 */
function text(value, max) {
  if (typeof value !== 'string' || value.length > max) throw new Error('作品文件包含无效或过长的文本。');
  return value;
}
/** 仅允许可嵌入的栅格图片，拒绝远程资源和 SVG。 */
function image(value) {
  if (value === '') return '';
  if (
    typeof value !== 'string' ||
    value.length > 800000 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new Error('图片格式无效或图片过大。');
  return value;
}
/** 校验实体 ID 并阻止集合中重复的身份标识。 */
function entityId(value, ids) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value) || ids.has(value))
    throw new Error('作品文件包含无效或重复的 ID。');
  ids.add(value);
  return value;
}
/** 检查数组规模，限制导入占用。 */
function list(value, max) {
  if (!Array.isArray(value) || value.length > max) throw new Error('作品文件结构无效或内容超出数量限制。');
  return value;
}
/** 验证数字的有穷性和允许范围。 */
function number(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error('作品文件包含超出范围的数值。');
  return value;
}
/** 以显式字段重建数据，递归验证引用与 3D 工程。 */
export function validateWorkspace(input) {
  if (!input || input.version !== 1) throw new Error('不支持的作品文件版本。');
  const ids = new Set();
  try {
    const works = list(input.works, 100).map((work) => {
      const id = entityId(work.id, ids);
      const characters = list(work.characters, 200).map((c) => {
        if (!/^#[0-9a-f]{6}$/i.test(c.color)) throw new Error('角色色标无效。');
        return {
          id: entityId(c.id, ids),
          name: text(c.name, 80),
          role: text(c.role, 80),
          description: text(c.description, 10000),
          color: c.color,
          image: image(c.image),
        };
      });
      const characterIds = new Set(characters.map((c) => c.id));
      const episodes = list(work.episodes, 200).map((ep) => ({
        id: entityId(ep.id, ids),
        title: text(ep.title, 100),
        script: text(ep.script, 200000),
        shots: list(ep.shots, 500).map((s) => {
          const refs = list(s.characterIds, 200);
          if (new Set(refs).size !== refs.length || refs.some((ref) => !characterIds.has(ref)))
            throw new Error('分镜引用了不存在或重复的角色。');
          if (!SHOT_SIZES.includes(s.size) || !SHOT_STATUSES.includes(s.status))
            throw new Error('分镜景别或状态无效。');
          return {
            id: entityId(s.id, ids),
            title: text(s.title, 100),
            sceneName: text(s.sceneName, 100),
            description: text(s.description, 20000),
            duration: number(s.duration, 1, 600),
            size: s.size,
            status: s.status,
            characterIds: [...refs],
            image: image(s.image),
            x: number(s.x, 0, 10000),
            y: number(s.y, 0, 10000),
            spatial: s.spatial === null ? null : validateProject(s.spatial),
          };
        }),
      }));
      if (!['16:9', '9:16', '1:1'].includes(work.format)) throw new Error('作品画幅无效。');
      return {
        id,
        title: text(work.title, 100),
        synopsis: text(work.synopsis, 20000),
        format: work.format,
        characters,
        episodes,
        updatedAt: text(work.updatedAt, 40),
      };
    });
    return { version: 1, works };
  } catch (error) {
    if (error instanceof TypeError) throw new Error('作品文件缺少必要字段。');
    throw error;
  }
}
/** 读取工作台存档；只有不存在新存档时才迁移旧场景。 */
export function readWorkspace(storage = localStorage) {
  const saved = storage.getItem(WORKSPACE_KEY);
  if (saved !== null) return validateWorkspace(JSON.parse(saved));
  const old = storage.getItem(LEGACY_KEY);
  return createWorkspace(old ? JSON.parse(old) : null);
}
/** 校验并原子写入本地，失败时不返回新状态。 */
export function writeWorkspace(data, storage = localStorage) {
  const valid = validateWorkspace(data);
  storage.setItem(WORKSPACE_KEY, JSON.stringify(valid));
  return valid;
}
/** 定位唯一分镜，缺失时明确报错而不回退到其他分镜。 */
export function locateShot(data, workId, episodeId, shotId) {
  const work = data.works.find((w) => w.id === workId);
  const episode = work?.episodes.find((e) => e.id === episodeId);
  const shot = episode?.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error('这个分镜已不存在，请返回工作台重新选择。');
  return { work, episode, shot };
}
/** 删除共享角色时同步清理所有分镜引用。 */
export function removeCharacter(work, characterId) {
  work.characters = work.characters.filter((c) => c.id !== characterId);
  for (const ep of work.episodes)
    for (const shot of ep.shots) shot.characterIds = shot.characterIds.filter((id) => id !== characterId);
}
/** 在边界内移动分镜顺序，画布位置不随顺序改变。 */
export function moveShot(episode, shotId, delta) {
  const from = episode.shots.findIndex((s) => s.id === shotId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= episode.shots.length) return;
  const [shot] = episode.shots.splice(from, 1);
  episode.shots.splice(to, 0, shot);
}
/** 为分镜创建独立场景，并用关联角色初始化演员名称与色标。 */
export function sceneForShot(work, shot) {
  if (shot.spatial) return validateProject(shot.spatial);
  const scene = createProject('studio');
  scene.name = shot.title;
  scene.duration = Math.min(120, shot.duration);
  scene.camera.aspect = work.format;
  if (shot.characterIds.length) {
    const cast = shot.characterIds.map((id) => work.characters.find((c) => c.id === id)).filter(Boolean);
    const actors = cast.map((character, index) => {
      const actor = createObject(
        'actor',
        character.name,
        [((index % 10) - (Math.min(cast.length, 10) - 1) / 2) * 1.8, 0, 0.4 + Math.floor(index / 10) * 1.8],
        character.color,
      );
      return actor;
    });
    scene.objects = [...actors, ...scene.objects.filter((o) => o.type !== 'actor')].slice(0, 200);
  }
  return scene;
}

/** 导入副本时重新分配身份，避免覆盖当前作品或角色引用。 */
export function copyWork(work) {
  const copy = structuredClone(work);
  copy.id = crypto.randomUUID();
  const ids = new Map();
  for (const c of copy.characters) {
    const old = c.id;
    c.id = crypto.randomUUID();
    ids.set(old, c.id);
  }
  for (const ep of copy.episodes) {
    ep.id = crypto.randomUUID();
    for (const shot of ep.shots) {
      shot.id = crypto.randomUUID();
      shot.characterIds = shot.characterIds.map((id) => ids.get(id));
    }
  }
  copy.updatedAt = new Date().toISOString();
  return copy;
}
