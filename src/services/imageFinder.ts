interface ImageResult {
  url: string;
  alt: string;
  source: string;
}

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || "";

export async function findImages(
  query: string,
  count: number = 3
): Promise<ImageResult[]> {
  try {
    if (UNSPLASH_ACCESS_KEY) {
      return await searchUnsplash(query, count);
    }
    // Fallback to placeholder images
    return getPlaceholderImages(query, count);
  } catch (error) {
    console.error("[IMAGE FINDER] Error:", error);
    return getPlaceholderImages(query, count);
  }
}

async function searchUnsplash(query: string, count: number): Promise<ImageResult[]> {
  const response = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
    {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Unsplash API error");
  }

  const data: any = await response.json();
  const results = data.results || [];

  return results.slice(0, count).map((photo: any) => ({
    url: photo.urls?.regular || photo.urls?.small || "",
    alt: photo.alt_description || query,
    source: "unsplash",
  }));
}

function getPlaceholderImages(query: string, count: number): ImageResult[] {
  // Use picsum.photos as a fallback - these are real stock photos
  const images: ImageResult[] = [];
  const seed = query.replace(/\s+/g, "-").toLowerCase();

  for (let i = 0; i < count; i++) {
    images.push({
      url: `https://picsum.photos/seed/${seed}-${i}/1200/630`,
      alt: `${query} - Image ${i + 1}`,
      source: "picsum",
    });
  }

  return images;
}

export function extractKeywords(title: string, category: string): string {
  // Extract meaningful keywords from title for image search
  const stopWords = [
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "or", "if", "while", "that", "this", "these", "those",
    "what", "which", "who", "whom", "it", "its", "i", "me", "my", "we",
    "our", "you", "your", "he", "him", "his", "she", "her", "they", "them",
    "their",
  ];

  const words = title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.includes(word))
    .slice(0, 3)
    .join(" ");

  return words || category.toLowerCase();
}
