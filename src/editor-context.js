import { readWorkspace, writeWorkspace, locateShot, sceneForShot } from './workspace.js';

const params = new URLSearchParams(location.search);
export const editorContext = params.get('work')
  ? { workId: params.get('work'), episodeId: params.get('episode'), shotId: params.get('shot') }
  : null;

/** 读取当前分镜的独立场景，不改写旧的单场景存档。 */
export function readEditorScene() {
  const { work, shot } = locateShot(
    readWorkspace(),
    editorContext.workId,
    editorContext.episodeId,
    editorContext.shotId,
  );
  return sceneForShot(work, shot);
}
/** 重新读取作品，仅更新当前分镜，避免覆盖其他分镜的新内容。 */
export function saveEditorScene(scene, image) {
  const data = readWorkspace();
  const { work, shot } = locateShot(
    data,
    editorContext.workId,
    editorContext.episodeId,
    editorContext.shotId,
  );
  shot.spatial = scene;
  if (image !== undefined) shot.image = image;
  work.updatedAt = new Date().toISOString();
  writeWorkspace(data);
}
/** 返回当前分集画布，独立编辑模式则返回工作台首页。 */
export function workbenchUrl() {
  return editorContext
    ? `/?work=${encodeURIComponent(editorContext.workId)}&episode=${encodeURIComponent(editorContext.episodeId)}&view=canvas`
    : '/';
}
