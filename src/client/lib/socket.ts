import { io, Socket } from 'socket.io-client';

const TOKEN_KEY = 'reverse_escape_player_token';
const NAME_KEY = 'reverse_escape_player_name';
const ROOM_KEY = 'reverse_escape_active_room';

export function getPlayerToken(): string {
  try {
    let token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = `plr_${crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('')}`;
      sessionStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    return `plr_${crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('')}`;
  }
}

export function getSavedPlayerName(): string {
  try {
    return sessionStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    sessionStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

export function getSavedRoomCode(): string {
  try {
    return sessionStorage.getItem(ROOM_KEY) || '';
  } catch {
    return '';
  }
}

export function saveRoomCode(code: string): void {
  try {
    if (code) {
      sessionStorage.setItem(ROOM_KEY, code);
    } else {
      sessionStorage.removeItem(ROOM_KEY);
    }
  } catch {
    // ignore
  }
}

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
    });
  }
  return socketInstance;
}
