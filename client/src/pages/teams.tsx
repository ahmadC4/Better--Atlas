import { useState } from 'react';
import { useLastAreaPreference } from '@/hooks/useLastAreaPreference';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  Users,
  Plus,
  Settings,
  MoreVertical,
  Mail,
  Trash2,
  Crown,
  ShieldCheck,
  User,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

interface Team {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _memberCount?: number;
}

interface TeamMember {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface TeamInvitation {
  id: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
}

interface TeamLimits {
  maxTeams: number | null;
  maxMembers: number | null;
  currentTeamCount: number;
}

const roleIcons = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
};

const roleLabels = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function TeamsPage() {
  useLastAreaPreference('user');
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
  });

  const { data: limits } = useQuery<TeamLimits>({
    queryKey: ['/api/teams/limits'],
  });

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ['/api/teams', selectedTeam?.id, 'members'],
    enabled: !!selectedTeam,
  });

  const { data: teamInvitations = [] } = useQuery<TeamInvitation[]>({
    queryKey: ['/api/teams', selectedTeam?.id, 'invitations'],
    enabled: !!selectedTeam,
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      return await apiRequest('POST', '/api/teams', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      setCreateDialogOpen(false);
      setNewTeamName('');
      setNewTeamDescription('');
      toast({
        title: 'Team created',
        description: 'Your new team has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create team',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      return await apiRequest('DELETE', `/api/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
      setDeleteDialogOpen(false);
      setSelectedTeam(null);
      toast({
        title: 'Team deleted',
        description: 'The team has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete team',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async (data: { teamId: string; email: string; role: 'admin' | 'member' }) => {
      return await apiRequest('POST', `/api/teams/${data.teamId}/invite`, {
        email: data.email,
        role: data.role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', selectedTeam?.id, 'invitations'] });
      setInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('member');
      toast({
        title: 'Invitation sent',
        description: 'An invitation email has been sent to the user.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send invitation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (data: { teamId: string; memberId: string }) => {
      return await apiRequest('DELETE', `/api/teams/${data.teamId}/members/${data.memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', selectedTeam?.id, 'members'] });
      toast({
        title: 'Member removed',
        description: 'The team member has been removed successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to remove member',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const canCreateTeam = !limits || limits.maxTeams === null || limits.currentTeamCount < limits.maxTeams;

  if (teamsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedTeam) {
    const RoleIcon = roleIcons[teamMembers.find(m => m.userId === selectedTeam.id)?.role || 'member'];
    
    return (
      <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedTeam(null)}
              data-testid="button-back-to-teams"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">{selectedTeam.name}</h1>
              {selectedTeam.description && (
                <p className="text-muted-foreground mt-1">{selectedTeam.description}</p>
              )}
            </div>
            <Button
              onClick={() => setInviteDialogOpen(true)}
              className="gap-2"
              data-testid="button-invite-member"
            >
              <Mail className="h-4 w-4" />
              Invite member
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Members ({teamMembers.length})
                </CardTitle>
                <CardDescription>
                  {limits?.maxMembers 
                    ? `${teamMembers.length} of ${limits.maxMembers} members`
                    : 'No member limit'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {teamMembers.map((member) => {
                  const MemberIcon = roleIcons[member.role];
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                      data-testid={`member-${member.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <MemberIcon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {member.user?.firstName || member.user?.lastName
                              ? `${member.user.firstName || ''} ${member.user.lastName || ''}`.trim()
                              : member.user?.email}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.user?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={member.role === 'owner' ? 'default' : 'outline'}>
                          {roleLabels[member.role]}
                        </Badge>
                        {member.role !== 'owner' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMemberMutation.mutate({ teamId: selectedTeam.id, memberId: member.id })}
                            data-testid={`button-remove-member-${member.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Pending invitations ({teamInvitations.filter(i => i.status === 'pending').length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {teamInvitations.filter(i => i.status === 'pending').length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending invitations</p>
                ) : (
                  teamInvitations
                    .filter(i => i.status === 'pending')
                    .map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                        data-testid={`invitation-${invitation.id}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{invitation.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Invited {new Date(invitation.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline">{roleLabels[invitation.role]}</Badge>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogContent data-testid="dialog-invite-member">
            <DialogHeader>
              <DialogTitle>Invite team member</DialogTitle>
              <DialogDescription>
                Send an invitation email to add a new member to {selectedTeam.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email address</label>
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <div className="flex gap-2">
                  <Button
                    variant={inviteRole === 'member' ? 'default' : 'outline'}
                    onClick={() => setInviteRole('member')}
                    className="flex-1"
                    data-testid="button-role-member"
                  >
                    Member
                  </Button>
                  <Button
                    variant={inviteRole === 'admin' ? 'default' : 'outline'}
                    onClick={() => setInviteRole('admin')}
                    className="flex-1"
                    data-testid="button-role-admin"
                  >
                    Admin
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Admins can invite and remove members. Members have view-only access.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setInviteDialogOpen(false)}
                data-testid="button-cancel-invite"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!inviteEmail) return;
                  inviteMemberMutation.mutate({
                    teamId: selectedTeam.id,
                    email: inviteEmail,
                    role: inviteRole,
                  });
                }}
                disabled={!inviteEmail || inviteMemberMutation.isPending}
                data-testid="button-send-invite"
              >
                {inviteMemberMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Send invitation'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Teams</h1>
              <p className="text-muted-foreground mt-2">
                Manage your teams and collaborate with your organization.
              </p>
              {limits && (
                <p className="text-sm text-muted-foreground mt-1">
                  {teams.length} {limits.maxTeams !== null ? `of ${limits.maxTeams}` : ''} teams created
                </p>
              )}
            </div>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              disabled={!canCreateTeam}
              className="gap-2 whitespace-nowrap sm:w-auto"
              data-testid="button-create-team"
            >
              <Plus className="h-4 w-4" />
              Create team
            </Button>
          </div>
          {!canCreateTeam && limits && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                You've reached your team limit ({limits.maxTeams} teams). Contact your administrator to increase your limit.
              </p>
            </div>
          )}
        </div>

        {teams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first team to start collaborating.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-team">
                <Plus className="h-4 w-4 mr-2" />
                Create team
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <Card
                key={team.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setSelectedTeam(team)}
                data-testid={`card-team-${team.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{team.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" data-testid={`button-team-menu-${team.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTeam(team);
                        }}>
                          <Settings className="h-4 w-4 mr-2" />
                          Manage
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeam(team);
                            setDeleteDialogOpen(true);
                          }}
                          data-testid={`button-delete-team-${team.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {team.description && (
                    <CardDescription className="mt-2">{team.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{team._memberCount || 0} members</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-team">
          <DialogHeader>
            <DialogTitle>Create new team</DialogTitle>
            <DialogDescription>
              Create a team to collaborate with your organization members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Team name</label>
              <Input
                placeholder="Engineering Team"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                data-testid="input-team-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="Team for engineering projects"
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                data-testid="input-team-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createTeamMutation.mutate({ name: newTeamName, description: newTeamDescription })}
              disabled={!newTeamName || createTeamMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createTeamMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Create team'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-team">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedTeam?.name}"? This action cannot be undone and
              all team members will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTeam && deleteTeamMutation.mutate(selectedTeam.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
