import { ChatInput } from '../ChatInput';

export default function ChatInputExample() {
  return (
    <div className="w-full">
      <ChatInput
        onSendMessage={(message) => console.log('Message sent:', message)}
        isLoading={false}
        placeholder="Ask me anything..."
      />
    </div>
  );
}