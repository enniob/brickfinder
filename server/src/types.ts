export interface Part {
  partNum: string;
  name: string;
  color: string;
  colorId: number;
  quantity: number;
  imageUrl: string | null;
}

export interface FoundPart extends Part {
  foundQuantity: number;
}

export interface Session {
  id: string;
  setNum: string;
  setName: string;
  setParts: Part[];
  foundParts: FoundPart[];
  missingParts: Part[];
  createdAt: Date;
  lastScannedAt: Date | null;
}
