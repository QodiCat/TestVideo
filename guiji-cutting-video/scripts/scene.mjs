import * as THREE from '/three.module.js';
import { clamp, cutProgress, impactTime, layerCut, makeTimeline, randomFromSeed, stageAt } from '/timeline.mjs';
import { catalog, crossScale, gridRows, layerPalette } from '/catalog.mjs';

function texture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function woodTexture(seed) {
  const rand = randomFromSeed(seed);
  return texture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c58b50';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 620; i++) {
      const y = rand() * h;
      ctx.strokeStyle = i % 2 ? 'rgba(83,37,18,0.09)' : 'rgba(255,220,157,0.22)';
      ctx.lineWidth = 0.4 + rand() * 1.3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.32, y + rand() * 9, w * 0.7, y - rand() * 9, w, y + 2);
      ctx.stroke();
    }
  });
}

function skinTexture(spec, object, seed) {
  const rand = randomFromSeed(seed);
  return texture(512, 256, (ctx, w, h) => {
    const wash = ctx.createLinearGradient(0, 0, 0, h);
    wash.addColorStop(0, spec.peel);
    wash.addColorStop(0.38, spec.peel);
    wash.addColorStop(0.72, spec.peel);
    wash.addColorStop(1, spec.peel);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (spec.skin === 'smooth' ? 700 : 10000); i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,232,189,0.24)' : 'rgba(27,12,7,0.19)';
      ctx.fillRect(rand() * w, rand() * h, rand() * 1.8, rand() * 2);
    }
    if (spec.skin === 'stripes' || spec.skin === 'net') {
      ctx.strokeStyle = spec.skin === 'net' ? 'rgba(255,242,193,0.55)' : 'rgba(15,58,24,0.55)';
      ctx.lineWidth = spec.skin === 'net' ? 1.4 : 14;
      for (let x=-h; x<w+h; x+=spec.skin === 'net' ? 15 : 45) {
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+h*0.3,h); ctx.stroke();
        if (spec.skin === 'net') { ctx.beginPath(); ctx.moveTo(x,h); ctx.lineTo(x+h*0.7,0); ctx.stroke(); }
      }
    }
    if (spec.skin === 'pores') for (let i=0;i<700;i++) {
      ctx.fillStyle='rgba(35,40,15,0.22)'; ctx.beginPath();
      ctx.arc(rand()*w,rand()*h,1+rand()*3,0,Math.PI*2); ctx.fill();
    }
  });
}

function crossSection(spec, object, seed) {
  const rand = randomFromSeed(seed);
  return texture(512, 512, (ctx, w) => {
    const r = w / 2;
    const gradient = ctx.createRadialGradient(r, r, 8, r, r, r);
    gradient.addColorStop(0, spec.core);
    gradient.addColorStop(0.25, spec.core);
    gradient.addColorStop(0.48, spec.flesh);
    gradient.addColorStop(0.94, spec.flesh);
    gradient.addColorStop(0.97, spec.peel);
    gradient.addColorStop(1, spec.peel);
    ctx.fillStyle = spec.shape === 'box' ? spec.flesh : gradient;
    ctx.fillRect(0, 0, w, w);
    const section=spec.section;
    const circle=(x,y,rx,ry,color,angle=0) => {
      ctx.fillStyle=color; ctx.beginPath(); ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2); ctx.fill();
    };
    if (section === 'plain') return;
    if (section === 'citrus') {
      ctx.strokeStyle=spec.core; ctx.lineWidth=7;
      for(let i=0;i<10;i++) { const a=i*Math.PI/5; ctx.beginPath(); ctx.moveTo(r,r); ctx.lineTo(r+Math.cos(a)*r*0.9,r+Math.sin(a)*r*0.9); ctx.stroke(); }
      circle(r,r,15,15,spec.core); return;
    }
    if (section === 'rings') {
      for(let i=1;i<=9;i++) { ctx.strokeStyle=i%2 ? spec.peel : spec.core; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(r,r,r*i/10,0,Math.PI*2); ctx.stroke(); } return;
    }
    if (section === 'stone') { circle(r,r,r*0.31,r*0.43,spec.core); return; }
    if (section === 'layers' || section === 'rainbow') {
      const colors=layerPalette(spec);
      colors.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(8,8+i*(w-16)/colors.length,w-16,(w-16)/colors.length);}); return;
    }
    if (section === 'marble') {
      ctx.strokeStyle=spec.ink ?? spec.core;ctx.lineWidth=6;
      for(let i=0;i<18;i++){ const y=rand()*w;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.3,y+100,w*.7,y-100,w,y+40);ctx.stroke(); }return;
    }
    if (section === 'lotus') {
      for(let i=0;i<8;i++){const a=i*Math.PI/4;circle(r+Math.cos(a)*r*.52,r+Math.sin(a)*r*.52,25,40,'#a38d6b',a);}circle(r,r,17,17,'#a38d6b');return;
    }
    if (section === 'tomato') {
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;circle(r+Math.cos(a)*r*.47,r+Math.sin(a)*r*.47,40,65,spec.core,a);}return;
    }
    const seeds = section === 'kiwi' ? 105 : ['pores','chips','flecks'].includes(section) ? 140 : section === 'watermelon' ? 30 : section === 'pome' ? 10 : 250;
    for (let i = 0; i < seeds; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = r * (section === 'kiwi' ? 0.29 + rand() * 0.32 : ['melon','papaya','guava','pome','cucumber'].includes(section) ? Math.sqrt(rand())*.4 : Math.sqrt(rand())*.89);
      const size = section === 'pores' ? 3+rand()*9 : section === 'chips' ? 4+rand()*5 : section === 'watermelon' ? 4+rand()*3 : 1+rand()*3;
      const color=spec.ink ?? (section === 'pores' ? spec.peel : section === 'flecks' ? '#997d64' : ['melon','guava','cucumber'].includes(section) ? '#b29a60' : '#30221c');
      const x=['pores','chips','flecks'].includes(section) ? 10+rand()*(w-20) : r+Math.cos(angle)*radius;
      const y=['pores','chips','flecks'].includes(section) ? 10+rand()*(w-20) : r+Math.sin(angle)*radius;
      circle(x,y,size*1.55,size,color,angle);
    }
  });
}

function roundedBox(w, h, d, radius) {
  const a = w / 2 - radius;
  const b = h / 2 - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-a, -b);
  shape.lineTo(a, -b);
  shape.lineTo(a, b);
  shape.lineTo(-a, b);
  shape.closePath();
  const box = new THREE.ExtrudeGeometry(shape, {
    depth: d - radius * 2, bevelEnabled: true, bevelThickness: radius,
    bevelSize: radius, bevelSegments: 3, steps: 1,
  });
  box.center();
  return box;
}

function addKnife(scene) {
  const knife = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.62, 0.34);
  shape.lineTo(1.79, 0.3);
  shape.quadraticCurveTo(1.5, -0.04, 0.86, -0.25);
  shape.lineTo(-1.48, -0.28);
  shape.lineTo(-1.62, -0.2);
  shape.closePath();
  const steel = new THREE.MeshStandardMaterial({ color: '#c0ced5', roughness: 0.23, metalness: 0.53 });
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: 0.032, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2,
  }), steel);
  blade.castShadow = true;
  knife.add(blade);
  const handle = new THREE.Mesh(roundedBox(1.14, 0.32, 0.26, 0.06),
    new THREE.MeshStandardMaterial({ color: '#243234', roughness: 0.44 }));
  handle.position.set(-2.09, 0.19, 0.017);
  knife.add(handle);
  for (const x of [-1.86, -2.28]) {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.037, 10, 6), steel);
    rivet.position.set(x, 0.19, 0.149);
    knife.add(rivet);
  }
  knife.rotation.y = Math.PI / 2;
  scene.add(knife);
  return knife;
}

function makeFragments(spec, object, radii, stage, material, seed) {
  const rand = randomFromSeed(seed);
  const [alongX, horizontal, alongZ] = stage.axes;
  const dimensions = [alongX + 1, horizontal + 1, alongZ + 1];
  const rectangular = spec.shape === 'box';
  const layers = layerPalette(spec);
  const counts = new Array(alongZ + 1).fill(0);
  const fragments = [];
  if (alongZ > 0) {
    gridRows(dimensions, spec.shape, (j, x, z, first, last) => {
      counts[j] += Math.max(0, last - first + 1);
    });
    const sampling = Math.max(1, Math.cbrt(dimensions.reduce((a, b) => a * b, 1) / 12000));
    const visibleGrid = dimensions.map(n => Math.max(1, Math.floor(n / sampling)));
    const steps = visibleGrid.map((n, axis) => 2 * radii[axis] / n);
    gridRows(visibleGrid, spec.shape, (j, xNorm, zNorm, first, last) => {
      const layer = Math.floor((j + 0.5) * dimensions[2] / visibleGrid[2]);
      const dropAt = impactTime(stage, layerCut(stage, layer));
      for (let k = first; k <= last; k++) {
        const yNorm = (2 * k + 1) / visibleGrid[1] - 1;
        const radius = Math.hypot(xNorm, yNorm, zNorm);
        const outside = rectangular ? Math.max(Math.abs(xNorm),Math.abs(yNorm),Math.abs(zNorm)) > 0.85 : spec.shape === 'cylinder' ? Math.hypot(xNorm,zNorm)>0.89 || Math.abs(yNorm)>0.89 : radius > 0.89;
        const color = new THREE.Color(layers ? layers[Math.min(layers.length-1,Math.floor((1-yNorm)*0.5*layers.length))] : outside && rand() < 0.7 ? spec.peel : radius < 0.4 ? spec.core : spec.flesh);
        color.multiplyScalar(0.83 + rand() * 0.27);
        const x = xNorm * radii[0];
        const y = yNorm * radii[1];
        const z = zNorm * radii[2];
        const spread = 1.18 + rand() * 0.31;
        fragments.push({
          x, y, z, color, dropAt,
          endX: x * spread + (rand() - 0.5) * steps[0] * 0.63,
          endY: (y + radii[1]) * 0.38 + steps[1] * 0.46,
          endZ: z * spread + (rand() - 0.1) * steps[2] * 0.63,
          size: steps.map(step => step * (0.78 + rand() * 0.16)),
          spin: (rand() - 0.5) * 1.4,
          fall: 0.24 + rand() * 0.19,
        });
      }
    });
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, fragments.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  fragments.forEach((fragment, i) => mesh.setColorAt(i, fragment.color));
  mesh.count = 0;
  return { mesh, fragments, counts };
}

function makeMarks(axis, count, radii, center, spec, plane) {
  const across = axis === 0 ? 1 : 0;
  const positions = [];
  const ranges = [];
  const rectangular = spec.shape === 'box' || (spec.shape === 'cylinder' && axis === 0);
  const sides = rectangular ? 4 : 64;
  const stride = Math.max(1, Math.ceil(count / 32));
  for (let cut = 1; cut <= count; cut++) {
    if (cut % stride !== 0 && cut !== count) continue;
    const relative = (2 * cut / (count + 1) - 1) * (axis === 1 ? -1 : 1);
    const radius = Math.sqrt(1 - relative ** 2) * 1.005;
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const angle = 2 * Math.PI * i / sides;
      const point = [0, 0, 0];
      point[axis] = radii[axis] * relative;
      if (rectangular) {
        point[across] = radii[across] * (i < 2 ? 1.004 : -1.004);
        point[2] = radii[2] * (i % 3 === 0 ? 1.004 : -1.004) * (spec.shape === 'cylinder' ? radius : 1);
      } else {
        const ringRadius = spec.shape === 'cylinder' ? 1.005 : radius;
        point[across] = radii[across] * Math.cos(angle) * ringRadius;
        point[2] = radii[2] * Math.sin(angle) * ringRadius;
      }
      point[1] += center;
      ring.push(point);
    }
    for (let i = 0; i < sides; i++) positions.push(...ring[i], ...ring[(i + 1) % sides]);
    ranges.push({ cut, size: positions.length / 3 });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: '#302119', transparent: true, opacity: 0.68, clippingPlanes: [plane],
  }));
  return { line, ranges };
}

export function createVideo(config) {
  const { width, height, object, seed } = config;
  const spec = catalog[object];
  if (!Object.hasOwn(catalog, object)) throw new Error('Unknown object preset: ' + object);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#142024');
  const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  gl.setSize(width, height, false);
  gl.setPixelRatio(1);
  gl.localClippingEnabled = true;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.08;
  const aspect = width / height;
  const halfHeight = 4.22;
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect,
    halfHeight, -halfHeight, 0.1, 50);
  camera.position.set(-5.9, 5.15, 7.9);
  camera.lookAt(0, 1.15, 0);

  scene.add(new THREE.HemisphereLight('#e7f3f8', '#695849', 2.13));
  const key = new THREE.DirectionalLight('#fff0d9', 3.12);
  key.position.set(-3, 7.8, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = key.shadow.camera.bottom = -6;
  key.shadow.camera.right = key.shadow.camera.top = 6;
  key.shadow.normalBias = 0.035;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#a5d4f1', 0.9);
  fill.position.set(2, 3, -5);
  scene.add(fill);

  const surface = new THREE.Mesh(new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: '#172227', roughness: 0.96 }));
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  scene.add(surface);
  const board = new THREE.Mesh(roundedBox(5.75, 4.0, 0.26, 0.11),
    new THREE.MeshStandardMaterial({ map: woodTexture(seed + 1), roughness: 0.72 }));
  board.rotation.x = -Math.PI / 2;
  board.position.y = 0.14;
  board.receiveShadow = true;
  board.castShadow = true;
  scene.add(board);
  const boardY = 0.27;
  const radii = spec.radii;
  const center = boardY + radii[1] + 0.02;
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), radii[2] + 1);
  const skin = new THREE.MeshStandardMaterial({
    map: skinTexture(spec, object, seed + 2),
    roughness: spec.roughness,
    clippingPlanes: [plane], clipShadows: true,
  });
  const hull = new THREE.Mesh(spec.shape === 'box'
    ? roundedBox(2 * radii[0], 2 * radii[1], 2 * radii[2], 0.12)
    : spec.shape === 'cylinder' ? new THREE.CylinderGeometry(1,1,2,72) : new THREE.SphereGeometry(1, 72, 48), skin);
  if (spec.shape !== 'box') hull.scale.set(...radii);
  hull.position.y = center;
  hull.castShadow = true;
  hull.receiveShadow = true;
  scene.add(hull);

  const interior = new THREE.Mesh(spec.shape !== 'ellipsoid'
    ? new THREE.PlaneGeometry(2, 2)
    : new THREE.CircleGeometry(1, 72),
  new THREE.MeshStandardMaterial({ map: crossSection(spec, object, seed + 3), roughness: 0.72 }));
  interior.position.y = center;
  scene.add(interior);

  const knife = addKnife(scene);
  const timeline = makeTimeline(config.cuts, config.seconds);
  const fragmentMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.76 });
  const batches = timeline.map((stage, index) => {
    const batch = makeFragments(spec, object, radii, stage, fragmentMaterial, seed + index * 281);
    const marks = [0, 1].map(axis => makeMarks(axis, stage.axes[axis], radii, center, spec, plane));
    scene.add(batch.mesh, ...marks.map(mark => mark.line));
    return { ...batch, marks };
  });
  const matrix = new THREE.Object3D();
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const ctx = output.getContext('2d');
  const scale = width / 540;
  const ink = '#f5f2e8';
  const font = 'Arial, sans-serif';
  const number = new Intl.NumberFormat('en-US');

  function drawText(text, x, y, size, color, weight = 700) {
    ctx.font = weight + ' ' + Math.round(size * scale) + 'px ' + font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function overlay(index, localTime, cuts, pieces, direction) {
    const topFade = ctx.createLinearGradient(0, 0, 0, height * 0.31);
    topFade.addColorStop(0, 'rgba(12,19,23,0.82)');
    topFade.addColorStop(1, 'rgba(12,19,23,0)');
    ctx.fillStyle = topFade;
    ctx.fillRect(0, 0, width, height * 0.31);
    const bottomFade = ctx.createLinearGradient(0, height * 0.77, 0, height);
    bottomFade.addColorStop(0, 'rgba(12,19,23,0)');
    bottomFade.addColorStop(1, 'rgba(12,19,23,0.89)');
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, height * 0.77, width, height * 0.23);
    drawText(config.label ?? spec.label, width / 2, height * 0.073, 21, spec.accent);
    drawText(number.format(cuts), width / 2, height * 0.151, 88, ink, 800);
    drawText('CUTS', width / 2, height * 0.201, 19, spec.accent);
    drawText(direction, width / 2, height * 0.247, 16, '#d0d9d8');
    drawText(number.format(pieces), width / 2, height * 0.841, 58, ink, 800);
    drawText('BLOCKS', width / 2, height * 0.882, 17, spec.accent);
    const barWidth = width * 0.68 / timeline.length;
    const stage = timeline[index];
    for (let i = 0; i < timeline.length; i++) {
      const x = width * 0.16 + i * barWidth;
      const y = height * 0.928;
      ctx.fillStyle = 'rgba(255,255,255,0.24)';
      ctx.fillRect(x, y, barWidth - 5 * scale, 3.5 * scale);
      ctx.fillStyle = spec.accent;
      const progress = i < index ? 1 : i === index ? clamp(localTime / stage.duration) : 0;
      ctx.fillRect(x, y, (barWidth - 5 * scale) * progress, 3.5 * scale);
      drawText(number.format(timeline[i].count), x + barWidth / 2, y + 21 * scale,
        15, i === index ? spec.accent : '#c9cfcf');
    }
  }

  function render(time) {
    const index = stageAt(timeline, time);
    const stage = timeline[index];
    const localTime = time - stage.start;
    const progress = cutProgress(stage, localTime);
    const cuts = Math.min(stage.count, Math.floor(progress + 0.38 + 1e-9));
    const [alongX, horizontal, alongZ] = stage.axes;
    const completed = [Math.min(cuts, alongX), clamp(cuts - alongX, 0, horizontal),
      clamp(cuts - alongX - horizontal, 0, alongZ)];
    const current = Math.min(stage.count - 1, Math.floor(progress));
    const axis = current < alongX ? 0 : current < alongX + horizontal ? 1 : 2;
    const stroke = current - [0, alongX, alongX + horizontal][axis];
    const done = progress >= stage.count;
    const direction = done && alongZ ? 'DICED' : ['VERTICAL', 'HORIZONTAL', 'CROSS CUT'][axis];

    const removed = completed[2];
    const boundary = 1 - 2 * removed / (alongZ + 1);
    const edge = radii[2] * boundary;
    hull.visible = !alongZ || removed < alongZ;
    plane.constant = removed ? edge : radii[2] + 0.01;
    interior.visible = removed > 0 && hull.visible;
    const [crossWidth,crossHeight] = crossScale(spec.shape, boundary);
    interior.position.z = edge + 0.002;
    interior.scale.set(radii[0] * crossWidth, radii[1] * crossHeight, 1);

    const phase = progress % 1;
    const sweep = clamp(phase / 0.62);
    knife.visible = !done && (axis !== 1 || phase < 0.89);
    if (axis === 1) {
      const sliceY = center + radii[1] * (1 - 2 * (stroke + 1) / (horizontal + 1));
      const forward = -2.6 + 3.92 * sweep + clamp((phase - 0.62) / 0.27) * 1.15;
      knife.rotation.set(-Math.PI / 2, 0, 0);
      knife.position.set(forward, sliceY + 0.015, 0);
    } else {
      const hit = phase <= 0.62 ? sweep : (1 - phase) / 0.38;
      const swing = Math.sin(clamp(hit) * Math.PI / 2);
      const dimension = axis === 0 ? 0 : 2;
      const offset = radii[dimension] * (2 * (stroke + 1) / (stage.axes[axis] + 1) - 1);
      const bladeHeight = THREE.MathUtils.lerp(3.58, boardY + 0.28, swing);
      knife.rotation.set(0, axis === 0 ? Math.PI / 2 : 0, -0.1 * (1 - swing));
      knife.position.set(axis === 0 ? offset : 0, bladeHeight, axis === 2 ? -offset : -0.14);
    }

    const active = batches[index];
    for (const batch of batches) {
      batch.mesh.visible = batch === active;
      batch.marks.forEach((mark, i) => {
        mark.line.visible = batch === active && hull.visible;
        if (mark.line.visible) {
          const range = mark.ranges.findLast(value => value.cut <= completed[i]);
          mark.line.geometry.setDrawRange(0, range?.size ?? 0);
        }
      });
    }
    let visible = 0;
    for (const fragment of active.fragments) {
      if (fragment.dropAt > localTime) break;
      const drop = clamp((localTime - fragment.dropAt) / fragment.fall);
      const ease = 1 - (1 - drop) ** 2;
      matrix.position.set(
        THREE.MathUtils.lerp(fragment.x, fragment.endX, ease),
        THREE.MathUtils.lerp(center + fragment.y, boardY + fragment.endY, drop * drop),
        THREE.MathUtils.lerp(fragment.z, fragment.endZ, ease),
      );
      matrix.rotation.set(fragment.spin * ease, fragment.spin * 0.65 * ease, fragment.spin * 0.42 * ease);
      matrix.scale.set(...fragment.size);
      matrix.updateMatrix();
      active.mesh.setMatrixAt(visible++, matrix.matrix);
    }
    active.mesh.count = visible;
    active.mesh.instanceMatrix.needsUpdate = true;
    gl.render(scene, camera);
    ctx.drawImage(gl.domElement, 0, 0);
    const layers = removed > 0 && removed === alongZ ? removed + 1 : removed;
    const pieces = active.counts.slice(0, layers).reduce((total, count) => total + count, 0);
    overlay(index, localTime, cuts, pieces, direction);
    output.frameInfo = { object, cuts, pieces, direction, stage:index, visibleFragments:visible, interiorVisible:interior.visible };
    return output;
  }
  render.dispose = () => {
    const geometries=new Set(), materials=new Set(), textures=new Set();
    scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.material)for(const m of [node.material].flat())materials.add(m);if(node.isInstancedMesh)node.dispose();});
    for(const m of materials){for(const value of Object.values(m))if(value?.isTexture)textures.add(value);m.dispose();}
    for(const t of textures)t.dispose();for(const g of geometries)g.dispose();
    gl.dispose(); gl.forceContextLoss();
  };
  return render;
}

let activeRender;
window.configureVideo = config => {
  activeRender?.dispose();
  const render = activeRender = createVideo(config);
  window.renderBatch = times => times.map(time => render(time).toDataURL('image/jpeg', 0.92).split(',')[1]);
  window.inspectFrame = time => render(time).frameInfo;
};
