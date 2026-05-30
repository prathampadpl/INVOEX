import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/lib/firebase';
import { toast } from 'sonner';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string}[]>([
    { role: 'model', text: 'Hi there! I am your INVOEX Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMessage = { role: 'user' as const, text: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const assistantChat = httpsCallable(functions, 'assistantChat');
      
      // Map to Gemini history format
      const history = updatedMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const res = await assistantChat({ messages: history }) as any;
      
      if (res.data?.text) {
        setMessages(prev => [...prev, { role: 'model', text: res.data.text }]);
      } else {
        throw new Error('No response from assistant');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to get a response from the assistant.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen ? (
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg w-80 md:w-96 flex flex-col mb-4 overflow-hidden" style={{ height: '500px', maxHeight: '80vh' }}>
          <div className="bg-blue-600 text-white p-3 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <span className="font-semibold">INVOEX Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200 focus:outline-none">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'}`}>
                  {msg.text.split('\n').map((line, j) => (
                    <p key={j} className="mb-1 last:mb-0">{line}</p>
                  ))}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 text-gray-500 rounded-lg rounded-bl-none p-3 shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask me anything..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isLoading}
            />
            <Button size="icon" onClick={handleSend} disabled={!input.trim() || isLoading} className="h-9 w-9 bg-blue-600 hover:bg-blue-700 text-white shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white p-3.5 rounded-full shadow-lg hover:bg-blue-700 hover:scale-105 transition-all focus:outline-none flex items-center justify-center group relative"
        >
          <MessageSquare className="w-6 h-6" />
          <span className="absolute -top-10 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            INVOEX Assistant
          </span>
        </button>
      )}
    </div>
  );
}
