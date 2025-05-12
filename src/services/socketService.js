import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connected = false;
    this.connectionCallbacks = [];
    this.disconnectionCallbacks = [];
  }

  connect(url = process.env.REACT_APP_API_URL || 'http://localhost:5000') {
    // Don't try to connect if already connected
    if (this.socket && this.connected) {
      console.log('Socket already connected');
      return;
    }

    console.log(`Connecting to WebSocket server at ${url}`);
    
    // CRITICAL: Add withCredentials & proper CORS options for cross-origin connections
    this.socket = io(url, {
      transports: ['websocket', 'polling'],  // Allow both for better reliability
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      withCredentials: false,  // Important for cross-origin requests
      extraHeaders: {
        "Access-Control-Allow-Origin": "*"
      }
    });
    
    console.log('WebSocket connection options set to force WebSocket transport');
    
    // Force close any existing connections to ensure clean state
    if (window.existingSocket) {
      try {
        window.existingSocket.disconnect();
      } catch (e) {}
    }
    
    // Store socket in global space for debugging
    window.existingSocket = this.socket;

    // Handle connection
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      this.connected = true;
      this.connectionCallbacks.forEach(callback => callback());
    });

    // Handle disconnection
    this.socket.on('disconnect', (reason) => {
      console.log(`Disconnected from WebSocket server: ${reason}`);
      this.connected = false;
      this.disconnectionCallbacks.forEach(callback => callback(reason));
    });

    // Handle connection error
    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.connected = false;
    });
  }

  disconnect() {
    if (this.socket) {
      console.log('Disconnecting from WebSocket server');
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  // Subscribe to device data
  subscribeToDevice(deviceId) {
    if (!this.socket || !this.connected) {
      console.error('Cannot subscribe: Socket not connected');
      return;
    }

    console.log(`Subscribing to device: ${deviceId}`);
    this.socket.emit('subscribe', deviceId);
  }

  // Subscribe to plant data
  subscribeToPlant(plantId) {
    if (!this.socket || !this.connected) {
      console.error('Cannot subscribe: Socket not connected');
      return;
    }

    console.log(`Subscribing to plant: ${plantId}`);
    this.socket.emit('subscribePlant', plantId);
  }

  // Listen for telemetry data
  onTelemetry(callback, device) {
    if (!this.socket) {
      console.error('❌ CRITICAL ERROR: Socket not initialized - trying to reconnect');
      this.connect();
      return;
    }

    if (!this.listeners.has('telemetry')) {
      this.listeners.set('telemetry', []);
    }

    // Setup device-specific channel listener if provided
    if (device) {
      const deviceEventName = `telemetry-${device}`;
      console.log(`🎯 Setting up targeted listener for ${deviceEventName}`);
      
      this.socket.on(deviceEventName, (data) => {
        console.log(`📡 Received specific telemetry for ${device}: ${JSON.stringify(data).substring(0, 100)}...`);
        callback(data);
      });
    }
    
    // Setup ESP32_04 dedicated listener
    if (device === 'esp32_04') {
      // Also listen on special ESP32_04 broadcast channel
      this.socket.on('telemetry_esp32_04', (data) => {
        console.log(`🔵 Received data on ESP32_04 dedicated channel: ${JSON.stringify(data).substring(0, 100)}...`);
        callback(data);
      });
      
      // Listen on global channel but filter for esp32_04
      this.socket.on('telemetry', (data) => {
        if (data && (data.device === 'esp32_04' || data.deviceId === 'esp32_04')) {
          console.log(`🌐 Received ESP32_04 data from global channel: ${JSON.stringify(data).substring(0, 100)}...`);
          callback(data);
        }
      });
      
      // Force emit a test message to ensure connection is working
      setTimeout(() => {
        console.log('🔄 Emitting test ping for ESP32_04 subscription');
        this.socket.emit('test_subscription', { device: 'esp32_04' });
      }, 1000);
    } else {
      // For all other devices, just use the generic telemetry channel
      this.socket.on('telemetry', (data) => {
        const deviceId = data?.device || data?.deviceId || 'unknown';
        console.log(`📡 Received telemetry data for device: ${deviceId}`);
        callback(data);
      });
    }
    
    this.listeners.get('telemetry').push(callback);
  }

  // Listen for alarm data
  onAlarm(callback) {
    if (!this.socket) {
      console.error('Cannot listen: Socket not initialized');
      return;
    }

    if (!this.listeners.has('alarm')) {
      this.listeners.set('alarm', []);
      this.socket.on('alarm', (data) => {
        console.log('Received alarm data:', data);
        const callbacks = this.listeners.get('alarm') || [];
        callbacks.forEach(cb => cb(data));
      });
    }

    this.listeners.get('alarm').push(callback);
  }

  // Listen for alarm notifications
  onAlarmNotification(callback) {
    if (!this.socket) {
      console.error('Cannot listen: Socket not initialized');
      return;
    }

    if (!this.listeners.has('alarm_notification')) {
      this.listeners.set('alarm_notification', []);
      this.socket.on('alarm_notification', (data) => {
        console.log('Received alarm notification:', data);
        const callbacks = this.listeners.get('alarm_notification') || [];
        callbacks.forEach(cb => cb(data));
      });
    }

    this.listeners.get('alarm_notification').push(callback);
  }

  // Remove a specific callback from a listener
  removeListener(event, callback) {
    if (!this.listeners.has(event)) return;

    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  // Add a connection callback
  onConnect(callback) {
    this.connectionCallbacks.push(callback);
    // If already connected, call the callback immediately
    if (this.connected) {
      callback();
    }
  }

  // Add a disconnection callback
  onDisconnect(callback) {
    this.disconnectionCallbacks.push(callback);
  }

  // Remove a connection callback
  removeConnectCallback(callback) {
    const index = this.connectionCallbacks.indexOf(callback);
    if (index !== -1) {
      this.connectionCallbacks.splice(index, 1);
    }
  }

  // Remove a disconnection callback
  removeDisconnectCallback(callback) {
    const index = this.disconnectionCallbacks.indexOf(callback);
    if (index !== -1) {
      this.disconnectionCallbacks.splice(index, 1);
    }
  }

  // Check if socket is connected
  isConnected() {
    return this.connected;
  }
}

// Create a singleton instance
const socketService = new SocketService();

export default socketService;
