import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { AlertCircle, MapPin, MessageCircle } from 'lucide-react';

const ChatInterface = ({ survivors, onSelectSurvivor, selectedSurvivor }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="bg-white flex flex-col flex-1 min-h-0 border-0 rounded-none shadow-none">
      <CardHeader className="pb-3 border-b">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            Survivor Contacts
          </CardTitle>
          <div className="text-xs text-muted-foreground mt-1">
            {!survivors || survivors.length === 0
              ? 'No survivors found yet'
              : `${survivors.length} survivor${survivors.length > 1 ? 's' : ''} found`
            }
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4">
        {!survivors || survivors.length === 0 ? (
          <div className="text-center text-muted-foreground mt-8 space-y-1">
            <p className="text-sm">When a UAV finds survivors,</p>
            <p className="text-sm">their contacts will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {survivors.map(survivor => (
              <div
                key={survivor.id}
                onClick={() => onSelectSurvivor(survivor)}
                className={`
                  p-3 rounded-lg cursor-pointer transition-all
                  ${selectedSurvivor?.id === survivor.id
                    ? 'bg-blue-50 border-2 border-blue-500'
                    : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">🆘</span>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">
                      Survivor #{survivor.id.toString().slice(-4)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Found by {survivor.foundByUAV}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTime(survivor.foundTime)}
                    </div>
                  </div>
                  {survivor.messages && survivor.messages.length > 0 && (
                    <Badge variant="destructive" className="px-2 py-0.5">
                      <MessageCircle className="h-3 w-3 mr-1" />
                      {survivor.messages.length}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  ({survivor.position.lat.toFixed(4)}, {survivor.position.lng.toFixed(4)})
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ChatInterface;