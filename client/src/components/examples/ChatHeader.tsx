import { ChatHeader } from '../ChatHeader';

export default function ChatHeaderExample() {
  return (
    <div className="w-full">
      <ChatHeader
        onToggleSidebar={() => console.log('Sidebar toggled')}
        selectedModel="gpt-4"
        onModelChange={(model) => console.log('Model changed to:', model)}
        availableModels={[]}
        onHomeClick={() => console.log('Home clicked')}
      />
    </div>
  );
}