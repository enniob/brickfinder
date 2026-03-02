import axios from 'axios';
import { Session, ScanDetection } from '../types';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

export async function lookupSet(
  setNum: string
): Promise<{ setNum: string; setName: string; setImgUrl: string | null }> {
  const { data } = await client.get<{ setNum: string; setName: string; setImgUrl: string | null }>(
    `/api/sets/${encodeURIComponent(setNum)}`
  );
  return data;
}

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
): Promise<{ detection: ScanDetection | null }> {
  const formData = new FormData();
  formData.append('image', file);
  const { data } = await client.post<{ detection: ScanDetection | null }>(
    `/api/sessions/${sessionId}/scan`,
    formData
  );
  return data;
}

export async function markPartFound(
  sessionId: string,
  partNum: string
): Promise<{ session: Session; newlyFound: number }> {
  const { data } = await client.post<{ session: Session; newlyFound: number }>(
    `/api/sessions/${sessionId}/mark-found`,
    { partNum }
  );
  return data;
}

export async function unmarkPartFound(sessionId: string, partNum: string): Promise<Session> {
  const { data } = await client.delete<Session>(
    `/api/sessions/${sessionId}/found/${encodeURIComponent(partNum)}`
  );
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  await client.delete(`/api/sessions/${id}`);
}
