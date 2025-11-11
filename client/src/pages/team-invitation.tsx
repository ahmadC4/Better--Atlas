import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface InvitationDetails {
  teamName: string;
  teamDescription: string | null;
  inviterEmail: string;
  role: 'admin' | 'member';
}

export default function TeamInvitationPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'accepted' | 'error'>('loading');
  
  // Get token from URL
  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    // Validate invitation token
    const validateInvitation = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/teams/invitations/${token}/validate`, {
          credentials: 'include',
        });

        if (!response.ok) {
          setStatus('invalid');
          return;
        }

        const data = await response.json();
        setInvitation(data);
        setStatus('valid');
      } catch (error) {
        setStatus('error');
      } finally {
        setLoading(false);
      }
    };

    validateInvitation();
  }, [token]);

  const handleAcceptInvitation = async () => {
    if (!token) return;

    setAccepting(true);
    try {
      await apiRequest('POST', `/api/teams/invitations/${token}/accept`);
      setStatus('accepted');
      toast({
        title: 'Invitation accepted',
        description: 'You have successfully joined the team.',
      });
      
      // Redirect to teams page after 2 seconds
      setTimeout(() => {
        navigate('/teams');
      }, 2000);
    } catch (error) {
      toast({
        title: 'Failed to accept invitation',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
      setStatus('error');
    } finally {
      setAccepting(false);
    }
  };

  if (!token || status === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-full bg-destructive/10 p-3">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
            <CardDescription>
              This invitation link is invalid or has expired. Please ask the team owner to send you a new invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/')}
              className="w-full"
              data-testid="button-back-home"
            >
              Go to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-full bg-destructive/10 p-3">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Error</CardTitle>
            </div>
            <CardDescription>
              An error occurred while processing your invitation. Please try again later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/')}
              className="w-full"
              data-testid="button-back-home-error"
            >
              Go to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-full bg-green-500/10 p-3">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>Invitation Accepted!</CardTitle>
            </div>
            <CardDescription>
              You have successfully joined the team. Redirecting to teams page...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-full bg-primary/10 p-3">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Team Invitation</CardTitle>
          </div>
          <CardDescription>
            You've been invited to join a team on Atlas AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {invitation && (
            <>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Team name</p>
                  <p className="text-lg font-semibold">{invitation.teamName}</p>
                </div>
                
                {invitation.teamDescription && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Description</p>
                    <p className="text-sm">{invitation.teamDescription}</p>
                  </div>
                )}
                
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Invited by</p>
                  <p className="text-sm">{invitation.inviterEmail}</p>
                </div>
                
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Your role</p>
                  <p className="text-sm capitalize">{invitation.role}</p>
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  By accepting this invitation, you'll be able to collaborate with your team members and access shared resources.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="flex-1"
                  data-testid="button-decline-invite"
                >
                  Decline
                </Button>
                <Button
                  onClick={handleAcceptInvitation}
                  disabled={accepting}
                  className="flex-1 gap-2"
                  data-testid="button-accept-invite"
                >
                  {accepting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    'Accept invitation'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
