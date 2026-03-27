import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { Message, DeliveryMethod } from '../types';
import { localDB } from './db';
import { networkManager } from './network';

export const messagingEngine = {
  async sendMessage(message: Omit<Message, 'id'>, method: DeliveryMethod) {
    const msgId = `${message.senderId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullMessage: Message = { ...message, id: msgId };

    // Always save to local history
    await localDB.saveMessage(fullMessage);

    const canSendNow = networkManager.isOnline();

    if (canSendNow) {
      try {
        await setDoc(doc(db, 'messages', msgId), {
          ...fullMessage,
          timestamp: serverTimestamp(),
          status: 'sent'
        });
        return { ...fullMessage, status: 'sent' as const };
      } catch (error) {
        console.error('Send failed, queuing...', error);
        await localDB.addToQueue(fullMessage);
        return { ...fullMessage, status: 'pending' as const };
      }
    } else {
      // Offline or method requires queuing
      await localDB.addToQueue(fullMessage);
      return { ...fullMessage, status: 'pending' as const };
    }
  },

  async syncQueue() {
    if (!networkManager.isOnline()) return;

    const queue = await localDB.getQueue();
    for (const msg of queue) {
      try {
        await setDoc(doc(db, 'messages', msg.id), {
          ...msg,
          timestamp: serverTimestamp(),
          status: 'sent'
        });
        await localDB.removeFromQueue(msg.id);
        await localDB.saveMessage({ ...msg, status: 'sent' });
      } catch (error) {
        console.error('Failed to sync message', msg.id, error);
      }
    }
  },

  subscribeToMessages(userId: string, callback: (messages: Message[]) => void) {
    // Listen for messages where user is receiver
    const qReceived = query(
      collection(db, 'messages'),
      where('receiverId', '==', userId)
    );

    // Listen for messages where user is sender (to sync across devices)
    const qSent = query(
      collection(db, 'messages'),
      where('senderId', '==', userId)
    );

    const unsubReceived = onSnapshot(qReceived, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Message));
      callback(msgs);
    });

    const unsubSent = onSnapshot(qSent, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Message));
      callback(msgs);
    });

    return () => {
      unsubReceived();
      unsubSent();
    };
  }
};
