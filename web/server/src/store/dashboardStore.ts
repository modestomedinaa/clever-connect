import { create } from 'zustand';

export interface ClientConnection {
  id: string;
  username: string;
  ip: string;
  country: string;
  flag: string;
  protocol: string;
  connectedAt: string;
  duration: string;
  uploadSpeed: number; // MB/s
  downloadSpeed: number; // MB/s
  active: boolean;
}

interface BandwidthHistory {
  time: string;
  upload: number;
  download: number;
}

interface ServerState {
  cpu: number;
  memory: number;
  disk: number;
  activeConnectionsCount: number;
  clients: ClientConnection[];
  bandwidthHistory: BandwidthHistory[];
  totalBandwidth: { upload: number; download: number };
  logs: string[];
  wsConnected: boolean;
  initWebSocket: (token: string) => () => void;
  disconnectClient: (id: string) => Promise<boolean>;
  blockClient: (id: string) => Promise<boolean>;
  addClient: (username: string) => Promise<boolean>;
}

export const useServerStore = create<ServerState>((set, get) => {
  let ws: WebSocket | null = null;
  let mockInterval: any = null;

  return {
    cpu: 24,
    memory: 45,
    disk: 18,
    activeConnectionsCount: 4,
    clients: [
      { id: '1', username: 'salman_desktop', ip: '82.102.23.45', country: 'Iran', flag: '🇮🇷', protocol: 'VLESS-XTLS', connectedAt: '12:04:12', duration: '02h 35m', uploadSpeed: 2.4, downloadSpeed: 12.5, active: true },
      { id: '2', username: 'john_iphone', ip: '188.45.67.12', country: 'Germany', flag: '🇩🇪', protocol: 'Shadowsocks', connectedAt: '13:10:00', duration: '01h 29m', uploadSpeed: 1.1, downloadSpeed: 5.8, active: true },
      { id: '3', username: 'mary_macbook', ip: '95.12.89.200', country: 'United Kingdom', flag: '🇬🇧', protocol: 'Trojan', connectedAt: '14:02:15', duration: '37m', uploadSpeed: 0.8, downloadSpeed: 2.1, active: true },
      { id: '4', username: 'office_router', ip: '104.22.4.90', country: 'United States', flag: '🇺🇸', protocol: 'Wireguard', connectedAt: '08:12:45', duration: '06h 27m', uploadSpeed: 4.8, downloadSpeed: 18.2, active: true }
    ],
    bandwidthHistory: Array.from({ length: 30 }, (_, i) => ({
      time: new Date(Date.now() - (30 - i) * 2000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      upload: 15,
      download: 65
    })),
    totalBandwidth: { upload: 14205, download: 52402 }, // GB
    logs: [
      '[System] CleverConnect VPN Server Initialized.',
      '[System] Firewall rules generated. IP tables operational.',
      '[VLESS] Inbound port 443 active.',
      '[Shadowsocks] Inbound port 8388 active.',
      '[System] SQLite and MySQL connection handles initialized.'
    ],
    wsConnected: false,

    disconnectClient: async (id) => {
      try {
        const response = await fetch(`/api/clients/disconnect/${id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('cc_server_token')}`,
          }
        });
        // Remove client in UI mock anyway
        set((state) => ({
          clients: state.clients.filter((c) => c.id !== id),
          activeConnectionsCount: Math.max(0, state.activeConnectionsCount - 1),
          logs: [...state.logs.slice(-49), `[System] Forcefully disconnected client session: ${id}`]
        }));
        return true;
      } catch (err) {
        return false;
      }
    },

    blockClient: async (id) => {
      set((state) => ({
        clients: state.clients.filter((c) => c.id !== id),
        activeConnectionsCount: Math.max(0, state.activeConnectionsCount - 1),
        logs: [...state.logs.slice(-49), `[Firewall] Blocked & Blacklisted client: ${id}`]
      }));
      return true;
    },

    addClient: async (username) => {
      const newClient: ClientConnection = {
        id: String(get().clients.length + 1),
        username,
        ip: '127.0.0.1',
        country: 'Local',
        flag: '💻',
        protocol: 'VLESS',
        connectedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        duration: '0s',
        uploadSpeed: 0,
        downloadSpeed: 0,
        active: false
      };
      set((state) => ({
        clients: [...state.clients, newClient],
        logs: [...state.logs.slice(-49), `[Admin] Created new client credentials for username: ${username}`]
      }));
      return true;
    },

    initWebSocket: (token) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

      const connect = () => {
        try {
          ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            set({ wsConnected: true });
            set((state) => ({ logs: [...state.logs.slice(-49), '[System] Real-time server telemetry channel active.'] }));
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'telemetry') {
                set((state) => {
                  const newHistory = [
                    ...state.bandwidthHistory.slice(1),
                    {
                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                      upload: data.uploadSpeed,
                      download: data.downloadSpeed
                    }
                  ];
                  return {
                    cpu: data.cpu,
                    memory: data.memory,
                    disk: data.disk,
                    activeConnectionsCount: data.connsCount,
                    bandwidthHistory: newHistory,
                    totalBandwidth: {
                      upload: data.totalUpload,
                      download: data.totalDownload
                    },
                    clients: data.clients || state.clients
                  };
                });
              } else if (data.type === 'log') {
                set((state) => ({ logs: [...state.logs.slice(-49), data.message] }));
              }
            } catch (err) {
              // Not JSON or structural error
            }
          };

          ws.onclose = () => {
            set({ wsConnected: false });
            set((state) => ({ logs: [...state.logs.slice(-49), '[Warning] Closed connection. Running on local simulator.'] }));
            setTimeout(() => {
              connect();
            }, 5000);
          };
        } catch (e) {
          set({ wsConnected: false });
        }
      };

      connect();

      // Fallback local simulator
      mockInterval = setInterval(() => {
        if (!get().wsConnected) {
          set((state) => {
            const cpuVal = Math.floor(Math.random() * 20) + 15;
            const memVal = 44 + Math.floor(Math.random() * 4) - 2;
            const upSpeed = state.clients.reduce((acc, c) => acc + (c.active ? c.uploadSpeed : 0), 0) + Math.random() * 2;
            const downSpeed = state.clients.reduce((acc, c) => acc + (c.active ? c.downloadSpeed : 0), 0) + Math.random() * 5;

            const newHistory = [
              ...state.bandwidthHistory.slice(1),
              {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                upload: parseFloat(upSpeed.toFixed(1)),
                download: parseFloat(downSpeed.toFixed(1))
              }
            ];

            const updatedClients = state.clients.map((c) => {
              if (c.active) {
                return {
                  ...c,
                  uploadSpeed: parseFloat((Math.random() * 3 + 0.2).toFixed(1)),
                  downloadSpeed: parseFloat((Math.random() * 15 + 1).toFixed(1))
                };
              }
              return c;
            });

            return {
              cpu: cpuVal,
              memory: memVal,
              clients: updatedClients,
              bandwidthHistory: newHistory,
              totalBandwidth: {
                upload: state.totalBandwidth.upload + 0.1,
                download: state.totalBandwidth.download + 0.5
              }
            };
          });
        }
      }, 2000);

      return () => {
        if (ws) {
          ws.close();
          ws = null;
        }
        if (mockInterval) {
          clearInterval(mockInterval);
          mockInterval = null;
        }
      };
    }
  };
});
