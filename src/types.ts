export type DeliveryMethod = 'internet' | 'bluetooth' | 'quickshare' | 'offline';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  timestamp: any;
  status: MessageStatus;
  deliveryMethod: DeliveryMethod;
  sentTime?: string;
  deliveredTime?: string;
}

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: MessageStatus;
  isOnline: boolean;
}

export type AppView = 'login' | 'chatList' | 'chat' | 'settings' | 'discover' | 'onboarding';
