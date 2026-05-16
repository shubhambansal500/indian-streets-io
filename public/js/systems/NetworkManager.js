// NetworkManager — wraps Socket.io, exposes simple event bus
class NetworkManager {
  constructor() {
    this.socket    = null;
    this.myId      = null;
    this._handlers = {};
    this.connected = false;
    this.latency   = 0;
    this._pingStart = 0;
  }

  connect() {
    this.socket = io({ transports: ['websocket'] });

    this.socket.on('connect', () => {
      this.connected = true;
      this.myId = this.socket.id;
      this._emit('connected', { id: this.myId });
      this._startPing();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this._emit('disconnected', {});
    });

    this.socket.on('joined',          (d) => this._emit('joined', d));
    this.socket.on('roomFull',        ()  => this._emit('roomFull', {}));
    this.socket.on('gameState',       (d) => this._emit('gameState', d));
    this.socket.on('pong',            ()  => { this.latency = Date.now() - this._pingStart; });
  }

  join(name) {
    if (!this.connected) return;
    this.socket.emit('join', { name });
  }

  sendInput(input) {
    if (!this.connected) return;
    this.socket.emit('input', input);
  }

  on(event, fn) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(fn);
  }

  off(event, fn) {
    if (!this._handlers[event]) return;
    this._handlers[event] = this._handlers[event].filter(h => h !== fn);
  }

  _emit(event, data) {
    (this._handlers[event] || []).forEach(fn => fn(data));
  }

  _startPing() {
    setInterval(() => {
      this._pingStart = Date.now();
      this.socket.emit('ping');
    }, 3000);
  }
}

// Singleton
const network = new NetworkManager();
