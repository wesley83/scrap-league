import { sceneProgress } from "./scenes.js";
import * as THREE from "./vendor/three.module.js";
import { nearest, atDistance } from "./track.js";
import { wrap } from "./model.js";
import {
  drawingSize,
  graphicsProfile,
  surfaceFailure,
} from "./graphics-policy.js";
const C = { asphalt: 0x424943, gravel: 0x9a8d6e, mud: 0x675746 };
export class World {
  constructor(canvas, onLost, onRestored, { safeGraphics = false } = {}) {
    this.canvas = canvas;
    this.onLost = onLost;
    this.profile = graphicsProfile(safeGraphics);
    this.safeGraphics = safeGraphics;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      ...this.profile,
    });
    this.renderer.debug.onShaderError = () => {
      throw Error("The browser could not draw the 3D scene.");
    };
    this.maxDimension = Math.min(
      4096,
      this.renderer.capabilities.maxTextureSize,
    );
    this.renderer.shadowMap.enabled = !safeGraphics;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb0b2a0);
    this.camera = new THREE.OrthographicCamera(-80, 80, 60, -60, 0.1, 1200);
    this.scene.add(new THREE.HemisphereLight(0xfff2d6, 0x485750, 2.5));
    this.sun = new THREE.DirectionalLight(0xffedc4, 3.4);
    this.sun.position.set(-70, 160, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -220,
      right: 220,
      top: 220,
      bottom: -220,
      near: 1,
      far: 600,
    });
    this.sun.shadow.bias = -0.001;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.cars = [];
    this.target = new THREE.Vector3();
    this.view = "start";
    this.angle = 0;
    this.materials = new Map();
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
    this.lostListener = (e) => {
      e.preventDefault();
      this.fail("The graphics connection was lost.");
    };
    this.restoredListener = async () => {
      if (this.disposed) return;
      try {
        await onRestored?.();
      } catch (e) {
        console.error("Graphics recovery failed", e);
        this.fail("Graphics recovery failed. Try repairing the view.");
      }
    };
    canvas.addEventListener("webglcontextlost", this.lostListener);
    canvas.addEventListener("webglcontextrestored", this.restoredListener);
  }
  fail(reason) {
    const first = !this.contextLost;
    this.contextLost = true;
    this.failure = reason;
    if (first) this.onLost?.(reason);
    return false;
  }
  available() {
    if (this.disposed || this.contextLost) return false;
    const reason = surfaceFailure(this.renderer.getContext());
    return reason ? this.fail(reason) : true;
  }
  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.lostListener);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.restoredListener,
    );
    this.clear();
    for (const material of this.materials.values()) material.dispose();
    this.boxGeo.dispose();
    this.cylinderGeo.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    if (!this.renderer.getContext().isContextLost())
      this.renderer.forceContextLoss();
  }
  async rebuild(race, view, settings) {
    this.contextLost = false;
    this.needsValidation = true;
    if (view === "scene" && this.cinematicState) {
      const { elapsed, final } = this.cinematicState;
      this.cinematic(this.track, this.sourceCars[0].spec, final);
      this.cinematicState.elapsed = elapsed;
      this.renderer.compile(this.scene, this.camera);
      if (!this.render(race, view, settings, 0)) throw Error(this.failure);
      return;
    }
    const cars =
      race && ["race", "result"].includes(view)
        ? race.cars
        : this.sourceCars || [];
    if (view === "garage") this.garage();
    else if (race && ["race", "result"].includes(view)) this.load(race.track);
    else if (this.track) this.load(this.track);
    this.setCars(cars);
    if (race && ["race", "result"].includes(view)) {
      const player = race.cars.find((c) => c.id === "player");
      this.target.set(player.x, 0, player.z);
      this.setGhost(player.spec, race.bestGhost);
    }
    this.renderer.compile(this.scene, this.camera);
    if (!this.render(race, view, settings, 0)) throw Error(this.failure);
  }
  mat(color) {
    if (!this.materials.has(color))
      this.materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.88,
          metalness: 0.06,
        }),
      );
    return this.materials.get(color);
  }
  box(parent, x, y, z, w, h, d, color, angle = 0) {
    const m = new THREE.Mesh(this.boxGeo, this.mat(color));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.rotation.y = angle;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  cylinder(parent, x, y, z, r, h, color) {
    const m = new THREE.Mesh(this.cylinderGeo, this.mat(color));
    m.position.set(x, y, z);
    m.scale.set(r, h, r);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  label(parent, text, x, y, z, w, h, color = "#e9dfbf", background = null) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 512, 128);
    }
    ctx.font = "100px LeagueDisplay, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 71, 490);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  garage() {
    this.clear();
    this.bounds = { x: 0, z: 0, w: 30, h: 30 };
    this.scene.background.set(0x4d5b48);
    this.sun.intensity = 2.5;
    this.sun.position.set(-12, 18, 10);
    this.sun.target.position.set(0, 0, 0);
    this.box(this.group, 0, -0.6, 0, 120, 1, 120, 0x54634d);
    this.cylinder(this.group, 0, -0.05, 0, 5.5, 0.5, 0x66715c);
    for (const sign of [-1, 1]) {
      this.box(this.group, sign * 4.2, 0.9, -3.5, 1.2, 1.8, 1.4, 0x3f5142);
      for (let k = 0; k < 3; k++)
        this.cylinder(
          this.group,
          sign * 4.1,
          0.25 + k * 0.45,
          2.5,
          0.6,
          0.4,
          0x242e27,
        );
    }
    for (let i = 0; i < 4; i++)
      this.box(
        this.group,
        -4.2,
        0.35 + i * 0.4,
        -2.72,
        1,
        0.06,
        0.08,
        0x9d9c7c,
      );
    this.label(this.group, "SCRAP / 04", -3, 2.4, -3.5, 3, 0.75, "#ddd2b5");
    this.batchStatic();
  }
  releaseObject(group) {
    const shared = new Set(this.materials.values());
    group.traverse((o) => {
      if (
        o.geometry &&
        o.geometry !== this.boxGeo &&
        o.geometry !== this.cylinderGeo
      )
        o.geometry.dispose();
      if (o.material && !shared.has(o.material)) {
        o.material.map?.dispose();
        o.material.dispose();
      }
      if (o.isInstancedMesh) o.dispose();
    });
  }
  clear() {
    this.releaseObject(this.group);
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.cars = [];
    this.carModels = [];
    this.ghostModel = null;
  }
  load(track) {
    this.clear();
    this.track = track;
    const s = track.samples,
      minX = Math.min(...s.map((p) => p.x)),
      maxX = Math.max(...s.map((p) => p.x)),
      minZ = Math.min(...s.map((p) => p.z)),
      maxZ = Math.max(...s.map((p) => p.z));
    this.bounds = {
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      w: maxX - minX,
      h: maxZ - minZ,
    };
    const night = track.source.scenePreset === "night",
      docks = track.source.scenePreset === "docks";
    this.scene.background.set(night ? 0x242f30 : 0xa5afa0);
    this.sun.intensity = night ? 1.4 : 3.4;
    this.box(
      this.group,
      this.bounds.x,
      -0.65,
      this.bounds.z,
      this.bounds.w + 260,
      1,
      this.bounds.h + 260,
      night ? 0x49534a : docks ? 0x7d8e83 : 0x8e947c,
    );
    const positions = [],
      colors = [];
    for (const seg of track.segs) {
      const { a, b } = seg;
      const vertices = [];
      for (const q of [a, b])
        for (const sign of [-1, 1])
          vertices.push([
            q.x - Math.sin(q.heading) * q.width * 0.5 * sign,
            0.025,
            q.z + Math.cos(q.heading) * q.width * 0.5 * sign,
          ]);
      const color = new THREE.Color(C.asphalt);
      const patch = track.source.patches.find(
        (p) =>
          p.pieceId === a.pieceId &&
          a.local >= p.start &&
          a.local <= p.end &&
          p.lateralMax - p.lateralMin >= a.width - 1,
      );
      if (patch) color.set(C[patch.surface]);
      for (const i of [0, 1, 2, 2, 1, 3]) {
        positions.push(...vertices[i]);
        colors.push(color.r, color.g, color.b);
      }
      if (seg.index % 2 === 0) {
        for (const sign of [-1, 1]) {
          const x = a.x - Math.sin(a.heading) * (a.width / 2 + 0.15) * sign,
            z = a.z + Math.cos(a.heading) * (a.width / 2 + 0.15) * sign;
          this.box(
            this.group,
            x,
            0.17,
            z,
            seg.len * 2 + 0.06,
            0.3,
            0.5,
            seg.index % 4 ? 0x35413a : 0xe2ddc1,
            -a.heading,
          );
        }
      }
      if (seg.index % 12 === 0)
        this.box(
          this.group,
          a.x,
          0.04,
          a.z,
          2,
          0.018,
          0.12,
          0xb3b6a0,
          -a.heading,
        );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const road = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 1,
      }),
    );
    road.receiveShadow = true;
    this.group.add(road);
    for (const patch of track.source.patches) {
      const off = track.offsets.get(patch.pieceId);
      for (let s = patch.start; s < patch.end; s += 2) {
        const q = atDistance(track, off + s + 1),
          l = (patch.lateralMin + patch.lateralMax) / 2;
        this.box(
          this.group,
          q.x - Math.sin(q.heading) * l,
          0.045,
          q.z + Math.cos(q.heading) * l,
          2.1,
          0.03,
          patch.lateralMax - patch.lateralMin,
          C[patch.surface],
          -q.heading,
        );
      }
    }
    for (const p of track.props || track.source.props) {
      if (p.kind === "pad") {
        this.box(
          this.group,
          p.x,
          0.08,
          p.z,
          p.length,
          0.12,
          p.width,
          0xe0c755,
          -p.heading,
        );
        for (let k = -1; k <= 1; k++)
          this.box(
            this.group,
            p.x + Math.cos(p.heading) * k * 2,
            0.16,
            p.z + Math.sin(p.heading) * k * 2,
            0.35,
            0.02,
            p.width * 0.7,
            0x28392f,
            -p.heading,
          );
      } else if (p.kind === "light") {
        this.box(this.group, p.x, 1.5, p.z, 0.25, 3, 0.25, 0x253126);
        this.box(
          this.group,
          p.x,
          3,
          p.z,
          1,
          0.4,
          1,
          p.lightPreset === "light-cool" ? 0x9dd9ef : 0xf0c25c,
        );
      } else if (p.kind === "barrier") {
        for (let n = 0; n < Math.ceil(p.length / 1.2); n++) {
          const d = -p.length / 2 + n * 1.2;
          this.cylinder(
            this.group,
            p.x + Math.cos(p.heading) * d,
            0.55,
            p.z + Math.sin(p.heading) * d,
            0.65,
            1.1,
            0x272d29,
          );
        }
      } else
        this.box(
          this.group,
          p.x,
          0.6,
          p.z,
          p.length,
          1.2,
          p.width,
          0x8b6651,
          -p.heading,
        );
    }
    const f = track.gates[0];
    if (f) {
      for (let i = 0; i < 12; i++)
        for (let j = 0; j < 2; j++)
          this.box(
            this.group,
            f.x +
              Math.cos(f.heading) * (j - 0.5) * 1.1 -
              Math.sin(f.heading) * (i - 5.5),
            0.075,
            f.z +
              Math.sin(f.heading) * (j - 0.5) * 1.1 +
              Math.cos(f.heading) * (i - 5.5),
            1,
            0.03,
            1,
            (i + j) % 2 ? 0x252d29 : 0xeee6cd,
            -f.heading,
          );
      for (const sign of [-1, 1])
        this.box(
          this.group,
          f.x - Math.sin(f.heading) * 8 * sign,
          3.5,
          f.z + Math.cos(f.heading) * 8 * sign,
          0.5,
          7,
          0.5,
          0xc1b98d,
        );
      this.box(this.group, f.x, 7, f.z, 0.6, 1, 17, 0xd2b249, -f.heading);
    }
    for (let i = 0; i < track.gates.length; i++) {
      const g = track.gates[i];
      if (i)
        for (const sign of [-1, 1]) {
          this.box(
            this.group,
            g.x - Math.sin(g.heading) * (g.width / 2 + 0.6) * sign,
            0.75,
            g.z + Math.cos(g.heading) * (g.width / 2 + 0.6) * sign,
            0.3,
            1.5,
            0.3,
            0xe5c54d,
          );
        }
    }
    // Deterministic scenery stays clear of the playable corridor.
    let seed = track.source.slug
      .split("")
      .reduce((n, c) => n + c.charCodeAt(0), 1);
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 110; i++) {
      const x = minX - 45 + rand() * (this.bounds.w + 90),
        z = minZ - 45 + rand() * (this.bounds.h + 90),
        q = nearest(track, x, z);
      if (q.distance < 22) continue;
      const h = 2 + rand() * 7;
      if (i % 5 === 0) {
        this.box(
          this.group,
          x,
          h / 2,
          z,
          14,
          h,
          7,
          [0x6e7c77, 0xa87753, 0x566b70, 0x9b9c85][i % 4],
        );
        for (let j = -5; j <= 5; j += 2)
          this.box(
            this.group,
            x + j,
            h / 2 + 0.01,
            z + 3.55,
            0.12,
            h,
            0.12,
            0x414f47,
          );
      } else if (i % 3 === 0) {
        for (let k = 0; k < 3; k++)
          this.cylinder(
            this.group,
            x,
            0.5 + k * 0.8,
            z,
            1.1,
            0.7,
            k === 2 ? 0x6b6f58 : 0x303b31,
          );
      } else {
        this.box(
          this.group,
          x,
          0.3,
          z,
          3 + rand() * 3,
          0.6,
          3 + rand() * 3,
          0x737865,
        );
        this.box(this.group, x, 1.2, z, 1.5, 2, 1.5, 0x85816d, rand());
      }
    }
    // Orange crane, laid out as an immediately recognizable yard landmark.
    const cx = minX - 27,
      cz = minZ + 35;
    this.box(this.group, cx, 9, cz, 2, 18, 2, 0xb67840);
    this.box(this.group, cx + 7, 18, cz, 28, 1.1, 1.5, 0xc48a43);
    this.box(this.group, cx + 18, 12, cz, 0.15, 12, 0.15, 0x424e41);
    this.box(this.group, cx + 18, 5.8, cz, 2, 0.5, 1, 0x3d4941);
    this.box(this.group, cx, 1, cz, 9, 2, 7, 0x5b6252);
    if (docks)
      this.box(
        this.group,
        maxX + 55,
        -0.1,
        this.bounds.z,
        50,
        0.4,
        this.bounds.h + 130,
        0x52797d,
      );
    this.batchStatic();
    this.target.set(this.bounds.x, 0, this.bounds.z);
    this.sun.position.set(this.bounds.x - 70, 160, this.bounds.z + 60);
    this.sun.target.position.copy(this.target);
    this.frameOverview(true);
  }
  batchStatic() {
    const batches = new Map();
    for (const mesh of [...this.group.children]) {
      if (mesh.geometry !== this.boxGeo && mesh.geometry !== this.cylinderGeo)
        continue;
      const key = mesh.geometry.uuid + mesh.material.uuid;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(mesh);
    }
    for (const meshes of batches.values()) {
      const inst = new THREE.InstancedMesh(
        meshes[0].geometry,
        meshes[0].material,
        meshes.length,
      );
      meshes.forEach((m, i) => {
        m.updateMatrix();
        inst.setMatrixAt(i, m.matrix);
        this.group.remove(m);
      });
      inst.castShadow = inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    }
  }
  car(spec, color = 0xe4c54c, number = "04", ghost = false) {
    const g = new THREE.Group(),
      ch = spec.chassis,
      body = this.box(g, 0, 0.65, 0, ch.length, 0.65, ch.width, color);
    this.box(g, -0.25, 1.18, 0, ch.length * 0.44, 0.65, ch.width * 0.88, color);
    this.box(g, 0.65, 1.29, 0, 0.12, 0.4, ch.width * 0.79, 0x657e79);
    this.box(g, -1.12, 1.29, 0, 0.1, 0.35, ch.width * 0.79, 0x394d47);
    this.box(g, 0.65, 1.56, 0, 0.65, 0.03, 0.8, 0xe3ddc0);
    this.box(g, ch.length / 2 - 0.1, 0.7, 0.6, 0.18, 0.18, 0.3, 0xffe8a0);
    this.box(g, ch.length / 2 - 0.1, 0.7, -0.6, 0.18, 0.18, 0.3, 0xffe8a0);
    this.box(g, -ch.length / 2, 0.5, 0, 0.2, 0.3, ch.width + 0.1, 0x4e554b);
    for (const side of [-1, 1])
      for (const axle of [-1, 1]) {
        const wheel = this.cylinder(
          g,
          (axle * ch.wheelbase) / 2,
          0.38,
          (side * ch.width) / 2,
          0.42,
          0.35,
          spec.tires.id === "rally" ? 0x302d25 : 0x202824,
        );
        wheel.rotation.x = Math.PI / 2;
        this.box(
          g,
          (axle * ch.wheelbase) / 2,
          0.4,
          side * (ch.width / 2 + 0.18),
          0.25,
          0.25,
          0.035,
          0xb1ac91,
        );
      }
    if (spec.engine.id !== "courier")
      this.box(
        g,
        ch.length * 0.31,
        1.05,
        0,
        0.65,
        0.35,
        0.75,
        spec.engine.id === "longrunner" ? 0x9e5442 : 0x8d8e7d,
      );
    if (spec.utility.id === "capacitor")
      this.cylinder(g, -1.2, 1.18, 0, 0.33, 0.7, 0x657e83);
    if (spec.utility.id === "roll-cage")
      for (const side of [-1, 1])
        this.box(g, -0.35, 1.58, side * 0.7, 1.4, 0.1, 0.1, 0x272f29);
    for (const side of [-1, 1])
      this.box(
        g,
        -0.25,
        1.25,
        side * (ch.width * 0.44 + 0.015),
        1.05,
        0.35,
        0.035,
        0x526e68,
      );
    const plate = this.label(
      g,
      number,
      0.05,
      0.73,
      ch.width / 2 + 0.012,
      0.8,
      0.38,
      "#25342a",
      "#e8dfc6",
    );
    const roof = this.label(
      g,
      number,
      -0.3,
      1.52,
      0,
      0.8,
      0.6,
      "#25342a",
      "#e8dfc6",
    );
    roof.rotation.x = -Math.PI / 2;
    // The car's solid components share one draw call. Their transforms are
    // local to this car; moving the group preserves the physical silhouette.
    const positions = [],
      normals = [],
      colors = [];
    for (const mesh of [...g.children]) {
      if (mesh.geometry !== this.boxGeo && mesh.geometry !== this.cylinderGeo)
        continue;
      mesh.updateMatrix();
      const indexed = mesh.geometry.clone().applyMatrix4(mesh.matrix),
        geometry = indexed.toNonIndexed();
      positions.push(...geometry.attributes.position.array);
      normals.push(...geometry.attributes.normal.array);
      for (let i = 0; i < geometry.attributes.position.count; i++)
        colors.push(
          mesh.material.color.r,
          mesh.material.color.g,
          mesh.material.color.b,
        );
      geometry.dispose();
      indexed.dispose();
      g.remove(mesh);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    if (!this.materials.has("car-solids"))
      this.materials.set(
        "car-solids",
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.88,
          metalness: 0.06,
        }),
      );
    const solids = new THREE.Mesh(geometry, this.materials.get("car-solids"));
    solids.castShadow = solids.receiveShadow = true;
    g.add(solids);
    if (ghost)
      g.traverse((o) => {
        if (o.material) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.28;
          o.castShadow = false;
        }
      });
    this.group.add(g);
    this.cars.push(g);
    return g;
  }
  setCars(cars) {
    this.sourceCars = cars;
    for (const c of this.cars) {
      this.releaseObject(c);
      this.group.remove(c);
    }
    this.cars = [];
    this.carModels = cars.map((c) =>
      this.car(c.spec, c.color || 0xe4c54c, c.number || "04"),
    );
  }
  cinematic(track, spec, final = false) {
    this.load(track);
    this.setCars([{ spec }]);
    const finish = track.gates[0];
    this.cinematicState = {
      elapsed: 0,
      final,
      x: finish.x,
      z: finish.z,
      heading: finish.heading,
      restoration: [],
    };
    const g = new THREE.Group();
    g.position.set(
      finish.x - Math.sin(finish.heading) * 20,
      0,
      finish.z + Math.cos(finish.heading) * 20,
    );
    g.rotation.y = -finish.heading;
    this.group.add(g);
    for (let row = 0; row < 4; row++)
      this.box(g, 0, 0.5 + row * 0.7, row * 1.4, 18, 0.5, 1.4, 0xc2bda2);
    for (const x of [-9, 9]) {
      this.box(g, x, 4.5, 5, 0.35, 9, 0.35, 0x35443c);
      this.box(g, x, 9, 5, 2, 0.7, 0.6, 0xf2d282);
    }
    this.cinematicState.restoration.push(g);
  }
  resize() {
    const w = Math.max(1, this.canvas.clientWidth),
      h = Math.max(1, this.canvas.clientHeight),
      size = drawingSize(
        w,
        h,
        devicePixelRatio,
        this.profile,
        this.maxDimension,
      );
    if (
      this.canvas.width !== size.width ||
      this.canvas.height !== size.height
    ) {
      this.renderer.setSize(size.width, size.height, false);
      this.needsValidation = true;
    }
    this.aspect = w / Math.max(h, 1);
  }
  frameOverview(immediate = false) {
    if (!this.bounds) return;
    this.resize();
    const b = this.bounds,
      half = Math.max(b.w * 0.67, b.h * 0.7 * this.aspect, 115);
    this.setFrustum(half);
    this.camera.position.set(b.x - 95, b.w * 0.9 + 160, b.z + b.h * 0.9 + 100);
    this.camera.lookAt(b.x, 0, b.z);
  }
  setFrustum(half) {
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = half / this.aspect;
    this.camera.bottom = -half / this.aspect;
    this.camera.updateProjectionMatrix();
  }
  render(race, view, settings, dt = 0.016) {
    if (!this.available()) return false;
    try {
      this.draw(race, view, settings, dt);
      if (!this.available()) return false;
      // Inspect GL errors only after allocation/recovery, not on every frame.
      if (this.needsValidation) {
        const gl = this.renderer.getContext();
        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
          console.error(
            "Graphics buffer validation failed with WebGL error",
            error,
          );
          return this.fail("The browser could not prepare the racing view.");
        }
        this.needsValidation = false;
      }
      return true;
    } catch (error) {
      console.error("Graphics rendering failed", error);
      return this.fail(error.message || "The racing view stopped drawing.");
    }
  }
  draw(race, view, settings, dt = 0.016) {
    this.resize();
    this.view = view;
    this.renderer.shadowMap.enabled =
      !this.safeGraphics && !settings.lowEffects;
    if (view === "scene" && this.cinematicState) {
      const shot = this.cinematicState;
      shot.elapsed = Math.min(4.5, shot.elapsed + dt);
      const t = sceneProgress(shot.elapsed, settings.reducedMotion),
        ease = 1 - (1 - t) ** 3;
      this.setFrustum(this.aspect < 1 ? 28 : 46);
      const angle =
        shot.heading + 0.25 + (settings.reducedMotion ? 0 : (1 - ease) * 0.35);
      this.camera.position.set(
        shot.x - Math.cos(angle) * 55,
        48,
        shot.z - Math.sin(angle) * 55,
      );
      this.camera.lookAt(shot.x, 0, shot.z);
      const car = this.carModels?.[0];
      if (car) {
        car.position.set(
          shot.x - Math.cos(shot.heading) * (1 - ease) * 12,
          0,
          shot.z - Math.sin(shot.heading) * (1 - ease) * 12,
        );
        car.rotation.y = -shot.heading;
      }
      for (const stand of shot.restoration)
        stand.scale.y = shot.final ? Math.max(0.03, ease) : 1;
    } else if (race && ["race", "result"].includes(view)) {
      if (view === "result")
        this.resultElapsed = Math.min(1.5, (this.resultElapsed || 0) + dt);
      race.cars.forEach((c, i) => {
        const g = this.carModels?.[i];
        if (!g) return;
        g.position.set(c.x, 0, c.z);
        if (view === "result" && !race.result?.dnf && !settings.reducedMotion) {
          const glide = 2.5 * (1 - (1 - this.resultElapsed / 1.5) ** 3);
          g.position.x += Math.cos(c.heading) * glide;
          g.position.z += Math.sin(c.heading) * glide;
        }
        g.rotation.y = -c.heading;
        g.visible = true;
        g.children[0].rotation.z = -c.yaw * 0.025;
      });
      const p = race.cars.find((c) => c.id === "player"),
        look = 10 + Math.hypot(p.vx, p.vz) * 0.35,
        next = new THREE.Vector3(
          p.x + Math.cos(p.heading) * look,
          0,
          p.z + Math.sin(p.heading) * look,
        );
      this.target.lerp(next, Math.min(1, dt * 4));
      if (settings.northUp || settings.reducedMotion) this.angle = 0;
      else this.angle += wrap(p.heading - this.angle) * Math.min(1, dt * 3);
      const half = this.aspect < 1 ? 38 : 68;
      this.setFrustum(half);
      const distance = 90;
      this.camera.position.set(
        this.target.x - Math.cos(this.angle) * distance,
        125,
        this.target.z - Math.sin(this.angle) * distance,
      );
      this.camera.lookAt(this.target);
      if (this.ghostModel && race.bestGhost?.length) {
        const frames = race.bestGhost,
          i = Math.min(
            Math.max(0, frames.length / 4 - 2),
            Math.max(0, Math.floor(race.time * 20)),
          ),
          a = i * 4,
          b = Math.min(a + 4, frames.length - 4),
          t = clamp01(
            (race.time * 1000 - frames[a]) / (frames[b] - frames[a] || 1),
          );
        this.ghostModel.visible =
          settings.ghost && Number.isFinite(frames[a + 1]);
        this.ghostModel.position.set(
          frames[a + 1] + (frames[b + 1] - frames[a + 1]) * t,
          0.02,
          frames[a + 2] + (frames[b + 2] - frames[a + 2]) * t,
        );
        this.ghostModel.rotation.y = -(
          frames[a + 3] +
          wrap(frames[b + 3] - frames[a + 3]) * t
        );
      }
    } else if (view === "garage") {
      this.setFrustum(this.aspect < 1 ? 5 : 6.5);
      const c = this.carModels?.[0];
      if (c) {
        c.position.set(this.bounds.x, 0.2, this.bounds.z);
        c.rotation.y = -0.5;
      }
      this.camera.position.set(this.bounds.x + 8, 6, this.bounds.z + 10);
      this.camera.lookAt(this.bounds.x, 0.7, this.bounds.z);
    } else this.frameOverview();
    this.renderer.render(this.scene, this.camera);
  }
  setGhost(spec, frames) {
    this.ghostModel = null;
    if (frames?.length) {
      this.ghostModel = this.car(spec, 0xc2d9bf, "", true);
    }
  }
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
