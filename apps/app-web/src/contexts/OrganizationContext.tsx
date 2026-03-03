import { createContext, useContext, useState } from 'react';
import type React from 'react';

interface OrganizationContextType {
  organizationId: string;
  setOrganizationId: (id: string) => void;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const STORAGE_KEY = 'ai-foundry-org-id';

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [organizationId, setOrganizationIdState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) ?? 'Miraeasset';
  });

  const setOrganizationId = (id: string) => {
    setOrganizationIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <OrganizationContext.Provider value={{ organizationId, setOrganizationId }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
