import axios from 'axios';
import { Session } from '../types';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

export async function listSessions(): Promise<Session[]> {
  const { data } = await client.get<Session[]>('/api/sessions');
  return data;
}

export async function createSession(setNum: string): Promise<Session> {
  const { data } = await client.post<Session>('/api/sessions', { setNum });
  return data;
}

export async function getSession(id: string): Promise<Session> {
  const { data } = await client.get<Session>(`/api/sessions/${id}`);
  return data;
}

export async function scanImage(
  sessionId: string,
  file: File
): Promise<{ session: Session; newlyFound: number }> {
  const formData = new FormData();
  formData.append('image', file);

  const { data } = await client.post<{ session: Session; newlyFound: number }>(
    `/api/sessions/${sessionId}/scan`,
    formData
  );
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  await client.delete(`/api/sessions/${id}`);
}
