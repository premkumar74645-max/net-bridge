export const bluetoothManager = {
  async discoverDevices() {
    // Mocking device discovery
    return new Promise<string[]>((resolve) => {
      setTimeout(() => {
        resolve(['Pixel 7 Pro', 'iPhone 15', 'Galaxy S24', 'NetBridge-Node-01']);
      }, 1500);
    });
  },

  async sendViaBluetooth(deviceId: string, data: any) {
    console.log(`Sending to ${deviceId} via Bluetooth...`, data);
    return new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 1000);
    });
  }
};

export const quickShareManager = {
  async discoverDevices() {
    return new Promise<string[]>((resolve) => {
      setTimeout(() => {
        resolve(['MacBook Pro', 'Office-Printer', 'Nearby-User-42']);
      }, 1200);
    });
  },

  async sendViaWiFiDirect(deviceId: string, data: any) {
    console.log(`Sending to ${deviceId} via WiFi Direct...`, data);
    return new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(true), 800);
    });
  }
};
