export interface BoundingBox {
  left: number;
  upper: number;
  right: number;
  lower: number;
  imageWidth: number;
  imageHeight: number;
}

export interface ScanDetection {
  partNum: string;
  partName: string;
  score: number;
  inMissingList: boolean;
  boundingBox: BoundingBox;
}

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
  setImgUrl: string | null;
  setParts: Part[];
  foundParts: FoundPart[];
  missingParts: Part[];
  createdAt: string;
  lastScannedAt: string | null;
}
