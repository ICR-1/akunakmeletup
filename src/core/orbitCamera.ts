import * as THREE from 'three';

/** Kamera orbit sederhana: seret mouse untuk memutar, roda untuk zoom, putar otomatis pelan saat idle. */
export class OrbitCamera {
  azimuth = 0.6;
  elevation = 0.28;
  distance = 30;
  readonly target = new THREE.Vector3();
  autoRotateSpeed = 0.12;
  private dragging = false;
  private idle = 0;
  private readonly onDown = (e: PointerEvent): void => {
    if (e.target !== this.element) return;
    this.dragging = true;
    this.idle = 0;
  };
  private readonly onUp = (): void => { this.dragging = false; };
  private readonly onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.azimuth -= e.movementX * 0.006;
    this.elevation = THREE.MathUtils.clamp(this.elevation + e.movementY * 0.004, -0.1, 1.2);
    this.idle = 0;
  };
  private readonly onWheel = (e: WheelEvent): void => {
    this.distance = THREE.MathUtils.clamp(this.distance * (1 + Math.sign(e.deltaY) * 0.08), this.minDistance, this.maxDistance);
  };

  constructor(
    private readonly element: HTMLElement,
    public minDistance = 8,
    public maxDistance = 80,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointermove', this.onMove);
    element.addEventListener('wheel', this.onWheel, { passive: true });
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.idle += dt;
    if (!this.dragging && this.idle > 1.5) this.azimuth += this.autoRotateSpeed * dt;
    const cosE = Math.cos(this.elevation);
    camera.position.set(
      this.target.x + Math.sin(this.azimuth) * cosE * this.distance,
      this.target.y + Math.sin(this.elevation) * this.distance,
      this.target.z + Math.cos(this.azimuth) * cosE * this.distance,
    );
    camera.lookAt(this.target);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('wheel', this.onWheel);
  }
}
