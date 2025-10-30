import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { X, Send } from 'lucide-react';

const SurvivorChatDialog = ({ survivor, messages, onSendMessage, onClose, position }) => {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!survivor) return null;

  // Filter messages for this survivor
  const survivorMessages = messages.filter(m =>
    m.survivorId === survivor.id || (m.sender === 'operator' && m.survivorId === survivor.id)
  );

  return (
    <Card
      className="absolute w-[350px] max-h-[500px] flex flex-col z-[1100] shadow-xl"
      style={{
        left: position?.x || '50%',
        top: position?.y || '50%',
        transform: 'translate(-50%, -100%)',
        marginTop: '-20px'
      }}
    >
      {/* Chat header */}
      <CardHeader className="bg-primary text-primary-foreground rounded-t-lg p-3">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-semibold text-base flex items-center gap-1">
              🆘 Survivor #{survivor.id.toString().slice(-4)}
            </div>
            <div className="text-xs opacity-90">
              Found by {survivor.foundByUAV}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 overflow-y-auto bg-gray-50 p-4 min-h-[200px] max-h-[300px]">
        {survivorMessages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm">
            No messages yet. Start the conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {survivorMessages.map(message => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.sender === 'operator' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-xl ${
                    message.sender === 'operator'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white text-foreground'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {formatTime(message.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      {/* Input */}
      <div className="p-3 border-t bg-white rounded-b-lg">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Type a message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            autoFocus
          />
          <Button
            onClick={handleSend}
            disabled={!inputMessage.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Arrow pointing to survivor */}
      <div
        className="absolute w-0 h-0"
        style={{
          bottom: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid white',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
        }}
      />
    </Card>
  );
};

export default SurvivorChatDialog;