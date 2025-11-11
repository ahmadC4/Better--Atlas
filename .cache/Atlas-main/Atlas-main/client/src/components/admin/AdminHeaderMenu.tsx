import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { MoreVertical, LogOut, Home, HelpCircle, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { apiRequest, queryClient } from '@/lib/queryClient';

const KEY_SEQUENCE_TIMEOUT = 1000;

const isTextInput = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  );
};

export function AdminHeaderMenu() {
  const [, setLocation] = useLocation();
  const sequenceRef = useRef<string[]>([]);
  const timeoutRef = useRef<number>();

  const resetSequence = useCallback(() => {
    sequenceRef.current = [];
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      setLocation(path);
    },
    [setLocation],
  );

  const handleSignOut = useCallback(async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTextInput(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (sequenceRef.current.length === 0) {
        if (key === 'g') {
          sequenceRef.current = ['g'];
          timeoutRef.current = window.setTimeout(resetSequence, KEY_SEQUENCE_TIMEOUT);
        }
        return;
      }

      if (sequenceRef.current[0] === 'g') {
        if (key === 'g') {
          sequenceRef.current = ['g'];
          if (timeoutRef.current !== undefined) {
            window.clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = window.setTimeout(resetSequence, KEY_SEQUENCE_TIMEOUT);
          return;
        }

        if (key === 'u') {
          event.preventDefault();
          resetSequence();
          handleNavigate('/app');
          return;
        }

        if (key === 'a') {
          event.preventDefault();
          resetSequence();
          handleNavigate('/admin');
          return;
        }
      }

      resetSequence();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      resetSequence();
    };
  }, [handleNavigate, resetSequence]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          data-testid="button-admin-header-menu"
        >
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open admin menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" sideOffset={8}>
        <DropdownMenuItem
          onClick={() => handleNavigate('/app')}
          data-testid="menu-item-user-app"
        >
          <Home className="mr-2 h-4 w-4" />
          Go to User App
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleNavigate('/admin')}
          data-testid="menu-item-admin-home"
        >
          <LayoutDashboard className="mr-2 h-4 w-4" />
          Admin Home
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleNavigate('/help')}
          data-testid="menu-item-help"
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          Docs/Help
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          data-testid="menu-item-sign-out"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
