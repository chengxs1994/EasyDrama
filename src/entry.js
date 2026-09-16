/** 按页面职责加载工作台或 3D 编辑器，切换页面时释放旧渲染器。 */
async function start() {
  try {
    if (new URLSearchParams(location.search).has('editor')) await import('./main.js');
    else await import('./workbench.js');
  } catch (error) {
    document.getElementById('app').textContent = `页面未能打开：${error.message}`;
    const back = document.createElement('a');
    back.href = '/';
    back.textContent = ' 返回创作工作台';
    document.getElementById('app').append(back);
  }
}
start();
