import { ThemeProvider } from '../ThemeProvider';
import { Chat } from '../Chat';

export default function ChatExample() {
  return (
    <ThemeProvider defaultTheme="dark">
      <div className="h-screen w-full">
        <Chat />
      </div>
    </ThemeProvider>
  );
}