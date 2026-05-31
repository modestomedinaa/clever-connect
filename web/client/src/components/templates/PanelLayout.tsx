import React, { useState } from 'react';
import { Sidebar } from '../organisms/Sidebar';
import { FiHome, FiShare2, FiUserPlus } from 'react-icons/fi';

interface PanelLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  breadcrumbs: string[];
}

export const PanelLayout: React.FC<PanelLayoutProps> = ({ children, activeTab, setActiveTab, breadcrumbs }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`panel-layout ${isCollapsed ? 'panel-layout--collapsed' : ''}`}>
      {/* Sidebar fits on the left beige canvas */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed} 
      />
      
      {/* The main workspace container is styled as the giant nested white card */}
      <div className="panel-layout__main-frame">
        {/* Inside the white card, we have the topbar */}
        <div className="panel-layout__frame-topbar">
          <div className="panel-layout__breadcrumb">
            <FiHome className="bc-icon" />
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={i}>
                <span className="bc-sep">/</span>
                <span className={i === breadcrumbs.length - 1 ? 'bc-current' : ''}>{bc}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="panel-layout__actions">
            <button className="btn btn--sm"><FiShare2 size={12} /> Share</button>
            <button className="btn btn--sm"><FiUserPlus size={12} /> Invite</button>
          </div>
        </div>

        {/* The active page content goes here */}
        <div className="panel-layout__frame-content">
          {children}
        </div>
      </div>
    </div>
  );
};
