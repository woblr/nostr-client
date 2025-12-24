import React, { useState, useEffect, useRef, useCallback, FC } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { sendDirectMessage, 
  decryptDirectMessage, 
  getContactPubkeyFromEvent, 
  sortDirectMessages, 
  markConversationAsRead,
  canSendDirectMessages,
  Conversation as ConversationType,
  DirectMessage as DirectMessageType,
} from '@/lib/nostr/directMessages';
import { subscribeToEvents } from '@/lib/nostr/relay';
import { AnyNostrEvent } from '@/types/nostr';
import { KeyManager } from '@/lib/nostr/KeyManager';
import { useUserStore } from '@/store/useUserStore';
import { 
  Avatar, Button, Divider, TextField, Typography, Paper, List, ListItem, ListItemButton,
  ListItemAvatar, ListItemText, Box, CircularProgress, IconButton, Badge, Alert 
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { SimplePool, type Filter, Event as NostrEvent } from 'nostr-tools';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import Link from 'next/link';
import RefreshIcon from '@mui/icons-material/Refresh';

// Relay list for direct messages
const DM_RELAYS = [
  'wss://relay.damus.io',               // Damus default
  'wss://relay.primal.net',             // Primal default
  'wss://relay.snort.social',           // Snort
  'wss://nostr-pub.wellorder.net',      // Wellorder
  'wss://relay.nostr.band',             // Band
  'wss://nos.lol',                      // nos.lol
  'wss://purplepag.es',                 // Full archive
  'wss://relay.nostr.info',             // High reliability relay
  'wss://nostr.zebedee.cloud',          // Zebedee
  'wss://nostr.bitcoiner.social',       // Bitcoiner Social
];

// Type definitions for clarity
type Conversation = {
  pubkey: string;
  displayName?: string;
  profilePicture?: string;
  npub?: string;
  lastMessage?: {
    id: string;
    content: string;
    created_at: number;
    // For compatibility with imported type
    timestamp?: number;
    sent?: boolean;
  };
  unread: number;
};
type DirectMessage = DirectMessageType;


// Component Prop Types
interface ConversationsListProps {
  conversations: Conversation[];
  onSelectConversation: (pubkey: string) => void;
  activeConversation?: string;
}

interface MessageListProps {
  messages: DirectMessage[];
  userPubkey: string;
  isLoading: boolean;
}

interface MessageInputProps {
  newMessage: string;
  setNewMessage: (message: string) => void;
  handleSendMessage: () => void;
  canSend: boolean;
}

// Component to display the list of conversations
const ConversationsList: FC<ConversationsListProps> = ({ conversations, onSelectConversation, activeConversation }) => {
  return (
    <List sx={{ width: '100%', bgcolor: 'background.paper', pt: 0 }}>
      {conversations.length === 0 ? (
        <ListItem>
          <ListItemText primary="No conversations yet." />
        </ListItem>
      ) : (
        conversations.map((convo) => (
          <React.Fragment key={convo.pubkey}>
            <ListItemButton
              selected={convo.pubkey === activeConversation}
              onClick={() => onSelectConversation(convo.pubkey)}
            >
              <ListItemAvatar>
                <Avatar>{convo.displayName?.charAt(0) || convo.pubkey.substring(0, 2)}</Avatar>
              </ListItemAvatar>
              <ListItemText 
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography component="span" noWrap>
                      {convo.displayName || convo.npub?.substring(0, 9) || convo.pubkey.substring(0, 9)}
                    </Typography>
                    {convo.unread > 0 && (
                      <Badge badgeContent={convo.unread} color="primary" />
                    )}
                  </Box>
                }
                secondary={
                  (convo.lastMessage?.content ?? '').substring(0, 40) + 
                  ((convo.lastMessage?.content?.length ?? 0) > 40 ? '...' : '') || 
                  'No messages yet'
                }
              />
            </ListItemButton>
            <Divider component="li" />
          </React.Fragment>
        ))
      )}
    </List>
  );
};

// Component to display the list of messages in a conversation
const MessageList: FC<MessageListProps> = ({ messages, userPubkey, isLoading }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}>
      {messages.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2" color="text.secondary">
            No messages yet. Send a message to start the conversation.
          </Typography>
        </Box>
      ) : (
        messages.map((msg) => (
          <Box 
            key={msg.id} 
            sx={{ display: 'flex', justifyContent: msg.sender === userPubkey ? 'flex-end' : 'flex-start', mb: 1 }}
          >
            <Paper 
              elevation={1} 
              sx={{ p: 1.5, maxWidth: '80%', borderRadius: 2, bgcolor: msg.sender === userPubkey ? 'primary.light' : 'background.default' }}
            >
              <Typography variant="body1">{msg.content}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right', mt: 0.5 }}>
                {new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Paper>
          </Box>
        ))
      )}
      <div ref={messagesEndRef} />
    </Box>
  );
};

// Component for the message input field
const MessageInput: FC<MessageInputProps> = ({ newMessage, setNewMessage, handleSendMessage, canSend }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSend) handleSendMessage();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && canSend && newMessage.trim()) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Paper 
      component="form" 
      onSubmit={handleSubmit} 
      elevation={2}
      sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center' }}
    >
      <TextField
        fullWidth
        value={newMessage}
        onChange={(e) => setNewMessage(e.target.value)}
        onKeyDown={handleKeyPress}
        placeholder="Type a message..."
        disabled={!canSend}
        multiline
        maxRows={4}
        sx={{ mr: 1 }}
        variant="outlined"
        size="small"
      />
      <IconButton 
        color="primary" 
        disabled={!canSend || !newMessage.trim()} 
        type="submit" 
        size="large"
      >
        <SendIcon />
      </IconButton>
    </Paper>
  );
};

// Main DirectMessages Component
const DirectMessages: FC = () => {
  const router = useRouter();
  const params = useParams();
  const contactPubkey = params?.pubkey as string | undefined;

  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState<string>('');
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [relaySendWarnings, setRelaySendWarnings] = useState<string | null>(null);

  // ----- Persist / hydrate state from localStorage -----
  useEffect(() => {
    try {
      const storedConvos = localStorage.getItem('dm_conversations');
      if (storedConvos) {
        setConversations(JSON.parse(storedConvos));
      }
    } catch (e) {
      console.warn('Failed to read conversations from storage', e);
    }
  }, []);

  // Persist conversations anytime they change
  useEffect(() => {
    try {
      localStorage.setItem('dm_conversations', JSON.stringify(conversations));
    } catch (e) {
      console.warn('Failed to persist conversations', e);
    }
  }, [conversations]);

  // Load / persist messages per conversation
  useEffect(() => {
    if (!contactPubkey) return;
    
    try {
      console.log('🔄 Loading messages for conversation with:', contactPubkey);
      const raw = localStorage.getItem('dm_messages');
      
      if (raw) {
        const byConvo: Record<string, DirectMessage[]> = JSON.parse(raw);
        console.log('📂 Available conversations in storage:', Object.keys(byConvo));
        
        // Try to find the right conversation - normalize pubkeys to ensure consistent format
        const normalizedPubkey = contactPubkey.toLowerCase();
        
        // Try direct match first
        if (byConvo[contactPubkey]) {
          console.log(`📥 Found ${byConvo[contactPubkey].length} messages for exact pubkey match`);
          setMessages(sortDirectMessages(byConvo[contactPubkey])); // Ensure messages are sorted
        } 
        // Try normalized match
        else if (byConvo[normalizedPubkey] && normalizedPubkey !== contactPubkey) {
          console.log(`📥 Found ${byConvo[normalizedPubkey].length} messages for normalized pubkey`);
          setMessages(sortDirectMessages(byConvo[normalizedPubkey]));
        }
        // Look for any partial matches (just in case of formatting issues)
        else {
          const matchingKey = Object.keys(byConvo).find(key => 
            key.includes(normalizedPubkey) || normalizedPubkey.includes(key)
          );
          
          if (matchingKey) {
            console.log(`📥 Found ${byConvo[matchingKey].length} messages for partial pubkey match`);
            setMessages(sortDirectMessages(byConvo[matchingKey]));
          } else {
            console.log('❌ No messages found for this conversation');
            setMessages([]);
          }
        }
      } else {
        console.log('❌ No messages found in storage');
        setMessages([]);
      }
    } catch (e) {
      console.warn('Failed to read messages from storage', e);
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactPubkey]);

  useEffect(() => {
    if (!contactPubkey) return;
    try {
      const raw = localStorage.getItem('dm_messages');
      const byConvo: Record<string, DirectMessage[]> = raw ? JSON.parse(raw) : {};
      byConvo[contactPubkey] = messages;
      localStorage.setItem('dm_messages', JSON.stringify(byConvo));
    } catch (e) {
      console.warn('Failed to persist messages', e);
    }
  }, [messages, contactPubkey]);

  // Create stable SimplePool instance to avoid reconnects
  const poolRef = useRef<SimplePool>();
  if (!poolRef.current) {
    poolRef.current = new SimplePool();
  }
  const subscriptionRef = useRef<any>(null);

  // Select pieces of state separately to ensure stable references and prevent unnecessary re-renders
  const accounts = useUserStore(state => state.accounts);
  const activeAccountId = useUserStore(state => state.activeAccountId);
  const isUnlocked = useUserStore(state => !state.isLocked);
  
  // Memoise derived activeAccount so its reference stays stable unless the dependencies really change
  const activeAccount = React.useMemo(() =>
    accounts.find(account => account.id === activeAccountId),
  [accounts, activeAccountId]);

  // Stable boolean used in multiple places
  const canSendMessages = Boolean(activeAccount && isUnlocked);

  // Track processed event IDs to prevent duplicate event handling
  const processedEventsRef = useRef<Set<string>>(new Set());
  
  // Helper: Merge and deduplicate messages by id
  const mergeMessages = (a: DirectMessage[], b: DirectMessage[]) => {
    const map = new Map<string, DirectMessage>();
    [...a, ...b].forEach(msg => map.set(msg.id, msg));
    return sortDirectMessages(Array.from(map.values())) as DirectMessage[];
  };

  // Helper: Fetch events from relays using subscribe/EOSE
  async function fetchEventsFromRelays(relays: string[], filter: Filter): Promise<AnyNostrEvent[]> {
    return new Promise((resolve, reject) => {
      const pool = poolRef.current!;
      const events: AnyNostrEvent[] = [];
      let eoseCount = 0;
      const sub = pool.subscribe(relays, filter, {
        onevent: (event: AnyNostrEvent) => {
          events.push(event);
        },
        oneose: () => {
          eoseCount++;
          // Wait for EOSE from all relays
          if (eoseCount >= relays.length) {
            sub.close();
            resolve(events);
          }
        },
        onerror: (err: any) => {
          sub.close();
          reject(err);
        }
      } as any);
      // Timeout in case relays are slow
      setTimeout(() => {
        sub.close();
        resolve(events);
      }, 5000);
    });
  }

  // Fetch DMs from relays for the current conversation
  const fetchDMsFromRelays = useCallback(async () => {
    if (!activeAccount || !contactPubkey) return;
    setRefreshing(true);
    setRelayError(null);
    try {
      const myPubkey = activeAccount.pubkey;
      // Use a single filter with $or to match both incoming and outgoing DMs
      const filter: Filter = {
        kinds: [4],
        $or: [
          { '#p': [myPubkey], authors: [contactPubkey] },
          { '#p': [contactPubkey], authors: [myPubkey] }
        ],
        limit: 200
      } as any;
      const events: AnyNostrEvent[] = await fetchEventsFromRelays(DM_RELAYS, filter);
      // Decrypt and map to DirectMessage
      const decrypted: DirectMessage[] = [];
      for (const event of events) {
        let content = '[Encrypted message]';
        let read = false;
        try {
          if (KeyManager.isLocked()) {
            setRelayError('Your keys are locked. Unlock to read DMs.');
            break;
          }
          content = await decryptDirectMessage(event, myPubkey);
          read = params?.pubkey === contactPubkey;
        } catch (e) {
          // Keep as encrypted
        }
        decrypted.push({
          id: event.id,
          content,
          created_at: event.created_at,
          sender: event.pubkey,
          receiver: event.pubkey === myPubkey ? contactPubkey : myPubkey,
          read,
        });
      }
      // Merge with localStorage
      let localMsgs: DirectMessage[] = [];
      try {
        const raw = localStorage.getItem('dm_messages');
        if (raw) {
          const byConvo: Record<string, DirectMessage[]> = JSON.parse(raw);
          localMsgs = byConvo[contactPubkey] || [];
        }
      } catch {}
      const merged = mergeMessages(decrypted, localMsgs);
      setMessages(merged);
      // Save to localStorage
      try {
        const raw = localStorage.getItem('dm_messages');
        const byConvo: Record<string, DirectMessage[]> = raw ? JSON.parse(raw) : {};
        byConvo[contactPubkey] = merged;
        localStorage.setItem('dm_messages', JSON.stringify(byConvo));
      } catch {}
    } catch (e) {
      setRelayError('Failed to fetch DMs from relays.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [activeAccount, contactPubkey, params?.pubkey]);

  // On page load or conversation change, fetch from relays
  useEffect(() => {
    if (!contactPubkey || !activeAccount) return;
    setLoading(true);
    fetchDMsFromRelays();
  }, [contactPubkey, activeAccount, fetchDMsFromRelays]);

  useEffect(() => {
    if (contactPubkey && activeAccount) {
      markConversationAsRead(contactPubkey);
      setConversations(prev =>
        prev.map(conv =>
          conv.pubkey === contactPubkey ? { ...conv, unread: 0 } : conv
        )
      );
    }
  }, [contactPubkey, activeAccount?.id]);

  const handleSendMessage = async () => {
    if (!canSendMessages || !contactPubkey || !newMessage.trim() || !activeAccount) return;
    setError(null);
    setSending(true);
    setRelaySendWarnings(null);
    try {
      // Send the message
      const event = await sendDirectMessage(newMessage, contactPubkey);
      // Show relay warnings if any
      if (event.relayResults) {
        const failed = Object.entries(event.relayResults).filter(([_, v]) => v !== 'ok');
        if (failed.length > 0) {
          setRelaySendWarnings(
            `Some relays rejected your DM: ` +
            failed.map(([relay, reason]) => `${relay}: ${reason}`).join('; ')
          );
        }
      }
      // Apply immediate optimistic update
      const message: DirectMessage = {
        id: event.id,
        content: newMessage,
        created_at: event.created_at,
        sender: activeAccount.pubkey,
        receiver: contactPubkey,
        read: true,
      };
      setMessages(prev => {
        if (prev.some(m => m.id === event.id)) return prev; 
        return sortDirectMessages([...prev, message]) as DirectMessage[];
      });
      setConversations(prev => {
        const lastMessage = {
          id: event.id,
          content: newMessage,
          created_at: event.created_at,
          sent: true
        };
        const existingIndex = prev.findIndex(c => c.pubkey === contactPubkey);
        let newConversations;
        if (existingIndex >= 0) {
          newConversations = [...prev];
          const existing = newConversations[existingIndex];
          newConversations[existingIndex] = {
            ...existing,
            lastMessage,
            unread: 0
          };
        } else {
          newConversations = [...prev, {
            pubkey: contactPubkey,
            lastMessage,
            unread: 0
          }];
        }
        return newConversations.sort((a, b) => {
          const aTime = a.lastMessage?.created_at || 0;
          const bTime = b.lastMessage?.created_at || 0;
          return bTime - aTime;
        });
      });
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      setError(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSending(false);
    }
  };

  const handleSelectConversation = (pubkey: string) => {
    router.push(`/dm/${pubkey}`);
  };

  const handleBackToList = () => {
    router.push('/dm');
  };

  // Manual refresh button handler
  const handleRefresh = () => {
    fetchDMsFromRelays();
  };

  // Banner for locked or missing keys
  const showKeyBanner = !canSendMessages || (activeAccount && !KeyManager.hasPrivateKey(activeAccount.pubkey));

  if (!activeAccount) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Please select or create an account to use direct messages.</Alert>
      </Box>
    );
  }

  if (!canSendMessages) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error" icon={<LockOpenIcon fontSize="inherit" />} sx={{ justifyContent: 'center', mb: 2 }}>
            Your keys are locked. You need to unlock them to send and receive encrypted direct messages.
        </Alert>
        <Link href={`/keys?returnUrl=${encodeURIComponent(contactPubkey ? `/dm/${contactPubkey}` : '/dm')}`} passHref>
          <Button variant="contained" color="primary" startIcon={<LockOpenIcon />}>
            Go to Key Management
          </Button>
        </Link>
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', bgcolor: 'grey.50' }}>
      {showKeyBanner && (
        <Alert severity="warning" sx={{ m: 2 }}>
          Your keys are locked or missing. You will not be able to read or send encrypted DMs until you unlock or import your private key.
        </Alert>
      )}
      {contactPubkey ? (
        <>
          <Paper elevation={1} sx={{ p: 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <IconButton onClick={handleBackToList}>
              <ArrowBackIcon />
            </IconButton>
            <Avatar sx={{ width: 32, height: 32, ml: 1, mr: 2 }}>
              {conversations.find(c => c.pubkey === contactPubkey)?.displayName?.charAt(0) || contactPubkey.slice(0, 2)}
            </Avatar>
            <Typography variant="h6" noWrap>
              {conversations.find(c => c.pubkey === contactPubkey)?.displayName || `${contactPubkey.slice(0, 8)}...`}
            </Typography>
            <IconButton onClick={handleRefresh} sx={{ ml: 2 }} disabled={refreshing} title="Refresh messages">
              <RefreshIcon />
            </IconButton>
            {refreshing && <CircularProgress size={20} sx={{ ml: 1 }} />}
          </Paper>
          {relaySendWarnings && (
            <Alert severity="warning" sx={{ mx: 2, mt: 1 }} onClose={() => setRelaySendWarnings(null)}>
              {relaySendWarnings}
            </Alert>
          )}
          {relayError && (
            <Alert severity="error" sx={{ mx: 2, mt: 1 }}>
              {relayError}
            </Alert>
          )}
          <MessageList
            messages={messages}
            userPubkey={activeAccount.pubkey}
            isLoading={loading}
          />
          {error && (
            <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          <MessageInput
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            handleSendMessage={handleSendMessage}
            canSend={canSendMessages && !sending}
          />
        </>
      ) : (
        <>
          <Paper elevation={1} sx={{ p: 2, flexShrink: 0 }}>
            <Typography variant="h5">Conversations</Typography>
          </Paper>
          <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
            {loading && conversations.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <ConversationsList
                conversations={conversations}
                onSelectConversation={handleSelectConversation}
                />
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

export default DirectMessages;