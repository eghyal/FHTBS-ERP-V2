import React from "react";
import { useAuth } from "@/contexts/AuthContext";

interface HasRoleProps {
  allowedRoles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const HasRole: React.FC<HasRoleProps> = ({
  allowedRoles,
  children,
  fallback = null,
}) => {
  const { user } = useAuth();

  if (!user) return <>{fallback}</>;

  // FC (Full Control) bypasses all role checks
  if (user.role === "FC") return <>{children}</>;

  if (allowedRoles.includes(user.role)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export const useHasRole = (allowedRoles: string[]) => {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === "FC") return true;
  return allowedRoles.includes(user.role);
};
