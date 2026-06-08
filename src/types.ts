export interface Announcement {
  id: string;
  title: string;
  audioUrl: string;
  category: 'success' | 'warning' | 'danger';
  description: string;
  duration?: number; // estimated duration in seconds
}

export type QueueItem = {
  id: string; // unique instance ID for the queue
  announcement: Announcement;
  customText?: string; // used if TTS
  status: 'pending' | 'playing' | 'completed';
};

export interface SyncMessage {
  type: 'PLAY' | 'STOP' | 'PLAY_TTS' | 'UPDATE_VOLUME' | 'SYNC_STATUS';
  payload?: any;
}
