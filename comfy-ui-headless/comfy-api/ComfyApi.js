const EventEmitter = require('events');
const WebSocket = require('ws');

const COMFY_ADDRESS = '127.0.0.1:8188';

class ComfyApi extends EventEmitter {
  #registered = new Set();
  #address = COMFY_ADDRESS;

  clientId = 'sidecar';

  constructor() {
    super();
  }

  on(type, callback, options) {
    super.on(type, callback, options);
    this.#registered.add(type);
  }

  #pollQueue() {
    setInterval(async () => {
      try {
        const resp = await fetch(`http://${this.#address}/prompt`);
        const status = await resp.json();
        this.emit('status', status);
      } catch (error) {
        this.emit('status', null);
      }
    }, 1000);
  }

  #createSocket(isReconnect) {
    if (this.socket) {
      return;
    }

    let opened = false;

    this.socket = new WebSocket(
      `ws://${this.#address}/ws${'?clientId=' + this.clientId}`
    );

    this.socket.on('open', () => {
      opened = true;
      if (isReconnect) {
        this.emit('reconnected');
      }
    });

    this.socket.on('error', () => {
      if (this.socket) this.socket.close();
      if (!isReconnect && !opened) {
        this.#pollQueue();
      }
    });

    this.socket.on('close', () => {
      setTimeout(() => {
        this.socket = null;
        this.#createSocket(true);
      }, 300);
      if (opened) {
        this.emit('status', null);
        this.emit('reconnecting');
      }
    });

    this.socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        switch (msg.type) {
          case 'status':
            if (msg.data.sid) {
              this.clientId = msg.data.sid;
            }
            this.emit('status', msg.data.status);
            break;
          case 'progress':
            this.emit('progress', msg.data);
            break;
          case 'executing':
            this.emit('executing', msg.data.node);
            break;
          case 'executed':
            this.emit('executed', msg.data);
            break;
          default:
            if (this.#registered.has(msg.type)) {
              this.emit(msg.type, msg.data);
            } else {
              throw new Error('Unknown message type');
            }
        }
      } catch (error) {
        console.warn('Unhandled message:', data);
      }
    });
  }

  init() {
    this.#createSocket();
  }

  async getExtensions() {
    const resp = await fetch('/extensions', { cache: 'no-store' });
    return await resp.json();
  }

  async getEmbeddings() {
    const resp = await fetch('/embeddings', { cache: 'no-store' });
    return await resp.json();
  }

  async getNodeDefs() {
    const resp = await fetch('object_info', { cache: 'no-store' });
    return await resp.json();
  }

  async queuePrompt(prompt) {
    const body = {
      client_id: this.clientId,
      ...prompt,
    };

    const res = await fetch(`http://${this.#address}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status !== 200) {
      throw {
        response: await res.text(),
      };
    }

    const json = await res.json();

    console.log('Prompt queued', json);
  }

  async getItems(type) {
    if (type === 'queue') {
      return this.getQueue();
    }
    return this.getHistory();
  }
}

module.exports = {
  ComfyApi,
  COMFY_ADDRESS,
};
