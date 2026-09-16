import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { sampleMotion } from './project.js';

/** 构建可编辑的基础模型，每个模型原点都落在底部中心。 */
function buildObject(data) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: '#343c3e', roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d9bfa4', roughness: 0.8 });
  /** 将几何部件加入指定父节点并启用阴影。 */
  function part(geometry, mat, x, y, z, parent = group) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** 创建尺寸可预测的方形部件。 */
  function box(w, h, d, x, y, z, mat = material, parent = group) {
    return part(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }
  if (data.type === 'actor') {
    part(new THREE.CapsuleGeometry(0.22, 0.33, 5, 10), material, 0, 1.15, 0);
    part(new THREE.CylinderGeometry(0.08, 0.09, 0.13, 12), skin, 0, 1.48, 0);
    const head = part(new THREE.SphereGeometry(0.17, 16, 12), skin, 0, 1.68, 0);
    head.scale.set(0.86, 1.13, 0.9);
    part(new THREE.SphereGeometry(0.163, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 1.75, 0);
    part(new THREE.SphereGeometry(0.037, 8, 8), skin, 0, 1.68, 0.15);
    group.userData.limbs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.115, 0.88, 0);
      group.add(leg);
      part(new THREE.CapsuleGeometry(0.085, 0.62, 4, 8), dark, 0, -0.36, 0, leg);
      box(0.17, 0.1, 0.29, 0, -0.81, 0.06, dark, leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.26, 1.38, 0);
      group.add(arm);
      part(new THREE.CapsuleGeometry(0.064, 0.44, 4, 8), material, side * 0.015, -0.27, 0, arm);
      part(new THREE.SphereGeometry(0.069, 8, 8), skin, side * 0.015, -0.57, 0, arm);
      group.userData.limbs.push({ leg, arm, side });
    }
  } else if (data.type === 'box') box(1, 1, 1, 0, 0.5, 0);
  else if (data.type === 'cylinder')
    part(new THREE.CylinderGeometry(0.65, 0.65, 0.65, 40), material, 0, 0.325, 0);
  else if (data.type === 'wall') box(6, 3.1, 0.18, 0, 1.55, 0);
  else if (data.type === 'table') {
    box(1.3, 0.1, 0.8, 0, 0.77, 0);
    for (const x of [-0.53, 0.53]) for (const z of [-0.28, 0.28]) box(0.06, 0.72, 0.06, x, 0.36, z, dark);
  } else if (data.type === 'chair') {
    box(1.8, 0.12, 0.56, 0, 0.46, 0);
    for (const x of [-0.67, 0.67]) box(0.12, 0.4, 0.44, x, 0.2, 0, dark);
  } else if (data.type === 'stairs') {
    for (let i = 0; i < 6; i++) box(1.5, (i + 1) * 0.2, 0.38, 0, (i + 1) * 0.1, i * 0.38 - 1);
  } else if (data.type === 'plant') {
    const pot = new THREE.MeshStandardMaterial({ color: '#b1a48e', roughness: 0.95 });
    part(new THREE.CylinderGeometry(0.26, 0.19, 0.46, 20), pot, 0, 0.23, 0);
    part(new THREE.CylinderGeometry(0.028, 0.045, 1.1, 8), dark, 0, 0.95, 0);
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4;
      const leaf = part(
        new THREE.SphereGeometry(0.25, 10, 8),
        material,
        Math.sin(angle) * 0.22,
        1 + (i % 3) * 0.22,
        Math.cos(angle) * 0.22,
      );
      leaf.scale.set(0.65, 1.5, 0.38);
      leaf.rotation.z = Math.sin(angle) * 0.6;
    }
  }
  // 未被使用的基础材质也要及时释放。
  const used = new Set();
  group.traverse((o) => {
    if (o.material) used.add(o.material);
  });
  for (const m of [material, dark, skin]) if (!used.has(m)) m.dispose();
  group.userData.objectId = data.id;
  group.userData.signature = `${data.type}:${data.color}`;
  return group;
}

/** 释放移出场景的 GPU 资源。 */
function disposeObject(group) {
  const materials = new Set();
  group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) materials.add(o.material);
  });
  for (const material of materials) material.dispose();
  group.removeFromParent();
}

/** 三维舞台负责渲染、拾取、变换手柄和独立摄影机监看。 */
export class Stage {
  /** 初始化主视口及监看画布；工程数据由上层管理。 */
  constructor(container, monitor, callbacks) {
    this.container = container;
    this.monitor = monitor;
    this.callbacks = callbacks;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#343c3e');
    this.scene.fog = new THREE.Fog('#343c3e', 30, 80);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.setAttribute(
      'aria-label',
      '三维场景：左键选择，拖动旋转视角，右键平移，滚轮缩放',
    );
    this.renderer.domElement.tabIndex = 0;
    container.prepend(this.renderer.domElement);
    this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.previewRenderer.shadowMap.enabled = true;
    this.previewRenderer.shadowMap.type = THREE.PCFShadowMap;
    this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.previewRenderer.toneMappingExposure = 1.25;
    monitor.append(this.previewRenderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.camera.position.set(8, 6.5, 10);
    this.shotCamera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.65, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(0.8);
    this.transform.setSpace('world');
    this.helper = this.transform.getHelper();
    this.scene.add(this.helper);
    this.transform.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !e.value;
    });
    this.transform.addEventListener('mouseDown', () => {
      this.wasGizmo = true;
    });
    this.transform.addEventListener('objectChange', () => {
      this.selectionBox?.update();
      if (this.transform.object) this.callbacks.onTransformPreview?.(this.transform.object);
    });
    this.transform.addEventListener('mouseUp', () => {
      const object = this.transform.object;
      if (object)
        this.callbacks.onTransform(object.userData.objectId, {
          position: object.position.toArray().map((n) => Math.max(-100, Math.min(100, n))),
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: object.scale.toArray().map((n) => Math.max(0.05, Math.min(20, Math.abs(n)))),
        });
    });
    const hemi = new THREE.HemisphereLight('#e9f1ff', '#a09780', 2.4);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff3da', 2.8);
    this.sun.position.set(5, 9, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -14;
    this.sun.shadow.camera.right = 14;
    this.sun.shadow.camera.top = 14;
    this.sun.shadow.camera.bottom = -14;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.bias = -0.0001;
    this.scene.add(this.sun);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#777e78', roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.025;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.15, 9),
      new THREE.MeshStandardMaterial({ color: '#c1beb3', roughness: 0.95 }),
    );
    platform.position.y = -0.095;
    platform.receiveShadow = true;
    this.scene.add(platform);
    this.grid = new THREE.GridHelper(30, 30, '#969e91', '#91988d');
    this.grid.position.y = 0.001;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.24;
    this.scene.add(this.grid);
    this.objects = new Map();
    this.labels = new Map();
    this.paths = new THREE.Group();
    this.scene.add(this.paths);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selectedId = null;
    this.preview = false;
    this.time = 0;
    this.showCamera = false;
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.pointerStart = [e.clientX, e.clientY];
      this.wasGizmo = !!this.transform.axis;
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => this.pick(e));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resizeObserver.observe(monitor);
    this.running = true;
    this.render();
  }

  /** 更新尺寸，监看画布始终保持用户选择的画幅。 */
  resize() {
    const width = this.container.clientWidth,
      height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const monitorWidth = this.monitor.clientWidth || 260;
    this.previewRenderer.setSize(monitorWidth, monitorWidth / this.shotCamera.aspect);
  }

  /** 同步工程到舞台，复用未变化的模型和资源。 */
  sync(project, selectedId) {
    this.project = project;
    const ids = new Set(project.objects.map((o) => o.id));
    for (const [id, node] of this.objects)
      if (!ids.has(id)) {
        if (this.transform.object === node) this.transform.detach();
        disposeObject(node);
        this.objects.delete(id);
        this.labels.get(id)?.remove();
        this.labels.delete(id);
      }
    for (const data of project.objects) {
      let node = this.objects.get(data.id);
      if (!node || node.userData.signature !== `${data.type}:${data.color}`) {
        if (node) {
          if (this.transform.object === node) this.transform.detach();
          disposeObject(node);
        }
        node = buildObject(data);
        this.objects.set(data.id, node);
        this.scene.add(node);
      }
      node.position.fromArray(data.position);
      node.rotation.set(...data.rotation);
      node.scale.fromArray(data.scale);
      node.visible = data.visible;
      if (data.type === 'actor') {
        let label = this.labels.get(data.id);
        if (!label) {
          label = document.createElement('div');
          label.className = 'actor-label';
          this.container.append(label);
          this.labels.set(data.id, label);
        }
        label.textContent = data.name;
        label.style.setProperty('--actor-color', data.color);
      }
    }
    this.sun.intensity = project.environment.intensity;
    const angle = (project.environment.azimuth * Math.PI) / 180;
    this.sun.position.set(Math.sin(angle) * 8, 9, Math.cos(angle) * 8);
    this.grid.visible = project.environment.grid;
    this.shotCamera.position.fromArray(project.camera.position);
    this.shotCamera.lookAt(new THREE.Vector3(...project.camera.target));
    this.shotCamera.aspect = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '2.35:1': 2.35 }[
      project.camera.aspect
    ];
    this.shotCamera.setFocalLength(project.camera.focal);
    this.shotCamera.updateProjectionMatrix();
    this.updatePaths(project);
    this.select(selectedId);
    this.setTime(this.time, this.preview);
    this.resize();
  }

  /** 显示每条走位的虚线和起终点圆环，便于在空间中检查路径。 */
  updatePaths(project) {
    for (const child of [...this.paths.children]) disposeObject(child);
    for (const object of project.objects) {
      if (!object.visible || !object.motion) continue;
      const from = new THREE.Vector3(...object.motion.from).add(new THREE.Vector3(0, 0.03, 0));
      const to = new THREE.Vector3(...object.motion.to).add(new THREE.Vector3(0, 0.03, 0));
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineDashedMaterial({ color: object.color, dashSize: 0.13, gapSize: 0.1, depthTest: false }),
      );
      line.computeLineDistances();
      line.renderOrder = 5;
      this.paths.add(line);
      for (const point of [from, to]) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.19, 0.23, 32),
          new THREE.MeshBasicMaterial({ color: object.color, side: THREE.DoubleSide, depthTest: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(point);
        ring.renderOrder = 5;
        this.paths.add(ring);
      }
    }
  }

  /** 对场景物体进行射线拾取，视角拖动和手柄操作不触发误选。 */
  pick(event) {
    if (
      event.button !== 0 ||
      !this.pointerStart ||
      this.wasGizmo ||
      this.preview ||
      Math.hypot(event.clientX - this.pointerStart[0], event.clientY - this.pointerStart[1]) > 5
    )
      return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.showCamera ? this.shotCamera : this.camera);
    const hit = this.raycaster.intersectObjects(
      [...this.objects.values()].filter((o) => o.visible),
      true,
    )[0];
    let node = hit?.object;
    while (node && !node.userData.objectId) node = node.parent;
    this.callbacks.onSelect(node?.userData.objectId || null);
  }

  /** 选择对象并显示边框与变换手柄。 */
  select(id) {
    this.selectedId = id;
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.geometry.dispose();
      this.selectionBox.material.dispose();
      this.selectionBox = null;
    }
    const node = this.objects.get(id);
    if (node?.visible) {
      this.selectionBox = new THREE.BoxHelper(node, '#5812ad');
      this.selectionBox.material.depthTest = false;
      this.selectionBox.renderOrder = 10;
      this.scene.add(this.selectionBox);
      if (!this.preview && !this.showCamera) this.transform.attach(node);
      else this.transform.detach();
    } else this.transform.detach();
  }

  /** 切换移动、旋转或缩放工具。 */
  setMode(mode) {
    this.transform.setMode(mode);
  }

  /** 切换吸附，移动以 0.5 米、旋转以 15 度为步长。 */
  setSnap(enabled) {
    this.transform.setTranslationSnap(enabled ? 0.5 : null);
    this.transform.setRotationSnap(enabled ? Math.PI / 12 : null);
    this.transform.setScaleSnap(enabled ? 0.1 : null);
  }

  /** 聚焦选中对象，或返回场景总览。 */
  focus(id = null) {
    this.setCameraView(false);
    const node = this.objects.get(id);
    const center = node
      ? new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())
      : new THREE.Vector3(0, 0.7, 0);
    const distance = node
      ? Math.max(3, new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).length() * 1.2)
      : 12;
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(new THREE.Vector3(0.7, 0.65, 1).normalize().multiplyScalar(distance));
    this.controls.update();
  }

  /** 提供俯视与透视两种编辑视角。 */
  topView() {
    this.setCameraView(false);
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 15, 0.01);
    this.controls.update();
  }

  /** 在编辑视角与最终摄影机取景之间切换。 */
  setCameraView(value) {
    this.showCamera = value;
    this.controls.enabled = !value;
    this.select(this.selectedId);
  }

  /** 将编辑视角转换为工程可保存的摄影机参数。 */
  captureCamera() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      focal: this.camera.getFocalLength(),
      preset: '自定义机位',
    };
  }

  /** 根据两位演员的位置计算同侧全景、正反打和过肩机位。 */
  shotPreset(preset) {
    const actors = this.project.objects.filter((o) => o.type === 'actor' && o.visible);
    if (!actors.length) return null;
    const a = new THREE.Vector3(...actors[0].position),
      b = new THREE.Vector3(...(actors[1]?.position || [a.x + 2, a.y, a.z]));
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const axis = b.clone().sub(a);
    axis.y = 0;
    if (axis.length() < 0.01) axis.set(1, 0, 0);
    axis.normalize();
    const normal = new THREE.Vector3(-axis.z, 0, axis.x);
    let target = midpoint.clone().add(new THREE.Vector3(0, 1, 0));
    let position = target.clone().addScaledVector(normal, Math.max(5, a.distanceTo(b) * 1.7));
    position.y += 1.0;
    let focal = 35;
    if (preset === 'A 特写' || preset === 'B 特写') {
      const subject = preset === 'A 特写' ? a : b;
      target = subject.clone().add(new THREE.Vector3(0, 1.5, 0));
      position = target
        .clone()
        .addScaledVector(normal, 2.8)
        .addScaledVector(axis, preset === 'A 特写' ? 1.6 : -1.6);
      focal = 70;
    } else if (preset === '越 B 肩拍 A' || preset === '越 A 肩拍 B') {
      const isA = preset === '越 B 肩拍 A';
      const subject = isA ? a : b;
      const foreground = isA ? b : a;
      target = subject.clone().add(new THREE.Vector3(0, 1.35, 0));
      position = foreground
        .clone()
        .addScaledVector(axis, isA ? 1.1 : -1.1)
        .addScaledVector(normal, 0.85);
      position.y += 1.7;
      focal = 40;
    } else if (preset === '高位俯拍') {
      position = midpoint.clone().add(new THREE.Vector3(0, 8, 0.01));
      focal = 35;
    }
    return { position: position.toArray(), target: target.toArray(), focal, preset };
  }

  /** 在不修改工程的前提下采样动画，并驱动简化骨骼步态。 */
  setTime(time, preview) {
    this.time = time;
    this.preview = preview;
    if (!this.project) return;
    if (preview) this.transform.detach();
    for (const data of this.project.objects) {
      const node = this.objects.get(data.id);
      if (!node) continue;
      const sample = preview
        ? sampleMotion(data, time)
        : { position: data.position, yaw: data.rotation[1], walking: false };
      node.position.fromArray(sample.position);
      node.rotation.set(data.rotation[0], sample.yaw, data.rotation[2]);
      const swing = sample.walking ? Math.sin(time * 8) * 0.42 : 0;
      for (const limb of node.userData.limbs || []) {
        limb.leg.rotation.x = swing * limb.side;
        limb.arm.rotation.x = -swing * limb.side;
      }
    }
    this.selectionBox?.update();
    if (!preview && this.selectedId && !this.showCamera && this.objects.get(this.selectedId)?.visible)
      this.transform.attach(this.objects.get(this.selectedId));
  }

  /** 在最终截图与监看渲染期间隐藏编辑辅助线。 */
  renderShot(renderer) {
    const helperVisible = this.helper.visible,
      gridVisible = this.grid.visible;
    this.helper.visible = false;
    this.grid.visible = false;
    this.paths.visible = false;
    if (this.selectionBox) this.selectionBox.visible = false;
    renderer.render(this.scene, this.shotCamera);
    this.helper.visible = helperVisible;
    this.grid.visible = gridVisible;
    this.paths.visible = true;
    if (this.selectionBox) this.selectionBox.visible = true;
  }

  /** 导出所选摄影机的高清 PNG，完成后恢复监看尺寸。 */
  screenshot() {
    this.previewRenderer.setPixelRatio(1);
    this.previewRenderer.setSize(1920, Math.round(1920 / this.shotCamera.aspect));
    this.renderShot(this.previewRenderer);
    const url = this.previewRenderer.domElement.toDataURL('image/png');
    this.previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.resize();
    return url;
  }

  /** 驱动双视口并将演员标签投影到屏幕；只在编辑视图显示辅助标签。 */
  render() {
    if (!this.running) return;
    this.controls.update();
    if (this.showCamera) {
      const width = this.container.clientWidth,
        height = this.container.clientHeight,
        aspect = this.shotCamera.aspect;
      let w = width,
        h = width / aspect;
      if (h > height) {
        h = height;
        w = h * aspect;
      }
      this.renderer.setScissorTest(false);
      this.renderer.setClearColor('#202628');
      this.renderer.clear();
      this.renderer.setViewport((width - w) / 2, (height - h) / 2, w, h);
      this.renderer.setScissor((width - w) / 2, (height - h) / 2, w, h);
      this.renderer.setScissorTest(true);
      this.renderShot(this.renderer);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, width, height);
    } else this.renderer.render(this.scene, this.camera);
    this.renderShot(this.previewRenderer);
    for (const [id, label] of this.labels) {
      const node = this.objects.get(id);
      const p = new THREE.Vector3(0, 2.03, 0).applyMatrix4(node.matrixWorld).project(this.camera);
      label.hidden = this.showCamera || !node.visible || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
      label.style.transform = `translate(${((p.x + 1) * this.container.clientWidth) / 2}px,${((-p.y + 1) * this.container.clientHeight) / 2}px) translate(-50%,-50%)`;
      label.classList.toggle('selected', id === this.selectedId);
    }
    this.frame = requestAnimationFrame(() => this.render());
  }

  /** 卸载时释放事件控制器和 WebGL 资源。 */
  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.transform.dispose();
    for (const node of this.objects.values()) disposeObject(node);
    this.renderer.dispose();
    this.previewRenderer.dispose();
  }
}
