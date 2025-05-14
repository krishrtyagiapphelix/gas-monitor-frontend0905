import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this.activeListeners = new Map(); // Track active listeners to prevent duplicates
    this.pendingSubscriptions = new Set(); // Track device subscriptions that need to be processed on connect
    this.connectionAttempts = 0;
    this.connectionCallbacks = [];
    this.disconnectionCallbacks = [];
  }

  connect(url = process.env.REACT_APP_API_URL || 'http://localhost:5000') {
    // Clean up any existing socket connection first
    if (this.socket) {
      try {
        console.log('Cleaning up existing socket connection');
        this.socket.disconnect();
        this.socket.removeAllListeners();
        this.socket = null;
      } catch (err) {
        console.error('Error cleaning up socket:', err);
      }
    }

    console.log(`Connecting to WebSocket server at ${url}`);
    
    // CRITICAL: Add withCredentials & proper CORS options for cross-origin connections
    this.socket = io(url, {
      transports: ['websocket', 'polling'],  // Allow both for better reliability
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      withCredentials: false,  // Important for cross-origin requests
      reconnection: true,      // Enable auto-reconnection
      autoConnect: true,       // Connect on instantiation
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
      console.log('🌐 Connected to WebSocket server');
      this.connected = true;
      
      // Process any pending subscriptions
      if (this.pendingSubscriptions && this.pendingSubscriptions.size > 0) {
        console.log(`📨 Processing ${this.pendingSubscriptions.size} pending subscriptions`);
        
        this.pendingSubscriptions.forEach(sub => {
          if (sub.startsWith('plant-')) {
            const plantId = sub.replace('plant-', '');
            console.log(`🏭 Resubscribing to plant: ${plantId}`);
            this.socket.emit('subscribe-plant', plantId);
          } else {
            console.log(`📡 Resubscribing to device: ${sub}`);
            this.socket.emit('subscribe', sub);
          }
        });
      }
      
      // Process any pending listeners
      ['_pending_alarm', '_pending_alarm_notification', '_pending_telemetry'].forEach(pendingType => {
        const eventType = pendingType.replace('_pending_', '');
        
        if (this.listeners.has(pendingType) && this.listeners.get(pendingType).length > 0) {
          console.log(`📨 Processing ${this.listeners.get(pendingType).length} pending ${eventType} listeners`);
          
          // Setup actual listeners and call their callbacks
          this.listeners.get(pendingType).forEach(cb => {
            if (eventType === 'alarm') this.onAlarm(cb);
            else if (eventType === 'alarm_notification') this.onAlarmNotification(cb);
            else if (eventType === 'telemetry') this.onTelemetry(cb);
          });
          
          // Clear pending listeners
          this.listeners.delete(pendingType);
        }
      });
      
      // Notify connection callbacks
      this.connectionCallbacks.forEach(callback => {
        try {
          callback();
        } catch (err) {
          console.error('❌ Error in connection callback:', err);
        }
      });
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
    if (!deviceId) {
      console.error('Cannot subscribe to null/undefined device');
      return;
    }

    // Save to pending subscriptions to reapply on reconnection
    this.pendingSubscriptions = this.pendingSubscriptions || new Set();
    this.pendingSubscriptions.add(deviceId);

    if (!this.socket || !this.connected) {
      console.warn(`Socket not connected. Added ${deviceId} to pending subscriptions`);
      this.connect(); // Try to connect
      return;
    }

    console.log(`Subscribing to device: ${deviceId}`);
    this.socket.emit('subscribe', deviceId);
  }

  // Listen for telemetry data for a specific plant
  subscribeToPlant(plantId) {
    if (!plantId && plantId !== 0) {
      console.error('Cannot subscribe to null/undefined plant');
      return;
    }

    // Save to pending subscriptions to reapply on reconnection
    this.pendingSubscriptions.add(`plant-${plantId}`);

    if (!this.socket || !this.connected) {
      console.warn(`Socket not connected. Added plant ${plantId} to pending subscriptions`);
      this.connect(); // Try to connect
      return;
    }
    
    console.log(`Subscribing to plant: ${plantId}`);
    this.socket.emit('subscribe-plant', plantId);
  }

  // Keep track of active listeners to prevent duplicates
  activeListeners = new Map();

  // Listen for telemetry data
  onTelemetry(callback, device) {
    if (!this.socket) {
      console.error('❌ CRITICAL ERROR: Socket not initialized - trying to reconnect');
      this.connect();
      
      // Return a dummy cleanup function since we couldn't set up the actual listener
      return () => {};
    }
    
    // Check if socket is actually connected, if not, reconnect
    if (!this.isConnected()) {
      console.warn('⚠️ Socket exists but is not connected - reconnecting...');
      this.connect();
    }

    if (!this.listeners.has('telemetry')) {
      this.listeners.set('telemetry', []);
    }

    // Clean up any existing listeners for telemetry to prevent duplicates
    this.removeAllTelemetryListeners();

    // Generate a unique key for this callback-device combination
    const listenerKey = device ? `telemetry-${device}` : 'telemetry-global';
    
    // Store this callback with its key for later cleanup
    this.activeListeners.set(listenerKey, callback);
    
    console.log(`🎯 Setting up single telemetry listener for ${device || 'global'}`);
    
    // Just use one listener for the global telemetry channel with device filtering
    this.socket.on('telemetry', (data) => {
      const deviceId = data?.device || data?.deviceId || 'unknown';
      
      // Only process data for this device if a specific device was requested
      if (!device || deviceId === device || 
          (data && (deviceId.includes(device) || (device && device.includes(deviceId))))) {
        console.log(`📡 Received telemetry data for device: ${deviceId}`);
        // Add a unique ID to prevent duplicate processing
        data._uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        callback(data);
      }
    });
    
    // Add to the general listeners map
    this.listeners.get('telemetry').push(callback);

    // Return function to remove this specific listener
    return () => {
      this.removeListener('telemetry', callback);
      if (this.activeListeners.has(listenerKey)) {
        this.activeListeners.delete(listenerKey);
      }
      // Remove socket listener
      this.socket.off('telemetry');
    };
  }
  
  // Helper to remove all telemetry-related listeners
  removeAllTelemetryListeners() {
    // Remove all socket listeners for telemetry events
    if (this.socket) {
      this.socket.off('telemetry');
      this.socket.off('telemetry_esp32_04');
      
      // Clean up any device-specific listeners
      this.activeListeners.forEach((_, key) => {
        if (key.startsWith('telemetry-')) {
          const deviceId = key.split('telemetry-')[1];
          this.socket.off(`telemetry-${deviceId}`);
        }
      });
    }
  }

  // Listen for alarm data
  onAlarm(callback) {
    if (!this.socket) {
      console.error('❌ Cannot listen: Socket not initialized');
      this.connect(); // Auto-connect if needed
      
      // Store the callback to connect later when socket is available
      if (!this.listeners.has('_pending_alarm')) {
        this.listeners.set('_pending_alarm', []);
      }
      this.listeners.get('_pending_alarm').push(callback);
      return;
    }

    if (!this.listeners.has('alarm')) {
      this.listeners.set('alarm', []);
      
      // Add event listener to socket
      this.socket.on('alarm', (data) => {
        console.log('📥 Received alarm data:', data);
        // Add a unique timestamp to prevent duplicate processing
        data._receivedAt = Date.now();
        data._uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const callbacks = this.listeners.get('alarm') || [];
        callbacks.forEach(cb => {
          try {
            cb(data);
          } catch (err) {
            console.error('❌ Error in alarm callback:', err);
          }
        });
      });
      
      console.log('✅ Registered socket listener for "alarm" events');
    }

    // Add this callback to the listeners
    this.listeners.get('alarm').push(callback);
    console.log(`👂 Added new alarm listener (total: ${this.listeners.get('alarm').length})`);
    
    // Return a cleanup function
    return () => this.removeListener('alarm', callback);
  }

  // Listen for alarm notifications
  onAlarmNotification(callback) {
    if (!this.socket) {
      console.error('❌ Cannot listen: Socket not initialized');
      this.connect(); // Auto-connect if needed
      
      // Store the callback to connect later when socket is available
      if (!this.listeners.has('_pending_alarm_notification')) {
        this.listeners.set('_pending_alarm_notification', []);
      }
      this.listeners.get('_pending_alarm_notification').push(callback);
      return;
    }

    if (!this.listeners.has('alarm_notification')) {
      this.listeners.set('alarm_notification', []);
      
      // Add event listener to socket
      this.socket.on('alarm_notification', (data) => {
        console.log('🔔 Received alarm notification:', data);
        // Add a unique timestamp to prevent duplicate processing
        data._receivedAt = Date.now();
        data._uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const callbacks = this.listeners.get('alarm_notification') || [];
        callbacks.forEach(cb => {
          try {
            cb(data);
          } catch (err) {
            console.error('❌ Error in alarm_notification callback:', err);
          }
        });
      });
      
      console.log('✅ Registered socket listener for "alarm_notification" events');
    }

    // Add this callback to the listeners
    this.listeners.get('alarm_notification').push(callback);
    console.log(`👂 Added new alarm_notification listener (total: ${this.listeners.get('alarm_notification').length})`);
    
    // Return a cleanup function
    return () => this.removeListener('alarm_notification', callback);
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

  // Check if socket is connected - more robust check
  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }
}

// Create a singleton instance
const socketService = new SocketService();

// Auto-connect when the service is imported
socketService.connect();

// Setup auto-reconnect on window focus
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    if (!socketService.isConnected()) {
      console.log('Window focused - reconnecting socket if needed');
      socketService.connect();
    }
  });
}

export default socketService;
