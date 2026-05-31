import React from 'react';
import { FiWifi, FiSend, FiCornerDownLeft, FiRepeat } from 'react-icons/fi';
import { useDashboardStore } from '../../store/dashboardStore';

export const ConnectionStateCard: React.FC = () => {
  const { connectionState, selectedNode, totalUsage } = useDashboardStore();
  const isConnected = connectionState === 'connected';

  return (
    <div className="vcard">
      <div className="vcard__chip-row">
        <FiWifi className="chip-wifi" />
        <div className="chip-dots"><span /><span /></div>
      </div>

      <div className="vcard__label">Available Bandwidth</div>
      <div className="vcard__balance">
        {isConnected ? `${((totalUsage.download + totalUsage.upload) / 1024).toFixed(2)} GB` : '0.00 MB'}
        <span className="vcard__badge">{isConnected ? 'Active' : 'Offline'}</span>
      </div>

      <div className="vcard__detail">
        <span className="vcard__detail-label">Tunnel Gateway</span>
        <span className="vcard__detail-value">{selectedNode ? selectedNode.ip : '•••• •••• •••• ••••'}</span>
      </div>
      <div className="vcard__detail">
        <span className="vcard__detail-label">Active Protocol</span>
        <span className="vcard__detail-value">{isConnected ? 'VLESS-XTLS' : 'NONE'}</span>
      </div>
      <div className="vcard__detail">
        <span className="vcard__detail-label">Ping Latency</span>
        <span className="vcard__detail-value">{selectedNode ? `${selectedNode.ping} ms` : '– – –'}</span>
      </div>

      <div className="vcard__actions">
        <button className="vcard__action">
          <FiSend className="action-icon" />
          Quick Connect
        </button>
        <button className="vcard__action">
          <FiCornerDownLeft className="action-icon" />
          Disconnect
        </button>
        <button className="vcard__action">
          <FiRepeat className="action-icon" />
          Switch
        </button>
      </div>
    </div>
  );
};
