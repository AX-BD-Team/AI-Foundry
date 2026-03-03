import React from 'react';
import { Sidebar } from './Sidebar';
import { useOrganization } from '@/contexts/OrganizationContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { organizationId } = useOrganization();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main key={organizationId} className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
};
