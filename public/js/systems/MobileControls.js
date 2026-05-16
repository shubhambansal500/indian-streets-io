// Virtual joystick + attack button for mobile/touch devices
class MobileControls {
  constructor() {
    this.joyX = 0;
    this.joyY = 0;
    this.attackPressed = false;
    this._attackConsumed = false;

    this._joystickActive = false;
    this._joyTouchId = null;
    this._joyOriginX = 0;
    this._joyOriginY = 0;
    this._maxRadius = 48;

    this._zone   = document.getElementById('joystick-zone');
    this._base   = document.getElementById('joystick-base');
    this._thumb  = document.getElementById('joystick-thumb');
    this._atkBtn = document.getElementById('attack-btn');

    this._bindEvents();
  }

  _bindEvents() {
    // Joystick
    this._zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._joyTouchId = t.identifier;
      const r = this._base.getBoundingClientRect();
      this._joyOriginX = r.left + r.width  / 2;
      this._joyOriginY = r.top  + r.height / 2;
      this._joystickActive = true;
      this._updateJoy(t.clientX, t.clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this._joystickActive) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          e.preventDefault();
          this._updateJoy(t.clientX, t.clientY);
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          this._resetJoy();
        }
      }
    });

    // Attack button
    this._atkBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.attackPressed = true;
      this._attackConsumed = false;
    }, { passive: false });

    this._atkBtn.addEventListener('touchend', () => {
      // attackPressed is consumed by one frame's input, then cleared
    });
  }

  _updateJoy(cx, cy) {
    let dx = cx - this._joyOriginX;
    let dy = cy - this._joyOriginY;
    const dist = Math.hypot(dx, dy);

    if (dist > this._maxRadius) {
      dx = (dx / dist) * this._maxRadius;
      dy = (dy / dist) * this._maxRadius;
    }

    this.joyX = dx / this._maxRadius;
    this.joyY = dy / this._maxRadius;

    this._thumb.style.transform =
      `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  _resetJoy() {
    this._joystickActive = false;
    this._joyTouchId = null;
    this.joyX = 0;
    this.joyY = 0;
    this._thumb.style.transform = 'translate(-50%, -50%)';
  }

  // Called once per game frame — returns input snapshot
  getInput() {
    const DEAD = 0.25;
    const atk = this.attackPressed && !this._attackConsumed;
    if (atk) this._attackConsumed = true;
    if (this._attackConsumed) this.attackPressed = false;

    return {
      left:   this.joyX < -DEAD,
      right:  this.joyX >  DEAD,
      up:     this.joyY < -DEAD,
      down:   this.joyY >  DEAD,
      attack: atk,
    };
  }

  show() { document.getElementById('mobile-controls').style.display = 'block'; }
  hide() { document.getElementById('mobile-controls').style.display = 'none'; }

  static isMobile() {
    return /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints > 1);
  }
}
