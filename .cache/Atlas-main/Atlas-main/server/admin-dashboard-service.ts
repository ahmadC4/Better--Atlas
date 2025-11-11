interface OrganizationSummary {
  id: string;
  name: string;
  members: number;
}

interface AgentSummary {
  id: string;
  status: 'active' | 'online' | 'offline' | 'paused';
}

interface TicketSummary {
  id: string;
  status: 'open' | 'pending' | 'closed';
}

const ORGANIZATIONS: OrganizationSummary[] = [
  { id: 'org-1', name: 'Atlas Labs', members: 18 },
  { id: 'org-2', name: 'Globex Research', members: 9 },
  { id: 'org-3', name: 'Initech', members: 6 },
  { id: 'org-4', name: 'Wonka Industries', members: 3 },
];

const AGENTS: AgentSummary[] = [
  { id: 'agent-1', status: 'active' },
  { id: 'agent-2', status: 'online' },
  { id: 'agent-3', status: 'paused' },
  { id: 'agent-4', status: 'active' },
  { id: 'agent-5', status: 'offline' },
];

const TICKETS: TicketSummary[] = [
  { id: 'ticket-1001', status: 'open' },
  { id: 'ticket-1002', status: 'pending' },
  { id: 'ticket-1003', status: 'closed' },
  { id: 'ticket-1004', status: 'open' },
];

const KNOWLEDGE_ITEMS = 128;
const MEMORY_ITEMS = 96;

export const adminDashboardService = {
  async listOrganizations() {
    return {
      organizations: ORGANIZATIONS,
      orgs: ORGANIZATIONS,
    };
  },

  async listAgents() {
    return {
      agents: AGENTS,
    };
  },

  async getKnowledgeSummary() {
    return {
      knowledgeItems: KNOWLEDGE_ITEMS,
      memoryItems: MEMORY_ITEMS,
      knowledgeBase: { totalItems: KNOWLEDGE_ITEMS },
      memory: { totalMemories: MEMORY_ITEMS },
    };
  },

  async listTickets() {
    const open = TICKETS.filter((ticket) => ticket.status === 'open').length;
    const pending = TICKETS.filter((ticket) => ticket.status === 'pending').length;

    return {
      tickets: TICKETS,
      total: TICKETS.length,
      open,
      pending,
    };
  },
};
