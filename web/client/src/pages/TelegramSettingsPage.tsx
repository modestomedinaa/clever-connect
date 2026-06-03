import React, { useState, useEffect, useCallback } from 'react';
import { FiSend, FiPlay, FiSquare, FiCheck, FiAlertCircle, FiRefreshCw, FiUsers, FiFile, FiSettings, FiZap, FiEye, FiEyeOff, FiCpu, FiActivity } from 'react-icons/fi';
import { useAuthStore } from '../store/authStore';

interface TelegramConfig {
  ID?: number;
  bot_token: string;
  admin_user_ids: string;
  welcome_message: string;
  polling_interval: number;
  max_file_size: number;
  enable_file_sharing: boolean;
  enable_notifications: boolean;
  is_active: boolean;
}

interface BotStats {
  running: boolean;
  uptime_seconds: number;
  workers: number;
  messages_processed: number;
  commands_processed: number;
  files_sent: number;
  errors: number;
  bot_username: string;
  bot_id: number;
}

const defaultConfig: TelegramConfig = {
  bot_token: '', admin_user_ids: '', welcome_message: '👋 Welcome to *CleverConnect Bot*, {name}!\n\nUse /help to see available commands.',
  polling_interval: 10, max_file_size: 50, enable_file_sharing: true, enable_notifications: true, is_active: false,
};

export const TelegramSettingsPage: React.FC = () => {
  const { token } = useAuthStore();
  const [config, setConfig] = useState<TelegramConfig>(defaultConfig);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [maskedToken, setMaskedToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; bot_username?: string; error?: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState('');

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/config', { headers });
      const data = await res.json();
      if (data.config) { setConfig(data.config); setMaskedToken(data.masked_token || ''); }
      setRunning(!!data.running);
      if (data.stats) setStats(data.stats);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Poll status every 5s when running
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch('/api/telegram/status', { headers });
        const data = await res.json();
        setRunning(!!data.running);
        if (data.stats) setStats(data.stats);
      } catch (_) {}
    }, 5000);
    return () => clearInterval(iv);
  }, [running, token]);

  const saveConfig = async () => {
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch('/api/telegram/config', { method: 'POST', headers, body: JSON.stringify(config) });
      const data = await res.json();
      setSaveMsg(data.status === 'success' ? '✅ Configuration saved!' : `❌ ${data.error}`);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e: any) { setSaveMsg('❌ ' + e.message); }
    setSaving(false);
  };

  const testConnection = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST', headers, body: JSON.stringify({ bot_token: config.bot_token }) });
      setTestResult(await res.json());
    } catch (e: any) { setTestResult({ success: false, error: e.message }); }
    setTesting(false);
  };

  const toggleBot = async () => {
    setStarting(true);
    const endpoint = running ? '/api/telegram/stop' : '/api/telegram/start';
    try {
      const res = await fetch(endpoint, { method: 'POST', headers });
      const data = await res.json();
      if (data.status === 'success') { setRunning(!running); await fetchConfig(); }
      else setSaveMsg(`❌ ${data.error}`);
    } catch (e: any) { setSaveMsg('❌ ' + e.message); }
    setStarting(false);
  };

  const formatUptime = (s: number) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-brand-muted)' }}>Loading Telegram configuration...</div>;

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-brand-border)', background: 'var(--color-brand-bg)', color: 'var(--color-brand-heading)', fontSize: 13, outline: 'none', transition: 'border-color 0.2s' };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-brand-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-brand-heading)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <FiSend style={{ color: 'var(--color-brand)' }} /> Telegram Bot Core
        </h1>
        <p style={{ fontSize: 12, color: 'var(--color-brand-text)', margin: '4px 0 0' }}>Configure and manage the Telegram bot engine. All settings are persisted in the database.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Bot Token Card */}
          <div className="g-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <FiZap style={{ color: 'var(--color-brand)', fontSize: 18 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-brand-heading)' }}>Bot Token & Connection</span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Bot Token</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type={showToken ? 'text' : 'password'} value={config.bot_token} onChange={e => setConfig({ ...config, bot_token: e.target.value })} placeholder={maskedToken || 'Enter your Telegram bot token from @BotFather'} style={inputStyle} />
                  <button onClick={() => setShowToken(!showToken)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-brand-muted)' }}>
                    {showToken ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                  </button>
                </div>
                <button className="btn btn--sm btn--primary" onClick={testConnection} disabled={testing || !config.bot_token} style={{ whiteSpace: 'nowrap', minWidth: 100 }}>
                  {testing ? <FiRefreshCw size={13} className="spin-icon" /> : <FiCheck size={13} />} {testing ? 'Testing...' : 'Test'}
                </button>
              </div>
              {testResult && (
                <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, fontSize: 12, background: testResult.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${testResult.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: testResult.success ? '#10b981' : '#ef4444' }}>
                  {testResult.success ? `✅ Connected! Bot: @${testResult.bot_username}` : `❌ ${testResult.error}`}
                </div>
              )}
            </div>
          </div>

          {/* Admin IDs Card */}
          <div className="g-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <FiUsers style={{ color: 'var(--color-brand)', fontSize: 18 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-brand-heading)' }}>Admin Configuration</span>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Admin Telegram User IDs</label>
              <input type="text" value={config.admin_user_ids} onChange={e => setConfig({ ...config, admin_user_ids: e.target.value })} placeholder="Comma-separated IDs (e.g., 123456789,987654321)" style={inputStyle} />
              <p style={{ fontSize: 10, color: 'var(--color-brand-muted)', margin: '6px 0 0' }}>Use /myid command in the bot to get your Telegram user ID. Only these users can access admin commands.</p>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Welcome Message</label>
              <textarea value={config.welcome_message} onChange={e => setConfig({ ...config, welcome_message: e.target.value })} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }} placeholder="Markdown supported. Use {name} and {username} as placeholders." />
            </div>
          </div>

          {/* Engine Settings Card */}
          <div className="g-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <FiSettings style={{ color: 'var(--color-brand)', fontSize: 18 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-brand-heading)' }}>Engine Settings</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Polling Interval (seconds)</label>
                <input type="number" min={1} max={60} value={config.polling_interval} onChange={e => setConfig({ ...config, polling_interval: parseInt(e.target.value) || 10 })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Max File Size (MB)</label>
                <input type="number" min={1} max={2000} value={config.max_file_size} onChange={e => setConfig({ ...config, max_file_size: parseInt(e.target.value) || 50 })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {[
                { key: 'enable_file_sharing' as const, label: 'File Sharing', desc: 'Allow admins to browse and send server files via bot', icon: <FiFile size={14} /> },
                { key: 'enable_notifications' as const, label: 'Notifications', desc: 'Send system notifications to admins via bot', icon: <FiSend size={14} /> },
              ].map(toggle => (
                <div key={toggle.key} onClick={() => setConfig({ ...config, [toggle.key]: !config[toggle.key] })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, border: `1px solid ${config[toggle.key] ? 'var(--color-brand)' : 'var(--color-brand-border)'}`, background: config[toggle.key] ? 'var(--color-brand-light)' : 'var(--color-brand-card)', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: config[toggle.key] ? 'var(--color-brand)' : 'var(--color-brand-muted)' }}>{toggle.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand-heading)' }}>{toggle.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-brand-text)' }}>{toggle.desc}</div>
                    </div>
                  </div>
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: config[toggle.key] ? 'var(--color-brand)' : 'var(--color-brand-border)', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: config[toggle.key] ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn btn--primary" onClick={saveConfig} disabled={saving} style={{ minWidth: 160 }}>
              {saving ? 'Saving...' : '💾 Save Configuration'}
            </button>
            {saveMsg && <span style={{ fontSize: 12, color: saveMsg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{saveMsg}</span>}
          </div>
        </div>

        {/* Right Column — Status Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Bot Control Card */}
          <div className="g-card" style={{ position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <FiActivity style={{ color: running ? '#10b981' : 'var(--color-brand-muted)', fontSize: 18 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-brand-heading)' }}>Bot Engine Control</span>
            </div>

            {/* Status Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: running ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.04)', border: `1px solid ${running ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)'}` }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: running ? '#10b981' : '#ef4444', boxShadow: running ? '0 0 8px rgba(16,185,129,0.5)' : 'none', animation: running ? 'pulse 2s infinite' : 'none' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: running ? '#10b981' : '#ef4444' }}>{running ? 'Online' : 'Offline'}</div>
                {running && stats && <div style={{ fontSize: 10, color: 'var(--color-brand-text)' }}>@{stats.bot_username} • {formatUptime(stats.uptime_seconds)}</div>}
              </div>
            </div>

            <button className={`btn btn--sm ${running ? '' : 'btn--primary'}`} onClick={toggleBot} disabled={starting || (!running && !config.bot_token)} style={{ width: '100%', padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: running ? 'rgba(239,68,68,0.08)' : undefined, color: running ? '#ef4444' : undefined, border: running ? '1px solid rgba(239,68,68,0.3)' : undefined }}>
              {starting ? <FiRefreshCw size={14} className="spin-icon" /> : running ? <FiSquare size={14} /> : <FiPlay size={14} />}
              {starting ? 'Processing...' : running ? 'Stop Bot Engine' : 'Start Bot Engine'}
            </button>
          </div>

          {/* Live Stats Card */}
          {running && stats && (
            <div className="g-card animate-slide-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <FiCpu style={{ color: 'var(--color-brand)', fontSize: 16 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-brand-heading)' }}>Live Engine Metrics</span>
              </div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Workers (CPU Cores)', stats.workers],
                    ['Messages Processed', stats.messages_processed],
                    ['Commands Processed', stats.commands_processed],
                    ['Files Sent', stats.files_sent],
                    ['Errors', stats.errors],
                    ['Uptime', formatUptime(stats.uptime_seconds)],
                  ].map(([label, val], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-brand-border)' }}>
                      <td style={{ padding: '7px 0', color: 'var(--color-brand-text)', fontWeight: 600 }}>{label}</td>
                      <td style={{ padding: '7px 0', textAlign: 'right', color: 'var(--color-brand-heading)', fontFamily: 'monospace', fontWeight: 700 }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick Help */}
          <div className="g-card" style={{ fontSize: 11, color: 'var(--color-brand-text)', lineHeight: 1.6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand-heading)', marginBottom: 10 }}>
              <FiAlertCircle size={14} style={{ color: 'var(--color-brand)', verticalAlign: 'middle', marginRight: 6 }} />Quick Guide
            </div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Create a bot via <strong>@BotFather</strong> on Telegram</li>
              <li>Paste the token above and click <strong>Test</strong></li>
              <li>Add your Telegram user ID as admin</li>
              <li>Save configuration and <strong>Start</strong> the engine</li>
              <li>Use <code>/files</code> in the bot to browse server files</li>
            </ol>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .spin-icon { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
