import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Settings, 
  Wifi, 
  Bluetooth, 
  Share2, 
  Clock, 
  Send, 
  Plus, 
  ArrowLeft, 
  Check, 
  CheckCheck, 
  Search,
  User,
  LogOut,
  Zap,
  HardDrive,
  RefreshCw,
  MoreVertical,
  Circle,
  AlertCircle
} from 'lucide-react';
import { AppView, Chat, Message, DeliveryMethod, MessageStatus } from './types';
import { auth, db, isFirebaseConfigured } from './firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { localDB } from './services/db';
import { messagingEngine } from './services/messaging';
import { networkManager, useNetworkStatus } from './services/network';
import { bluetoothManager, quickShareManager } from './services/bluetooth';
import { ErrorBoundary } from './components/ErrorBoundary';
import FlowingMenu from './components/FlowingMenu';

// --- Components ---

const StatusIcon = ({ status }: { status: MessageStatus }) => {
  switch (status) {
    case 'pending': return <Clock size={12} className="text-slate-400" />;
    case 'sent': return <Check size={12} className="text-slate-400" />;
    case 'delivered': return <CheckCheck size={12} className="text-slate-400" />;
    case 'read': return <CheckCheck size={12} className="text-accent" />;
    default: return null;
  }
};

const getMessageDate = (msg: Message): Date => {
  if (!msg.timestamp) return new Date();
  if (typeof msg.timestamp === 'object' && 'toDate' in msg.timestamp) {
    return (msg.timestamp as any).toDate();
  }
  const date = new Date(msg.timestamp);
  return isNaN(date.getTime()) ? new Date() : date;
};

const formatDateLabel = (date: Date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffTime = today.getTime() - messageDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const DeliveryIcon = ({ method, size = 14 }: { method: DeliveryMethod, size?: number }) => {
  switch (method) {
    case 'internet': return <Wifi size={size} className="text-accent" />;
    case 'bluetooth': return <Bluetooth size={size} className="text-blue-400" />;
    case 'quickshare': return <Share2 size={size} className="text-purple-400" />;
    case 'offline': return <HardDrive size={size} className="text-amber-400" />;
    default: return null;
  }
};

function ConfigurationError() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-8 text-center">
      <div className="glass p-8 rounded-3xl max-w-md border border-rose-500/20">
        <AlertCircle size={48} className="text-rose-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-4">Configuration Error</h2>
        <p className="text-slate-400 mb-6">
          Firebase configuration is missing or invalid. Please check your environment variables in Vercel.
        </p>
        <div className="text-left bg-black/20 p-4 rounded-xl mb-6 font-mono text-xs text-slate-500">
          <p>Required variables:</p>
          <ul className="list-disc list-inside mt-2">
            <li>VITE_FIREBASE_API_KEY</li>
            <li>VITE_FIREBASE_PROJECT_ID</li>
            <li>VITE_FIREBASE_AUTH_DOMAIN</li>
            <li>VITE_FIREBASE_FIRESTORE_DATABASE_ID</li>
          </ul>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-accent text-primary font-bold rounded-2xl hover:opacity-90 transition-opacity"
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
}

function NetBridgeApp() {
  const [view, setView] = useState<AppView>('login');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [username, setUsername] = useState('');
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('internet');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDeliveryMenu, setShowDeliveryMenu] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [settings, setSettings] = useState({
    bluetooth: true,
    quickshare: true
  });

  const deliveryMethods = [
    { id: 'internet', text: 'Internet', enabled: true },
    { id: 'bluetooth', text: 'Bluetooth', enabled: settings.bluetooth },
    { id: 'quickshare', text: 'Quick Share', enabled: settings.quickshare }
  ].filter(m => m.enabled);

  const networkStatus = useNetworkStatus();

  // Type-safe toggle
  const handleToggle = (id: string) => {
    if (id === 'bluetooth' || id === 'quickshare') {
      setSettings(prev => ({ ...prev, [id as keyof typeof settings]: !prev[id as keyof typeof settings] }));
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Auth and Local DB
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setUser(fbUser);
        const userDocRef = doc(db, 'users', fbUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setUsername(userDoc.data().username);
          setView('chatList');
          // Update online status
          await setDoc(userDocRef, { isOnline: true, lastSeen: new Date().toISOString() }, { merge: true });
        } else {
          // Redirect to onboarding to set username
          setUsername(fbUser.displayName || '');
          setView('onboarding');
        }

        // Handle tab close
        const handleUnload = () => {
          setDoc(userDocRef, { isOnline: false, lastSeen: new Date().toISOString() }, { merge: true });
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
      } else {
        setUser(null);
        setView('login');
      }
    });

    localDB.init();

    return () => unsubscribe();
  }, []);

  // Sync queue when coming online
  useEffect(() => {
    if (networkStatus === 'online') {
      setIsSyncing(true);
      messagingEngine.syncQueue().finally(() => setIsSyncing(false));
    }
  }, [networkStatus]);

  // Load messages from local DB and subscribe to Firebase
  useEffect(() => {
    if (user) {
      localDB.getMessages().then(setMessages);
      
      // Subscribe to messages where user is receiver
      const unsubscribeReceived = messagingEngine.subscribeToMessages(user.uid, (newMsgs) => {
        setMessages(prev => {
          const combined = [...prev];
          newMsgs.forEach(m => {
            if (!combined.find(c => c.id === m.id)) combined.push(m);
          });
          return combined.sort((a, b) => getMessageDate(a).getTime() - getMessageDate(b).getTime());
        });
      });

      // Subscribe to all users for discovery
      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users = snapshot.docs
          .map(doc => doc.data())
          .filter(u => u.uid !== user.uid);
        setAllUsers(users);
      });
      
      return () => {
        unsubscribeReceived();
        unsubUsers();
      };
    }
  }, [user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (view === 'chat') scrollToBottom();
  }, [view, messages]);

  const handleLogin = async () => {
    if (isLoggingIn || !isFirebaseConfigured) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // Ignore user-cancelled errors
      if (
        error.code === 'auth/cancelled-popup-request' || 
        error.code === 'auth/popup-closed-by-user'
      ) {
        return;
      }
      
      console.error('Login failed', error);
      
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError('Authentication Error: This domain is not authorized in your Firebase project. Please add your Vercel domain to the "Authorized domains" list in the Firebase Console.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError('Authentication Error: Google sign-in is not enabled in your Firebase project. Please enable it in the Firebase Console.');
      } else {
        setLoginError(error.message || 'Login failed. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !user || !activeChat) return;

    const receiverId = activeChat.id;
    
    const msgData = {
      text: inputText,
      senderId: user.uid,
      receiverId: receiverId,
      timestamp: new Date().toISOString(),
      status: 'pending' as MessageStatus,
      deliveryMethod: deliveryMethod,
    };

    setInputText('');
    
    const result = await messagingEngine.sendMessage(msgData, deliveryMethod);
    setMessages(prev => {
      if (prev.find(m => m.id === result.id)) return prev;
      const combined = [...prev, result];
      return combined.sort((a, b) => getMessageDate(a).getTime() - getMessageDate(b).getTime());
    });
  };

  const renderView = () => {
    switch (view) {
      case 'login':
        return (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full flex flex-col items-center justify-center p-8 gradient-bg"
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-24 h-24 glass rounded-3xl flex items-center justify-center mb-8 neon-glow"
            >
              <Zap size={48} className="text-accent" fill="currentColor" />
            </motion.div>
            
            <h1 className="text-4xl font-bold mb-2 tracking-tighter">NetBridge</h1>
            <p className="text-slate-400 mb-12 text-center">Seamless communication, anywhere.</p>
            
            <div className="w-full space-y-4 max-w-xs">
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={`w-full py-4 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${
                  isLoggingIn ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-100'
                }`}
              >
                {isLoggingIn ? (
                  <RefreshCw size={20} className="animate-spin" />
                ) : (
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
                )}
                <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google'}</span>
              </button>
              
              {loginError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-rose-500 text-xs justify-center bg-rose-500/10 p-3 rounded-xl border border-rose-500/20"
                >
                  <AlertCircle size={14} />
                  <span>{loginError}</span>
                </motion.div>
              )}
              
              <p className="text-[10px] text-slate-500 text-center px-4">
                By signing in, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </motion.div>
        );

      case 'onboarding':
        return (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center p-8 bg-surface"
          >
            <div className="w-20 h-20 bg-accent/20 rounded-3xl flex items-center justify-center mb-6">
              <User size={40} className="text-accent" />
            </div>
            <h2 className="text-3xl font-black mb-2 tracking-tighter">Welcome!</h2>
            <p className="text-slate-400 mb-8 text-center">How should others see you on NetBridge?</p>
            
            <div className="w-full max-w-xs space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">Choose a Username</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full p-4 glass rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all font-bold"
                />
              </div>
              
              <button 
                onClick={async () => {
                  if (!username.trim() || !user) return;
                  await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    username: username.trim(),
                    avatar: user.photoURL || `https://picsum.photos/seed/${user.uid}/100/100`,
                    lastSeen: new Date().toISOString(),
                    isOnline: true
                  });
                  setView('chatList');
                }}
                disabled={!username.trim()}
                className="w-full py-4 bg-accent text-primary font-bold rounded-2xl shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
              >
                Start Messaging
              </button>
            </div>
          </motion.div>
        );

      case 'chatList':
        return (
          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="h-full flex flex-col bg-surface"
          >
            <header className="p-6 flex items-center justify-between glass border-b-0 rounded-b-3xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                  <Zap size={20} className="text-accent" />
                </div>
                <h2 className="text-xl font-bold">NetBridge</h2>
              </div>
              <div className="flex gap-4">
                <Search size={22} className="text-slate-400" />
                <Settings size={22} className="text-slate-400 cursor-pointer" onClick={() => setView('settings')} />
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex gap-2">
                  <div className="px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-bold border border-accent/20">All Chats</div>
                </div>
                {networkStatus === 'offline' && (
                  <div className="flex items-center gap-1 text-amber-500 text-[10px] font-bold">
                    <AlertCircle size={12} /> OFFLINE MODE
                  </div>
                )}
              </div>

              {(() => {
                // Derive chats from messages and allUsers
                const chatMap = new Map<string, Chat>();
                
                messages.forEach(msg => {
                  const otherId = msg.senderId === user?.uid ? msg.receiverId : msg.senderId;
                  
                  const otherUser = allUsers.find(u => u.uid === otherId);
                  if (otherUser) {
                    // Handle Firestore Timestamp or string
                    const timestamp = msg.timestamp && typeof msg.timestamp === 'object' && 'toDate' in msg.timestamp 
                      ? (msg.timestamp as any).toDate() 
                      : new Date(msg.timestamp || Date.now());

                    chatMap.set(otherId, {
                      id: otherId,
                      name: otherUser.username,
                      avatar: otherUser.avatar,
                      lastMessage: msg.text,
                      lastMessageTime: timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
                      unreadCount: 0,
                      status: msg.status,
                      isOnline: otherUser.isOnline || false
                    });
                  }
                });

                return Array.from(chatMap.values()).map((chat) => (
                  <motion.div 
                    key={chat.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setActiveChat(chat);
                      setView('chat');
                    }}
                    className="glass p-4 rounded-2xl flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <div className="relative">
                      <img src={chat.avatar} alt={chat.name} className="w-14 h-14 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                      {chat.isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-surface rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="font-bold truncate">{chat.name}</h3>
                        <span className="text-[10px] text-slate-500">{chat.lastMessageTime}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-slate-400 truncate pr-4">{chat.lastMessage}</p>
                        <div className="flex items-center gap-1">
                          <StatusIcon status={chat.status} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ));
              })()}
            </div>

            <button 
              onClick={() => setView('discover')}
              className="absolute bottom-24 right-8 w-16 h-16 bg-accent rounded-2xl flex items-center justify-center text-primary neon-glow shadow-2xl hover:scale-110 transition-transform"
            >
              <Plus size={32} />
            </button>
          </motion.div>
        );

      case 'discover':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full flex flex-col bg-surface"
          >
            <header className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('chatList')} className="p-2 hover:bg-white/10 rounded-xl">
                  <ArrowLeft size={24} />
                </button>
                <h2 className="text-2xl font-black tracking-tighter">Discover</h2>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest px-2">Available Users</p>
              {allUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <User size={48} className="mb-4 opacity-20" />
                  <p>No other users found yet.</p>
                </div>
              ) : (
                allUsers.map((u) => (
                  <motion.div 
                    key={u.uid}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setActiveChat({
                        id: u.uid,
                        name: u.username,
                        avatar: u.avatar,
                        lastMessage: 'Start a conversation',
                        lastMessageTime: 'Now',
                        unreadCount: 0,
                        status: 'read',
                        isOnline: true
                      });
                      setView('chat');
                    }}
                    className="glass p-4 rounded-2xl flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <img src={u.avatar} alt={u.username} className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" />
                    <div className="flex-1">
                      <h3 className="font-bold">{u.username}</h3>
                      <p className="text-xs text-slate-400">Tap to message</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                      <Plus size={18} />
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        );

      case 'chat':
        return (
          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="h-full flex flex-col bg-surface"
          >
            <header className="p-4 glass flex items-center gap-4 rounded-b-3xl z-20 relative">
              <button onClick={() => setView('chatList')} className="p-2 hover:bg-white/10 rounded-xl">
                <ArrowLeft size={24} />
              </button>
              <div className="flex-1 flex items-center gap-3">
                <img src={activeChat?.avatar} alt={activeChat?.name} className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                <div>
                  <h3 className="font-bold text-sm">{activeChat?.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <Circle size={8} className={activeChat?.isOnline ? "fill-emerald-500 text-emerald-500" : "fill-slate-500 text-slate-500"} />
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                      {activeChat?.isOnline ? 'Active Now' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="relative">
                <button 
                  onClick={() => setShowDeliveryMenu(!showDeliveryMenu)}
                  className="p-2 hover:bg-white/10 rounded-xl text-slate-400"
                >
                  <MoreVertical size={24} />
                </button>

                <AnimatePresence>
                  {showDeliveryMenu && (
                    <FlowingMenu 
                      items={deliveryMethods.map(m => ({
                        text: m.text,
                        onClick: () => setDeliveryMethod(m.id as DeliveryMethod),
                        active: deliveryMethod === m.id
                      }))}
                      speed={15}
                      textColor="#ffffff"
                      bgColor="#060010"
                      marqueeBgColor="#ffffff"
                      marqueeTextColor="#060010"
                      borderColor="#ffffff"
                      onClose={() => setShowDeliveryMenu(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {(() => {
                const filteredMessages = messages.filter(msg => 
                  (msg.senderId === user?.uid && msg.receiverId === activeChat?.id) || 
                  (msg.senderId === activeChat?.id && msg.receiverId === user?.uid)
                );
                
                let lastDateLabel = "";
                
                return filteredMessages.map((msg) => {
                  const timestamp = getMessageDate(msg);
                  const dateLabel = formatDateLabel(timestamp);
                  const showDateLabel = dateLabel !== lastDateLabel;
                  lastDateLabel = dateLabel;

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateLabel && (
                        <div className="flex justify-center my-8 sticky top-0 z-10 pointer-events-none">
                          <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="glass px-4 py-1.5 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border border-white/5 shadow-xl backdrop-blur-md"
                          >
                            {dateLabel}
                          </motion.div>
                        </div>
                      )}
                      <motion.div 
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className={`flex flex-col ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`max-w-[80%] p-4 rounded-2xl relative ${
                          msg.senderId === user?.uid 
                            ? 'message-bubble-sender rounded-tr-none' 
                            : 'message-bubble-receiver rounded-tl-none'
                        }`}>
                          <p className="text-sm leading-relaxed">{msg.text}</p>
                          <div className="flex items-center justify-end gap-1.5 mt-2">
                            <span className="text-[9px] opacity-60 font-medium">
                              {timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                            {msg.senderId === user?.uid && <StatusIcon status={msg.status} />}
                            <DeliveryIcon method={msg.deliveryMethod} size={10} />
                          </div>
                        </div>
                      </motion.div>
                    </React.Fragment>
                  );
                });
              })()}
              <div ref={messagesEndRef} />
            </div>

            <footer className="p-4 glass rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="flex-1 glass rounded-2xl p-3 flex items-center">
                  <div className="mr-2 text-slate-500">
                    {(() => {
                      const method = [
                        { id: 'internet', icon: Wifi, color: 'text-accent' },
                        { id: 'bluetooth', icon: Bluetooth, color: 'text-blue-400' },
                        { id: 'quickshare', icon: Share2, color: 'text-purple-400' }
                      ].find(m => m.id === deliveryMethod);
                      return method ? <method.icon size={16} className={method.color} /> : null;
                    })()}
                  </div>
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..." 
                    className="bg-transparent border-none outline-none w-full text-sm"
                  />
                </div>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSendMessage}
                  className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-primary neon-glow"
                >
                  <Send size={20} />
                </motion.button>
              </div>
            </footer>
          </motion.div>
        );

      case 'settings':
        return (
          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="h-full flex flex-col bg-surface"
          >
            <header className="p-6 flex items-center gap-4 glass rounded-b-3xl">
              <button onClick={() => setView('chatList')} className="p-2 hover:bg-white/10 rounded-xl">
                <ArrowLeft size={24} />
              </button>
              <h2 className="text-xl font-bold">Settings</h2>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="flex flex-col items-center">
                <div className="relative mb-4">
                  <img src={`https://picsum.photos/seed/${username}/200/200`} alt="Me" className="w-24 h-24 rounded-3xl object-cover border-2 border-accent p-1" referrerPolicy="no-referrer" />
                  <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-accent rounded-xl flex items-center justify-center text-primary shadow-lg">
                    <Plus size={16} />
                  </button>
                </div>
                <h3 className="text-xl font-bold">{username}</h3>
                <p className="text-slate-400 text-sm">@{username.toLowerCase().replace(/\s/g, '_')}</p>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2">Profile</h4>
                <div className="glass p-4 rounded-2xl space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2">Display Name</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="flex-1 bg-slate-800/50 p-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-accent/50 font-bold text-sm"
                      />
                      <button 
                        onClick={async () => {
                          if (!username.trim() || !user) return;
                          await setDoc(doc(db, 'users', user.uid), {
                            username: username.trim()
                          }, { merge: true });
                        }}
                        className="px-4 bg-accent text-primary rounded-xl font-bold text-xs active:scale-95 transition-transform"
                      >
                        Update
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-2">Connectivity</h4>
                <div className="space-y-2">
                  {[
                    { id: 'internet', icon: Wifi, label: 'Internet Delivery', desc: 'Use cellular or Wi-Fi', enabled: networkStatus === 'online', readonly: true },
                    { id: 'bluetooth', icon: Bluetooth, label: 'Bluetooth Mesh', desc: 'Connect with nearby devices', enabled: settings.bluetooth },
                    { id: 'quickshare', icon: Share2, label: 'Quick Share', desc: 'Direct device-to-device transfer', enabled: settings.quickshare }
                  ].map((item, i) => (
                    <div 
                      key={i} 
                      onClick={() => handleToggle(item.id)}
                      className={`glass p-4 rounded-2xl flex items-center justify-between transition-all ${item.readonly ? 'opacity-80 cursor-default' : 'cursor-pointer active:scale-[0.98]'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                          <item.icon size={20} className={item.enabled ? "text-accent" : "text-slate-600"} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{item.label}</p>
                          <p className="text-[10px] text-slate-500">{item.desc}</p>
                        </div>
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${item.enabled ? 'bg-accent' : 'bg-slate-700'}`}>
                        <motion.div 
                          animate={{ x: item.enabled ? 20 : 0 }}
                          className="absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={async () => {
                  if (user) {
                    await setDoc(doc(db, 'users', user.uid), { isOnline: false, lastSeen: new Date().toISOString() }, { merge: true });
                  }
                  auth.signOut();
                }}
                className="w-full p-4 glass rounded-2xl flex items-center justify-center gap-3 text-rose-500 border-rose-500/20 hover:bg-rose-500/10 transition-colors"
              >
                <LogOut size={20} />
                <span className="font-bold">Log Out</span>
              </button>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full max-w-md mx-auto relative overflow-hidden shadow-2xl bg-surface">
      <AnimatePresence mode="wait">
        {renderView()}
      </AnimatePresence>
      
      {view !== 'login' && view !== 'chat' && (
        <nav className="absolute bottom-0 left-0 right-0 glass border-t-0 rounded-t-3xl p-4 flex justify-around items-center z-20">
          <button onClick={() => setView('chatList')} className={`p-3 rounded-2xl transition-all ${view === 'chatList' ? 'bg-accent text-primary neon-glow' : 'text-slate-500'}`}>
            <MessageSquare size={24} />
          </button>
          <button onClick={() => setView('settings')} className={`p-3 rounded-2xl transition-all ${view === 'settings' ? 'bg-accent text-primary neon-glow' : 'text-slate-500'}`}>
            <Settings size={24} />
          </button>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  if (!isFirebaseConfigured) {
    return <ConfigurationError />;
  }

  return (
    <ErrorBoundary>
      <NetBridgeApp />
    </ErrorBoundary>
  );
}
