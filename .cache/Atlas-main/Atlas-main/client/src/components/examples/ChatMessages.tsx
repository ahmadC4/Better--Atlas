import { ChatMessages } from '../ChatMessages';
import {
  initialVoicePlaybackState,
  type VoicePlaybackController,
} from '@/hooks/useVoicePlaybackController';

//todo: remove mock functionality
const mockMessages = [
  {
    id: '1',
    role: 'user' as const,
    content: 'Hello! Can you explain how React hooks work?',
    createdAt: '2024-01-15T14:30:00Z',
  },
  {
    id: '2',
    role: 'assistant' as const,
    content: 'React hooks are functions that let you use state and lifecycle features in functional components. The most common hooks are useState for managing component state and useEffect for handling side effects like API calls or subscriptions.\n\nHere\'s a simple example of useState:\n\n```jsx\nconst [count, setCount] = useState(0);\n```\n\nThis creates a state variable called "count" with an initial value of 0, and "setCount" is the function to update it.',
    createdAt: '2024-01-15T14:30:15Z',
  },
  {
    id: '3',
    role: 'user' as const,
    content: 'That\'s helpful! Can you show me an example with useEffect?',
    createdAt: '2024-01-15T14:31:00Z',
  },
];

const mockVoiceController: VoicePlaybackController = {
  status: 'idle',
  play: async () => {},
  pause: async () => {},
  stop: async () => {},
  progressMs: 0,
  totalDurationMs: 0,
  currentClipId: null,
  hasAudio: false,
};

export default function ChatMessagesExample() {
  return (
    <div className="h-[500px] w-full">
      <ChatMessages
        messages={mockMessages}
        isLoading={false}
        onCopyMessage={(content) => console.log('Copied:', content)}
        onRegenerateResponse={(id) => console.log('Regenerate:', id)}
        voicePlaybackState={{ ...initialVoicePlaybackState }}
        voicePlaybackController={mockVoiceController}
      />
    </div>
  );
}