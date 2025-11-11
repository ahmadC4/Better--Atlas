import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { N8nAgent } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface DeleteAgentContext {
  previousAgents?: N8nAgent[];
}

export function useDeleteN8nAgent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<string, unknown, string, DeleteAgentContext>({
    mutationFn: async (agentId: string) => {
      await apiRequest('DELETE', `/api/integrations/n8n/agents/${agentId}`);
      return agentId;
    },
    onMutate: async (agentId: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/integrations/n8n/agents'] });
      const previousAgents = queryClient.getQueryData<N8nAgent[]>(['/api/integrations/n8n/agents']);

      queryClient.setQueryData<N8nAgent[]>(['/api/integrations/n8n/agents'], (current) => {
        if (!current) {
          return current;
        }

        return current.filter((agent) => agent.id !== agentId);
      });

      return { previousAgents };
    },
    onSuccess: async (_agentId) => {
      toast({
        title: 'Agent removed',
        description: 'The n8n webhook is no longer connected to this agent.',
      });
      await queryClient.invalidateQueries({ queryKey: ['/api/integrations/n8n/agents'] });
    },
    onError: (error: any, _agentId, context) => {
      if (context?.previousAgents) {
        queryClient.setQueryData(['/api/integrations/n8n/agents'], context.previousAgents);
      }

      toast({
        title: 'Failed to remove agent',
        description: error?.message ?? 'We could not delete the agent record.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/integrations/n8n/agents'] });
    },
  });
}
