export interface BoundingBox {
  left: number;
  upper: number;
  right: number;
  lower: number;
  imageWidth: number;
  imageHeight: number;
}

export interface Detection {
  partNum: string;
  score: number;
  boundingBox: BoundingBox;
}

export async function identifyParts(
  imageBuffer: Buffer,
  mimeType: string
): Promise<Detection | null> {
  const formData = new FormData();
  formData.append(
    'query_image',
    new Blob([imageBuffer], { type: mimeType }),
    'image.jpg'
  );

  console.log('[brickognize] sending image to Brickognize API...');

  let response: Response;
  try {
    response = await fetch('https://api.brickognize.com/predict/parts/', {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    console.error('[brickognize] network error:', err);
    return null;
  }

  if (!response.ok) {
    console.error('[brickognize] API error:', response.status, await response.text());
    return null;
  }

  const data = (await response.json()) as {
    listing_id?: string;
    bounding_box?: {
      left: number;
      upper: number;
      right: number;
      lower: number;
      image_width: number;
      image_height: number;
    };
    items?: Array<{ id: string; name: string; score: number }>;
  };

  if (!data.items || data.items.length === 0) {
    console.log('[brickognize] no items returned');
    return null;
  }

  const top = data.items[0];
  const bb = data.bounding_box;

  const boundingBox: BoundingBox = bb
    ? {
        left: bb.left,
        upper: bb.upper,
        right: bb.right,
        lower: bb.lower,
        imageWidth: bb.image_width,
        imageHeight: bb.image_height,
      }
    : { left: 0, upper: 0, right: 0, lower: 0, imageWidth: 0, imageHeight: 0 };

  console.log(`[brickognize] top result: ${top.id} "${top.name}" score=${top.score}`);

  return {
    partNum: top.id,
    score: top.score,
    boundingBox,
  };
}
