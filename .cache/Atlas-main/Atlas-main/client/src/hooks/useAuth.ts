// Hook for Replit Auth
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { User } from "@shared/schema";

// User type without password field (as returned by the auth endpoint)
type AuthUser = Omit<User, 'password'>;

export function useAuth() {
  const [hasTimedOut, setHasTimedOut] = useState(false);
  
  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
    queryFn: async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const res = await fetch("/api/auth/user", {
          credentials: "include",
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Return null on 401 (unauthenticated) instead of throwing
        if (res.status === 401) {
          return null;
        }
        
        if (!res.ok) {
          throw new Error(`${res.status}: ${res.statusText}`);
        }
        
        return await res.json();
      } catch (err: any) {
        // Handle abort/timeout errors gracefully
        if (err.name === 'AbortError') {
          setHasTimedOut(true);
          return null;
        }
        // For network errors, return null to show login page
        if (err.message?.includes('Failed to fetch')) {
          return null;
        }
        throw err;
      }
    },
  });

  // Reset timeout flag when loading state changes
  useEffect(() => {
    if (!isLoading && hasTimedOut) {
      setHasTimedOut(false);
    }
  }, [isLoading, hasTimedOut]);

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;

  return {
    user,
    isLoading: isLoading && !hasTimedOut,
    isAuthenticated: !!user,
    isAdmin,
    isSuperAdmin,
    error: error || (hasTimedOut ? new Error('Request timed out') : null),
  };
}