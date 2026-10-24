import * as THREE from 'three';
import { SECTORS, sectorPosition } from '../../shared/sectors';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DOOR_KEY_BITS, KEY_BITS } from '../../shared/constants';
import { canTraverseDeck, deckAt, DeckTopology, getDeckTopology } from '../../shared/levels';
import type { TileType, SolverStep, AgentSimulationStep } from '../../shared/types';
import type { PuzzleGridProps } from '../components/BlueprintGrid';

export type CameraMode = 'orbit' | 'top' | 'follow';
type Animated = { object: THREE.Object3D; kind: 'spin' | 'float' | 'door' | 'pulse'; base: number; phase: number };
const PALETTES = {
  ion: { accent: '#74eadb', wall: '#667f90', floor: '#273d49', backdrop: '#07131d', trim: '#b1d4da' },
  ember: { accent: '#ffb26b', wall: '#887368', floor: '#423736', backdrop: '#1b1214', trim: '#d8c3a5' },
  void: { accent: '#ba9dff', wall: '#79768f', floor: '#303346', backdrop: '#101021', trim: '#c2badd' },
};
const vector = (row: number, col: number, y = 0) => new THREE.Vector3(col - 3.5, y, row - 3.5);
const agentStep = (step: PuzzleGridProps['currentStep']): AgentSimulationStep | null =>
  step && 'visibleCells' in step ? step : null;

export class FacilityScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
  private controls: OrbitControls;
  private architecture = new THREE.Group();
  private world = new THREE.Group();
  private overlay = new THREE.Group();
  private robot = new THREE.Group();
  private rival = new THREE.Group();
  private rivalFrom = new THREE.Vector3();
  private rivalTo = new THREE.Vector3();
  private rivalMovedAt = 0;
  private rivalMaterials: THREE.Material[] = [];
  private sectorPlatforms: THREE.Object3D[] = [];
  private torso = new THREE.Group();
  private legs: THREE.Group[] = [];
  private head = new THREE.Group();
  private scanner!: THREE.Mesh;
  private halo!: THREE.Mesh;
  private animated: Animated[] = [];
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private frame = 0;
  private observer: ResizeObserver;
  private mode: CameraMode = 'orbit';
  private props: PuzzleGridProps;
  private topology: DeckTopology = { accessA: null, accessB: null };
  private lastSignature = '';
  private lastArchitectureSignature = '';
  private from = vector(0, 0);
  private to = vector(0, 0);
  private moveStarted = 0;
  private lastStep: SolverStep | AgentSimulationStep | null = null;
  private warp = false;
  private yaw = 0;
  private startTime = performance.now();
  private previousTime = performance.now();
  private pointerStart = { x: 0, y: 0 };
  private hoverCell = '';
  private activePointers = new Set<number>();
  private multiTouch = false;
  private builtTiles = new Map<string, TileType>();
  private construction: Array<{ object: THREE.Group; start: number }> = [];
  private doorHeights = new Map<string, number>();
  private walls: THREE.Group[] = [];
  private followZoom = 1;
  private sightline = new THREE.Ray();
  private wallBounds = new THREE.Box3();
  private sightHit = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private visible = true;
  private visibilityObserver: IntersectionObserver;

  constructor(private host: HTMLDivElement, props: PuzzleGridProps, private onLost: () => void) {
    this.props = props;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D facility');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 38;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.enablePan = true;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(13, 14, 17);
    this.scene.add(new THREE.HemisphereLight('#d9efff', '#273041', 2.6));
    const sun = new THREE.DirectionalLight('#fff1d8', 4.2);
    sun.position.set(-4, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, far: 35 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#88bcff', 2.4);
    rim.position.set(6, 4, -8);
    this.scene.add(rim, this.architecture, this.world, this.overlay, this.robot);
    this.makeRobot();
    this.rival = this.robot.clone(true);
    this.rival.traverse(object => {
      if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
        const material = object.material.clone();
        if ('color' in material) (material as THREE.MeshStandardMaterial).color.lerp(new THREE.Color('#ffc581'), 0.75);
        object.material = material; this.rivalMaterials.push(material);
      }
    });
    this.rival.visible = false; this.scene.add(this.rival);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.host);
    this.visibilityObserver = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; });
    this.visibilityObserver.observe(this.host);
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.addEventListener('contextmenu', this.contextMenu);
    this.update(props);
    this.resize();
    this.tick();
  }

  private material(color: string, glow = false, opacity = 1) {
    const key = `${color}:${glow}:${opacity}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({
      color, metalness: glow ? 0.2 : 0.45, roughness: 0.48,
      emissive: glow ? color : '#000000', emissiveIntensity: glow ? 1.8 : 0,
      transparent: opacity < 1, opacity, depthWrite: opacity === 1,
      side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
    }));
    return this.materials.get(key)!;
  }

  private box(parent: THREE.Object3D, size: number[], pos: number[], color: string, glow = false, opacity = 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), this.material(color, glow, opacity));
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = !glow && opacity === 1;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private cylinder(parent: THREE.Object3D, radius: number, height: number, y: number, color: string, glow = false) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), this.material(color, glow));
    mesh.position.y = y;
    mesh.castShadow = !glow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private ring(parent: THREE.Object3D, radius: number, thickness: number, color: string, y: number, upright = false) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 6, 40), this.material(color, true));
    mesh.position.y = y;
    if (!upright) mesh.rotation.x = Math.PI / 2;
    parent.add(mesh);
    return mesh;
  }

  private at(row: number, col: number, y = 0) {
    const point = vector(row, col, y);
    const deck = deckAt(this.topology, row, col);
    if (deck === 1) point.add(new THREE.Vector3(3.4, 1.45, -1.6));
    if (deck === 2) point.add(new THREE.Vector3(-3.4, 2.65, 2.1));
    return point;
  }

  private buildBridge(access: { row: number; col: number }, level: 1 | 2, color: string) {
    const destination = [[-1, 0], [0, 1], [1, 0], [0, -1]]
      .map(([dr, dc]) => ({ row: access.row + dr, col: access.col + dc }))
      .find(cell => deckAt(this.topology, cell.row, cell.col) === level &&
        canTraverseDeck(this.topology, access, cell));
    if (!destination) return;
    const from = this.at(access.row, access.col);
    const to = this.at(destination.row, destination.col);
    const direction = to.clone().sub(from);
    const length = direction.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    const middle = from.clone().add(to).multiplyScalar(0.5);
    const across = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const span = (width: number, height: number, offset: number, tint: string, glow = false) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), this.material(tint, glow));
      mesh.position.copy(middle).addScaledVector(across, offset);
      mesh.quaternion.copy(rotation);
      mesh.castShadow = !glow;
      mesh.receiveShadow = true;
      this.architecture.add(mesh);
    };
    span(0.77, 0.15, 0, '#587380');
    span(0.045, 0.04, -0.3, color, true);
    span(0.045, 0.04, 0.3, color, true);
    this.box(this.architecture, [0.82, 0.11, 0.82], [from.x, 0.055, from.z], color, false, 0.7);
  }

  private buildAnnex(level: 1 | 2, access: { row: number; col: number }) {
    const p = PALETTES[this.props.theme ?? 'ion'];
    const row = level === 1 ? 1 : 5;
    const col = level === 1 ? 5 : 1;
    const color = level === 1 ? '#88e8cf' : '#f3c183';
    const center = this.at(row, col).add(this.at(row + 1, col + 1)).multiplyScalar(0.5);
    this.box(this.architecture, [2.25, 0.28, 2.25], [center.x, center.y - 0.2, center.z], '#2e4553');
    this.box(this.architecture, [2.1, 0.05, 2.1], [center.x, center.y - 0.01, center.z], p.floor);
    for (const side of [-1, 1]) {
      this.box(this.architecture, [2.22, 0.04, 0.04], [center.x, center.y + 0.05, center.z + side * 1.1], color, true);
      this.box(this.architecture, [0.04, 0.04, 2.22], [center.x + side * 1.1, center.y + 0.05, center.z], color, true);
      for (const edge of [-1, 1]) {
        this.box(this.architecture, [0.13, center.y + 0.8, 0.13],
          [center.x + side * 0.87, center.y / 2 - 0.44, center.z + edge * 0.87], '#435968');
      }
    }
    this.box(this.architecture, [2.08, 0.04, 2.08], [col - 3, -0.015, row - 3], p.backdrop);
    this.buildBridge(access, level, color);
  }

  private clear(group: THREE.Object3D) {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (object instanceof THREE.Line) (object.material as THREE.Material).dispose();
      }
    });
    group.clear();
  }

  private makeRobot() {
    this.robot.add(this.torso);
    this.box(this.torso, [0.28, 0.27, 0.2], [0, 0.44, 0], '#d6e4ea');
    this.box(this.torso, [0.18, 0.05, 0.025], [0, 0.48, 0.115], '#70ffee', true);
    this.box(this.torso, [0.16, 0.18, 0.1], [0, 0.43, -0.15], '#374756');
    this.torso.add(this.head);
    this.head.position.y = 0.69;
    this.box(this.head, [0.32, 0.22, 0.27], [0, 0, 0], '#e3e9e9');
    this.box(this.head, [0.27, 0.08, 0.022], [0, 0, 0.148], '#102831');
    this.box(this.head, [0.18, 0.027, 0.025], [0, 0, 0.163], '#78fff1', true);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.085, 0.31, 0);
      this.box(leg, [0.095, 0.18, 0.09], [0, -0.1, 0], '#405565');
      this.box(leg, [0.12, 0.07, 0.2], [0, -0.25, 0.04], '#d5e1e7');
      this.legs.push(leg);
      this.robot.add(leg);
      const arm = this.box(this.torso, [0.07, 0.24, 0.09], [side * 0.2, 0.43, 0], '#c7d5dd');
      arm.rotation.z = side * 0.13;
    }
    this.scanner = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.68, 48, 1, 0, Math.PI * 1.4),
      new THREE.MeshBasicMaterial({ color: '#80ecdf', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.scanner.rotation.x = -Math.PI / 2;
    this.scanner.position.y = 0.035;
    this.robot.add(this.scanner);
    this.halo = this.ring(this.robot, 0.44, 0.012, '#85ffee', 0.04);
    this.robot.position.copy(this.to);
  }

  private buildArchitecture() {
    this.clear(this.architecture);
    const p = PALETTES[this.props.theme ?? 'ion'];
    this.scene.background = new THREE.Color(p.backdrop);
    this.scene.fog = new THREE.Fog(p.backdrop, this.props.sectorMap ? 45 : 21, this.props.sectorMap ? 120 : 53);
    this.box(this.architecture, [200, 0.2, 200], [0, -1.65, 0], p.backdrop);
    this.box(this.architecture, [9.2, 0.5, 9.2], [0, -0.55, 0], '#131f2a');
    this.box(this.architecture, [8.65, 0.12, 8.65], [0, -0.23, 0], p.trim);
    this.box(this.architecture, [8.45, 0.2, 8.45], [0, -0.15, 0], p.floor);
    // Broad floor panels; navigation cells stay invisible in the architectural view.
    for (let i = 0; i < 4; i++) {
      this.box(this.architecture, [8.1, 0.015, 1.99], [0, -0.04, i * 2 - 3], p.floor);
      this.box(this.architecture, [0.035, 0.035, 8.2], [i * 2 - 3, -0.02, 0], '#344b57');
    }
    for (const side of [-1, 1]) {
      this.box(this.architecture, [8.6, 0.03, 0.04], [0, -0.29, side * 4.37], p.accent, true);
      this.box(this.architecture, [0.04, 0.03, 8.6], [side * 4.37, -0.29, 0], p.accent, true);
      this.box(this.architecture, [8.3, 0.1, 0.12], [0, 0.03, side * 4.16], '#73838b');
      this.box(this.architecture, [0.12, 0.1, 8.3], [side * 4.16, 0.03, 0], '#73838b');
      for (let j = -3; j <= 3; j += 2) {
        this.box(this.architecture, [0.3, 0.6, 0.3], [j, -0.95, side * 3.9], '#455967');
        this.box(this.architecture, [0.5, 0.1, 0.2], [j, -0.5, side * 4.62], p.accent, true);
      }
    }
    this.sectorPlatforms = [];
    const completed = new Set(this.props.completedSectors ?? []);
    const sectors = this.props.sectors ?? SECTORS;
    sectors.forEach((sector, index) => {
      const group = new THREE.Group();
      const [x, y, z] = sectorPosition(index);
      group.position.set(x, y, z); group.userData.sectorId = sector.id;
      this.architecture.add(group); this.sectorPlatforms.push(group);
      const selected = sector.id === this.props.selectedSectorId;
      const color = completed.has(sector.id) ? '#8effbd' : sector.color;
      this.box(group, [3.65, 0.3, 3.65], [0, -0.28, 0], '#253d4c');
      this.box(group, [3.78, 0.045, 3.78], [0, -0.11, 0], color, true);
      this.box(group, [3.6, 0.09, 3.6], [0, -0.035, 0], p.floor);
      const walls: Array<[number, number]> = [], markers: Array<[number, number]> = [];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (sector.grid[r][c] === 'WALL') walls.push([r, c]);
        else if (sector.grid[r][c] !== 'EMPTY') markers.push([r, c]);
      }
      // Two draw calls per miniature keep the eight destinations cheap to render.
      for (const [cells, wall] of [[walls, true], [markers, false]] as const) {
        if (!cells.length) continue;
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(wall ? 0.39 : 0.25, wall ? 0.36 : 0.1, wall ? 0.39 : 0.25), this.material(wall ? p.wall : '#d8ece8'), cells.length);
        cells.forEach(([r, c], instance) => {
          mesh.setMatrixAt(instance, new THREE.Matrix4().makeTranslation((c - 3.5) * 0.4, wall ? 0.18 : 0.08, (r - 3.5) * 0.4));
          if (!wall) mesh.setColorAt(instance, new THREE.Color(sector.grid[r][c] === 'EXIT' ? '#bcebd9' : color));
        });
        mesh.receiveShadow = true; group.add(mesh);
      }
      for (const side of [-1, 1]) this.box(group, [0.16, y + 1.4, 0.16], [side * 1.45, -(y + 1.4) / 2 - 0.3, 1.45], '#3c5262');
      this.cylinder(group, 0.13, selected ? 1.5 : 0.65, selected ? 0.75 : 0.32, color, true).position.z = -1.5;
      if (selected) this.ring(group, 2.05, 0.035, color, 0.06);
      if (this.props.sectorMap && index > 0) {
        const previous = new THREE.Vector3(...sectorPosition(index - 1));
        const next = new THREE.Vector3(x, y, z);
        this.architecture.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([previous, next]), new THREE.LineBasicMaterial({ color: '#527886', transparent: true, opacity: 0.5 })));
      }
    });
    if (this.topology.accessA) this.buildAnnex(1, this.topology.accessA);
    if (this.topology.accessB) this.buildAnnex(2, this.topology.accessB);
  }

  private makeHardware(parent: THREE.Group, tile: TileType, row: number, col: number) {
    const p = PALETTES[this.props.theme ?? 'ion'];
    const step = this.props.currentStep;
    const data = agentStep(step);
    const phase = row * 3 + col;
    const animate = (object: THREE.Object3D, kind: Animated['kind'], base = object.position.y) =>
      this.animated.push({ object, kind, base, phase });
    if (tile === 'WALL') {
      const seenWall = (r: number, c: number) => this.props.grid[r]?.[c] === 'WALL' &&
        (this.props.viewMode !== 'AI_FOG' || data?.discoveredCells.includes(`${r},${c}`));
      const horizontal = seenWall(row, col - 1) || seenWall(row, col + 1);
      const vertical = seenWall(row - 1, col) || seenWall(row + 1, col);
      this.box(parent, [horizontal ? 1.02 : 0.66, 0.95, vertical ? 1.02 : 0.5], [0, 0.48, 0], p.wall);
      this.box(parent, [horizontal ? 1.03 : 0.71, 0.075, vertical ? 1.03 : 0.55], [0, 0.98, 0], p.trim);
      this.box(parent, [horizontal ? 1.02 : 0.5, 0.025, 0.018], [0, 0.8, vertical ? 0.516 : 0.258], p.accent, true);
      this.box(parent, [0.018, 0.025, vertical ? 1.02 : 0.4], [horizontal ? 0.516 : 0.337, 0.8, 0], p.accent, true);
      for (let i = 0; i < 3; i++) this.box(parent, [0.045, 0.25, 0.025], [-0.13 + i * 0.13, 0.42, vertical ? 0.52 : 0.26], '#304654');
    } else if (tile.startsWith('DOOR') || tile.startsWith('GATE')) {
      const color = tile.includes('RED') ? '#ff897d' : tile.includes('GOLD') ? '#ffc877' : tile.includes('CYAN') ? '#7ae6ef' : '#bb9eff';
      const unlocked = tile.startsWith('DOOR') ? Boolean((step?.keyMask ?? 0) & (DOOR_KEY_BITS[tile] ?? 0)) :
        tile === 'GATE_A_CLOSED' ? Boolean((step?.switchMask ?? 0) & 1) : !((step?.switchMask ?? 0) & 1);
      for (const side of [-1, 1]) {
        this.box(parent, [0.14, 1.13, 0.22], [side * 0.43, 0.56, 0], p.trim);
        this.box(parent, [0.025, 0.9, 0.025], [side * 0.43, 0.55, 0.125], color, true);
      }
      this.box(parent, [0.98, 0.12, 0.25], [0, 1.1, 0], p.wall);
      const doorKey = `${row},${col}`;
      const door = this.box(parent, [0.7, 0.84, 0.1], [0, this.doorHeights.get(doorKey) ?? (unlocked ? 1.02 : 0.45), 0], color, false, 0.65);
      door.userData.open = unlocked;
      door.userData.doorKey = doorKey;
      animate(door, 'door');
      this.box(parent, [0.3, 0.04, 0.03], [0, 1.12, 0.14], color, true);
    } else if (tile === 'PORTAL_A') {
      this.cylinder(parent, 0.43, 0.1, 0.05, '#4c476b');
      this.ring(parent, 0.4, 0.065, '#70698e', 0.57, true);
      animate(this.ring(parent, 0.32, 0.025, '#bda1ff', 0.57, true), 'pulse');
      const membrane = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), this.material('#a67dff', true, 0.35));
      membrane.position.y = 0.57;
      parent.add(membrane);
      animate(this.ring(parent, 0.44, 0.013, '#e5cbff', 0.57, true), 'spin');
    } else if (tile.startsWith('KEY')) {
      const color = tile.includes('RED') ? '#ff9184' : tile.includes('GOLD') ? '#ffd184' : '#7deefa';
      this.cylinder(parent, 0.24, 0.22, 0.11, p.wall);
      this.ring(parent, 0.25, 0.015, color, 0.24);
      if (!((step?.keyMask ?? 0) & (KEY_BITS[tile] ?? 0))) {
        const key = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), this.material(color, true));
        key.position.y = 0.53;
        parent.add(key);
        animate(key, 'float');
      }
    } else if (tile === 'START' || tile === 'EXIT' || tile === 'DECOY_EXIT') {
      const decoyVerified = data?.verifiedDecoys.includes(`${row},${col}`);
      const color = tile === 'START' ? p.accent : decoyVerified || tile === 'DECOY_EXIT' && this.props.viewMode !== 'AI_FOG' ? '#f3a2cf' : '#b8ffb0';
      this.cylinder(parent, 0.43, 0.08, 0.04, p.wall);
      this.ring(parent, 0.38, 0.018, color, 0.095);
      if (tile !== 'START') {
        for (const side of [-1, 1]) this.box(parent, [0.09, 1.25, 0.1], [side * 0.38, 0.64, -0.18], p.trim);
        this.box(parent, [0.85, 0.1, 0.12], [0, 1.28, -0.18], p.wall);
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18), this.material(color, true));
        core.position.y = 0.66;
        parent.add(core);
        animate(core, 'float');
        this.box(parent, [0.63, 1.12, 0.015], [0, 0.67, -0.18], color, true, 0.12);
      } else {
        for (const side of [-1, 1]) this.box(parent, [0.12, 0.55, 0.14], [side * 0.38, 0.28, -0.25], p.trim);
      }
    } else if (tile === 'GRAVITY_MUD') {
      this.box(parent, [0.92, 0.04, 0.92], [0, 0.02, 0], '#5699ab', false, 0.7);
      for (let i = 0; i < 3; i++) {
        const fin = this.box(parent, [0.75, 0.015, 0.035], [0, 0.065, (i - 1) * 0.25], '#87efff', true);
        animate(fin, 'pulse');
      }
    } else if (tile === 'EMP_SCRAMBLER' || tile === 'TRAP_RESET') {
      const color = tile === 'TRAP_RESET' ? '#ffb478' : '#f3da89';
      this.cylinder(parent, 0.28, 0.08, 0.04, '#55616a');
      const spent = data?.triggeredResetPositions.includes(`${row},${col}`);
      animate(this.ring(parent, 0.24, 0.016, spent ? '#4d6367' : color, 0.1), 'pulse');
      if (tile === 'EMP_SCRAMBLER') {
        this.cylinder(parent, 0.07, 0.3, 0.2, p.trim);
        this.ring(parent, 0.16, 0.015, color, 0.35);
      }
    } else if (tile === 'SWITCH_A') {
      this.box(parent, [0.38, 0.3, 0.3], [0, 0.15, 0], p.wall);
      const panel = this.box(parent, [0.33, 0.025, 0.25], [0, 0.32, 0], step?.switchMask ? '#91ffb6' : '#c5acff', true);
      panel.rotation.x = 0.25;
    } else if (tile === 'ELEVATOR_A' || tile === 'ELEVATOR_B') {
      const color = tile === 'ELEVATOR_A' ? '#88e8cf' : '#f3c183';
      this.cylinder(parent, 0.38, 0.12, 0.06, p.wall);
      this.ring(parent, 0.34, 0.023, color, 0.14);
      for (const side of [-1, 1]) {
        this.box(parent, [0.08, 0.77, 0.09], [side * 0.34, 0.4, -0.14], p.trim);
        this.box(parent, [0.035, 0.62, 0.02], [side * 0.34, 0.4, -0.081], color, true);
      }
      animate(this.ring(parent, 0.19, 0.015, color, 0.55, true), 'spin');
    }
  }

  private buildWorld() {
    for (const item of this.animated) {
      if (item.kind === 'door') this.doorHeights.set(item.object.userData.doorKey, item.object.position.y);
    }
    this.clear(this.world);
    this.animated = [];
    this.construction = [];
    this.walls = [];
    const knowledge = agentStep(this.props.currentStep);
    const fog = this.props.viewMode === 'AI_FOG';
    const discovered = new Set(knowledge?.discoveredCells ?? []);
    const visible = new Set(knowledge?.visibleCells ?? []);
    const hazards = new Set(knowledge?.knownHazards ?? []);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const key = `${row},${col}`;
      const parent = new THREE.Group();
      parent.position.copy(this.at(row, col));
      parent.userData.cell = { row, col };
      this.world.add(parent);
      if (fog && !discovered.has(key)) {
        this.box(parent, [1, 0.08, 1], [0, 0.04, 0], '#101d29');
        this.builtTiles.delete(key);
        continue;
      }
      let tile = this.props.grid[row][col];
      if (fog && (tile === 'TRAP_RESET' || tile === 'EMP_SCRAMBLER') && !hazards.has(key)) tile = 'EMPTY';
      this.makeHardware(parent, tile, row, col);
      if (tile === 'WALL') this.walls.push(parent);
      if (tile !== 'EMPTY' && tile !== this.builtTiles.get(key) && !this.reducedMotion) {
        parent.scale.y = 0.05;
        this.construction.push({ object: parent, start: performance.now() });
      }
      this.builtTiles.set(key, tile);
      if (fog && !visible.has(key)) this.box(parent, [0.99, 0.015, 0.99], [0, 0.015, 0], '#111c2a', false, 0.5);
    }
  }

  private buildOverlay() {
    this.clear(this.overlay);
    const route = this.props.plannedRoute ?? [];
    const current = this.props.currentStep;
    const visited = this.props.visitedSteps ?? [];
    if (visited.length > 1) {
      const vertices: THREE.Vector3[] = [];
      for (let i = 1; i < visited.length; i++) {
        const a = visited[i - 1], b = visited[i];
        if (Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1)
          vertices.push(this.at(a.row, a.col, 0.09), this.at(b.row, b.col, 0.09));
      }
      this.overlay.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(vertices),
        new THREE.LineBasicMaterial({ color: '#87dbcf', transparent: true, opacity: 0.25 })));
    }
    if (current && route.length) {
      const points = [current, ...route];
      const vertices: THREE.Vector3[] = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1)
          vertices.push(this.at(a.row, a.col, 0.12), this.at(b.row, b.col, 0.12));
      }
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(vertices),
        new THREE.LineDashedMaterial({ color: '#ffdb98', dashSize: 0.1, gapSize: 0.1, transparent: true, opacity: 0.75 }));
      line.computeLineDistances();
      this.overlay.add(line);
    }
    if (this.props.showHeatmap) {
      const known = new Set(agentStep(current)?.discoveredCells ?? []);
      for (const cell of this.props.exploredCells ?? []) {
        if (this.props.viewMode === 'AI_FOG' && !known.has(`${cell.row},${cell.col}`)) continue;
        const pos = this.at(cell.row, cell.col, 0.08);
        this.box(this.overlay, [0.8, 0.012, 0.8], [pos.x, pos.y, pos.z], '#f09b61', false, 0.25);
      }
    }
    for (const cell of this.props.ghostCells ?? []) {
      if (cell.row < 0 || cell.row > 7 || cell.col < 0 || cell.col > 7) continue;
      const pos = this.at(cell.row, cell.col, cell.tile === 'WALL' ? 0.47 : 0.13);
      this.box(this.overlay, [0.86, cell.tile === 'WALL' ? 0.9 : 0.22, 0.86],
        [pos.x, pos.y, pos.z],
        this.props.ghostValid === false ? '#ff827f' : '#a7ffcc', true, 0.28);
    }
  }

  update(props: PuzzleGridProps) {
    const old = this.props;
    this.props = props;
    this.topology = getDeckTopology(props.grid);
    const step = props.currentStep ?? null;
    const signature = JSON.stringify([props.grid, props.theme, props.viewMode, step?.keyMask, step?.switchMask,
      agentStep(step)?.discoveredCells, agentStep(step)?.visibleCells, agentStep(step)?.knownHazards,
      agentStep(step)?.verifiedDecoys, agentStep(step)?.triggeredResetPositions]);
    const architectureSignature = JSON.stringify([props.theme, this.topology, props.sectorMap, props.sectors, props.selectedSectorId, props.completedSectors]);
    if (architectureSignature !== this.lastArchitectureSignature) {
      this.lastArchitectureSignature = architectureSignature;
      this.buildArchitecture();
    }
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.buildWorld();
    }
    this.controls.maxDistance = props.sectorMap ? 120 : 38;
    this.controls.mouseButtons.LEFT = props.interactive ? null as unknown as THREE.MOUSE : THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = props.interactive ? null as unknown as THREE.TOUCH : THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    if (step !== this.lastStep) {
      this.from.copy(this.robot.position);
      this.to.copy(this.at(step?.row ?? 0, step?.col ?? 0));
      this.warp = Boolean(step && (step.event === 'PORTAL_WARP' || step.event === 'TRAP_RESET_TRIGGERED'));
      if (!step || step.event === 'START' || !this.lastStep || step.stepIndex !== this.lastStep.stepIndex + 1) {
        this.from.copy(this.to);
        this.robot.position.copy(this.to);
      }
      if (!this.warp && this.from.distanceTo(this.to) > 0.1)
        this.yaw = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
      this.moveStarted = performance.now();
      this.lastStep = step;
    }
    const rival = props.opponentStep;
    this.rival.visible = Boolean(rival);
    if (rival && rival !== old.opponentStep) {
      this.rivalFrom.copy(this.rival.position); this.rivalTo.copy(this.at(rival.row, rival.col));
      if (!old.opponentStep || rival.event === 'PORTAL_WARP' || rival.event === 'TRAP_RESET_TRIGGERED' || rival.stepIndex !== old.opponentStep.stepIndex + 1) this.rivalFrom.copy(this.rivalTo);
      const direction = this.rivalTo.clone().sub(this.rivalFrom);
      if (direction.length() > 0.01) this.rival.rotation.y = Math.atan2(direction.x, direction.z);
      this.rivalMovedAt = performance.now();
    }
    this.buildOverlay();
  }

  setCamera(mode: CameraMode) {
    this.mode = mode;
    this.controls.enabled = mode !== 'follow';
    if (this.props.sectorMap && mode !== 'follow') {
      this.camera.position.copy(mode === 'top' ? new THREE.Vector3(0, this.camera.aspect < 1.1 ? 55 : 48, 0.01) : this.camera.aspect < 1.1 ? new THREE.Vector3(37, 50, 50) : new THREE.Vector3(26, 32, 36));
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'orbit') {
      this.camera.position.set(this.camera.aspect < 1.1 ? 17 : 13, this.camera.aspect < 1.1 ? 18 : 14, this.camera.aspect < 1.1 ? 20 : 17);
      this.controls.target.set(0, 0, 0);
    } else if (mode === 'top') {
      this.camera.position.set(0, this.camera.aspect < 1.1 ? 25 : 21, 0.01);
      this.controls.target.set(0, 0, 0);
    }
    this.controls.update();
  }

  zoom(direction: number) {
    if (this.mode === 'follow') {
      this.followZoom = THREE.MathUtils.clamp(this.followZoom * (direction > 0 ? 0.82 : 1.22), 0.6, 2);
      return;
    }
    this.camera.position.sub(this.controls.target).multiplyScalar(direction > 0 ? 0.82 : 1.22).add(this.controls.target);
    this.controls.update();
  }

  private resize = () => {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 1.25 ? 48 : 39;
    this.camera.updateProjectionMatrix();
    if (this.mode !== 'follow') this.setCamera(this.mode);
  };

  private sectorAt(event: PointerEvent): string | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    this.architecture.updateMatrixWorld(true);
    let target: THREE.Object3D | null = this.raycaster.intersectObjects(this.sectorPlatforms, true)[0]?.object ?? null;
    while (target) { if (target.userData.sectorId) return target.userData.sectorId; target = target.parent; }
    return undefined;
  }

  private cellAt(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    ), this.camera);
    this.world.updateMatrixWorld(true);
    const hardware = this.raycaster.intersectObjects(this.world.children, true)[0];
    if (hardware) {
      let object: THREE.Object3D | null = hardware.object;
      while (object && object !== this.world) {
        if (object.userData.cell) return object.userData.cell as { row: number; col: number };
        object = object.parent;
      }
    }
    for (const level of [2, 1, 0]) {
      if (level === 2 && !this.topology.accessB || level === 1 && !this.topology.accessA) continue;
      this.plane.constant = -(level === 2 ? 2.65 : level === 1 ? 1.45 : 0);
      const point = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
      if (!point) continue;
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        if (deckAt(this.topology, row, col) !== level) continue;
        const center = this.at(row, col);
        // Half-open bounds assign shared grid seams to exactly one sector.
        // Strict bounds on both sides left center clicks between four cells unpickable.
        const dx = point.x - center.x, dz = point.z - center.z;
        if (dx >= -0.5 && dx < 0.5 && dz >= -0.5 && dz < 0.5)
          return { row, col };
      }
    }
    return null;
  }
  private pointerDown = (event: PointerEvent) => {
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) this.multiTouch = true;
    this.pointerStart = { x: event.clientX, y: event.clientY };
  };
  private pointerCancel = (event: PointerEvent) => {
    this.activePointers.delete(event.pointerId);
    if (!this.activePointers.size) this.multiTouch = false;
  };
  private pointerUp = (event: PointerEvent) => {
    this.activePointers.delete(event.pointerId);
    if (this.multiTouch) {
      if (!this.activePointers.size) this.multiTouch = false;
      return;
    }
    if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) return;
    if (this.props.sectorMap && event.button === 0) { const id = this.sectorAt(event); if (id) this.props.onSectorSelect?.(id); return; }
    if (!this.props.interactive || this.mode === 'follow') return;
    const cell = this.cellAt(event);
    if (cell) this.props.onCellInteract?.(cell.row, cell.col, event.button === 2);
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.props.sectorMap) { this.renderer.domElement.style.cursor = this.sectorAt(event) ? 'pointer' : 'grab'; return; }
    if (!this.props.interactive) return;
    const cell = this.cellAt(event);
    const key = cell ? `${cell.row},${cell.col}` : '';
    if (cell && key !== this.hoverCell) {
      this.hoverCell = key;
      this.props.onCellHover?.(cell.row, cell.col);
      if (event.buttons === 1 && this.props.paintDrag && !this.multiTouch && this.mode !== 'follow')
        this.props.onCellInteract?.(cell.row, cell.col);
    }
  };
  private contextMenu = (event: Event) => event.preventDefault();
  private contextLost = (event: Event) => { event.preventDefault(); this.onLost(); };

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    if (!this.visible || document.hidden) return;
    const now = performance.now();
    const dt = Math.min((now - this.previousTime) / 1000, 0.06);
    this.previousTime = now;
    const t = this.reducedMotion ? 0 : (now - this.startTime) / 1000;
    const progress = Math.min(1, (now - this.moveStarted) / (this.props.stepDurationMs ?? 440));
    const moving = progress < 1 && this.from.distanceTo(this.to) > 0.02;
    if (this.warp && moving) {
      this.robot.position.copy(progress < 0.5 ? this.from : this.to);
      this.robot.scale.setScalar(Math.max(0.03, Math.abs(progress * 2 - 1)));
    } else {
      const eased = progress * progress * (3 - 2 * progress);
      this.robot.position.lerpVectors(this.from, this.to, this.reducedMotion ? 1 : eased);
      this.robot.scale.setScalar(1);
    }
    if (this.rival.visible) {
      const progress = Math.min(1, (now - this.rivalMovedAt) / (this.props.stepDurationMs ?? 150));
      this.rival.position.lerpVectors(this.rivalFrom, this.rivalTo, progress * progress * (3 - 2 * progress));
    }
    const turn = Math.atan2(Math.sin(this.yaw - this.robot.rotation.y), Math.cos(this.yaw - this.robot.rotation.y));
    this.robot.rotation.y += turn * Math.min(1, dt * 13);
    this.torso.position.y = moving ? Math.sin(t * 24) * 0.025 : Math.sin(t * 2) * 0.009;
    this.legs.forEach((leg, index) => { leg.rotation.x = moving ? Math.sin(t * 20 + index * Math.PI) * 0.65 : 0; });
    this.head.rotation.y = moving ? 0 : Math.sin(t * 1.3) * 0.25;
    this.scanner.rotation.z = t * 0.8;
    const knowledge = agentStep(this.props.currentStep);
    this.scanner.scale.setScalar((knowledge?.visionRadius ?? 2) * 1.15);
    (this.scanner.material as THREE.MeshBasicMaterial).color.set(knowledge?.empRemainingTurns ? '#ffbb62' : '#80ecdf');
    this.halo.scale.setScalar(this.warp && moving ? 1 + Math.sin(progress * Math.PI) * 2 : 1);
    this.construction = this.construction.filter(build => {
      const p = Math.min(1, (now - build.start) / 500);
      build.object.scale.y = 1 - Math.pow(1 - p, 3);
      return p < 1;
    });
    for (const animation of this.animated) {
      const object = animation.object;
      if (animation.kind === 'float') {
        object.position.y = animation.base + Math.sin(t * 2 + animation.phase) * 0.065;
        object.rotation.y = t * 0.7 + animation.phase;
      } else if (animation.kind === 'spin') object.rotation.z = t * 0.7;
      else if (animation.kind === 'pulse') object.scale.setScalar(1 + Math.sin(t * 3 + animation.phase) * 0.04);
      else if (animation.kind === 'door')
        object.position.y = THREE.MathUtils.lerp(object.position.y, object.userData.open ? 1.02 : 0.45, Math.min(1, dt * 6));
    }
    if (this.mode === 'follow') {
      const target = this.robot.position.clone().add(new THREE.Vector3(0, 0.4, 0));
      this.controls.target.lerp(target, Math.min(1, dt * 5));
      this.camera.position.lerp(target.clone().add(new THREE.Vector3(3.3, 4.2, 4.5).multiplyScalar(this.followZoom)), Math.min(1, dt * 3));
      this.camera.lookAt(this.controls.target);
    } else this.controls.update();
    // A camera cutaway keeps the robot visible behind tall architecture.
    // Test the full-height wall bounds so lowering a wall cannot cause flicker.
    const focus = this.robot.position.clone().add(new THREE.Vector3(0, 0.55, 0));
    const distance = this.camera.position.distanceTo(focus);
    this.sightline.set(this.camera.position, focus.sub(this.camera.position).normalize());
    for (const wall of this.walls) {
      this.wallBounds.min.set(wall.position.x - 0.53, wall.position.y, wall.position.z - 0.53);
      this.wallBounds.max.set(wall.position.x + 0.53, wall.position.y + 1.1, wall.position.z + 0.53);
      const hit = this.mode === 'follow' && this.sightline.intersectBox(this.wallBounds, this.sightHit);
      const obscures = hit && this.camera.position.distanceTo(this.sightHit) < distance - 0.25;
      if (this.mode === 'follow' || wall.userData.cutaway) {
        wall.scale.y = THREE.MathUtils.lerp(wall.scale.y, obscures ? 0.24 : 1, Math.min(1, dt * 12));
        wall.userData.cutaway = this.mode === 'follow' || wall.scale.y < 0.99;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.dataset.ready = 'true';
    this.renderer.domElement.dataset.agentPosition = `${this.robot.position.x.toFixed(3)},${this.robot.position.z.toFixed(3)}`;
    this.renderer.domElement.dataset.agentLevel = `${this.props.currentStep?.level ?? 0}`;
    this.renderer.domElement.dataset.agentHeight = this.robot.position.y.toFixed(3);
    this.renderer.domElement.dataset.opponentPosition = this.rival.visible ? `${this.rival.position.x.toFixed(3)},${this.rival.position.z.toFixed(3)}` : '';
    this.renderer.domElement.dataset.selectedSector = this.props.selectedSectorId ?? '';
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.visibilityObserver.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown);
    canvas.removeEventListener('pointerup', this.pointerUp);
    canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointercancel', this.pointerCancel);
    canvas.removeEventListener('contextmenu', this.contextMenu);
    canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.clear(this.scene);
    for (const material of this.materials.values()) material.dispose();
    (this.scanner.material as THREE.Material).dispose();
    this.rivalMaterials.forEach(material => material.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
