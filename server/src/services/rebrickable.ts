import axios from 'axios';
import { Part } from '../types';

const BASE_URL = 'https://rebrickable.com/api/v3/lego';

function getHeaders() {
  return { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` };
}

interface RebrickablePartEntry {
  part: {
    part_num: string;
    name: string;
    part_img_url: string | null;
  };
  color: {
    id: number;
    name: string;
  };
  quantity: number;
  is_spare: boolean;
}

interface RebrickableSetResponse {
  name: string;
}

export async function getSetName(setNum: string): Promise<string> {
  const { data } = await axios.get<RebrickableSetResponse>(
    `${BASE_URL}/sets/${setNum}/`,
    { headers: getHeaders() }
  );
  return data.name;
}

export async function getSetParts(setNum: string): Promise<Part[]> {
  const parts: Part[] = [];
  let url: string | null = `${BASE_URL}/sets/${setNum}/parts/?page_size=500`;

  while (url) {
    const response = await axios.get<{ next: string | null; results: RebrickablePartEntry[] }>(
      url,
      { headers: getHeaders() }
    );
    const data: { next: string | null; results: RebrickablePartEntry[] } = response.data;

    for (const entry of data.results) {
      if (entry.is_spare) continue;
      parts.push({
        partNum: entry.part.part_num,
        name: entry.part.name,
        color: entry.color.name,
        colorId: entry.color.id,
        quantity: entry.quantity,
        imageUrl: entry.part.part_img_url,
      });
    }

    url = data.next;
  }

  return parts;
}
