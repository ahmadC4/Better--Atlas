import { ChatSidebar } from '../ChatSidebar';

//todo: remove mock functionality
const mockChats = [
  {
    id: '1',
    title: 'Getting started with React',
    updatedAt: '2024-01-15T14:30:00Z',
  },
  {
    id: '2', 
    title: 'Understanding TypeScript interfaces',
    updatedAt: '2024-01-15T10:15:00Z',
  },
  {
    id: '3',
    title: 'CSS Grid vs Flexbox',
    updatedAt: '2024-01-14T16:45:00Z',
  },
];

export default function ChatSidebarExample() {
  return (
    <div className="h-[600px] w-[280px]">
      <ChatSidebar
        isOpen={true}
        onNewChat={() => console.log('New chat clicked')}
        chats={mockChats}
        activeChat="1"
        onChatSelect={(id) => console.log('Chat selected:', id)}
      />
    </div>
  );
}